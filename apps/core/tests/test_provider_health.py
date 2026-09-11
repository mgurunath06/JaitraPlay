import io
import json
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from jaitra_core.providers.healthcheck import NoRedirect, check_directory, probe, should_probe


def profile(tmp_path: Path, host: str = "https://api.example.test") -> Path:
    path = tmp_path / "settings.local.json"
    path.write_text(
        json.dumps(
            {
                "env": {
                    "ANTHROPIC_BASE_URL": host,
                    "ANTHROPIC_AUTH_TOKEN": "secret-test-token",
                }
            }
        )
    )
    return path


@pytest.mark.parametrize("chat", [False, True])
def test_text_probe_uses_protocol_without_exposing_content(tmp_path: Path, chat: bool) -> None:
    path = profile(tmp_path, "https://openrouter.ai/api/v1" if chat else "https://api.test")
    response = (
        {"choices": [{"message": {"content": "OK"}}]}
        if chat
        else {"content": [{"type": "text", "text": "OK"}]}
    )
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = io.BytesIO(json.dumps(response).encode())
    with patch("urllib.request.build_opener", return_value=opener):
        report = probe(path, 5)
    assert report["status"] == "healthy"
    request = opener.open.call_args.args[0]
    assert request.full_url.endswith("/chat/completions" if chat else "/v1/messages")
    assert "secret-test-token" not in json.dumps(report)
    assert "content" not in report


def test_failure_does_not_prevent_other_profiles(tmp_path: Path) -> None:
    profile(tmp_path)
    (tmp_path / "bad.json").write_text("not JSON")
    (tmp_path / "settings.json").write_text('{"permissions": {}}')
    error = urllib.error.HTTPError("https://private", 401, "secret-test-token", {}, None)
    with patch("urllib.request.OpenerDirector.open", side_effect=error):
        report = check_directory(tmp_path)
    results = report["results"]
    assert isinstance(results, list)
    assert len(results) == 3
    assert results[0]["status"] == "failed"
    assert results[1]["status"] == "skipped"
    assert results[2]["http_status"] == 401
    assert report["healthy"] is False
    assert "secret-test-token" not in json.dumps(report)


@pytest.mark.parametrize("body", [b"{}", b'{"content":[]}', b"not JSON"])
def test_invalid_responses_fail(tmp_path: Path, body: bytes) -> None:
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = io.BytesIO(body)
    with patch("urllib.request.build_opener", return_value=opener):
        assert probe(profile(tmp_path), 5)["status"] == "failed"


def test_no_profiles_is_unhealthy(tmp_path: Path) -> None:
    assert check_directory(tmp_path)["healthy"] is False


def test_scheduled_probe_requires_recent_activity_and_stops_when_healthy(tmp_path: Path) -> None:
    activity = tmp_path / "app-activity"
    status = tmp_path / "question-provider-status.json"
    assert should_probe(activity, status) is False
    activity.touch()
    assert should_probe(activity, status, activity.stat().st_mtime + 299) is True
    assert should_probe(activity, status, activity.stat().st_mtime + 301) is False
    status.write_text('{"available":true}')
    assert should_probe(activity, status, activity.stat().st_mtime + 1) is False


def test_timeout_is_reported(tmp_path: Path) -> None:
    with patch("urllib.request.OpenerDirector.open", side_effect=TimeoutError):
        assert probe(profile(tmp_path), 5)["reason"] == "TIMEOUT"


def test_insecure_url_not_contacted(tmp_path: Path) -> None:
    with patch("urllib.request.build_opener") as opener:
        assert probe(profile(tmp_path, "http://api.test"), 5)["status"] == "failed"
        opener.assert_not_called()
    assert NoRedirect().redirect_request() is None


@pytest.mark.parametrize(
    "value", ["test-eleven-secret", '"test-eleven-secret"', "'test-eleven-secret'"]
)
def test_elevenlabs_audio_probe(tmp_path: Path, value: str) -> None:
    path = tmp_path / "elevenlabs.env"
    path.write_text(f"# Credentials\nELEVENLABS_API_KEY={value}\n")
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = io.BytesIO(b'{"text":""}')
    with patch("urllib.request.build_opener", return_value=opener) as factory:
        report = check_directory(tmp_path, 5, path)
    assert report["healthy"] is True
    assert report["results"][0]["reason"] == "AUDIO_PROCESSING_OK"
    request = opener.open.call_args.args[0]
    assert request.full_url == "https://api.elevenlabs.io/v1/speech-to-text"
    assert request.get_header("Xi-api-key") == "test-eleven-secret"
    assert request.method == "POST"
    assert b"scribe_v2" in request.data
    assert b"RIFF" in request.data
    assert b"test-eleven-secret" not in request.data
    assert opener.open.call_args.kwargs["timeout"] == 5
    assert isinstance(factory.call_args.args[0], NoRedirect)
    assert "test-eleven-secret" not in json.dumps(report)


@pytest.mark.parametrize(
    "content", ["", "ELEVENLABS_API_KEY=", "ELEVENLABS_API_KEY=a\nELEVENLABS_API_KEY=b"]
)
def test_invalid_elevenlabs_key_never_contacts_provider(tmp_path: Path, content: str) -> None:
    path = tmp_path / "elevenlabs.env"
    path.write_text(content)
    with patch("urllib.request.build_opener") as opener:
        assert probe(path, 5)["status"] == "failed"
        opener.assert_not_called()


@pytest.mark.parametrize("body", [b"{}", b'{"text":null}', b"not JSON", b"x" * 1_048_577])
def test_elevenlabs_invalid_response(tmp_path: Path, body: bytes) -> None:
    path = tmp_path / "elevenlabs.env"
    path.write_text("ELEVENLABS_API_KEY=test-eleven-secret")
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = io.BytesIO(body)
    with patch("urllib.request.build_opener", return_value=opener):
        assert probe(path, 5)["reason"] == "INVALID_CONFIG_OR_RESPONSE"


def test_missing_elevenlabs_key_fails_combined_report(tmp_path: Path) -> None:
    profile(tmp_path)
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = io.BytesIO(
        b'{"content":[{"type":"text","text":"OK"}]}'
    )
    with patch("urllib.request.build_opener", return_value=opener):
        report = check_directory(tmp_path, 5, tmp_path / "elevenlabs.env")
    assert report["healthy"] is False
    assert [item["status"] for item in report["results"]] == ["healthy", "failed"]


@pytest.mark.parametrize(
    "error,reason",
    [
        (TimeoutError(), "TIMEOUT"),
        (urllib.error.URLError("private details"), "CONNECTION_ERROR"),
        (
            urllib.error.HTTPError("https://private", 401, "test-eleven-secret", {}, None),
            "HTTP_ERROR",
        ),
    ],
)
def test_elevenlabs_provider_errors_are_redacted(
    tmp_path: Path, error: Exception, reason: str
) -> None:
    path = tmp_path / "elevenlabs.env"
    path.write_text("ELEVENLABS_API_KEY=test-eleven-secret")
    with patch("urllib.request.OpenerDirector.open", side_effect=error):
        result = probe(path, 5)
    assert result["reason"] == reason
    assert "test-eleven-secret" not in json.dumps(result)
    assert "private" not in json.dumps(result)
