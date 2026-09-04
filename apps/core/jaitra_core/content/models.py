from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LanguageStrings(StrictModel):
    display_label: str = Field(min_length=1, max_length=40)
    spoken_label: str = Field(min_length=1, max_length=40)
    prompt: str = Field(min_length=1, max_length=100)
    hint: str = Field(min_length=1, max_length=100)


class MediaRef(StrictModel):
    image: str = Field(pattern=r"^[a-z0-9][a-z0-9_./-]*$")
    alt: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=200)
    license: str = Field(min_length=1, max_length=80)


class Concept(StrictModel):
    concept_id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    family: Literal["animals", "colours", "shapes", "everyday_objects", "numbers"]
    status: Literal["approved", "disabled"] = "approved"
    difficulty: Literal["easy", "medium", "hard"] = "easy"
    activities: list[str] = Field(min_length=1)
    language: dict[str, LanguageStrings]
    media: MediaRef

    @model_validator(mode="after")
    def requires_english(self) -> Concept:
        if "en" not in self.language:
            raise ValueError("Release 0.1 concepts require English strings")
        return self


class ActivityPolicy(StrictModel):
    activity_type: str = Field(alias="activityType")
    min_pool_size: int = Field(alias="minPoolSize", ge=2, le=100)
    choice_count: int = Field(alias="choiceCount", ge=2, le=4)
    recent_window: int = Field(alias="recentWindow", ge=0, le=100)
    families: list[str] = Field(min_length=1)


class ContentPack(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    pack_id: str = Field(alias="packId", pattern=r"^[a-z0-9][a-z0-9-]*$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    locale: Literal["en"]
    concepts: list[Concept]
    activities: list[ActivityPolicy]


class ValidationIssue(BaseModel):
    code: str
    path: str
    message: str


class ValidationReport(BaseModel):
    pack_id: str | None = None
    valid: bool
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []
    enabled_activities: list[str] = []
    pack_path: Path
