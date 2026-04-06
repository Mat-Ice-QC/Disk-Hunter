import socket
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter

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

def get_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return round(int(f.read().strip()) / 1000.0, 1)
    except Exception:
        return "N/A"

def get_local_time(tz_string="UTC"):
    try:
        # Attempts to format the time using the requested timezone
        return datetime.now(ZoneInfo(tz_string)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        # Fallback to UTC if the string is invalid
        return datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M:%S")

@router.get("/api/system-info")
def system_info():
    return {"hostname": socket.gethostname(), "ip": get_ip(), "temperature": get_temp()}
