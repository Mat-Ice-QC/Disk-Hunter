import os
import shutil
import threading
import time
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from .config import DATA_DIR

router = APIRouter()

def get_safe_path(base_dir: str, requested_path: str) -> str:
    base_real = os.path.realpath(base_dir)
    if os.path.isabs(requested_path) or ".." in requested_path.replace("\\", "/").split("/"):
        raise HTTPException(status_code=403, detail="Access denied")
    safe_path = os.path.realpath(os.path.join(base_real, requested_path))
    if safe_path != base_real and not safe_path.startswith(base_real + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")
    return safe_path

def get_dir_size(path: str) -> int:
    """Recursively compute the total size of a directory (best effort).

    Unreadable subdirectories are skipped so read-only or permission-limited
    mounts never cause the listing to fail."""
    total = 0
    try:
        for root, dirs, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(root, name))
                except OSError:
                    pass
    except OSError:
        pass
    return total

# --- On-demand directory size cache ---
# Directory listings no longer walk whole subtrees: totals are computed per
# directory on request (file browser expands them lazily) and memoized for a
# short TTL so repeated listings of the same folder stay instant. Entries are
# keyed by the directory's own mtime, so creating/removing direct children
# invalidates immediately; deeper changes are bounded by the TTL.
DIR_SIZE_TTL_SECONDS = 60.0
_dir_size_cache: dict = {}  # realpath -> (dir_mtime_ns, computed_at, size)
_dir_size_lock = threading.Lock()

def get_cached_dir_size(path: str) -> int:
    try:
        mtime_ns = os.stat(path).st_mtime_ns
    except OSError:
        return 0
    now = time.monotonic()
    with _dir_size_lock:
        entry = _dir_size_cache.get(path)
        if entry and entry[0] == mtime_ns and (now - entry[1]) < DIR_SIZE_TTL_SECONDS:
            return entry[2]
    size = get_dir_size(path)
    with _dir_size_lock:
        # Bound the cache so long browsing sessions cannot grow it forever
        if len(_dir_size_cache) > 512:
            _dir_size_cache.clear()
        _dir_size_cache[path] = (mtime_ns, now, size)
    return size

@router.get("/api/data-management/mounts")
def list_mounts():
    """Informational: list mounted filesystems from /proc/mounts and mark
    read-only mounts. Mounted filesystems may be attached read-only (common
    on this appliance); this endpoint lets the UI inform the user which
    paths cannot be written."""
    mounts = []
    try:
        with open("/proc/mounts", "r") as f:
            for line in f:
                parts = line.split()
                if len(parts) < 4:
                    continue
                device, mount_point, fs_type, options = parts[0], parts[1], parts[2], parts[3]
                if mount_point.startswith("/snap"):
                    continue
                opts = options.split(",")
                mounts.append({
                    "device": device,
                    "mount_point": mount_point,
                    "fs_type": fs_type,
                    "read_only": "ro" in opts,
                })
    except Exception as e:
        return {"status": "error", "message": str(e)}
    return {"status": "success", "mounts": mounts}

@router.get("/api/data-management/list")
def list_directory(path: str = Query("")):
    """Fast directory listing.

    Directories are returned with total_size=None: recursive totals are
    expensive on large trees, so they are fetched on demand through
    /api/data-management/dir-size (cached server-side with a short TTL).
    Files still carry their exact size."""
    try:
        target_dir = get_safe_path(DATA_DIR, path)
        
        if not os.path.exists(target_dir):
            return {"status": "error", "message": "Directory not found"}
            
        if not os.path.isdir(target_dir):
            return {"status": "error", "message": "Path is not a directory"}

        try:
            items = os.listdir(target_dir)
        except OSError as e:
            # Graceful handling for read-only or permission-limited mounts
            return {"status": "error", "message": f"Cannot read directory: {e}"}

        files = []
        for item in items:
            try:
                item_path = os.path.join(target_dir, item)
                is_dir = os.path.isdir(item_path)
                size = os.path.getsize(item_path) if not is_dir else 0
                total_size = None if is_dir else size
            except OSError:
                continue

            # Create a relative path to send back to the client
            rel_path = os.path.relpath(item_path, DATA_DIR)
            
            files.append({
                "name": item,
                "is_dir": is_dir,
                "size": size,
                "total_size": total_size,
                "path": rel_path.replace("\\", "/") # Ensure forward slashes for URLs
            })
            
        return {"status": "success", "files": files}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/data-management/dir-size")
def directory_size(path: str = Query(...)):
    """Recursive total size of one directory, computed on demand and cached
    briefly (see get_cached_dir_size) so the file browser can fill sizes in
    without blocking the listing."""
    try:
        target_dir = get_safe_path(DATA_DIR, path)
        if not os.path.isdir(target_dir):
            return {"status": "error", "message": "Path is not a directory"}
        return {"status": "success", "path": path, "total_size": get_cached_dir_size(target_dir)}
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/data-management/download")
def download_file(path: str = Query(...)):
    try:
        target_file = get_safe_path(DATA_DIR, path)
        if not os.path.exists(target_file):
            raise HTTPException(status_code=404, detail="File not found")
        if os.path.isdir(target_file):
            raise HTTPException(status_code=400, detail="Cannot download a directory")
            
        return FileResponse(target_file, filename=os.path.basename(target_file))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/data-management/delete")
def delete_item(path: str = Query(...)):
    try:
        target_path = get_safe_path(DATA_DIR, path)
        if not os.path.exists(target_path):
            return {"status": "error", "message": "Item not found"}
            
        if os.path.isdir(target_path):
            shutil.rmtree(target_path)
        else:
            os.unlink(target_path)
            
        return {"status": "success", "message": "Item deleted successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
