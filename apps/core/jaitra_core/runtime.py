from __future__ import annotations

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
    SnapshotPayload,
    StateSnapshot,
)
from jaitra_core.config import AppConfig
from jaitra_core.content import ContentCatalog
from jaitra_core.observability import ComponentHealth, HealthModel, HealthState, log_event
from jaitra_core.persistence import Database
from jaitra_core.state import StateMachine, TransitionError

logger = logging.getLogger(__name__)


class CoreRuntime:
    def __init__(self, config: AppConfig, *, repository_root: Path) -> None:
        self.config = config
        self.repository_root = repository_root
        self.health = HealthModel()
        self.state_machine = StateMachine()
        state_dir = self._resolve(config.paths.state_dir)
        self.database = Database(
            state_dir / "jaitra.db", self._resolve(config.paths.migrations_dir)
        )
        self.catalog = ContentCatalog(self._resolve(config.paths.content_dir))
        self.enabled_activities: list[str] = []

    def start(self) -> None:
        try:
            self.database.open()
            self.database.migrate(__version__)
            self.database.record_settings(self.config.digest(), self.config.normalized_json())
            if not self.database.integrity_check():
                raise RuntimeError("database integrity check failed")
            self.health.storage = ComponentHealth(state=HealthState.HEALTHY)

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
            raise

    def stop(self) -> None:
        self.database.close()

    def snapshot(self) -> StateSnapshot:
        titles = {
            "picture_guess": "Picture Guess",
            "colours_shapes": "Colours & Shapes",
            "memory_cards": "Memory Cards",
            "riddle_guess": "Riddle Guess",
            "what_comes_next": "What Comes Next?",
        }
        return StateSnapshot(
            payload=SnapshotPayload(
                appState=self.state_machine.state,
                childDisplayName=self.config.child.display_name,
                companionName=self.config.companion.name,
                capabilities=CapabilitySnapshot(),
                activities=[
                    ActivityDescriptor(activityId=item, title=titles.get(item, item))
                    for item in self.enabled_activities[: self.config.ui.max_hub_choices]
                ],
            )
        )

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
