from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


class ConfigError(RuntimeError):
    """Raised when administrator configuration is unsafe or invalid."""


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChildConfig(StrictModel):
    display_name: str = Field(min_length=1, max_length=24)


class CompanionConfig(StrictModel):
    name: str = Field(min_length=1, max_length=24)


class UiConfig(StrictModel):
    max_hub_choices: int = Field(default=6, ge=1, le=6)
    inactivity_seconds: int = Field(default=300, ge=30, le=3600)
    pointer_visible: bool = True


class ActivitiesConfig(StrictModel):
    enabled: list[str] = Field(min_length=1)
    difficulty: Literal["easy", "medium", "hard"] = "easy"


class RewardsConfig(StrictModel):
    first_try_stars: int = Field(default=3, ge=0, le=5)
    after_hint_stars: int = Field(default=2, ge=0, le=5)
    assisted_stars: int = Field(default=1, ge=0, le=5)
    delight_probability: float = Field(default=0.15, ge=0.0, le=0.30)

    @model_validator(mode="after")
    def validate_order(self) -> RewardsConfig:
        if not self.first_try_stars >= self.after_hint_stars >= self.assisted_stars:
            raise ValueError("reward stars must be monotonically non-increasing")
        return self


class LimitsConfig(StrictModel):
    max_software_volume: float = Field(default=0.65, ge=0.10, le=1.0)
    session_minutes: int | None = Field(default=None, ge=1, le=240)
    video_minutes: int | None = Field(default=None, ge=1, le=120)


class LoggingConfig(StrictModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    retention_days: int = Field(default=14, ge=1, le=90)


class ServerConfig(StrictModel):
    host: str = "127.0.0.1"
    port: int = Field(default=8765, ge=1024, le=65535)

    @model_validator(mode="after")
    def loopback_only(self) -> ServerConfig:
        if self.host not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("production core must bind to a loopback address")
        return self


class PathsConfig(StrictModel):
    state_dir: Path = Path(".local/state")
    content_dir: Path = Path("content/packs")
    migrations_dir: Path = Path("migrations")


class VoiceConfig(StrictModel):
    enabled: bool = False
    model_path: Path = Path(".local/models/vosk-model-small-en-us-0.15")


class AppConfig(StrictModel):
    schema_version: Literal[1]
    child: ChildConfig
    companion: CompanionConfig
    ui: UiConfig = UiConfig()
    activities: ActivitiesConfig
    rewards: RewardsConfig = RewardsConfig()
    limits: LimitsConfig = LimitsConfig()
    logging: LoggingConfig = LoggingConfig()
    server: ServerConfig = ServerConfig()
    paths: PathsConfig = PathsConfig()
    voice: VoiceConfig = VoiceConfig()

    @model_validator(mode="after")
    def companion_is_distinct(self) -> AppConfig:
        if self.child.display_name.casefold() == self.companion.name.casefold():
            raise ValueError("companion name must differ from child display name")
        return self

    def normalized_json(self) -> str:
        return json.dumps(self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))

    def digest(self) -> str:
        return hashlib.sha256(self.normalized_json().encode()).hexdigest()


def load_config(path: Path) -> AppConfig:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ConfigError("configuration root must be a mapping")
        return AppConfig.model_validate(raw)
    except (OSError, yaml.YAMLError, ValidationError) as exc:
        raise ConfigError(f"invalid configuration at {path}: {exc}") from exc
