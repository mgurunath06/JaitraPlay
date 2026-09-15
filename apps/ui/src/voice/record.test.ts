import { afterEach, expect, it, vi } from "vitest";
import { captureQuality, downsampleVoice, highPassVoice, recordVoice, speechRegion } from "./record";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function microphone() {
  const trackStop = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn();
  const port = { onmessage: null as ((event: { data: { samples: Float32Array; channel: number; channels: number } }) => void) | null };
  const contextOptions = vi.fn();
  const track = { stop: trackStop, label: "EMEET test", muted: false, enabled: true, getSettings: () => ({ sampleRate: 48000, channelCount: 2 }) };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  vi.stubGlobal("AudioContext", class {
    constructor(options: unknown) { contextOptions(options); }
    sampleRate = 48000;
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    destination = {};
    createMediaStreamSource = () => ({ connect: vi.fn(), disconnect });
    resume = vi.fn().mockResolvedValue(undefined);
    close = close;
  });
  vi.stubGlobal("AudioWorkletNode", class {
    port = port;
    connect = vi.fn();
    disconnect = disconnect;
  });
  return { trackStop, close, port, contextOptions };
}

it("cleans and normalises native-rate PCM and releases the microphone after stopping", async () => {
  const device = microphone();
  const recording = await recordVoice(new AbortController().signal);
  device.port.onmessage?.({ data: { samples: new Float32Array([0.5, -0.5, 0.5, -0.5, 0.5, -0.5]), channel: 2, channels: 2 } });
  const result = await recording.stop();
  expect(result.sampleRate).toBe(16000);
  expect(atob(result.audio)).toHaveLength(4);
  expect(device.contextOptions).toHaveBeenCalledWith({ latencyHint: "interactive" });
  expect(device.trackStop).toHaveBeenCalledOnce();
  expect(device.close).toHaveBeenCalledOnce();
  expect(device.port.onmessage).toBeNull();
});

it.each([false, true])("distinguishes absent audio from silence and still releases devices (%s)", async (sendSilence) => {
  const device = microphone();
  const recording = await recordVoice(new AbortController().signal);
  if (sendSilence) device.port.onmessage?.({ data: { samples: new Float32Array(128), channel: 1, channels: 1 } });
  await expect(recording.stop()).rejects.toThrow(sendSilence ? "sent silence" : "sent no audio");
  expect(device.trackStop).toHaveBeenCalledOnce();
  expect(device.close).toHaveBeenCalledOnce();
});

it("releases capture on abort without requiring a stop", async () => {
  const device = microphone();
  const controller = new AbortController();
  await recordVoice(controller.signal);
  controller.abort();
  expect(device.trackStop).toHaveBeenCalledOnce();
  expect(device.port.onmessage).toBeNull();
});

it("boosts quiet speech without boosting silence or clipping peaks", async () => {
  const { captureGain, encodePcm } = await import("./record");
  expect(captureGain(.004, .02)).toBe(8);
  expect(captureGain(0, 0)).toBe(1);
  expect(captureGain(.002, .8)).toBeCloseTo(1.125);
  const bytes = atob(encodePcm([new Float32Array([.02])], 1, 8));
  expect(new DataView(Uint8Array.from(bytes, c => c.charCodeAt(0)).buffer).getInt16(0, true)).toBeGreaterThan(5000);
});

it("removes DC/rumble and down-samples common device rates", () => {
  const constant = new Float32Array(4800).fill(.2);
  const filtered = highPassVoice(constant, 48000);
  expect(filtered[0]).toBe(0);
  expect(Math.abs(filtered.at(-1)!)).toBeLessThan(.001);
  expect(downsampleVoice(new Float32Array(48000).fill(.25), 48000)).toHaveLength(16000);
  const from441 = downsampleVoice(new Float32Array(44100).fill(.25), 44100);
  expect(from441).toHaveLength(16000);
  expect(from441[8000]).toBeCloseTo(.25);
});

it("rejects out-of-band energy instead of aliasing it into speech", () => {
  const tone = (frequency: number) => Float32Array.from(
    { length: 48000 }, (_, index) => Math.sin(2 * Math.PI * frequency * index / 48000),
  );
  const rms = (values: Float32Array) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  expect(rms(downsampleVoice(tone(11000), 48000))).toBeLessThan(rms(downsampleVoice(tone(1000), 48000)) * .02);
});

it("trims around a short quiet word and ignores a single transient for gain limiting", () => {
  const samples = new Float32Array(16000 * 6).fill(.0001);
  for (let index = 16000 * 3; index < 16000 * 3.4; index++) samples[index] += index % 2 ? .02 : -.02;
  samples[100] = .9;
  const region = speechRegion(samples, 16000, .0001);
  expect(region.samples.length).toBeLessThan(16000);
  expect(region.durationMs).toBeGreaterThanOrEqual(380);
  expect(region.speechRms).toBeGreaterThan(.015);
  expect(region.limitPeak).toBeLessThan(.1);
});

it("reports quiet, noisy and clipped input separately", () => {
  expect(captureQuality(new Float32Array(1600).fill(.001), 16000).message).toContain("very quiet");
  const clipped = new Float32Array(1600).fill(1);
  expect(captureQuality(clipped, 16000).clippedPercent).toBe(100);
  expect(captureQuality(clipped, 16000).message).toContain("clipping");
  const varied = Float32Array.from({ length: 1600 }, (_, index) => index < 800 ? .01 : index % 2 ? .1 : -.1);
  expect(captureQuality(varied, 16000).snrDb).toBeGreaterThan(6);
});

it("does not silently switch away from a missing saved microphone", async () => {
  const { readSettings, saveSettings } = await import("../setup/settings");
  saveSettings({ ...readSettings(), microphoneId: "missing-device" });
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException("gone", "NotFoundError"));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  try {
    await expect(recordVoice(new AbortController().signal)).rejects.toThrow("saved microphone is disconnected");
    expect(getUserMedia).toHaveBeenCalledOnce();
  } finally { localStorage.clear(); }
});
