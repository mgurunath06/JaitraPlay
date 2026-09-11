"""Combine score.py --json calibration reports into a Step Zero Markdown table."""

import argparse
import json
from pathlib import Path

from score import BUCKETS


def compare(paths):
    reports = [(Path(path).stem, json.loads(Path(path).read_text())) for path in paths]
    if not reports or any(report["split"] != "calibration" for _, report in reports):
        raise ValueError("Step Zero comparison accepts calibration reports only")
    reference = reports[0][1]
    if any(
        (report.get("manifestDigest"), report["clips"], report["sessions"], report["frames"])
        != (
            reference.get("manifestDigest"),
            reference["clips"],
            reference["sessions"],
            reference["frames"],
        )
        for _, report in reports
    ):
        raise ValueError("Reports must cover identical clips, sessions and annotated frame counts")
    lines = [
        "# Step Zero calibration comparison",
        "",
        "Offline pipeline measurements; not live FPS or population accuracy.",
        "",
        "| Run | Source face px | Detection | Correct / detected enrolled | "
        "Wrong family | Unknown accepts / unknown |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for name, report in reports:
        for bucket in BUCKETS:
            s = report["buckets"].get(bucket)
            if not s:
                lines.append(f"| {name} | {bucket} | no samples | — | — | — |")
            else:
                lines.append(
                    f"| {name} | {bucket} | {s['detected']}/{s['known'] + s['unknown']} | "
                    f"{s['identified']}/{s['detected_known']} | {s['wrong_family']} | "
                    f"{s['unknown_accept']}/{s['unknown']} |"
                )
    lines.extend(["", "## Run settings and coverage", ""])
    for name, report in reports:
        lines.append(
            f"- {name}: config `{json.dumps(report['configuration'], sort_keys=True)}`; "
            f"threshold override {report['threshold']}; margin override {report['margin']}; "
            f"sessions {report['sessions']}; clips {report['clips']}; frames {report['frames']}; "
            f"unmatched accepts {report['unmatchedAccepted']}; latency ms {report['latencyMs']}."
        )
    lines.extend(
        [
            "",
            "## Decision — complete after review",
            "",
            "- Camera model, position, height, lighting and distance notes: pending.",
            "- Selected decision-rule row and evidence: pending.",
            "- Frozen threshold and margin: pending; initial run cutoffs are exploratory.",
            "- Acquisition distance/time and live end-to-end FPS: pending direct measurement.",
            "- Revised v2 scope: pending.",
            "- Held-out test: not evaluated by this command.",
        ]
    )
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+")
    print(compare(parser.parse_args().reports), end="")
