import os

# --- Setup Persistent Directories ---
DATA_DIR = "/app/data"
REPORTS_DIR = f"{DATA_DIR}/reports"
HISTORY_FILE = f"{DATA_DIR}/wipe_history.json"
SMARTCTL_HISTORY_FILE = f"{DATA_DIR}/smartctl_history.json"
SPEEDTEST_HISTORY_FILE = f"{DATA_DIR}/speedtest_history.json"
PARTITION_HISTORY_FILE = f"{DATA_DIR}/partition_history.json"
IMAGES_DIR = f"{DATA_DIR}/images"
DRIVES_DIR = f"{IMAGES_DIR}/drives"
LOGO_PATH = f"{IMAGES_DIR}/logo.png"
ISO_DIR = f"{DATA_DIR}/isos"

def setup_directories():
    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(DRIVES_DIR, exist_ok=True)
    os.makedirs(ISO_DIR, exist_ok=True)
    if not os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "w") as f:
            f.write("[]")
    if not os.path.exists(SMARTCTL_HISTORY_FILE):
        with open(SMARTCTL_HISTORY_FILE, "w") as f:
            f.write("[]")
    if not os.path.exists(SPEEDTEST_HISTORY_FILE):
        with open(SPEEDTEST_HISTORY_FILE, "w") as f:
            f.write("[]")
    if not os.path.exists(PARTITION_HISTORY_FILE):
        with open(PARTITION_HISTORY_FILE, "w") as f:
            f.write("[]")
