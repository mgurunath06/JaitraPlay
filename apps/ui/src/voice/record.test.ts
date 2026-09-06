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
