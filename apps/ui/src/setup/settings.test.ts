import { beforeEach, expect, it } from "vitest";
import { readSettings, saveSettings } from "./settings";
import { matchAnswer } from "../voice/match";
beforeEach(() => localStorage.clear());
it("persists only setup settings and rejects malformed stored zones", () => {
  saveSettings({ ...readSettings(), microphoneId: "mic", voiceAliases: { read: "red" } });
  expect(readSettings().microphoneId).toBe("mic");
  expect(readSettings().voiceAliases).toEqual({ read: "red" });
  localStorage.setItem("jaitra.setup.v1", '{"zones":[{"name":"broken"}]}');
  expect(readSettings().zones).toEqual([]);
  localStorage.setItem("jaitra.setup.v1", 'null');
  expect(readSettings().preferGpu).toBe(false);
});
it("uses taught corrections only for a current choice and never overrides a direct match", () => {
  const choices = [{ value: "red", label: "Red", color: null }, { value: "blue", label: "Blue", color: null }];
  expect(matchAnswer("read", choices, { read: "red" })).toBe("red");
  expect(matchAnswer("read", choices, { read: "elephant" })).toBeNull();
  expect(matchAnswer("blue", choices, { blue: "red" })).toBe("blue");
  expect(matchAnswer("red or blue", choices, { "red or blue": "red" })).toBeNull();
});
