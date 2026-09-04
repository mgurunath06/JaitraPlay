from __future__ import annotations

import hashlib
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


class MigrationError(RuntimeError):
    pass


class Database:
    def __init__(self, path: Path, migrations_dir: Path) -> None:
        self.path = path
        self.migrations_dir = migrations_dir
        self.connection: sqlite3.Connection | None = None

    def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.execute("PRAGMA busy_timeout = 3000")
        connection.execute("PRAGMA temp_store = MEMORY")
        self.connection = connection
        self._ensure_migration_table()

    def close(self) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None

    def migrate(self, app_version: str) -> None:
        connection = self._required_connection()
        for path in sorted(self.migrations_dir.glob("[0-9][0-9][0-9][0-9]_*.sql")):
            version = int(path.name.split("_", 1)[0])
            sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            row = connection.execute(
                "SELECT checksum FROM schema_migrations WHERE schema_version = ?", (version,)
            ).fetchone()
            if row:
                if row["checksum"] != checksum:
                    raise MigrationError(f"released migration {path.name} was modified")
                continue
            try:
                connection.executescript(sql)
                connection.execute(
                    "INSERT INTO schema_migrations(schema_version, app_version, checksum) "
                    "VALUES (?, ?, ?)",
                    (version, app_version, checksum),
                )
                connection.commit()
            except sqlite3.DatabaseError as exc:
                connection.rollback()
                raise MigrationError(f"migration failed: {path.name}") from exc

    def record_settings(self, config_hash: str, normalized_json: str) -> None:
        with self.transaction() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO settings_snapshots"
                "(config_hash, normalized_json) VALUES (?, ?)",
                (config_hash, normalized_json),
            )

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self._required_connection()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise

    def integrity_check(self) -> bool:
        row = self._required_connection().execute("PRAGMA integrity_check").fetchone()
        return bool(row and row[0] == "ok")

    def _ensure_migration_table(self) -> None:
        connection = self._required_connection()
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                schema_version INTEGER PRIMARY KEY,
                app_version TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()

    def _required_connection(self) -> sqlite3.Connection:
        if self.connection is None:
            raise RuntimeError("database is not open")
        return self.connection
