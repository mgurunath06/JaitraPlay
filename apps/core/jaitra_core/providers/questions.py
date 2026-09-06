from __future__ import annotations

import asyncio
import json
import logging
import secrets
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Literal

from jaitra_core.api.models import GeneratedQuestion, QuestionChoice, QuestionRequest

logger = logging.getLogger(__name__)
ProviderName = Literal["mwapi", "startupapi", "openrouter"]


class QuestionGenerationError(RuntimeError):
    pass


class AiQuestionService:
    def __init__(self, repository_root: Path) -> None:
        self.repository_root = repository_root

    async def generate(self, activity_id: str, request: QuestionRequest) -> GeneratedQuestion:
        errors: list[str] = []
        for name, profile_path in self._profile_paths():
            try:
                profile = self._load_profile(profile_path)
                raw = await asyncio.to_thread(
                    self._request_provider, name, profile, activity_id, request
                )
                return self._validate(raw, activity_id, name)
            except Exception as exc:
                errors.append(f"{name}:{type(exc).__name__}")
                logger.warning(
                    "AI_QUESTION_PROVIDER_FAILED provider=%s error=%s",
                    name,
                    type(exc).__name__,
                )
        raise QuestionGenerationError(", ".join(errors) or "no AI provider profiles configured")

    def _profile_paths(self) -> list[tuple[ProviderName, Path]]:
        root = self.repository_root / ".claude"
        startupapi = root / "settings.startupapi.json"
        if not startupapi.is_file():
            startupapi = root / "settings.startupapi.example.json"
        openrouter = root / "settings.openrouter.json"
        if not openrouter.is_file():
            openrouter = root / "settings.openrouter.example.json"
        return [
            ("mwapi", root / "settings.local.json"),
            ("startupapi", startupapi),
            ("openrouter", openrouter),
        ]

    @staticmethod
    def _load_profile(path: Path) -> dict[str, str]:
        data = json.loads(path.read_text(encoding="utf-8"))
        env = data["env"]
        return {
            "base_url": str(env["ANTHROPIC_BASE_URL"]).rstrip("/"),
            "token": str(env["ANTHROPIC_AUTH_TOKEN"]),
        }

    def _request_provider(
        self,
        name: ProviderName,
        profile: dict[str, str],
        activity_id: str,
        request: QuestionRequest,
    ) -> str:
        prompt = self._prompt(activity_id, request)
        if name == "openrouter":
            url = "https://openrouter.ai/api/v1/chat/completions"
            payload = {
                "model": "openrouter/auto",
                "temperature": 0.8,
                "max_tokens": 500,
                "messages": [{"role": "user", "content": prompt}],
            }
            headers = {"authorization": f"Bearer {profile['token']}"}
        else:
            url = f"{profile['base_url']}/v1/messages"
            payload = {
                "model": "claude-sonnet-4-6",
                "temperature": 0.8,
                "max_tokens": 500,
                "messages": [{"role": "user", "content": prompt}],
            }
            headers = {
                "authorization": f"Bearer {profile['token']}",
                "anthropic-version": "2023-06-01",
                "user-agent": "claude-cli/2.1.0",
            }
        http_request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"content-type": "application/json", **headers},
            method="POST",
        )
        try:
            with urllib.request.urlopen(http_request, timeout=30) as response:
                result = json.loads(response.read())
        except (OSError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            raise QuestionGenerationError(f"{name} request failed") from exc
        if name == "openrouter":
            return str(result["choices"][0]["message"]["content"])
        return "".join(
            str(block.get("text", ""))
            for block in result.get("content", [])
            if block.get("type") == "text"
        )

    @staticmethod
    def _prompt(activity_id: str, request: QuestionRequest) -> str:
        activity_rules = {
            "picture_guess": (
                "Show four distinct emoji figures: choose a fresh theme from foods, vehicles, "
                "nature, instruments or household objects. Ask for identification, a use, "
                "or a distinguishing property. Avoid animal riddles."
            ),
            "colours_shapes": (
                "Create a colour identification question. Each choice label must be its simple "
                "English colour name and color must be a valid six-digit hex value."
            ),
            "memory_cards": (
                "Create a memory-match theme. Provide exactly three choices, each a distinct, "
                "familiar object or animal emoji. The prompt should invite the child to match "
                "pairs."
            ),
            "riddle_guess": (
                "Create a short what-am-I riddle about a tool, food, vehicle, instrument or "
                "natural object. Give four emoji-and-name choices. Avoid animal identification."
            ),
        }
        if activity_id not in activity_rules:
            raise QuestionGenerationError("unsupported activity")
        adaptation = ""
        if request.needed_hint and request.previous_prompt:
            adaptation = (
                " The child needed a hint on the previous question. Create a different but similar "
                "and slightly easier question reinforcing that concept: "
                f"{request.previous_prompt!r}."
            )
        recent = "; ".join(request.recent_prompts[:120])
        return (
            "You create safe, cheerful, factual learning games for children ages 4 to 7. "
            f"{activity_rules[activity_id]}{adaptation} Do not repeat these recent prompts: "
            f"{recent!r}. Do not just reword an old question or reuse its target. "
            f"Creative seed: {secrets.token_hex(8)}. "
            "Return JSON only with this exact shape: "
            '{"prompt":"...","hint":"...","choices":[{"value":"unique_slug",'
            '"label":"...","color":null}],"answer":"one_choice_value","explanation":"..."}. '
            "Use 3 choices for memory_cards and exactly 4 choices otherwise. Keep every string "
            "short."
        )

    @staticmethod
    def _validate(
        raw: str, activity_id: str, provider: ProviderName
    ) -> GeneratedQuestion:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            raise QuestionGenerationError("provider did not return JSON")
        data: dict[str, Any] = json.loads(raw[start : end + 1])
        choices = [QuestionChoice.model_validate(item) for item in data["choices"]]
        expected = 3 if activity_id == "memory_cards" else 4
        if len(choices) != expected or len({item.value for item in choices}) != expected:
            raise QuestionGenerationError("invalid choice count")
        if data.get("answer") not in {item.value for item in choices}:
            raise QuestionGenerationError("answer is not a choice")
        if activity_id == "colours_shapes" and any(item.color is None for item in choices):
            raise QuestionGenerationError("colour choice is missing a hex value")
        return GeneratedQuestion(
            activityId=activity_id,
            prompt=data["prompt"],
            hint=data["hint"],
            choices=choices,
            answer=data["answer"],
            explanation=data["explanation"],
            provider=provider,
            kind="memory" if activity_id == "memory_cards" else "quiz",
        )
