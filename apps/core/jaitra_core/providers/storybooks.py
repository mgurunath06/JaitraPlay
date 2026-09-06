from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import secrets
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from jaitra_core.api.models import StorybookLibraryItem, StorybookPage, StorybookSnapshot

logger = logging.getLogger(__name__)
TextProvider = Literal["mwapi", "startupapi", "openrouter"]
CHARACTERS = {"Mimo", "Mama Rabbit", "Teacher Lily", "Papa Rabbit"}
LUCKY_TOPICS = (
    "Mimo plants a tiny garden and patiently watches it grow",
    "Mimo visits the library and discovers how books are organized",
    "Mimo prepares a cheerful family picnic with Mama and Papa Rabbit",
    "Mimo learns to take turns during a playful day with Teacher Lily",
    "Mimo explores the colors and shapes found on a gentle nature walk",
    "Mimo builds a cozy blanket fort with Mama and Papa Rabbit",
    "Mimo helps Teacher Lily prepare a classroom art display",
    "Mimo discovers why washing hands keeps everyone healthy",
)
BLOCKED_TOPIC_WORDS = {
    "alcohol",
    "blood",
    "drug",
    "drugs",
    "gun",
    "hate",
    "horror",
    "kidnap",
    "kill",
    "murder",
    "naked",
    "nightmare",
    "sexy",
    "shoot",
    "suicide",
    "weapon",
}


class StorybookGenerationError(RuntimeError):
    pass


class StorybookNotFound(LookupError):
    pass


@dataclass(frozen=True)
class _OutlinePage:
    text: str
    characters: tuple[str, ...]
    scene: str


@dataclass
class _StoryJob:
    snapshot: StorybookSnapshot
    outline: tuple[_OutlinePage, ...] = ()


class StorybookService:
    def __init__(self, repository_root: Path, state_dir: Path) -> None:
        self.repository_root = repository_root
        self.storage_root = state_dir / "storybooks"
        self.character_bible = (
            repository_root / "docs" / "CHARACTER_BIBLE.md"
        ).read_text(encoding="utf-8")
        self.character_anchor = (
            repository_root / "content" / "characters" / "character-lineup.png"
        )
        self.image_model = os.environ.get(
            "JAITRA_STORY_IMAGE_MODEL", "bytedance-seed/seedream-5-0-lite"
        )
        self._jobs: dict[str, _StoryJob] = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._load_saved()

    def start(self, requested_topic: str | None) -> StorybookSnapshot:
        topic = self._safe_topic(requested_topic)
        story_id = str(uuid4())
        snapshot = StorybookSnapshot(
            storyId=story_id,
            status="planning",
            topic=topic,
            imageProvider=f"OpenRouter · {self.image_model}",
        )
        job = _StoryJob(snapshot=snapshot)
        self._jobs[story_id] = job
        self._save_snapshot(snapshot)
        task = asyncio.create_task(self._run(job))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return snapshot.model_copy(deep=True)

    def get(self, story_id: str) -> StorybookSnapshot:
        job = self._jobs.get(story_id)
        if job is None:
            raise StorybookNotFound(story_id)
        return job.snapshot.model_copy(deep=True)

    def list_books(self) -> list[StorybookLibraryItem]:
        books = [
            StorybookLibraryItem(
                storyId=job.snapshot.story_id,
                title=job.snapshot.title,
                topic=job.snapshot.topic,
                createdAt=job.snapshot.created_at,
                completedPages=job.snapshot.completed_pages,
            )
            for job in self._jobs.values()
            if job.snapshot.status == "ready" and job.snapshot.title is not None
        ]
        return sorted(books, key=lambda book: (book.title.casefold(), book.created_at))

    def image_path(self, story_id: str, page_number: int) -> Path:
        job = self._jobs.get(story_id)
        if job is None or not 1 <= page_number <= 15:
            raise StorybookNotFound(story_id)
        path = self.storage_root / story_id / f"page-{page_number:02d}.png"
        if not path.is_file():
            raise StorybookNotFound(story_id)
        return path

    def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

    async def _run(self, job: _StoryJob) -> None:
        try:
            title, outline, provider = await asyncio.to_thread(
                self._generate_outline, job.snapshot.topic
            )
            job.outline = outline
            job.snapshot.title = title
            job.snapshot.text_provider = provider
            job.snapshot.status = "illustrating"
            job.snapshot.pages = [
                StorybookPage(pageNumber=index, text=page.text)
                for index, page in enumerate(outline, start=1)
            ]
            self._save_snapshot(job.snapshot)

            semaphore = asyncio.Semaphore(2)

            async def illustrate(page_number: int, page: _OutlinePage) -> None:
                async with semaphore:
                    await asyncio.to_thread(
                        self._generate_image, job.snapshot.story_id, page_number, page
                    )
                job.snapshot.pages[page_number - 1].image_ready = True
                job.snapshot.completed_pages += 1
                self._save_snapshot(job.snapshot)

            await asyncio.gather(
                *(
                    illustrate(page_number, page)
                    for page_number, page in enumerate(outline, start=1)
                )
            )
            job.snapshot.status = "ready"
            self._save_snapshot(job.snapshot)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("STORYBOOK_GENERATION_FAILED error=%s", type(exc).__name__)
            job.snapshot.status = "failed"
            job.snapshot.error = "The story helpers could not finish this book. Please try again."
            self._save_snapshot(job.snapshot)

    def _generate_outline(
        self, topic: str
    ) -> tuple[str, tuple[_OutlinePage, ...], TextProvider]:
        prompt = self._story_prompt(topic)
        errors: list[str] = []
        for provider, path in self._profile_paths():
            try:
                profile = self._load_profile(path)
                raw = self._request_text(provider, profile, prompt)
                title, pages = self._validate_outline(raw)
                return title, pages, provider
            except Exception as exc:
                errors.append(f"{provider}:{type(exc).__name__}")
                logger.warning(
                    "STORY_TEXT_PROVIDER_FAILED provider=%s error=%s",
                    provider,
                    type(exc).__name__,
                )
        raise StorybookGenerationError(", ".join(errors) or "no story provider configured")

    def _generate_image(
        self, story_id: str, page_number: int, page: _OutlinePage
    ) -> None:
        profile = self._load_profile(
            self.repository_root / ".claude" / "settings.openrouter.json"
        )
        if not self.character_anchor.is_file():
            raise StorybookGenerationError("canonical character anchor is missing")
        reference = "data:image/png;base64," + base64.b64encode(
            self.character_anchor.read_bytes()
        ).decode()
        present = ", ".join(page.characters)
        prompt = (
            "Use case: identity-preserve illustration-story.\n"
            "Create one landscape page illustration for a warm preschool picture book.\n"
            f"Scene: {page.scene}\n"
            f"Characters present: {present}. Include exactly these named characters and no "
            "others.\n"
            "The reference image is the mandatory identity and style anchor. Preserve each present "
            "character's face, age, species, proportions, fur, eyes, signature outfit, and "
            "relative "
            "scale. Use the same gentle watercolor texture and cozy lighting. No text, letters, "
            "numbers, logos, borders, panels, frightening imagery, danger, or watermark.\n\n"
            "Canonical character bible (mandatory):\n"
            f"{self.character_bible}"
        )
        payload = {
            "model": self.image_model,
            "prompt": prompt,
            "input_references": [
                {"type": "image_url", "image_url": {"url": reference}}
            ],
            "resolution": "2K",
            "aspect_ratio": "4:3",
            "n": 1,
        }
        request = urllib.request.Request(
            f"{profile['base_url']}/images",
            data=json.dumps(payload).encode(),
            headers={
                "authorization": f"Bearer {profile['token']}",
                "content-type": "application/json",
                "http-referer": "https://jaitra.local",
                "x-title": "JAITRA Play",
            },
            method="POST",
        )
        last_error: Exception | None = None
        for _attempt in range(2):
            try:
                with urllib.request.urlopen(request, timeout=240) as response:
                    result = json.loads(response.read())
                image = base64.b64decode(result["data"][0]["b64_json"], validate=True)
                if not image.startswith(b"\x89PNG\r\n\x1a\n") or len(image) > 25_000_000:
                    raise StorybookGenerationError("image provider returned invalid media")
                directory = self.storage_root / story_id
                directory.mkdir(parents=True, exist_ok=True)
                temporary = directory / f"page-{page_number:02d}.tmp"
                final = directory / f"page-{page_number:02d}.png"
                temporary.write_bytes(image)
                temporary.replace(final)
                return
            except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
                last_error = exc
        raise StorybookGenerationError("image generation failed") from last_error

    def _story_prompt(self, topic: str) -> str:
        return (
            "Create a safe, cheerful picture-book story for one four-year-old child. "
            f"Topic: {topic!r}. Use simple concrete words, gentle humor, emotional warmth, and a "
            "reassuring ending. The story must have exactly 15 pages. Each page has one or two "
            "short sentences, 12 to 35 words total, and one concrete visual scene. Mimo must be "
            "the "
            "main character. Only Mimo, Mama Rabbit, Teacher Lily, and Papa Rabbit may appear as "
            "characters; do not invent or depict other people, animals, fantasy beings, or named "
            "characters. Avoid danger, injury, fear, conflict, villains, weapons, death, romance, "
            "shame, stereotypes, brands, purchases, secrets from caregivers, unsafe behavior, and "
            "requests for personal information. Do not mention AI or the reader. Keep character "
            "behavior consistent with the canonical bible below. Return JSON only with this exact "
            "shape: {\"title\":\"...\",\"pages\":[{\"text\":\"...\",\"characters\":[\"Mimo\"],"
            "\"scene\":\"...\"}]}. Every characters value must use only the four exact canonical "
            "names. Scene descriptions must specify only visible action and setting; do not put "
            "written words, letters, or numbers in the illustration.\n\n"
            f"{self.character_bible}"
        )

    @staticmethod
    def _validate_outline(raw: str) -> tuple[str, tuple[_OutlinePage, ...]]:
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            raise StorybookGenerationError("story provider did not return JSON")
        data: dict[str, Any] = json.loads(raw[start : end + 1])
        title = str(data.get("title", "")).strip()
        items = data.get("pages")
        if not 3 <= len(title) <= 80 or not isinstance(items, list) or len(items) != 15:
            raise StorybookGenerationError("invalid story structure")
        pages: list[_OutlinePage] = []
        all_text = title.casefold()
        for item in items:
            if not isinstance(item, dict):
                raise StorybookGenerationError("invalid story page")
            text = str(item.get("text", "")).strip()
            scene = str(item.get("scene", "")).strip()
            characters = item.get("characters")
            if not 20 <= len(text) <= 280 or not 10 <= len(scene) <= 600:
                raise StorybookGenerationError("invalid story page length")
            if not isinstance(characters, list) or not characters:
                raise StorybookGenerationError("story page has no canonical character")
            names = tuple(str(name) for name in characters)
            if len(set(names)) != len(names) or not set(names) <= CHARACTERS:
                raise StorybookGenerationError("story uses a noncanonical character")
            all_text += f" {text.casefold()} {scene.casefold()}"
            pages.append(_OutlinePage(text=text, characters=names, scene=scene))
        if "mimo" not in all_text or StorybookService._contains_blocked_content(all_text):
            raise StorybookGenerationError("story failed child-safety validation")
        return title, tuple(pages)

    @staticmethod
    def _safe_topic(requested_topic: str | None) -> str:
        if requested_topic is None:
            return secrets.choice(LUCKY_TOPICS)
        topic = re.sub(r"\s+", " ", requested_topic).strip(" .,!?:;\t\r\n")
        if not 3 <= len(topic) <= 120 or StorybookService._contains_blocked_content(topic):
            raise ValueError("topic is not suitable for a preschool story")
        return topic

    @staticmethod
    def _contains_blocked_content(text: str) -> bool:
        words = set(re.findall(r"[a-z]+", text.casefold()))
        return bool(words & BLOCKED_TOPIC_WORDS)

    def _profile_paths(self) -> list[tuple[TextProvider, Path]]:
        root = self.repository_root / ".claude"
        startup = root / "settings.startupapi.json"
        openrouter = root / "settings.openrouter.json"
        return [
            ("mwapi", root / "settings.local.json"),
            ("startupapi", startup),
            ("openrouter", openrouter),
        ]

    @staticmethod
    def _load_profile(path: Path) -> dict[str, str]:
        data = json.loads(path.read_text(encoding="utf-8"))["env"]
        return {
            "base_url": str(data["ANTHROPIC_BASE_URL"]).rstrip("/"),
            "token": str(data["ANTHROPIC_AUTH_TOKEN"]),
        }

    @staticmethod
    def _request_text(provider: TextProvider, profile: dict[str, str], prompt: str) -> str:
        if provider == "openrouter":
            url = f"{profile['base_url']}/chat/completions"
            payload = {
                "model": "openrouter/auto",
                "temperature": 0.7,
                "max_tokens": 5000,
                "messages": [{"role": "user", "content": prompt}],
            }
            headers = {"authorization": f"Bearer {profile['token']}"}
        else:
            url = f"{profile['base_url']}/v1/messages"
            payload = {
                "model": "claude-sonnet-4-6",
                "temperature": 0.7,
                "max_tokens": 5000,
                "messages": [{"role": "user", "content": prompt}],
            }
            headers = {
                "authorization": f"Bearer {profile['token']}",
                "anthropic-version": "2023-06-01",
                "user-agent": "JAITRA-Play/0.1",
            }
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"content-type": "application/json", **headers},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                result = json.loads(response.read())
        except (OSError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            raise StorybookGenerationError(f"{provider} request failed") from exc
        if provider == "openrouter":
            return str(result["choices"][0]["message"]["content"])
        return "".join(
            str(block.get("text", ""))
            for block in result.get("content", [])
            if block.get("type") == "text"
        )

    def _save_snapshot(self, snapshot: StorybookSnapshot) -> None:
        directory = self.storage_root / snapshot.story_id
        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / "story.tmp"
        final = directory / "story.json"
        temporary.write_text(snapshot.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        temporary.replace(final)

    def _load_saved(self) -> None:
        if not self.storage_root.is_dir():
            return
        for path in self.storage_root.glob("*/story.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                data.setdefault("createdAt", path.stat().st_mtime)
                snapshot = StorybookSnapshot.model_validate(data)
                if (
                    snapshot.status != "ready"
                    or snapshot.completed_pages != 15
                    or len(snapshot.pages) != 15
                    or not all(page.image_ready for page in snapshot.pages)
                ):
                    continue
                if not all(
                    (path.parent / f"page-{page.page_number:02d}.png").is_file()
                    for page in snapshot.pages
                ):
                    continue
                self._jobs[snapshot.story_id] = _StoryJob(snapshot=snapshot)
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                logger.warning("STORYBOOK_LIBRARY_ENTRY_INVALID path=%s", path)
