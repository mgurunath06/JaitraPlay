from pathlib import Path

from jaitra_core.providers.questions import AiQuestionService


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
