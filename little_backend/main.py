from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from pathlib import Path
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
from core.config import get_settings, save_settings, Settings, ensure_directories
from core.canvas_client import CanvasClient
from modules.downloader.downloader import downloader_instance
from modules.downloader.models import DownloadTask
from modules.system_stats import get_system_stats
from modules.ics.generator import ICSEventRequest, generate_ics_content

app = FastAPI()

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "http://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/settings", response_model=Settings)
async def get_api_settings():
    """Get current application settings."""
    return get_settings()

@app.post("/api/settings")
async def update_settings(settings: Settings):
    """Update application settings."""
    try:
        save_settings(settings)
        ensure_directories(settings)
        return {"status": "success", "message": "Settings saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/canvas/courses")
async def list_courses():
    """List student's Canvas courses."""
    client = CanvasClient()
    try:
        return await client.get_courses()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/canvas/courses/{course_id}/files")
async def list_course_files(course_id: int):
    """List files for a course with folder context."""
    client = CanvasClient()
    try:
        return await client.list_course_files(course_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DownloadRequest(BaseModel):
    course_name: Optional[str] = None

@app.post("/api/downloader/download/{course_id}")
async def start_download(course_id: int, payload: DownloadRequest, background_tasks: BackgroundTasks):
    """Start downloading materials for a course."""
    task_id = downloader_instance.create_task(total_files=0) # Total will be updated
    background_tasks.add_task(downloader_instance.run_course_download, course_id, task_id, payload.course_name)
    return {"task_id": task_id}


class SelectedDownloadRequest(BaseModel):
    file_ids: list[int] = Field(default_factory=list)
    course_name: Optional[str] = None


@app.post("/api/downloader/download/{course_id}/selected")
async def start_selected_download(course_id: int, payload: SelectedDownloadRequest, background_tasks: BackgroundTasks):
    """Start downloading selected files for a course."""
    task_id = downloader_instance.create_task(total_files=len(payload.file_ids))
    background_tasks.add_task(downloader_instance.run_selected_download, course_id, payload.file_ids, task_id, payload.course_name)
    return {"task_id": task_id}


@app.get("/api/downloader/tasks/{task_id}", response_model=DownloadTask)
async def get_task_status(task_id: str):
    """Get status of a download task."""
    task = downloader_instance.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.get("/api/downloader/tasks", response_model=List[DownloadTask])
async def list_all_tasks():
    """List all download tasks."""
    return downloader_instance.get_all_tasks()

@app.post("/api/ics/generate")
async def generate_ics(events: List[ICSEventRequest]):
    """Generate and return ICS file content."""
    try:
        content = generate_ics_content(events)
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/canvas/courses/{course_id}/assignments")
async def list_assignments(course_id: int):
    """List assignments for a course."""
    client = CanvasClient()
    try:
        return await client.get_assignments(course_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/canvas/courses/{course_id}/assignments/{assignment_id}/submit")
async def submit_assignment(course_id: int, assignment_id: int, file_path: str):
    """Submit a file to an assignment."""
    client = CanvasClient()
    try:
        path = Path(file_path)
        if not path.exists():
            raise HTTPException(status_code=400, detail="File does not exist")
        
        file_id = await client.upload_file_to_submission(course_id, assignment_id, path)
        result = await client.submit_assignment(course_id, assignment_id, [file_id])
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/system/stats")
async def system_stats():
    """Get system hardware stats (battery, WiFi, CPU, memory, wattage)"""
    try:
        return get_system_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
