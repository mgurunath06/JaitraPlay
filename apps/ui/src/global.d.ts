import type { GeneratedQuestion, QuestionRequest, StateSnapshot, StorybookSnapshot } from "../../../packages/contracts/src";

declare global {
  interface Window {
    jaitra?: {
      quit(): Promise<void>;
      transcribe(request: { audio: string; sampleRate: number }): Promise<{ text: string }>;
      getSnapshot(): Promise<StateSnapshot>;
      sendCommand(type: "BEGIN_INTERACTION" | "WELCOME_COMPLETE"): Promise<unknown>;
      getQuestion(activityId: string, request: QuestionRequest): Promise<GeneratedQuestion>;
      createStorybook(topic: string | null): Promise<StorybookSnapshot>;
      getStorybook(storyId: string): Promise<StorybookSnapshot>;
      getStorybookImage(storyId: string, pageNumber: number): Promise<string>;
    };
  }
}

export {};
