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
    ("cup", "🥤", "You pour a drink into me. What am I?"),
    ("plate", "🍽️", "Your food sits on me at mealtime. What am I?"),
    ("chair", "🪑", "I have a seat and a back, and you sit on me. What am I?"),
    ("lamp", "💡", "I make a room brighter when it is dark. What am I?"),
    ("door", "🚪", "Open me to enter or leave a room. What am I?"),
    ("window", "🪟", "You can see outside through my glass. What am I?"),
    ("soap", "🧼", "Use me with water to wash away dirt. What am I?"),
    ("towel", "🧻", "I help dry you after washing. What am I?"),
    ("comb", "🪮", "My teeth help tidy your hair. What am I?"),
    ("sock", "🧦", "You wear me between your foot and your shoe. What am I?"),
    ("glove", "🧤", "I cover your hand and keep it warm. What am I?"),
    ("backpack", "🎒", "I ride on your back and carry your things. What am I?"),
    ("crayon", "🖍️", "Children use me to make colourful drawings. What am I?"),
    ("ruler", "📏", "I am straight and help measure length. What am I?"),
    ("bell", "🔔", "Shake or ring me and I make a bright sound. What am I?"),
    ("camera", "📷", "I capture a picture for you to keep. What am I?"),
    ("phone", "📱", "You can use me to talk to someone far away. What am I?"),
    ("train", "🚂", "I travel on rails and pull carriages. What am I?"),
    ("boat", "⛵", "I carry people across water. What am I?"),
    ("airplane", "✈️", "I have wings and carry people through the sky. What am I?"),
    ("bicycle", "🚲", "I have two wheels and pedals. What am I?"),
    ("apple", "🍎", "I am a crunchy fruit that can be red or green. What am I?"),
    ("banana", "🍌", "I am a long yellow fruit with a peel. What am I?"),
    ("carrot", "🥕", "I am an orange vegetable that grows underground. What am I?"),
    ("bread", "🍞", "I am baked in a loaf and can become toast. What am I?"),
    ("sun", "☀️", "I shine in the daytime and warm the Earth. What am I?"),
    ("moon", "🌙", "You often see me glowing in the night sky. What am I?"),
    ("cloud", "☁️", "I float in the sky and can bring rain. What am I?"),
]

PROMPT_OPENERS = {
    "picture_guess": ("", "Picture puzzle: ", "Look and answer: "),
    "colours_shapes": (
        "", "Colour challenge: ", "Look closely: ", "Mimo asks: ", "Try this: ",
        "Colour explorer: ", "Shape and colour time: ",
    ),
    "memory_cards": (
        "", "Memory mission: ", "Matching time: ", "Find the pairs: ",
        "Picture memory: ", "Mimo's match: ", "Ready to remember? ", "Pair puzzle: ",
        "Memory challenge: ", "Turn and match: ", "Match-up game: ", "Remember these: ",
        "Can you match them? ", "Memory warm-up: ", "Pair-finding time: ",
        "Use your memory: ", "Where are the pairs? ", "Match every picture: ",
    ),
    "riddle_guess": ("", "Riddle time: ", "Solve this: ", "Mimo's riddle: ",
                     "What could it be? ", "Listen closely: ", "Guess this: ",
                     "Mystery object: ", "Use the clues: "),
}


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


def local_question_candidates(activity_id: str) -> list[GeneratedQuestion]:
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

    expanded: list[GeneratedQuestion] = []
    for candidate in candidates:
        for opener in PROMPT_OPENERS[activity_id]:
            prompt = f"{opener}{candidate.prompt}"
            expanded.append(candidate.model_copy(update={"prompt": prompt}))
    return expanded


def local_question(activity_id: str, history: list[GeneratedQuestion]) -> GeneratedQuestion:
    candidates = local_question_candidates(activity_id)

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
