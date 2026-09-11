/** Offline-only measurement helpers. These do not configure live recognition. */
import { scoreFace } from "./experiment";
import type { FaceObservation } from "./faces";
import type { IdentityProfile } from "./types";

export function analysisSize(sourceWidth: number, sourceHeight: number, requested = 640) {
  if (!Number.isInteger(requested) || requested < 0 || requested > 4096) throw new Error("Analysis width must be 0 (native) or an integer up to 4096.");
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error("Source dimensions unavailable");
  const width = requested || sourceWidth;
  return { width, height: Math.max(1, Math.round(width * sourceHeight / sourceWidth)) };
}
export function benchmarkHeader(session: string, analysisWidth: number, resolvedWidth?: number) {
  analysisSize(640, 480, analysisWidth);
  return { type: "session", schema: 2, session, model: "face-api-1.7.15-recognition",
    scope: "offline", requestedAnalysisWidth: analysisWidth,
    analysisWidth: resolvedWidth ?? (analysisWidth || null),
    detector: { inputSize: 320, scoreThreshold: .65, minimumBox: 45 }, backend: "cpu",
    metric: "negative_mean_top3_euclidean", threshold: -.42, margin: 0,
    note: "Detector and absolute minimum box unchanged; width-only experiment. Native width is resolved per frame." };
}
export function benchmarkFace(face: FaceObservation, galleries: Record<string, number[][]>, sourceWidth: number, width: number, height: number) {
  const { descriptor, ...measurement } = face;
  const scores: Record<string, number | null> = {};
  for (const [id, descriptors] of Object.entries(galleries)) {
    const profile: IdentityProfile = { version: 1, model: "face-api-1.7.15-recognition", name: "Jaitra", descriptors };
    const score = scoreFace(descriptor, profile).meanTop3Distance;
    scores[id] = score === null ? null : -score;
  }
  const ranked = Object.entries(scores).filter((entry): entry is [string, number] => entry[1] !== null).sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  return { ...measurement,
    box: { x: face.box.x / width, y: face.box.y / height, width: face.box.width / width, height: face.box.height / height },
    analysisFaceWidthPx: face.box.width, sourceFaceWidthPx: face.box.width * sourceWidth / width,
    scores, candidate: best?.[0] ?? null, score: best?.[1] ?? null,
    margin: best && ranked[1] ? best[1] - ranked[1][1] : null,
    decision: face.acceptedByBaseline && best && best[1] > -.42 && (!ranked[1] || best[1] > ranked[1][1]) ? best[0] : "unknown" };
}

export interface Box { x: number; y: number; width: number; height: number }
export interface Annotation { time: number; faces: { box: Box; label: string }[] }
export interface Clip { id: string; path: string; session: string; split: "enrollment" | "calibration" | "test"; frames: Annotation[] }
export interface BenchmarkManifest { clips: Clip[]; enrolledPeople?: string[] }
export function validateManifest(manifest: BenchmarkManifest): string[] {
  if (!Array.isArray(manifest.clips)) throw new Error("Missing clips");
  const sessions = new Map<string, string>(), ids = new Set<string>();
  const validId = (id: string) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
  for (const clip of manifest.clips) {
    if (!validId(clip.id) || ids.has(clip.id)) throw new Error("Invalid or duplicate clip ID");
    if (!clip.session || !["enrollment", "calibration", "test"].includes(clip.split)) throw new Error("Invalid session or split");
    if (sessions.has(clip.session) && sessions.get(clip.session) !== clip.split) throw new Error("Session leakage across splits");
    ids.add(clip.id); sessions.set(clip.session, clip.split);
    const times = new Set<number>();
    for (const frame of clip.frames) {
      if (!Number.isFinite(frame.time) || frame.time < 0 || times.has(frame.time)) throw new Error("Invalid or duplicate frame time");
      times.add(frame.time);
      for (const face of frame.faces) {
        const b = face.box;
        if (!validId(face.label) || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > 1.001 || b.y + b.height > 1.001) throw new Error("Invalid face label or normalized box");
      }
    }
  }
  if (!["enrollment", "calibration", "test"].every(split => [...sessions.values()].includes(split))) throw new Error("Provide separate enrollment, calibration and test sessions");
  const people = manifest.enrolledPeople ?? [...new Set(manifest.clips.filter(c => c.split === "enrollment").flatMap(c => c.frames.flatMap(f => f.faces.map(face => face.label))).filter(id => id !== "other" && id !== "unknown"))];
  if (!people.length || people.some(id => !validId(id) || ["other", "unknown"].includes(id)) || new Set(people).size !== people.length) throw new Error("Specify distinct enrolled person IDs; other/unknown cannot be enrolled.");
  return people;
}
