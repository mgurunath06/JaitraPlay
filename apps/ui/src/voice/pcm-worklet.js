/* global AudioWorkletProcessor, registerProcessor */
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    // Some conference microphones expose a quiet/unused first channel. Select
    // the strongest channel without mixing out-of-phase array channels together.
    let channel;
    let bestEnergy = -1;
    for (const candidate of inputs[0] ?? []) {
      let energy = 0;
      for (const sample of candidate) energy += sample * sample;
      if (energy > bestEnergy) { bestEnergy = energy; channel = candidate; }
    }
    if (channel) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
