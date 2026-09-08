import { afterEach, expect, it, vi } from "vitest";
import { recordVoice } from "./record";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function microphone() {
  const trackStop = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn();
  const port = { onmessage: null as ((event: { data: Float32Array }) => void) | null };
  const contextOptions = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) } });
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

it("captures native-rate PCM and releases the microphone after stopping", async () => {
  const device = microphone();
  const recording = await recordVoice(new AbortController().signal);
  device.port.onmessage?.({ data: new Float32Array([0.5, -0.5]) });
  expect(await recording.stop()).toEqual({ audio: "AEAAwA==", sampleRate: 48000 });
  expect(device.contextOptions).toHaveBeenCalledWith({ latencyHint: "interactive" });
  expect(device.trackStop).toHaveBeenCalledOnce();
  expect(device.close).toHaveBeenCalledOnce();
  expect(device.port.onmessage).toBeNull();
});

it.each([false, true])("distinguishes absent audio from silence and still releases devices (%s)", async (sendSilence) => {
  const device = microphone();
  const recording = await recordVoice(new AbortController().signal);
  if (sendSilence) device.port.onmessage?.({ data: new Float32Array(128) });
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
