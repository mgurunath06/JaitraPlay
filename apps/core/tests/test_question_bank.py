from pathlib import Path
from unittest.mock import patch

from jaitra_core.providers import AiQuestionService, ProviderAvailabilityService, QuestionBank


def test_bank_persists_a_reserve_for_every_activity(tmp_path: Path) -> None:
    bank = QuestionBank(tmp_path / "question-bank")
    bank.start()
    try:
        stats = bank.stats()
        assert Path(str(stats["path"])).is_file()
        assert stats["total"] == 880
        assert stats["undisplayed"] == 880
        assert set(stats["undisplayedByActivity"].values()) == {220}  # type: ignore[union-attr]

        history = []
        for _ in range(25):
            question = bank.take("picture_guess", history)
            history.insert(0, question)
        stats = bank.stats()
        assert stats["total"] <= 1000
        assert stats["undisplayedByActivity"]["picture_guess"] >= 200  # type: ignore[index]
    finally:
        bank.stop()

    restarted = QuestionBank(tmp_path / "question-bank")
    restarted.start()
    try:
        assert restarted.stats()["total"] <= 1000
        assert restarted.stats()["displayed"] >= 25
    finally:
        restarted.stop()


def test_provider_monitor_selects_priority_and_moves_after_failure(tmp_path: Path) -> None:
    questions = AiQuestionService(tmp_path)
    service = ProviderAvailabilityService(questions, tmp_path)

    with patch(
        "jaitra_core.providers.availability.probe",
        return_value={"status": "healthy"},
    ):
        service.check_now()

    assert service.available_provider == "mwapi"
    service.mark_failed("mwapi")
    assert service.available_provider == "startupapi"
    snapshot = service.snapshot()
    assert snapshot["available"] is True
    assert snapshot["provider"] == "startupapi"
    assert (tmp_path / "question-provider-status.json").is_file()
