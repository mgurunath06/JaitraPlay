"""Standalone, standard-library-only text probes for local provider profiles."""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward provider credentials to a redirect target."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def probe(path: Path, timeout: float) -> dict[str, object]:
    result: dict[str, object] = {"profile": path.name, "status": "failed"}
    started = time.monotonic()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("invalid profile")
        env = data.get("env", {})
        if not isinstance(env, dict):
            raise ValueError("invalid env")
        keys = {"ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "OPENAI_BASE_URL", "OPENAI_API_KEY"}
        if not keys.intersection(env):
            result.update(status="skipped", reason="NO_PROVIDER_CONFIGURATION")
            return result
        anthropic = "ANTHROPIC_BASE_URL" in env or "ANTHROPIC_AUTH_TOKEN" in env
        base = env.get("ANTHROPIC_BASE_URL" if anthropic else "OPENAI_BASE_URL")
        token = env.get("ANTHROPIC_AUTH_TOKEN" if anthropic else "OPENAI_API_KEY")
        if not isinstance(base, str) or not isinstance(token, str) or not token.strip():
            raise ValueError("missing configuration")
        url = urlsplit(base)
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError("HTTPS base URL required")
        if url.query or url.fragment:
            raise ValueError("invalid base URL")
        chat = not anthropic or url.hostname == "openrouter.ai"
        model = env.get("OPENAI_MODEL" if chat else "ANTHROPIC_MODEL")
        if model is None:
            model = "openrouter/auto" if url.hostname == "openrouter.ai" else (
                "claude-sonnet-4-6" if not chat else None
            )
        if not isinstance(model, str) or not model.strip():
            raise ValueError("missing model")
        base = base.rstrip("/")
        endpoint = base + ("/chat/completions" if chat else (
            "/messages" if base.endswith("/v1") else "/v1/messages"
        ))
        payload = {
            "model": model, "max_tokens": 32,
            "messages": [{"role": "user", "content": "Reply with the word OK only."}],
        }
        headers = {
            "authorization": f"Bearer {token}", "content-type": "application/json",
            "user-agent": "claude-cli/2.1.0",
        }
        if not chat:
            headers["anthropic-version"] = "2023-06-01"
        request = urllib.request.Request(
            endpoint, data=json.dumps(payload).encode(), headers=headers, method="POST"
        )
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            raw = response.read(1_048_577)
            if len(raw) > 1_048_576:
                raise ValueError("oversized response")
            body = json.loads(raw)
        if chat:
            text = body["choices"][0]["message"]["content"]
        else:
            text = "".join(
                block["text"] for block in body["content"] if block.get("type") == "text"
            )
        if not isinstance(text, str) or not text.strip():
            raise ValueError("empty response")
        result.update(status="healthy", reason="TEXT_GENERATION_OK")
    except urllib.error.HTTPError as exc:
        result.update(reason="HTTP_ERROR", http_status=exc.code)
    except TimeoutError:
        result["reason"] = "TIMEOUT"
    except urllib.error.URLError:
        result["reason"] = "CONNECTION_ERROR"
    except OSError:
        result["reason"] = "FILE_OR_CONNECTION_ERROR"
    except (ValueError, KeyError, TypeError, IndexError, AttributeError):
        result["reason"] = "INVALID_CONFIG_OR_RESPONSE"
    finally:
        result["duration_ms"] = round((time.monotonic() - started) * 1000)
    return result


def check_directory(directory: Path, timeout: float = 30) -> dict[str, object]:
    # Inspect every JSON, including templates: incomplete provider configs must be visible.
    results = []
    for path in sorted(directory.rglob("*.json")):
        result = probe(path, timeout)
        result["profile"] = str(path.relative_to(directory))
        results.append(result)
    tested = [item for item in results if item["status"] != "skipped"]
    healthy = bool(tested) and all(item["status"] == "healthy" for item in tested)
    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "healthy": healthy,
        "reason": "CHECKS_COMPLETE" if tested else "NO_PROVIDER_PROFILES",
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parents[4]
    parser.add_argument("--profiles-dir", type=Path, default=root / ".claude")
    parser.add_argument("--output", type=Path, default=root / ".local/state/provider-health.json")
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    if not 0 < args.timeout <= 120:
        parser.error("--timeout must be greater than 0 and at most 120 seconds")
    report = check_directory(args.profiles_dir, args.timeout)
    serialized = json.dumps(report, indent=2)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(serialized + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(serialized)
    return 0 if report["healthy"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
