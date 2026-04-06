import subprocess
import re
import asyncio
from fastapi import APIRouter, BackgroundTasks

from .models import ShredRequest, StopRequest
from .history import append_history
from .system import get_local_time
from .config import REPORTS_DIR
from .pdf_generator import generate_erasure_certificate

router = APIRouter()

@router.get("/api/wipe-status")
def wipe_status():
    try:
        cmd = ["docker", "ps", "--format", "{{.Names}}", "--filter", "name=disk_hunter_wipe_"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        containers = result.stdout.strip().split('\n')
        
        wiping_data = []
        for c in containers:
            if c:
                log_cmd = ["docker", "logs", "--tail", "1", c]
                log_res = subprocess.run(log_cmd, capture_output=True, text=True)
                last_log = log_res.stdout.strip() or log_res.stderr.strip() or "Initializing..."
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
        subprocess.run(["docker", "stop", request.container_name], check=True)
        return {"status": "success", "message": f"Stop command sent to {request.container_name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def monitor_wipe_job(container_name: str, drive: str, drive_name: str, serial: str, req: ShredRequest, start_time: str, server_name: str, inv_id: str, datacenter: str):
    proc = await asyncio.create_subprocess_exec("docker", "wait", container_name, stdout=asyncio.subprocess.PIPE)
    stdout, _ = await proc.communicate()
    exit_code = stdout.decode().strip()

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
        "serial": serial,
        "method": req.method,
        "report_file": report_filename
    })
    subprocess.run(["docker", "rm", "-f", container_name], check=False)

@router.post("/api/shred")
def start_shred(request: ShredRequest, background_tasks: BackgroundTasks):
    try:
        spawned_containers = []
        start_time = get_local_time(request.timezone)

        # Iterate over DriveMeta objects instead of strings
        for drive_obj in request.drives:
            drive = drive_obj.path
            drive_name = drive.split('/')[-1]
            
            serial = "UNKNOWN"
            try:
                s_cmd = ["lsblk", "-n", "-o", "SERIAL", drive]
                s_res = subprocess.run(s_cmd, capture_output=True, text=True)
                if s_res.stdout.strip():
                    serial = re.sub(r'[^a-zA-Z0-9_.-]', '_', s_res.stdout.strip())
            except Exception:
                pass
            
            container_name = f"disk_hunter_wipe_{drive_name}--{serial}"
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
            
            cmd = [
                "docker", "run", "-d", "-t", "-e", "TERM=xterm",
                "--name", container_name, "--privileged", "--device", f"{drive}:{drive}",
                "disk-hunter-nwipe", "--autonuke", "--nogui", "--verbose", f"--method={request.method}", f"--verify={request.verify}", drive
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                return {"status": "error", "message": f"Docker Error: {res.stderr.strip()}"}
            
            append_history({
                "timestamp": start_time,
                "event": f"USER started wipe of {drive}",
                "serial": serial,
                "method": request.method,
                "report_file": None
            })

            # Hand off the extra metadata to the watcher
            background_tasks.add_task(
                monitor_wipe_job, 
                container_name, drive, drive_name, serial, request, start_time, 
                drive_obj.server_name, drive_obj.inventory_id, drive_obj.datacenter 
            )
            spawned_containers.append(container_name)

        return {"status": "success", "message": f"Started wipe containers."}
    except Exception as e:
        return {"status": "error", "message": f"System error: {str(e)}"}
