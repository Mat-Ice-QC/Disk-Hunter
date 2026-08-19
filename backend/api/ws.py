import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

from api.system import system_info
from api.disks import get_disks
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

async def broadcast_system_data():
    global last_broadcast_payload
    while True:
        try:
            if manager.active_connections:
                # Gather data
                sys_data = system_info()
                
                # disks is an async function
                disk_data = await get_disks(exclude_root=False) 
                
                wipe_data = wipe_status()
                speed_data = speedtest_status()
                smart_data = smart_status()
                
                payload = {
                    "system_info": sys_data,
                    "disks": disk_data,
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

