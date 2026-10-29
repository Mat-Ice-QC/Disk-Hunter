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
BRANDING_FILE = f"{DATA_DIR}/branding.json"
APP_SETTINGS_FILE = f"{DATA_DIR}/app_settings.json"
ISO_HISTORY_FILE = f"{DATA_DIR}/iso_history.json"
INVENTORY_IDS_FILE = f"{DATA_DIR}/inventory_ids.json"

def _ensure_json_file(path):
    """Ensure a history file exists as a real file containing '[]'.

    If the path is a directory (Docker creates a directory stub when a
    bind-mounted file does not exist on the host before container start),
    remove it first so the application can open it for writing.
    """
    if os.path.isdir(path):
        os.rmdir(path)
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write("[]")


def _ensure_json_object_file(path):
    """Like _ensure_json_file but initializes with '{}' for object-style
    settings files (branding, app_settings)."""
    if os.path.isdir(path):
        os.rmdir(path)
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write("{}")


def _ensure_regular_file(path):
    """Ensure a path is a regular (empty) file, removing directory stubs."""
    if os.path.isdir(path):
        os.rmdir(path)
    if not os.path.exists(path):
        open(path, "w").close()


def setup_directories():
    # Directory list must match backend/docker-entrypoint.sh so file/perm
    # state is consistent whether the entrypoint ran first or the app
    # started directly (e.g. local dev without Docker).
    _dirs = [
        REPORTS_DIR,
        DRIVES_DIR,
        ISO_DIR,
        f"{DATA_DIR}/shredding/logs/container_logs",
        f"{DATA_DIR}/smartctl/logs/container_logs",
        f"{DATA_DIR}/smartctl/logs/python",
        f"{DATA_DIR}/speedtest/logs/container_logs",
        f"{DATA_DIR}/speedtest/logs/python",
    ]
    for _d in _dirs:
        os.makedirs(_d, exist_ok=True)
        try:
            os.chmod(_d, 0o755)
        except OSError:
            pass
    _ensure_json_file(HISTORY_FILE)
    _ensure_json_file(SMARTCTL_HISTORY_FILE)
    _ensure_json_file(SPEEDTEST_HISTORY_FILE)
    _ensure_json_file(PARTITION_HISTORY_FILE)
    _ensure_json_file(ISO_HISTORY_FILE)
    _ensure_json_object_file(BRANDING_FILE)
    _ensure_json_object_file(APP_SETTINGS_FILE)
    _ensure_json_object_file(INVENTORY_IDS_FILE)
    _ensure_regular_file(LOGO_PATH)
    for _f in (
        HISTORY_FILE,
        SMARTCTL_HISTORY_FILE,
        SPEEDTEST_HISTORY_FILE,
        PARTITION_HISTORY_FILE,
        ISO_HISTORY_FILE,
        BRANDING_FILE,
        APP_SETTINGS_FILE,
        LOGO_PATH,
    ):
        try:
            os.chmod(_f, 0o644)
        except OSError:
            pass
