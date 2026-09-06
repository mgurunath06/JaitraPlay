import * as faceapi from "@vladmandic/face-api";
export interface Face { x: number; y: number; width: number; height: number; descriptor: number[] }
let ready: Promise<void> | undefined;
export function loadFaces(): Promise<void> {
  ready ??= (async () => {
    // The bundled runtime exposes these APIs; its published declaration omits them.
    const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };
    await tf.setBackend("cpu");
    await tf.ready();
    const root = new URL("camera/vendor/", new URL(import.meta.env.BASE_URL, window.location.href)).href;
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(root), faceapi.nets.faceLandmark68Net.loadFromUri(root), faceapi.nets.faceRecognitionNet.loadFromUri(root)]);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
export async function detectFaces(canvas: HTMLCanvasElement): Promise<Face[]> {
  const results = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.65 })).withFaceLandmarks().withFaceDescriptors();
  return results.filter(result => result.detection.box.width >= 45 && result.detection.box.height >= 45).map(result => {
    const b = result.detection.box;
    return { x: b.x / canvas.width, y: b.y / canvas.height, width: b.width / canvas.width, height: b.height / canvas.height, descriptor: Array.from(result.descriptor) };
  });
}
