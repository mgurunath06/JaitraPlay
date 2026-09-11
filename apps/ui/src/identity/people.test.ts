import { expect, it } from "vitest";
import { identifyPerson } from "./people";
import type { PersonProfile } from "./types";
const profile = (id: string, value: number): PersonProfile => ({ id, name: id, relationship: "father", version: 1, model: "face-api-1.7.15-recognition", descriptors: Array.from({ length: 6 }, () => Array(128).fill(value)) });
const face = { x: 0, y: 0, width: 0.2, height: 0.2, descriptor: Array(128).fill(0.1) };
it("identifies a saved person and retains the relationship", () => {
  expect(identifyPerson(face, [profile("dad", 0.1), profile("other", 0.3)])?.relationship).toBe("father");
});
it("does not guess between similar profiles or identify an unknown face", () => {
  expect(identifyPerson(face, [profile("dad", 0.1), profile("other", 0.101)])).toBeUndefined();
  expect(identifyPerson(face, [profile("other", 0.3)])).toBeUndefined();
  expect(identifyPerson(face, [])).toBeUndefined();
});
