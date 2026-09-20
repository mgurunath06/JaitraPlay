import type { RiddleTopic } from "../../../../packages/contracts/src";

export const RIDDLE_TOPICS: { id: RiddleTopic; label: string }[] = [
  { id: "objects", label: "Everyday objects" },
  { id: "riddles", label: "Food & nature riddles" },
  { id: "colours", label: "Colours" },
  { id: "geography", label: "Geography" },
  { id: "patterns", label: "Numbers & patterns" },
];
export type TopicMix = Record<RiddleTopic, number>;
export const DEFAULT_MIX: TopicMix = { objects: 35, riddles: 20, colours: 15, geography: 10, patterns: 20 };
const MIX_STORAGE_KEY = "jaitra-riddle-topic-mix";

export function validMix(value: unknown): value is TopicMix {
  if (typeof value !== "object" || value === null) return false;
  const mix = value as Record<string, unknown>;
  return RIDDLE_TOPICS.every(({ id }) => typeof mix[id] === "number" && Number.isInteger(mix[id]) && mix[id] >= 0 && mix[id] <= 100)
    && RIDDLE_TOPICS.reduce((sum, { id }) => sum + Number(mix[id]), 0) === 100;
}

export function readRiddleMix(): TopicMix {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(MIX_STORAGE_KEY) ?? "null");
    if (validMix(value)) return value;
  } catch { /* Use defaults if storage is unavailable. */ }
  return DEFAULT_MIX;
}

export function saveRiddleMix(mix: TopicMix): boolean {
  if (!validMix(mix)) return false;
  try { window.localStorage.setItem(MIX_STORAGE_KEY, JSON.stringify(mix)); return true; }
  catch { return false; }
}

export function chooseTopic(mix: TopicMix, counts: TopicMix): RiddleTopic {
  const total = RIDDLE_TOPICS.reduce((sum, { id }) => sum + counts[id], 0);
  return RIDDLE_TOPICS.filter(({ id }) => mix[id] > 0).reduce((best, item) =>
    (total + 1) * mix[item.id] / 100 - counts[item.id] > (total + 1) * mix[best.id] / 100 - counts[best.id] ? item : best
  ).id;
}
