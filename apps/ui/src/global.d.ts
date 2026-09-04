import type { StateSnapshot } from "../../../packages/contracts/src";

declare global {
  interface Window {
    jaitra: {
      getSnapshot(): Promise<StateSnapshot>;
      sendCommand(type: "BEGIN_INTERACTION" | "WELCOME_COMPLETE"): Promise<unknown>;
    };
  }
}

export {};
