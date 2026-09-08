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


def test_background_story_job_tracks_fifteen_images(tmp_path: Path, repository_root: Path) -> None:
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

    restarted = StorybookService(repository_root, tmp_path)
    books = restarted.list_books()
    assert [(book.title, book.topic) for book in books] == [
        ("Mimo’s Garden Day", "Mimo plants a garden")
    ]
    saved = restarted.get(books[0].story_id)
    assert saved.status == "ready"
    assert saved.completed_pages == 15
    assert restarted.image_path(saved.story_id, 1).is_file()


def test_image_formats_and_profile_normalization(tmp_path: Path) -> None:
    from jaitra_core.providers.storybooks import StorybookGenerationError

    assert StorybookService._image_extension(b"\xff\xd8\xff" + b"x" * 20) == "jpg"
    assert StorybookService._image_extension(b"RIFFxxxxWEBP" + b"x" * 20) == "webp"
    with pytest.raises(StorybookGenerationError):
        StorybookService._image_extension(b"<svg>untrusted</svg>")
    path = tmp_path / "profile.json"
    path.write_text(
        json.dumps(
            {
                "env": {
                    "OPENAI_BASE_URL": "https://openrouter.ai/api",
                    "OPENAI_API_KEY": "test-only",
                }
            }
        )
    )
    assert StorybookService._load_profile(path)["base_url"] == "https://openrouter.ai/api/v1"


def test_jpeg_image_is_saved_and_served_without_png_assumption(
    tmp_path: Path, repository_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import base64
    import io
    import urllib.request

    service = StorybookService(repository_root, tmp_path)
    monkeypatch.setattr(
        service,
        "_load_profile",
        lambda _: {
            "base_url": "https://openrouter.ai/api/v1",
            "token": "test-only",
        },
    )
    image = b"\xff\xd8\xff" + b"x" * 20
    monkeypatch.setattr(
        urllib.request,
        "urlopen",
        lambda *a, **kw: io.BytesIO(
            json.dumps({"data": [{"b64_json": base64.b64encode(image).decode()}]}).encode()
        ),
    )
    service._generate_image("test-story", 1, outline()[0])
    assert (service.storage_root / "test-story/page-01.jpg").read_bytes() == image


def test_story_failure_keeps_http_status_without_secret() -> None:
    import urllib.error

    error = urllib.error.HTTPError("https://secret.example", 401, "secret", {}, None)
    assert StorybookService._failure(error) == {"error": "HTTPError", "httpStatus": 401}
