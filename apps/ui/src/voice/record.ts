import { quietMimo } from "../components/mimo";
import { readSettings } from "../setup/settings";
export interface Recording { stop(): Promise<{ audio: string; sampleRate: number }>; cancel(): void }

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
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  const closeTracks = () => stream.getTracks().forEach((track) => track.stop());
  if (signal.aborted) { closeTracks(); throw new Error("Cancelled"); }
  let context: AudioContext;
  try { context = new AudioContext({ sampleRate: 16000 }); }
  catch (error) { closeTracks(); throw error; }
  const chunks: Float32Array[] = [];
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let samples = 0;
  let closed = false;
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
    await context.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    if (signal.aborted) throw new Error("Cancelled");
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "pcm-capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (closed || samples >= context.sampleRate * 8) return;
      chunks.push(event.data);
      samples += event.data.length;
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
        return { audio, sampleRate: context.sampleRate };
      },
    };
  } catch (error) { cancel(); throw error; }
}
