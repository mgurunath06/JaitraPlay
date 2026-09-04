from pathlib import Path

import pytest
from jaitra_core.config import AppConfig
from jaitra_core.runtime import CoreRuntime
from jaitra_core.state import AppState


def test_invalid_content_enters_recovery(tmp_path: Path, repository_root: Path) -> None:
    empty_content = tmp_path / "content"
    empty_content.mkdir()
    config = AppConfig.model_validate(
        {
            "schema_version": 1,
            "child": {"display_name": "JAITRA"},
            "companion": {"name": "Mimo"},
            "activities": {"enabled": ["picture_guess"]},
            "paths": {
                "state_dir": str(tmp_path / "state"),
                "content_dir": str(empty_content),
                "migrations_dir": str(repository_root / "migrations"),
            },
        }
    )
    runtime = CoreRuntime(config, repository_root=repository_root)
    with pytest.raises(RuntimeError, match="no configured activity"):
        runtime.start()
    assert runtime.state_machine.state is AppState.RECOVERY
    assert runtime.health.core.state == "FATAL"
    runtime.stop()
