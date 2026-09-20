import json
import random
import re
from pathlib import Path

import anyio
from jaitra_core.api.models import GeneratedQuestion, QuestionRequest
from jaitra_core.config import AppConfig
from jaitra_core.providers import QuestionGenerationError
from jaitra_core.providers.variety import (
    ANIMAL_SOUNDS,
    RHYME_FAMILIES,
    local_question,
    local_question_candidates,
    repeats_question,
    shuffle_question_choices,
)
from jaitra_core.runtime import LOCAL_ONLY_ACTIVITIES, CoreRuntime


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


def test_riddle_garden_has_a_large_mix_of_riddles_colours_and_geography() -> None:
    questions = local_question_candidates("riddle_guess")
    prompts = {question.prompt for question in questions}
    assert len(prompts) >= 500
    assert any("map" in prompt.casefold() for prompt in prompts)
    assert any("continent" in prompt.casefold() for prompt in prompts)
    assert any(any(choice.color for choice in question.choices) for question in questions)
    assert {question.topic for question in questions} == {
        "riddles",
        "objects",
        "colours",
        "geography",
        "patterns",
    }
    assert all(
        question.topic == "objects"
        for question in questions
        if question.answer in {"comb", "chair"}
    )
    patterns = [question for question in questions if question.topic == "patterns"]
    assert any("number comes next" in question.prompt for question in patterns)
    assert any("this pattern" in question.prompt for question in patterns)
    assert all(
        question.answer in {choice.value for choice in question.choices} for question in patterns
    )


def test_new_local_games_have_large_valid_quiz_pools() -> None:
    assert len(LOCAL_ONLY_ACTIVITIES) == 6
    for activity in LOCAL_ONLY_ACTIVITIES:
        questions = local_question_candidates(activity)
        assert len({question.prompt for question in questions}) >= 150
        assert all(
            question.provider == "local" and question.kind == "quiz" for question in questions
        )
        assert all(len(question.choices) == 4 for question in questions)
        assert all(
            len({choice.value for choice in question.choices}) == 4 for question in questions
        )
        assert all(
            question.answer in {choice.value for choice in question.choices}
            for question in questions
        )


def test_counting_answers_match_pictures_and_comparisons() -> None:
    questions = local_question_candidates("counting_numbers")
    for question in questions:
        if question.prompt.startswith("How many "):
            pictures = question.prompt.split("? ", 1)[1].split()
            assert question.answer == str(len(pictures))
            assert len(set(pictures)) == 1
        elif question.prompt.startswith("Which is "):
            match = re.fullmatch(r"Which is (more|less), (\d+) or (\d+)\?", question.prompt)
            assert match is not None
            first, second = int(match[2]), int(match[3])
            assert question.answer == str(
                max(first, second) if match[1] == "more" else min(first, second)
            )


def test_rhymes_and_animal_sounds_have_one_factually_correct_choice() -> None:
    family_by_word = {
        word: index for index, family in enumerate(RHYME_FAMILIES) for word, _ in family
    }
    for question in local_question_candidates("rhyme_time"):
        target = next(word for word in family_by_word if re.search(rf"\b{word}\b", question.prompt))
        matching = [
            choice.value
            for choice in question.choices
            if family_by_word[choice.value] == family_by_word[target]
        ]
        assert matching == [question.answer]
        assert question.answer != target

    sound_by_animal = {animal: sound for animal, _emoji, sound in ANIMAL_SOUNDS}
    animal_by_sound = {sound: animal for animal, sound in sound_by_animal.items()}
    for question in local_question_candidates("animal_sounds"):
        if question.answer in sound_by_animal:
            assert sound_by_animal[question.answer] in question.prompt
        else:
            assert animal_by_sound[question.answer] in question.prompt


def test_odd_shape_questions_have_one_different_picture() -> None:
    for question in local_question_candidates("shapes_sorting"):
        if not question.prompt.startswith("Which shape is different?"):
            continue
        pictures = question.prompt.split("? ", 1)[1].split()
        assert len(pictures) == 4
        assert sorted(pictures.count(picture) for picture in set(pictures)) == [1, 3]
        odd_picture = next(picture for picture in pictures if pictures.count(picture) == 1)
        assert question.answer == str(pictures.index(odd_picture) + 1)


def test_daily_routine_next_steps_are_correct() -> None:
    expected = {
        "just woke up": "brush_teeth",
        "is about to eat": "wash_hands",
        "finished breakfast": "put_plate_away",
        "has muddy shoes": "clean_shoes",
        "sees rain before going outside": "take_umbrella",
        "feels thirsty after playing": "drink_water",
        "finished playing with toys": "tidy_toys",
        "is ready to cross a road": "look_both_ways",
        "is getting ready for bed": "brush_teeth",
        "came home from outside": "wash_hands",
        "spilled water on the floor": "wipe_spill",
        "feels cold before a walk": "wear_coat",
    }
    for question in local_question_candidates("daily_routine"):
        matches = [answer for situation, answer in expected.items() if situation in question.prompt]
        assert matches == [question.answer]


def test_new_games_never_call_an_online_provider(config: AppConfig, repository_root: Path) -> None:
    async def exercise() -> None:
        runtime = CoreRuntime(config, repository_root=repository_root)
        runtime.start()
        runtime.provider_availability.mark_available("mwapi")
        calls = 0

        async def generate_with(*_args: object) -> GeneratedQuestion:
            nonlocal calls
            calls += 1
            raise AssertionError("local-only game called the provider")

        runtime.questions.generate_with = generate_with  # type: ignore[method-assign]
        try:
            for activity in LOCAL_ONLY_ACTIVITIES:
                question = await runtime.generate_question(activity, QuestionRequest())
                assert question.provider == "local"
                assert question.answer in {choice.value for choice in question.choices}
            assert calls == 0
        finally:
            runtime.stop()

    anyio.run(exercise)


def test_riddle_topic_request_is_enforced_offline(config: AppConfig, repository_root: Path) -> None:
    async def exercise() -> None:
        runtime = CoreRuntime(config, repository_root=repository_root)
        runtime.start()
        try:
            for topic in ("riddles", "objects", "colours", "geography", "patterns"):
                for _ in range(3):
                    question = await runtime.generate_question(
                        "riddle_guess", QuestionRequest(topic=topic)
                    )
                    assert question.topic == topic
        finally:
            runtime.stop()

    anyio.run(exercise)


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
            assert bank["total"] <= 1500
            assert all(
                count >= bank["minimumUndisplayedByActivity"][activity]  # type: ignore[index]
                for activity, count in bank["undisplayedByActivity"].items()  # type: ignore[union-attr]
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
