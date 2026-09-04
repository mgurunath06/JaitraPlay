CREATE TABLE settings_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_hash TEXT NOT NULL UNIQUE,
    normalized_json TEXT NOT NULL,
    effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE command_receipts (
    request_id TEXT PRIMARY KEY,
    command_type TEXT NOT NULL,
    result_code TEXT NOT NULL,
    result_json TEXT NOT NULL,
    committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE diagnostic_events (
    event_id TEXT PRIMARY KEY,
    event_code TEXT NOT NULL,
    reason_code TEXT,
    component TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE content_versions (
    pack_id TEXT NOT NULL,
    version TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    activated_at TEXT,
    PRIMARY KEY (pack_id, version)
);
