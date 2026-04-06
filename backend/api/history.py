import json
import os
from fastapi import APIRouter
from .config import HISTORY_FILE, SMARTCTL_HISTORY_FILE

router = APIRouter()

def append_history(entry):
    try:
        history = []
        # Safely try to read the existing file
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, "r") as f:
                    content = f.read().strip()
                    if content:
                        history = json.loads(content)
            except Exception:
                # If the file is empty or corrupted creat another
                history = []
                
        # Insert the new log at the top
        history.insert(0, entry)
        
        # Safely overwrite the file with the new array
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=4)
    except Exception as e:
        print(f"Failed to save wipe history: {e}")

@router.get("/api/history")
def get_history():
    try:
        if not os.path.exists(HISTORY_FILE):
            return {"status": "success", "history": []}
            
        with open(HISTORY_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {"status": "success", "history": []}
            f.seek(0)
            return {"status": "success", "history": json.load(f)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/history/clear")
def clear_history():
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "Shredding logs cleared successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def append_smartctl_history(entry):
    try:
        history = []
        if os.path.exists(SMARTCTL_HISTORY_FILE):
            try:
                with open(SMARTCTL_HISTORY_FILE, "r") as f:
                    content = f.read().strip()
                    if content:
                        history = json.loads(content)
            except Exception:
                history = []
        history.insert(0, entry)
        with open(SMARTCTL_HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=4)
    except Exception as e:
        print(f"Failed to save smartctl history: {e}")

@router.get("/api/smart-history")
def get_smart_history():
    try:
        if not os.path.exists(SMARTCTL_HISTORY_FILE):
            return {"status": "success", "history": []}
        with open(SMARTCTL_HISTORY_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {"status": "success", "history": []}
            f.seek(0)
            return {"status": "success", "history": json.load(f)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/smart-history/clear")
def clear_smart_history():
    try:
        with open(SMARTCTL_HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "S.M.A.R.T. logs cleared successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
