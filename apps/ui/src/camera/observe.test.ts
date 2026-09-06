import { describe, expect, it } from "vitest";
import { observe, type Landmark, type WristSample } from "./observe";
const pose = (): Landmark[] => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
const zones = [{ id: "mat", name: "Play mat", x: 0.2, y: 0.7, width: 0.6, height: 0.3 }];
describe("camera observations", () => {
  it("uses mirrored screen position and visible feet for named room zones", () => {
    const p = pose(); p[11].x = p[12].x = 0.8; p[27].y = p[28].y = 0.9;
    const result = observe([p], zones, [], 0);
    expect(result.position).toBe("Left"); expect(result.zone).toBe("Play mat");
  });
  it("does not guess a zone when feet are occluded or zones overlap", () => {
    const p = pose(); p[27].visibility = 0.1;
    expect(observe([p], zones, [], 0).zone).toContain("unknown");
    p[27].visibility = 0.99; p[27].y = p[28].y = 0.8;
    expect(observe([p], [...zones, { ...zones[0], id: "other" }], [], 0).zone).toContain("uncertain");
  });
  it("reports ambiguity for multiple people and clears previous gesture history", () => {
    const history: WristSample[] = [{ time: 0, left: 0.2, right: 0.2 }];
    expect(observe([pose(), pose()], zones, history, 200).presence).toBe("Multiple people visible");
    expect(history).toEqual([]);
    expect(observe([], zones, history, 300).position).toBe("Unknown");
  });
  it("requires side-to-side reversals for a wave, not just a raised hand", () => {
    const p = pose(); p[15].y = 0.2;
    const history: WristSample[] = [];
    expect(observe([p], [], history, 0).gesture).toBe("Hand raised");
    for (const [i, x] of [0.7, 0.3, 0.7].entries()) { p[15].x = x; observe([p], [], history, (i + 1) * 250); }
    expect(observe([p], [], history, 1000).gesture).toBe("Waving");
    p[15].y = 0.8;
    expect(observe([p], [], history, 1300).gesture).toBe("No gesture");
  });
  it("ignores low-confidence shoulders and detects both hands raised", () => {
    const p = pose(); p[15].y = p[16].y = 0.2;
    expect(observe([p], [], [], 0).gesture).toBe("Both hands raised");
    p[11].visibility = 0.1;
    expect(observe([p], [], [], 0).presence).toBe("Position uncertain");
  });
});
