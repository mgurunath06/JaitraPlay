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
    activities: Array<{ activityId: string; title: string }>;
  };
}
