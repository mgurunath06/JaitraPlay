from pathlib import Path


def test_release_01a1_has_no_provider_modules(repository_root: Path) -> None:
    core = repository_root / "apps/core/jaitra_core"
    forbidden = ["voice", "presence", "profile", "adaptation", "providers"]
    assert all(not (core / name).exists() for name in forbidden)
