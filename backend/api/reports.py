import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from .config import REPORTS_DIR

router = APIRouter()

@router.get("/api/reports/{filename}")
def get_report(filename: str):
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(REPORTS_DIR, safe_filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=safe_filename, media_type="application/pdf")
    raise HTTPException(status_code=404, detail="Report not found")
