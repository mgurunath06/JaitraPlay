import { useEffect, useRef, useState } from "react";
import type { GeneratedQuestion } from "../../../../packages/contracts/src";
import { readSettings } from "../setup/settings";
import { coreClient } from "../app/coreClient";
import { matchAnswer } from "./match";
import { recordVoice, type Recording } from "./record";

export function VoiceAnswer({ choices, onAnswer, onTranscript, useCorrections = true }: { choices: GeneratedQuestion["choices"]; onAnswer: (value: string) => void; onTranscript?: (text: string) => void; useCorrections?: boolean }) {
  const [state, setState] = useState<"idle" | "starting" | "listening" | "processing">("idle");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const capture = useRef<Recording | null>(null);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const cancel = () => { controller.current?.abort(); capture.current?.cancel(); window.clearTimeout(timer.current); };
    const visibility = () => { if (document.hidden) { cancel(); setState("idle"); } };
    const exit = () => { cancel(); setState("idle"); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("jaitra:pause-voice", exit);
    return () => { cancel(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("jaitra:pause-voice", exit); };
  }, []);

  const stop = async () => {
    const recording = capture.current;
    const current = controller.current;
    if (!recording || !current) return;
    capture.current = null;
    window.clearTimeout(timer.current);
    setState("processing");
    try {
      const audio = await recording.stop();
      if (current.signal.aborted) return;
      if (!audio.audio) throw new Error("No audio");
      const result = await coreClient.transcribe(audio);
      if (current.signal.aborted) return;
      const matched = matchAnswer(result.text, choices, useCorrections ? readSettings().voiceAliases : {});
      onTranscript?.(result.text);
      setAnswer(matched);
      setMessage(result.text ? `I heard “${result.text}”.${matched ? " Is that your answer?" : " Try saying one of the answers shown, or tap it."}` : "I didn’t hear an answer. Try again or tap a picture.");
    } catch {
      if (!current.signal.aborted) setMessage("I couldn’t hear you this time. Try again or use the buttons.");
    } finally { if (!current.signal.aborted) setState("idle"); }
  };

  const start = async () => {
    if (state !== "idle") return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState("starting"); setMessage(""); setAnswer(null);
    try {
      const recording = await recordVoice(current.signal);
      if (current.signal.aborted) { recording.cancel(); return; }
      capture.current = recording;
      setState("listening");
      timer.current = window.setTimeout(() => void stop(), 8000);
    } catch {
      if (!current.signal.aborted) { setState("idle"); setMessage("Microphone unavailable. Allow microphone access or use the buttons."); }
    }
  };
  return <div className="voice-answer">
    <button className="hint-button" disabled={state === "starting" || state === "processing"} onClick={() => void (state === "listening" ? stop() : start())}>
      {state === "listening" ? "Stop listening" : state === "processing" ? "Thinking…" : state === "starting" ? "Opening microphone…" : "🎤 Say my answer"}
    </button>
    {state === "listening" && <p role="status">Listening… Say your answer, then press Stop. Stops automatically after 8 seconds.</p>}
    {message && <p role="status">{message}</p>}
    {answer && <button className="primary" onClick={() => onAnswer(answer)}>Use this answer</button>}
  </div>;
}
