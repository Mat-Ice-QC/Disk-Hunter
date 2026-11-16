import socket
import os
import asyncio
import shutil
import json
import glob
import subprocess
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel

from .docker_manager import run_container
from .disks import get_busy_disks

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
    devices are configured (falls back to the first available thermal zone
    for backward compatibility when nothing is configured yet)."""
    settings = _read_app_settings()
    if settings.get("collect_temperature", True) is False:
        return []
    selected = settings.get("thermal_devices", [])
    zones = get_thermal_zones()
    if not selected:
        # Backward-compatible default: first available thermal zone only
        if zones:
            selected = [zones[0]["id"]]
        else:
            return []
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

class SystemTimeRequest(BaseModel):
    datetime: str  # ISO-8601 like 2026-10-21T14:30:00


def _query_ntp_status() -> str:
    """Best-effort NTP status. The API container has no systemd, so
    timedatectl usually fails and we report 'unknown' rather than guess."""
    try:
        res = subprocess.run(["timedatectl", "show", "--property=NTP", "--property=NTPSynchronized"],
                             capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            out = res.stdout
            if "NTP=yes" in out:
                return "active (synchronized)" if "NTPSynchronized=yes" in out else "active (not yet synchronized)"
            if "NTP=no" in out:
                return "disabled"
    except Exception:
        pass
    return "unknown"


@router.get("/api/system/time")
def get_system_time():
    """Return the current system time in several formats and NTP status."""
    now = datetime.now()
    return {
        "status": "success",
        "iso": now.isoformat(),
        "local": now.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": str(now.astimezone().tzinfo) if now.astimezone().tzinfo else "UTC",
        "ntp_status": _query_ntp_status(),
    }


def _sync_hwclock() -> bool:
    """Best-effort copy of the system clock to the hardware RTC. The API image
    ships hwclock outside the service PATH (/usr/sbin), and a missing binary
    must never fail an operation whose clock change already succeeded."""
    for candidate in (shutil.which("hwclock"), "/sbin/hwclock", "/usr/sbin/hwclock"):
        if candidate and os.path.exists(candidate):
            try:
                subprocess.run([candidate, "--systohc"], capture_output=True, text=True, timeout=10)
                return True
            except Exception:
                return False
    return False


@router.post("/api/system/time")
def set_system_time(req: SystemTimeRequest):
    """Manually set the system clock and hardware clock. Requires privileged container."""
    try:
        target = req.datetime
        # Accept ISO-8601 with T or space separator
        target = target.replace("T", " ")
        if len(target) > 19:
            target = target[:19]
        subprocess.run(["date", "-s", target], capture_output=True, text=True, check=True, timeout=10)
        rtc = _sync_hwclock()
        note = "" if rtc else " (RTC sync skipped: hwclock unavailable)"
        return {"status": "success", "message": f"System time set to {target}{note}"}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": f"Failed to set time: {e.stderr or e.stdout or 'unknown error'}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/system/time/ntp-sync")
def sync_ntp():
    """Trigger an NTP sync using ntpdate. Requires privileged container."""
    servers = ["pool.ntp.org", "time.google.com", "time.cloudflare.com"]
    last_error = ""
    for server in servers:
        try:
            res = subprocess.run(["ntpdate", "-u", "-s", server], capture_output=True, text=True, timeout=30)
            if res.returncode == 0:
                rtc = _sync_hwclock()
                note = "" if rtc else " (RTC sync skipped: hwclock unavailable)"
                return {"status": "success", "message": f"NTP sync completed with {server}{note}"}
            last_error = res.stderr.strip() or res.stdout.strip() or f"{server} returned {res.returncode}"
        except Exception as e:
            last_error = str(e)
    return {"status": "error", "message": f"NTP sync failed: {last_error}"}


class PowerActionRequest(BaseModel):
    action: str  # "shutdown" or "reboot"


def power_actions_enabled() -> bool:
    """POWER_ACTIONS_ENABLED gates the dashboard host power buttons. Default on."""
    return os.getenv("POWER_ACTIONS_ENABLED", "true").lower() == "true"


def _power_image_available() -> bool:
    """True when the disk-hunter-power worker image has been built."""
    try:
        res = subprocess.run(["docker", "image", "inspect", "disk-hunter-power"],
                             capture_output=True, text=True, timeout=10)
        return res.returncode == 0
    except Exception:
        return False


async def _execute_power_action(action: str, initiated_by: str):
    """Background task: notify every connected client over WebSocket, then
    start the privileged --pid=host power worker that asks the host's
    systemd to power off / reboot the machine. Runs after the HTTP response
    has been sent; the sleeps let the response and the broadcast land
    before the host starts going down."""
    await asyncio.sleep(1.5)
    try:
        # Lazy import: api.ws imports this module at load time.
        from .ws import manager
        await manager.broadcast(json.dumps({"power_action": {
            "action": action,
            "initiated_by": initiated_by,
            "timestamp": get_local_time(),
        }}))
    except Exception as e:
        print(f"Power action broadcast failed: {e}")
    await asyncio.sleep(1.5)
    debug = []
    ok = run_container(
        name="disk_hunter_power",
        image="disk-hunter-power",
        args=[action],
        privileged=True,
        pid_host=True,
        debug_list=debug,
    )
    if not ok:
        print(f"Power worker failed to start: {' | '.join(debug)}")
        try:
            from .ws import manager
            await manager.broadcast(json.dumps({"power_action": {
                "action": action,
                "initiated_by": initiated_by,
                "error": "Power worker container failed to start (see API logs).",
            }}))
        except Exception:
            pass


@router.post("/api/system/power")
async def request_power_action(req: PowerActionRequest, background_tasks: BackgroundTasks, http_request: Request):
    """Power off or reboot the HOST machine (not a container). Gated by
    POWER_ACTIONS_ENABLED and refused while disk operations are running so a
    wipe is never interrupted. The work itself is done by the ephemeral
    disk-hunter-power worker container (privileged, --pid=host) which asks
    the host's systemd for a graceful poweroff/reboot."""
    action = (req.action or "").strip().lower()
    if action not in ("shutdown", "reboot"):
        return {"status": "error",
                "message": "Invalid action. Use 'shutdown' or 'reboot'."}
    if not power_actions_enabled():
        return {"status": "error",
                "message": "Host power actions are disabled (POWER_ACTIONS_ENABLED != 'true')."}
    busy = get_busy_disks()
    if busy:
        return {"status": "busy",
                "busy_disks": busy,
                "message": "Power action refused: operations are running on " + ", ".join(busy) + "."}
    if not _power_image_available():
        return {"status": "error",
                "message": "Power worker image is not built. Run: docker compose build disk-hunter-power"}
    background_tasks.add_task(_execute_power_action, action, get_client_ip(http_request))
    return {"status": "initiated", "action": action,
            "message": f"Host {action} initiated. The machine will go down shortly."}


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
        "POWER_ACTIONS_ENABLED": power_actions_enabled(),
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

@router.get("/api/system/root-usage")
def root_usage():
    """Return the storage usage of the root filesystem (/) so the UI can
    show a used/total indicator for the root disk."""
    try:
        usage = shutil.disk_usage("/")
        total = usage.total
        free = usage.free
        used = total - free
        percent = round((used / total) * 100.0, 1) if total > 0 else 0.0
        return {
            "status": "success",
            "used_bytes": used,
            "total_bytes": total,
            "free_bytes": free,
            "percent_used": percent,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
