import base64
import json
from pathlib import Path
from types import SimpleNamespace

import anyio
import pytest
from httpx import ASGITransport, AsyncClient
from jaitra_core.api.app import create_app
from jaitra_core.config import AppConfig
from jaitra_core.runtime import CoreRuntime
from jaitra_core.voice import VoiceService, VoiceUnavailable


def test_missing_model_keeps_voice_optional(tmp_path: Path) -> None:
    service = VoiceService(tmp_path / "missing", True)
    service.start()
    assert not service.available
    with pytest.raises(VoiceUnavailable):
        service.transcribe("AAAA", 16000)


def test_transcription_preserves_segments_and_validates_audio(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    grammars: list[str | None] = []

    class Recognizer:
        def __init__(self, _model: object, rate: int, grammar: str | None = None) -> None:
            assert rate == 16000
            grammars.append(grammar)

        def AcceptWaveform(self, _audio: bytes) -> bool:
            return True

        def Result(self) -> str:
            return '{"text":"blue"}'

        def FinalResult(self) -> str:
            return '{"text":"circle"}'

    fake = SimpleNamespace(
        Model=lambda _path: object(), SetLogLevel=lambda _level: None, KaldiRecognizer=Recognizer
    )
    monkeypatch.setattr("jaitra_core.voice.importlib.import_module", lambda _name: fake)
    service = VoiceService(tmp_path, True)
    service.start()
    assert service.available
    assert service.transcribe(
        base64.b64encode(bytes(100)).decode(), 16000, ["Blue", "circle", "blue", "🐘"]
    ) == "blue circle"
    assert json.loads(grammars[0] or "[]") == ["blue", "circle", "[unk]"]
    for audio in (
        "!!!!",
        "",
        base64.b64encode(b"x").decode(),
        base64.b64encode(bytes(16000 * 2 * 9)).decode(),
    ):
        with pytest.raises(ValueError):
            service.transcribe(audio, 16000)
    assert list(tmp_path.iterdir()) == []  # No audio or transcript files.


def test_voice_api_rejects_invalid_audio_and_reports_disabled(
    config: AppConfig,
    repository_root: Path,
) -> None:
    runtime = CoreRuntime(config, repository_root=repository_root)
    runtime.start()

    async def exercise() -> None:
        async with AsyncClient(
            transport=ASGITransport(app=create_app(runtime, manage_lifecycle=False)),
            base_url="http://test",
        ) as client:
            assert (
                await client.post(
                    "/api/v1/voice/transcribe",
                    json={
                        "audio": "AAAA",
                        "sampleRate": 16000,
                    },
                )
            ).status_code == 503
            assert (
                await client.post(
                    "/api/v1/voice/transcribe",
                    json={
                        "audio": "AAAA",
                        "sampleRate": 1,
                    },
                )
            ).status_code == 422
            assert (
                await client.post(
                    "/api/v1/voice/transcribe",
                    json={
                        "audio": "A" * 1024001,
                        "sampleRate": 48000,
                    },
                )
            ).status_code == 422

    try:
        anyio.run(exercise)
    finally:
        runtime.stop()
