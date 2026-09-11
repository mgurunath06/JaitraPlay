import type { FaceObservation } from "./faces";
import type { IdentityProfile } from "./types";
import { distance } from "./tracker";
import { LIVE_FACE_CONFIG } from "./config";

export const baselineModel = "face-api-1.7.15-recognition";
export function scoreFace(descriptor: number[], profile: IdentityProfile | null) {
  const scores = profile?.descriptors.map(sample => distance(sample, descriptor)).sort((a, b) => a - b) ?? [];
  const bestDistance = scores.length && Number.isFinite(scores[0]) ? scores[0] : null;
  const mean = scores.length >= 3 ? scores.slice(0, 3).reduce((a, b) => a + b) / 3 : Infinity;
  return { metric: "euclidean_distance", bestDistance, meanTop3Distance: Number.isFinite(mean) ? mean : null,
    threshold: .42, match: mean < .42 };
}
export function measuredFaces(faces: FaceObservation[], profile: IdentityProfile | null) {
  // Descriptors never enter the diagnostic export.
  return faces.map(({ descriptor, ...face }) => ({ ...face, ...scoreFace(descriptor, profile) }));
}
export function downloadLocal(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export class ExperimentLog {
  rows: string[] = [];
  active = false;
  full = false;
  start(session: string) {
    this.rows = []; this.active = true; this.full = false;
    this.add({ type: "session", schema: 1, session, model: baselineModel, startedAt: new Date().toISOString(),
      scope: "live", analysisWidth: LIVE_FACE_CONFIG.analysisWidth, detector: { inputSize: LIVE_FACE_CONFIG.detectorInputSize, scoreThreshold: LIVE_FACE_CONFIG.scoreThreshold, minimumBox: LIVE_FACE_CONFIG.minimumBox }, backend: "cpu", processedFramesOnly: true });
  }
  add(row: object) {
    if (!this.active) return;
    if (this.rows.length >= 20000) { this.active = false; this.full = true; return; }
    this.rows.push(JSON.stringify(row));
  }
  export(session: string) {
    downloadLocal(`${session}-diagnostics.jsonl`, new Blob([this.rows.join("\n") + "\n"], { type: "application/x-ndjson" }));
  }
}
