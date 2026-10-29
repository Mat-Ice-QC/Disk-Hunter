import os
import json
import re
import threading
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .config import INVENTORY_IDS_FILE

router = APIRouter()
_inventory_lock = threading.Lock()


def _ensure_file():
    if os.path.isdir(INVENTORY_IDS_FILE):
        os.rmdir(INVENTORY_IDS_FILE)
    if not os.path.exists(INVENTORY_IDS_FILE):
        with open(INVENTORY_IDS_FILE, "w") as f:
            json.dump({}, f)


def _read_inventory() -> dict:
    _ensure_file()
    try:
        with open(INVENTORY_IDS_FILE, "r") as f:
            content = f.read().strip()
            if content:
                data = json.loads(content)
                if isinstance(data, dict):
                    return data
    except Exception:
        pass
    return {}


def _write_inventory(data: dict) -> bool:
    _ensure_file()
    try:
        tmp_path = INVENTORY_IDS_FILE + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(data, f, indent=4)
        os.replace(tmp_path, INVENTORY_IDS_FILE)
        return True
    except Exception as e:
        print(f"Failed to write inventory ids: {e}")
        return False


def normalize_serial(serial: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_.-]', '_', str(serial))


def get_inventory_id(serial: str) -> str | None:
    if not serial:
        return None
    data = _read_inventory()
    return data.get(normalize_serial(serial))


def set_inventory_id(serial: str, inventory_id: str) -> bool:
    if not serial:
        return False
    with _inventory_lock:
        data = _read_inventory()
        data[normalize_serial(serial)] = inventory_id.strip()
        return _write_inventory(data)


def list_inventory_ids() -> dict:
    return _read_inventory()


class InventoryRequest(BaseModel):
    serial: str
    inventory_id: str


@router.get("/api/inventory")
def read_inventory(serial: str = ""):
    if not serial:
        return {"status": "success", "inventory": list_inventory_ids()}
    inv_id = get_inventory_id(serial)
    return {"status": "success", "serial": serial, "inventory_id": inv_id}


@router.post("/api/inventory")
def save_inventory(req: InventoryRequest):
    if not req.serial:
        raise HTTPException(status_code=400, detail="serial is required")
    if set_inventory_id(req.serial, req.inventory_id):
        return {"status": "success", "message": "Inventory ID saved"}
    return {"status": "error", "message": "Failed to save inventory ID"}


@router.delete("/api/inventory")
def remove_inventory(serial: str = ""):
    if not serial:
        raise HTTPException(status_code=400, detail="serial is required")
    with _inventory_lock:
        data = _read_inventory()
        key = normalize_serial(serial)
        if key not in data:
            return {"status": "error", "message": "Mapping not found"}
        del data[key]
        if _write_inventory(data):
            return {"status": "success", "message": "Inventory ID mapping removed"}
    return {"status": "error", "message": "Failed to remove inventory ID"}
