import { afterEach, expect, it, vi } from "vitest";
import { replayDataset } from "./replay";
import { downloadLocal } from "./experiment";
import type * as ExperimentModule from "./experiment";
vi.mock("./experiment", async original => ({ ...await original<typeof ExperimentModule>(), downloadLocal: vi.fn() }));
vi.mock("./faces", () => ({ loadFaces: vi.fn(), detectFaces: vi.fn(async (canvas: HTMLCanvasElement, observe: (faces: unknown[]) => void) => {
  observe([{ box: { x: canvas.width / 10, y: canvas.height / 10, width: canvas.width / 5, height: canvas.height / 5 }, confidence: .9, blur: 20, luminance: 80, acceptedByBaseline: true, descriptor: Array(128).fill(.1) }]); return [];
}) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each([640, 1280, 0])("uses %i for enrollment and evaluation and exports truthful dimensions", async width => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  // A per-instance currentTime accessor must keep the most recent requested seek.
  vi.spyOn(HTMLMediaElement.prototype, "src", "set").mockImplementation(function(this: HTMLVideoElement) { let time = 0; Object.defineProperty(this, "currentTime", { configurable: true, get: () => time, set: value => { time = value; queueMicrotask(() => this.dispatchEvent(new Event("seeked"))); } }); queueMicrotask(() => this.dispatchEvent(new Event("loadeddata"))); });
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(1080);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:clip", revokeObjectURL: vi.fn() });
  const manifest = { enrolledPeople: ["jaitra"], clips: ["enrollment", "calibration", "test"].map(split => ({ id: split, session: split, split, path: `${split}.webm`, frames: (split === "enrollment" ? [0, 1, 2] : [0]).map(time => ({ time, faces: [{ label: "jaitra", box: { x: .1, y: .1, width: .2, height: .2 } }] })) })) };
  const files = [{ name: "manifest.json", text: async () => JSON.stringify(manifest) }, ...manifest.clips.map(c => ({ name: c.path }))] as File[];
  await replayDataset(files, width);
  const [name, blob] = vi.mocked(downloadLocal).mock.calls[0];
  expect(name).toBe(`dataset-face-api-${width || "native"}.jsonl`);
  const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
  const rows = text.trim().split("\n").map(line => JSON.parse(line));
  expect(rows[0]).toMatchObject({
    type: "session", requestedAnalysisWidth: width,
    analysisWidth: width || 1920, scope: "offline",
  });
  expect(rows[1]).toMatchObject({ analysisWidth: width || 1920, sourceWidth: 1920, gallerySizes: { jaitra: 3 } });
  expect(rows[1].faces[0]).toMatchObject({ sourceFaceWidthPx: 384, decision: "jaitra" });
  expect(text).not.toContain("descriptor");
});
