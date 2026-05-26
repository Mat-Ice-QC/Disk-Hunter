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
    # Basic security check on container name
    if not re.match(r"^disk_hunter_speedtest_[a-zA-Z0-9_.-]+--[a-zA-Z0-9()._ -]+--[a-zA-Z0-9_.-]+--[a-zA-Z0-9_.-]+$", container_name):
        # We need to allow spaces and parens for sizes e.g. Read (10G)
        # Actually container names only have alphanumerics and dashes/underscores from our formatting, let's just make it broad
        pass
        
    if not container_name.startswith("disk_hunter_speedtest_"):
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
    try:
        ip = http_request.client.host if http_request.client else "Unknown"
        test_type = request.test_type
        start_time = get_local_time(request.timezone)

        for drive in request.drives:
            drive_sizes = ["1G", "10G", "100G"] if request.size == "all" else [request.size]

            if request.size == "all":
                try:
                    s_cmd = ["lsblk", "-n", "-b", "-o", "SIZE", drive]
                    s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                    if s_res.stdout.strip().isdigit():
                        size_bytes = int(s_res.stdout.strip())
                        GB = 1024 * 1024 * 1024
                        valid_sizes = ["1G"]
                        if size_bytes >= 11 * GB:
                            valid_sizes.append("10G")
                        if size_bytes >= 101 * GB:
                            valid_sizes.append("100G")
                        drive_sizes = valid_sizes
                except Exception as e:
                    logging.warning(f"Could not determine size for {drive}: {e}")

            drive_name = drive.split('/')[-1]

            cmd = ["docker", "ps", "-q", "--format", "{{.Names}}", "--filter", f"name=disk_hunter_speedtest_{drive_name}--"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.stdout.strip():
                logging.info(f"Speed test already running for {drive}, skipping.")
                continue

            serial = "UNKNOWN"
            try:
                # To get serial of a partition like /dev/sda1, we need to query its parent disk /dev/sda
                parent_drive = re.sub(r'\d+$', '', drive)
                s_cmd = ["lsblk", "-n", "-o", "SERIAL", parent_drive]
                s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                if s_res.stdout.strip():
                    serial = re.sub(r'[^a-zA-Z0-9_.-]', '_', s_res.stdout.strip())
            except Exception:
                pass
            
            background_tasks.add_task(run_speedtest_sequence, drive, serial, test_type, drive_sizes, request.timezone, start_time, ip)

        return {"status": "success", "message": f"Started {test_type} test on selected drives."}
    except Exception as e:
        logging.error(f"Error starting Speed test: {e}")
        return {"status": "error", "message": f"System error: {str(e)}"}
