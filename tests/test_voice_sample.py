import importlib.util
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
