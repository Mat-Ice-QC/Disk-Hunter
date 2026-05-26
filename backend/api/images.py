import os
import shutil
import re
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

    def tokenize(text: str) -> set:
        return set(re.sub(r'[^a-z0-9]', ' ', text.lower()).split())

    req_tokens = tokenize(requested_base)
    
    best_match_name = None
    best_score = 0
    
    # 2. Token-based scoring match
    for img_base in available_images:
        img_tokens = tokenize(img_base)
        
        # Calculate intersection of tokens
        intersection = req_tokens.intersection(img_tokens)
        score = len(intersection)
        
        # Penalize if the pool image has specific tokens NOT present in the requested drive
        # We want the matched image to be a generic parent or exact match, not a different specific sibling.
        extra_tokens = len(img_tokens - req_tokens)
        final_score = score - (extra_tokens * 0.5)
        
        if final_score > best_score and final_score > 0:
            best_score = final_score
            best_match_name = img_base

    if best_match_name:
        file_path = os.path.join(DRIVES_DIR, f"{best_match_name}.jpg")
        if os.path.exists(file_path):
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

from typing import List

POOL_DIR = os.path.join(os.path.dirname(DRIVES_DIR), 'pool')
os.makedirs(POOL_DIR, exist_ok=True)

@router.post("/api/images/pool/upload")
async def upload_pool_images(files: List[UploadFile] = File(...)):
    try:
        for file in files:
            if file.content_type.startswith('image/'):
                safe_name = os.path.basename(file.filename)
                with open(os.path.join(POOL_DIR, safe_name), "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/api/images/pool")
def list_pool_images():
    images = set()
    if os.path.exists(POOL_DIR):
        images.update([f for f in os.listdir(POOL_DIR) if f.endswith(('.png', '.jpg', '.jpeg'))])
    if os.path.exists(DRIVES_DIR):
        images.update([f for f in os.listdir(DRIVES_DIR) if f.endswith(('.png', '.jpg', '.jpeg'))])
    return {"images": list(images)}

@router.get("/api/images/pool/{filename}")
def get_pool_image(filename: str):
    pool_path = os.path.join(POOL_DIR, filename)
    drives_path = os.path.join(DRIVES_DIR, filename)
    if os.path.exists(pool_path):
        return FileResponse(pool_path)
    if os.path.exists(drives_path):
        return FileResponse(drives_path)
    raise HTTPException(status_code=404, detail="Image not found")
    
@router.post("/api/images/assign")
async def assign_drive_image(drive_id: str = Form(...), pool_filename: str = Form(...)):
    try:
        source_path = os.path.join(POOL_DIR, os.path.basename(pool_filename))
        if not os.path.exists(source_path):
            source_path = os.path.join(DRIVES_DIR, os.path.basename(pool_filename))
        if not os.path.exists(source_path):
            raise HTTPException(status_code=404, detail="Pool image not found")
            
        safe_drive_id = os.path.basename(drive_id)
        dest_path = os.path.join(DRIVES_DIR, f"{safe_drive_id}.jpg")
        shutil.copy(source_path, dest_path)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
