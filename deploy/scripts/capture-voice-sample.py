#!/usr/bin/env python3
"""Explicitly record a local microphone sample for offline voice diagnosis."""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import wave
import zipfile
from array import array
from datetime import UTC, datetime
from pathlib import Path


def command_output(command: list[str]) -> str:
    try:
        return subprocess.run(command, check=False, capture_output=True, text=True).stdout.strip()
    except OSError as exc:
        return f"unavailable: {type(exc).__name__}"


def detect_channels(device: str) -> int:
    try:
        result = subprocess.run(
            [
                "arecord", "-D", device, "--dump-hw-params", "-q", "-t", "raw",
                "-f", "S16_LE", "-r", "48000", "-d", "1", "/dev/null",
            ],
            check=False, capture_output=True, text=True,
        )
    except OSError:
        return 1
    details = f"{result.stdout}\n{result.stderr}"
    ranged = re.search(r"CHANNELS:\s*\[\s*\d+\s+(\d+)\s*\]", details)
    fixed = re.search(r"CHANNELS:\s*(\d+)", details)
    return max(1, min(8, int((ranged or fixed).group(1)))) if ranged or fixed else 1


def read_wave(path: Path) -> tuple[list[array[int]], int, int, int]:
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        rate = source.getframerate()
        width = source.getsampwidth()
        frames = source.getnframes()
        payload = source.readframes(frames)
    if width != 2:
        raise RuntimeError(f"Expected 16-bit PCM, received {width * 8}-bit audio")
    values = array("h")
    values.frombytes(payload)
    if sys.byteorder != "little":
        values.byteswap()
    separated = [array("h", values[channel::channels]) for channel in range(channels)]
    return separated, rate, width, frames


def channel_metrics(values: array[int], rate: int) -> dict[str, int | float]:
    frame_size = max(1, round(rate * 0.02))
    frame_rms = []
    for start in range(0, len(values), frame_size):
        frame = values[start : start + frame_size]
        frame_rms.append(math.sqrt(sum(value * value for value in frame) / len(frame)) / 32768)
    frame_rms.sort()

    def percentile(fraction: float) -> float:
        if not frame_rms:
            return 0.0
        return frame_rms[min(len(frame_rms) - 1, int(len(frame_rms) * fraction))]

    noise_rms, speech_rms = percentile(0.2), percentile(0.97)
    peak = max((abs(value) for value in values), default=0) / 32768
    rms = math.sqrt(sum(value * value for value in values) / max(1, len(values))) / 32768
    clipped = sum(abs(value) >= 32112 for value in values) / max(1, len(values)) * 100
    dc_offset = sum(values) / max(1, len(values)) / 32768
    snr = min(60.0, max(0.0, 20 * math.log10((speech_rms + 1e-7) / (noise_rms + 1e-7))))
    return {
        "peak": round(peak, 6), "rms": round(rms, 6), "dcOffset": round(dc_offset, 6),
        "noiseRms": round(noise_rms, 6),
        "speechRms": round(speech_rms, 6), "snrDb": round(snr, 1),
        "clippedPercent": round(clipped, 3),
    }


def analyse(path: Path) -> dict[str, object]:
    separated, rate, width, frames = read_wave(path)
    return {
        "channels": len(separated), "sampleRate": rate, "bits": width * 8,
        "durationMs": round(frames / rate * 1000),
        "perChannel": [channel_metrics(values, rate) for values in separated],
    }


def transcribe_channels(path: Path, model_path: Path) -> list[str] | str:
    try:
        import vosk  # type: ignore[import-not-found]
    except ImportError:
        return "Vosk is not installed for this Python account."
    if not model_path.is_dir():
        return f"Model not found at {model_path}"
    separated, rate, _width, _frames = read_wave(path)
    vosk.SetLogLevel(-1)
    model = vosk.Model(str(model_path))
    transcripts = []
    for values in separated:
        recognizer = vosk.KaldiRecognizer(model, rate)
        audio = values.tobytes()
        parts = []
        for offset in range(0, len(audio), 8000):
            if recognizer.AcceptWaveform(audio[offset : offset + 8000]):
                parts.append(str(json.loads(recognizer.Result()).get("text", "")))
        parts.append(str(json.loads(recognizer.FinalResult()).get("text", "")))
        transcripts.append(" ".join(part for part in parts if part).strip())
    return transcripts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--device", default="default", help="ALSA capture device (default: default)"
    )
    parser.add_argument("--seconds", type=int, default=10, choices=range(5, 31))
    parser.add_argument(
        "--channels", type=int, default=0, choices=range(0, 9),
        help="channel count; 0 probes the selected ALSA device (default: 0)",
    )
    parser.add_argument(
        "--model", default=".local/models/vosk-model-small-en-us-0.15",
        help="Vosk model path relative to the repository",
    )
    args = parser.parse_args()
    if not shutil.which("arecord"):
        print(
            "arecord is missing. Install the Ubuntu package alsa-utils, then retry.",
            file=sys.stderr,
        )
        return 2
    root = Path(__file__).resolve().parents[2]
    target = root / ".local" / "voice-samples" / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target.mkdir(parents=True, exist_ok=False)
    wav = target / "voice-sample.wav"
    print("This opt-in diagnostic SAVES audio locally.")
    if not args.channels:
        print("Probing the selected device's channel layout for one second (audio is discarded)...")
    channels = args.channels or detect_channels(args.device)
    print("For the first 2 seconds stay quiet, then have the child say:")
    print('  “Mimo. Blue. Red. Three. Elephant. Circle. A. Is. It. We. My. Go. He. Up.”')
    print(
        f"Recording {args.seconds} seconds from ALSA device {args.device!r} "
        f"({channels} channel(s))..."
    )
    def record(channels: int) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "arecord", "-D", args.device, "-q", "-t", "wav", "-f", "S16_LE",
                "-r", "48000", "-c", str(channels), "-d", str(args.seconds), str(wav),
            ],
            check=False, capture_output=True, text=True,
        )

    result = record(channels)
    while result.returncode and channels > 1:
        channels -= 1
        print(f"The device rejected the requested layout; retrying with {channels} channel(s).")
        result = record(channels)
    if result.returncode:
        print(result.stderr.strip() or "Microphone recording failed.", file=sys.stderr)
        return result.returncode
    metadata = {
        "createdAt": datetime.now(UTC).isoformat(), "requestedDevice": args.device,
        "requestedChannels": args.channels or "auto", "capturedChannels": channels,
        "analysis": analyse(wav),
        "transcriptsPerChannel": transcribe_channels(
            wav, (root / args.model).resolve()
        ),
        "pulseInfo": command_output(["pactl", "info"]),
        "pulseSources": command_output(["pactl", "list", "short", "sources"]),
        "alsaDevices": command_output(["arecord", "-l"]),
    }
    (target / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    bundle = target.with_suffix(".zip")
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(wav, wav.name)
        archive.write(target / "metadata.json", "metadata.json")
    print(json.dumps(metadata["analysis"], indent=2))
    print(f"Saved diagnostic bundle: {bundle}")
    print("Review/listen to it before sharing; it contains the recorded voice and room audio.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
