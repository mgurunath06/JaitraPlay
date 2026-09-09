import importlib.util
import json
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
