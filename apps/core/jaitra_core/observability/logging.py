import json
import logging
from datetime import UTC, datetime
from typing import Any


def configure_logging(level: str) -> None:
    logging.basicConfig(level=level, format="%(message)s")


def log_event(
    logger: logging.Logger,
    level: int,
    event_code: str,
    component: str,
    *,
    reason_code: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    record = {
        "ts": datetime.now(UTC).isoformat(),
        "level": logging.getLevelName(level),
        "component": component,
        "eventCode": event_code,
        "reasonCode": reason_code,
        "payload": payload or {},
    }
    logger.log(level, json.dumps(record, separators=(",", ":"), default=str))
