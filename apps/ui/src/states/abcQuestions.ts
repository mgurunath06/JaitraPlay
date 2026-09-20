import type { GeneratedQuestion, QuestionRequest } from "../../../../packages/contracts/src";

export type TapMode = "abc_letters" | "abc_sounds" | "abc_blend";

const LETTERS = ["M", "S", "T", "F", "B", "P", "N", "C"];
const SOUNDS: Record<string, string> = {
  M: "mmm", S: "sss", T: "tuh", F: "fff", B: "buh", P: "puh", N: "nnn", C: "kuh",
};
const BLENDS = ["at", "in", "up", "on", "it", "an", "us", "am"];
let sequence = 0;

function question(activityId: TapMode, prompt: string, hint: string, values: string[], answer: string, explanation: string): GeneratedQuestion {
  return {
    activityId,
    prompt,
    hint,
    choices: values.map(value => ({ value: value.toLowerCase(), label: value, color: null })),
    answer: answer.toLowerCase(),
    explanation,
    provider: "local",
    kind: "quiz",
  };
}

function candidates(activityId: TapMode): GeneratedQuestion[] {
  if (activityId === "abc_blend") {
    return BLENDS.map((word, index) => question(
      activityId,
      `Blend ${word[0]}…${word[1]}. Which little word do you make?`,
      `Say the two sounds slowly: ${word[0]}…${word[1]}.`,
      [word, ...[1, 3, 5].map(offset => BLENDS[(index + offset) % BLENDS.length])],
      word,
      `${word[0].toUpperCase()} and ${word[1].toUpperCase()} make ${word.toUpperCase()}.`,
    ));
  }
  return LETTERS.map((letter, index) => question(
    activityId,
    activityId === "abc_letters"
      ? `Tap the letter ${letter}.`
      : `Which letter makes the ${SOUNDS[letter]} sound?`,
    activityId === "abc_letters" ? `Look for ${letter}.` : `Listen for ${SOUNDS[letter]}.`,
    [letter, ...[1, 3, 5].map(offset => LETTERS[(index + offset) % LETTERS.length])],
    letter,
    activityId === "abc_letters" ? `That is the letter ${letter}.` : `${letter} can make the ${SOUNDS[letter]} sound.`,
  ));
}

function shuffleChoices(question: GeneratedQuestion): GeneratedQuestion {
  const choices = [...question.choices];
  for (let index = choices.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  return { ...question, choices };
}

export async function getAbcQuestion(activityId: string, request: QuestionRequest): Promise<GeneratedQuestion> {
  if (activityId !== "abc_letters" && activityId !== "abc_sounds" && activityId !== "abc_blend") {
    throw new Error("Unsupported ABC activity");
  }
  const options = candidates(activityId);
  const unseen = options.filter(option => !request.recentPrompts.includes(option.prompt));
  const pool = unseen.length ? unseen : options;
  return shuffleChoices(pool[sequence++ % pool.length]);
}

export function abcQuestionSpeech(question: GeneratedQuestion): string {
  if (question.activityId === "abc_letters") return `Find the letter ${question.answer.toUpperCase()}.`;
  if (question.activityId === "abc_sounds") return `${SOUNDS[question.answer.toUpperCase()]}. Which letter makes that sound?`;
  return `${question.answer[0]} ... ${question.answer[1]} ... ${question.answer}.`;
}
