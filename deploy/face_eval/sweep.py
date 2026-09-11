"""Joint threshold/margin sweep on calibration only; never selects an operating point."""

import argparse
import csv
import math
import sys

from score import load_manifest, read_predictions, score


def values(raw):
    result = [float(value) for value in raw.split(",")]
    if not result or not all(math.isfinite(value) for value in result):
        raise argparse.ArgumentTypeError("Use comma-separated finite numbers")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest")
    parser.add_argument("predictions")
    parser.add_argument("--thresholds", type=values, required=True)
    parser.add_argument("--margins", type=values, required=True)
    args = parser.parse_args()
    if any(m < 0 for m in args.margins):
        parser.error("Margins must be nonnegative")
    data, predictions = load_manifest(args.manifest), read_predictions([args.predictions])
    writer = csv.DictWriter(
        sys.stdout,
        fieldnames=[
            "threshold",
            "margin",
            "known",
            "detected_known",
            "identified",
            "wrong_family",
            "unknown",
            "unknown_accept",
            "unmatched_accepts",
        ],
    )
    writer.writeheader()
    for threshold in args.thresholds:
        for margin in args.margins:
            stats, unmatched, _ = score(data, predictions, "calibration", threshold, margin)
            totals = {
                key: sum(s[key] for s in stats.values())
                for key in [
                    "known",
                    "detected_known",
                    "identified",
                    "wrong_family",
                    "unknown",
                    "unknown_accept",
                ]
            }
            writer.writerow(
                dict(threshold=threshold, margin=margin, unmatched_accepts=unmatched, **totals)
            )


if __name__ == "__main__":
    main()
