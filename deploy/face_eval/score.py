"""Score labelled, session-separated face evaluation frames. Standard library only."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
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
                if not isinstance(face["label"], str) or not re.fullmatch(
                    r"[a-zA-Z0-9_-]{1,64}", face["label"]
                ):
                    raise ValueError("Labels must be stable person IDs")
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
    enrolled_people(data)
    return data


def enrolled_people(data):
    people = data.get("enrolledPeople")
    if people is None:
        people = sorted(
            {
                f["label"]
                for c in data["clips"]
                if c["split"] == "enrollment"
                for frame in c["frames"]
                for f in frame["faces"]
            }
            - {"other", "unknown"}
        ) or ["jaitra"]
    if (
        not isinstance(people, list)
        or not people
        or len(set(people)) != len(people)
        or any(
            not isinstance(p, str)
            or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", p)
            or p in ("other", "unknown")
            for p in people
        )
    ):
        raise ValueError("Invalid enrolledPeople; specify distinct person IDs")
    return people


def iou(a, b):
    w = max(0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]))
    h = max(0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))
    intersection = w * h
    union = a["width"] * a["height"] + b["width"] * b["height"] - intersection
    return intersection / union if union else 0


def read_predictions(paths):
    rows = {}
    model = None
    configuration = None
    for path in paths:
        for line in Path(path).read_text().splitlines():
            row = json.loads(line)
            if row.get("type") == "session":
                continue
            signature = (
                row.get("model"),
                row.get("requestedAnalysisWidth", row.get("analysisWidth")),
                row.get("detectorSize"),
                json.dumps(row.get("detector"), sort_keys=True),
                row.get("backend"),
                json.dumps(row.get("gallerySizes"), sort_keys=True),
            )
            if configuration is not None and configuration != signature:
                raise ValueError("Score each analysis width/configuration separately")
            configuration = signature
            if model is not None and row["model"] != model:
                raise ValueError("Score each model separately")
            model = row["model"]
            key = (row["clip"], row["time"])
            if key in rows:
                raise ValueError(f"Duplicate prediction {key}")
            rows[key] = row
    return rows


def decide(prediction, row, threshold=None, margin=None):
    """Rescore higher-is-better identity scores; never accept tied identities."""
    if prediction is None or not prediction.get("acceptedByBaseline", True):
        return "unknown"
    if "scores" in prediction:
        ranked = sorted(
            (
                (name, value)
                for name, value in prediction["scores"].items()
                if value is not None and math.isfinite(value)
            ),
            key=lambda p: -p[1],
        )
        if not ranked:
            return "unknown"
        cutoff = row.get("threshold") if threshold is None else threshold
        gap = row.get("margin", 0) if margin is None else margin
        if cutoff is None:
            raise ValueError("Missing threshold")
        # Preserve the strict original face-api cutoff; cosine uses >=.
        passes = (
            ranked[0][1] > cutoff
            if row.get("metric") == "negative_mean_top3_euclidean"
            else ranked[0][1] >= cutoff
        )
        if not passes or (
            len(ranked) > 1 and (ranked[0][1] <= ranked[1][1] or ranked[0][1] - ranked[1][1] < gap)
        ):
            return "unknown"
        return ranked[0][0]
    if margin not in (None, 0):
        raise ValueError("Margin sweep requires per-person scores; rerun the updated benchmark")
    if threshold is None:
        return prediction["decision"]
    value = prediction.get("score")
    return (
        prediction.get("candidate", "jaitra")
        if value is not None and value >= threshold
        else "unknown"
    )


def score(data, predictions, split, threshold=None, margin=None):
    known = set(enrolled_people(data))
    stats = defaultdict(
        lambda: dict(
            child=0,
            other=0,
            correct=0,
            missed=0,
            false_accept=0,
            detected=0,
            known=0,
            detected_known=0,
            identified=0,
            wrong_family=0,
            unknown=0,
            unknown_accept=0,
            confusions={},
        )
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
            if row.get("enrolledPeople") is not None and set(row["enrolledPeople"]) != known:
                raise ValueError("Prediction enrollment disagrees with manifest")
            if (
                not math.isfinite(row["sourceWidth"])
                or row["sourceWidth"] <= 0
                or not math.isfinite(row["latencyMs"])
                or row["latencyMs"] < 0
            ):
                raise ValueError("Invalid source dimensions or latency")
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
            unmatched_accepts += sum(
                decide(p, row, threshold, margin) != "unknown"
                for pi, p in enumerate(detected)
                if pi not in used_pred
            )
            for ti, face in enumerate(truth["faces"]):
                item = stats[bucket(face["box"]["width"] * row["sourceWidth"])]
                p = assigned.get(ti)
                decision = decide(p, row, threshold, margin)
                item["detected"] += p is not None
                if decision != "unknown" and decision != face["label"]:
                    confusion = f"{face['label']} -> {decision}"
                    item["confusions"][confusion] = item["confusions"].get(confusion, 0) + 1
                if face["label"] in known:
                    item["known"] += 1
                    item["detected_known"] += p is not None
                    item["identified"] += decision == face["label"]
                    item["wrong_family"] += decision != "unknown" and decision != face["label"]
                else:
                    item["unknown"] += 1
                    item["unknown_accept"] += decision != "unknown"
                # Retain the old child/other counters for legacy consumers.
                if face["label"] == "jaitra":
                    item["child"] += 1
                    item["correct"] += decision == "jaitra"
                    item["missed"] += decision != "jaitra"
                else:
                    item["other"] += 1
                    item["false_accept"] += decision == "jaitra"
    if not frames:
        raise ValueError(f"No annotated frames in {split}")
    return dict(stats), unmatched_accepts, latencies


def report(data, predictions, split, threshold=None, margin=None):
    stats, unmatched, latency = score(data, predictions, split, threshold, margin)
    ordered = sorted(latency)
    first = next(iter(predictions.values()))
    configuration = {
        k: first.get(k)
        for k in (
            "model",
            "requestedAnalysisWidth",
            "analysisWidth",
            "detector",
            "detectorSize",
            "backend",
            "gallerySizes",
            "metric",
            "latencyScope",
            "threshold",
            "margin",
        )
    }
    return dict(
        manifestDigest=hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
        configuration=configuration,
        split=split,
        sessions=sorted({c["session"] for c in data["clips"] if c["split"] == split}),
        clips=[c["id"] for c in data["clips"] if c["split"] == split],
        buckets=stats,
        threshold=threshold,
        margin=margin,
        frames=len(latency),
        unmatchedAccepted=unmatched,
        latencyMs=dict(
            median=ordered[len(ordered) // 2], p95=ordered[math.ceil(len(ordered) * 0.95) - 1]
        ),
        note=(
            "Offline inference/scoring latency, not live end-to-end FPS. "
            "Correlated frames are not independent trials."
        ),
    )


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
    parser.add_argument(
        "--margin", type=float, help="Runner-up score margin; requires per-person scores"
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable report")
    args = parser.parse_args()
    if args.margin is not None and (not math.isfinite(args.margin) or args.margin < 0):
        parser.error("Margin must be finite and nonnegative")
    if args.threshold is not None and not math.isfinite(args.threshold):
        parser.error("Threshold must be finite")
    data = load_manifest(args.manifest)
    result = report(
        data, read_predictions(args.predictions), args.split, args.threshold, args.margin
    )
    if args.json:
        print(json.dumps(result, indent=2, allow_nan=False))
        return
    print(
        "Source face px | Detection detected/all | Identification correct/detected enrolled | "
        "Wrong family | Unknown accepts/unknown"
    )
    for name in BUCKETS:
        s = result["buckets"].get(name)
        if not s:
            print(f"{name:14} | no samples")
            continue
        print(
            f"{name:14} | {s['detected']}/{s['known'] + s['unknown']} | "
            f"{s['identified']}/{s['detected_known']} | {s['wrong_family']} | "
            f"{s['unknown_accept']}/{s['unknown']}"
        )
    print(
        f"Unmatched accepted detections: {result['unmatchedAccepted']}; "
        f"frames: {result['frames']}; latency: {result['latencyMs']}"
    )
    print(f"Sessions: {result['sessions']}; clips: {result['clips']}")
    print(result["note"])


if __name__ == "__main__":
    main()
