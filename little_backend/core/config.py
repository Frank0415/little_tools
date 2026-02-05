"""Configuration management for Little Tools backend.

Handles loading, saving, and accessing application settings stored in a JSON file.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, Field, field_validator


class CoursePair(BaseModel):
    """Course name/id pair for manual course entry."""

    name: str = Field(description="Course name")
    id: int = Field(description="Canvas course id")


class Settings(BaseModel):
    """Application settings model with type-safe configuration values.
    
    Attributes:
        canvas_token: Canvas LMS API authentication token.
        canvas_base_url: Base URL for Canvas LMS instance (e.g., https://canvas.instructure.com).
        notion_token: Notion integration token for API access.
        download_dir: Directory path for downloaded files (defaults to ~/Downloads/LittleTools).
        temp_dir: Directory path for temporary files (defaults to ~/.little_tools/temp).
        courses: List of manually entered course name/id pairs.
    """

    canvas_token: str | None = Field(default=None, description="Canvas LMS API token")
    canvas_base_url: str | None = Field(
        default=None, description="Canvas LMS base URL (e.g., https://canvas.instructure.com)"
    )
    notion_token: str | None = Field(default=None, description="Notion integration token")
    download_dir: Path = Field(
        default_factory=lambda: Path.home() / "Downloads" / "LittleTools",
        description="Directory for downloaded files"
    )
    temp_dir: Path = Field(
        default_factory=lambda: Path.home() / ".little_tools" / "temp",
        description="Directory for temporary files"
    )
    courses: list[CoursePair] = Field(default_factory=list, description="Manual course list")

    @field_validator("canvas_base_url")
    @classmethod
    def validate_canvas_base_url(cls, value: str | None) -> str | None:
        """Validate and normalize Canvas base URL.
        
        Removes trailing slashes to ensure consistent URL formatting.
        """
        if value is None:
            return value
        return value.rstrip("/")

    @field_validator("download_dir", "temp_dir")
    @classmethod
    def validate_path(cls, value: Path | str) -> Path:
        """Ensure path values are Path objects."""
        return Path(value) if isinstance(value, str) else value

    def model_dump_json_safe(self) -> dict[str, Any]:
        """Convert settings to a JSON-serializable dictionary.
        
        Path objects are converted to strings for JSON serialization.
        """
        data = self.model_dump()
        # Convert Path objects to strings for JSON serialization
        data["download_dir"] = str(self.download_dir)
        data["temp_dir"] = str(self.temp_dir)
        return data


# Module-level cache for settings instance
_settings_instance: Settings | None = None


def get_config_path() -> Path:
    """Get the path to the configuration directory.
    
    Returns:
        Path to the ~/.little_tools directory.
    """
    return Path.home() / ".little_tools"


def get_config_file_path() -> Path:
    """Get the full path to the configuration JSON file.
    
    Returns:
        Path to ~/.little_tools/config.json.
    """
    return get_config_path() / "config.json"


def _ensure_config_directory() -> None:
    """Create configuration directory if it doesn't exist.
    
    This function is idempotent - safe to call multiple times.
    """
    config_dir = get_config_path()
    config_dir.mkdir(parents=True, exist_ok=True)


def _get_secret_key_path() -> Path:
    return get_config_path() / "secret.key"


def _get_or_create_secret_key() -> bytes:
    _ensure_config_directory()
    key_path = _get_secret_key_path()
    if key_path.exists():
        return key_path.read_bytes()
    key = Fernet.generate_key()
    key_path.write_bytes(key)
    os.chmod(key_path, 0o600)
    return key


def _get_fernet() -> Fernet:
    return Fernet(_get_or_create_secret_key())


def _encrypt_value(value: str | None) -> str | None:
    if not value:
        return None
    return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt_value(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Backward compatibility: treat as plain text if not encrypted
        return value


def load_settings() -> Settings:
    """Load settings from the configuration file.
    
    If the configuration file doesn't exist or is invalid, returns default settings.
    
    Returns:
        Settings instance loaded from file or default values.
    """
    config_file = get_config_file_path()
    
    if not config_file.exists():
        return Settings()
    
    try:
        with open(config_file, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data["canvas_token"] = _decrypt_value(data.get("canvas_token"))
            data["notion_token"] = _decrypt_value(data.get("notion_token"))
        return Settings.model_validate(data)
    except (json.JSONDecodeError, OSError):
        # Return default settings if file is corrupted or unreadable
        return Settings()


def get_settings() -> Settings:
    """Get the current application settings (cached).
    
    This function returns a cached settings instance. The first call loads
    from disk; subsequent calls return the cached instance.
    
    For fresh settings from disk, use load_settings() instead.
    
    Returns:
        Current Settings instance.
    """
    global _settings_instance
    
    if _settings_instance is None:
        _settings_instance = load_settings()
    
    return _settings_instance


def save_settings(settings: Settings) -> None:
    """Save settings to the configuration file.
    
    Automatically creates the configuration directory if it doesn't exist.
    Also updates the cached settings instance.
    
    Args:
        settings: Settings instance to save.
    
    Raises:
        OSError: If unable to write to the configuration file.
    """
    global _settings_instance
    
    _ensure_config_directory()
    
    config_file = get_config_file_path()
    
    data = settings.model_dump_json_safe()
    data["canvas_token"] = _encrypt_value(settings.canvas_token)
    data["notion_token"] = _encrypt_value(settings.notion_token)

    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    
    # Update cached instance
    _settings_instance = settings


def reset_settings_cache() -> None:
    """Reset the settings cache.
    
    Forces the next get_settings() call to reload from disk.
    This is useful for testing or when external modifications are detected.
    """
    global _settings_instance
    _settings_instance = None


def ensure_directories(settings: Settings | None = None) -> None:
    """Ensure all configured directories exist.
    
    Creates download_dir and temp_dir if they don't exist.
    This should be called on application startup.
    
    Args:
        settings: Optional settings instance. Uses get_settings() if not provided.
    """
    if settings is None:
        settings = get_settings()
    
    settings.download_dir.mkdir(parents=True, exist_ok=True)
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
