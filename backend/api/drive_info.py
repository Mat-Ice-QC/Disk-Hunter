import os
import re
import subprocess

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

def _normalize_dev_path(drive: str) -> str:
    """Accepts /dev/sda, sda, /dev/nvme0n1p2 etc. and returns a /dev/ path."""
    drive = (drive or "").strip()
    if not drive:
        return ""
    if not drive.startswith("/dev/"):
        drive = "/dev/" + drive.split("/")[-1]
    return drive

def _lsblk_field(disk_path: str, field: str) -> str:
    """Returns a single lsblk field (-d -n) of a physical disk, or empty."""
    try:
        res = subprocess.run(
            ["lsblk", "-d", "-n", "-o", field, disk_path],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return ""

def _udev_property(disk_path: str, key: str) -> str:
    """Returns a udev property value of a device, or empty."""
    try:
        res = subprocess.run(
            ["udevadm", "info", "--query=property", "--name=" + disk_path],
            capture_output=True, text=True, timeout=5
        )
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if line.startswith(key + "="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

def _sysfs_read(name: str, rel_path: str) -> str:
    """Reads a file under /sys/block/<name>/, or empty."""
    try:
        with open(f"/sys/block/{name}/{rel_path}", "r", encoding="utf-8", errors="ignore") as fh:
            return fh.read().strip()
    except Exception:
        pass
    return ""

def get_form_factor(model: str, tran: str) -> str:
    """Returns U.2/U.3 for enterprise KIOXIA KCD NVMe drives, else empty."""
    # Model-prefix heuristic only: sysfs does not expose the form factor
    if (tran or "").lower() == "nvme" and (model or "").upper().startswith("KIOXIA KCD"):
        return "U.2/U.3"
    return ""

def get_drive_info(drive: str) -> dict:
    """
    Collects serial, model, tran and form_factor of the physical disk
    behind a drive from lsblk, udev and sysfs. Never raises; missing
    values are empty strings.
    """
    result = {"serial": "", "model": "", "tran": "", "form_factor": ""}
    try:
        disk_path = _normalize_dev_path(drive)
        physical = resolve_physical_disk(disk_path)
        if not physical:
            return result
        name = physical.split("/")[-1]

        serial = _lsblk_field(physical, "SERIAL") \
            or _udev_property(physical, "ID_SERIAL_SHORT") \
            or _sysfs_read(name, "device/serial") \
            or _sysfs_read(name, "serial")

        model = _lsblk_field(physical, "MODEL") \
            or _udev_property(physical, "ID_MODEL").replace("_", " ") \
            or _sysfs_read(name, "device/model") \
            or _sysfs_read(name, "model")

        tran = _lsblk_field(physical, "TRAN") \
            or _udev_property(physical, "ID_BUS")

        result["serial"] = serial
        result["model"] = model
        result["tran"] = tran
        result["form_factor"] = get_form_factor(model, tran)
    except Exception:
        pass
    return result

def get_drive_serial(drive: str, default: str = "UNKNOWN") -> str:
    """Returns the serial of the physical disk behind a drive, or default."""
    return get_drive_info(drive).get("serial") or default
