"""Score labelled, session-separated face evaluation frames. Standard library only."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

BUCKETS = ("<40", "40–60", "60–90", "90–130", "130+")


def bucket(width):
    return BUCKETS[next((i for i, limit in enumerate((40, 60, 90, 130)) if width < limit), 4)]


def load_manifest(path):
    data = json.loads(Path(path).read_text())
    sessions, clips = {}, set()
    for clip in data["clips"]:
        if clip["id"] in clips:
            raise ValueError("Duplicate clip ID")
        clips.add(clip["id"])
        split = clip["split"]
        if split not in ("enrollment", "calibration", "test"):
            raise ValueError("Unknown split")
        if sessions.setdefault(clip["session"], split) != split:
            raise ValueError("Session leakage: one session appears in multiple splits")
        times = set()
        for frame in clip["frames"]:
            if frame["time"] in times or not math.isfinite(frame["time"]) or frame["time"] < 0:
                raise ValueError("Invalid or duplicate frame time")
            times.add(frame["time"])
            for face in frame["faces"]:
                if face["label"] not in ("jaitra", "other"):
                    raise ValueError("Labels must be jaitra or other")
                box = face["box"]
                if any(not math.isfinite(box[k]) for k in ("x", "y", "width", "height")):
                    raise ValueError("Non-finite box")
                if not (
                    0 <= box["x"] < 1
                    and 0 <= box["y"] < 1
                    and 0 < box["width"] <= 1
                    and 0 < box["height"] <= 1
                    and box["x"] + box["width"] <= 1.001
                    and box["y"] + box["height"] <= 1.001
                ):
                    raise ValueError("Boxes must be normalized xywh inside the source image")
    if set(sessions.values()) != {"enrollment", "calibration", "test"}:
        raise ValueError("Provide distinct enrollment, calibration and test sessions")
    return data


def iou(a, b):
    w = max(0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]))
    h = max(0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))
    intersection = w * h
    union = a["width"] * a["height"] + b["width"] * b["height"] - intersection
    return intersection / union if union else 0


def read_predictions(paths):
    rows = {}
    model = None
    for path in paths:
        for line in Path(path).read_text().splitlines():
            row = json.loads(line)
            if model is not None and row["model"] != model:
                raise ValueError("Score each model separately")
            model = row["model"]
            key = (row["clip"], row["time"])
            if key in rows:
                raise ValueError(f"Duplicate prediction {key}")
            rows[key] = row
    return rows


def score(data, predictions, split, threshold=None):
    stats = defaultdict(
        lambda: dict(child=0, other=0, correct=0, missed=0, false_accept=0, detected=0)
    )
    latencies, unmatched_accepts, frames = [], 0, 0
    for clip in data["clips"]:
        if clip["split"] != split:
            continue
        for truth in clip["frames"]:
            key = (clip["id"], truth["time"])
            if key not in predictions:
                raise ValueError(f"Missing prediction for {key}; do not silently omit failures")
            row = predictions[key]
            if row["session"] != clip["session"]:
                raise ValueError("Prediction session disagrees with manifest")
            frames += 1
            latencies.append(row["latencyMs"])
            detected = row["faces"]
            links = sorted(
                (
                    (iou(t["box"], p["box"]), ti, pi)
                    for ti, t in enumerate(truth["faces"])
                    for pi, p in enumerate(detected)
                ),
                reverse=True,
            )
            used_truth, used_pred, assigned = set(), set(), {}
            for overlap, ti, pi in links:
                if overlap >= 0.3 and ti not in used_truth and pi not in used_pred:
                    assigned[ti] = detected[pi]
                    used_truth.add(ti)
                    used_pred.add(pi)

            def accepted(p):
                if p is None:
                    return False
                if threshold is None:
                    return p["decision"] == "jaitra"
                return (
                    p.get("acceptedByBaseline", True)
                    and p.get("score") is not None
                    and p["score"] >= threshold
                )

            unmatched_accepts += sum(
                accepted(p) for pi, p in enumerate(detected) if pi not in used_pred
            )
            for ti, face in enumerate(truth["faces"]):
                # Ground-truth source pixels ensure misses count and both models use the same bins.
                width = face["box"]["width"] * row["sourceWidth"]
                item = stats[bucket(width)]
                p = assigned.get(ti)
                item["detected"] += p is not None
                if face["label"] == "jaitra":
                    item["child"] += 1
                    item["correct"] += accepted(p)
                    item["missed"] += not accepted(p)
                else:
                    item["other"] += 1
                    item["false_accept"] += accepted(p)
    if not frames:
        raise ValueError(f"No annotated frames in {split}")
    return dict(stats), unmatched_accepts, latencies


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest")
    parser.add_argument("predictions", nargs="+")
    parser.add_argument("--split", choices=("calibration", "test"), default="test")
    parser.add_argument(
        "--threshold",
        type=float,
        help="Higher-is-better score: negative Euclidean for face-api, cosine for ArcFace",
    )
    args = parser.parse_args()
    data = load_manifest(args.manifest)
    stats, unmatched, latency = score(
        data, read_predictions(args.predictions), args.split, args.threshold
    )
    print(
        "Source face px | Child correct/total | Child miss rate | "
        "False accepts/other | Detection recall"
    )
    for name in BUCKETS:
        s = stats.get(name)
        if not s:
            print(f"{name:14} | no samples")
            continue
        miss = f"{s['missed'] / s['child']:.1%}" if s["child"] else "N/A"
        total = s["child"] + s["other"]
        print(
            f"{name:14} | {s['correct']}/{s['child']} | {miss} | "
            f"{s['false_accept']}/{s['other']} | {s['detected']}/{total}"
        )
    ordered = sorted(latency)
    print(
        f"Unmatched accepted detections: {unmatched}; frames: {len(latency)}; "
        f"latency median={ordered[len(ordered) // 2]:.1f} ms, "
        f"p95={ordered[min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)]:.1f} ms"
    )
    print(
        "Frame counts are correlated observations, not independent trials. "
        "No-face-visible frames have no identity denominator; "
        "unmatched accepts are reported separately."
    )


if __name__ == "__main__":
    main()
