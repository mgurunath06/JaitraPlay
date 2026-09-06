from __future__ import annotations

import json
from pathlib import Path

import anyio
import pytest
from jaitra_core.providers.storybooks import StorybookService, _OutlinePage


def outline() -> tuple[_OutlinePage, ...]:
    return tuple(
        _OutlinePage(
            text=f"Mimo carefully explores a cheerful garden moment on page {page}.",
            characters=("Mimo",),
            scene=f"Mimo looks at a different colorful garden plant for scene {page}.",
        )
        for page in range(1, 16)
    )


def test_topic_guardrails_and_outline_validation() -> None:
    assert StorybookService._safe_topic("  Mimo plants a garden!  ") == "Mimo plants a garden"
    with pytest.raises(ValueError, match="not suitable"):
        StorybookService._safe_topic("a story about a gun")

    raw = {
        "title": "Mimo’s Garden Day",
        "pages": [
            {"text": page.text, "characters": list(page.characters), "scene": page.scene}
            for page in outline()
        ],
    }
    title, pages = StorybookService._validate_outline(json.dumps(raw))
    assert title == "Mimo’s Garden Day"
    assert len(pages) == 15


def test_background_story_job_tracks_fifteen_images(
    tmp_path: Path, repository_root: Path
) -> None:
    service = StorybookService(repository_root, tmp_path)

    def fake_outline(_topic: str) -> tuple[str, tuple[_OutlinePage, ...], str]:
        return "Mimo’s Garden Day", outline(), "openrouter"

    def fake_image(story_id: str, page_number: int, _page: _OutlinePage) -> None:
        directory = service.storage_root / story_id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"page-{page_number:02d}.png").write_bytes(b"test-image")

    service._generate_outline = fake_outline  # type: ignore[method-assign]
    service._generate_image = fake_image  # type: ignore[method-assign]

    async def exercise() -> None:
        created = service.start("Mimo plants a garden")
        for _attempt in range(100):
            current = service.get(created.story_id)
            if current.status in {"ready", "failed"}:
                break
            await anyio.sleep(0.01)
        assert current.status == "ready"
        assert current.completed_pages == 15
        assert len(current.pages) == 15
        assert all(page.image_ready for page in current.pages)
        assert service.image_path(created.story_id, 15).is_file()

    try:
        anyio.run(exercise)
    finally:
        service.stop()
