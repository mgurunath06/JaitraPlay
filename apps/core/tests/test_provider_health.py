import io
import json
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from jaitra_core.providers.healthcheck import NoRedirect, check_directory, probe


def profile(tmp_path: Path, host: str = "https://api.example.test") -> Path:
    path = tmp_path / "settings.local.json"
    path.write_text(json.dumps({"env": {
        "ANTHROPIC_BASE_URL": host, "ANTHROPIC_AUTH_TOKEN": "secret-test-token",
    }}))
    return path


@pytest.mark.parametrize("chat", [False, True])
def test_text_probe_uses_protocol_without_exposing_content(tmp_path: Path, chat: bool) -> None:
    path = profile(tmp_path, "https://openrouter.ai/api/v1" if chat else "https://api.test")
    response = {"choices": [{"message": {"content": "OK"}}]} if chat else {
        "content": [{"type": "text", "text": "OK"}]
    }
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


@pytest.mark.parametrize("body", [b'{}', b'{"content":[]}', b'not JSON'])
def test_invalid_responses_fail(tmp_path: Path, body: bytes) -> None:
    opener = MagicMock()
    opener.open.return_value.__enter__.return_value = io.BytesIO(body)
    with patch("urllib.request.build_opener", return_value=opener):
        assert probe(profile(tmp_path), 5)["status"] == "failed"


def test_no_profiles_is_unhealthy(tmp_path: Path) -> None:
    assert check_directory(tmp_path)["healthy"] is False


def test_timeout_is_reported(tmp_path: Path) -> None:
    with patch("urllib.request.OpenerDirector.open", side_effect=TimeoutError):
        assert probe(profile(tmp_path), 5)["reason"] == "TIMEOUT"


def test_insecure_url_not_contacted(tmp_path: Path) -> None:
    with patch("urllib.request.build_opener") as opener:
        assert probe(profile(tmp_path, "http://api.test"), 5)["status"] == "failed"
        opener.assert_not_called()
    assert NoRedirect().redirect_request() is None
