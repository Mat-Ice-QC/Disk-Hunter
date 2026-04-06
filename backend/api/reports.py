import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from .config import REPORTS_DIR

router = APIRouter()

@router.get("/api/reports/{filename}")
def get_report(filename: str):
    file_path = f"{REPORTS_DIR}/{filename}"
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename, media_type="application/pdf")
    raise HTTPException(status_code=404, detail="Report not found")
