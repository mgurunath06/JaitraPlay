import json
from pathlib import Path

import anyio
from jaitra_core.api.models import GeneratedQuestion, QuestionRequest
from jaitra_core.config import AppConfig
from jaitra_core.providers import QuestionGenerationError
from jaitra_core.providers.variety import local_question, repeats_question
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
        finally:
            runtime.stop()

    anyio.run(exercise)
