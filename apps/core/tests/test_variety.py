import json
import random
from pathlib import Path

import anyio
from jaitra_core.api.models import GeneratedQuestion, QuestionRequest
from jaitra_core.config import AppConfig
from jaitra_core.providers import QuestionGenerationError
from jaitra_core.providers.variety import (
    local_question,
    local_question_candidates,
    repeats_question,
    shuffle_question_choices,
)
from jaitra_core.runtime import CoreRuntime


def test_local_variety_and_room_hunts() -> None:
    for activity in ("picture_guess", "colours_shapes", "memory_cards", "riddle_guess"):
        history: list[GeneratedQuestion] = []
        for _ in range(12):
            question = local_question(activity, history)
            assert question.prompt not in [old.prompt for old in history]
            if question.kind != "room_hunt":
                assert question.answer in {choice.value for choice in question.choices}
                assert len(question.choices) == (3 if activity == "memory_cards" else 4)
            history.insert(0, question)
        if activity == "colours_shapes":
            assert {q.kind for q in history} == {"quiz", "room_hunt"}


def test_reworded_same_target_is_rejected_across_games() -> None:
    first = local_question("picture_guess", [])
    reworded = first.model_copy(update={"activity_id": "riddle_guess", "prompt": "Who am I?"})
    assert repeats_question(reworded, [first], [first.prompt])


def test_riddle_choices_are_shuffled_without_changing_the_answer() -> None:
    original = local_question_candidates("riddle_guess")[0]
    assert original.choices[0].value == original.answer
    shuffled = shuffle_question_choices(original, random.Random(7))
    assert shuffled.answer == original.answer
    assert {choice.value for choice in shuffled.choices} == {
        choice.value for choice in original.choices
    }
    assert shuffled.choices != original.choices


def test_history_survives_restart_and_provider_duplicates(
    config: AppConfig,
    repository_root: Path,
) -> None:
    original = local_question("picture_guess", []).model_copy(update={"provider": "mwapi"})

    async def repeat(_activity: str, _request: QuestionRequest) -> GeneratedQuestion:
        return original

    async def exercise() -> None:
        runtime = CoreRuntime(config, repository_root=repository_root)
        runtime.start()
        runtime.questions.generate = repeat  # type: ignore[method-assign]
        first = await runtime.generate_question("picture_guess", QuestionRequest())
        runtime.stop()
        restarted = CoreRuntime(config, repository_root=repository_root)
        restarted.start()
        restarted.questions.generate = repeat  # type: ignore[method-assign]
        try:
            second = await restarted.generate_question("picture_guess", QuestionRequest())
            third = await restarted.generate_question("picture_guess", QuestionRequest())
            assert len({first.prompt, second.prompt, third.prompt}) == 3
            assert len(restarted.database.recent_questions()) == 3
        finally:
            restarted.stop()

    anyio.run(exercise)


def test_offline_games_and_history_retention(config: AppConfig, repository_root: Path) -> None:
    async def unavailable(_activity: str, _request: QuestionRequest) -> GeneratedQuestion:
        raise QuestionGenerationError("offline")

    async def exercise() -> None:
        runtime = CoreRuntime(config, repository_root=repository_root)
        runtime.start()
        runtime.questions.generate = unavailable  # type: ignore[method-assign]
        try:
            for _ in range(125):
                await runtime.generate_question("picture_guess", QuestionRequest())
            records = runtime.database.recent_questions()
            assert len(records) == 120
            assert len({json.loads(raw)["prompt"] for raw in records}) == 120
            bank = runtime.question_bank.stats()
            assert bank["total"] <= 1000
            assert all(
                count >= 200
                for count in bank["undisplayedByActivity"].values()  # type: ignore[union-attr]
            )
        finally:
            runtime.stop()

    anyio.run(exercise)


def test_failed_provider_is_not_retried_by_the_next_question(
    config: AppConfig, repository_root: Path
) -> None:
    async def exercise() -> None:
        runtime = CoreRuntime(config, repository_root=repository_root)
        runtime.start()
        calls = 0

        async def unavailable(
            _provider: str, _activity: str, _request: QuestionRequest
        ) -> GeneratedQuestion:
            nonlocal calls
            calls += 1
            raise QuestionGenerationError("offline")

        runtime.questions.generate_with = unavailable  # type: ignore[method-assign]
        runtime.provider_availability.mark_available("mwapi")
        try:
            first = await runtime.generate_question("picture_guess", QuestionRequest())
            second = await runtime.generate_question("picture_guess", QuestionRequest())
            assert first.provider == "local"
            assert second.provider == "local"
            assert calls == 1
            assert runtime.provider_availability.available_provider is None
        finally:
            runtime.stop()

    anyio.run(exercise)
