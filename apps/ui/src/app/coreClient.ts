import type { GeneratedQuestion, QuestionRequest, StateSnapshot, StorybookSnapshot } from "../../../../packages/contracts/src";

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

async function transcribe(request: { audio: string; sampleRate: number; phrases?: string[] }): Promise<{ text: string }> {
  if (window.jaitra) return window.jaitra.transcribe(request);
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");
  const response = await fetch("/api/v1/voice/transcribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Voice unavailable");
  return response.json();
}

async function createStorybook(topic: string | null): Promise<StorybookSnapshot> {
  if (window.jaitra) return window.jaitra.createStorybook(topic);
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");
  const response = await fetch("/api/v1/storybooks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  if (!response.ok) throw new Error(`Story creation failed: ${response.status}`);
  return response.json() as Promise<StorybookSnapshot>;
}

async function getStorybook(storyId: string): Promise<StorybookSnapshot> {
  if (window.jaitra) return window.jaitra.getStorybook(storyId);
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");
  const response = await fetch(`/api/v1/storybooks/${encodeURIComponent(storyId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Story status failed: ${response.status}`);
  return response.json() as Promise<StorybookSnapshot>;
}

async function getStorybookImage(storyId: string, pageNumber: number): Promise<string> {
  if (window.jaitra) return window.jaitra.getStorybookImage(storyId, pageNumber);
  if (!import.meta.env.DEV) throw new Error("Electron bridge is unavailable");
  return `/api/v1/storybooks/${encodeURIComponent(storyId)}/pages/${pageNumber}/image`;
}

export const coreClient = { getSnapshot, sendCommand, getQuestion, transcribe, createStorybook, getStorybook, getStorybookImage };
