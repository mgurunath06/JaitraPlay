import { expect, it } from "vitest";
import { analysisSize, benchmarkFace, benchmarkHeader, validateManifest, type BenchmarkManifest } from "./benchmark";
import type { FaceObservation } from "./faces";
const descriptor = Array(128).fill(.1);
const gallery = { jaitra: [descriptor, descriptor, descriptor] };
const face = (width: number): FaceObservation => ({ box: { x: width / 10, y: 20, width: width / 10, height: 60 }, confidence: .9, blur: 20, luminance: 80, acceptedByBaseline: true, descriptor });
it("defaults to baseline width and resolves native size without distorting aspect ratio", () => {
  expect(analysisSize(1920, 1080)).toEqual({ width: 640, height: 360 });
  expect(analysisSize(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
  expect(analysisSize(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
  for (const value of [-1, NaN, Infinity, 1280.5, 10000]) expect(() => analysisSize(1920, 1080, value)).toThrow();
});
it("keeps source face size identical across analysis resolutions and removes descriptors", () => {
  for (const width of [640, 1280, 1920]) {
    const result = benchmarkFace(face(width), gallery, 1920, width, width * 9 / 16);
    expect(result.sourceFaceWidthPx).toBe(192);
    expect(result.box.width).toBe(.1);
    expect(result.decision).toBe("jaitra");
    expect(result.score).toBe(-0);
    expect(JSON.stringify(result)).not.toContain("descriptor");
  }
});
it("preserves the original size gate, requires top-three scores and rejects ties", () => {
  expect(benchmarkFace({ ...face(640), acceptedByBaseline: false }, gallery, 1920, 640, 360).decision).toBe("unknown");
  expect(benchmarkFace(face(640), { jaitra: [descriptor] }, 1920, 640, 360).decision).toBe("unknown");
  expect(benchmarkFace(face(640), { ...gallery, father: gallery.jaitra }, 1920, 640, 360).decision).toBe("unknown");
});
it("records offline width separately from unchanged detector settings", () => {
  expect(benchmarkHeader("run", 1280)).toMatchObject({ analysisWidth: 1280, scope: "offline", backend: "cpu", detector: { inputSize: 320, scoreThreshold: .65, minimumBox: 45 } });
});
it("supports per-person IDs while keeping visitors outside the gallery", () => {
  const manifest: BenchmarkManifest = { enrolledPeople: ["jaitra", "father", "mother"], clips: ["enrollment", "calibration", "test"].map(split => ({ id: split, session: split, split: split as "enrollment" | "calibration" | "test", path: `${split}.webm`, frames: [{ time: 0, faces: [{ label: "visitor_1", box: { x: .1, y: .1, width: .2, height: .2 } }] }] })) };
  expect(validateManifest(manifest)).toEqual(["jaitra", "father", "mother"]);
  manifest.clips[1].session = "enrollment";
  expect(() => validateManifest(manifest)).toThrow(/leakage/);
});
