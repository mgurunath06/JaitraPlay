/* global AudioWorkletProcessor, registerProcessor */
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0] ?? [];
    if (!channels.length) return true;
    // Keep every discrete microphone channel until the whole utterance is available.
    this.port.postMessage({ channels: channels.map(channel => channel.slice()) });
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
