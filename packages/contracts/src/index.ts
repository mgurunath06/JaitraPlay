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
    capabilities: { voice: "DISABLED"; camera: "DISABLED" };
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
  provider: "mwapi" | "openrouter";
}

export interface QuestionRequest {
  previousPrompt: string | null;
  neededHint: boolean;
  recentPrompts: string[];
}
