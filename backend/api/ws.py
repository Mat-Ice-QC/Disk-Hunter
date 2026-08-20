import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

from api.system import system_info
from api.disks import get_disks, smart_attributes_cache, CACHE_DURATION
from api.shredding import wipe_status
from api.speedtest import speedtest_status
from api.smartctl import smart_status
from api.iso import download_tasks, write_tasks

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for d in disconnected:
            self.disconnect(d)

manager = ConnectionManager()
last_broadcast_payload = None

DISK_SCAN_INTERVAL = 5.0  # seconds between lsblk scans
SMART_HEALTH_INTERVAL = 30.0  # seconds between smart_health refreshes

async def broadcast_system_data():
    global last_broadcast_payload
    last_disk_scan = 0.0
    last_smart_scan = 0.0
    cached_disk_data = None
    cached_smart_health = {}

    while True:
        try:
            if manager.active_connections:
                now = time.time()

                # System info: every loop (cheap — socket + file read)
                sys_data = system_info()

                # Disk data: only re-run lsblk every DISK_SCAN_INTERVAL
                if cached_disk_data is None or (now - last_disk_scan) >= DISK_SCAN_INTERVAL:
                    cached_disk_data = await get_disks(exclude_root=False)
                    last_disk_scan = now

                # SMART health: refresh from the in-memory cache every SMART_HEALTH_INTERVAL
                # This reads from smart_attributes_cache (populated by the /api/disks/*/smart-attributes
                # endpoint) so it adds zero subprocess calls — it just re-reads cached data.
                if (now - last_smart_scan) >= SMART_HEALTH_INTERVAL:
                    health_map = {}
                    if cached_disk_data and cached_disk_data.get("disks"):
                        for disk in cached_disk_data["disks"]:
                            disk_name = disk.get("name")
                            if disk_name:
                                cached = smart_attributes_cache.get(disk_name)
                                if cached and (now - cached[0]) < CACHE_DURATION:
                                    health_map[disk_name] = cached[1].get("health", "Unknown")
                    cached_smart_health = health_map
                    last_smart_scan = now

                wipe_data = wipe_status()
                speed_data = speedtest_status()
                smart_data = smart_status()

                payload = {
                    "system_info": sys_data,
                    "disks": cached_disk_data,
                    "smart_health": cached_smart_health,
                    "wipe_status": wipe_data,
                    "speedtest_status": speed_data,
                    "smart_status": smart_data,
                    "iso_download_status": download_tasks,
                    "iso_write_status": write_tasks
                }

                last_broadcast_payload = json.dumps(payload)
                await manager.broadcast(last_broadcast_payload)
        except Exception as e:
            print(f"WebSocket broadcast error: {e}")

        await asyncio.sleep(2)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    if last_broadcast_payload:
        try:
            await websocket.send_text(last_broadcast_payload)
        except Exception:
            manager.disconnect(websocket)
            return

    try:
        while True:
            # We don't expect messages from the client yet, just keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

