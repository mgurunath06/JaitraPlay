from __future__ import annotations

from pathlib import Path

import pytest
from jaitra_core.config import AppConfig


@pytest.fixture
def repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


@pytest.fixture
def config(tmp_path: Path, repository_root: Path) -> AppConfig:
    return AppConfig.model_validate(
        {
            "schema_version": 1,
            "child": {"display_name": "JAITRA"},
            "companion": {"name": "Mimo"},
            "activities": {"enabled": ["picture_guess"], "difficulty": "easy"},
            "paths": {
                "state_dir": str(tmp_path / "state"),
                "content_dir": str(repository_root / "content/packs"),
                "migrations_dir": str(repository_root / "migrations"),
            },
        }
    )
