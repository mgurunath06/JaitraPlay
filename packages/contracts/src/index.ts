export type AppState =
  | "BOOTSTRAP"
  | "IDLE"
  | "WELCOME"
  | "HUB"
  | "ACTIVITY_LOADING"
  | "ROUND_ACTIVE"
  | "ROUND_FEEDBACK"
  | "ACTIVITY_SUMMARY"
  | "SESSION_END"
  | "RECOVERY";

export type HealthState = "STARTING" | "HEALTHY" | "DEGRADED" | "FATAL" | "DISABLED";

export interface StateSnapshot {
  apiVersion: "1.0";
  type: "STATE_SNAPSHOT";
  payload: {
    appState: AppState;
    childDisplayName: string;
    companionName: string;
    capabilities: { voice: "DISABLED" | "AVAILABLE"; camera: "DISABLED" | "CLIENT_MANAGED" };
    activities: Array<{
      activityId: string;
      title: string;
      description: string;
      icon: string;
      availability: "AVAILABLE" | "COMING_SOON";
    }>;
  };
}

export interface GeneratedQuestion {
  activityId: string;
  prompt: string;
  hint: string;
  choices: Array<{ value: string; label: string; color: string | null }>;
  answer: string;
  explanation: string;
  provider: "mwapi" | "startupapi" | "openrouter" | "local";
  kind?: "quiz" | "memory" | "room_hunt";
}

export interface QuestionRequest {
  previousPrompt: string | null;
  neededHint: boolean;
  recentPrompts: string[];
}

export interface TranscriptionRequest {
  audio: string;
  sampleRate: number;
  phrases?: string[];
}

export type StorybookStatus = "planning" | "illustrating" | "ready" | "failed";

export interface StorybookPage {
  pageNumber: number;
  text: string;
  imageReady: boolean;
}

export interface StorybookSnapshot {
  storyId: string;
  status: StorybookStatus;
  topic: string;
  title: string | null;
  totalPages: 15;
  completedPages: number;
  pages: StorybookPage[];
  textProvider: string | null;
  imageProvider: string;
  error: string | null;
}
