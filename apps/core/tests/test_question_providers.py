import json
from pathlib import Path

import anyio
import pytest
from jaitra_core.api.models import QuestionRequest
from jaitra_core.config import AppConfig
from jaitra_core.providers.questions import AiQuestionService, QuestionGenerationError
from jaitra_core.providers.variety import local_question_candidates
from jaitra_core.runtime import CoreRuntime


def test_provider_fallback_order(repository_root: Path) -> None:
    service = AiQuestionService(repository_root)

    profiles = service.profile_paths()

    assert [name for name, _path in profiles] == ["mwapi", "startupapi", "openrouter"]
    assert profiles[0][1].name == "settings.local.json"
    assert profiles[1][1].name in {
        "settings.startupapi.json",
        "settings.startupapi.example.json",
    }
    assert profiles[2][1].name in {
        "settings.openrouter.json",
        "settings.openrouter.example.json",
    }


@pytest.mark.parametrize(
    ("topic", "expected"),
    [
        ("riddles", "food, fruit, vegetables, or nature/sky"),
        ("objects", "everyday household, school"),
        ("colours", "simple English colour name"),
        ("geography", "factually correct, child-friendly geography/map"),
        ("patterns", "constant positive step of 1 to 5"),
    ],
)
def test_riddle_prompt_uses_requested_topic(topic: str, expected: str) -> None:
    prompt = AiQuestionService._prompt("riddle_guess", QuestionRequest(topic=topic))
    assert expected in prompt
    assert f'"topic":"{topic}"' in prompt


def test_riddle_prompt_keeps_generic_rule_without_topic() -> None:
    prompt = AiQuestionService._prompt("riddle_guess", QuestionRequest())
    assert "Create either a short what-am-I riddle, a colour question" in prompt
    assert '"topic":' not in prompt


def provider_json(**updates: object) -> str:
    data: dict[str, object] = {
        "prompt": "Which continent is the largest?",
        "hint": "It includes India.",
        "choices": [
            {"value": "asia", "label": "Asia", "color": None},
            {"value": "africa", "label": "Africa", "color": None},
            {"value": "europe", "label": "Europe", "color": None},
            {"value": "antarctica", "label": "Antarctica", "color": None},
        ],
        "answer": "asia",
        "explanation": "Asia is the largest continent.",
    }
    data.update(updates)
    return json.dumps(data)


def test_validate_stamps_requested_topic_and_rejects_mismatch() -> None:
    request = QuestionRequest(topic="geography")
    question = AiQuestionService._validate(
        provider_json(), "riddle_guess", "mwapi", request
    )
    assert question.topic == "geography"
    with pytest.raises(QuestionGenerationError, match="topic mismatch"):
        AiQuestionService._validate(
            provider_json(topic="objects"), "riddle_guess", "mwapi", request
        )


@pytest.mark.parametrize("bad_color", [None, "#xyz123"])
def test_validate_rejects_missing_or_invalid_colour_hex(bad_color: str | None) -> None:
    choices = [
        {"value": name, "label": name, "color": hex_value}
        for name, hex_value in (
            ("blue", "#2563eb"), ("red", "#ef4444"),
            ("green", "#16a34a"), ("yellow", bad_color),
        )
    ]
    with pytest.raises(QuestionGenerationError, match="valid hex"):
        AiQuestionService._validate(
            provider_json(choices=choices, answer="blue"),
            "riddle_guess", "mwapi", QuestionRequest(topic="colours"),
        )


def test_validate_number_pattern_checks_the_next_number() -> None:
    choices = [
        {"value": str(number), "label": str(number), "color": None}
        for number in (8, 9, 10, 11)
    ]
    request = QuestionRequest(topic="patterns")
    valid = provider_json(
        prompt="What number comes next? 2, 4, 6, 8, ?",
        choices=choices,
        answer="10",
    )
    assert AiQuestionService._validate(valid, "riddle_guess", "mwapi", request).answer == "10"
    with pytest.raises(QuestionGenerationError, match="invalid number pattern"):
        AiQuestionService._validate(
            provider_json(
                prompt="What number comes next? 2, 4, 6, 8, ?",
                choices=choices,
                answer="11",
            ),
            "riddle_guess", "mwapi", request,
        )


def test_runtime_uses_topic_provider_then_local_fallback(
    config: AppConfig, repository_root: Path
) -> None:
    async def exercise() -> None:
        runtime = CoreRuntime(config, repository_root=repository_root)
        runtime.start()
        runtime.provider_availability.mark_available("mwapi")
        provider_question = next(
            question for question in local_question_candidates("riddle_guess")
            if question.topic == "geography"
        ).model_copy(update={"provider": "mwapi"})
        calls = 0

        async def generate_with(
            _provider: str, _activity: str, request: QuestionRequest
        ) -> object:
            nonlocal calls
            calls += 1
            assert request.topic == "geography"
            if calls == 2:
                raise QuestionGenerationError("provider unavailable")
            return provider_question

        runtime.questions.generate_with = generate_with  # type: ignore[method-assign]
        try:
            first = await runtime.generate_question(
                "riddle_guess", QuestionRequest(topic="geography")
            )
            assert first.provider == "mwapi"
            assert first.topic == "geography"
            bank = json.loads(runtime.question_bank.path.read_text(encoding="utf-8"))
            assert any(
                entry["question"]["topic"] == "geography"
                and entry["question"]["provider"] == "mwapi"
                for entry in bank["questions"]
            )
            second = await runtime.generate_question(
                "riddle_guess", QuestionRequest(topic="geography")
            )
            assert calls == 2
            assert second.provider == "local"
            assert second.topic == "geography"
        finally:
            runtime.stop()

    anyio.run(exercise)
