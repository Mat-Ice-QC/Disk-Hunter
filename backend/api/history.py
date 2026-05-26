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
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "r") as f:
                content = f.read().strip()
                if content:
                    history = json.loads(content)
                    for entry in history:
                        report_file = entry.get("report_file")
                        if report_file:
                            report_path = os.path.join(REPORTS_DIR, report_file)
                            if os.path.exists(report_path):
                                try:
                                    os.remove(report_path)
                                except Exception as e:
                                    print(f"Failed to delete report {report_file}: {e}")

        with open(HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "Shredding logs and associated reports cleared successfully."}
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
        # Delete associated container and python logs
        from .config import DATA_DIR
        import os
        log_dirs = [f"{DATA_DIR}/smartctl/logs/container_logs", f"{DATA_DIR}/smartctl/logs/python"]
        for l_dir in log_dirs:
            if os.path.exists(l_dir):
                for filename in os.listdir(l_dir):
                    file_path = os.path.join(l_dir, filename)
                    try:
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                    except Exception as e:
                        print(f"Failed to delete log file {file_path}: {e}")

        with open(SMARTCTL_HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "S.M.A.R.T. history and logs cleared successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

from .config import SPEEDTEST_HISTORY_FILE

def append_speedtest_history(entry):
    try:
        history = []
        if os.path.exists(SPEEDTEST_HISTORY_FILE):
            try:
                with open(SPEEDTEST_HISTORY_FILE, "r") as f:
                    content = f.read().strip()
                    if content:
                        history = json.loads(content)
            except Exception:
                history = []
        history.insert(0, entry)
        with open(SPEEDTEST_HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=4)
    except Exception as e:
        print(f"Failed to save speedtest history: {e}")

@router.get("/api/speedtest-history")
def get_speedtest_history():
    try:
        if not os.path.exists(SPEEDTEST_HISTORY_FILE):
            return {"status": "success", "history": []}
        with open(SPEEDTEST_HISTORY_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {"status": "success", "history": []}
            f.seek(0)
            return {"status": "success", "history": json.load(f)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/speedtest-history/clear")
def clear_speedtest_history():
    try:
        # Delete associated container and python logs
        from .config import DATA_DIR
        import os
        log_dirs = [f"{DATA_DIR}/speedtest/logs/container_logs", f"{DATA_DIR}/speedtest/logs/python"]
        for l_dir in log_dirs:
            if os.path.exists(l_dir):
                for filename in os.listdir(l_dir):
                    file_path = os.path.join(l_dir, filename)
                    try:
                        if os.path.isfile(file_path):
                            os.remove(file_path)
                    except Exception as e:
                        print(f"Failed to delete log file {file_path}: {e}")

        with open(SPEEDTEST_HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "Speedtest history and logs cleared successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

ISO_HISTORY_FILE = "/app/data/iso_history.json"

def append_iso_history(entry):
    try:
        history = []
        if os.path.exists(ISO_HISTORY_FILE):
            try:
                with open(ISO_HISTORY_FILE, "r") as f:
                    content = f.read().strip()
                    if content:
                        history = json.loads(content)
            except Exception:
                history = []
        history.insert(0, entry)
        with open(ISO_HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=4)
    except Exception as e:
        print(f"Failed to save iso history: {e}")

@router.get("/api/iso-history")
def get_iso_history():
    try:
        if not os.path.exists(ISO_HISTORY_FILE):
            return {"status": "success", "history": []}
        with open(ISO_HISTORY_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {"status": "success", "history": []}
            f.seek(0)
            return {"status": "success", "history": json.load(f)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/iso-history/clear")
def clear_iso_history():
    try:
        with open(ISO_HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "ISO logs cleared successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


