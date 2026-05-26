import subprocess
import logging
from fastapi import APIRouter
from .models import PartitionActionRequest

router = APIRouter()

def run_parted(drive: str, args: list[str]):
    cmd = ["parted", "-s", "-m", drive] + args
    try:
        res = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        return res
    except subprocess.TimeoutExpired:
        class FakeRes:
            returncode = 1
            stdout = ""
            stderr = "Command timed out"
        return FakeRes()

@router.get("/api/partitions")
def get_partitions(drive: str):
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
def partition_action(req: PartitionActionRequest):
    try:
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
                res = subprocess.run(mkfs_cmd, capture_output=True, text=True, timeout=120)
                if res.returncode != 0:
                    return {"status": "error", "message": res.stderr.strip() or res.stdout.strip()}
                return {"status": "success", "message": f"Formatted {part_path} as {fs_type}"}
            except subprocess.TimeoutExpired:
                return {"status": "error", "message": "Formatting timed out"}
            
        else:
            res = run_parted(req.drive, [req.action] + req.params)
            if res.returncode != 0:
                err_msg = res.stderr.strip() or res.stdout.strip()
                if req.action == "mkpart" and "closest location we can manage" in err_msg:
                    import re
                    match = re.search(r"closest location we can manage is.*?\(sectors (\d+)\.\.(\d+)\)", err_msg)
                    if match:
                        start_s = f"{match.group(1)}s"
                        end_s = f"{match.group(2)}s"
                        new_params = [req.params[0], start_s, end_s]
                        res2 = run_parted(req.drive, ["mkpart"] + new_params)
                        if res2.returncode == 0:
                            return {"status": "success", "message": "Action completed successfully (aligned to nearest valid boundary)"}
                        err_msg = res2.stderr.strip() or res2.stdout.strip()
                return {"status": "error", "message": err_msg}
            return {"status": "success", "message": "Action completed successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}