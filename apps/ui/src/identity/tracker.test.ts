import { describe, expect, it } from "vitest";
import { PersonTracker, faceMatches } from "./tracker";
import type { Landmark } from "../camera/observe";
import type { Face } from "./faces";
import type { IdentityProfile } from "./types";
const descriptor = (v = 0.1) => Array(128).fill(v) as number[];
const profile: IdentityProfile = { version: 1, model: "face-api-1.7.15-recognition", name: "Jaitra", descriptors: Array.from({ length: 6 }, () => descriptor()) };
const face = (x = 0.2, v = 0.1): Face => ({ x: x - 0.05, y: 0.1, width: 0.1, height: 0.2, descriptor: descriptor(v) });
const pose = (x = 0.2, raised = false): Landmark[] => {
  const p = Array.from({ length: 33 }, () => ({ x, y: 0.7, visibility: 1 }));
  p[0].y = 0.2; p[11].y = p[12].y = 0.4; p[15].y = raised ? 0.1 : 0.7;
  return p;
};
describe("persistent identity matching and session tracking", () => {
  it("requires repeated matches and reacquires from a saved profile in a fresh session", () => {
    for (let session = 0; session < 2; session++) {
      const t = new PersonTracker();
      t.update([pose()], [face()], 0, profile); expect(t.target).toBeNull();
      t.update([pose()], [face()], 200, profile); expect(t.target).toBeNull();
      t.update([pose()], [face()], 400, profile); expect(t.target).toBe(t.people[0].id); expect(t.source).toBe("face");
    }
  });
  it("does not depend on detector ordering in a room with several people", () => {
    const t = new PersonTracker();
    for (const time of [0, 200, 400]) t.update(time === 200 ? [pose(0.8), pose()] : [pose(), pose(0.8)], [face(), face(0.8, 0.5)], time, profile);
    expect(t.people.find(p => p.id === t.target)?.x).toBe(0.2);
  });
  it("drops target on ambiguous crossings, disappearance and a long frame gap", () => {
    const t = new PersonTracker();
    t.update([pose(0.4), pose(0.6)], [], 0, null); t.select(t.people[0].id);
    t.update([pose(0.49), pose(0.51)], [], 200, null); expect(t.target).toBeNull();
    t.select(t.people[0].id); t.update([], [], 400, null); expect(t.target).toBeNull();
    t.update([pose()], [], 600, null); t.select(t.people[0].id);
    t.update([pose()], [], 4000, null); expect(t.target).toBeNull();
  });
  it("keeps the same track number through short pose and face dropouts", () => {
    const t = new PersonTracker();
    t.update([pose()], [face()], 0, null);
    const id = t.people[0].id;
    t.update([], [], 500, null); expect(t.people).toHaveLength(0);
    t.update([pose()], [face()], 1000, null); expect(t.people[0].id).toBe(id);
    t.update([], [face()], 1400, null); expect(t.people[0].id).toBe(id);
    expect(t.people[0].pose).toHaveLength(0);
    t.update([pose()], [face()], 1800, null); expect(t.people[0].id).toBe(id);
  });
  it("creates a new track after the retention window expires", () => {
    const t = new PersonTracker();
    t.update([pose()], [face()], 0, null);
    const id = t.people[0].id;
    t.update([], [], 1000, null);
    t.update([pose()], [face()], 2500, null);
    expect(t.people[0].id).not.toBe(id);
  });
  it("keeps a clear continuous track without a face, but rejects a conflicting face", () => {
    const t = new PersonTracker();
    for (const time of [0, 200, 400]) t.update([pose()], [face()], time, profile);
    const id = t.target;
    t.update([pose(0.22)], [], 600, profile); expect(t.target).toBe(id);
    t.update([pose(0.22)], [face(0.22, 0.5)], 800, profile); expect(t.target).toBeNull();
  });
  it("requires a fresh, sustained, unique raised hand and never edits enrollment", () => {
    const t = new PersonTracker(); const before = JSON.stringify(profile);
    t.update([pose(0.2, true)], [], 0, profile); t.challenge();
    t.update([pose(0.2, true)], [], 1500, profile); expect(t.raisedCandidate(1500)).toBeUndefined();
    t.update([pose()], [], 1600, profile);
    t.update([pose(0.2, true)], [], 1800, profile); expect(t.raisedCandidate(1800)).toBeUndefined();
    t.update([pose(0.2, true)], [], 3100, profile);
    t.select(t.raisedCandidate(3100)!.id); expect(t.source).toBe("gesture");
    expect(JSON.stringify(profile)).toBe(before);
    t.update([pose(0.2, true), pose(0.8, true)], [], 3300, profile); expect(t.raisedCandidate(3300)).toBeUndefined();
  });
  it("does not identify two people as Jaitra or accept invalid descriptors", () => {
    const t = new PersonTracker();
    for (const time of [0, 200, 400]) t.update([pose(), pose(0.8)], [face(), face(0.8)], time, profile);
    expect(t.target).toBeNull();
    expect(faceMatches({ ...face(), descriptor: [NaN] }, profile)).toBe(false);
    expect(faceMatches(face(0.2, 0.5), profile)).toBe(false);
  });
});
