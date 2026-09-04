import type { GeneratedQuestion, QuestionRequest, StateSnapshot } from "../../../../packages/contracts/src";

type CommandType = "BEGIN_INTERACTION" | "WELCOME_COMPLETE";

async function getSnapshot(): Promise<StateSnapshot> {
  if (window.jaitra) return window.jaitra.getSnapshot();
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");

  const response = await fetch("/api/v1/snapshot", { cache: "no-store" });
  if (!response.ok) throw new Error(`Core snapshot failed: ${response.status}`);
  return (await response.json()) as StateSnapshot;
}

async function sendCommand(type: CommandType): Promise<unknown> {
  if (window.jaitra) return window.jaitra.sendCommand(type);
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");

  const response = await fetch("/api/v1/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiVersion: "1.0",
      requestId: crypto.randomUUID(),
      type,
      payload: {},
    }),
  });
  if (!response.ok) throw new Error(`Core command failed: ${response.status}`);
  return response.json();
}

async function getQuestion(activityId: string, request: QuestionRequest): Promise<GeneratedQuestion> {
  if (window.jaitra) return window.jaitra.getQuestion(activityId, request);
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");

  const response = await fetch(`/api/v1/activities/${encodeURIComponent(activityId)}/question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Question generation failed: ${response.status}`);
  return (await response.json()) as GeneratedQuestion;
}

export const coreClient = { getSnapshot, sendCommand, getQuestion };
