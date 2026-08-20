import socket
import os
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

def get_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return round(int(f.read().strip()) / 1000.0, 1)
    except Exception:
        return "N/A"

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
    return {"hostname": socket.gethostname(), "ip": get_ip(), "temperature": get_temp()}

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
