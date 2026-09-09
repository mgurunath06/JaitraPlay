import { useEffect, useRef, useState, type RefObject } from "react";
import { downloadLocal, type ExperimentLog } from "./experiment";
import { replayClip, replayDataset } from "./replay";
import type { IdentityProfile } from "./types";

export function ExperimentPanel({ video, log, profile }: {
  video: RefObject<HTMLVideoElement | null>; log: ExperimentLog; profile: RefObject<IdentityProfile | null>;
}) {
  const [session, setSession] = useState("evening-01");
  const [logging, setLogging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");
  const [replaying, setReplaying] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => { window.clearTimeout(timeout.current); if (recorder.current?.state === "recording") recorder.current.stop(); }, []);
  const record = () => {
    try {
      const stream = video.current?.srcObject;
      if (!(stream instanceof MediaStream) || !stream.getVideoTracks().some(track => track.readyState === "live")) throw new Error("Start recognition with a working camera first.");
      if (typeof MediaRecorder === "undefined") throw new Error("Video recording is unavailable in this browser.");
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("WebM recording is unavailable in this browser.");
      const clip = `${session}-${Date.now()}`;
      const capture = new MediaRecorder(new MediaStream(stream.getVideoTracks()), { mimeType, videoBitsPerSecond: 6000000 });
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => setMessage("Recording failed; check the camera and retry.");
      capture.onstop = () => {
        window.clearTimeout(timeout.current); setRecording(false);
        downloadLocal(`${clip}.webm`, new Blob(chunks, { type: mimeType }));
        setMessage(`Saved ${clip}.webm. Keep all clips from this session in the same split.`);
      };
      recorder.current = capture; capture.start(1000); setRecording(true);
      log.add({ type: "clip_start", clip, timestamp: new Date().toISOString(), videoTime: video.current?.currentTime, camera: { width: video.current?.videoWidth, height: video.current?.videoHeight } });
      timeout.current = window.setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 30000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Recording failed."); }
  };
  return <details>
    <summary>Camera experiment · baseline diagnostics and evaluation</summary>
    <p>Diagnostics cover every processed frame, not every camera frame. Recording saves a local 30-second video without audio. Choose a private folder such as .local/face-eval; recordings contain identifiable faces.</p>
    <label>Session ID <input value={session} disabled={logging || recording || replaying} onChange={event => setSession(event.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64))} /></label>
    <button disabled={!session || replaying} onClick={() => {
      if (logging) { log.active = false; log.export(session); setLogging(false); }
      else { log.start(session); setLogging(true); }
    }}>{logging ? "Stop and save diagnostics" : "Start diagnostics"}</button>
    <button disabled={!session || replaying} onClick={() => recording ? recorder.current?.stop() : record()}>{recording ? "Stop and save clip" : "Record 30-second evaluation clip"}</button>
    <p>Offline baseline: pause recognition, then select an evaluation clip. It runs the unchanged face-api detector at the same 640-pixel analysis width and exports one result per second. Filename must match the manifest clip ID.</p>
    <label>Replay evaluation clip <input type="file" accept="video/*" disabled={replaying || recording || logging} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (video.current?.srcObject) { setMessage("Pause recognition before replaying a clip."); event.target.value = ""; return; }
      setReplaying(true); setMessage("Replaying baseline clip…");
      void replayClip(file, session, profile.current).then(() => setMessage("Baseline predictions saved.")).catch(error => setMessage(String(error))).finally(() => setReplaying(false));
      event.target.value = "";
    }} /></label>
    <label>Benchmark manifest and clips <input type="file" multiple accept="video/*,.json" disabled={replaying || recording || logging} onChange={event => {
      const files = Array.from(event.target.files ?? []); if (!files.length) return;
      if (video.current?.srcObject) { setMessage("Pause recognition before benchmarking."); event.target.value = ""; return; }
      setReplaying(true); setMessage("Building the baseline gallery from enrollment clips, then evaluating separate sessions…");
      void replayDataset(files).then(() => setMessage("Dataset baseline predictions saved.")).catch(error => setMessage(String(error))).finally(() => setReplaying(false));
      event.target.value = "";
    }} /></label>
    <p role="status">{message}</p>
  </details>;
}
