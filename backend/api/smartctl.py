import subprocess
import re
import asyncio
import logging
import os
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks
from .models import SmartRequest, StopRequest
from .history import append_smartctl_history
from .system import get_local_time

# Create logs directory if it doesn't exist
log_dir = "/app/data/smartctl/logs/python"
os.makedirs(log_dir, exist_ok=True)

# Create a logger
log_file = os.path.join(log_dir, f"{datetime.now().strftime('%Y-%m-%d')}_smartctl.log")
logging.basicConfig(filename=log_file, level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

router = APIRouter()




@router.get("/api/smart-status")
def smart_status():
    try:
        cmd = ["docker", "ps", "--format", "{{.Names}}", "--filter", "name=disk_hunter_smartctl_"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        containers = result.stdout.strip().split('\n')
        
        running_tests = []
        for c in containers:
            if not c:
                continue

            log_cmd = ["docker", "logs", c]
            log_res = subprocess.run(log_cmd, capture_output=True, text=True)
            logs = log_res.stdout.strip() or log_res.stderr.strip()

            progress = "Initializing..."
            # Find the last progress line in the logs
            progress_lines = re.findall(r"Test in progress on .*?: (\d+% complete.*?)(?=\n|$)", logs)
            if progress_lines:
                progress = progress_lines[-1]
            else:
                if "Test on" in logs and "completed successfully" in logs:
                    progress = "Completed"
                elif "Test on" in logs and "completed with" in logs:
                    progress = "Failed"
                elif "Monitoring finished" in logs:
                    progress = "Finished"


            last_log_line = ""
            if logs:
                last_log_line = logs.split('\n')[-1]
                last_log_line = re.sub(r'\x1b\[[0-9;]*m', '', last_log_line)

            name_part = c.replace("disk_hunter_smartctl_", "")
            drive_only = name_part.split("--")[0]
            
            test_type = "Unknown"
            if "--short" in c:
                test_type = "Short"
            elif "--long" in c:
                test_type = "Extended"

            running_tests.append({
                "drive": drive_only, 
                "container": c, 
                "test_type": test_type,
                "progress": progress,
                "log": last_log_line
            })
        return {"status": "success", "running_tests": running_tests}
    except Exception as e:
        logging.error(f"Error getting S.M.A.R.T. status: {e}")
        return {"status": "error", "message": str(e), "running_tests": []}


@router.post("/api/smart/stop")
def stop_smart_test(request: StopRequest):
    try:
        logging.info(f"Stopping S.M.A.R.T. test container: {request.container_name}")
        # Abort the test inside the container first
        # Extract drive from container name
        drive_name = request.container_name.replace("disk_hunter_smartctl_", "").split("--")[0]
        drive_path = f"/dev/{drive_name}"
        abort_cmd = ["docker", "exec", request.container_name, "smartctl", "-X", drive_path]
        subprocess.run(abort_cmd, capture_output=True)
        
        # Then stop and remove the container
        subprocess.run(["docker", "stop", request.container_name], check=True, capture_output=True)
        subprocess.run(["docker", "rm", "-f", request.container_name], check=True, capture_output=True)
        logging.info(f"S.M.A.R.T. test container stopped and removed: {request.container_name}")
        return {"status": "success", "message": f"Stop command sent to {request.container_name}"}
    except Exception as e:
        logging.error(f"Error stopping S.M.A.R.T. test container {request.container_name}: {e}")
        return {"status": "error", "message": str(e)}


async def monitor_smart_test(container_name: str, drive: str, serial: str, test_type: str, start_time: str):
    proc = await asyncio.create_subprocess_exec("docker", "wait", container_name, stdout=asyncio.subprocess.PIPE)
    await proc.communicate()
    
    end_time = get_local_time()
    
    log_dir = "/app/data/smartctl/logs/container_logs"
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, f"{container_name}.log")
    
    # Get container logs
    with open(log_file, "a") as f:
        log_cmd = ["docker", "logs", container_name]
        subprocess.run(log_cmd, stdout=f, stderr=subprocess.STDOUT)

    status_text = "completed"
    with open(log_file, "r") as f:
        logs = f.read()
        if "completed with" in logs or "failed" in logs:
            status_text = "failed"
        elif "aborted" in logs:
            status_text = "aborted"

    logging.info(f"S.M.A.R.T. test {status_text} for {drive} (container: {container_name})")

    append_smartctl_history({
        "timestamp": end_time,
        "event": f"SMART test ({test_type}) {status_text} on {drive}",
        "serial": serial,
        "test_type": test_type,
        "status": status_text,
        "container_name": container_name
    })
    subprocess.run(["docker", "rm", "-f", container_name], check=False, capture_output=True)



@router.get("/api/smart/logs/{container_name}")
def get_smart_logs(container_name: str):
    # Basic security check on container name
    if not re.match(r"^disk_hunter_smartctl_[a-zA-Z0-9_.-]+--[a-zA-Z]+--[a-zA-Z0-9_.-]+$", container_name):
        return {"status": "error", "message": "Invalid container name format."}

    log_dir = "/app/data/smartctl/logs/container_logs"
    log_file_path = os.path.join(log_dir, f"{container_name}.log")

    try:
        # First try to get logs from the log file (for completed tests)
        if os.path.exists(log_file_path):
            with open(log_file_path, "r") as f:
                logs = f.read()
            return {"status": "success", "logs": logs}

        # If the file doesn't exist, the container might still be running
        cmd = ["docker", "logs", container_name]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if result.returncode == 0:
            return {"status": "success", "logs": result.stdout.strip() or result.stderr.strip()}
        else:
            return {"status": "error", "message": f"Could not retrieve logs for {container_name}. The container may not exist, or it may have been cleaned up after the test."}

    except Exception as e:
        logging.error(f"Error fetching logs for container {container_name}: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/api/smart/start")
def start_smart_test(request: SmartRequest, background_tasks: BackgroundTasks):
    try:
        test_type = request.test_type
        start_time = get_local_time()

        for drive in request.drives:
            drive_name = drive.split('/')[-1]

            # Check if a test is already running for this drive
            cmd = ["docker", "ps", "-q", "--format", "{{.Names}}", "--filter", f"name=disk_hunter_smartctl_{drive_name}--"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.stdout.strip():
                logging.info(f"S.M.A.R.T. test already running for {drive}, skipping.")
                continue

            serial = "UNKNOWN"
            try:
                s_cmd = ["lsblk", "-n", "-o", "SERIAL", drive]
                s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                if s_res.stdout.strip():
                    serial = re.sub(r'[^a-zA-Z0-9_.-]', '_', s_res.stdout.strip())
            except Exception:
                pass
            
            container_name = f"disk_hunter_smartctl_{drive_name}--{test_type}--{serial}"

            # Remove any existing stopped container with the same name.
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True, check=False)

            logging.info(f"Starting S.M.A.R.T. test for {drive} (container: {container_name})")
            cmd = [
                "docker", "run", "-d",
                "--name", container_name,
                "--privileged",
                "--device", f"{drive}:{drive}",
                "disk-hunter-smartctl-test",
                drive, test_type
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                logging.error(f"Docker Error starting S.M.A.R.T. test for {drive}: {res.stderr.strip()}")
                return {"status": "error", "message": f"Docker Error: {res.stderr.strip()}"}

            append_smartctl_history({
                "timestamp": start_time,
                "event": f"Started SMART test ({test_type}) on {drive}",
                "serial": serial,
                "test_type": test_type,
                "status": "started"
            })
            background_tasks.add_task(monitor_smart_test, container_name, drive, serial, test_type, start_time)

        return {"status": "success", "message": f"Started {test_type} test on selected drives."}
    except Exception as e:
        logging.error(f"Error starting S.M.A.R.T. test: {e}")
        return {"status": "error", "message": f"System error: {str(e)}"}
