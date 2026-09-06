import { quietMimo } from "../components/mimo";
import { readSettings } from "../setup/settings";
export interface Recording { stop(): Promise<{ audio: string; sampleRate: number }>; cancel(): void }

export class CaptureError extends Error {}

export function encodePcm(chunks: Float32Array[], maxSamples: number): string {
  const length = Math.min(maxSamples, chunks.reduce((total, chunk) => total + chunk.length, 0));
  const bytes = new Uint8Array(length * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      if (offset >= length) break;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset++ * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
    }
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function recordVoice(signal: AbortSignal): Promise<Recording> {
  quietMimo();
  const deviceId = readSettings().microphoneId;
  const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, video: false });
  } catch (error) {
    if (!deviceId || !(error instanceof DOMException) || !["NotFoundError", "OverconstrainedError"].includes(error.name)) throw error;
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  }
  const closeTracks = () => stream.getTracks().forEach((track) => track.stop());
  if (signal.aborted) { closeTracks(); throw new Error("Cancelled"); }
  let context: AudioContext;
  // Use the device's rate; forcing 16 kHz can prevent a media stream from connecting.
  try { context = new AudioContext({ latencyHint: "interactive" }); }
  catch (error) { closeTracks(); throw error; }
  const chunks: Float32Array[] = [];
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let samples = 0;
  let closed = false;
  let peak = 0;
  const cancel = () => {
    if (closed) return;
    closed = true;
    closeTracks();
    source?.disconnect();
    node?.disconnect();
    if (node) node.port.onmessage = null;
    void context.close();
    signal.removeEventListener("abort", cancel);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (![16000, 44100, 48000].includes(context.sampleRate)) {
      throw new CaptureError("Set your audio device to 44.1 or 48 kHz in system sound settings, then try again.");
    }
    await context.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    if (signal.aborted) throw new Error("Cancelled");
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "pcm-capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (closed || samples >= context.sampleRate * 8) return;
      chunks.push(event.data);
      samples += event.data.length;
      for (const sample of event.data) peak = Math.max(peak, Math.abs(sample));
    };
    source.connect(node);
    node.connect(context.destination); // Worklet outputs silence, preventing microphone feedback.
    await context.resume();
    return {
      cancel,
      stop: async () => {
        cancel();
        const audio = encodePcm(chunks, context.sampleRate * 8);
        chunks.length = 0;
        if (!samples) throw new CaptureError("The microphone opened but sent no audio. Check the selected microphone and system input settings.");
        if (peak < 1 / 32768) throw new CaptureError("The microphone sent silence. Check mute, input volume, and the selected microphone in Setup.");
        return { audio, sampleRate: context.sampleRate };
      },
    };
  } catch (error) { cancel(); throw error; }
}
