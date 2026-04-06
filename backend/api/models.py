from pydantic import BaseModel

class DriveMeta(BaseModel):
    path: str
    server_name: str = "N/A"
    inventory_id: str = "N/A"
    datacenter: str = "N/A" 

class ShredRequest(BaseModel):
    drives: list[DriveMeta]
    method: str
    verify: str
    generate_pdf: bool = False
    company_name: str = "Disk Hunter"
    company_address: str = "N/A"
    company_phone: str = "N/A"
    timezone: str = "UTC"

class MockPipelineRequest(BaseModel): 
    timezone: str = "UTC"

class StopRequest(BaseModel):
    container_name: str

class SmartRequest(BaseModel):
    drives: list[str]
    test_type: str

class PartitionActionRequest(BaseModel):
    drive: str
    action: str
    params: list[str] = []
