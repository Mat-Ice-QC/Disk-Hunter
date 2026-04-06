import subprocess
import logging
from fastapi import APIRouter
from .models import PartitionActionRequest

router = APIRouter()

def run_parted(drive: str, args: list[str]):
    cmd = ["docker", "exec", "disk_hunter_parted", "parted", "-s", "-m", drive] + args
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res

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
        partitions = []
        for line in lines[2:]:
            if not line: continue
            parts = line.split(':')
            if len(parts) >= 7:
                partitions.append({
                    "number": parts[0],
                    "start": parts[1],
                    "end": parts[2],
                    "size": parts[3],
                    "fs": parts[4], 
                    "name": parts[5], # name or partition type depending on table
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
                
            mkfs_cmd = ["docker", "exec", "disk_hunter_parted", f"mkfs.{fs_type}", part_path]
            
            if fs_type in ["ext2", "ext3", "ext4"]:
                mkfs_cmd.insert(-1, "-F")
            elif fs_type in ["fat", "vfat", "fat32"]:
                mkfs_cmd[3] = "mkfs.vfat"
            elif fs_type == "ntfs":
                mkfs_cmd.insert(-1, "-f")
                
            res = subprocess.run(mkfs_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                return {"status": "error", "message": res.stderr.strip() or res.stdout.strip()}
            return {"status": "success", "message": f"Formatted {part_path} as {fs_type}"}
            
        else:
            res = run_parted(req.drive, [req.action] + req.params)
            if res.returncode != 0:
                return {"status": "error", "message": res.stderr.strip() or res.stdout.strip()}
            return {"status": "success", "message": "Action completed successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}