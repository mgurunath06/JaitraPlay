// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("captures speech from a second microphone channel when the first is silent", () => {
  const received: Float32Array[] = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean };
  runInNewContext(readFileSync(new URL("./pcm-worklet.js", import.meta.url), "utf8"), {
    AudioWorkletProcessor: class { port = { postMessage: (frame: Float32Array) => received.push(frame) }; },
    registerProcessor: (_name: string, implementation: typeof Processor) => { Processor = implementation; },
  });
  const speech = new Float32Array([.1, -.2, .3]);
  new Processor!().process([[new Float32Array(3), speech]]);
  expect(Array.from(received[0])).toEqual(Array.from(speech));
  expect(received[0]).not.toBe(speech);
});
