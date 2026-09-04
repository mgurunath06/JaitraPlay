import argparse
import json
from pathlib import Path

from .catalog import ContentCatalog


def main() -> None:
    parser = argparse.ArgumentParser(prog="jaitra-content")
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate")
    validate.add_argument("pack", type=Path)
    args = parser.parse_args()

    catalog = ContentCatalog(args.pack.parent)
    report = catalog.validate_pack(args.pack / "pack.json")
    print(json.dumps(report.model_dump(mode="json"), indent=2))
    raise SystemExit(0 if report.valid else 1)
