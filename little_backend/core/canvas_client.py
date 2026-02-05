import httpx
from pathlib import Path
from typing import Any, List, Optional
from core.config import get_settings

class CanvasClient:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.canvas_base_url
        self.token = settings.canvas_token
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def _get_api_url(self, endpoint: str) -> str:
        if not self.base_url:
            raise ValueError("Canvas Base URL not configured")
        return f"{self.base_url}/api/v1/{endpoint.lstrip('/')}"

    async def _get_paginated(self, url: str, params: dict[str, Any] | None = None) -> List[dict]:
        items: List[dict] = []
        next_url: str | None = url
        async with httpx.AsyncClient() as client:
            while next_url:
                response = await client.get(next_url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list):
                    items.extend(data)
                else:
                    items.append(data)
                next_url = response.links.get("next", {}).get("url")
                params = None
        return items

    async def get_courses(self) -> List[dict]:
        url = self._get_api_url("courses")
        params = {"enrollment_type": "student", "state": ["available"], "per_page": 100}
        return await self._get_paginated(url, params)

    async def get_folders(self, course_id: int) -> List[dict]:
        url = self._get_api_url(f"courses/{course_id}/folders")
        params = {"per_page": 100}
        return await self._get_paginated(url, params)

    async def get_files_in_folder(self, folder_id: int) -> List[dict]:
        url = self._get_api_url(f"folders/{folder_id}/files")
        params = {"per_page": 100}
        return await self._get_paginated(url, params)

    async def get_file_download_url(self, file_id: int) -> str:
        url = self._get_api_url(f"files/{file_id}")
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()["url"]

    async def get_file_metadata(self, file_id: int) -> dict:
        url = self._get_api_url(f"files/{file_id}")
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    async def list_course_files(self, course_id: int) -> list[dict]:
        """List all files in a course with folder context."""
        folders = await self.get_folders(course_id)
        # Use full_name to get complete folder path (e.g., "course files/labs/lab8_reference")
        folder_map = {f.get("id"): (f.get("full_name") or "") for f in folders}
        
        # Strip "course files/" prefix if present (Canvas adds this)
        for folder_id, full_path in folder_map.items():
            if full_path.startswith("course files/"):
                folder_map[folder_id] = full_path[len("course files/"):]

        url = self._get_api_url(f"courses/{course_id}/files")
        files = await self._get_paginated(url, {"per_page": 100})
        return [
            {
                "id": f.get("id"),
                "display_name": f.get("display_name"),
                "folder_name": folder_map.get(f.get("folder_id"), ""),
                "url": f.get("url"),
            }
            for f in files
        ]

    async def get_assignments(self, course_id: int) -> List[dict]:
        url = self._get_api_url(f"courses/{course_id}/assignments")
        params = {"per_page": 100}
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()

    async def upload_file_to_submission(self, course_id: int, assignment_id: int, file_path: Path) -> int:
        """Upload a file for an assignment submission.
        
        Returns:
            The ID of the uploaded file.
        """
        # Step 1: Tell Canvas we want to upload a file
        url = self._get_api_url(f"courses/{course_id}/assignments/{assignment_id}/submissions/self/files")
        params = {
            "name": file_path.name,
            "size": file_path.stat().st_size,
            "content_type": "application/octet-stream" # Or detect from filename
        }
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=self.headers, data=params)
            resp.raise_for_status()
            upload_data = resp.json()
            
            upload_url = upload_data["upload_url"]
            upload_params = upload_data["upload_params"]
            
            # Step 2: Upload the actual file content
            # We need to send upload_params as form data along with the file
            files = {"file": open(file_path, "rb")}
            upload_resp = await client.post(upload_url, data=upload_params, files=files)
            upload_resp.raise_for_status()
            
            # Step 3: Parse the final file ID
            # Depending on the response, it might be the JSON of the file or a redirect
            if upload_resp.status_code == 201:
                return upload_resp.json()["id"]
            elif upload_resp.status_code == 301:
                # Handle redirect if necessary, but usually httpx handles it
                # If it's a POST redirect, it might need special care
                redirect_url = upload_resp.headers["Location"]
                final_resp = await client.get(redirect_url, headers=self.headers)
                return final_resp.json()["id"]
            else:
                return upload_resp.json()["id"]

    async def submit_assignment(self, course_id: int, assignment_id: int, file_ids: List[int]):
        """Submit the assignment with the uploaded file IDs."""
        url = self._get_api_url(f"courses/{course_id}/assignments/{assignment_id}/submissions")
        data = {
            "submission": {
                "submission_type": "online_upload",
                "file_ids": file_ids
            }
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
