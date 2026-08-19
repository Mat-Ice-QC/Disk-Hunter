from fastapi import APIRouter
import subprocess
import json
import re
import httpx
import time
import os

smart_attributes_cache = {}  # maps disk_name -> (timestamp, parsed_data)
CACHE_DURATION = 30.0  # seconds

router = APIRouter()

def parse_smart_attributes(output: str) -> dict:
    """
    Parses the raw text output of 'smartctl -a' into a structured dictionary.
    
    Args:
        output (str): The stdout from the smartctl command.
        
    Returns:
        dict: A structured dictionary containing overall health, reallocated sectors,
              pending sectors, and a list of detailed S.M.A.R.T. attributes.
    """
    if not output:
        return {"health": "Not Supported", "reallocated_sectors": 0, "pending_sectors": 0, "attributes": []}
    
    attributes = {}
    health_match = re.search(r"SMART overall-health self-assessment test result: (.+)", output)
    attributes['health'] = health_match.group(1).strip() if health_match else "Unknown"

    reallocated_match = re.search(r"Reallocated_Sector_Ct\s+.*\s+(\d+)", output)
    attributes['reallocated_sectors'] = int(reallocated_match.group(1)) if reallocated_match else 0

    pending_match = re.search(r"Current_Pending_Sector\s+.*\s+(\d+)", output)
    attributes['pending_sectors'] = int(pending_match.group(1)) if pending_match else 0
    
    # Improved attribute parsing
    attributes['attributes'] = []
    smart_attributes_section = False
    for line in output.splitlines():
        if line.startswith("ID#"):
            smart_attributes_section = True
            continue
        if smart_attributes_section:
            if not line.strip():
                smart_attributes_section = False
                continue
            parts = line.split()
            if len(parts) >= 10:
                try:
                    attr_id = int(parts[0])
                    attr_name = parts[1]
                    flag = parts[2]
                    value = int(parts[3])
                    worst = int(parts[4])
                    thresh = int(parts[5])
                    attr_type = parts[6]
                    updated = parts[7]
                    when_failed = parts[8]
                    raw_value = parts[9]
                    
                    # Determine status
                    status = "ok"
                    if thresh > 0 and value < thresh:
                        status = "failing"
                    elif "failing" in when_failed.lower():
                        status = "failing"

                    attributes['attributes'].append({
                        "id": attr_id,
                        "name": attr_name,
                        "flag": flag,
                        "value": value,
                        "worst": worst,
                        "thresh": thresh,
                        "type": attr_type,
                        "updated": updated,
                        "when_failed": when_failed,
                        "raw_value": raw_value,
                        "status": status
                    })
                except (ValueError, IndexError):
                    continue # Ignore malformed lines
    return attributes

def resolve_physical_disk(dev_path: str) -> str | None:
    """
    Recursively follows device-mapper/LVM paths and partition numbers
    to resolve the final underlying physical disk name (e.g. /dev/sda).
    """
    if not dev_path or not dev_path.startswith("/dev/"):
        return None
    
    # Resolve any symlinks (like /dev/mapper/vg-root -> /dev/dm-0)
    real_path = os.path.realpath(dev_path)
    dev_name = real_path.split("/")[-1]
    
    # Check LVM/LUKS virtual block device slaves recursively
    slaves_dir = f"/sys/class/block/{dev_name}/slaves"
    if os.path.exists(slaves_dir):
        try:
            slaves = os.listdir(slaves_dir)
            if slaves:
                resolved = resolve_physical_disk(f"/dev/{slaves[0]}")
                if resolved:
                    return resolved
        except Exception:
            pass
            
    # Remove partition suffix (e.g. nvme0n1p2 -> nvme0n1, sda1 -> sda)
    # Check NVMe format first: nvme[number]n[number]p[number]
    nvme_part_match = re.match(r"^(nvme\d+n\d+)p\d+$", dev_name)
    if nvme_part_match:
        return f"/dev/{nvme_part_match.group(1)}"
        
    # Check standard partitions: sd[letter][number]
    std_part_match = re.match(r"^([a-zA-Z]+)\d+$", dev_name)
    if std_part_match:
        return f"/dev/{std_part_match.group(1)}"
        
    return real_path

@router.get("/api/disks")
async def get_disks(exclude_root: bool = False):
    """
    Retrieves all connected block storage devices using the 'lsblk' command.
    Optionally attempts to filter out the root operating system drive to prevent accidental modification.
    """
    try:
        cmd = ["lsblk", "-b", "-J", "-o", "NAME,PATH,SIZE,TYPE,FSTYPE,PTTYPE,TRAN,MODEL,SERIAL,MOUNTPOINT,LABEL,PARTTYPENAME,FSVER,VENDOR,RO,ROTA"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        # Filter out loopback devices (like snap mounts) and ensure it's an actual disk
        disks = [d for d in data.get('blockdevices', []) if d.get('type') == 'disk' and not d.get('name', '').startswith('loop') and d.get('size', 0) > 0]
        
        root_drive = None
        try:
            # Heuristic 1: Find the underlying device for /app/data which is mounted from the host OS
            df_res = subprocess.run(["df", "/app/data", "--output=source"], capture_output=True, text=True)
            lines = df_res.stdout.strip().split('\n')
            if len(lines) > 1:
                dev_path = lines[1].strip()
                if dev_path and dev_path != "overlay":
                    root_drive = resolve_physical_disk(dev_path)
            
            # Heuristic 2: If the first check fails (e.g., using overlayfs), try finding the mount for /etc/resolv.conf
            if not root_drive or root_drive == "overlay":
                df_res = subprocess.run(["df", "/etc/resolv.conf", "--output=source"], capture_output=True, text=True)
                lines = df_res.stdout.strip().split('\n')
                if len(lines) > 1:
                    dev_path = lines[1].strip()
                    if dev_path and dev_path != "overlay":
                        root_drive = resolve_physical_disk(dev_path)

        except Exception:
            pass

        # Tag each disk indicating if it is the primary host OS root disk
        for d in disks:
            if root_drive and d.get('path') == root_drive:
                d['is_root'] = True
            else:
                d['is_root'] = False

        if exclude_root:
            disks = [d for d in disks if not d.get('is_root', False)]
            
            # Additional heuristic: filter out drive containing a partition mounted at / or /etc/resolv.conf
            # by inspecting lsblk tree if possible, but df approach is usually better in docker.

        return {"status": "success", "disks": disks}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/disks/{disk_name}/smart-data")
async def get_disk_smart_data(disk_name: str):
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"http://localhost:8001/smartdata/{disk_name}", timeout=10.0)
            if res.status_code == 200:
                return {"status": "success", "data": res.json().get("smart_data", "")}
            else:
                return {"status": "error", "message": res.text}
    except httpx.RequestError as e:
        return {"status": "error", "message": f"Could not connect to smart-provider service: {e}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/disks/{disk_name}/smart-attributes")
async def get_disk_smart_attributes(disk_name: str):
    """
    Retrieves and parses SMART attributes for a specific disk.
    Caches the results in memory for 30 seconds to prevent hammering the drive.
    """
    now = time.time()
    if disk_name in smart_attributes_cache:
        cached_time, cached_data = smart_attributes_cache[disk_name]
        if now - cached_time < CACHE_DURATION:
            return {"status": "success", "data": cached_data}

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"http://localhost:8001/smartdata/{disk_name}", timeout=10.0)
            if res.status_code == 200:
                smart_data_full = res.json().get("smart_data", "")
                parsed_data = parse_smart_attributes(smart_data_full)
                smart_attributes_cache[disk_name] = (now, parsed_data)
                return {"status": "success", "data": parsed_data}
            else:
                return {"status": "error", "message": res.text}
    except httpx.RequestError as e:
        return {"status": "error", "message": f"Could not connect to smart-provider service: {e}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
