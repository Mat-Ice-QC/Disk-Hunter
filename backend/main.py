from fastapi import FastAPI
from api import system, disks, shredding, history, reports, images, settings, smartctl, partition, speedtest, iso, data_management, ws
from api.config import setup_directories

# Initialize directories on startup
setup_directories()

import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(ws.broadcast_system_data())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)

import os

ENABLE_SHREDDER = os.getenv("ENABLE_SHREDDER", "true").lower() == "true"
ENABLE_SPEEDTEST = os.getenv("ENABLE_SPEEDTEST", "true").lower() == "true"
ENABLE_ISOWRITER = os.getenv("ENABLE_ISOWRITER", "true").lower() == "true"
ENABLE_SMARTCTL = os.getenv("ENABLE_SMARTCTL", "true").lower() == "true"
ENABLE_DATA_MANAGEMENT = os.getenv("ENABLE_DATA_MANAGEMENT", "true").lower() == "true"

# Include core routers
app.include_router(system.router)
app.include_router(disks.router)
app.include_router(history.router)
app.include_router(reports.router)
app.include_router(images.router)
app.include_router(settings.router)
app.include_router(partition.router)
app.include_router(ws.router)

# Include conditionally enabled routers
if ENABLE_SHREDDER:
    app.include_router(shredding.router)
if ENABLE_SPEEDTEST:
    app.include_router(speedtest.router)
if ENABLE_ISOWRITER:
    app.include_router(iso.router)
if ENABLE_SMARTCTL:
    app.include_router(smartctl.router)
if ENABLE_DATA_MANAGEMENT:
    app.include_router(data_management.router)



@app.get("/")
def read_root():
    return {"message": "Disk Hunter API is running"}

