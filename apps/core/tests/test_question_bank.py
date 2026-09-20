import threading
import time
from pathlib import Path
from unittest.mock import patch

from jaitra_core.providers import AiQuestionService, ProviderAvailabilityService, QuestionBank


def test_bank_persists_a_reserve_for_every_activity(tmp_path: Path) -> None:
    bank = QuestionBank(tmp_path / "question-bank")
    bank.start()
    try:
        stats = bank.stats()
        assert Path(str(stats["path"])).is_file()
        assert stats["total"] == 1360
        assert stats["undisplayed"] == 1360
        assert [
            stats["undisplayedByActivity"][activity]
            for activity in ("picture_guess", "colours_shapes", "memory_cards", "riddle_guess")
        ] == [205] * 4  # type: ignore[index]
        assert [
            stats["undisplayedByActivity"][activity]
            for activity in (
                "rhyme_time",
                "good_manners",
                "counting_numbers",
                "shapes_sorting",
                "animal_sounds",
                "daily_routine",
            )
        ] == [90] * 6  # type: ignore[index]

        history = []
        for _ in range(25):
            question = bank.take("picture_guess", history)
            history.insert(0, question)
        stats = bank.stats()
        assert stats["total"] <= 1500
        assert stats["undisplayedByActivity"]["picture_guess"] >= 200  # type: ignore[index]
    finally:
        bank.stop()

    restarted = QuestionBank(tmp_path / "question-bank")
    restarted.start()
    try:
        assert restarted.stats()["total"] <= 1500
        assert restarted.stats()["displayed"] >= 25
    finally:
        restarted.stop()


def test_provider_monitor_stops_at_first_success_and_invalidates_it_on_failure(
    tmp_path: Path,
) -> None:
    questions = AiQuestionService(tmp_path)
    service = ProviderAvailabilityService(questions, tmp_path)

    with patch(
        "jaitra_core.providers.availability.probe",
        return_value={"status": "healthy"},
    ):
        service.check_now()

    assert service.available_provider == "mwapi"
    service.mark_failed("mwapi")
    assert service.available_provider is None
    snapshot = service.snapshot()
    assert snapshot["available"] is False
    assert snapshot["providers"]["startupapi"] == "unknown"  # type: ignore[index]
    assert (tmp_path / "question-provider-status.json").is_file()


def test_provider_monitor_only_probes_during_activity_and_stops_after_success(
    tmp_path: Path,
) -> None:
    questions = AiQuestionService(tmp_path)
    service = ProviderAvailabilityService(questions, tmp_path, check_interval_seconds=0.02)
    probed = threading.Event()
    with patch(
        "jaitra_core.providers.availability.probe",
        side_effect=lambda *_args: probed.set() or {"status": "healthy"},
    ) as mocked:
        service.start()
        try:
            time.sleep(0.05)
            assert mocked.call_count == 0
            service.note_activity()
            assert probed.wait(0.5)
            first_count = mocked.call_count
            service.note_activity()
            time.sleep(0.06)
            assert mocked.call_count == first_count
        finally:
            service.stop()
