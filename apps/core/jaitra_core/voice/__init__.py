"""Local, opt-in speech recognition. Audio and transcripts are never persisted."""

from __future__ import annotations

import base64
import binascii
import importlib
import json
import threading
from pathlib import Path
from typing import Any


class VoiceUnavailable(RuntimeError):
    pass


class VoiceService:
    def __init__(self, model_path: Path, enabled: bool) -> None:
        self.model_path = model_path
        self.enabled = enabled
        self._model: Any = None
        self._lock = threading.Lock()
        self.available = False

    def start(self) -> None:
        if not self.enabled or not self.model_path.is_dir():
            return
        try:
            vosk = importlib.import_module("vosk")
            vosk.SetLogLevel(-1)
            self._model = vosk.Model(str(self.model_path))
            self.available = True
        except Exception:
            # A missing package/model must not prevent touch-based games from starting.
            self.available = False

    def transcribe(self, encoded: str, sample_rate: int) -> str:
        if not self.available:
            raise VoiceUnavailable("VOICE_UNAVAILABLE")
        try:
            audio = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("INVALID_AUDIO") from exc
        if len(audio) % 2 or not 2 <= len(audio) <= sample_rate * 2 * 8:
            raise ValueError("INVALID_AUDIO_LENGTH")
        if not self._lock.acquire(blocking=False):
            raise VoiceUnavailable("VOICE_BUSY")
        try:
            vosk = importlib.import_module("vosk")
            recognizer = vosk.KaldiRecognizer(self._model, sample_rate)
            parts: list[str] = []
            for offset in range(0, len(audio), 8000):
                if recognizer.AcceptWaveform(audio[offset : offset + 8000]):
                    parts.append(str(json.loads(recognizer.Result()).get("text", "")))
            parts.append(str(json.loads(recognizer.FinalResult()).get("text", "")))
            return " ".join(part for part in parts if part).strip()
        finally:
            self._lock.release()
