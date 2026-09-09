import type { FaceObservation } from "./faces";
import { baselineModel, downloadLocal, measuredFaces } from "./experiment";
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
export async function replayClip(file: File, session: string, profile: IdentityProfile | null) {
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
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
    const rows: object[] = [];
    for (let second = 0; second < Math.floor(video.duration); second++) {
      await eventOnce(video, "seeked", () => { video.currentTime = second + .001; });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const started = performance.now(); let observations: FaceObservation[] = [];
      await detectFaces(canvas, faces => { observations = faces; });
      rows.push({ schema: 1, model: baselineModel, session, clip: file.name.replace(/\.[^.]+$/, ""), time: second,
        sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, analysisWidth: canvas.width,
        latencyMs: performance.now() - started,
        faces: measuredFaces(observations, profile).map(face => ({ ...face,
          box: { x: face.box.x / canvas.width, y: face.box.y / canvas.height, width: face.box.width / canvas.width, height: face.box.height / canvas.height },
          analysisFaceWidthPx: face.box.width, sourceFaceWidthPx: face.box.width * video.videoWidth / canvas.width,
          score: face.meanTop3Distance === null ? null : -face.meanTop3Distance,
          decision: face.acceptedByBaseline && face.match ? "jaitra" : "unknown" })) });
    }
    downloadLocal(`${file.name.replace(/\.[^.]+$/, "")}-face-api.jsonl`, new Blob([rows.map(row => JSON.stringify(row)).join("\n") + "\n"], { type: "application/x-ndjson" }));
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}

interface Box { x: number; y: number; width: number; height: number }
interface Annotation { time: number; faces: { box: Box; label: "jaitra" | "other" }[] }
interface Clip { id: string; path: string; session: string; split: "enrollment" | "calibration" | "test"; frames: Annotation[] }
function overlap(a: Box, b: Box) {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / (a.width * a.height + b.width * b.height - area);
}
async function visitClip(file: File, clip: Clip, visit: (faces: FaceObservation[], frame: Annotation, width: number, height: number, analysisHeight: number, latency: number) => void) {
  const { detectFaces } = await import("./faces");
  const video = document.createElement("video"); video.muted = true; video.preload = "auto";
  const url = URL.createObjectURL(file);
  try {
    await eventOnce(video, "loadeddata", () => { video.src = url; });
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
    for (const frame of clip.frames) {
      if (!Number.isFinite(frame.time) || frame.time < 0) throw new Error("Invalid annotated frame time");
      await eventOnce(video, "seeked", () => { video.currentTime = frame.time + .001; });
      if (Math.abs(video.currentTime - frame.time) > .1) throw new Error(`Cannot seek ${clip.id} to ${frame.time}`);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const started = performance.now(); let observations: FaceObservation[] = [];
      await detectFaces(canvas, faces => { observations = faces; });
      visit(observations, frame, video.videoWidth, video.videoHeight, canvas.height, performance.now() - started);
    }
  } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
}
export async function replayDataset(files: File[]) {
  const manifests = files.filter(file => file.name.endsWith(".json"));
  if (manifests.length !== 1) throw new Error("Select exactly one manifest JSON and all its video clips together.");
  const manifest = JSON.parse(await manifests[0].text()) as { clips: Clip[] };
  const sessions = new Map<string, string>();
  const ids = new Set<string>();
  const clipFiles = new Map<string, File>();
  for (const clip of manifest.clips) {
    if (sessions.has(clip.session) && sessions.get(clip.session) !== clip.split) throw new Error("Session leakage across splits");
    if (ids.has(clip.id)) throw new Error("Duplicate clip ID");
    ids.add(clip.id); sessions.set(clip.session, clip.split);
    const matches = files.filter(file => file.name === clip.path.split("/").pop());
    if (matches.length !== 1) throw new Error(`Select one uniquely named file for ${clip.path}`);
    clipFiles.set(clip.id, matches[0]);
  }
  if (!["enrollment", "calibration", "test"].every(split => [...sessions.values()].includes(split))) throw new Error("Provide separate enrollment, calibration and test sessions");
  const { loadFaces } = await import("./faces");
  await loadFaces();
  const profile: IdentityProfile = { version: 1, model: baselineModel, name: "Jaitra", descriptors: [] };
  for (const clip of manifest.clips.filter(clip => clip.split === "enrollment")) {
    await visitClip(clipFiles.get(clip.id)!, clip, (faces, frame, _width, _height, analysisHeight) => {
      for (const truth of frame.faces.filter(face => face.label === "jaitra")) {
        const candidates = faces.filter(face => overlap(truth.box, { x: face.box.x / 640, y: face.box.y / analysisHeight, width: face.box.width / 640, height: face.box.height / analysisHeight }) >= .3);
        if (candidates.length === 1 && candidates[0].acceptedByBaseline) profile.descriptors.push(candidates[0].descriptor);
      }
    });
  }
  if (profile.descriptors.length < 3) throw new Error("Baseline needs at least three detected child faces in enrollment annotations");
  const rows: object[] = [];
  for (const clip of manifest.clips.filter(clip => clip.split !== "enrollment")) {
    await visitClip(clipFiles.get(clip.id)!, clip, (faces, frame, width, height, analysisHeight, latency) => {
      rows.push({ schema: 1, model: baselineModel, session: clip.session, clip: clip.id, time: frame.time,
        sourceWidth: width, sourceHeight: height, analysisWidth: 640, latencyMs: latency, gallerySize: profile.descriptors.length,
        metric: "negative_mean_top3_euclidean", threshold: -.42,
        faces: measuredFaces(faces, profile).map(face => ({ ...face,
          box: { x: face.box.x / 640, y: face.box.y / analysisHeight, width: face.box.width / 640, height: face.box.height / analysisHeight },
          analysisFaceWidthPx: face.box.width, sourceFaceWidthPx: face.box.width * width / 640,
          score: face.meanTop3Distance === null ? null : -face.meanTop3Distance,
          decision: face.acceptedByBaseline && face.match ? "jaitra" : "unknown" })) });
    });
  }
  downloadLocal("dataset-face-api.jsonl", new Blob([rows.map(row => JSON.stringify(row)).join("\n") + "\n"], { type: "application/x-ndjson" }));
}
