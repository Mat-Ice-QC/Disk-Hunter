from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
import os
import asyncio
import uuid
import httpx
from typing import List, Dict
from .config import ISO_DIR

router = APIRouter(prefix="/api/iso", tags=["iso"])

class DownloadRequest(BaseModel):
    url: str
    filename: str

class WriteRequest(BaseModel):
    filename: str
    device: str # e.g., sdb

# In-memory status tracking
download_tasks: Dict[str, Dict] = {}
write_tasks: Dict[str, Dict] = {}

@router.get("/list")
def list_isos():
    isos = []
    if os.path.exists(ISO_DIR):
        for f in os.listdir(ISO_DIR):
            if f.endswith(".iso") or f.endswith(".img"):
                path = os.path.join(ISO_DIR, f)
                isos.append({
                    "filename": f,
                    "size": os.path.getsize(path)
                })
    return isos

async def download_file_task(task_id: str, url: str, filepath: str):
    try:
        download_tasks[task_id]["status"] = "downloading"
        async with httpx.AsyncClient(follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                total = int(response.headers.get("Content-Length", 0))
                download_tasks[task_id]["total_bytes"] = total
                download_tasks[task_id]["downloaded_bytes"] = 0
                
                with open(filepath, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192 * 10):
                        f.write(chunk)
                        download_tasks[task_id]["downloaded_bytes"] += len(chunk)
                        if total > 0:
                            download_tasks[task_id]["progress"] = round((download_tasks[task_id]["downloaded_bytes"] / total) * 100, 2)
        
        download_tasks[task_id]["status"] = "completed"
        download_tasks[task_id]["progress"] = 100
    except Exception as e:
        download_tasks[task_id]["status"] = "error"
        download_tasks[task_id]["error"] = str(e)
        if os.path.exists(filepath):
            os.remove(filepath)

@router.post("/download")
def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    filepath = os.path.join(ISO_DIR, req.filename)
    
    if os.path.exists(filepath):
        raise HTTPException(status_code=400, detail="File already exists")
        
    download_tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "filename": req.filename,
        "url": req.url,
        "total_bytes": 0,
        "downloaded_bytes": 0
    }
    
    background_tasks.add_task(download_file_task, task_id, req.url, filepath)
    return {"task_id": task_id}

@router.get("/download-status")
def get_download_status():
    return download_tasks

async def write_iso_task(task_id: str, filename: str, device: str, ip: str):
    start_time = get_local_time()
    write_tasks[task_id]["status"] = "writing"
    filepath = os.path.join(ISO_DIR, filename)
    dev_path = f"/dev/{device}"
    
    container_name = f"disk_hunter_iso_write_{uuid.uuid4().hex[:8]}"
    
    # We use debian:bookworm-slim because it has a full dd with status=progress
    # and --volumes-from disk_hunter_api to easily get /app/data
    cmd = [
        "docker", "run", "-d", "--name", container_name,
        "--privileged",
        "--volumes-from", "disk_hunter_api",
        "-v", "/dev:/dev",
        "debian:bookworm-slim",
        "dd", f"if={filepath}", f"of={dev_path}", "bs=4M", "status=progress", "oflag=sync"
    ]
    
    try:
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        await proc.communicate()
        
        write_tasks[task_id]["container_name"] = container_name
        
        # Monitor the logs
        log_proc = await asyncio.create_subprocess_exec(
            "docker", "logs", "-f", container_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        while True:
            line = await log_proc.stderr.readline()
            if not line:
                break
            text = line.decode().strip()
            # dd status=progress prints lines like "1234 bytes (1.2 kB, 1.2 KiB) copied, 1.23 s, 1.0 kB/s"
            if "bytes" in text and "copied" in text:
                write_tasks[task_id]["last_log"] = text
                
        await log_proc.wait()
        
        # Wait for container to exit
        wait_proc = await asyncio.create_subprocess_exec(
            "docker", "wait", container_name,
            stdout=asyncio.subprocess.PIPE
        )
        stdout, _ = await wait_proc.communicate()
        exit_code = int(stdout.decode().strip())
        
        end_time = get_local_time()

        if exit_code == 0:
            write_tasks[task_id]["status"] = "completed"
            append_iso_history({
                "timestamp": end_time,
                "event": f"ISO write of {filename} to {device}",
                "username": ip,
                "status": "completed"
            })
        else:
            write_tasks[task_id]["status"] = "error"
            write_tasks[task_id]["error"] = f"dd failed with exit code {exit_code}"
            append_iso_history({
                "timestamp": end_time,
                "event": f"ISO write of {filename} to {device}",
                "username": ip,
                "status": "failed"
            })
            
    except Exception as e:
        write_tasks[task_id]["status"] = "error"
        write_tasks[task_id]["error"] = str(e)
        end_time = get_local_time()
        append_iso_history({
            "timestamp": end_time,
            "event": f"ISO write of {filename} to {device}",
            "username": ip,
            "status": "failed"
        })
    finally:
        # Cleanup container in background
        await asyncio.create_subprocess_exec("docker", "rm", "-f", container_name)

@router.post("/write")
def start_write(req: WriteRequest, background_tasks: BackgroundTasks, http_request: Request):
    ip = http_request.client.host if http_request.client else "Unknown"
    task_id = str(uuid.uuid4())
    filepath = os.path.join(ISO_DIR, req.filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="ISO file not found")
        
    write_tasks[task_id] = {
        "status": "pending",
        "filename": req.filename,
        "device": req.device,
        "last_log": ""
    }
    
    background_tasks.add_task(write_iso_task, task_id, req.filename, req.device, ip)
    return {"task_id": task_id}

@router.get("/write-status")
def get_write_status():
    return write_tasks
