import { diagnostic } from "../app/diagnostics";
import { quietMimo } from "../components/mimo";
import { readSettings } from "../setup/settings";
export interface CaptureQuality {
  peak: number;
  rms: number;
  speechRms: number;
  noiseRms: number;
  snrDb: number;
  clippedPercent: number;
  dcOffset: number;
  speechDurationMs: number;
  selectedChannel: number;
  channels: number;
  gain: number;
  message: string;
}
export interface Recording { stop(): Promise<{ audio: string; sampleRate: number }>; cancel(): void }

export class CaptureError extends Error {}

export function encodePcm(chunks: Float32Array[], maxSamples: number, gain = 1): string {
  const length = Math.min(maxSamples, chunks.reduce((total, chunk) => total + chunk.length, 0));
  const bytes = new Uint8Array(length * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      if (offset >= length) break;
      const clamped = Math.max(-1, Math.min(1, sample * gain));
      view.setInt16(offset++ * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
    }
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** Remove DC offset and low-frequency handling/desk noise without gating quiet speech. */
export function highPassVoice(samples: Float32Array, sampleRate: number): Float32Array {
  const output = new Float32Array(samples.length);
  if (!samples.length) return output;
  const alpha = Math.exp(-2 * Math.PI * 70 / sampleRate);
  let previousInput = samples[0], previousOutput = 0;
  for (let index = 1; index < samples.length; index++) {
    const value = alpha * (previousOutput + samples[index] - previousInput);
    output[index] = value;
    previousInput = samples[index]; previousOutput = value;
  }
  return output;
}

/** Windowed-sinc low-pass resampling normalises Vosk input to 16 kHz without aliasing. */
export function downsampleVoice(samples: Float32Array, inputRate: number, outputRate = 16000): Float32Array {
  if (inputRate === outputRate) return samples.slice();
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  const cutoff = Math.min(1, outputRate / inputRate) * .9125;
  const radius = 24;
  const sinc = (value: number) => Math.abs(value) < 1e-8 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
  for (let out = 0; out < output.length; out++) {
    const center = (out + .5) * ratio - .5;
    const first = Math.max(0, Math.ceil(center - radius));
    const last = Math.min(samples.length - 1, Math.floor(center + radius));
    let sum = 0, weight = 0;
    for (let input = first; input <= last; input++) {
      const distance = center - input;
      const window = .5 + .5 * Math.cos(Math.PI * distance / radius);
      const coefficient = cutoff * sinc(cutoff * distance) * window;
      sum += samples[input] * coefficient; weight += coefficient;
    }
    output[out] = weight ? sum / weight : 0;
  }
  return output;
}

export function captureQuality(samples: Float32Array, sampleRate: number): CaptureQuality {
  let peak = 0, squareSum = 0, clipped = 0, sum = 0;
  const frameSize = Math.max(1, Math.round(sampleRate * .02));
  const frames: number[] = [];
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    let frameSquares = 0;
    const end = Math.min(samples.length, offset + frameSize);
    for (let index = offset; index < end; index++) {
      const absolute = Math.abs(samples[index]);
      peak = Math.max(peak, absolute); sum += samples[index]; squareSum += samples[index] ** 2; frameSquares += samples[index] ** 2;
      if (absolute >= .98) clipped++;
    }
    frames.push(Math.sqrt(frameSquares / Math.max(1, end - offset)));
  }
  frames.sort((a, b) => a - b);
  const percentile = (fraction: number) => frames[Math.min(frames.length - 1, Math.floor(frames.length * fraction))] ?? 0;
  // The 97th percentile still finds a brief word in a 6.5-second capture while ignoring spikes.
  const noiseRms = percentile(.2), speechRms = percentile(.97);
  const snrDb = Math.min(60, Math.max(0, 20 * Math.log10((speechRms + 1e-7) / (noiseRms + 1e-7))));
  const clippedPercent = samples.length ? clipped / samples.length * 100 : 0;
  const message = clippedPercent >= 1 ? "Input is clipping. Lower the Ubuntu microphone input volume."
    : speechRms < .003 ? "The recording is very quiet. Check the selected input, mute and Ubuntu input volume."
    : snrDb < 6 ? "Speech is close to the background-noise level. Move nearer to the microphone or reduce room noise."
    : "Audio level looks usable.";
  return { peak, rms: Math.sqrt(squareSum / Math.max(1, samples.length)), speechRms, noiseRms, snrDb, clippedPercent,
    dcOffset: sum / Math.max(1, samples.length), speechDurationMs: 0, selectedChannel: 1, channels: 1, gain: 1, message };
}

export function speechRegion(samples: Float32Array, sampleRate: number, noiseRms: number): { samples: Float32Array; durationMs: number; speechRms: number; limitPeak: number } {
  const frameSize = Math.max(1, Math.round(sampleRate * .02));
  const candidates: { offset: number; level: number }[] = [];
  const active: number[] = [], levels: number[] = [];
  const threshold = Math.max(noiseRms * 2.5, noiseRms + .0002);
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const frame = samples.subarray(offset, Math.min(samples.length, offset + frameSize));
    let squares = 0;
    for (const value of frame) squares += value * value;
    const level = Math.sqrt(squares / Math.max(1, frame.length));
    if (level >= threshold) candidates.push({ offset, level });
  }
  for (let index = 0; index < candidates.length;) {
    let end = index + 1;
    while (end < candidates.length && candidates[end].offset === candidates[end - 1].offset + frameSize) end++;
    if (end - index >= 2) {
      for (const candidate of candidates.slice(index, end)) { active.push(candidate.offset); levels.push(candidate.level); }
    }
    index = end;
  }
  const margin = Math.round(sampleRate * .2);
  const start = active.length ? Math.max(0, active[0] - margin) : 0;
  const end = active.length ? Math.min(samples.length, active.at(-1)! + frameSize + margin) : samples.length;
  const trimmed = samples.slice(start, end);
  levels.sort((a, b) => a - b);
  const speechRms = levels[Math.floor(levels.length * .7)] ?? captureQuality(samples, sampleRate).speechRms;
  const limitPeak = magnitudePercentile(trimmed, .999);
  return { samples: trimmed, durationMs: Math.round(active.length * frameSize / sampleRate * 1000), speechRms, limitPeak };
}

export function magnitudePercentile(samples: Float32Array, fraction: number): number {
  if (!samples.length) return 0;
  const bins = new Uint32Array(4096);
  for (const value of samples) bins[Math.min(bins.length - 1, Math.floor(Math.abs(value) * (bins.length - 1)))]++;
  const target = Math.ceil(samples.length * fraction);
  let count = 0;
  for (let index = 0; index < bins.length; index++) {
    count += bins[index];
    if (count >= target) return index / (bins.length - 1);
  }
  return 1;
}

export async function recordVoice(signal: AbortSignal, onLevel?: (rms: number) => void, onQuality?: (quality: CaptureQuality) => void): Promise<Recording> {
  quietMimo();
  const settings = readSettings();
  const deviceId = settings.microphoneId;
  const processing = settings.microphoneProcessing === true;
  const audio = { echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing };
  diagnostic("voice.capture.start", { processing });
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) }, video: false });
  } catch (error) {
    if (!deviceId || !(error instanceof DOMException) || !["NotFoundError", "OverconstrainedError"].includes(error.name)) throw error;
    throw new CaptureError("The saved microphone is disconnected. Select your EMEET input again in Setup.");
  }
  const closeTracks = () => stream.getTracks().forEach((track) => track.stop());
  if (signal.aborted) { closeTracks(); throw new Error("Cancelled"); }
  let context: AudioContext;
  // Use the device's rate; forcing 16 kHz can prevent a media stream from connecting.
  try { context = new AudioContext({ latencyHint: "interactive" }); }
  catch (error) { closeTracks(); throw error; }
  const channelChunks: Float32Array[][] = [];
  const channelEnergy: number[] = [];
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let samples = 0;
  let closed = false;
  let lastMeter = 0;
  const track = stream.getAudioTracks()[0];
  if (!track) { closeTracks(); void context.close(); throw new CaptureError("The selected device did not provide an audio track."); }
  const actual = track?.getSettings?.();
  diagnostic("voice.device", {
    selection: deviceId ? "saved device" : "system default",
    trackSampleRate: actual?.sampleRate ?? 0, contextSampleRate: context.sampleRate,
    channels: actual?.channelCount ?? 0, muted: track.muted, enabled: track.enabled,
    echoCancellation: actual?.echoCancellation ?? false, noiseSuppression: actual?.noiseSuppression ?? false,
    autoGainControl: actual?.autoGainControl ?? false,
  });
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
    if (context.sampleRate < 8000 || context.sampleRate > 192000) throw new CaptureError("The microphone reported an unsupported sample rate.");
    await context.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    if (signal.aborted) throw new Error("Cancelled");
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "pcm-capture", { channelCountMode: "max", channelInterpretation: "discrete" });
    source.channelCountMode = "max";
    source.channelInterpretation = "discrete";
    let channelCount = actual?.channelCount ?? 1;
    node.port.onmessage = (event: MessageEvent<{ channels: Float32Array[] }>) => {
      if (closed || samples >= context.sampleRate * 8) return;
      channelCount = event.data.channels.length;
      const length = Math.min(event.data.channels[0]?.length ?? 0, context.sampleRate * 8 - samples);
      for (let channel = 0; channel < event.data.channels.length; channel++) {
        const frame = event.data.channels[channel].subarray(0, length);
        (channelChunks[channel] ??= []).push(frame);
        let energy = channelEnergy[channel] ?? 0;
        for (const value of frame) energy += value * value;
        channelEnergy[channel] = energy;
      }
      samples += length;
      let frameSquares = 0;
      for (const frame of event.data.channels) {
        let energy = 0;
        for (let index = 0; index < length; index++) energy += frame[index] * frame[index];
        frameSquares = Math.max(frameSquares, energy);
      }
      if (samples - lastMeter >= context.sampleRate / 10) {
        lastMeter = samples;
        onLevel?.(Math.sqrt(frameSquares / Math.max(1, length)));
      }
    };
    source.connect(node);
    node.connect(context.destination); // Worklet outputs silence, preventing microphone feedback.
    await context.resume();
    return {
      cancel,
      stop: async () => {
        cancel();
        if (!samples) throw new CaptureError("The microphone opened but sent no audio. Check the selected microphone and system input settings.");
        const selected = channelEnergy.reduce((best, value, index, all) => value > all[best] ? index : best, 0);
        const joined = new Float32Array(samples);
        let offset = 0;
        for (const chunk of channelChunks[selected]) { joined.set(chunk.subarray(0, samples - offset), offset); offset += Math.min(chunk.length, samples - offset); }
        channelChunks.length = 0;
        const rawQuality = captureQuality(joined, context.sampleRate);
        if (rawQuality.peak < 1 / 32768) throw new CaptureError("The microphone sent silence. Check mute, input volume, and the selected microphone in Setup.");
        const cleaned = highPassVoice(joined, context.sampleRate);
        const quality = captureQuality(cleaned, context.sampleRate);
        const region = speechRegion(cleaned, context.sampleRate, quality.noiseRms);
        const gain = captureGain(region.speechRms, region.limitPeak);
        const normalised = downsampleVoice(region.samples, context.sampleRate);
        const snrDb = Math.min(60, Math.max(0, 20 * Math.log10((region.speechRms + 1e-7) / (quality.noiseRms + 1e-7))));
        const resultQuality = {
          ...quality, speechRms: region.speechRms, speechDurationMs: region.durationMs,
          clippedPercent: rawQuality.clippedPercent, dcOffset: rawQuality.dcOffset,
          snrDb, selectedChannel: selected + 1, channels: channelCount, gain,
        };
        diagnostic("voice.capture.finish", {
          samples, inputSampleRate: context.sampleRate, outputSampleRate: 16000,
          peak: quality.peak, rms: quality.rms, speechRms: region.speechRms, noiseRms: quality.noiseRms,
          snrDb: Math.round(snrDb * 10) / 10, clippedPercent: Math.round(rawQuality.clippedPercent * 100) / 100,
          dcOffset: rawQuality.dcOffset, speechDurationMs: region.durationMs,
          selectedChannel: selected + 1, channels: channelCount, gain,
          durationMs: Math.round(samples / context.sampleRate * 1000), quality: quality.message,
        });
        onQuality?.({ ...resultQuality, message: rawQuality.clippedPercent >= 1 ? "Input is clipping. Lower the Ubuntu microphone input volume." : quality.message });
        return { audio: encodePcm([normalised], normalised.length, gain), sampleRate: 16000 };
      },
    };
  } catch (error) { diagnostic("voice.capture.error", { error: error instanceof Error ? error.name : "UnknownError" }); cancel(); throw error; }
}

// Bounded amplification improves quiet PCM without clipping or amplifying digital silence.
export function captureGain(rms: number, peak: number): number {
  return rms > 0.0001 && peak > 0 ? Math.max(1, Math.min(8, 0.06 / rms, 0.9 / peak)) : 1;
}
