import json
import os
import threading
from fastapi import APIRouter
from .config import HISTORY_FILE, SMARTCTL_HISTORY_FILE, REPORTS_DIR, PARTITION_HISTORY_FILE, SPEEDTEST_HISTORY_FILE

router = APIRouter()

_history_lock = threading.Lock()

def _append(path: str, entry, label: str = "history"):
    try:
        with _history_lock:
            history = []
            # Safely try to read the existing file
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        content = f.read().strip()
                        if content:
                            history = json.loads(content)
                except Exception:
                    # If the file is empty or corrupted creat another
                    history = []

            # Insert the new log at the top
            history.insert(0, entry)

            # Atomically overwrite the file: write a temp file then swap it in
            tmp_path = path + ".tmp"
            with open(tmp_path, "w") as f:
                json.dump(history, f, indent=4)
            os.replace(tmp_path, path)
    except Exception as e:
        print(f"Failed to save {label}: {e}")

def append_history(entry):
    _append(HISTORY_FILE, entry, "wipe history")

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
    _append(SMARTCTL_HISTORY_FILE, entry, "smartctl history")

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

def append_speedtest_history(entry):
    _append(SPEEDTEST_HISTORY_FILE, entry, "speedtest history")

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
    _append(ISO_HISTORY_FILE, entry, "iso history")

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

def append_partition_history(entry):
    _append(PARTITION_HISTORY_FILE, entry, "partition history")

@router.get("/api/partition-history")
def get_partition_history():
    try:
        if not os.path.exists(PARTITION_HISTORY_FILE):
            return {"status": "success", "history": []}
        with open(PARTITION_HISTORY_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {"status": "success", "history": []}
            f.seek(0)
            return {"status": "success", "history": json.load(f)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/partition-history/clear")
def clear_partition_history():
    try:
        with open(PARTITION_HISTORY_FILE, "w") as f:
            json.dump([], f)
        return {"status": "success", "message": "Partition logs cleared successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


