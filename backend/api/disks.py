from fastapi import APIRouter
import subprocess
import json
import re
import httpx
import time
from .drive_info import resolve_physical_disk, get_drive_info, get_form_factor

smart_attributes_cache = {}  # maps disk_name -> (timestamp, parsed_data)
CACHE_DURATION = 30.0  # seconds

router = APIRouter()

def _smart_int(value: str) -> int | None:
    """Extracts the leading integer from a raw smart value like '0x00', '100%' or '1,234 [632 GB]'."""
    parts = value.split()
    if not parts:
        return None
    token = parts[0].replace(",", "").rstrip("%")
    try:
        return int(token, 16) if token.lower().startswith("0x") else int(token)
    except ValueError:
        return None

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
    if health_match:
        attributes['health'] = health_match.group(1).strip()
    else:
        # SAS/SCSI drives report health on a different line
        scsi_health_match = re.search(r"SMART Health Status:\s+(.+)", output)
        attributes['health'] = scsi_health_match.group(1).strip() if scsi_health_match else "Unknown"

    reallocated_match = re.search(r"Reallocated_Sector_Ct[^\n]*\s(\d+)[ \t]*$", output, re.MULTILINE)
    attributes['reallocated_sectors'] = int(reallocated_match.group(1)) if reallocated_match else 0

    pending_match = re.search(r"Current_Pending_Sector[^\n]*\s(\d+)[ \t]*$", output, re.MULTILINE)
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

    # NVMe SMART/Health Information block (NVMe Log 0x02)
    nvme_section = False
    nvme_entries = []
    for line in output.splitlines():
        if line.startswith("SMART/Health Information"):
            nvme_section = True
            continue
        if not nvme_section:
            continue
        entry_match = re.match(r"^([^:]+):\s*(\S.*)$", line)
        if not entry_match:
            nvme_section = False
            continue
        nvme_entries.append((entry_match.group(1).strip(), entry_match.group(2).strip()))

    if nvme_entries:
        spare_threshold = None
        for entry_name, entry_raw in nvme_entries:
            if entry_name == "Available Spare Threshold":
                spare_threshold = _smart_int(entry_raw)

        for idx, (entry_name, entry_raw) in enumerate(nvme_entries, start=1):
            entry_num = _smart_int(entry_raw)
            status = "OK"
            if entry_name.startswith("Critical Warning") and entry_num is not None and entry_num != 0:
                status = "FAIL"
            elif entry_name == "Media and Data Integrity Errors" and entry_num is not None and entry_num > 0:
                status = "WARN"
            elif entry_name == "Available Spare" and spare_threshold is not None and entry_num is not None and entry_num < spare_threshold:
                status = "FAIL"
            elif entry_name == "Percentage Used" and entry_num is not None and entry_num >= 90:
                status = "WARN"

            attributes['attributes'].append({
                "id": idx,
                "name": entry_name,
                "flag": "-",
                "value": entry_raw,
                "worst": "-",
                "thresh": "-",
                "type": "-",
                "updated": "-",
                "when_failed": "-",
                "raw_value": entry_raw,
                "status": status
            })
    return attributes

def validate_drive_path(drive_path: str) -> tuple[bool, str]:
    """Validates that a drive path is safe for destructive operations.

    Performs three checks:
    1. Path matches /dev/<name> with safe characters only (regex).
    2. Drive exists in the live lsblk inventory.
    3. Drive is not the root/OS disk.

    Returns (True, "") if valid, or (False, error_message) if invalid.
    """
    if not re.match(r"^/dev/[a-zA-Z0-9_-]+$", drive_path):
        return (False, f"Invalid device path format: {drive_path}")

    try:
        lsblk_res = subprocess.run(
            ["lsblk", "-n", "-o", "NAME"],
            capture_output=True, text=True
        )
        if lsblk_res.returncode == 0 and lsblk_res.stdout.strip():
            valid_names = set(lsblk_res.stdout.strip().split('\n'))
            drive_name = drive_path.split('/')[-1]
            if drive_name not in valid_names:
                return (False, f"Drive {drive_path} not found in system inventory")
    except Exception:
        pass

    root_disk = get_root_disk()
    target_disk = resolve_physical_disk(drive_path)
    if root_disk and target_disk and root_disk == target_disk:
        return (False, f"Cannot operate on root/OS disk {root_disk}")

    return (True, "")

def get_root_disk() -> str | None:
    """Return the physical disk path (e.g. /dev/sda) that hosts the Disk
    Hunter data directory, or None if it cannot be determined.
    """
    try:
        for probe in ("/app/data", "/etc/resolv.conf"):
            df_res = subprocess.run(["df", probe, "--output=source"], capture_output=True, text=True)
            lines = df_res.stdout.strip().split('\n')
            if len(lines) > 1:
                dev_path = lines[1].strip()
                if dev_path and dev_path != "overlay":
                    resolved = resolve_physical_disk(dev_path)
                    if resolved and resolved != "overlay":
                        return resolved
    except Exception:
        pass
    return None

def get_blkid_pttype(disk_path: str) -> str:
    """Returns the partition table type reported by blkid, or empty on error."""
    try:
        res = subprocess.run(
            ["blkid", "-p", "-o", "value", "-s", "PTTYPE", disk_path],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return ""

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
            root_drive = get_root_disk()
        except Exception:
            pass

        # Tag each disk indicating if it is the primary host OS root disk
        for d in disks:
            if root_drive and d.get('path') == root_drive:
                d['is_root'] = True
            else:
                d['is_root'] = False

            # Fill serial/model/tran from udev/sysfs and pttype from blkid when lsblk gave nothing
            disk_path = d.get('path') or f"/dev/{d.get('name', '')}"
            if not d.get('serial') or not d.get('model') or not d.get('tran'):
                info = get_drive_info(disk_path)
                if not d.get('serial') and info.get('serial'):
                    d['serial'] = info['serial']
                if not d.get('model') and info.get('model'):
                    d['model'] = info['model']
                if not d.get('tran') and info.get('tran'):
                    d['tran'] = info['tran']
            if not d.get('pttype'):
                pttype = get_blkid_pttype(disk_path)
                if pttype:
                    d['pttype'] = pttype
            d['form_factor'] = get_form_factor(d.get('model') or '', d.get('tran') or '')

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
