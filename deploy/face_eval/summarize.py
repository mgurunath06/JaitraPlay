"""Summarize a baseline diagnostic JSONL without printing face descriptors."""

import argparse
import json
from collections import Counter
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("log")
args = parser.parse_args()
rows = [json.loads(line) for line in Path(args.log).read_text().splitlines()]
frames = [row for row in rows if row.get("type") == "frame"]
faces = [face for row in frames for face in row["faces"]]
print(f"Processed frames: {len(frames)}; no detection: {sum(not row['faces'] for row in frames)}")
print(
    f"Faces: {len(faces)}; under 50 analysis px: "
    f"{sum(face['box']['width'] < 50 for face in faces)}; "
    f"baseline size rejected: {sum(not face['acceptedByBaseline'] for face in faces)}"
)
print("Tracker decisions:", dict(Counter(row["decision"] for row in frames)))
for name, values in {
    "analysis face width px": [face["box"]["width"] for face in faces],
    "Laplacian variance": [face["blur"] for face in faces],
    "mean luminance": [face["luminance"] for face in faces],
    "mean top-three distance (lower better)": [face["meanTop3Distance"] for face in faces],
    "processing latency ms": [row["latencyMs"] for row in frames],
}.items():
    values = sorted(value for value in values if value is not None)
    if values:
        print(
            f"{name}: min={values[0]:.3f}, "
            f"median={values[len(values) // 2]:.3f}, max={values[-1]:.3f}"
        )
print("Pipeline errors:", sum(row.get("type") == "error" for row in rows))
print("These unlabelled logs cannot establish correct identity or false-accept rates.")
