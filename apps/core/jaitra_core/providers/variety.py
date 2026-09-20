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
RHYME_FAMILIES = (
    (("cat", "🐱"), ("bat", "🦇"), ("hat", "🎩"), ("rat", "🐀")),
    (("fan", "🪭"), ("can", "🥫"), ("pan", "🍳"), ("man", "👨")),
    (("dog", "🐶"), ("frog", "🐸"), ("log", "🪵"), ("fog", "🌫️")),
    (("cake", "🎂"), ("snake", "🐍"), ("lake", "🏞️"), ("rake", "🍂")),
    (("bee", "🐝"), ("tree", "🌳"), ("key", "🔑"), ("sea", "🌊")),
    (("car", "🚗"), ("star", "⭐"), ("jar", "🫙"), ("bar", "🍫")),
    (("sun", "☀️"), ("run", "🏃"), ("fun", "🎉"), ("bun", "🍞")),
    (("ball", "⚽"), ("wall", "🧱"), ("tall", "📏"), ("fall", "🍂")),
    (("fish", "🐟"), ("dish", "🍽️"), ("wish", "🌠"), ("swish", "💨")),
    (("book", "📖"), ("cook", "👩‍🍳"), ("look", "👀"), ("hook", "🪝")),
)
ANIMAL_SOUNDS = (
    ("cow", "🐮", "moo"),
    ("dog", "🐶", "woof"),
    ("cat", "🐱", "meow"),
    ("sheep", "🐑", "baa"),
    ("duck", "🦆", "quack"),
    ("pig", "🐷", "oink"),
    ("horse", "🐴", "neigh"),
    ("frog", "🐸", "ribbit"),
    ("lion", "🦁", "roar"),
    ("bird", "🐦", "tweet"),
    ("bee", "🐝", "buzz"),
    ("snake", "🐍", "hiss"),
    ("owl", "🦉", "hoot"),
    ("chicken", "🐔", "cluck"),
    ("elephant", "🐘", "trumpet"),
)
SCHOOL_SHAPES = (
    ("circle", "⚪"),
    ("square", "🟦"),
    ("triangle", "🔺"),
    ("diamond", "🔶"),
    ("star", "⭐"),
    ("heart", "❤️"),
    ("rectangle", "▭"),
    ("oval", "🥚"),
)
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

GEOGRAPHY = [
    (
        "north",
        "⬆️ north",
        "Which direction is usually at the top of a map?",
        "Look at a compass rose.",
        "North is usually at the top of a map.",
    ),
    (
        "equator",
        "🌍 equator",
        "What imaginary line circles the middle of Earth?",
        "It divides Earth into north and south halves.",
        "The equator circles the middle of Earth.",
    ),
    (
        "asia",
        "🌏 Asia",
        "Which is the largest continent?",
        "It includes India, China and Japan.",
        "Asia is the largest continent.",
    ),
    (
        "africa",
        "🌍 Africa",
        "Which continent contains Egypt and Kenya?",
        "It is south of Europe.",
        "Egypt and Kenya are in Africa.",
    ),
    (
        "antarctica",
        "🧊 Antarctica",
        "Which continent surrounds the South Pole?",
        "It is the coldest continent.",
        "Antarctica surrounds the South Pole.",
    ),
    (
        "pacific",
        "🌊 Pacific Ocean",
        "Which is Earth's largest ocean?",
        "It lies between Asia and the Americas.",
        "The Pacific is Earth's largest ocean.",
    ),
    (
        "island",
        "🏝️ island",
        "What do we call land with water all around it?",
        "It can be large or small.",
        "Land surrounded by water is an island.",
    ),
    (
        "river",
        "🏞️ river",
        "What long stream of water flows towards a lake or sea?",
        "It moves downhill through the land.",
        "A river flows across land.",
    ),
    (
        "mountain",
        "🏔️ mountain",
        "What very high landform often has a peak?",
        "It rises high above nearby land.",
        "A mountain has a high peak.",
    ),
    (
        "desert",
        "🏜️ desert",
        "What dry region receives very little rain?",
        "Some deserts have sand dunes.",
        "A desert receives very little rain.",
    ),
    (
        "capital",
        "⭐ capital city",
        "What do we call the main government city of a country?",
        "Maps often mark it with a star.",
        "It is called a capital city.",
    ),
    (
        "compass",
        "🧭 compass",
        "Which tool helps us find north, south, east and west?",
        "Its needle points towards north.",
        "A compass shows directions.",
    ),
    (
        "legend",
        "🗺️ map key",
        "What part of a map explains its colours and symbols?",
        "It is also called a legend.",
        "A map key explains map symbols.",
    ),
    (
        "scale",
        "📏 map scale",
        "What tells how map distance compares with real distance?",
        "It may look like a small ruler.",
        "A map scale compares map and real distances.",
    ),
    (
        "india",
        "🇮🇳 India",
        "New Delhi is the capital of which country?",
        "Its flag has an Ashoka Chakra.",
        "New Delhi is the capital of India.",
    ),
    (
        "japan",
        "🇯🇵 Japan",
        "Tokyo is the capital of which country?",
        "It is an island country in Asia.",
        "Tokyo is the capital of Japan.",
    ),
    (
        "france",
        "🇫🇷 France",
        "Paris is the capital of which country?",
        "The Eiffel Tower is there.",
        "Paris is the capital of France.",
    ),
    (
        "australia",
        "🇦🇺 Australia",
        "Canberra is the capital of which country?",
        "This country is also a continent.",
        "Canberra is the capital of Australia.",
    ),
    (
        "east",
        "➡️ east",
        "If north is at the top of a map, which direction is on the right?",
        "Think of the rising sun.",
        "East is on the right of a north-up map.",
    ),
    (
        "west",
        "⬅️ west",
        "If north is at the top of a map, which direction is on the left?",
        "It is opposite east.",
        "West is on the left of a north-up map.",
    ),
]

PROMPT_OPENERS = {
    "picture_guess": ("", "Picture puzzle: ", "Look and answer: "),
    "colours_shapes": (
        "",
        "Colour challenge: ",
        "Look closely: ",
        "Mimo asks: ",
        "Try this: ",
        "Colour explorer: ",
        "Shape and colour time: ",
    ),
    "memory_cards": (
        "",
        "Memory mission: ",
        "Matching time: ",
        "Find the pairs: ",
        "Picture memory: ",
        "Mimo's match: ",
        "Ready to remember? ",
        "Pair puzzle: ",
        "Memory challenge: ",
        "Turn and match: ",
        "Match-up game: ",
        "Remember these: ",
        "Can you match them? ",
        "Memory warm-up: ",
        "Pair-finding time: ",
        "Use your memory: ",
        "Where are the pairs? ",
        "Match every picture: ",
    ),
    "riddle_guess": (
        "",
        "Riddle time: ",
        "Solve this: ",
        "Mimo's riddle: ",
        "What could it be? ",
        "Listen closely: ",
        "Guess this: ",
        "Mystery object: ",
        "Use the clues: ",
    ),
    "rhyme_time": ("",),
    "good_manners": ("",),
    "counting_numbers": ("",),
    "shapes_sorting": ("",),
    "animal_sounds": ("",),
    "daily_routine": ("",),
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
    # This equivalent early check avoids comparing hundreds of prompt pairs when
    # a target answer has already appeared in the growing appliance history.
    if any(old.answer == question.answer and old.kind == question.kind for old in history):
        return True
    target = normalized(question.prompt)
    return any(SequenceMatcher(None, target, normalized(old)).ratio() > 0.82 for old in prompts)


def shuffle_question_choices(
    question: GeneratedQuestion, rng: random.Random = RNG
) -> GeneratedQuestion:
    """Return a question with independently shuffled choices and the same answer."""
    choices = list(question.choices)
    rng.shuffle(choices)
    return question.model_copy(update={"choices": choices})


def local_question_candidates(activity_id: str) -> list[GeneratedQuestion]:
    candidates: list[GeneratedQuestion] = []
    topic: str | None = None

    def add(
        prompt: str,
        hint: str,
        items: list[tuple[str, str]],
        answer: str,
        explanation: str,
        kind: str = "quiz",
    ) -> None:
        if activity_id in {
            "rhyme_time",
            "good_manners",
            "counting_numbers",
            "shapes_sorting",
            "animal_sounds",
            "daily_routine",
        }:
            # The bank stores varied answer positions; delivery shuffles again.
            offset = len(candidates) % len(items)
            items = items[offset:] + items[:offset]
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
                    "topic": topic if activity_id == "riddle_guess" else None,
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
        topic = "riddles"
        for value, label, clue in RIDDLES:
            if value not in {"apple", "banana", "carrot", "bread", "sun", "moon", "cloud"}:
                topic = "objects"
            else:
                topic = "riddles"
            others = [(v, f"{emoji} {v}") for v, emoji, _ in RIDDLES if v != value]
            add(
                clue,
                f"The answer begins with {value[0].upper()}.",
                [(value, f"{label} {value}"), *RNG.sample(others, 3)],
                value,
                f"The answer is {label} {value}.",
            )
        topic = "geography"
        geography_values = [(value, label) for value, label, *_rest in GEOGRAPHY]
        for index, (value, label, clue, hint, explanation) in enumerate(GEOGRAPHY):
            others = [item for item in geography_values if item[0] != value]
            add(
                clue,
                hint,
                [
                    (value, label),
                    *[others[(index + step * 3) % len(others)] for step in range(1, 4)],
                ],
                value,
                explanation,
            )
        topic = "colours"
        for index, (colour, _hex_value) in enumerate(COLOURS):
            others = [item for item in COLOURS if item[0] != colour]
            items = [
                (colour, colour),
                *[
                    (
                        others[(index + step) % len(others)][0],
                        others[(index + step) % len(others)][0],
                    )
                    for step in range(3)
                ],
            ]
            add(
                f"Which colour swatch is {colour}?",
                "Look carefully at all four colours.",
                items,
                colour,
                f"That swatch is {colour}.",
            )
            palette = dict(COLOURS)
            candidates[-1].choices = [
                QuestionChoice(value=item, label=name, color=palette[item]) for item, name in items
            ]
        topic = "patterns"
        for step in (1, 2, 3, 5):
            for start in range(1, 14):
                sequence = [start + step * index for index in range(4)]
                answer = start + step * 4
                if answer > 35:
                    continue
                options = sorted({answer - 2, answer - 1, answer, answer + 1})
                add(
                    f"What number comes next? {', '.join(map(str, sequence))}, ?",
                    f"Count forward by {step} each time.",
                    [(str(number), str(number)) for number in options],
                    str(answer),
                    f"Add {step} to {sequence[-1]} to get {answer}.",
                )
        picture_sets = (
            (("red", "🔴"), ("blue", "🔵"), ("yellow", "🟡"), ("green", "🟢")),
            (("sun", "☀️"), ("moon", "🌙"), ("star", "⭐"), ("cloud", "☁️")),
            (("apple", "🍎"), ("banana", "🍌"), ("grapes", "🍇"), ("orange", "🍊")),
            (("circle", "⚪"), ("square", "🟦"), ("triangle", "🔺"), ("diamond", "🔶")),
        )
        for pictures in picture_sets:
            for order in ((0, 1, 0, 1, 0), (0, 0, 1, 0, 0), (0, 1, 2, 0, 1)):
                next_index = 1 if order in ((0, 1, 0, 1, 0), (0, 0, 1, 0, 0)) else 2
                icons = " ".join(pictures[index][1] for index in order)
                add(
                    f"What comes next in this pattern? {icons} ?",
                    "Look for the part that repeats.",
                    [(f"pattern_{name}", icon) for name, icon in pictures],
                    f"pattern_{pictures[next_index][0]}",
                    f"The repeating part tells us {pictures[next_index][1]} comes next.",
                )
    elif activity_id == "rhyme_time":
        phrasings = (
            "Which word rhymes with {word}?",
            "Find a word that sounds like {word} at the end.",
            "Mimo says {word}. Which word rhymes?",
            "Tap the rhyme for {word}.",
        )
        for family_index, family in enumerate(RHYME_FAMILIES):
            for target_index, (target, _icon) in enumerate(family):
                for style, phrasing in enumerate(phrasings):
                    correct = family[(target_index + 1 + style % 3) % len(family)]
                    distractors = [
                        RHYME_FAMILIES[(family_index + shift) % len(RHYME_FAMILIES)][
                            (target_index + style) % 4
                        ]
                        for shift in (1, 2, 3)
                    ]
                    add(
                        phrasing.format(word=target),
                        f"Listen to the end of {target}.",
                        [(word, f"{emoji} {word}") for word, emoji in [correct, *distractors]],
                        correct[0],
                        f"{target} and {correct[0]} rhyme.",
                    )
    elif activity_id == "good_manners":
        manners = (
            ("gets a gift from a friend", "thank_you"),
            ("is handed a shared toy", "thank_you"),
            ("gets help carrying books", "thank_you"),
            ("wants a turn with a toy", "please"),
            ("asks for a glass of water", "please"),
            ("wants to borrow a crayon", "please"),
            ("accidentally bumps a friend", "sorry"),
            ("spills water on a friend's drawing", "sorry"),
            ("steps on someone's shoe", "sorry"),
            ("needs to pass through a busy doorway", "excuse_me"),
            ("wants a teacher's attention", "excuse_me"),
            ("needs to move past someone in a line", "excuse_me"),
        )
        words = [
            ("thank_you", "Thank you"),
            ("please", "Please"),
            ("sorry", "Sorry"),
            ("excuse_me", "Excuse me"),
        ]
        manners_names = ("Maya", "Ari", "Leah", "Sam", "Nia")
        endings = ("What could they say?", "Which kind words fit?", "Tap the kind words.")
        for situation, manners_answer in manners:
            for name in manners_names:
                for ending in endings:
                    add(
                        f"{name} {situation}. {ending}",
                        "Think about the kind words for this moment.",
                        words,
                        manners_answer,
                        f"{dict(words)[manners_answer]} is kind to say here.",
                    )
        feelings = (("happy", "😊"), ("sad", "😢"), ("angry", "😠"), ("scared", "😨"))
        feeling_choices = [(feeling, f"{emoji} {feeling}") for feeling, emoji in feelings]
        for feeling, emoji in feelings:
            for name in manners_names:
                for ending in ("How do they feel?", "Which feeling matches?", "Tap the feeling."):
                    add(
                        f"{name} has this face {emoji}. {ending}",
                        "Look at the eyes and mouth.",
                        feeling_choices,
                        feeling,
                        f"{emoji} shows feeling {feeling}.",
                    )
    elif activity_id == "counting_numbers":
        count_things = (
            ("apple", "🍎"),
            ("star", "⭐"),
            ("duck", "🦆"),
            ("ball", "⚽"),
            ("flower", "🌼"),
            ("car", "🚗"),
            ("fish", "🐟"),
            ("heart", "❤️"),
        )
        for thing, emoji in count_things:
            for count in range(1, 10):
                count_options = sorted({count, count + 1, count + 2, max(0, count - 1)})
                add(
                    f"How many {thing} pictures? {' '.join([emoji] * count)}",
                    "Point to each picture once as you count.",
                    [(str(number), str(number)) for number in count_options],
                    str(count),
                    f"There are {count} {thing} pictures.",
                )
        for number in range(10):
            digit_options = [(str(value), str(value)) for value in range(number, number + 4)]
            for phrasing in (
                "Tap the number {number}.",
                "Which digit is {number}?",
                "Find {number} on the number cards.",
                "Mimo says {number}. Which number is it?",
            ):
                add(
                    phrasing.format(number=number),
                    "Look at each number card.",
                    digit_options,
                    str(number),
                    f"This is the number {number}.",
                )
        for first in range(1, 10):
            for second in range(first + 1, 10):
                extras = [number for number in range(1, 11) if number not in (first, second)][:2]
                choices = [(str(number), str(number)) for number in (first, second, *extras)]
                for comparison, comparison_answer in (("more", second), ("less", first)):
                    add(
                        f"Which is {comparison}, {first} or {second}?",
                        "Count up from the smaller number.",
                        choices,
                        str(comparison_answer),
                        f"{comparison_answer} is {comparison} than "
                        f"{first if comparison_answer == second else second}.",
                    )
    elif activity_id == "shapes_sorting":
        shape_phrasings = (
            "Which shape is a {shape}?",
            "Find the {shape}.",
            "Tap the {shape} shape.",
            "Mimo wants a {shape}. Which one?",
            "Which picture looks like a {shape}?",
        )
        for shape, emoji in SCHOOL_SHAPES:
            shape_others = [item for item in SCHOOL_SHAPES if item[0] != shape]
            choices = [
                (shape, f"{emoji} {shape}"),
                *[(name, f"{icon} {name}") for name, icon in shape_others[:3]],
            ]
            for phrasing in shape_phrasings:
                add(
                    phrasing.format(shape=shape),
                    "Look at the outline.",
                    choices,
                    shape,
                    f"{emoji} is a {shape}.",
                )
            for odd_index, (odd_shape, odd_icon) in enumerate(shape_others):
                odd_position = odd_index % 4
                picture_icons = [emoji] * 4
                picture_icons[odd_position] = odd_icon
                add(
                    f"Which shape is different? {' '.join(picture_icons)}",
                    "Three shapes match. One does not.",
                    [
                        (str(position + 1), f"{position + 1}: {icon}")
                        for position, icon in enumerate(picture_icons)
                    ],
                    str(odd_position + 1),
                    f"The {odd_shape} in spot {odd_position + 1} is different "
                    f"from the three {shape} shapes.",
                )
        opposites = (
            ("big", "small"),
            ("hot", "cold"),
            ("up", "down"),
            ("in", "out"),
            ("open", "closed"),
            ("day", "night"),
            ("happy", "sad"),
            ("full", "empty"),
            ("wet", "dry"),
            ("fast", "slow"),
            ("clean", "dirty"),
            ("loud", "quiet"),
        )
        all_opposites = [word for pair in opposites for word in pair]
        for opposite_first, opposite_second in opposites:
            for source, opposite_answer in (
                (opposite_first, opposite_second),
                (opposite_second, opposite_first),
            ):
                opposite_distractors = [
                    word for word in all_opposites if word not in (source, opposite_answer)
                ][:3]
                opposite_choices = [
                    (word, word.title()) for word in (opposite_answer, *opposite_distractors)
                ]
                for phrasing in (
                    "What is the opposite of {word}?",
                    "Mimo says {word}. Tap its opposite.",
                    "Find a word that means the opposite of {word}.",
                ):
                    add(
                        phrasing.format(word=source),
                        "Think of the other side of the pair.",
                        opposite_choices,
                        opposite_answer,
                        f"{opposite_answer.title()} is the opposite of {source}.",
                    )
    elif activity_id == "animal_sounds":
        animal_phrasings = (
            "Which animal says {sound}?",
            "Who makes a {sound} sound?",
            "Mimo hears {sound}. Find the animal.",
            "Tap the animal that goes {sound}.",
            "Which animal could Mimo hear saying {sound}?",
        )
        sound_phrasings = (
            "What sound does a {animal} make?",
            "A {animal} is talking. What do you hear?",
            "Tap the sound of a {animal}.",
            "Which sound belongs to a {animal}?",
            "Mimo sees a {animal}. What does it say?",
        )
        for index, (animal, emoji, sound) in enumerate(ANIMAL_SOUNDS):
            sound_others = [
                ANIMAL_SOUNDS[(index + shift) % len(ANIMAL_SOUNDS)] for shift in (1, 2, 3)
            ]
            for phrasing in animal_phrasings:
                add(
                    phrasing.format(sound=sound),
                    "Listen to the sound word.",
                    [
                        (animal, f"{emoji} {animal}"),
                        *[(name, f"{icon} {name}") for name, icon, _ in sound_others],
                    ],
                    animal,
                    f"The {animal} says {sound}.",
                )
            for phrasing in sound_phrasings:
                add(
                    phrasing.format(animal=animal),
                    "Imagine the animal's voice.",
                    [(sound, sound), *[(noise, noise) for _, _, noise in sound_others]],
                    sound,
                    f"The {animal} says {sound}.",
                )
    elif activity_id == "daily_routine":
        situations = (
            (
                "just woke up",
                "brush_teeth",
                ("Brush teeth", "Go back to sleep", "Eat dinner", "Leave toys out"),
            ),
            (
                "is about to eat",
                "wash_hands",
                ("Wash hands", "Put on shoes", "Go to bed", "Paint a picture"),
            ),
            (
                "finished breakfast",
                "put_plate_away",
                ("Put the plate away", "Jump on the table", "Leave the plate", "Go to sleep"),
            ),
            (
                "has muddy shoes",
                "clean_shoes",
                ("Clean the shoes", "Put them on the bed", "Hide them", "Touch the wall"),
            ),
            (
                "sees rain before going outside",
                "take_umbrella",
                ("Take an umbrella", "Wear sunglasses", "Take a pillow", "Leave the coat"),
            ),
            (
                "feels thirsty after playing",
                "drink_water",
                ("Drink water", "Go to sleep", "Shout loudly", "Hide the cup"),
            ),
            (
                "finished playing with toys",
                "tidy_toys",
                ("Tidy the toys", "Leave toys on the floor", "Throw the toys", "Go outside alone"),
            ),
            (
                "is ready to cross a road",
                "look_both_ways",
                ("Look both ways with a grown-up", "Run across", "Close eyes", "Play in the road"),
            ),
            (
                "is getting ready for bed",
                "brush_teeth",
                ("Brush teeth", "Eat more sweets", "Start a loud game", "Put on outdoor shoes"),
            ),
            (
                "came home from outside",
                "wash_hands",
                ("Wash hands", "Touch all the food", "Jump on the sofa", "Go out alone"),
            ),
            (
                "spilled water on the floor",
                "wipe_spill",
                ("Wipe the spill with help", "Leave it slippery", "Run through it", "Hide the cup"),
            ),
            (
                "feels cold before a walk",
                "wear_coat",
                ("Wear a coat", "Wear sandals", "Take a swim", "Open the freezer"),
            ),
        )
        for situation, routine_answer, labels in situations:
            routine_choices = [
                (routine_answer, labels[0]),
                *[(f"wrong_{index}", label) for index, label in enumerate(labels[1:], 1)],
            ]
            for name in ("Maya", "Ari", "Leah", "Sam", "Nia"):
                for phrasing in (
                    "{name} {situation}. What should happen next?",
                    "What comes next when {name} {situation}?",
                    "{name} {situation}. Choose the helpful next step.",
                ):
                    add(
                        phrasing.format(name=name, situation=situation),
                        "Pick the safe and helpful choice.",
                        routine_choices,
                        routine_answer,
                        f"A helpful next step is: {labels[0].lower()}.",
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
