import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch


def test_one_command_report_includes_trace_logs_and_redacts_keys(tmp_path: Path, capsys) -> None:
    script = Path(__file__).resolve().parents[1] / "deploy/scripts/collect-diagnostics.py"
    spec = importlib.util.spec_from_file_location("diagnostics", script)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    logs = tmp_path / ".local/logs"
    run = logs / "run-test"
    run.mkdir(parents=True)
    (logs / "latest-run").write_text("run-test")
    (run / "launcher.log").write_text("api_key=NEVER_SHARE_THIS\nexit=1\n")
    (run / "core.log").write_text('{"requestId":"trace-123","httpStatus":401}\n')
    (run / "diagnostics.jsonl").write_text('{"event":"voice.capture.finish","rms":0.01}\n')
    (tmp_path / "config.yaml").write_text("CONFIG_MUST_NOT_APPEAR")
    module.__file__ = str(tmp_path / "deploy/scripts/collect-diagnostics.py")
    with patch.object(sys, "argv", [str(script), "--print"]):
        module.main()
    output = capsys.readouterr().out
    assert "trace-123" in output and "voice.capture.finish" in output
    assert "NEVER_SHARE_THIS" not in output and "CONFIG_MUST_NOT_APPEAR" not in output
    assert "[REDACTED]" in output
    assert len(list(logs.glob("share-diagnostics-*.txt"))) == 1
