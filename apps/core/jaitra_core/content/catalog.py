from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import ValidationError

from .models import ContentPack, ValidationIssue, ValidationReport


class ContentCatalog:
    def __init__(self, packs_dir: Path) -> None:
        self.packs_dir = packs_dir
        self.packs: dict[str, ContentPack] = {}
        self.reports: list[ValidationReport] = []

    def load(self) -> list[ValidationReport]:
        self.packs.clear()
        self.reports = [
            self.validate_pack(path) for path in sorted(self.packs_dir.glob("*/pack.json"))
        ]
        return self.reports

    def validate_pack(self, manifest_path: Path) -> ValidationReport:
        pack_root = manifest_path.parent
        errors: list[ValidationIssue] = []
        try:
            raw = json.loads(manifest_path.read_text(encoding="utf-8"))
            pack = ContentPack.model_validate(raw)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            return ValidationReport(
                valid=False,
                pack_path=pack_root,
                errors=[
                    ValidationIssue(
                        code="MANIFEST_INVALID", path=str(manifest_path), message=str(exc)
                    )
                ],
            )

        concept_ids: set[str] = set()
        for index, concept in enumerate(pack.concepts):
            if concept.concept_id in concept_ids:
                errors.append(
                    ValidationIssue(
                        code="CONCEPT_DUPLICATE",
                        path=f"concepts[{index}]",
                        message=f"duplicate concept id {concept.concept_id}",
                    )
                )
            concept_ids.add(concept.concept_id)
            image_path = (pack_root / concept.media.image).resolve()
            if not image_path.is_relative_to(pack_root.resolve()) or not image_path.is_file():
                errors.append(
                    ValidationIssue(
                        code="ASSET_MISSING",
                        path=f"concepts[{index}].media.image",
                        message=f"missing or unsafe asset {concept.media.image}",
                    )
                )

        enabled: list[str] = []
        for policy in pack.activities:
            eligible = [
                concept
                for concept in pack.concepts
                if concept.status == "approved"
                and concept.family in policy.families
                and policy.activity_type in concept.activities
            ]
            if len(eligible) < policy.min_pool_size:
                errors.append(
                    ValidationIssue(
                        code="CONTENT_POOL_INSUFFICIENT",
                        path=f"activities.{policy.activity_type}",
                        message=f"requires {policy.min_pool_size} concepts, found {len(eligible)}",
                    )
                )
            else:
                enabled.append(policy.activity_type)

        valid = not errors
        if valid:
            self.packs[pack.pack_id] = pack
        return ValidationReport(
            pack_id=pack.pack_id,
            valid=valid,
            errors=errors,
            enabled_activities=enabled if valid else [],
            pack_path=pack_root,
        )

    def asset_path(self, asset_id: str) -> Path | None:
        if not asset_id or any(
            char not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for char in asset_id
        ):
            return None
        for report in self.reports:
            if not report.valid:
                continue
            candidate = (report.pack_path / "assets" / f"{asset_id}.svg").resolve()
            if candidate.is_relative_to(report.pack_path.resolve()) and candidate.is_file():
                return candidate
        return None

    @staticmethod
    def digest(manifest_path: Path) -> str:
        return hashlib.sha256(manifest_path.read_bytes()).hexdigest()
