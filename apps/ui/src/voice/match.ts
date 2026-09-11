import type { GeneratedQuestion } from "../../../../packages/contracts/src";
export const clean = (text: string) => text.toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const numbers: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
const spokenNumbers = Object.fromEntries(Object.entries(numbers).map(([word, digit]) => [digit, word]));
export function recognitionPhrases(choices: GeneratedQuestion["choices"], numberChoices = false): string[] {
  const positions = numberChoices ? choices.flatMap((_choice, index) => {
    const digit = String(index + 1), word = spokenNumbers[digit];
    return [digit, word, `option ${digit}`, `option ${word}`];
  }) : [];
  return [...new Set([...choices.flatMap(choice => [choice.value, choice.label]).map(clean).filter(Boolean).flatMap(phrase => [phrase, spokenNumbers[phrase]].filter((value): value is string => Boolean(value))), ...positions].filter((value): value is string => Boolean(value)))];
}

export function matchChoiceNumber(text: string, choices: GeneratedQuestion["choices"]): string | null {
  const normalized = clean(text).split(" ").map(word => numbers[word] ?? word).join(" ");
  const direct = normalized.match(/^([1-9])$/)?.[1];
  const spoken = normalized.match(/\b(?:option|choice|answer|number)\s+([1-9])\b/)?.[1];
  const position = Number(direct ?? spoken);
  return Number.isInteger(position) && position >= 1 && position <= choices.length ? choices[position - 1].value : null;
}
export function matchAnswer(text: string, choices: GeneratedQuestion["choices"], aliases: Record<string, string> = {}): string | null {
  const normalized = clean(text).split(" ").map((word) => numbers[word] ?? word).join(" ");
  const matches = choices.filter((choice) => [clean(choice.value), clean(choice.label)].some((alias) =>
    alias.length > 0 && (` ${normalized} `).includes(` ${alias} `)
  ));
  if (matches.length) return matches.length === 1 ? matches[0].value : null;
  const learned = aliases[clean(text)];
  return learned && choices.some(choice => choice.value === learned) ? learned : null;
}
