/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.selected = -1;
    this.channels = 0;
    this.warmupSamples = Math.round(sampleRate * .25);
    this.bufferedSamples = 0;
    this.energy = [];
    this.buffer = [];
  }
  emit(samples) {
    this.port.postMessage({ samples: samples.slice(), channel: this.selected + 1, channels: this.channels });
  }
  process(inputs) {
    const channels = inputs[0] ?? [];
    if (!channels.length) return true;
    if (this.selected >= 0) {
      this.emit(channels[Math.min(this.selected, channels.length - 1)]);
      return true;
    }
    this.channels = Math.max(this.channels, channels.length);
    this.buffer.push(channels.map(channel => channel.slice()));
    this.bufferedSamples += channels[0].length;
    for (let index = 0; index < channels.length; index++) {
      let energy = this.energy[index] ?? 0;
      for (const value of channels[index]) energy += value * value;
      this.energy[index] = energy;
    }
    if (this.bufferedSamples < this.warmupSamples) return true;
    this.selected = this.energy.reduce((best, value, index, all) => value > all[best] ? index : best, 0);
    for (const block of this.buffer) this.emit(block[Math.min(this.selected, block.length - 1)]);
    this.buffer = [];
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
