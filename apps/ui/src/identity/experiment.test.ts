import { expect, it } from "vitest";
import { ExperimentLog, measuredFaces, scoreFace } from "./experiment";
import type { IdentityProfile } from "./types";
const descriptor = Array(128).fill(.1);
const profile: IdentityProfile = { version: 1, model: "face-api-1.7.15-recognition", name: "Jaitra", descriptors: [descriptor, descriptor, descriptor] };
it("records the baseline top-three decision separately from the nearest distance", () => {
  const mixed = { ...profile, descriptors: [descriptor, Array(128).fill(.2), Array(128).fill(.2)] };
  expect(scoreFace(descriptor, mixed)).toMatchObject({ bestDistance: 0, match: false });
  expect(scoreFace(descriptor, null)).toMatchObject({ bestDistance: null, meanTop3Distance: null, match: false });
});
it("exports no facial descriptors and preserves filtered detections", () => {
  const result = measuredFaces([{ box: { x: 1, y: 2, width: 40, height: 40 }, confidence: .9, blur: 20, luminance: 80, acceptedByBaseline: false, descriptor }], profile);
  expect(result[0]).toMatchObject({ acceptedByBaseline: false, match: true });
  expect(JSON.stringify(result)).not.toContain("descriptor");
});
it("does not collect until enabled and bounds the log without overwriting evidence", () => {
  const log = new ExperimentLog(); log.add({ type: "frame" }); expect(log.rows).toHaveLength(0);
  log.start("test");
  for (let i = 0; i < 20001; i++) log.add({ type: "frame", i });
  expect(log.rows).toHaveLength(20000); expect(log.full).toBe(true); expect(log.active).toBe(false);
});
