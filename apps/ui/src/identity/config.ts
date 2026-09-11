export interface FaceDetectionConfig {
  analysisWidth: number;
  detectorInputSize: number;
  scoreThreshold: number;
  minimumBox: number;
}

// The frozen baseline is used only by offline replay and comparison exports.
export const BASELINE_FACE_CONFIG: FaceDetectionConfig = {
  analysisWidth: 640,
  detectorInputSize: 320,
  scoreThreshold: 0.65,
  minimumBox: 45,
};

// Live recognition favours usable room-distance face crops. These values remain
// candidates until calibrated recordings establish the final operating point.
export const LIVE_FACE_CONFIG: FaceDetectionConfig = {
  analysisWidth: 1280,
  detectorInputSize: 512,
  scoreThreshold: 0.5,
  minimumBox: 50,
};
