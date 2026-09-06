"""Device-local enrollment; facial descriptors only, never camera images."""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class IdentityProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    version: Literal[1] = 1
    model: Literal["face-api-1.7.15-recognition"] = "face-api-1.7.15-recognition"
    name: Literal["Jaitra"] = "Jaitra"
    descriptors: list[list[float]] = Field(min_length=6, max_length=12)

    @field_validator("descriptors")
    @classmethod
    def validate_descriptors(cls, values: list[list[float]]) -> list[list[float]]:
        if any(len(v) != 128 or not 0.1 < sum(x * x for x in v) < 10 for v in values):
            raise ValueError("invalid face descriptors")
        return values


class IdentityStore:
    def __init__(self, state_dir: Path) -> None:
        self.path = state_dir / "identity" / "jaitra.json"
        self.lock = threading.Lock()

    def read(self) -> IdentityProfile | None:
        with self.lock:
            try:
                return IdentityProfile.model_validate_json(self.path.read_text())
            except FileNotFoundError:
                return None
            except (OSError, ValidationError) as exc:
                raise RuntimeError("IDENTITY_PROFILE_UNREADABLE") from exc

    def save(self, profile: IdentityProfile) -> None:
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            temporary = self.path.with_suffix(".tmp")
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            try:
                with os.fdopen(fd, "w") as output:
                    output.write(profile.model_dump_json())
                    output.flush()
                    os.fsync(output.fileno())
                temporary.replace(self.path)
            finally:
                temporary.unlink(missing_ok=True)

    def delete(self) -> None:
        with self.lock:
            self.path.unlink(missing_ok=True)
