# Learning games: project fit and implementation gaps

The supplied ideas can fit this project, but they are not all implemented. This
assessment is based on the existing code, not a validation of the developmental
or speech-accuracy claims in the supplied proposal.

| Activity | Existing foundation | Work needed |
| --- | --- | --- |
| Air writing | Pose wrists and participant tracking | Stroke start/end controls, normalized paths, mirrored coordinates, a visible trail, letter templates, and forgiving recognition tested with Jaitra. Start with a small letter set. Finger tracking is an optional later improvement. |
| Sound hunt | Room-hunt UI and local voice capture | Curated sound-to-word examples, open-vocabulary transcription, and parent confirmation. Initial spelling is not a reliable phonics check: “chair” and “cat” start differently despite the same first letter. |
| Co-reading | Saved story pages, narration and page navigation | Parent-selected known-word bank, highlighting actual words in each page, pausing narration, and a “read together” fallback. Progress should follow successful practice, not just elapsed sessions. |
| Printed room labels | Parent-marked room zones | Associate each zone with a printed word card, add target prompts, and verify the selected participant’s location. A zone match does not prove that a word was read. Hidden feet or multiple people must produce uncertainty. |
| Body letters | Pose landmarks and gesture helpers | Letter-specific joint rules, hold duration, reference illustrations and child-camera testing. Current wave/hand-raise detection cannot score body letters. |
| Two-letter word blending | Quiz choices, voice, local content | Curated progression and recorded/reviewed phoneme audio. Ordinary text-to-speech of isolated letter strings is not a dependable phonics model. Separate regular blending examples from irregular words. |
| Physical letter cards | Camera access | A printable controlled card alphabet, perspective correction, card identification, left-to-right ordering, and held-out camera tests. No card reader exists yet. |
| Weekly classroom focus | Parent settings | Editable letters, sounds and words, consumed consistently by each literacy activity. Parent entry is sufficient; no school integration is needed. |

For each activity, provide retry, skip, and “let’s do it together.” A transcription
failure must not block the next round. Do not mark an arbitrary near-match as
correct: when evidence is uncertain, let a grown-up confirm or demonstrate the
answer. Test speech and camera paths with consented examples from the intended
user rather than claiming accuracy from adult tests.

A practical implementation order is sound hunt and curated blending, then
co-reading and classroom focus, then air-writing/body-letter prototypes. Physical
card recognition needs a separate camera-validation effort.

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
navigation and voice capability flag as other games. The default hub limit is
now six; an existing configuration explicitly limited below six must be updated
to show the new sixth activity.
