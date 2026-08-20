import subprocess
import logging
import re
from fastapi import APIRouter, Request
from .models import PartitionActionRequest, BatchPartitionRequest
from .history import append_partition_history
from .system import get_local_time, get_client_ip

router = APIRouter()

def run_parted(drive: str, args: list[str], debug_list: list = None):
    cmd = ["parted", "-s", "-m", drive] + args
    if debug_list is not None:
        debug_list.append(f"Running command: {' '.join(cmd)}")
    try:
        res = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        if debug_list is not None:
            debug_list.append(f"Command exit code: {res.returncode}")
            if res.stdout:
                debug_list.append(f"Command stdout: {res.stdout.strip()}")
            if res.stderr:
                debug_list.append(f"Command stderr: {res.stderr.strip()}")
        return res
    except subprocess.TimeoutExpired:
        if debug_list is not None:
            debug_list.append("Command timed out after 60 seconds")
        class FakeRes:
            returncode = 1
            stdout = ""
            stderr = "Command timed out"
        return FakeRes()

@router.get("/api/partitions")
def get_partitions(drive: str):
    if not re.match(r"^/dev/[a-zA-Z0-9_-]+$", drive):
        return {"status": "error", "message": "Invalid device path format."}
    try:
        res = run_parted(drive, ["unit", "B", "print"])
        if res.returncode != 0:
            return {"status": "error", "message": res.stderr.strip() or res.stdout.strip()}
        
        # Parse machine readable parted output
        lines = res.stdout.strip().split('\n')
        if not lines or lines[0] != "BYT;":
            return {"status": "error", "message": "Unexpected parted output"}
            
        disk_info = lines[1].split(':')
        disk_label = disk_info[5]
        partitions = []
        for line in lines[2:]:
            if not line: continue
            parts = line.split(':')
            if len(parts) >= 7:
                fs = ""
                name = ""
                if disk_label == "msdos" or disk_label == "mac":
                    name = parts[4] # Type (primary/logical/extended)
                    fs = parts[5]   # FileSystem
                else:
                    fs = parts[4]   # FileSystem
                    name = parts[5] # Name

                partitions.append({
                    "number": parts[0],
                    "start": parts[1],
                    "end": parts[2],
                    "size": parts[3],
                    "fs": fs, 
                    "name": name,
                    "flags": parts[6].rstrip(';')
                })
        
        return {
            "status": "success", 
            "disk": {
                "path": disk_info[0],
                "size": disk_info[1],
                "transport": disk_info[2],
                "logical_sector": disk_info[3],
                "physical_sector": disk_info[4],
                "label": disk_info[5],
                "model": disk_info[6]
            },
            "partitions": partitions
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/partitions/action")
def partition_action(req: PartitionActionRequest, http_request: Request):
    """Executes partition operations (mklabel, mkpart, format, delete, flags) on a target drive.
    
    Args:
        req (PartitionActionRequest): The request parameters containing drive path, action type, and parameters.
        http_request (Request): The incoming HTTP request.
        
    Returns:
        dict: A status dictionary containing success/error state and debug logs.
    """
    debug_logs = []
    ip = get_client_ip(http_request)
    start_time = get_local_time()

    if not re.match(r"^/dev/[a-zA-Z0-9_-]+$", req.drive):
        debug_logs.append(f"Error: Invalid device path format: {req.drive}")
        return {"status": "error", "message": "Invalid device path format.", "debug": debug_logs}
    try:
        debug_logs.append(f"Received PartitionActionRequest: drive={req.drive}, action={req.action}, params={req.params}")
        if req.action == "format":
            part_number = req.params[0]
            fs_type = req.params[1]
            
            part_path = f"{req.drive}{part_number}"
            if any(char.isdigit() for char in req.drive.split('/')[-1][-1:]):
                part_path = f"{req.drive}p{part_number}"
                
            mkfs_cmd = [f"mkfs.{fs_type}", part_path]
            
            if fs_type in ["ext2", "ext3", "ext4"]:
                mkfs_cmd.insert(1, "-F")
            elif fs_type in ["fat", "vfat", "fat32"]:
                mkfs_cmd[0] = "mkfs.vfat"
            elif fs_type == "ntfs":
                mkfs_cmd.insert(1, "-f")
                
            try:
                debug_logs.append(f"Running command: {' '.join(mkfs_cmd)}")
                res = subprocess.run(mkfs_cmd, capture_output=True, text=True, timeout=120)
                debug_logs.append(f"Command exit code: {res.returncode}")
                if res.stdout:
                    debug_logs.append(f"Command stdout: {res.stdout.strip()}")
                if res.stderr:
                    debug_logs.append(f"Command stderr: {res.stderr.strip()}")
                    
                if res.returncode != 0:
                    append_partition_history({
                        "timestamp": start_time,
                        "event": f"Format partition {part_path} as {fs_type} failed",
                        "drive": req.drive,
                        "action": "format",
                        "params": req.params,
                        "username": ip,
                        "status": "error"
                    })
                    return {"status": "error", "message": res.stderr.strip() or res.stdout.strip(), "debug": debug_logs}
                
                append_partition_history({
                    "timestamp": start_time,
                    "event": f"Formatted partition {part_path} as {fs_type}",
                    "drive": req.drive,
                    "action": "format",
                    "params": req.params,
                    "username": ip,
                    "status": "success"
                })
                return {"status": "success", "message": f"Formatted {part_path} as {fs_type}", "debug": debug_logs}
            except subprocess.TimeoutExpired:
                debug_logs.append("Command timed out after 120 seconds")
                append_partition_history({
                    "timestamp": start_time,
                    "event": f"Format partition {part_path} as {fs_type} timed out",
                    "drive": req.drive,
                    "action": "format",
                    "params": req.params,
                    "username": ip,
                    "status": "error"
                })
                return {"status": "error", "message": "Formatting timed out", "debug": debug_logs}
            
        else:
            res = run_parted(req.drive, [req.action] + req.params, debug_list=debug_logs)
            if res.returncode != 0:
                err_msg = res.stderr.strip() or res.stdout.strip()
                if req.action == "mkpart" and "closest location we can manage" in err_msg:
                    debug_logs.append("Triggering partition alignment fallback...")
                    match = re.search(r"closest location we can manage is.*?\(sectors (\d+)\.\.(\d+)\)", err_msg)
                    if match:
                        start_s = f"{match.group(1)}s"
                        end_s = f"{match.group(2)}s"
                        new_params = [req.params[0], start_s, end_s]
                        res2 = run_parted(req.drive, ["mkpart"] + new_params, debug_list=debug_logs)
                        if res2.returncode == 0:
                            append_partition_history({
                                "timestamp": start_time,
                                "event": f"Partition action {req.action} completed (aligned)",
                                "drive": req.drive,
                                "action": req.action,
                                "params": req.params,
                                "username": ip,
                                "status": "success"
                            })
                            return {"status": "success", "message": "Action completed successfully (aligned to nearest valid boundary)", "debug": debug_logs}
                        err_msg = res2.stderr.strip() or res2.stdout.strip()
                
                append_partition_history({
                    "timestamp": start_time,
                    "event": f"Partition action {req.action} failed",
                    "drive": req.drive,
                    "action": req.action,
                    "params": req.params,
                    "username": ip,
                    "status": "error"
                })
                return {"status": "error", "message": err_msg, "debug": debug_logs}
            
            append_partition_history({
                "timestamp": start_time,
                "event": f"Partition action {req.action} completed",
                "drive": req.drive,
                "action": req.action,
                "params": req.params,
                "username": ip,
                "status": "success"
            })
            return {"status": "success", "message": "Action completed successfully", "debug": debug_logs}
    except Exception as e:
        debug_logs.append(f"Exception raised in partition_action endpoint: {str(e)}")
        append_partition_history({
            "timestamp": start_time,
            "event": f"Partition action {req.action} crashed",
            "drive": req.drive,
            "action": req.action,
            "params": req.params,
            "username": ip,
            "status": "error"
        })
        return {"status": "error", "message": str(e), "debug": debug_logs}


@router.post("/api/partitions/batch")
def partition_batch(req: BatchPartitionRequest, http_request: Request):
    """Executes a partition action (e.g. mklabel) on multiple drives sequentially.

    Returns per-drive results so the frontend can show progress.
    """
    ip = get_client_ip(http_request)
    start_time = get_local_time()

    valid_drives = [d for d in req.drives if re.match(r"^/dev/[a-zA-Z0-9_-]+$", d)]
    if not valid_drives:
        return {"status": "error", "message": "No valid device paths provided."}

    results = []
    for drive in valid_drives:
        drive_debug = []
        drive_start = get_local_time()
        try:
            res = run_parted(drive, [req.action] + req.params, debug_list=drive_debug)
            ok = res.returncode == 0
            msg = res.stderr.strip() or res.stdout.strip() if not ok else "OK"
            if not ok:
                msg = msg or "Unknown error"

            append_partition_history({
                "timestamp": drive_start,
                "event": f"Batch {req.action} {'completed' if ok else 'failed'} on {drive}",
                "drive": drive,
                "action": req.action,
                "params": req.params,
                "username": ip,
                "status": "success" if ok else "error"
            })
            results.append({"drive": drive, "status": "success" if ok else "error", "message": msg, "debug": drive_debug})
        except Exception as e:
            append_partition_history({
                "timestamp": drive_start,
                "event": f"Batch {req.action} crashed on {drive}",
                "drive": drive,
                "action": req.action,
                "params": req.params,
                "username": ip,
                "status": "error"
            })
            results.append({"drive": drive, "status": "error", "message": str(e), "debug": drive_debug})

    succeeded = sum(1 for r in results if r["status"] == "success")
    failed = len(results) - succeeded
    return {
        "status": "success" if failed == 0 else ("partial" if succeeded > 0 else "error"),
        "total": len(results),
        "succeeded": succeeded,
        "failed": failed,
        "results": results
    }