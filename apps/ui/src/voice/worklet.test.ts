// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("captures speech from a second microphone channel when the first is silent", () => {
  const received: { samples: Float32Array; channel: number; channels: number }[] = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean };
  runInNewContext(readFileSync(new URL("./pcm-worklet.js", import.meta.url), "utf8"), {
    sampleRate: 16000,
    AudioWorkletProcessor: class { port = { postMessage: (frame: typeof received[number]) => received.push(frame) }; },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  });
  const speech = new Float32Array([.1, -.2, .3]);
  const processor = new Processor!();
  for (let index = 0; index < 1334; index++) processor.process([[new Float32Array(3), speech]]);
  expect(received[0].channel).toBe(2);
  expect(received[0].channels).toBe(2);
  expect(Array.from(received[0].samples)).toEqual(Array.from(speech));
  expect(received[0].samples).not.toBe(speech);
});

it("buffers warm-up audio, latches once and never hops channels", () => {
  const received: { samples: Float32Array; channel: number; channels: number }[] = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean };
  runInNewContext(readFileSync(new URL("./pcm-worklet.js", import.meta.url), "utf8"), {
    sampleRate: 16000,
    AudioWorkletProcessor: class { port = { postMessage: (frame: typeof received[number]) => received.push(frame) }; },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  });
  const processor = new Processor!();
  const first = new Float32Array(128).fill(.2), second = new Float32Array(128).fill(.01);
  for (let frame = 0; frame < 31; frame++) processor.process([[first, second]]);
  expect(received).toHaveLength(0);
  processor.process([[first, second]]);
  expect(received).toHaveLength(32);
  const quietFirst = new Float32Array(128).fill(.01);
  processor.process([[quietFirst, new Float32Array(128).fill(1)]]);
  expect(received.at(-1)!.channel).toBe(1);
  expect(Array.from(received.at(-1)!.samples)).toEqual(Array.from(quietFirst));
});
