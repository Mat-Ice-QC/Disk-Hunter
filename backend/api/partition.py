import subprocess
import logging
import re
from fastapi import APIRouter, Request
from .models import PartitionActionRequest, BatchPartitionRequest, PreparePartitionsRequest
from .history import append_partition_history
from .system import get_local_time, get_client_ip
from .disks import validate_drive_path

router = APIRouter()

def get_drive_serial(drive: str) -> str:
    """Resolve the serial number of the physical disk backing a drive/partition path."""
    try:
        parent = re.sub(r'\d+$', '', drive)
        nvme_match = re.match(r"^(nvme\d+n\d+)p\d+$", parent.split('/')[-1])
        if nvme_match:
            parent = f"/dev/{nvme_match.group(1)}"
        s_res = subprocess.run(["lsblk", "-n", "-o", "SERIAL", parent], capture_output=True, text=True)
        if s_res.returncode == 0 and s_res.stdout.strip():
            return s_res.stdout.strip()
    except Exception:
        pass
    return "N/A"

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

def _parted_output_str(res) -> str:
    """Combine stdout/stderr of a parted result into a single output blob for history."""
    out = ""
    if getattr(res, "stdout", ""):
        out += res.stdout.strip()
    if getattr(res, "stderr", ""):
        out += ("\n" + res.stderr.strip()) if out else res.stderr.strip()
    return out

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
    valid, err_msg = validate_drive_path(req.drive)
    if not valid:
        debug_logs.append(f"Error: {err_msg}")
        return {"status": "error", "message": err_msg, "debug": debug_logs}

    serial = get_drive_serial(req.drive)

    try:
        debug_logs.append(f"Received PartitionActionRequest: drive={req.drive}, action={req.action}, params={req.params}")
        ALLOWED_PARTED_ACTIONS = {"mklabel", "mkpart", "rm", "set", "unit", "print", "resizepart", "name", "toggle"}
        if req.action != "format" and req.action not in ALLOWED_PARTED_ACTIONS:
            debug_logs.append(f"Error: Unsupported partition action: {req.action}")
            return {"status": "error", "message": f"Unsupported action: {req.action}", "debug": debug_logs}
        if req.action == "format":
            part_number = req.params[0]
            fs_type = req.params[1]
            ALLOWED_FS_TYPES = {"ext2", "ext3", "ext4", "fat", "vfat", "fat32", "ntfs", "exfat", "xfs"}
            if fs_type not in ALLOWED_FS_TYPES:
                debug_logs.append(f"Error: Unsupported filesystem type: {fs_type}")
                return {"status": "error", "message": f"Unsupported filesystem type: {fs_type}", "debug": debug_logs}

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
                        "serial": serial,
                        "action": "format",
                        "params": req.params,
                        "command": " ".join(mkfs_cmd),
                        "output": (res.stdout + ("\n" + res.stderr if res.stderr else "")).strip(),
                        "username": ip,
                        "status": "error"
                    })
                    return {"status": "error", "message": res.stderr.strip() or res.stdout.strip(), "debug": debug_logs}
                
                append_partition_history({
                    "timestamp": start_time,
                    "event": f"Formatted partition {part_path} as {fs_type}",
                    "drive": req.drive,
                    "serial": serial,
                    "action": "format",
                    "params": req.params,
                    "command": " ".join(mkfs_cmd),
                    "output": (res.stdout + ("\n" + res.stderr if res.stderr else "")).strip(),
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
                    "serial": serial,
                    "action": "format",
                    "params": req.params,
                    "command": " ".join(mkfs_cmd),
                    "output": "Command timed out after 120 seconds",
                    "username": ip,
                    "status": "error"
                })
                return {"status": "error", "message": "Formatting timed out", "debug": debug_logs}
            
        else:
            parted_cmd_str = " ".join(["parted", "-s", "-m", req.drive, req.action] + req.params)
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
                        aligned_cmd_str = " ".join(["parted", "-s", "-m", req.drive, "mkpart"] + new_params)
                        res2 = run_parted(req.drive, ["mkpart"] + new_params, debug_list=debug_logs)
                        if res2.returncode == 0:
                            append_partition_history({
                                "timestamp": start_time,
                                "event": f"Partition action {req.action} completed (aligned)",
                                "drive": req.drive,
                                "serial": serial,
                                "action": req.action,
                                "params": req.params,
                                "command": aligned_cmd_str,
                                "output": _parted_output_str(res2),
                                "username": ip,
                                "status": "success"
                            })
                            return {"status": "success", "message": "Action completed successfully (aligned to nearest valid boundary)", "debug": debug_logs}
                        err_msg = res2.stderr.strip() or res2.stdout.strip()
                
                append_partition_history({
                    "timestamp": start_time,
                    "event": f"Partition action {req.action} failed",
                    "drive": req.drive,
                    "serial": serial,
                    "action": req.action,
                    "params": req.params,
                    "command": parted_cmd_str,
                    "output": _parted_output_str(res),
                    "username": ip,
                    "status": "error"
                })
                return {"status": "error", "message": err_msg, "debug": debug_logs}
            
            append_partition_history({
                "timestamp": start_time,
                "event": f"Partition action {req.action} completed",
                "drive": req.drive,
                "serial": serial,
                "action": req.action,
                "params": req.params,
                "command": parted_cmd_str,
                "output": _parted_output_str(res),
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
            "serial": serial,
            "action": req.action,
            "params": req.params,
            "command": "",
            "output": str(e),
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

    valid_drives = []
    for d in req.drives:
        v, msg = validate_drive_path(d)
        if v:
            valid_drives.append(d)
    if not valid_drives:
        return {"status": "error", "message": "No valid device paths provided."}

    ALLOWED_PARTED_ACTIONS = {"mklabel", "mkpart", "rm", "set", "unit", "print", "resizepart", "name", "toggle"}
    if req.action not in ALLOWED_PARTED_ACTIONS:
        return {"status": "error", "message": f"Unsupported action: {req.action}"}

    results = []
    for drive in valid_drives:
        drive_debug = []
        drive_start = get_local_time()
        drive_serial = get_drive_serial(drive)
        parted_cmd_str = " ".join(["parted", "-s", "-m", drive, req.action] + req.params)
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
                "serial": drive_serial,
                "action": req.action,
                "params": req.params,
                "command": parted_cmd_str,
                "output": _parted_output_str(res),
                "username": ip,
                "status": "success" if ok else "error"
            })
            results.append({"drive": drive, "status": "success" if ok else "error", "message": msg, "debug": drive_debug})
        except Exception as e:
            append_partition_history({
                "timestamp": drive_start,
                "event": f"Batch {req.action} crashed on {drive}",
                "drive": drive,
                "serial": drive_serial,
                "action": req.action,
                "params": req.params,
                "command": parted_cmd_str,
                "output": str(e),
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


@router.post("/api/partitions/prepare")
def partition_prepare(req: PreparePartitionsRequest, http_request: Request):
    """Creates a fresh partition table and a single spanning partition on
    each listed drive so they can be used for speed testing.

    For every drive this runs (destructively):
        parted -s -m <drive> mklabel <label>
        parted -s -m <drive> mkpart primary <fs> 0% <size>

    Only invoked on explicit user action from the Speed Test page. Returns
    per-drive results.
    """
    ip = get_client_ip(http_request)
    start_time = get_local_time()

    valid_drives = []
    for d in req.drives:
        v, msg = validate_drive_path(d)
        if v:
            valid_drives.append(d)
    if not valid_drives:
        return {"status": "error", "message": "No valid device paths provided."}

    label = req.label or "gpt"
    fs_type = req.fs_type or "ext4"
    size = req.size or "100%"
    if label not in ("gpt", "msdos"):
        return {"status": "error", "message": "Invalid partition table label. Use 'gpt' or 'msdos'."}

    results = []
    for drive in valid_drives:
        drive_debug = []
        drive_serial = get_drive_serial(drive)
        commands = []
        outputs = []
        ok = True
        msg = "OK"
        try:
            mklabel_cmd = ["parted", "-s", "-m", drive, "mklabel", label]
            commands.append(" ".join(mklabel_cmd))
            res1 = run_parted(drive, ["mklabel", label], debug_list=drive_debug)
            outputs.append(_parted_output_str(res1))
            if res1.returncode != 0:
                ok = False
                msg = res1.stderr.strip() or res1.stdout.strip() or "mklabel failed"
            else:
                mkpart_cmd = ["parted", "-s", "-m", drive, "mkpart", "primary", fs_type, "0%", size]
                commands.append(" ".join(mkpart_cmd))
                res2 = run_parted(drive, ["mkpart", "primary", fs_type, "0%", size], debug_list=drive_debug)
                outputs.append(_parted_output_str(res2))
                if res2.returncode != 0:
                    ok = False
                    msg = res2.stderr.strip() or res2.stdout.strip() or "mkpart failed"
        except Exception as e:
            ok = False
            msg = str(e)
            outputs.append(str(e))

        append_partition_history({
            "timestamp": start_time,
            "event": f"Prepare partitions {'completed' if ok else 'failed'} on {drive}",
            "drive": drive,
            "serial": drive_serial,
            "action": "prepare",
            "params": [label, fs_type, size],
            "command": "\n".join(commands),
            "output": "\n".join(o for o in outputs if o),
            "username": ip,
            "status": "success" if ok else "error"
        })
        results.append({"drive": drive, "status": "success" if ok else "error", "message": msg, "debug": drive_debug})

    succeeded = sum(1 for r in results if r["status"] == "success")
    failed = len(results) - succeeded
    return {
        "status": "success" if failed == 0 else ("partial" if succeeded > 0 else "error"),
        "total": len(results),
        "succeeded": succeeded,
        "failed": failed,
        "results": results
    }