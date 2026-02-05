from __future__ import annotations

import os
import subprocess
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

import pty


@dataclass
class TerminalSession:
    session_id: str
    process: subprocess.Popen[bytes]
    master_fd: int
    buffer: List[str] = field(default_factory=list)
    closed: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)

    def append_output(self, text: str) -> None:
        with self.lock:
            self.buffer.append(text)

    def get_output(self, offset: int) -> tuple[str, int]:
        with self.lock:
            if offset < 0:
                offset = 0
            chunk = "".join(self.buffer[offset:])
            return chunk, len(self.buffer)

    def write(self, data: str) -> None:
        if self.closed:
            return
        os.write(self.master_fd, data.encode("utf-8"))


class TerminalManager:
    def __init__(self, base_dir: Path) -> None:
        self.sessions: Dict[str, TerminalSession] = {}
        self.base_dir = base_dir

        utilities_dir = base_dir / "Prev" / "ArchLinux-Maintenance-Script" / "Utilities"
        self.allowed_commands: Dict[str, list[str]] = {
            "upgrade_aur": ["bash", str(utilities_dir / "4-AURupgrade")],
            "upgrade_official": ["bash", str(utilities_dir / "3-OfficialUpgrade")],
            "check_failed_services": ["bash", str(utilities_dir / "1-CheckFailedSystemd")],
            "check_logs": ["bash", str(utilities_dir / "2-CheckLogFiles")],
            "orphaned_packages": ["bash", str(utilities_dir / "5-OrphanedCheck")],
            "clean_cache": ["bash", str(utilities_dir / "6-CleanPackagesCache")],
            "disks_health": ["bash", str(utilities_dir / "7-DisksCheck")],
            "toggle_monitor": ["bash", str(utilities_dir / "8-Monitor-Toggle")],
            "reboot_polybar": ["bash", str(utilities_dir / "10-Polybar")],
            "toggle_wacom": ["bash", str(utilities_dir / "9-Wacom")],
        }

    def start(self, command_key: str) -> str:
        if command_key not in self.allowed_commands:
            raise ValueError("Command not allowed")

        command = self.allowed_commands[command_key]
        session_id = str(uuid.uuid4())

        master_fd, slave_fd = pty.openpty()
        process = subprocess.Popen(
            command,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=str(self.base_dir),
            preexec_fn=os.setsid,
        )
        os.close(slave_fd)

        session = TerminalSession(session_id=session_id, process=process, master_fd=master_fd)
        self.sessions[session_id] = session

        thread = threading.Thread(target=self._read_output, args=(session,), daemon=True)
        thread.start()

        return session_id

    def _read_output(self, session: TerminalSession) -> None:
        while True:
            try:
                data = os.read(session.master_fd, 1024)
            except OSError:
                break

            if not data:
                break

            session.append_output(data.decode("utf-8", errors="replace"))

        session.closed = True

    def write(self, session_id: str, data: str) -> None:
        session = self.sessions.get(session_id)
        if not session:
            raise KeyError("Session not found")
        session.write(data)

    def get_output(self, session_id: str, offset: int) -> tuple[str, int, bool]:
        session = self.sessions.get(session_id)
        if not session:
            raise KeyError("Session not found")
        output, next_offset = session.get_output(offset)
        done = session.closed and session.process.poll() is not None
        return output, next_offset, done
