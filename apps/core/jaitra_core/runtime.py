from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from jaitra_core import __version__
from jaitra_core.api.models import (
    ActivityDescriptor,
    CapabilitySnapshot,
    CommandEnvelope,
    CommandResult,
    ErrorDetail,
    ErrorEnvelope,
    GeneratedQuestion,
    QuestionRequest,
    SnapshotPayload,
    StateSnapshot,
    StorybookSnapshot,
)
from jaitra_core.config import AppConfig
from jaitra_core.content import ContentCatalog
from jaitra_core.observability import ComponentHealth, HealthModel, HealthState, log_event
from jaitra_core.persistence import Database
from jaitra_core.providers import (
    AiQuestionService,
    ProviderAvailabilityService,
    QuestionBank,
    QuestionGenerationError,
    StorybookService,
)
from jaitra_core.providers.variety import repeats_question
from jaitra_core.state import StateMachine, TransitionError
from jaitra_core.voice import VoiceService

logger = logging.getLogger(__name__)

APP_CATALOG = (
    {
        "activity_id": "picture_guess",
        "title": "Picture Guess",
        "description": "Explore pictures, counting and odd-one-out puzzles.",
        "icon": "🐘",
    },
    {
        "activity_id": "colours_shapes",
        "title": "Colour Quest",
        "description": "Explore colours, shapes and room treasure hunts.",
        "icon": "🎨",
    },
    {
        "activity_id": "memory_cards",
        "title": "Memory Match",
        "description": "Turn over cards and find every pair.",
        "icon": "🧠",
    },
    {
        "activity_id": "riddle_guess",
        "title": "Riddle Garden",
        "description": "Listen to clues and discover the answer.",
        "icon": "🌱",
    },
    {
        "activity_id": "storybook",
        "title": "Mimo’s Storybook",
        "description": "Create and explore a new illustrated story.",
        "icon": "📖",
    },
)
QUESTION_ACTIVITY_IDS = {"picture_guess", "colours_shapes", "memory_cards", "riddle_guess"}


class CoreRuntime:
    def __init__(self, config: AppConfig, *, repository_root: Path) -> None:
        self.config = config
        self.repository_root = repository_root
        self.health = HealthModel()
        self.voice = VoiceService(self._resolve(config.voice.model_path), config.voice.enabled)
        self.state_machine = StateMachine()
        state_dir = self._resolve(config.paths.state_dir)
        self.database = Database(
            state_dir / "jaitra.db", self._resolve(config.paths.migrations_dir)
        )
        self.catalog = ContentCatalog(self._resolve(config.paths.content_dir))
        self.questions = AiQuestionService(repository_root)
        self.question_bank = QuestionBank(state_dir / "question-bank")
        self.provider_availability = ProviderAvailabilityService(
            self.questions, state_dir
        )
        self.storybooks = StorybookService(repository_root, state_dir)
        self._question_lock = asyncio.Lock()
        self.enabled_activities: list[str] = []

    def start(self) -> None:
        try:
            self.voice.start()
            self.database.open()
            self.database.migrate(__version__)
            self.database.record_settings(self.config.digest(), self.config.normalized_json())
            if not self.database.integrity_check():
                raise RuntimeError("database integrity check failed")
            self.health.storage = ComponentHealth(state=HealthState.HEALTHY)
            self.question_bank.start()

            reports = self.catalog.load()
            valid_reports = [report for report in reports if report.valid]
            requested = set(self.config.activities.enabled)
            available = {item for report in valid_reports for item in report.enabled_activities}
            self.enabled_activities = sorted(requested & available)
            if not self.enabled_activities:
                raise RuntimeError("no configured activity has a valid content pool")
            self.health.content = ComponentHealth(
                state=HealthState.HEALTHY
                if len(valid_reports) == len(reports)
                else HealthState.DEGRADED,
                reason_code=None if len(valid_reports) == len(reports) else "CONTENT_PARTIAL",
            )
            self.state_machine.mark_ready()
            self.health.core = ComponentHealth(state=HealthState.HEALTHY)
            log_event(logger, logging.INFO, "CORE_READY", "runtime")
        except Exception:
            self.health.core = ComponentHealth(
                state=HealthState.FATAL, reason_code="BOOTSTRAP_FAILED"
            )
            self.state_machine.mark_fatal()
            log_event(
                logger, logging.ERROR, "CORE_FATAL", "runtime", reason_code="BOOTSTRAP_FAILED"
            )

    def start_background_services(self) -> None:
        if self.health.ready:
            self.provider_availability.start()

    def stop(self) -> None:
        self.provider_availability.stop()
        self.question_bank.stop()
        self.storybooks.stop()
        self.database.close()

    def snapshot(self) -> StateSnapshot:
        return StateSnapshot(
            payload=SnapshotPayload(
                appState=self.state_machine.state,
                childDisplayName=self.config.child.display_name,
                companionName=self.config.companion.name,
                capabilities=CapabilitySnapshot(
                    voice="AVAILABLE" if self.voice.available else "DISABLED"
                ),
                activities=[
                    ActivityDescriptor(
                        activityId=item["activity_id"],
                        title=item["title"],
                        description=item["description"],
                        icon=item["icon"],
                        availability="AVAILABLE",
                    )
                    for item in APP_CATALOG[: self.config.ui.max_hub_choices]
                ],
            )
        )

    async def generate_question(
        self, activity_id: str, request: QuestionRequest
    ) -> GeneratedQuestion:
        if activity_id not in QUESTION_ACTIVITY_IDS:
            raise QuestionGenerationError("unsupported activity")
        async with self._question_lock:
            history = [
                GeneratedQuestion.model_validate_json(raw)
                for raw in self.database.recent_questions()
            ]
            if request.previous_prompt and request.needed_hint:
                self.database.record_hint_used(activity_id, request.previous_prompt)
            # History belongs to the appliance, including questions from other games.
            recent = list(dict.fromkeys([item.prompt for item in history] + request.recent_prompts))
            adapted = request.model_copy(update={"recent_prompts": recent})
            provider = self.provider_availability.available_provider
            if provider is not None:
                try:
                    question = await self.questions.generate_with(provider, activity_id, adapted)
                    if repeats_question(question, history, recent):
                        question = self.question_bank.take(activity_id, history)
                    else:
                        self.question_bank.record_displayed(question)
                except QuestionGenerationError:
                    self.provider_availability.mark_failed(provider)
                    question = self.question_bank.take(activity_id, history)
            else:
                question = self.question_bank.take(activity_id, history)
            self.database.record_question(activity_id, question.model_dump_json(by_alias=True))
            return question

    def start_storybook(self, topic: str | None) -> StorybookSnapshot:
        return self.storybooks.start(topic)

    def storybook(self, story_id: str) -> StorybookSnapshot:
        return self.storybooks.get(story_id)

    def dispatch(self, command: CommandEnvelope) -> CommandResult | ErrorEnvelope:
        connection = self.database.connection
        if connection is None:
            raise RuntimeError("runtime is not started")
        existing = connection.execute(
            "SELECT result_json FROM command_receipts WHERE request_id = ?",
            (str(command.request_id),),
        ).fetchone()
        if existing:
            data = json.loads(existing["result_json"])
            if data.get("type") == "ERROR":
                return ErrorEnvelope.model_validate(data)
            return CommandResult.model_validate(data)

        try:
            state = self.state_machine.dispatch(command.type)
            result: CommandResult | ErrorEnvelope = CommandResult(
                requestId=command.request_id,
                resultCode="STATE_CHANGED",
                payload={"appState": state},
            )
        except TransitionError as exc:
            result = ErrorEnvelope(
                requestId=command.request_id,
                error=ErrorDetail(code=exc.code, reasonCode="CMD_004"),
            )

        serialized = result.model_dump_json(by_alias=True)
        with self.database.transaction() as transaction:
            transaction.execute(
                "INSERT INTO command_receipts(request_id, command_type, result_code, result_json) "
                "VALUES (?, ?, ?, ?)",
                (
                    str(command.request_id),
                    command.type,
                    "OK" if isinstance(result, CommandResult) else result.error.code,
                    serialized,
                ),
            )
        return result

    def _resolve(self, path: Path) -> Path:
        return path if path.is_absolute() else self.repository_root / path
