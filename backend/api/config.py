import os

# --- Setup Persistent Directories ---
DATA_DIR = "/app/data"
REPORTS_DIR = f"{DATA_DIR}/reports"
HISTORY_FILE = f"{DATA_DIR}/wipe_history.json"
SMARTCTL_HISTORY_FILE = f"{DATA_DIR}/smartctl_history.json"
IMAGES_DIR = f"{DATA_DIR}/images"
DRIVES_DIR = f"{IMAGES_DIR}/drives"
LOGO_PATH = f"{IMAGES_DIR}/logo.png"

def setup_directories():
    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(DRIVES_DIR, exist_ok=True)
    if not os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "w") as f:
            f.write("[]")
    if not os.path.exists(SMARTCTL_HISTORY_FILE):
        with open(SMARTCTL_HISTORY_FILE, "w") as f:
            f.write("[]")
