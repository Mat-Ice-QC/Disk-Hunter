import socket
import os
import json
import glob
import subprocess
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Request

router = APIRouter()

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "Unknown"

def _read_app_settings() -> dict:
    """Read the server-side application settings (temperature config, etc.)."""
    from .config import APP_SETTINGS_FILE
    try:
        if os.path.exists(APP_SETTINGS_FILE):
            with open(APP_SETTINGS_FILE, "r") as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, dict):
                        return data
    except Exception:
        pass
    return {}

def get_thermal_zones() -> list:
    """Enumerate all /sys/class/thermal/thermal_zone* devices with their
    friendly type name and current temperature in degrees Celsius."""
    zones = []
    for zone_path in sorted(glob.glob("/sys/class/thermal/thermal_zone*")):
        zone_id = os.path.basename(zone_path)
        friendly = zone_id
        temp = None
        try:
            with open(os.path.join(zone_path, "type"), "r") as f:
                friendly = f.read().strip() or zone_id
        except Exception:
            pass
        try:
            with open(os.path.join(zone_path, "temp"), "r") as f:
                temp = round(int(f.read().strip()) / 1000.0, 1)
        except Exception:
            pass
        zones.append({"id": zone_id, "name": friendly, "path": zone_path, "temp": temp})
    return zones

def get_temperatures() -> list:
    """Return the list of temperature readings for the devices selected in
    app_settings. Returns an empty list if collection is disabled or no
    devices are configured (falls back to thermal_zone0 for backward
    compatibility when nothing is configured yet)."""
    settings = _read_app_settings()
    if settings.get("collect_temperature", True) is False:
        return []
    selected = settings.get("thermal_devices", [])
    zones = get_thermal_zones()
    if not selected:
        # Backward-compatible default: thermal_zone0 only
        selected = ["thermal_zone0"]
    by_id = {z["id"]: z for z in zones}
    result = []
    for dev_id in selected:
        z = by_id.get(dev_id)
        if z is not None:
            result.append({"id": z["id"], "name": z["name"], "temp": z["temp"]})
    return result

def get_temp():
    """Backward-compatible single temperature reading (first selected device)."""
    temps = get_temperatures()
    if not temps:
        return "N/A"
    first = temps[0]["temp"]
    return first if first is not None else "N/A"

def get_local_time(tz_string="UTC"):
    try:
        return datetime.now(ZoneInfo(tz_string)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M:%S")


def get_client_ip(http_request):
    """Extract the real client IP from a request, respecting X-Real-IP / X-Forwarded-For headers set by nginx."""
    forwarded = http_request.headers.get("X-Real-IP") or http_request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if http_request.client:
        return http_request.client.host
    return "Unknown"

@router.get("/api/system-info")
def system_info():
    temps = get_temperatures()
    return {
        "hostname": socket.gethostname(),
        "ip": get_ip(),
        "temperature": get_temp(),
        "temperatures": temps,
        "temperature_collection": _read_app_settings().get("collect_temperature", True)
    }

@router.get("/api/system/thermal-zones")
def thermal_zones():
    """List every available thermal device on the host with its friendly name
    and current reading. Used by the header temperature page and the settings
    device picker."""
    return {"status": "success", "zones": get_thermal_zones()}

@router.get("/api/system/features")
def system_features():
    return {
        "ENABLE_SHREDDER": os.getenv("ENABLE_SHREDDER", "true").lower() == "true",
        "ENABLE_SPEEDTEST": os.getenv("ENABLE_SPEEDTEST", "true").lower() == "true",
        "ENABLE_ISOWRITER": os.getenv("ENABLE_ISOWRITER", "true").lower() == "true",
        "ENABLE_SMARTCTL": os.getenv("ENABLE_SMARTCTL", "true").lower() == "true",
        "ENABLE_DATA_MANAGEMENT": os.getenv("ENABLE_DATA_MANAGEMENT", "true").lower() == "true",
        "ENABLE_NETWORK_SHARE": os.getenv("ENABLE_NETWORK_SHARE", "true").lower() == "true",
        "ENABLE_DELETE_HISTORY": os.getenv("ENABLE_DELETE_HISTORY", "true").lower() == "true",
    }

@router.post("/api/system/rescan")
def rescan_hardware():
    """Trigger a PCIe bus rescan and SCSI host rescan to detect newly
    hot-plugged drives (NVMe, SAS, SATA) without rebooting the host.

    Runs inside the privileged disk-hunter-api container which has /sys
    and /dev mounted. Does NOT touch any drive data — only triggers the
    kernel to re-enumerate devices on the bus.
    """
    results = []

    # 1. Rescan the entire PCI bus so the kernel re-enumerates any
    #    newly-inserted PCIe devices (NVMe cards, HBA cards, etc.)
    try:
        with open("/sys/bus/pci/rescan", "w") as f:
            f.write("1")
        results.append("PCI bus rescan triggered.")
    except Exception as e:
        results.append(f"PCI rescan failed: {e}")

    # 2. Rescan each SCSI host adapter (for SAS/SATA drives behind an HBA)
    try:
        for host in sorted(glob.glob("/sys/class/scsi_host/host*")):
            host_name = os.path.basename(host)
            scan_path = os.path.join(host, "scan")
            try:
                with open(scan_path, "w") as f:
                    f.write("- - -")
                results.append(f"SCSI host {host_name} rescan triggered.")
            except Exception as e:
                results.append(f"SCSI host {host_name} rescan failed: {e}")
    except Exception as e:
        results.append(f"SCSI host scan failed: {e}")

    # 3. Rescan each existing NVMe controller's namespace
    try:
        for ctrl in sorted(glob.glob("/sys/class/nvme/nvme*")):
            ctrl_name = os.path.basename(ctrl)
            # Trigger a rescan of the NVMe controller
            rescan_path = os.path.join(ctrl, "rescan")
            if os.path.exists(rescan_path):
                try:
                    with open(rescan_path, "w") as f:
                        f.write("1")
                    results.append(f"NVMe controller {ctrl_name} rescan triggered.")
                except Exception:
                    pass
    except Exception as e:
        results.append(f"NVMe rescan failed: {e}")

    # Give the kernel a moment to settle
    import time
    time.sleep(2)

    # 4. Report what's now visible
    try:
        lsblk = subprocess.run(["lsblk", "-d", "-o", "NAME,PATH,SIZE,TYPE,MODEL", "-J"],
                               capture_output=True, text=True, timeout=10)
        disks = json.loads(lsblk.stdout).get("blockdevices", [])
        results.append(f"Detected {len(disks)} block device(s) after rescan.")
    except Exception:
        results.append("Could not enumerate devices after rescan.")

    logging.info(f"Hardware rescan: {'; '.join(results)}")
    return {"status": "success", "results": results}
