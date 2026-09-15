# Learning games: project fit and implementation gaps

Seven literacy activities now have playable implementations. See the
[complete catalog and setup instructions](../README.md#complete-app-catalog).

| Activity | Implemented | Remaining |
| --- | --- | --- |
| Air writing | Wrist trail, eight normalized templates, forgiving score, grown-up progression | Child-camera calibration and finger tracking |
| Sound hunt | Weekly letters, local open speech, spelling check, grown-up fallback | Phonetic matching and curated sound examples |
| Read With Mimo | Eight sentences, whole-word highlighting, local narration with a child turn | Storybook integration and adaptive known-word bank |
| Room labels | Named zone matching and grown-up fallback | Printable word-label sheet; zone presence does not prove reading |
| Body letters | Seven pose rules and grown-up fallback | Hold duration, reference illustrations, hardware calibration |
| Two-letter words | Sixteen words, picture cues, numbered touch/voice choices | Reviewed phoneme audio and learning progression |
| Physical cards | Printable alphabet, repeated letter entry, order checking, grown-up verification | Camera card identification |
| Weekly focus | Setup setting used by sound, reading, word and card activities | Applying focus to air/body letter order |

Voice and pose accuracy still require trials with the intended child. The first
versions do not implement every advanced feature in the original proposal.

## Implemented: Time with Mimo

The hub includes an offline, locally generated clock activity. It has a large SVG
clock with twelve numerals, minute ticks, a short blue hour hand, and a longer
orange minute hand. The hour hand moves fractionally with the minutes (3:30 is
halfway between 3 and 4).

Levels: whole hours, half hours, quarter hours, and five-minute steps. Each round
has four distinct tap answers; voice is optional. Voice choices use phrases such
as “3 o’clock,” “half past 3,” and “quarter to 4.” Retry, hint, skip and an answer
explanation are always available; no countdown or microphone requirement. A
correct answer earns one star, and showing the answer does not earn one.

Clock generation makes no question-provider request. It uses the same hub/back
navigation and voice capability flag as other games. The hub displays every registered activity without a separate count limit.
