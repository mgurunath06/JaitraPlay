"""Curated interactive rounds and appliance-wide repetition detection."""

from __future__ import annotations

import random
import unicodedata
from difflib import SequenceMatcher
from itertools import combinations

from jaitra_core.api.models import GeneratedQuestion, QuestionChoice

RNG = random.SystemRandom()
COLOURS = [
    ("blue", "#2563eb"),
    ("red", "#ef4444"),
    ("green", "#16a34a"),
    ("yellow", "#facc15"),
    ("purple", "#9333ea"),
    ("orange", "#f97316"),
    ("pink", "#ec4899"),
    ("brown", "#92400e"),
]
SHAPES = [("circle", "●"), ("square", "■"), ("triangle", "▲"), ("star", "★")]
THEMES = {
    "fruit": [("apple", "🍎"), ("banana", "🍌"), ("grapes", "🍇"), ("orange", "🍊")],
    "vehicles": [("car", "🚗"), ("bus", "🚌"), ("bicycle", "🚲"), ("train", "🚂")],
    "instruments": [("guitar", "🎸"), ("drum", "🥁"), ("trumpet", "🎺"), ("violin", "🎻")],
    "nature": [("tree", "🌳"), ("flower", "🌻"), ("sun", "☀️"), ("moon", "🌙")],
    "animals": [("cat", "🐱"), ("dog", "🐶"), ("fish", "🐟"), ("butterfly", "🦋")],
}
RIDDLES = [
    ("umbrella", "☂️", "I open above your head to keep the rain off. What am I?"),
    ("clock", "🕒", "My hands move, but I cannot clap. I tell the time. What am I?"),
    ("book", "📖", "I have pages full of stories. What am I?"),
    ("key", "🔑", "I fit in a lock and help open a door. What am I?"),
    ("pencil", "✏️", "You hold me to draw and write. An eraser can remove my marks."),
    ("shoe", "👟", "You wear me on your foot when you go for a walk. What am I?"),
    ("spoon", "🥄", "I carry soup from your bowl to your mouth. What am I?"),
    ("toothbrush", "🪥", "Add toothpaste to me and I help clean your teeth. What am I?"),
    ("ball", "⚽", "You can roll, kick or bounce me in a game. What am I?"),
    ("hat", "👒", "Wear me on your head to shade your face. What am I?"),
    ("scissors", "✂️", "I have two blades and cut paper. An adult helps you use me."),
    ("bed", "🛏️", "You lie on me to sleep at night. What am I?"),
]


def normalized(prompt: str) -> str:
    # Keep visual symbols: two apples and five apples are different counting tasks.
    return " ".join(
        "".join(
            char for char in prompt.casefold() if not unicodedata.category(char).startswith("P")
        ).split()
    )


def repeats_question(
    question: GeneratedQuestion, history: list[GeneratedQuestion], prompts: list[str]
) -> bool:
    target = normalized(question.prompt)
    if any(SequenceMatcher(None, target, normalized(old)).ratio() > 0.82 for old in prompts):
        return True
    # Reject rephrased quizzes aimed at the same answer across recently played games.
    return any(old.answer == question.answer and old.kind == question.kind for old in history[:12])


def local_question(activity_id: str, history: list[GeneratedQuestion]) -> GeneratedQuestion:
    candidates: list[GeneratedQuestion] = []

    def add(
        prompt: str,
        hint: str,
        items: list[tuple[str, str]],
        answer: str,
        explanation: str,
        kind: str = "quiz",
    ) -> None:
        candidates.append(
            GeneratedQuestion.model_validate(
                {
                    "activityId": activity_id,
                    "prompt": prompt,
                    "hint": hint,
                    "choices": [{"value": value, "label": label} for value, label in items],
                    "answer": answer,
                    "explanation": explanation,
                    "provider": "local",
                    "kind": kind,
                }
            )
        )

    if activity_id == "picture_guess":
        for theme, items in THEMES.items():
            for value, label in items:
                add(
                    f"Look at these four pictures. Can you spot the {value}?",
                    f"Look carefully at each {theme} picture.",
                    items,
                    value,
                    f"{label} This is the {value}.",
                )
                for count in range(2, 7):
                    add(
                        f"{label * count} How many {value} pictures can you count?",
                        "Point to each picture and count it once.",
                        [
                            (str(n), str(n))
                            for n in sorted({count, count + 1, count - 1, count + 2})
                        ],
                        str(count),
                        f"There are {count} pictures.",
                    )
        for theme in ("fruit", "vehicles", "instruments"):
            for other in ("fruit", "vehicles", "instruments"):
                if theme == other:
                    continue
                for odd in THEMES[other]:
                    add(
                        f"Three pictures belong to {theme}. Which one does not?",
                        f"Find the picture that is not in the {theme} group.",
                        THEMES[theme][:3] + [odd],
                        odd[0],
                        f"The {odd[0]} is not in the {theme} group.",
                    )
    elif activity_id == "colours_shapes":
        for colour, hex_value in COLOURS:
            add(
                f"Room hunt! Can you point to something {colour} nearby?",
                "Stay in this room. Just look and point; ask a grown-up if you need help.",
                [],
                "",
                f"Thanks for exploring {colour}!",
                "room_hunt",
            )
            for shape, symbol in SHAPES:
                add(
                    f"Which figure is a {colour} {shape}?",
                    f"Look for the {shape} shape.",
                    SHAPES,
                    shape,
                    f"{symbol} is the {shape}.",
                )
                candidates[-1].choices = [
                    QuestionChoice(value=value, label=label, color=hex_value)
                    for value, label in SHAPES
                ]
            choices = [(name, name) for name, _ in COLOURS if name != colour]
            items = [(colour, colour), *RNG.sample(choices, 3)]
            add(
                f"Which colour swatch is {colour}?",
                "Look carefully at all four colours.",
                items,
                colour,
                f"That swatch is {colour}.",
            )
            palette = dict(COLOURS)
            candidates[-1].choices = [
                QuestionChoice(value=value, label=label, color=palette[value])
                for value, label in items
            ]
        for shape, _symbol in SHAPES:
            add(
                f"Room hunt! Can you spot a {shape} shape nearby?",
                "Look and point from where you are. No climbing or moving things.",
                [],
                "",
                f"Thanks for looking for a {shape}!",
                "room_hunt",
            )
    elif activity_id == "memory_cards":
        for theme, items in THEMES.items():
            for group in combinations(items, 3):
                names = ", ".join(value for value, _ in group)
                add(
                    f"Match the {theme} pairs: {names}.",
                    "Turn two cards and remember where each picture lives.",
                    list(group),
                    group[0][0],
                    "You found every pair!",
                    "memory",
                )
    elif activity_id == "riddle_guess":
        for value, label, clue in RIDDLES:
            others = [(v, f"{emoji} {v}") for v, emoji, _ in RIDDLES if v != value]
            add(
                clue,
                f"The answer begins with {value[0].upper()}.",
                [(value, f"{label} {value}"), *RNG.sample(others, 3)],
                value,
                f"The answer is {label} {value}.",
            )
    else:
        raise ValueError("unsupported activity")

    # Use unseen prompts first, then the least recently seen when a finite pool is exhausted.
    seen = {normalized(q.prompt): i for i, q in reversed(list(enumerate(history)))}
    previous = next(
        (q for q in history if q.activity_id == activity_id and q.provider == "local"), None
    )
    if activity_id == "colours_shapes":
        desired = "quiz" if previous and previous.kind == "room_hunt" else "room_hunt"
        candidates = [q for q in candidates if q.kind == desired]
    RNG.shuffle(candidates)
    candidates.sort(key=lambda q: seen.get(normalized(q.prompt), len(history) + 1), reverse=True)
    question = candidates[0]
    RNG.shuffle(question.choices)
    return question
