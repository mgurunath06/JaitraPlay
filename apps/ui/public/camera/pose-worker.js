/* global Vision, importScripts, self, URL */
importScripts("./vendor/vision_bundle.js");
let detector;
let backend = "CPU";
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await Vision.FilesetResolver.forVisionTasks(new URL("./vendor/wasm", self.location.href).href);
      const create = delegate => Vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL("./vendor/pose_landmarker_lite.task", self.location.href).href, delegate },
        runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4,
      });
      if (data.preferGpu) {
        try { detector = await create("GPU"); backend = "GPU"; }
        catch { detector = await create("CPU"); }
      } else detector = await create("CPU");
      self.postMessage({ type: "ready", backend });
    } else if (data.type === "frame" && detector) {
      try {
        const result = detector.detectForVideo(data.frame, data.time);
        self.postMessage({ type: "result", landmarks: result.landmarks, time: data.time, backend });
      } finally { data.frame.close(); }
    }
  } catch {
    self.postMessage({ type: "error", message: "Camera recognition unavailable. Stop and try again, or switch to CPU in Setup." });
  }
};
