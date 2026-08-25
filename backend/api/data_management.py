import os
import shutil
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

@router.get("/api/data-management/list")
def list_directory(path: str = Query("")):
    try:
        target_dir = get_safe_path(DATA_DIR, path)
        
        if not os.path.exists(target_dir):
            return {"status": "error", "message": "Directory not found"}
            
        if not os.path.isdir(target_dir):
            return {"status": "error", "message": "Path is not a directory"}

        files = []
        for item in os.listdir(target_dir):
            item_path = os.path.join(target_dir, item)
            is_dir = os.path.isdir(item_path)
            size = os.path.getsize(item_path) if not is_dir else 0
            
            # Create a relative path to send back to the client
            rel_path = os.path.relpath(item_path, DATA_DIR)
            
            files.append({
                "name": item,
                "is_dir": is_dir,
                "size": size,
                "path": rel_path.replace("\\", "/") # Ensure forward slashes for URLs
            })
            
        return {"status": "success", "files": files}
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