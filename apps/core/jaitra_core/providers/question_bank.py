"""Persistent, bounded reserve of curated questions for offline play."""

from __future__ import annotations

import json
import logging
import random
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from jaitra_core.api.models import GeneratedQuestion
from jaitra_core.providers.variety import local_question_candidates, repeats_question

logger = logging.getLogger(__name__)

QUESTION_ACTIVITIES = ("picture_guess", "colours_shapes", "memory_cards", "riddle_guess")
MINIMUM_UNDISPLAYED_PER_ACTIVITY = 200
REFILL_TARGET_PER_ACTIVITY = 220
MAXIMUM_QUESTIONS = 1000
BANK_VERSION = 2


class QuestionBank:
    """Stores unseen and displayed questions in one atomically-written JSON file."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.path = directory / "questions.json"
        self._entries: list[dict[str, Any]] = []
        self._condition = threading.Condition(threading.RLock())
        self._stop_event = threading.Event()
        self._worker: threading.Thread | None = None

    def start(self) -> None:
        if self._worker is not None:
            return
        self.directory.mkdir(parents=True, exist_ok=True)
        with self._condition:
            self._load_locked()
            self._refill_locked()
            self._save_locked()
        self._stop_event.clear()
        self._worker = threading.Thread(
            target=self._run, name="question-bank-builder", daemon=True
        )
        self._worker.start()

    def stop(self) -> None:
        self._stop_event.set()
        with self._condition:
            self._condition.notify_all()
        if self._worker is not None:
            self._worker.join(timeout=5)
            self._worker = None

    def take(
        self, activity_id: str, history: list[GeneratedQuestion]
    ) -> GeneratedQuestion:
        with self._condition:
            unseen = [
                entry
                for entry in self._entries
                if not entry["displayed"]
                and entry["question"]["activityId"] == activity_id
            ]
            if len(unseen) <= MINIMUM_UNDISPLAYED_PER_ACTIVITY:
                self._refill_locked()
                unseen = [
                    entry
                    for entry in self._entries
                    if not entry["displayed"]
                    and entry["question"]["activityId"] == activity_id
                ]
            if not unseen:
                raise RuntimeError(f"question bank is empty for {activity_id}")

            random.SystemRandom().shuffle(unseen)
            recent_prompts = [question.prompt for question in history]
            entry = next(
                (
                    item
                    for item in unseen
                    if not repeats_question(
                        GeneratedQuestion.model_validate(item["question"]),
                        history,
                        recent_prompts,
                    )
                ),
                unseen[0],
            )
            entry["displayed"] = True
            entry["displayedAt"] = self._now()
            self._save_locked()
            self._condition.notify_all()
            return GeneratedQuestion.model_validate(entry["question"])

    def record_displayed(self, question: GeneratedQuestion) -> None:
        """Include a directly-served AI question in the shared 1,000-record cap."""
        with self._condition:
            if not self._make_room_locked():
                raise RuntimeError("question bank cap leaves no room for displayed question")
            self._entries.append(
                {
                    "id": str(uuid4()),
                    "question": question.model_dump(mode="json", by_alias=True),
                    "displayed": True,
                    "createdAt": self._now(),
                    "displayedAt": self._now(),
                }
            )
            self._save_locked()

    def ensure_reserve(self) -> None:
        with self._condition:
            if self._refill_locked():
                self._save_locked()

    def stats(self) -> dict[str, object]:
        with self._condition:
            undisplayed = {
                activity: sum(
                    not entry["displayed"]
                    and entry["question"]["activityId"] == activity
                    for entry in self._entries
                )
                for activity in QUESTION_ACTIVITIES
            }
            return {
                "path": str(self.path),
                "total": len(self._entries),
                "displayed": sum(bool(entry["displayed"]) for entry in self._entries),
                "undisplayed": sum(undisplayed.values()),
                "undisplayedByActivity": undisplayed,
                "minimumUndisplayedPerActivity": MINIMUM_UNDISPLAYED_PER_ACTIVITY,
                "maximumQuestions": MAXIMUM_QUESTIONS,
            }

    def _run(self) -> None:
        while not self._stop_event.is_set():
            with self._condition:
                self._condition.wait_for(
                    lambda: self._stop_event.is_set() or self._needs_refill_locked()
                )
                if self._stop_event.is_set():
                    return
                if self._refill_locked():
                    self._save_locked()

    def _needs_refill_locked(self) -> bool:
        return any(
            sum(
                not entry["displayed"]
                and entry["question"]["activityId"] == activity
                for entry in self._entries
            )
            <= MINIMUM_UNDISPLAYED_PER_ACTIVITY
            for activity in QUESTION_ACTIVITIES
        )

    def _refill_locked(self) -> bool:
        changed = False
        for activity in QUESTION_ACTIVITIES:
            all_candidates = local_question_candidates(activity)
            unseen_count = sum(
                not entry["displayed"]
                and entry["question"]["activityId"] == activity
                for entry in self._entries
            )
            while unseen_count < REFILL_TARGET_PER_ACTIVITY:
                prompts = {str(entry["question"]["prompt"]) for entry in self._entries}
                available = [
                    question
                    for question in all_candidates
                    if question.prompt not in prompts
                ]
                if not available:
                    if not self._remove_oldest_displayed_locked(activity):
                        raise RuntimeError(f"not enough unique local questions for {activity}")
                    changed = True
                    continue
                if not self._make_room_locked():
                    raise RuntimeError("question bank cap leaves no room for its reserve")
                question = random.SystemRandom().choice(available)
                self._entries.append(
                    {
                        "id": str(uuid4()),
                        "question": question.model_dump(mode="json", by_alias=True),
                        "displayed": False,
                        "createdAt": self._now(),
                        "displayedAt": None,
                    }
                )
                unseen_count += 1
                changed = True
        return changed

    def _make_room_locked(self) -> bool:
        while len(self._entries) >= MAXIMUM_QUESTIONS:
            if (
                not self._remove_oldest_displayed_locked()
                and not self._remove_surplus_undisplayed_locked()
            ):
                return False
        return True

    def _remove_surplus_undisplayed_locked(self) -> bool:
        counts = {
            activity: sum(
                not entry["displayed"]
                and entry["question"]["activityId"] == activity
                for entry in self._entries
            )
            for activity in QUESTION_ACTIVITIES
        }
        candidates = [
            entry
            for entry in self._entries
            if not entry["displayed"]
            and counts[entry["question"]["activityId"]] > MINIMUM_UNDISPLAYED_PER_ACTIVITY
        ]
        if not candidates:
            return False
        oldest = min(candidates, key=lambda entry: str(entry["createdAt"]))
        self._entries.remove(oldest)
        return True

    def _remove_oldest_displayed_locked(self, activity_id: str | None = None) -> bool:
        candidates = [
            entry
            for entry in self._entries
            if entry["displayed"]
            and (activity_id is None or entry["question"]["activityId"] == activity_id)
        ]
        if not candidates and activity_id is not None:
            candidates = [entry for entry in self._entries if entry["displayed"]]
        if not candidates:
            return False
        oldest = min(candidates, key=lambda entry: str(entry["displayedAt"] or ""))
        self._entries.remove(oldest)
        return True

    def _load_locked(self) -> None:
        if not self.path.is_file():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if data.get("version") != BANK_VERSION:
                raise ValueError("question bank content version changed")
            entries = data["questions"]
            if not isinstance(entries, list):
                raise ValueError("questions must be a list")
            validated = []
            for entry in entries:
                question = GeneratedQuestion.model_validate(entry["question"])
                validated.append(
                    {
                        "id": str(entry["id"]),
                        "question": question.model_dump(mode="json", by_alias=True),
                        "displayed": bool(entry["displayed"]),
                        "createdAt": str(entry["createdAt"]),
                        "displayedAt": entry.get("displayedAt"),
                    }
                )
            self._entries = validated[-MAXIMUM_QUESTIONS:]
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            logger.warning("QUESTION_BANK_INVALID rebuilding=%s", self.path)
            backup = self.path.with_name(
                f"questions.invalid-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.json"
            )
            self.path.replace(backup)
            self._entries = []

    def _save_locked(self) -> None:
        payload = {"version": BANK_VERSION, "questions": self._entries}
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        temporary.replace(self.path)

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()
