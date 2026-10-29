import os
import subprocess
import re
import asyncio
import time
from fastapi import APIRouter, BackgroundTasks, Request

from .docker_manager import get_running_containers, get_container_logs, stop_and_remove_container, wait_for_container, save_container_logs, run_container
from .disks import validate_drive_path
from .drive_info import get_drive_serial
from .inventory import get_inventory_id

from .models import ShredRequest, StopRequest
from .history import append_history
from .system import get_local_time, get_client_ip
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
    cycled = False

    policy_path = f"/sys/class/scsi_host/{host}/link_power_management_policy" if host else None
    if policy_path and os.path.exists(policy_path):
        try:
            print(f"Cycling SATA link power for {drive_name} (host: {host}) to unfreeze drive...")
            with open(policy_path, "w") as f:
                f.write("min_power\n")
            
            time.sleep(3)
            
            with open(policy_path, "w") as f:
                f.write("max_performance\n")
            
            time.sleep(2)
            print(f"SATA link power cycle for {drive_name} completed.")
            cycled = True
        except Exception as e:
            print(f"Error cycling link power for {drive_name} on {host}: {e}")
    else:
        if host:
            print(f"Link power policy file not found at {policy_path}")
        else:
            print(f"No SCSI host found for {drive_name}, skipping link power cycle.")

    # Also toggle the SCSI device state (offline -> running) to trigger a link reset.
    state_path = f"/sys/block/{drive_name}/device/state"
    if os.path.exists(state_path):
        try:
            print(f"Toggling device state for {drive_name} (offline -> running) to unfreeze...")
            with open(state_path, "w") as f:
                f.write("offline\n")
            time.sleep(3)
            with open(state_path, "w") as f:
                f.write("running\n")
            time.sleep(2)
            print(f"Device state toggle for {drive_name} completed.")
            cycled = True
        except Exception as e:
            print(f"Error toggling device state for {drive_name}: {e}")

    return cycled


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
def stop_shred(request: StopRequest, http_request: Request):
    try:
        ip = get_client_ip(http_request)
        # Derive the drive and serial from the container name
        name_parts = request.container_name.replace("disk_hunter_wipe_", "").split("--")
        drive = f"/dev/{name_parts[0]}" if name_parts[0] else "UNKNOWN"
        serial = name_parts[1] if len(name_parts) > 1 else "UNKNOWN"
        inv_id = get_inventory_id(serial) or "N/A"
        # log audit history as "Stopped", and delete the container.
        stop_and_remove_container(request.container_name)
        append_history({
            "timestamp": get_local_time(),
            "event": f"USER stopped wipe of {drive}",
            "username": ip,
            "serial": serial,
            "inventory_id": inv_id,
            "drive": drive,
            "status": "stopped",
            "command": f"docker stop {request.container_name}",
            "container_name": request.container_name
        })
        return {"status": "success", "message": f"Stop command sent to {request.container_name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Patterns that indicate a failing or unresponsive disk in worker output.
# Screened line-by-line so benign summary lines such as "Completed without
# error" or "Total errors: 0" do not flag a successful wipe as problematic.
_PROBLEMATIC_LINE = re.compile(
    r"(fatal|timed?\s?out|hung|i/o error|input/output error|device not ready|"
    r"sense\s+(data|key|error)|medium error|hardware error|"
    r"aborted by host|disk failure|blk_update_request|critical medium error)",
    re.IGNORECASE,
)
_BENIGN_ERROR_LINE = re.compile(
    r"(no|zero|without|0)[\s_:-]*(errors?|failed|failures)|errors?\s*[:=]\s*0\b",
    re.IGNORECASE,
)
_BARE_ERROR_LINE = re.compile(r"\b(error|failed|failure)\b", re.IGNORECASE)


def _detect_problematic(log_text: str) -> bool:
    """Heuristic screen of worker output for a problematic disk.

    Matches specific failure signatures on every line, plus a bare
    error/failed mention that is not part of a benign count, so a healthy
    nwipe summary ("0 errors") never triggers a false positive.
    """
    if not log_text:
        return False
    for line in log_text.splitlines():
        low = line.lower()
        if _BENIGN_ERROR_LINE.search(low):
            continue
        if _PROBLEMATIC_LINE.search(low):
            return True
        if _BARE_ERROR_LINE.search(low):
            return True
    return False


def _tail_log_file(path: str, lines: int = 30) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.read().splitlines()
            return "\n".join(all_lines[-lines:])
    except Exception:
        return ""


async def monitor_wipe_job(container_name: str, drive: str, drive_name: str, serial: str, req: ShredRequest, start_time: str, server_name: str, inv_id: str, datacenter: str, ip: str, command: str):
    exit_code = await wait_for_container(container_name)

    end_time = get_local_time(req.timezone)
    report_filename = None

    # Save container logs before analysing/deleting
    log_dir = "/app/data/shredding/logs/container_logs"
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, f"{container_name}.log")
    save_container_logs(container_name, log_file_path)
    log_tail = _tail_log_file(log_file_path, 30)

    problematic = _detect_problematic(log_tail)

    if exit_code == "0" and not problematic:
        status_text = "successfully completed"
        status = "completed"
        if req.generate_pdf:
            report_filename = generate_erasure_certificate(
                REPORTS_DIR, drive_name, serial, req.method, req.verify, start_time, end_time,
                server_name, inv_id, datacenter, req.company_name, req.company_address, req.company_phone
            )
    elif exit_code in ["137", "143"]:
        status_text = "stopped"
        status = "stopped"
    else:
        status_text = f"failed (Exit Code: {exit_code})"
        status = "failed"
        if problematic:
            status_text = f"failed - PROBLEMATIC DISK DETECTED (Exit Code: {exit_code})"

    history_entry = {
        "timestamp": end_time,
        "event": f"USER {status_text} wipe of {drive}",
        "username": ip,
        "serial": serial,
        "inventory_id": inv_id or "N/A",
        "drive": drive,
        "method": req.method,
        "command": command,
        "status": status,
        "report_file": report_filename,
        "container_name": container_name,
    }
    if status == "failed":
        history_entry["output"] = log_tail
    append_history(history_entry)

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
        ip = get_client_ip(http_request)
        debug_logs.append(f"Received ShredRequest payload from {ip}: {request.dict()}")
        spawned_containers = []
        start_time = get_local_time(request.timezone)

        # Iterate over DriveMeta objects instead of strings
        for drive_obj in request.drives:
            drive = drive_obj.path
            drive_name = drive.split('/')[-1]
            valid, err_msg = validate_drive_path(drive)
            if not valid:
                debug_logs.append(f"Rejected drive {drive}: {err_msg}")
                return {"status": "error", "message": err_msg, "debug": debug_logs}
            debug_logs.append(f"Configuring wipe for drive: {drive}")
            
            serial = get_drive_serial(drive)
            serial = re.sub(r'[^a-zA-Z0-9_.-]', '_', serial)
            debug_logs.append(f"Resolved serial for {drive}: {serial}")

            inv_id = drive_obj.inventory_id
            if not inv_id or inv_id == "N/A":
                inv_id = get_inventory_id(serial) or "N/A"
            debug_logs.append(f"Resolved inventory ID for {drive}: {inv_id}")

            container_name = f"disk_hunter_wipe_{drive_name}--{serial}"
            
            devices = [f"{drive}:{drive}"]
            container_env = {"TERM": "xterm"}
            if request.method in ["nvme-user", "nvme-crypto"]:
                image = "disk-hunter-nvme"
                ses_val = "1" if request.method == "nvme-user" else "2"
                args = [drive, f"--ses={ses_val}", "--force"]
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
                container_env["FROZEN_FALLBACK_WIPE"] = os.environ.get("FROZEN_FALLBACK_WIPE", "1")
            else:
                image = "disk-hunter-nwipe"
                args = ["--autonuke", "--nogui", "--verbose", f"--method={request.method}", f"--verify={request.verify}", drive]

            cmd_out = []
            success = run_container(
                name=container_name,
                image=image,
                args=args,
                privileged=True,
                devices=devices,
                tty=True,
                env=container_env,
                debug_list=debug_logs,
                cmd_out=cmd_out
            )
            command = cmd_out[0] if cmd_out else ""
            
            if not success:
                debug_logs.append(f"Failed to start container {container_name}")
                return {"status": "error", "message": f"Docker Error starting container.", "debug": debug_logs}
            
            append_history({
                "timestamp": start_time,
                "event": f"USER started wipe of {drive}",
                "username": ip,
                "serial": serial,
                "inventory_id": inv_id or "N/A",
                "drive": drive,
                "method": request.method,
                "command": command,
                "status": "started",
                "report_file": None,
                "container_name": container_name
            })

            # Hand off the extra metadata to the watcher
            background_tasks.add_task(
                monitor_wipe_job, 
                container_name, drive, drive_name, serial, request, start_time, 
                drive_obj.server_name, inv_id, drive_obj.datacenter,
                ip, command
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
