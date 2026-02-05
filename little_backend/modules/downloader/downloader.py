import httpx
import aiofiles
import os
import uuid
import asyncio
from pathlib import Path
from typing import Dict, List, Optional
from core.config import get_settings
from core.canvas_client import CanvasClient
from .models import DownloadTask, TaskStatus

class Downloader:
    def __init__(self):
        self.tasks: Dict[str, DownloadTask] = {}
        self.client = CanvasClient()

    def create_task(self, total_files: int) -> str:
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = DownloadTask(
            task_id=task_id,
            status=TaskStatus.PENDING,
            total_files=total_files
        )
        return task_id

    def get_task(self, task_id: str) -> Optional[DownloadTask]:
        return self.tasks.get(task_id)

    async def download_file(self, url: str, dest_path: Path, task_id: str, file_name: str):
        task = self.tasks[task_id]
        task.current_file = file_name
        
        # Ensure directory exists
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        headers = {"Authorization": f"Bearer {self.client.token}"}
        
        # Check for existing file and size for resume
        existing_size = dest_path.stat().st_size if dest_path.exists() else 0
        
        async with httpx.AsyncClient() as client:
            # First, get file info (size)
            head_resp = await client.head(url, headers=headers, follow_redirects=True)
            total_size = int(head_resp.headers.get("Content-Length", 0))

            if existing_size >= total_size and total_size > 0:
                task.downloaded_files += 1
                task.progress = (task.downloaded_files / task.total_files) * 100
                return

            if existing_size > 0:
                headers["Range"] = f"bytes={existing_size}-"

            async with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
                if response.status_code not in (200, 206):
                    # If 206 not supported or other error, restart download
                    headers.pop("Range", None)
                    async with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
                        existing_size = 0
                        mode = "wb"
                else:
                    mode = "ab" if existing_size > 0 else "wb"

                async with aiofiles.open(dest_path, mode) as f:
                    async for chunk in response.aiter_bytes():
                        await f.write(chunk)
                        # We could update sub-progress here if we wanted per-file progress

        task.downloaded_files += 1
        task.progress = (task.downloaded_files / task.total_files) * 100

    async def run_course_download(self, course_id: int, task_id: str):
        task = self.tasks[task_id]
        task.status = TaskStatus.RUNNING
        
        try:
            settings = get_settings()
            course_info = await self._get_course_info(course_id)
            course_name = course_info.get("name", f"Course_{course_id}")
            
            folders = await self.client.get_folders(course_id)
            all_files = []
            
            for folder in folders:
                files = await self.client.get_files_in_folder(folder["id"])
                for f in files:
                    all_files.append({
                        "id": f["id"],
                        "display_name": f["display_name"],
                        "folder_name": folder["name"],
                        "url": f["url"]
                    })
            
            task.total_files = len(all_files)
            if task.total_files == 0:
                task.status = TaskStatus.COMPLETED
                task.progress = 100
                return

            for file_info in all_files:
                dest_path = settings.download_dir / course_name / file_info["folder_name"] / file_info["display_name"]
                await self.download_file(file_info["url"], dest_path, task_id, file_info["display_name"])
            
            task.status = TaskStatus.COMPLETED
            task.current_file = None
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)

    async def run_selected_download(self, course_id: int, file_ids: list[int], task_id: str):
        task = self.tasks[task_id]
        task.status = TaskStatus.RUNNING

        try:
            settings = get_settings()
            course_info = await self._get_course_info(course_id)
            course_name = course_info.get("name", f"Course_{course_id}")

            folders = await self.client.get_folders(course_id)
            folder_map = {f.get("id"): (f.get("name") or "") for f in folders}

            task.total_files = len(file_ids)
            if task.total_files == 0:
                task.status = TaskStatus.COMPLETED
                task.progress = 100
                return

            for file_id in file_ids:
                meta = await self.client.get_file_metadata(file_id)
                file_name = meta.get("display_name") or meta.get("filename") or str(file_id)
                folder_name = folder_map.get(meta.get("folder_id"), "")
                file_url = meta.get("url") or await self.client.get_file_download_url(file_id)
                dest_path = settings.download_dir / course_name / folder_name / file_name
                await self.download_file(file_url, dest_path, task_id, file_name)

            task.status = TaskStatus.COMPLETED
            task.current_file = None
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)

    async def _get_course_info(self, course_id: int) -> dict:
        url = self.client._get_api_url(f"courses/{course_id}")
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.client.headers)
            response.raise_for_status()
            return response.json()

# Singleton instance
downloader_instance = Downloader()
