import { expect, it } from "vitest";
import { BASELINE_FACE_CONFIG, LIVE_FACE_CONFIG } from "./config";

it("keeps offline baseline settings isolated from the more permissive live path", () => {
  expect(BASELINE_FACE_CONFIG).toEqual({ analysisWidth: 640, detectorInputSize: 320, scoreThreshold: .65, minimumBox: 45 });
  expect(LIVE_FACE_CONFIG).toEqual({ analysisWidth: 1280, detectorInputSize: 512, scoreThreshold: .5, minimumBox: 50 });
  expect(LIVE_FACE_CONFIG.minimumBox / LIVE_FACE_CONFIG.analysisWidth).toBeLessThan(BASELINE_FACE_CONFIG.minimumBox / BASELINE_FACE_CONFIG.analysisWidth);
});
