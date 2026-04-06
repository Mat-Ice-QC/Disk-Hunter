from fastapi import FastAPI
from api import system, disks, shredding, history, reports, images, settings, smartctl, partition
from api.config import setup_directories

# Initialize directories on startup
setup_directories()

app = FastAPI()

# Include all the routers from the sub-modules
app.include_router(system.router)
app.include_router(disks.router)
app.include_router(shredding.router)
app.include_router(history.router)
app.include_router(reports.router)
app.include_router(images.router)
app.include_router(settings.router)
app.include_router(smartctl.router)
app.include_router(partition.router)

@app.get("/")
def read_root():
    return {"message": "Disk Hunter API is running"}
