"""Background provider checks and the routing flag used by question requests."""

from __future__ import annotations

import json
import logging
import threading
from datetime import UTC, datetime
from pathlib import Path

from jaitra_core.providers.healthcheck import probe
from jaitra_core.providers.questions import AiQuestionService, ProviderName

logger = logging.getLogger(__name__)


class ProviderAvailabilityService:
    def __init__(
        self,
        questions: AiQuestionService,
        state_dir: Path,
        *,
        check_interval_seconds: float = 300,
        probe_timeout_seconds: float = 5,
    ) -> None:
        self.questions = questions
        self.path = state_dir / "question-provider-status.json"
        self.check_interval_seconds = check_interval_seconds
        self.probe_timeout_seconds = probe_timeout_seconds
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._worker: threading.Thread | None = None
        self._statuses: dict[ProviderName, bool | None] = {
            name: None for name, _path in questions.profile_paths()
        }
        self._available_provider: ProviderName | None = None
        self._checked_at: str | None = None

    @property
    def available_provider(self) -> ProviderName | None:
        with self._lock:
            return self._available_provider

    def start(self) -> None:
        if self._worker is not None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._stop_event.clear()
        self._worker = threading.Thread(
            target=self._run, name="question-provider-monitor", daemon=True
        )
        self._worker.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._worker is not None:
            self._worker.join(
                timeout=(len(self.questions.profile_paths()) * self.probe_timeout_seconds) + 1
            )
            self._worker = None

    def mark_failed(self, provider: ProviderName) -> None:
        """Remove a failed provider immediately; the monitor alone retries it."""
        with self._lock:
            self._statuses[provider] = False
            self._choose_provider_locked()
            self._save_locked()

    def mark_available(self, provider: ProviderName) -> None:
        with self._lock:
            self._statuses[provider] = True
            self._choose_provider_locked()
            self._save_locked()

    def check_now(self) -> None:
        statuses: dict[ProviderName, bool] = {}
        for name, path in self.questions.profile_paths():
            if self._stop_event.is_set():
                return
            result = probe(path, self.probe_timeout_seconds)
            statuses[name] = result.get("status") == "healthy"
        with self._lock:
            self._statuses.update(statuses)
            self._checked_at = datetime.now(UTC).isoformat()
            self._choose_provider_locked()
            self._save_locked()
            logger.info(
                "QUESTION_PROVIDER_STATUS available=%s", self._available_provider or "none"
            )

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {
                "available": self._available_provider is not None,
                "provider": self._available_provider,
                "checkedAt": self._checked_at,
                "providers": {
                    name: (
                        "available"
                        if available is True
                        else "unavailable"
                        if available is False
                        else "unknown"
                    )
                    for name, available in self._statuses.items()
                },
            }

    def _run(self) -> None:
        while not self._stop_event.is_set():
            self.check_now()
            self._stop_event.wait(self.check_interval_seconds)

    def _choose_provider_locked(self) -> None:
        self._available_provider = next(
            (name for name, _path in self.questions.profile_paths() if self._statuses[name]),
            None,
        )

    def _save_locked(self) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(self.snapshot(), separators=(",", ":")) + "\n", encoding="utf-8"
        )
        temporary.replace(self.path)
