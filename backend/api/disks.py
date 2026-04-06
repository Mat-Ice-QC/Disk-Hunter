from fastapi import APIRouter
import subprocess
import json
import re
import httpx

router = APIRouter()

def parse_smart_attributes(output):
    """Parses smartctl -a output for specific attributes."""
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

@router.get("/api/disks")
async def get_disks(exclude_root: bool = False):
    try:
        cmd = ["lsblk", "-b", "-J", "-o", "NAME,PATH,SIZE,TYPE,FSTYPE,PTTYPE,TRAN,MODEL,SERIAL,MOUNTPOINT,LABEL,PARTTYPENAME,FSVER,VENDOR"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        disks = [d for d in data.get('blockdevices', []) if d.get('type') == 'disk' and not d.get('name', '').startswith('loop') and d.get('size', 0) > 0]
        
        if exclude_root:
            root_drive = None
            try:
                # Find device for /app/data which is mounted from host
                df_res = subprocess.run(["df", "/app/data", "--output=source"], capture_output=True, text=True)
                lines = df_res.stdout.strip().split('\n')
                if len(lines) > 1:
                    dev_path = lines[1].strip()
                    # Strip partition numbers
                    match = re.match(r"(/dev/[a-zA-Z0-9]+?)(p\d+|\d+)$", dev_path)
                    if match:
                        root_drive = match.group(1)
                    elif dev_path.startswith("/dev/"):
                        root_drive = dev_path
                
                # Also try /etc/resolv.conf as fallback
                if not root_drive or root_drive == "overlay":
                    df_res = subprocess.run(["df", "/etc/resolv.conf", "--output=source"], capture_output=True, text=True)
                    lines = df_res.stdout.strip().split('\n')
                    if len(lines) > 1:
                        dev_path = lines[1].strip()
                        match = re.match(r"(/dev/[a-zA-Z0-9]+?)(p\d+|\d+)$", dev_path)
                        if match:
                            root_drive = match.group(1)
                        elif dev_path.startswith("/dev/"):
                            root_drive = dev_path

            except Exception:
                pass
            
            if root_drive:
                # Sometimes df returns something like /dev/root, in which case we might not match accurately
                # So also check for partitions with mountpoints inside the lsblk output
                pass

            # Filter out the root drive by path
            if root_drive and root_drive != "overlay":
                disks = [d for d in disks if d.get('path') != root_drive]
            
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
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"http://localhost:8001/smartdata/{disk_name}", timeout=10.0)
            if res.status_code == 200:
                smart_data_full = res.json().get("smart_data", "")
                parsed_data = parse_smart_attributes(smart_data_full)
                return {"status": "success", "data": parsed_data}
            else:
                return {"status": "error", "message": res.text}
    except httpx.RequestError as e:
        return {"status": "error", "message": f"Could not connect to smart-provider service: {e}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
