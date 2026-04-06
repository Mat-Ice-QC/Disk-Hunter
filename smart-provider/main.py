from fastapi import FastAPI, HTTPException
import subprocess
import os

app = FastAPI()

@app.get("/smartdata/{device_name}")
async def get_smart_data(device_name: str):
    # Basic security check to prevent path traversal and ensure it's a /dev device
    if '..' in device_name or '/' in device_name:
        raise HTTPException(status_code=400, detail="Invalid device name format.")
    
    device_path = f"/dev/{device_name}"

    if not os.path.exists(device_path):
        raise HTTPException(status_code=404, detail=f"Device {device_name} not found at {device_path}")

    try:
        cmd = ["smartctl", "-a", device_path]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        # smartctl returns non-zero for various reasons, but we still want the output if it exists.
        # We can check for specific fatal errors if needed.
        if "Device open failed" in result.stderr or "Unavailable" in result.stderr:
             raise HTTPException(status_code=404, detail=f"Device {device_name} could not be opened by smartctl.")

        return {"device": device_name, "smart_data": result.stdout or result.stderr}
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="smartctl command not found inside the smart-provider container.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred in smart-provider: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "ok"}
