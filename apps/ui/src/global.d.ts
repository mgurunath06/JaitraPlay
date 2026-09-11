import type { IdentityProfile } from "./identity/types";
import type { GeneratedQuestion, QuestionRequest, StateSnapshot, StorybookLibraryItem, StorybookSnapshot } from "../../../packages/contracts/src";

declare global {
  interface Window {
    jaitra?: {
      diagnostic?(event: string, data: Record<string, string | number | boolean>): void;
      people?(action: "get" | "save" | "delete", payload?: unknown): Promise<unknown>;
      identity(action: "get" | "save" | "delete", profile?: IdentityProfile): Promise<IdentityProfile | null | { saved?: boolean; deleted?: boolean }>;
      quit(): Promise<void>;
      transcribe(request: { audio: string; sampleRate: number; phrases?: string[] }): Promise<{ text: string }>;
      getSnapshot(): Promise<StateSnapshot>;
      sendCommand(type: "BEGIN_INTERACTION" | "WELCOME_COMPLETE"): Promise<unknown>;
      getQuestion(activityId: string, request: QuestionRequest): Promise<GeneratedQuestion>;
      createStorybook(topic: string | null): Promise<StorybookSnapshot>;
      listStorybooks(): Promise<StorybookLibraryItem[]>;
      getStorybook(storyId: string): Promise<StorybookSnapshot>;
      getStorybookImage(storyId: string, pageNumber: number): Promise<string>;
    };
  }
}

export {};
