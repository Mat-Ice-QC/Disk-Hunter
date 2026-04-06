from fastapi import APIRouter
from datetime import datetime

from .config import REPORTS_DIR
from .history import append_history
from .models import MockPipelineRequest
from .system import get_local_time
from .pdf_generator import generate_erasure_certificate

router = APIRouter()

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
