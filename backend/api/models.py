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

class BatchPartitionRequest(BaseModel):
    drives: list[str]
    action: str
    params: list[str] = []

class PreparePartitionsRequest(BaseModel):
    drives: list[str]
    label: str = "gpt"
    fs_type: str = "ext4"
    size: str = "100%"

class BrandingRequest(BaseModel):
    company_name: str = ""
    company_address: str = ""
    company_phone: str = ""
    dc_tags: list[str] = []

class TemperatureConfigRequest(BaseModel):
    collect_temperature: bool = True
    thermal_devices: list[str] = []

class SpeedtestRequest(BaseModel):
    drives: list[str]
    test_type: str = "read"
    size: str = "1G"
    timezone: str = "UTC"

