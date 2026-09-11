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

    def save(self, profile: IdentityProfile | PersonProfile) -> None:
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


class PersonProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    version: Literal[1] = 1
    model: Literal["face-api-1.7.15-recognition"] = "face-api-1.7.15-recognition"
    id: str = Field(pattern=r"^[a-zA-Z0-9-]{1,64}$")
    name: str = Field(min_length=1, max_length=64, pattern=r".*\S.*")
    relationship: Literal[
        "father", "mother", "sibling", "grandparent", "relative", "friend", "caregiver", "other"
    ]
    descriptors: list[list[float]] = Field(min_length=1, max_length=48)

    @field_validator("descriptors")
    @classmethod
    def validate_descriptors(cls, values: list[list[float]]) -> list[list[float]]:
        return IdentityProfile.validate_descriptors(values)


class PeopleStore:
    """Shared device-local profiles for live and separate enrollment clients."""

    def __init__(self, state_dir: Path) -> None:
        self.directory = state_dir / "identity" / "people"
        self.lock = threading.Lock()

    def read(self) -> list[PersonProfile]:
        with self.lock:
            try:
                return [
                    PersonProfile.model_validate_json(p.read_text())
                    for p in sorted(self.directory.glob("*.json"))
                ]
            except (OSError, ValidationError) as exc:
                raise RuntimeError("PEOPLE_PROFILES_UNREADABLE") from exc

    def save(self, profile: PersonProfile) -> None:
        # Reuse the atomic, private writer; the validated ID cannot traverse paths.
        with self.lock:
            store = IdentityStore(self.directory)
            store.path = self.directory / f"{profile.id}.json"
            store.save(profile)

    def delete(self, person_id: str) -> None:
        import re

        if not re.fullmatch(r"[a-zA-Z0-9-]{1,64}", person_id):
            raise ValueError("Invalid person ID")
        with self.lock:
            (self.directory / f"{person_id}.json").unlink(missing_ok=True)
