from fastapi import FastAPI, File, UploadFile, Form, HTTPException
import socket
import os
import subprocess
import json
import shutil

app = FastAPI()

# Ensure the directory for custom drive images exists
os.makedirs("/app/images/drives", exist_ok=True)

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "Unknown"

def get_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            temp_millicelsius = int(f.read().strip())
            return round(temp_millicelsius / 1000.0, 1)
    except Exception:
        return "N/A"

@app.get("/api/system-info")
def system_info():
    return {
        "hostname": socket.gethostname(),
        "ip": get_ip(),
        "temperature": get_temp()
    }

@app.get("/api/disks")
def get_disks():
    try:
        # Full lsblk command including VENDOR, LABEL, and FSVER
        cmd = [
            "lsblk", "-b", "-J", 
            "-o", "NAME,PATH,SIZE,TYPE,FSTYPE,PTTYPE,TRAN,MODEL,SERIAL,MOUNTPOINT,LABEL,PARTTYPENAME,FSVER,VENDOR"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        disks = []
        for device in data.get('blockdevices', []):
            # Filter out loop devices (like snaps snaps are doodoo in my opinion) and only grab physical disks
            if device.get('type') == 'disk' and not device.get('name', '').startswith('loop'):
                disks.append(device)
                
        return {"status": "success", "disks": disks}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/upload-image")
async def upload_image(drive_id: str = Form(...), file: UploadFile = File(...)):
    # Restrict to images only
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Save image with the normalized drive name sent from settings.js
    file_path = f"/app/images/drives/{drive_id}.jpg"
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"status": "success", "message": f"Image saved for {drive_id}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}