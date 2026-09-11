import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "face_eval_score", Path(__file__).parents[1] / "deploy/face_eval/score.py"
)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_session_leakage_rejected(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {
                "clips": [
                    {"id": "a", "session": "same", "split": "enrollment", "frames": []},
                    {"id": "b", "session": "same", "split": "test", "frames": []},
                ]
            }
        )
    )
    with pytest.raises(ValueError, match="leakage"):
        module.load_manifest(path)


def test_misses_and_false_accepts_count_in_ground_truth_size_buckets():
    box = dict(x=0.1, y=0.1, width=0.05, height=0.1)
    other = dict(x=0.6, y=0.1, width=0.15, height=0.2)
    manifest = {
        "clips": [
            {
                "id": "clip",
                "session": "test",
                "split": "test",
                "frames": [
                    {
                        "time": 0,
                        "faces": [
                            {"label": "jaitra", "box": box},
                            {"label": "other", "box": other},
                        ],
                    }
                ],
            }
        ]
    }
    prediction = {
        ("clip", 0): {
            "session": "test",
            "sourceWidth": 1000,
            "latencyMs": 10,
            "faces": [{"box": other, "decision": "jaitra", "score": 0.8}],
        }
    }
    stats, unmatched, _ = module.score(manifest, prediction, "test")
    assert stats["40–60"]["missed"] == 1
    assert stats["40–60"]["detected"] == 0
    assert stats["130+"]["false_accept"] == 1
    assert unmatched == 0
    with pytest.raises(ValueError, match="Missing prediction"):
        module.score(manifest, {}, "test")


def test_bucket_boundaries():
    assert [module.bucket(w) for w in (39, 40, 59, 60, 89, 90, 129, 130)] == [
        "<40",
        "40–60",
        "40–60",
        "60–90",
        "60–90",
        "90–130",
        "90–130",
        "130+",
    ]


def test_per_person_labels_and_explicit_unknown_gallery(tmp_path):
    box = dict(x=0.1, y=0.1, width=0.1, height=0.1)
    data = {
        "enrolledPeople": ["jaitra", "father", "mother"],
        "clips": [
            {
                "id": split,
                "session": split,
                "split": split,
                "frames": [{"time": 0, "faces": [{"label": "visitor_1", "box": box}]}],
            }
            for split in ("enrollment", "calibration", "test")
        ],
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(data))
    assert module.enrolled_people(module.load_manifest(path)) == ["jaitra", "father", "mother"]
    data["clips"][1]["session"] = "enrollment"
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="leakage"):
        module.load_manifest(path)


def test_joint_threshold_margin_rescoring_and_ties():
    prediction = {"scores": {"father": 0.8, "mother": 0.78}, "acceptedByBaseline": True}
    row = {"threshold": 0.7, "margin": 0}
    assert module.decide(prediction, row) == "father"
    assert module.decide(prediction, row, margin=0.05) == "unknown"
    assert module.decide(prediction, row, threshold=0.85) == "unknown"
    assert module.decide({"scores": {"father": 0.8, "mother": 0.8}}, row) == "unknown"
    assert module.decide({**prediction, "acceptedByBaseline": False}, row) == "unknown"
    with pytest.raises(ValueError, match="per-person"):
        module.decide({"decision": "jaitra", "score": 0.8}, row, margin=0.05)
    assert (
        module.decide(
            {"scores": {"jaitra": -0.42}},
            {"threshold": -0.42, "metric": "negative_mean_top3_euclidean"},
        )
        == "unknown"
    )


def test_family_confusion_unknown_accept_and_detection_denominators():
    boxes = [dict(x=x, y=0.1, width=0.1, height=0.1) for x in (0.1, 0.4, 0.7)]
    data = {
        "enrolledPeople": ["father", "mother"],
        "clips": [
            {
                "id": "c",
                "session": "B",
                "split": "calibration",
                "frames": [
                    {
                        "time": 0,
                        "faces": [
                            {"label": label, "box": box}
                            for label, box in zip(
                                ["father", "mother", "visitor_1"], boxes, strict=True
                            )
                        ],
                    }
                ],
            }
        ],
    }
    row = {
        "session": "B",
        "sourceWidth": 1000,
        "latencyMs": 10,
        "threshold": 0.7,
        "margin": 0,
        "faces": [
            {"box": boxes[0], "scores": {"mother": 0.8, "father": 0.6}},
            {"box": boxes[2], "scores": {"father": 0.9, "mother": 0.5}},
        ],
    }
    stats, unmatched, _ = module.score(data, {("c", 0): row}, "calibration")
    s = stats["90–130"]
    assert (s["known"], s["detected_known"], s["identified"]) == (2, 1, 0)
    assert (s["detected"], s["wrong_family"], s["unknown_accept"]) == (2, 1, 1)
    assert s["confusions"] == {"father -> mother": 1, "visitor_1 -> father": 1}
    assert unmatched == 0


def test_prediction_headers_and_mixed_width_rejection(tmp_path):
    path = tmp_path / "predictions.jsonl"
    rows = [
        {"type": "session", "analysisWidth": 640},
        {"model": "face-api", "analysisWidth": 640, "clip": "a", "time": 0},
        {"model": "face-api", "analysisWidth": 1280, "clip": "b", "time": 0},
    ]
    path.write_text("\n".join(map(json.dumps, rows)))
    with pytest.raises(ValueError, match="configuration"):
        module.read_predictions([path])
    path.write_text("\n".join(map(json.dumps, rows[:2])))
    assert len(module.read_predictions([path])) == 1


def test_sweep_and_comparison_cli_produce_reviewable_outputs(tmp_path):
    box = dict(x=0.1, y=0.1, width=0.1, height=0.1)
    manifest = {
        "enrolledPeople": ["father", "mother"],
        "clips": [
            {
                "id": split,
                "session": split,
                "split": split,
                "frames": [
                    {"time": 0, "faces": [{"label": "father", "box": box}]}
                ],
            }
            for split in ("enrollment", "calibration", "test")
        ],
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    prediction = {
        "schema": 2,
        "model": "test-model",
        "session": "calibration",
        "clip": "calibration",
        "time": 0,
        "sourceWidth": 1000,
        "analysisWidth": 640,
        "latencyMs": 10,
        "threshold": 0.4,
        "margin": 0,
        "faces": [
            {
                "box": box,
                "scores": {"father": 0.8, "mother": 0.6},
                "acceptedByBaseline": True,
            }
        ],
    }
    predictions_path = tmp_path / "predictions.jsonl"
    predictions_path.write_text(json.dumps(prediction) + "\n")
    root = Path(__file__).parents[1]
    sweep = subprocess.run(
        [
            sys.executable,
            str(root / "deploy/face_eval/sweep.py"),
            str(manifest_path),
            str(predictions_path),
            "--thresholds=0.7,0.9",
            "--margins=0,0.3",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert "threshold,margin" in sweep
    assert len(sweep.splitlines()) == 5

    report = module.report(
        manifest,
        {("calibration", 0): prediction},
        "calibration",
        threshold=0.7,
        margin=0.1,
    )
    first_report = tmp_path / "face-api-640.json"
    second_report = tmp_path / "buffalo-1280.json"
    first_report.write_text(json.dumps(report))
    second_report.write_text(json.dumps(report))
    comparison = subprocess.run(
        [
            sys.executable,
            str(root / "deploy/face_eval/compare.py"),
            str(first_report),
            str(second_report),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert "Step Zero calibration comparison" in comparison
    assert "Held-out test: not evaluated" in comparison
    assert "pending" in comparison
