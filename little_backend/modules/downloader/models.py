from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class DownloadTask(BaseModel):
    task_id: str
    status: TaskStatus
    progress: float = 0.0  # 0 to 100
    current_file: Optional[str] = None
    total_files: int = 0
    downloaded_files: int = 0
    error: Optional[str] = None
