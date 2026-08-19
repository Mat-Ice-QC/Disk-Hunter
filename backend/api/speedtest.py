import subprocess
import re
import asyncio
import logging
import os
import json
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Request
from .models import SpeedtestRequest, StopRequest
from .history import append_speedtest_history
from .system import get_local_time
from .docker_manager import get_running_containers, get_container_logs, stop_and_remove_container, wait_for_container, save_container_logs, run_container

# Create logs directory if it doesn't exist
log_dir = "/app/data/speedtest/logs/python"
os.makedirs(log_dir, exist_ok=True)

# Create a logger
log_file = os.path.join(log_dir, f"{datetime.now().strftime('%Y-%m-%d')}_speedtest.log")
logging.basicConfig(filename=log_file, level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

router = APIRouter()

@router.get("/api/speedtest-status")
def speedtest_status():
    try:
        containers = get_running_containers("disk_hunter_speedtest_")
        
        running_tests = []
        for c in containers:
            logs = get_container_logs(c)

            progress = "Initializing..."
            # For fio, we might parse progress from logs if output-format=json is used, but we just show "Running" until complete.
            if "=== TEST COMPLETE ===" in logs:
                progress = "Completed"
            elif logs:
                progress = "Running"

            last_log_line = ""
            if logs:
                lines = [line for line in re.split(r'[\r\n]+', logs) if line.strip()]
                last_log_line = lines[-1] if lines else ""
                last_log_line = re.sub(r'\x1b\[[0-9;]*m', '', last_log_line)

            name_part = c.replace("disk_hunter_speedtest_", "")
            drive_only = name_part.split("--")[0]
            
            test_type = "Unknown"
            if "--read" in c:
                test_type = "Read"
            elif "--write" in c:
                test_type = "Write"
            elif "--rw" in c:
                test_type = "Read/Write"

            running_tests.append({
                "drive": drive_only, 
                "container": c, 
                "test_type": test_type,
                "progress": progress,
                "log": last_log_line
            })
        return {"status": "success", "running_tests": running_tests}
    except Exception as e:
        logging.error(f"Error getting speedtest status: {e}")
        return {"status": "error", "message": str(e), "running_tests": []}

@router.post("/api/speedtest/stop")
def stop_speedtest(request: StopRequest):
    try:
        logging.info(f"Stopping speed test container: {request.container_name}")
        stop_and_remove_container(request.container_name)
        logging.info(f"Speed test container stopped and removed: {request.container_name}")
        return {"status": "success", "message": f"Stop command sent to {request.container_name}"}
    except Exception as e:
        logging.error(f"Error stopping speed test container {request.container_name}: {e}")
        return {"status": "error", "message": str(e)}

async def run_speedtest_sequence(drive: str, serial: str, test_type: str, sizes: list[str], timezone: str, start_time: str, ip: str):
    drive_name = drive.split('/')[-1]
    
    for size in sizes:
        container_name = f"disk_hunter_speedtest_{drive_name}--{test_type}--{size}--{serial}"
        
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True, check=False)
        
        logging.info(f"Starting Speed Test for {drive} (container: {container_name})")
        success = run_container(
            name=container_name,
            image="disk-hunter-speedtest",
            args=[drive, test_type, size],
            privileged=True,
            devices=[f"{drive}:{drive}"]
        )
        if not success:
            logging.error(f"Docker Error starting Speed Test for {drive}")
            break
            
        append_speedtest_history({
            "timestamp": start_time,
            "event": f"Started Speed test ({test_type} {size}) on {drive}",
            "username": ip,
            "serial": serial,
            "test_type": f"{test_type} ({size})",
            "status": "started",
            "container_name": container_name
        })
        
        await wait_for_container(container_name)

        end_time = get_local_time(timezone)    
        log_dir = "/app/data/speedtest/logs/container_logs"
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f"{container_name}.log")
        
        save_container_logs(container_name, log_file)

        status_text = "completed"
        read_speed = "N/A"
        write_speed = "N/A"
        
        with open(log_file, "r") as f:
            logs = f.read()
            if "Error:" in logs or "failed" in logs:
                status_text = "failed"
            
            read_match = re.search(r"Read Speed:\s*(.*)", logs)
            if read_match:
                read_speed = read_match.group(1).strip()
                
            write_match = re.search(r"Write Speed:\s*(.*)", logs)
            if write_match:
                write_speed = write_match.group(1).strip()

        logging.info(f"Speed test {status_text} for {drive} (container: {container_name})")

        append_speedtest_history({
            "timestamp": end_time,
            "event": f"Speed test ({test_type} ({size})) {status_text} on {drive}",
            "username": ip,
            "serial": serial,
            "test_type": f"{test_type} ({size})",
            "status": status_text,
            "read_speed": read_speed,
            "write_speed": write_speed,
            "container_name": container_name
        })
        stop_and_remove_container(container_name)
        
        if status_text == "failed":
            logging.info(f"Aborting speed test sequence for {drive} due to failure/stop.")
            break
            
        start_time = get_local_time(timezone)

@router.get("/api/speedtest/logs/{container_name}")
def get_speedtest_logs(container_name: str):
    # Strict validation of container name format to prevent path traversal or flag injection
    if not re.match(r"^disk_hunter_speedtest_[a-zA-Z0-9_.-]+$", container_name):
        return {"status": "error", "message": "Invalid container name format."}

    log_dir = "/app/data/speedtest/logs/container_logs"
    log_file_path = os.path.join(log_dir, f"{container_name}.log")

    try:
        if os.path.exists(log_file_path):
            with open(log_file_path, "r") as f:
                logs = f.read()
            return {"status": "success", "logs": logs}

        logs = get_container_logs(container_name)
        if logs:
            return {"status": "success", "logs": logs}
        else:
            return {"status": "error", "message": f"Could not retrieve logs for {container_name}."}

    except Exception as e:
        logging.error(f"Error fetching logs for container {container_name}: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/api/speedtest/start")
def start_speedtest(request: SpeedtestRequest, background_tasks: BackgroundTasks, http_request: Request):
    """Starts sequential read/write speed benchmarking tests on selected drives.
    
    Args:
        request (SpeedtestRequest): The target drives, size, and test type (read/write).
        background_tasks (BackgroundTasks): FastAPI background task manager.
        http_request (Request): The incoming HTTP request.
        
    Returns:
        dict: A status dictionary containing success/error state and debug logs.
    """
    debug_logs = []
    try:
        ip = http_request.client.host if http_request.client else "Unknown"
        debug_logs.append(f"Received SpeedtestRequest payload from {ip}: {request.dict()}")
        test_type = request.test_type
        start_time = get_local_time(request.timezone)

        for drive in request.drives:
            drive_sizes = ["1G", "10G", "100G"] if request.size == "all" else [request.size]
            debug_logs.append(f"Processing target partition: {drive}")

            if request.size == "all":
                try:
                    s_cmd = ["lsblk", "-n", "-b", "-o", "SIZE", drive]
                    debug_logs.append(f"Running command: {' '.join(s_cmd)}")
                    s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                    if s_res.returncode == 0 and s_res.stdout.strip().isdigit():
                        size_bytes = int(s_res.stdout.strip())
                        GB = 1024 * 1024 * 1024
                        valid_sizes = ["1G"]
                        if size_bytes >= 11 * GB:
                            valid_sizes.append("10G")
                        if size_bytes >= 101 * GB:
                            valid_sizes.append("100G")
                        drive_sizes = valid_sizes
                        debug_logs.append(f"Calculated valid sizes for speed test: {drive_sizes}")
                    else:
                        debug_logs.append(f"lsblk query returned code {s_res.returncode}. stdout: '{s_res.stdout.strip()}', stderr: '{s_res.stderr.strip()}'")
                except Exception as e:
                    debug_logs.append(f"Exception running size discovery: {str(e)}")
                    logging.warning(f"Could not determine size for {drive}: {e}")

            drive_name = drive.split('/')[-1]

            cmd = ["docker", "ps", "-q", "--format", "{{.Names}}", "--filter", f"name=disk_hunter_speedtest_{drive_name}--"]
            debug_logs.append(f"Checking for running test container: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.stdout.strip():
                debug_logs.append(f"Speed test already running for {drive} inside container {result.stdout.strip()}, skipping.")
                logging.info(f"Speed test already running for {drive}, skipping.")
                continue

            serial = "UNKNOWN"
            try:
                # To get serial of a partition like /dev/sda1, we need to query its parent disk /dev/sda
                parent_drive = re.sub(r'\d+$', '', drive)
                s_cmd = ["lsblk", "-n", "-o", "SERIAL", parent_drive]
                debug_logs.append(f"Querying parent disk {parent_drive} serial: {' '.join(s_cmd)}")
                s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                if s_res.returncode == 0 and s_res.stdout.strip():
                    serial = re.sub(r'[^a-zA-Z0-9_.-]', '_', s_res.stdout.strip())
                    debug_logs.append(f"Found parent disk serial: {serial}")
                else:
                    debug_logs.append(f"Parent lsblk query returned code {s_res.returncode}. stdout: '{s_res.stdout.strip()}', stderr: '{s_res.stderr.strip()}'")
            except Exception as e:
                debug_logs.append(f"Exception running parent disk lsblk command: {str(e)}")
            
            # Log container command plan
            for size in drive_sizes:
                container_name = f"disk_hunter_speedtest_{drive_name}--{test_type}--{size}--{serial}"
                debug_logs.append(f"Plan: Spawn speedtest container '{container_name}' with image 'disk-hunter-speedtest'")
                debug_logs.append(f"Planned run args: drive={drive}, test_type={test_type}, size={size}")

            background_tasks.add_task(run_speedtest_sequence, drive, serial, test_type, drive_sizes, request.timezone, start_time, ip)

        return {"status": "success", "message": f"Started {test_type} test on selected drives.", "debug": debug_logs}
    except Exception as e:
        debug_logs.append(f"Exception raised in start_speedtest endpoint: {str(e)}")
        logging.error(f"Error starting Speed test: {e}")
        return {"status": "error", "message": f"System error: {str(e)}", "debug": debug_logs}
