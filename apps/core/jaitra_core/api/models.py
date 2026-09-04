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
    provider: Literal["mwapi", "openrouter"]


class CapabilitySnapshot(StrictModel):
    voice: Literal["DISABLED"] = "DISABLED"
    camera: Literal["DISABLED"] = "DISABLED"


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
