import os
import shutil
import re
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Response
from fastapi.responses import FileResponse
from .config import DRIVES_DIR, LOGO_PATH

router = APIRouter()

SVG_NVME = """<svg width="120" height="90" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="nvmeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#064e3b"/>
            <stop offset="100%" stop-color="#022c22"/>
        </linearGradient>
        <linearGradient id="chipGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#374151"/>
            <stop offset="100%" stop-color="#1f2937"/>
        </linearGradient>
    </defs>
    <rect width="120" height="90" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    <rect x="15" y="32" width="90" height="26" rx="2" fill="url(#nvmeGrad)" stroke="#059669" stroke-width="1.5"/>
    <rect x="15" y="34" width="4" height="22" fill="#d97706"/>
    <rect x="28" y="36" width="18" height="18" rx="1.5" fill="url(#chipGrad)" stroke="#4b5563" stroke-width="1"/>
    <rect x="52" y="36" width="20" height="18" rx="1" fill="#111827" stroke="#374151" stroke-width="1"/>
    <rect x="78" y="36" width="20" height="18" rx="1" fill="#111827" stroke="#374151" stroke-width="1"/>
    <text x="60" y="80" fill="#94a3b8" font-size="10" font-family="sans-serif" font-weight="bold" text-anchor="middle">M.2 NVMe SSD</text>
</svg>"""

SVG_USB = """<svg width="120" height="90" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="usbBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4f46e5"/>
            <stop offset="100%" stop-color="#312e81"/>
        </linearGradient>
    </defs>
    <rect width="120" height="90" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    <rect x="20" y="33" width="22" height="24" rx="2" fill="#94a3b8" stroke="#cbd5e1" stroke-width="1.5"/>
    <rect x="26" y="38" width="6" height="4" fill="#fbbf24"/>
    <rect x="26" y="48" width="6" height="4" fill="#fbbf24"/>
    <rect x="42" y="27" width="58" height="36" rx="4" fill="url(#usbBody)" stroke="#6366f1" stroke-width="1.5"/>
    <rect x="50" y="35" width="28" height="20" rx="2" fill="#1e1b4b" opacity="0.6"/>
    <circle cx="90" cy="45" r="3" fill="#cbd5e1"/>
    <text x="60" y="80" fill="#94a3b8" font-size="10" font-family="sans-serif" font-weight="bold" text-anchor="middle">USB Flash Drive</text>
</svg>"""

SVG_SD = """<svg width="120" height="90" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="sdGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
    </defs>
    <rect width="120" height="90" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    <path d="M 40 20 L 72 20 L 80 28 L 80 70 L 40 70 Z" fill="url(#sdGrad)" stroke="#334155" stroke-width="2"/>
    <rect x="38" y="35" width="4" height="8" fill="#f59e0b" rx="1"/>
    <rect x="48" y="30" width="24" height="25" fill="#3b82f6" rx="2" opacity="0.8"/>
    <rect x="52" y="60" width="3" height="6" fill="#fbbf24"/>
    <rect x="57" y="60" width="3" height="6" fill="#fbbf24"/>
    <rect x="62" y="60" width="3" height="6" fill="#fbbf24"/>
    <rect x="67" y="60" width="3" height="6" fill="#fbbf24"/>
    <text x="60" y="82" fill="#94a3b8" font-size="9" font-family="sans-serif" font-weight="bold" text-anchor="middle">SD Memory Card</text>
</svg>"""

SVG_SSD = """<svg width="120" height="90" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="ssdGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3f3f46"/>
            <stop offset="100%" stop-color="#18181b"/>
        </linearGradient>
    </defs>
    <rect width="120" height="90" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    <rect x="25" y="15" width="70" height="60" rx="6" fill="url(#ssdGrad)" stroke="#52525b" stroke-width="2"/>
    <rect x="32" y="22" width="56" height="46" rx="4" fill="none" stroke="#27272a" stroke-width="1.5"/>
    <text x="60" y="46" fill="#3b82f6" font-size="14" font-family="sans-serif" font-weight="extrabold" text-anchor="middle" letter-spacing="1">SSD</text>
    <text x="60" y="58" fill="#71717a" font-size="8" font-family="sans-serif" text-anchor="middle">SOLID STATE DRIVE</text>
    <text x="60" y="82" fill="#94a3b8" font-size="9" font-family="sans-serif" font-weight="bold" text-anchor="middle">SATA SSD</text>
</svg>"""

SVG_HDD = """<svg width="120" height="90" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="hddGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#27272a"/>
            <stop offset="100%" stop-color="#09090b"/>
        </linearGradient>
        <linearGradient id="platterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#e4e4e7"/>
            <stop offset="100%" stop-color="#a1a1aa"/>
        </linearGradient>
    </defs>
    <rect width="120" height="90" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    <rect x="30" y="12" width="60" height="66" rx="4" fill="url(#hddGrad)" stroke="#3f3f46" stroke-width="1.5"/>
    <circle cx="60" cy="40" r="24" fill="url(#platterGrad)" stroke="#71717a" stroke-width="1"/>
    <circle cx="60" cy="40" r="6" fill="#27272a" stroke="#52525b" stroke-width="1"/>
    <path d="M 78 64 L 63 43" stroke="#d4d4d8" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="78" cy="64" r="5" fill="#52525b" stroke="#71717a" stroke-width="1"/>
    <text x="60" y="84" fill="#94a3b8" font-size="9" font-family="sans-serif" font-weight="bold" text-anchor="middle">Mechanical HDD</text>
</svg>"""

@router.get("/api/images/drives/{filename}")
def get_drive_image(filename: str, name: str = "", tran: str = "", rota: str = "", model: str = ""):
    safe_filename = os.path.basename(filename)
    # Remove .jpg extension for processing
    requested_base = safe_filename.rsplit('.', 1)[0]
    
    # 1. Try for an exact match first
    exact_file_path = os.path.join(DRIVES_DIR, f"{requested_base}.jpg")
    if os.path.exists(exact_file_path):
        return FileResponse(exact_file_path)

    # 2. Serving the default SVG matching the drive type
    name_lower = name.lower()
    tran_lower = tran.lower()
    model_lower = model.lower()
    base_lower = requested_base.lower()

    is_nvme = "nvme" in tran_lower or "nvme" in name_lower or "nvme" in model_lower or "nvme" in base_lower
    is_usb = "usb" in tran_lower or "usb" in name_lower or "usb" in model_lower or "usb" in base_lower or "flash" in model_lower or "flash" in base_lower or "store n go" in model_lower or "store_n_go" in base_lower
    is_sd = "sd" in model_lower or "sd" in base_lower or "mmc" in model_lower or "mmc" in base_lower or "card" in model_lower or "card" in base_lower or "mmcblk" in name_lower

    if is_nvme:
        return Response(content=SVG_NVME, media_type="image/svg+xml")
    elif is_usb:
        if "sd" in model_lower or "sd" in base_lower or "mmc" in model_lower or "mmc" in base_lower or "card" in model_lower or "card" in base_lower:
            return Response(content=SVG_SD, media_type="image/svg+xml")
        return Response(content=SVG_USB, media_type="image/svg+xml")
    elif is_sd:
        return Response(content=SVG_SD, media_type="image/svg+xml")
    elif "ssd" in model_lower or "ssd" in base_lower or rota.lower() == "false" or rota is False:
        return Response(content=SVG_SSD, media_type="image/svg+xml")
    else:
        # Default fallback to HDD
        return Response(content=SVG_HDD, media_type="image/svg+xml")


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
                if safe_name in (".", ".."):
                    continue
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
    return {"images": sorted(images)}

@router.get("/api/images/pool/{filename}")
def get_pool_image(filename: str):
    safe_filename = os.path.basename(filename)
    if safe_filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    pool_path = os.path.join(POOL_DIR, safe_filename)
    drives_path = os.path.join(DRIVES_DIR, safe_filename)
    if os.path.exists(pool_path):
        return FileResponse(pool_path)
    if os.path.exists(drives_path):
        return FileResponse(drives_path)
    raise HTTPException(status_code=404, detail="Image not found")
    
@router.post("/api/images/assign")
async def assign_drive_image(drive_id: str = Form(...), pool_filename: str = Form(...)):
    try:
        safe_pool_name = os.path.basename(pool_filename)
        if safe_pool_name in (".", ".."):
            raise HTTPException(status_code=400, detail="Invalid pool filename")
        source_path = os.path.join(POOL_DIR, safe_pool_name)
        if not os.path.exists(source_path):
            source_path = os.path.join(DRIVES_DIR, safe_pool_name)
        if not os.path.exists(source_path):
            raise HTTPException(status_code=404, detail="Pool image not found")
            
        safe_drive_id = os.path.basename(drive_id)
        dest_path = os.path.join(DRIVES_DIR, f"{safe_drive_id}.jpg")
        shutil.copy(source_path, dest_path)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
