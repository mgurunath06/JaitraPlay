CREATE TABLE learning_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    hint_used INTEGER NOT NULL CHECK (hint_used = 1),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX learning_events_activity_created
    ON learning_events(activity_id, created_at DESC);
