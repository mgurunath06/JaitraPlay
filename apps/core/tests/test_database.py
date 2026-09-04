from pathlib import Path

from jaitra_core.persistence import Database


def test_migrations_are_repeatable(tmp_path: Path, repository_root: Path) -> None:
    database = Database(tmp_path / "jaitra.db", repository_root / "migrations")
    database.open()
    database.migrate("test")
    database.migrate("test")
    assert database.integrity_check()
    assert database.connection is not None
    count = database.connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
    assert count == 2
    database.close()


def test_hint_history_is_durable(tmp_path: Path, repository_root: Path) -> None:
    database = Database(tmp_path / "jaitra.db", repository_root / "migrations")
    database.open()
    database.migrate("test")
    database.record_hint_used("picture_guess", "Which animal has a trunk?")
    assert database.last_hint_prompt("picture_guess") == "Which animal has a trunk?"
    assert database.last_hint_prompt("riddle_guess") is None
    database.close()


def test_settings_snapshots_are_deduplicated(tmp_path: Path, repository_root: Path) -> None:
    database = Database(tmp_path / "jaitra.db", repository_root / "migrations")
    database.open()
    database.migrate("test")
    database.record_settings("same", "{}")
    database.record_settings("same", "{}")
    assert database.connection is not None
    count = database.connection.execute("SELECT COUNT(*) FROM settings_snapshots").fetchone()[0]
    assert count == 1
    database.close()
