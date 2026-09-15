import importlib.util
import subprocess
import sys
import wave
from array import array
from pathlib import Path
from types import ModuleType


def load_script(repository_root: Path) -> ModuleType:
    path = repository_root / "deploy" / "scripts" / "capture-voice-sample.py"
    spec = importlib.util.spec_from_file_location("capture_voice_sample", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_voice_sample_reports_format_levels_and_clipping(
    tmp_path: Path, repository_root: Path
) -> None:
    sample = tmp_path / "sample.wav"
    values = array("h", [32767, -32768] * 1600)
    with wave.open(str(sample), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(values.tobytes())

    metrics = load_script(repository_root).analyse(sample)

    assert metrics["sampleRate"] == 16000
    assert metrics["channels"] == 1
    assert metrics["durationMs"] == 200
    channel = metrics["perChannel"][0]
    assert channel["peak"] >= 0.999
    assert channel["clippedPercent"] == 100


def test_channel_probe_uses_reported_maximum(
    repository_root: Path, monkeypatch
) -> None:
    module = load_script(repository_root)
    monkeypatch.setattr(
        module.subprocess, "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess([], 0, "", "CHANNELS: [1 4]\n"),
    )
    assert module.detect_channels("plughw:EMEET") == 4


def test_diagnostic_transcription_streams_bounded_chunks(
    tmp_path: Path, repository_root: Path, monkeypatch
) -> None:
    sample = tmp_path / "sample.wav"
    with wave.open(str(sample), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(array("h", [100] * 9000).tobytes())
    chunks: list[int] = []

    class Recognizer:
        def __init__(self, _model, _rate):
            pass

        def AcceptWaveform(self, audio: bytes) -> bool:
            chunks.append(len(audio))
            return len(chunks) == 1

        def Result(self) -> str:
            return '{"text":"blue"}'

        def FinalResult(self) -> str:
            return '{"text":"circle"}'

    fake_vosk = ModuleType("vosk")
    fake_vosk.SetLogLevel = lambda _level: None
    fake_vosk.Model = lambda _path: object()
    fake_vosk.KaldiRecognizer = Recognizer
    monkeypatch.setitem(sys.modules, "vosk", fake_vosk)
    model = tmp_path / "model"
    model.mkdir()

    assert load_script(repository_root).transcribe_channels(sample, model) == ["blue circle"]
    assert chunks == [8000, 8000, 2000]
