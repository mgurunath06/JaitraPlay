import type { FaceObservation } from "./faces";
import { baselineModel, downloadLocal, measuredFaces } from "./experiment";
import { analysisSize, benchmarkHeader, benchmarkFace, validateManifest, type Annotation, type Clip, type Box, type BenchmarkManifest } from "./benchmark";
import type { IdentityProfile } from "./types";

function eventOnce(video: HTMLVideoElement, name: string, action: () => void) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, done); video.removeEventListener("error", fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`Video ${name} failed`)); };
    const timer = window.setTimeout(fail, 15000);
    video.addEventListener(name, done, { once: true }); video.addEventListener("error", fail, { once: true });
    action();
  });
}
export async function replayClip(file: File, session: string, profile: IdentityProfile | null, analysisWidth = 640) {
  analysisSize(640, 480, analysisWidth);
  if (!profile) throw new Error("Load the baseline enrollment profile before replaying clips.");
  const { loadFaces, detectFaces } = await import("./faces");
  await loadFaces();
  const video = document.createElement("video"); video.muted = true; video.preload = "auto";
  const url = URL.createObjectURL(file);
  try {
    await eventOnce(video, "loadeddata", () => { video.src = url; });
    // MediaRecorder WebM can lack a duration header. Force duration discovery.
    if (!Number.isFinite(video.duration)) await eventOnce(video, "seeked", () => { video.currentTime = 1e10; });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 120) throw new Error("Use a clip with a readable duration of 120 seconds or less.");
    const canvas = document.createElement("canvas"); Object.assign(canvas, analysisSize(video.videoWidth, video.videoHeight, analysisWidth));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
    const rows: object[] = [benchmarkHeader(session, analysisWidth, canvas.width)];
    for (let second = 0; second < Math.floor(video.duration); second++) {
      await eventOnce(video, "seeked", () => { video.currentTime = second + .001; });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const started = performance.now(); let observations: FaceObservation[] = [];
      await detectFaces(canvas, faces => { observations = faces; });
      rows.push({ schema: 1, model: baselineModel, session, clip: file.name.replace(/\.[^.]+$/, ""), time: second,
        requestedAnalysisWidth: analysisWidth, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, analysisWidth: canvas.width, analysisHeight: canvas.height,
        latencyMs: performance.now() - started,
        faces: measuredFaces(observations, profile).map(face => ({ ...face,
          box: { x: face.box.x / canvas.width, y: face.box.y / canvas.height, width: face.box.width / canvas.width, height: face.box.height / canvas.height },
          analysisFaceWidthPx: face.box.width, sourceFaceWidthPx: face.box.width * video.videoWidth / canvas.width,
          score: face.meanTop3Distance === null ? null : -face.meanTop3Distance,
          decision: face.acceptedByBaseline && face.match ? "jaitra" : "unknown" })) });
    }
    downloadLocal(`${file.name.replace(/\.[^.]+$/, "")}-face-api-${analysisWidth || "native"}.jsonl`, new Blob([rows.map(row => JSON.stringify(row)).join("\n") + "\n"], { type: "application/x-ndjson" }));
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}

function overlap(a: Box, b: Box) {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / (a.width * a.height + b.width * b.height - area);
}
async function visitClip(file: File, clip: Clip, analysisWidth: number, visit: (faces: FaceObservation[], frame: Annotation, width: number, height: number, analysisHeight: number, latency: number, analysisWidth: number) => void) {
  const { detectFaces } = await import("./faces");
  const video = document.createElement("video"); video.muted = true; video.preload = "auto";
  const url = URL.createObjectURL(file);
  try {
    await eventOnce(video, "loadeddata", () => { video.src = url; });
    const canvas = document.createElement("canvas"); Object.assign(canvas, analysisSize(video.videoWidth, video.videoHeight, analysisWidth));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
    for (const frame of clip.frames) {
      if (!Number.isFinite(frame.time) || frame.time < 0) throw new Error("Invalid annotated frame time");
      await eventOnce(video, "seeked", () => { video.currentTime = frame.time + .001; });
      if (Math.abs(video.currentTime - frame.time) > .1) throw new Error(`Cannot seek ${clip.id} to ${frame.time}`);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const started = performance.now(); let observations: FaceObservation[] = [];
      await detectFaces(canvas, faces => { observations = faces; });
      visit(observations, frame, video.videoWidth, video.videoHeight, canvas.height, performance.now() - started, canvas.width);
    }
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}
export async function replayDataset(files: File[], analysisWidth = 640) {
  analysisSize(640, 480, analysisWidth);
  const manifests = files.filter(file => file.name.endsWith(".json"));
  if (manifests.length !== 1) throw new Error("Select exactly one manifest JSON and all its video clips together.");
  const manifest = JSON.parse(await manifests[0].text()) as BenchmarkManifest;
  const enrolledPeople = validateManifest(manifest);
  const clipFiles = new Map<string, File>();
  for (const clip of manifest.clips) {
    const matches = files.filter(file => file.name === clip.path.split("/").pop());
    if (matches.length !== 1) throw new Error(`Select one uniquely named file for ${clip.path}`);
    clipFiles.set(clip.id, matches[0]);
  }
  const { loadFaces } = await import("./faces");
  await loadFaces();
  const galleries: Record<string, number[][]> = Object.fromEntries(enrolledPeople.map(id => [id, []]));
  for (const clip of manifest.clips.filter(clip => clip.split === "enrollment")) {
    await visitClip(clipFiles.get(clip.id)!, clip, analysisWidth, (faces, frame, _width, _height, analysisHeight, _latency, actualWidth) => {
      for (const truth of frame.faces.filter(face => enrolledPeople.includes(face.label))) {
        const candidates = faces.filter(face => overlap(truth.box, { x: face.box.x / actualWidth, y: face.box.y / analysisHeight, width: face.box.width / actualWidth, height: face.box.height / analysisHeight }) >= .3);
        if (candidates.length === 1 && candidates[0].acceptedByBaseline && frame.faces.filter(t => overlap(t.box, { x: candidates[0].box.x / actualWidth, y: candidates[0].box.y / analysisHeight, width: candidates[0].box.width / actualWidth, height: candidates[0].box.height / analysisHeight }) >= .3).length === 1) galleries[truth.label].push(candidates[0].descriptor);
      }
    });
  }
  if (!Object.values(galleries).some(samples => samples.length >= 3)) throw new Error("Baseline needs at least three detected faces for one enrolled person");
  const gallerySizes = Object.fromEntries(Object.entries(galleries).map(([id, samples]) => [id, samples.length]));
  const rows: object[] = [];
  const actualWidths = new Set<number>();
  for (const clip of manifest.clips.filter(clip => clip.split !== "enrollment")) {
    await visitClip(clipFiles.get(clip.id)!, clip, analysisWidth, (faces, frame, width, height, analysisHeight, latency, actualWidth) => {
      const matchStarted = performance.now();
      const scoredFaces = faces.map(face => benchmarkFace(face, galleries, width, actualWidth, analysisHeight));
      const totalLatency = latency + performance.now() - matchStarted;
      actualWidths.add(actualWidth);
      rows.push({ schema: 2, model: baselineModel, session: clip.session, clip: clip.id, time: frame.time,
        requestedAnalysisWidth: analysisWidth, sourceWidth: width, sourceHeight: height, analysisWidth: actualWidth, analysisHeight, latencyMs: totalLatency, faceLatencyMs: latency, latencyScope: "detection_embedding_metrics_and_matching",
        gallerySizes, enrolledPeople, gallerySize: Object.values(gallerySizes).reduce((a, b) => a + b, 0),
        detector: { inputSize: 320, scoreThreshold: .65, minimumBox: 45 }, backend: "cpu",
        metric: "negative_mean_top3_euclidean", threshold: -.42, margin: 0,
        faces: scoredFaces });
    });
  }
  const resolvedWidth = actualWidths.size === 1 ? [...actualWidths][0] : undefined;
  rows.unshift({
    ...benchmarkHeader("dataset", analysisWidth, resolvedWidth),
    analysisWidths: [...actualWidths].sort((a, b) => a - b),
    enrolledPeople,
    gallerySizes,
  });
  downloadLocal(`dataset-face-api-${analysisWidth || "native"}.jsonl`, new Blob([rows.map(row => JSON.stringify(row)).join("\n") + "\n"], { type: "application/x-ndjson" }));
}
