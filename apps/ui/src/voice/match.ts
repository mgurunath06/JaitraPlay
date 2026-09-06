import type { GeneratedQuestion } from "../../../../packages/contracts/src";
export const clean = (text: string) => text.toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const numbers: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
export function matchAnswer(text: string, choices: GeneratedQuestion["choices"], aliases: Record<string, string> = {}): string | null {
  const normalized = clean(text).split(" ").map((word) => numbers[word] ?? word).join(" ");
  const matches = choices.filter((choice) => [clean(choice.value), clean(choice.label)].some((alias) =>
    alias.length > 0 && (` ${normalized} `).includes(` ${alias} `)
  ));
  if (matches.length) return matches.length === 1 ? matches[0].value : null;
  const learned = aliases[clean(text)];
  return learned && choices.some(choice => choice.value === learned) ? learned : null;
}
