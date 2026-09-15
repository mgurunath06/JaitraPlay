// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("emits every discrete microphone channel without choosing in the worklet", () => {
  const received: { channels: Float32Array[] }[] = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean };
  runInNewContext(readFileSync(new URL("./pcm-worklet.js", import.meta.url), "utf8"), {
    AudioWorkletProcessor: class { port = { postMessage: (frame: typeof received[number]) => received.push(frame) }; },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  });
  const speech = new Float32Array([.1, -.2, .3]);
  const processor = new Processor!();
  processor.process([[new Float32Array(3), speech]]);
  expect(received[0].channels).toHaveLength(2);
  expect(Array.from(received[0].channels[1])).toEqual(Array.from(speech));
  expect(received[0].channels[1]).not.toBe(speech);
});

it("keeps a channel whose speech begins after quiet opening frames", () => {
  const received: { channels: Float32Array[] }[] = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean };
  runInNewContext(readFileSync(new URL("./pcm-worklet.js", import.meta.url), "utf8"), {
    AudioWorkletProcessor: class { port = { postMessage: (frame: typeof received[number]) => received.push(frame) }; },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  });
  const processor = new Processor!();
  processor.process([[new Float32Array(128).fill(.01), new Float32Array(128)]]);
  processor.process([[new Float32Array(128).fill(.01), new Float32Array(128).fill(.2)]]);
  expect(received).toHaveLength(2);
  expect(received[0].channels[1].every(value => value === 0)).toBe(true);
  expect(received[1].channels[1][0]).toBeCloseTo(.2);
});
