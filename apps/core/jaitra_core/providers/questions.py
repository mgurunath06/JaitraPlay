from __future__ import annotations

import asyncio
import json
import logging
import re
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
        for name, profile_path in self.profile_paths():
            try:
                profile = self._load_profile(profile_path)
                raw = await asyncio.to_thread(
                    self._request_provider, name, profile, activity_id, request
                )
                return self._validate(raw, activity_id, name, request)
            except Exception as exc:
                errors.append(f"{name}:{type(exc).__name__}")
                logger.warning(
                    "AI_QUESTION_PROVIDER_FAILED provider=%s error=%s",
                    name,
                    type(exc).__name__,
                )
        raise QuestionGenerationError(", ".join(errors) or "no AI provider profiles configured")

    async def generate_with(
        self, provider: ProviderName, activity_id: str, request: QuestionRequest
    ) -> GeneratedQuestion:
        paths = dict(self.profile_paths())
        try:
            profile = self._load_profile(paths[provider])
            raw = await asyncio.to_thread(
                self._request_provider, provider, profile, activity_id, request
            )
            return self._validate(raw, activity_id, provider, request)
        except Exception as exc:
            logger.warning(
                "AI_QUESTION_PROVIDER_FAILED provider=%s error=%s",
                provider,
                type(exc).__name__,
            )
            raise QuestionGenerationError(f"{provider} request failed") from exc

    def profile_paths(self) -> list[tuple[ProviderName, Path]]:
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
            with urllib.request.urlopen(http_request, timeout=10) as response:
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
                "Create either a short what-am-I riddle, a colour question, or a child-friendly "
                "geography/map question. Rotate among tools, food, vehicles, instruments, natural "
                "objects, continents, oceans, directions, map symbols and simple capitals. Give "
                "four clear choices and avoid animal identification."
            ),
        }
        if activity_id not in activity_rules:
            raise QuestionGenerationError("unsupported activity")
        topic_rule = {
            "riddles": (
                "Create a short what-am-I riddle about food, fruit, vegetables, or nature/sky "
                "things such as the sun, moon, rain, tree or flower. Give four choices, each "
                "with an emoji at the start of its label. No animals."
            ),
            "objects": (
                "Create a short what-am-I riddle about an everyday household, school, "
                "clothing, tool, vehicle or instrument object. Give four choices, each with "
                "an emoji at the start of its label. No animals."
            ),
            "colours": (
                "Create a colour question for children ages 4 to 7. Every choice label must "
                "be a simple English colour name and every choice must have color as a valid "
                "six-digit hex value like #2563eb."
            ),
            "geography": (
                "Create a factually correct, child-friendly geography/map question about "
                "continents, oceans, directions, map symbols, or simple well-known countries "
                "or capitals. Give four clear choices."
            ),
            "patterns": (
                "Create either 'What number comes next? a, b, c, d, ?' using a constant "
                "positive step of 1 to 5 with every number, including the answer, at most 35; "
                "or 'What comes next in this pattern? <emojis> ?' using an AB, AAB or ABC "
                "repeating emoji pattern. Exactly one of four choices must be correct. For "
                "number questions, the correct choice value and label must both be the next "
                "number as plain digits."
            ),
        }
        requested_topic = request.topic if activity_id == "riddle_guess" else None
        rule = (
            topic_rule[requested_topic]
            if requested_topic is not None
            else activity_rules[activity_id]
        )
        adaptation = ""
        if request.needed_hint and request.previous_prompt:
            adaptation = (
                " The child needed a hint on the previous question. Create a different but similar "
                "and slightly easier question reinforcing that concept: "
                f"{request.previous_prompt!r}."
            )
        recent = "; ".join(request.recent_prompts[:120])
        response_shape = (
            '{"prompt":"...","hint":"...","choices":[{"value":"unique_slug",'
            '"label":"...","color":null}],"answer":"one_choice_value",'
            '"explanation":"..."'
            + (f',"topic":"{requested_topic}"' if requested_topic is not None else "")
            + "}. "
        )
        return (
            "You create safe, cheerful, factual learning games for children ages 4 to 7. "
            f"{rule}{adaptation} Do not repeat these recent prompts: "
            f"{recent!r}. Do not just reword an old question or reuse its target. "
            f"Creative seed: {secrets.token_hex(8)}. "
            "Return JSON only with this exact shape: "
            f"{response_shape}"
            "Use 3 choices for memory_cards and exactly 4 choices otherwise. Keep every string "
            "short."
        )

    @staticmethod
    def _validate(
        raw: str, activity_id: str, provider: ProviderName, request: QuestionRequest
    ) -> GeneratedQuestion:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            raise QuestionGenerationError("provider did not return JSON")
        data: dict[str, Any] = json.loads(raw[start : end + 1])
        requested_topic = request.topic if activity_id == "riddle_guess" else None
        if requested_topic is not None and data.get("topic") not in (None, requested_topic):
            raise QuestionGenerationError("topic mismatch")
        if requested_topic == "colours" and any(
            not isinstance(item.get("color"), str)
            or re.fullmatch(r"#[0-9a-fA-F]{6}", item["color"]) is None
            for item in data["choices"]
        ):
            raise QuestionGenerationError("colour choice is missing a valid hex value")
        choices = [QuestionChoice.model_validate(item) for item in data["choices"]]
        expected = 3 if activity_id == "memory_cards" else 4
        if len(choices) != expected or len({item.value for item in choices}) != expected:
            raise QuestionGenerationError("invalid choice count")
        if data.get("answer") not in {item.value for item in choices}:
            raise QuestionGenerationError("answer is not a choice")
        if activity_id == "colours_shapes" and any(item.color is None for item in choices):
            raise QuestionGenerationError("colour choice is missing a hex value")
        if requested_topic == "patterns":
            prompt = str(data["prompt"])
            if prompt.startswith("What number comes next?"):
                match = re.fullmatch(
                    r"What number comes next\?\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*\?",
                    prompt,
                )
                if match is None:
                    raise QuestionGenerationError("invalid number pattern")
                numbers = [int(value) for value in match.groups()]
                step = numbers[1] - numbers[0]
                next_number = numbers[-1] + step
                answer_choice = next(item for item in choices if item.value == data["answer"])
                if (
                    not 1 <= step <= 5
                    or any(number > 35 for number in [*numbers, next_number])
                    or any(
                        right - left != step
                        for left, right in zip(numbers, numbers[1:], strict=False)
                    )
                    or answer_choice.value != str(next_number)
                    or answer_choice.label != str(next_number)
                    or sum(choice.label == str(next_number) for choice in choices) != 1
                ):
                    raise QuestionGenerationError("invalid number pattern")
            elif "pattern" not in prompt.casefold():
                raise QuestionGenerationError("invalid repeating pattern")
        return GeneratedQuestion(
            activityId=activity_id,
            prompt=data["prompt"],
            hint=data["hint"],
            choices=choices,
            answer=data["answer"],
            explanation=data["explanation"],
            provider=provider,
            kind="memory" if activity_id == "memory_cards" else "quiz",
            topic=requested_topic,
        )
