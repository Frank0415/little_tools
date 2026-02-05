import httpx
import aiofiles
import os
import uuid
import asyncio
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from core.config import get_settings
from core.canvas_client import CanvasClient
from .models import DownloadTask, TaskStatus

class MetadataManager:
    def __init__(self, course_dir: Path):
        self.course_dir = course_dir
        self.meta_file = course_dir / ".canvas_metadata.json"
        self.data = self._load()

    def _load(self) -> Dict[str, Any]:
        if self.meta_file.exists():
            try:
                with open(self.meta_file, "r") as f:
                    return json.load(f)
            except:
                return {"files": {}}
        return {"files": {}}

    def save(self):
        self.course_dir.mkdir(parents=True, exist_ok=True)
        with open(self.meta_file, "w") as f:
            json.dump(self.data, f, indent=2)

    def get_file_meta(self, rel_path: str) -> Optional[Dict[str, Any]]:
        return self.data.get("files", {}).get(rel_path)

    def update_file_meta(self, rel_path: str, meta: Dict[str, Any]):
        if "files" not in self.data:
            self.data["files"] = {}
        self.data["files"][rel_path] = meta

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

    def get_all_tasks(self) -> List[DownloadTask]:
        return list(self.tasks.values())

    async def download_file(self, url: str, dest_path: Path, task_id: str, file_name: str, server_updated_at: Optional[str] = None):
        task = self.tasks[task_id]
        task.current_file = file_name
        
        # Ensure directory exists
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        headers = {"Authorization": f"Bearer {self.client.token}"}
        
        # Check metadata for skipping
        # We need rel_path to the course root
        # In this context, it's hard to know the course root without passing it.
        # But we can infer it or just use dest_path.name if we are in run_course_download.
        # Let's assume we handle skipping BEFORE calling download_file or update download_file signature.
        
        existing_size = dest_path.stat().st_size if dest_path.exists() else 0
        
        async with httpx.AsyncClient() as client:
            # If we don't have server_updated_at, we might still want to check size-based skip as fallback
            # but the user wants timestamp-based skipping.
            
            # First, get file info (size) for resume support
            head_resp = await client.head(url, headers=headers, follow_redirects=True)
            total_size = int(head_resp.headers.get("Content-Length", 0))

            if existing_size >= total_size and total_size > 0:
                # Still check size to be safe for incomplete downloads
                if not server_updated_at:
                    task.downloaded_files += 1
                    task.progress = (task.downloaded_files / task.total_files) * 100
                    return

            if existing_size > 0:
                headers["Range"] = f"bytes={existing_size}-"

            async with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
                if response.status_code not in (200, 206):
                    headers.pop("Range", None)
                    async with client.stream("GET", url, headers=headers, follow_redirects=True) as response:
                        existing_size = 0
                        mode = "wb"
                else:
                    mode = "ab" if existing_size > 0 else "wb"

                async with aiofiles.open(dest_path, mode) as f:
                    async for chunk in response.aiter_bytes():
                        await f.write(chunk)

        task.downloaded_files += 1
        task.progress = (task.downloaded_files / task.total_files) * 100

    async def run_course_download(self, course_id: int, task_id: str, override_course_name: Optional[str] = None):
        task = self.tasks[task_id]
        task.status = TaskStatus.RUNNING
        
        try:
            settings = get_settings()
            if override_course_name:
                course_name = override_course_name
            else:
                course_info = await self._get_course_info(course_id)
                course_name = course_info.get("name", f"Course_{course_id}")
            
            course_dir = settings.download_dir / course_name
            meta_mgr = MetadataManager(course_dir)

            folders = await self.client.get_folders(course_id)
            all_files = []
            
            for folder in folders:
                files = await self.client.get_files_in_folder(folder["id"])
                for f in files:
                    all_files.append({
                        "id": f["id"],
                        "display_name": f["display_name"],
                        "folder_name": folder["name"],
                        "url": f["url"],
                        "updated_at": f.get("updated_at") or f.get("modified_at")
                    })
            
            task.total_files = len(all_files)
            if task.total_files == 0:
                task.status = TaskStatus.COMPLETED
                task.progress = 100
                return

            for file_info in all_files:
                rel_path = f"{file_info['folder_name']}/{file_info['display_name']}"
                dest_path = course_dir / file_info["folder_name"] / file_info["display_name"]
                
                # Timestamp-based skip logic
                local_meta = meta_mgr.get_file_meta(rel_path)
                if dest_path.exists() and local_meta and local_meta.get("updated_at") == file_info["updated_at"]:
                    task.downloaded_files += 1
                    task.progress = (task.downloaded_files / task.total_files) * 100
                    continue

                await self.download_file(file_info["url"], dest_path, task_id, file_info["display_name"], file_info["updated_at"])
                
                # Update metadata after successful download
                meta_mgr.update_file_meta(rel_path, {
                    "updated_at": file_info["updated_at"],
                    "id": file_info["id"]
                })
                meta_mgr.save()
            
            task.status = TaskStatus.COMPLETED
            task.current_file = None
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)

    async def run_selected_download(self, course_id: int, file_ids: list[int], task_id: str, override_course_name: Optional[str] = None):
        task = self.tasks[task_id]
        task.status = TaskStatus.RUNNING

        try:
            settings = get_settings()
            if override_course_name:
                course_name = override_course_name
            else:
                course_info = await self._get_course_info(course_id)
                course_name = course_info.get("name", f"Course_{course_id}")

            course_dir = settings.download_dir / course_name
            meta_mgr = MetadataManager(course_dir)
            
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
                updated_at = meta.get("updated_at") or meta.get("modified_at")
                
                rel_path = f"{folder_name}/{file_name}"
                dest_path = course_dir / folder_name / file_name

                # Timestamp-based skip logic
                local_meta = meta_mgr.get_file_meta(rel_path)
                if dest_path.exists() and local_meta and local_meta.get("updated_at") == updated_at:
                    task.downloaded_files += 1
                    task.progress = (task.downloaded_files / task.total_files) * 100
                    continue

                await self.download_file(file_url, dest_path, task_id, file_name, updated_at)
                
                # Update metadata after successful download
                meta_mgr.update_file_meta(rel_path, {
                    "updated_at": updated_at,
                    "id": file_id
                })
                meta_mgr.save()

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
