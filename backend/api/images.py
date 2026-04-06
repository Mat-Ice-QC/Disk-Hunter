import os
import shutil
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
from .config import DRIVES_DIR, LOGO_PATH

router = APIRouter()
# this portion is broken as hell i nee to redo it :()
@router.get("/api/images/drives/{filename}")
def get_drive_image(filename: str):
    # Remove .jpg extension for processing
    requested_base = filename.rsplit('.', 1)[0]
    
    # Get all available image basenames from the directory
    try:
        available_images = [f.rsplit('.', 1)[0] for f in os.listdir(DRIVES_DIR) if f.endswith('.jpg')]
    except FileNotFoundError:
        # If the directory doesn't exist yet, no images can be found.
        raise HTTPException(status_code=404, detail="Image directory not found or empty.")

    # 1. Try for an exact match first
    exact_file_path = os.path.join(DRIVES_DIR, f"{requested_base}.jpg")
    if os.path.exists(exact_file_path):
        return FileResponse(exact_file_path)

    best_general_match_name = None
    
    # 2. Find the longest available image name that is a substring of the requested name
    # (e.g., 'kingston_sa400s3' for 'ata_kingston_sa400s3')
    for img_base in available_images:
        if img_base in requested_base and img_base != requested_base: # Exclude exact match, already handled
            if best_general_match_name is None or len(img_base) > len(best_general_match_name):
                best_general_match_name = img_base
    
    if best_general_match_name:
        file_path = os.path.join(DRIVES_DIR, f"{best_general_match_name}.jpg")
        if os.path.exists(file_path): # Double-check existence
            return FileResponse(file_path)

    best_specific_match_name = None
    
    # 3. Find the shortest available image name that contains the requested name as a substring
    # (e.g., 'verbatim_store_n_go_drive' for 'verbatim_store_n_go')
    for img_base in available_images:
        if requested_base in img_base and img_base != requested_base: # Exclude exact match, already handled
            # We want the shortest 'img_base' that contains 'requested_base'
            if best_specific_match_name is None or len(img_base) < len(best_specific_match_name):
                best_specific_match_name = img_base
    
    if best_specific_match_name:
        file_path = os.path.join(DRIVES_DIR, f"{best_specific_match_name}.jpg")
        if os.path.exists(file_path): # Final double-check
            return FileResponse(file_path)

    # If no image is found after all attempts
    raise HTTPException(status_code=404, detail=f"No matching image found for {requested_base}.")


@router.get("/api/images/logo.png")
def get_logo_image():
    if os.path.exists(LOGO_PATH):
        return FileResponse(LOGO_PATH)
    raise HTTPException(status_code=404, detail="Logo not found")

@router.post("/api/upload-image")
async def upload_image(drive_id: str = Form(...), file: UploadFile = File(...)):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        # Sanitize drive_id to prevent path traversal
        safe_drive_id = os.path.basename(drive_id)
        file_path = os.path.join(DRIVES_DIR, f"{safe_drive_id}.jpg")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "message": f"Image saved"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/settings/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    try:
        with open(LOGO_PATH, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "message": "Company logo updated successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
