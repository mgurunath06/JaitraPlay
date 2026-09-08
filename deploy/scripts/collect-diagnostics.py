#!/usr/bin/env python3
"""Export bounded, best-effort-redacted logs; never upload or read configuration."""

import re
from datetime import UTC, datetime
from pathlib import Path


def redact(text: str) -> str:
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"https?://[^\s<>]+", "[URL REDACTED]", text)
    text = re.sub(
        r"(?i)((?:authorization|api[_-]?key|auth[_-]?token|password|secret)"
        r"[\"']?\s*[:=]\s*).+",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(r"(?i)\b(?:bearer\s+\S+|sk-[\w-]+|gh[pousr]_[\w]+)", "[REDACTED]", text)
    return text


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    logs = root / ".local/logs"
    try:
        name = (logs / "latest-run").read_text().strip()
        if not name.startswith("run-") or Path(name).name != name:
            raise ValueError("Invalid latest-run reference")
        run = (logs / name).resolve()
        if run.parent != logs.resolve() or not run.is_dir():
            raise ValueError("Latest run directory is missing or outside logs")
    except (OSError, ValueError) as error:
        raise SystemExit(f"No readable launch logs: {error}. Run ./run.sh first.") from error

    sections = [
        "JAITRA Play diagnostics",
        f"Run: {name}",
        "Only latest launcher/core logs are included (last 128 KiB each).",
        "No config, environment dump, profiles, recordings, or saved identity files included.",
        "Redaction is best effort. Review before sharing; logs may contain personal text.",
    ]
    for filename in ("launcher.log", "core.log"):
        path = run / filename
        sections.append(f"\n--- {filename} ---")
        try:
            if path.is_symlink():
                raise ValueError("Refusing symbolic link")
            with path.open("rb") as source:
                source.seek(0, 2)
                source.seek(max(0, source.tell() - 128 * 1024))
                sections.append(redact(source.read().decode("utf-8", errors="replace")))
        except (OSError, ValueError) as error:
            sections.append(f"Unavailable: {error}")

    output = logs / f"share-diagnostics-{datetime.now(UTC):%Y%m%dT%H%M%S%fZ}.txt"
    with output.open("x", encoding="utf-8") as target:
        output.chmod(0o600)
        target.write("\n".join(sections) + "\n")
    print(f"Report created: {output}")
    print("Review it, then attach the text file to the chat. Nothing was uploaded.")


if __name__ == "__main__":
    main()
