"""Local, opt-in speech recognition. Audio and transcripts are never persisted."""

from __future__ import annotations

import base64
import binascii
import importlib
import json
import logging
import re
import threading
import time
from pathlib import Path
from typing import Any

from jaitra_core.observability.logging import log_event


class VoiceUnavailable(RuntimeError):
    pass


class VoiceService:
    def __init__(self, model_path: Path, enabled: bool) -> None:
        self.model_path = model_path
        self.enabled = enabled
        self._model: Any = None
        self._words: set[str] | None = None
        self._lock = threading.Lock()
        self.available = False

    def start(self) -> None:
        if not self.enabled or not self.model_path.is_dir():
            log_event(
                logging.getLogger(__name__),
                logging.WARNING,
                "VOICE_DISABLED",
                "voice",
                reason_code="DISABLED" if not self.enabled else "MODEL_MISSING",
            )
            return
        try:
            vosk = importlib.import_module("vosk")
            vosk.SetLogLevel(-1)
            self._model = vosk.Model(str(self.model_path))
            words_path = self.model_path / "graph" / "words.txt"
            if words_path.is_file():
                self._words = {
                    line.rsplit(maxsplit=1)[0]
                    for line in words_path.read_text(encoding="utf-8").splitlines()
                    if line.strip()
                }
            self.available = True
        except Exception as exc:
            log_event(
                logging.getLogger(__name__),
                logging.WARNING,
                "VOICE_MODEL_FAILED",
                "voice",
                reason_code=type(exc).__name__,
            )
            # A missing package/model must not prevent touch-based games from starting.
            self.available = False

    def transcribe(self, encoded: str, sample_rate: int, phrases: list[str] | None = None) -> str:
        started = time.monotonic()
        log_event(
            logging.getLogger(__name__),
            logging.INFO,
            "VOICE_START",
            "voice",
            payload={
                "sampleRate": sample_rate,
                "grammarSize": len(phrases or []),
                "available": self.available,
            },
        )
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
            grammar, dropped = self._grammar(phrases or [])
            if dropped:
                log_event(
                    logging.getLogger(__name__), logging.WARNING, "VOICE_GRAMMAR_FILTERED",
                    "voice", payload={"kept": len(grammar), "dropped": dropped},
                )
            if grammar:
                try:
                    recognizer = vosk.KaldiRecognizer(
                        self._model, sample_rate, json.dumps([*grammar, "[unk]"])
                    )
                except Exception as exc:
                    log_event(
                        logging.getLogger(__name__), logging.WARNING, "VOICE_GRAMMAR_FALLBACK",
                        "voice", reason_code=type(exc).__name__,
                    )
                    recognizer = vosk.KaldiRecognizer(self._model, sample_rate)
            else:
                recognizer = vosk.KaldiRecognizer(self._model, sample_rate)
            parts: list[str] = []
            for offset in range(0, len(audio), 8000):
                if recognizer.AcceptWaveform(audio[offset : offset + 8000]):
                    parts.append(str(json.loads(recognizer.Result()).get("text", "")))
            parts.append(str(json.loads(recognizer.FinalResult()).get("text", "")))
            text = " ".join(part for part in parts if part).replace("[unk]", "").strip()
            log_event(
                logging.getLogger(__name__),
                logging.INFO,
                "VOICE_RESULT",
                "voice",
                payload={
                    "bytes": len(audio),
                    "words": len(text.split()),
                    "durationMs": round((time.monotonic() - started) * 1000),
                },
            )
            return text
        except Exception as exc:
            log_event(
                logging.getLogger(__name__),
                logging.ERROR,
                "VOICE_ERROR",
                "voice",
                reason_code=type(exc).__name__,
            )
            raise
        finally:
            self._lock.release()

    def _grammar(self, phrases: list[str]) -> tuple[list[str], int]:
        numbers = {
            "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
            "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
            "10": "ten",
        }
        cleaned = []
        dropped = 0
        for phrase in phrases[:40]:
            value = re.sub(r"[^a-z0-9' ]", " ", phrase.casefold())
            value = " ".join(numbers.get(token, token) for token in value.split())[:40]
            if self._words is not None and any(token not in self._words for token in value.split()):
                dropped += 1
                continue
            if value and value not in cleaned:
                cleaned.append(value)
        return cleaned, dropped
