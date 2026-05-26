from fastapi import APIRouter
from datetime import datetime
import os
import shutil

from .config import REPORTS_DIR, ISO_DIR, DATA_DIR, DRIVES_DIR
from .history import append_history
from .models import MockPipelineRequest
from .system import get_local_time
from .pdf_generator import generate_erasure_certificate

router = APIRouter()

@router.delete("/api/settings/clear-isos")
def clear_all_isos():
    try:
        if os.path.exists(ISO_DIR):
            for filename in os.listdir(ISO_DIR):
                file_path = os.path.join(ISO_DIR, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}. Reason: {e}")
        return {"status": "success", "message": "All ISO files deleted."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/settings/clear-pdfs")
def clear_all_pdfs():
    try:
        if os.path.exists(REPORTS_DIR):
            for filename in os.listdir(REPORTS_DIR):
                file_path = os.path.join(REPORTS_DIR, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}. Reason: {e}")
        return {"status": "success", "message": "All PDF reports deleted."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/settings/clear-all-logs")
def clear_all_logs():
    try:
        log_dirs = [
            f"{DATA_DIR}/shredding/logs/container_logs",
            f"{DATA_DIR}/smartctl/logs/container_logs",
            f"{DATA_DIR}/smartctl/logs/python",
            f"{DATA_DIR}/speedtest/logs/container_logs",
            f"{DATA_DIR}/speedtest/logs/python"
        ]
        for l_dir in log_dirs:
            if os.path.exists(l_dir):
                for filename in os.listdir(l_dir):
                    file_path = os.path.join(l_dir, filename)
                    try:
                        if os.path.isfile(file_path) or os.path.islink(file_path):
                            os.unlink(file_path)
                        elif os.path.isdir(file_path):
                            shutil.rmtree(file_path)
                    except Exception as e:
                        print(f"Failed to delete {file_path}. Reason: {e}")
        return {"status": "success", "message": "All data logs deleted."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.delete("/api/settings/clear-images")
def clear_all_images():
    try:
        if os.path.exists(DRIVES_DIR):
            for filename in os.listdir(DRIVES_DIR):
                file_path = os.path.join(DRIVES_DIR, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}. Reason: {e}")
        return {"status": "success", "message": "All drive images deleted."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/api/settings/mock-pipeline")
def trigger_mock_pipeline(req: MockPipelineRequest):  
    try:
        drive_name = "mock_test_drive"
        serial = f"MOCK_{int(datetime.now().timestamp())}"
        method = "dod522022m"
        verify = "last"
        
        # Use the requested timezone!
        start_time = get_local_time(req.timezone)
        end_time = get_local_time(req.timezone)
        
        server_name = "Mock_Server_01"
        inventory_id = "INV-9999"
        datacenter = "Mock_Datacenter"
        comp_name = "Disk Hunter Mocking Inc."
        comp_address = "123 Test Lane"
        comp_phone = "555-0199"
        
        report_filename = generate_erasure_certificate(
            REPORTS_DIR, drive_name, serial, method, verify, start_time, end_time,
            server_name, inventory_id, datacenter, comp_name, comp_address, comp_phone
        )
        
        append_history({
            "timestamp": end_time,
            "event": f"USER successfully completed wipe of /dev/mock_test",
            "serial": serial,
            "method": method,
            "report_file": report_filename
        })
        
        return {"status": "success", "message": "Simulated successful wipe. PDF generated and logged!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
