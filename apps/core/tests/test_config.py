from pathlib import Path

import pytest
from jaitra_core.config import AppConfig, ConfigError, load_config


def test_loads_approved_example(repository_root: Path) -> None:
    config = load_config(repository_root / "deploy/config/config.example.yaml")
    assert config.companion.name == "Mimo"
    assert config.server.host == "127.0.0.1"


def test_rejects_companion_with_child_name() -> None:
    with pytest.raises(ValueError, match="companion name"):
        AppConfig.model_validate(
            {
                "schema_version": 1,
                "child": {"display_name": "JAITRA"},
                "companion": {"name": "jaitra"},
                "activities": {"enabled": ["picture_guess"]},
            }
        )


def test_rejects_non_loopback_binding() -> None:
    with pytest.raises(ValueError, match="loopback"):
        AppConfig.model_validate(
            {
                "schema_version": 1,
                "child": {"display_name": "JAITRA"},
                "companion": {"name": "Mimo"},
                "activities": {"enabled": ["picture_guess"]},
                "server": {"host": "0.0.0.0"},
            }
        )


def test_missing_config_has_safe_error(tmp_path: Path) -> None:
    with pytest.raises(ConfigError):
        load_config(tmp_path / "missing.yaml")
