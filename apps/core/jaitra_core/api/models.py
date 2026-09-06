from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from jaitra_core.state import AppState, CommandType


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CommandEnvelope(StrictModel):
    api_version: Literal["1.0"] = Field(alias="apiVersion")
    request_id: UUID = Field(alias="requestId")
    session_id: UUID | None = Field(default=None, alias="sessionId")
    type: CommandType
    payload: dict[str, Any]


class ActivityDescriptor(StrictModel):
    activity_id: str = Field(alias="activityId")
    title: str
    description: str
    icon: str
    availability: Literal["AVAILABLE", "COMING_SOON"]


class QuestionRequest(StrictModel):
    previous_prompt: str | None = Field(default=None, alias="previousPrompt", max_length=200)
    needed_hint: bool = Field(default=False, alias="neededHint")
    recent_prompts: list[str] = Field(default=[], alias="recentPrompts", max_length=10)


class QuestionChoice(StrictModel):
    value: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9_-]+$")
    label: str = Field(min_length=1, max_length=40)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class GeneratedQuestion(StrictModel):
    activity_id: str = Field(alias="activityId")
    prompt: str = Field(min_length=1, max_length=180)
    hint: str = Field(min_length=1, max_length=140)
    choices: list[QuestionChoice]
    answer: str
    explanation: str = Field(min_length=1, max_length=180)
    provider: Literal["mwapi", "startupapi", "openrouter", "local"]
    kind: Literal["quiz", "memory", "room_hunt"] = "quiz"


class TranscriptionRequest(StrictModel):
    audio: str = Field(min_length=4, max_length=1024000)
    sample_rate: Literal[16000, 44100, 48000] = Field(alias="sampleRate")
    phrases: list[str] = Field(default=[], max_length=40)


class StorybookCreateRequest(StrictModel):
    topic: str | None = Field(default=None, min_length=3, max_length=120)


class StorybookPage(StrictModel):
    page_number: int = Field(alias="pageNumber", ge=1, le=15)
    text: str = Field(min_length=1, max_length=280)
    image_ready: bool = Field(default=False, alias="imageReady")


class StorybookSnapshot(StrictModel):
    story_id: str = Field(alias="storyId", pattern=r"^[0-9a-f-]{36}$")
    status: Literal["planning", "illustrating", "ready", "failed"]
    topic: str = Field(min_length=3, max_length=120)
    title: str | None = Field(default=None, max_length=80)
    total_pages: Literal[15] = Field(default=15, alias="totalPages")
    completed_pages: int = Field(default=0, alias="completedPages", ge=0, le=15)
    pages: list[StorybookPage] = Field(default=[])
    text_provider: str | None = Field(default=None, alias="textProvider", max_length=40)
    image_provider: str = Field(default="OpenRouter", alias="imageProvider", max_length=80)
    error: str | None = Field(default=None, max_length=120)


class CapabilitySnapshot(StrictModel):
    voice: Literal["DISABLED", "AVAILABLE"] = "DISABLED"
    camera: Literal["DISABLED", "CLIENT_MANAGED"] = "CLIENT_MANAGED"


class SnapshotPayload(StrictModel):
    app_state: AppState = Field(alias="appState")
    child_display_name: str = Field(alias="childDisplayName")
    companion_name: str = Field(alias="companionName")
    capabilities: CapabilitySnapshot = CapabilitySnapshot()
    activities: list[ActivityDescriptor]


class StateSnapshot(StrictModel):
    api_version: Literal["1.0"] = Field(default="1.0", alias="apiVersion")
    type: Literal["STATE_SNAPSHOT"] = "STATE_SNAPSHOT"
    payload: SnapshotPayload


class CommandResult(StrictModel):
    api_version: Literal["1.0"] = Field(default="1.0", alias="apiVersion")
    request_id: UUID = Field(alias="requestId")
    type: Literal["COMMAND_RESULT"] = "COMMAND_RESULT"
    status: Literal["OK"] = "OK"
    result_code: str = Field(alias="resultCode")
    payload: dict[str, Any]


class ErrorDetail(StrictModel):
    code: str
    reason_code: str = Field(alias="reasonCode")
    child_message: str | None = Field(default=None, alias="childMessage")


class ErrorEnvelope(StrictModel):
    api_version: Literal["1.0"] = Field(default="1.0", alias="apiVersion")
    request_id: UUID = Field(alias="requestId")
    type: Literal["ERROR"] = "ERROR"
    status: Literal["REJECTED"] = "REJECTED"
    error: ErrorDetail
