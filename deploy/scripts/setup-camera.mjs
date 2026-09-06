import { mkdir, copyFile, cp, access, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const target = join(root, "apps/ui/public/camera/vendor");
await mkdir(target, { recursive: true });
await copyFile(join(root, "node_modules/@mediapipe/tasks-vision/vision_bundle.js"), join(target, "vision_bundle.js"));
await cp(join(root, "node_modules/@mediapipe/tasks-vision/wasm"), join(target, "wasm"), { recursive: true });
const cache = join(root, ".local/models/pose_landmarker_lite.task");
try { await access(cache); }
catch {
  console.log("Downloading the local pose model (about 6 MB)…");
  const response = await fetch("https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  await mkdir(join(root, ".local/models"), { recursive: true });
  await writeFile(`${cache}.tmp`, new Uint8Array(await response.arrayBuffer()));
  await rename(`${cache}.tmp`, cache);
}
await copyFile(cache, join(target, "pose_landmarker_lite.task"));
console.log("Local camera assets ready.");

// Pinned npm package includes the recognition models; runtime remains offline.
for (const model of ["tiny_face_detector_model", "face_landmark_68_model", "face_recognition_model"]) {
  for (const suffix of [".bin", "-weights_manifest.json"]) {
    await copyFile(join(root, "node_modules/@vladmandic/face-api/model", model + suffix), join(target, model + suffix));
  }
}
await copyFile(join(root, "node_modules/@vladmandic/face-api/LICENSE"), join(target, "face-api-LICENSE.txt"));
