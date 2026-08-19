import os
import subprocess
import re
import asyncio
import time
from fastapi import APIRouter, BackgroundTasks, Request

from .docker_manager import get_running_containers, get_container_logs, stop_and_remove_container, wait_for_container, save_container_logs, run_container

from .models import ShredRequest, StopRequest
from .history import append_history
from .system import get_local_time
from .config import REPORTS_DIR
from .pdf_generator import generate_erasure_certificate

router = APIRouter()

def get_scsi_host_for_drive(drive_name: str) -> str:
    try:
        real_path = os.path.realpath(f"/sys/block/{drive_name}/device")
        match = re.search(r"/(host\d+)/", real_path)
        if match:
            return match.group(1)
    except Exception as e:
        print(f"Error finding SCSI host for {drive_name}: {e}")
    return None

def cycle_sata_link_power(drive_name: str):
    host = get_scsi_host_for_drive(drive_name)
    if not host:
        print(f"No SCSI host found for {drive_name}, skipping link power cycle.")
        return False
    
    policy_path = f"/sys/class/scsi_host/{host}/link_power_management_policy"
    if os.path.exists(policy_path):
        try:
            print(f"Cycling SATA link power for {drive_name} (host: {host}) to unfreeze drive...")
            with open(policy_path, "w") as f:
                f.write("min_power\n")
            
            time.sleep(3)
            
            with open(policy_path, "w") as f:
                f.write("max_performance\n")
            
            time.sleep(2)
            print(f"SATA link power cycle for {drive_name} completed.")
            return True
        except Exception as e:
            print(f"Error cycling link power for {drive_name} on {host}: {e}")
    else:
        print(f"Link power policy file not found at {policy_path}")
    return False


@router.get("/api/wipe-status")
def wipe_status():
    try:
        containers = get_running_containers("disk_hunter_wipe_")
        
        wiping_data = []
        for c in containers:
            last_log = get_container_logs(c, tail=1) or "Initializing..."
            last_log = re.sub(r'\x1b\[[0-9;]*m', '', last_log)

            name_part = c.replace("disk_hunter_wipe_", "")
            drive_only = name_part.split("--")[0]
            
            wiping_data.append({"drive": drive_only, "container": c, "log": last_log})
        return {"status": "success", "wiping": wiping_data}
    except Exception as e:
        return {"status": "error", "message": str(e), "wiping": []}

@router.post("/api/shred/stop")
def stop_shred(request: StopRequest):
    try:
        # log audit history as "Stopped", and delete the container.
        stop_and_remove_container(request.container_name)
        return {"status": "success", "message": f"Stop command sent to {request.container_name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def monitor_wipe_job(container_name: str, drive: str, drive_name: str, serial: str, req: ShredRequest, start_time: str, server_name: str, inv_id: str, datacenter: str, ip: str):
    exit_code = await wait_for_container(container_name)

    end_time = get_local_time(req.timezone)
    report_filename = None

    if exit_code == "0":
        status_text = "successfully completed"
        if req.generate_pdf:
            report_filename = generate_erasure_certificate(
                REPORTS_DIR, drive_name, serial, req.method, req.verify, start_time, end_time,
                server_name, inv_id, datacenter, req.company_name, req.company_address, req.company_phone
            )
    elif exit_code in ["137", "143"]:
        status_text = "stopped"
    else:
        status_text = f"failed (Exit Code: {exit_code})"

    append_history({
        "timestamp": end_time,
        "event": f"USER {status_text} wipe of {drive}",
        "username": ip,
        "serial": serial,
        "method": req.method,
        "report_file": report_filename,
        "container_name": container_name
    })

    # Save container logs before deleting
    log_dir = "/app/data/shredding/logs/container_logs"
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, f"{container_name}.log")
    save_container_logs(container_name, log_file_path)

    stop_and_remove_container(container_name)

@router.post("/api/shred")
def start_shred(request: ShredRequest, background_tasks: BackgroundTasks, http_request: Request):
    """Starts the shredding/wiping process on selected devices.
    
    Args:
        request (ShredRequest): The data destruction configuration and target devices.
        background_tasks (BackgroundTasks): FastAPI background task manager to run container monitors.
        http_request (Request): The incoming HTTP request.
        
    Returns:
        dict: A status dictionary containing success/error state and debug logs.
    """
    debug_logs = []
    try:
        ip = http_request.client.host if http_request.client else "Unknown"
        debug_logs.append(f"Received ShredRequest payload from {ip}: {request.dict()}")
        spawned_containers = []
        start_time = get_local_time(request.timezone)

        # Iterate over DriveMeta objects instead of strings
        for drive_obj in request.drives:
            drive = drive_obj.path
            drive_name = drive.split('/')[-1]
            debug_logs.append(f"Configuring wipe for drive: {drive}")
            
            serial = "UNKNOWN"
            try:
                s_cmd = ["lsblk", "-n", "-o", "SERIAL", drive]
                debug_logs.append(f"Running command: {' '.join(s_cmd)}")
                s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                if s_res.returncode == 0 and s_res.stdout.strip():
                    serial = re.sub(r'[^a-zA-Z0-9_.-]', '_', s_res.stdout.strip())
                    debug_logs.append(f"Found serial for {drive}: {serial}")
                else:
                    debug_logs.append(f"lsblk query returned code {s_res.returncode}. stdout: '{s_res.stdout.strip()}', stderr: '{s_res.stderr.strip()}'")
            except Exception as e:
                debug_logs.append(f"Exception running lsblk command for {drive}: {str(e)}")
            
            container_name = f"disk_hunter_wipe_{drive_name}--{serial}"
            
            devices = [f"{drive}:{drive}"]
            if request.method in ["nvme-user", "nvme-crypto"]:
                image = "disk-hunter-nvme"
                ses_val = "1" if request.method == "nvme-user" else "2"
                args = ["format", drive, f"--ses={ses_val}", "--force"]
                # Extract nvme controller (e.g. /dev/nvme0 from /dev/nvme0n1)
                nvme_match = re.match(r"^(/dev/nvme\d+)", drive)
                if nvme_match:
                    controller_path = nvme_match.group(1)
                    if os.path.exists(controller_path):
                        devices.append(f"{controller_path}:{controller_path}")
            elif request.method in ["ata-secure", "ata-enhanced"]:
                try:
                    debug_logs.append(f"Cycling SATA link power for drive: {drive_name}")
                    cycle_sata_link_power(drive_name)
                    debug_logs.append(f"SATA link power cycle completed for: {drive_name}")
                except Exception as e:
                    debug_logs.append(f"Failed to cycle SATA link power for {drive_name}: {e}")
                image = "disk-hunter-hdparm"
                args = [drive, "enhanced" if request.method == "ata-enhanced" else "secure"]
            else:
                image = "disk-hunter-nwipe"
                args = ["--autonuke", "--nogui", "--verbose", f"--method={request.method}", f"--verify={request.verify}", drive]

            success = run_container(
                name=container_name,
                image=image,
                args=args,
                privileged=True,
                devices=devices,
                tty=True,
                env={"TERM": "xterm"},
                debug_list=debug_logs
            )
            
            if not success:
                debug_logs.append(f"Failed to start container {container_name}")
                return {"status": "error", "message": f"Docker Error starting container.", "debug": debug_logs}
            
            append_history({
                "timestamp": start_time,
                "event": f"USER started wipe of {drive}",
                "serial": serial,
                "method": request.method,
                "report_file": None,
                "container_name": container_name
            })

            # Hand off the extra metadata to the watcher
            background_tasks.add_task(
                monitor_wipe_job, 
                container_name, drive, drive_name, serial, request, start_time, 
                drive_obj.server_name, drive_obj.inventory_id, drive_obj.datacenter,
                ip
            )
            spawned_containers.append(container_name)

        return {"status": "success", "message": f"Started wipe containers.", "debug": debug_logs}
    except Exception as e:
        debug_logs.append(f"Exception raised in start_shred endpoint: {str(e)}")
        return {"status": "error", "message": f"System error: {str(e)}", "debug": debug_logs}

@router.get("/api/shredding/logs/{container_name}")
def get_shredding_logs(container_name: str):
    if not re.match(r"^disk_hunter_wipe_[a-zA-Z0-9_.-]+$", container_name):
        return {"status": "error", "message": "Invalid container name format."}

    try:
        log_dir = "/app/data/shredding/logs/container_logs"
        log_file_path = os.path.join(log_dir, f"{container_name}.log")

        if os.path.exists(log_file_path):
            with open(log_file_path, "r") as f:
                logs = f.read()
            return {"status": "success", "logs": logs}
        
        cmd = ["docker", "logs", container_name]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return {"status": "success", "logs": result.stdout.strip() or result.stderr.strip()}
        else:
            return {"status": "error", "message": f"Could not retrieve logs for {container_name}."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
