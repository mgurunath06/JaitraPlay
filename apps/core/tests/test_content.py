from pathlib import Path

from jaitra_core.content import ContentCatalog


def test_initial_pack_is_valid(repository_root: Path) -> None:
    catalog = ContentCatalog(repository_root / "content/packs")
    reports = catalog.load()
    assert len(reports) == 1
    assert reports[0].valid
    assert reports[0].enabled_activities == ["picture_guess"]


def test_missing_asset_disables_pack(tmp_path: Path) -> None:
    pack_dir = tmp_path / "broken"
    pack_dir.mkdir()
    (pack_dir / "pack.json").write_text(
        """
        {
          "schemaVersion": 1, "packId": "broken", "version": "0.1.0", "locale": "en",
          "activities": [{"activityType":"picture_guess","minPoolSize":2,
            "choiceCount":2,"recentWindow":2,"families":["animals"]}],
          "concepts": [{
            "concept_id":"animal_fox","family":"animals","activities":["picture_guess"],
            "language":{"en":{"display_label":"Fox","spoken_label":"fox",
              "prompt":"Find the fox.","hint":"It has a bushy tail."}},
            "media":{"image":"assets/missing.svg","alt":"A fox","source":"test","license":"test"}
          }]
        }
        """,
        encoding="utf-8",
    )
    report = ContentCatalog(tmp_path).validate_pack(pack_dir / "pack.json")
    assert not report.valid
    assert {error.code for error in report.errors} == {"ASSET_MISSING", "CONTENT_POOL_INSUFFICIENT"}
