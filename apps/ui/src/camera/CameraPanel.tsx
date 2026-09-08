import { diagnostic } from "../app/diagnostics";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SetupSettings, Zone } from "../setup/settings";
import { observe, type Landmark, type Observation, type WristSample } from "./observe";

const empty: Observation = { presence: "No person visible", position: "Unknown", zone: "Unknown", gesture: "No gesture" };
export function CameraPanel({ settings, onZones, onStarted, simple = false }: { settings: SetupSettings; onZones?: (zones: Zone[]) => void; onStarted?: () => void; simple?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const frameTimer = useRef<number | undefined>(undefined);
  const watchdog = useRef<number | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [state, setState] = useState<"off" | "starting" | "on">("off");
  const [error, setError] = useState("");
  const [backend, setBackend] = useState("");
  const [observation, setObservation] = useState(empty);
  const [points, setPoints] = useState<Landmark[]>([]);
  const [ratio, setRatio] = useState(4 / 3);
  const [zoneName, setZoneName] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);
  const cleanup = useCallback(() => {
    generation.current++;
    window.clearTimeout(frameTimer.current); window.clearTimeout(watchdog.current);
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    worker.current?.terminate(); worker.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const stop = useCallback(() => {
    cleanup(); setState("off"); setPoints([]); setObservation(empty); setDrawing(false); setCorner(null);
  }, [cleanup]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("jaitra:pause-camera", stop);
    return () => { cleanup(); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("jaitra:pause-camera", stop); };
  }, [cleanup, stop]);
  useEffect(() => { stop(); }, [settings.cameraId, settings.preferGpu, stop]);

  const start = async () => {
    cleanup(); const token = generation.current;
    setState("starting"); setError(""); setObservation(empty);
    const history: WristSample[] = [];
    let lastDiagnostic = 0;
    diagnostic("camera.start");
    const fail = (message: string) => { diagnostic("camera.error", { reason: message.replace(/[^a-zA-Z0-9 .-]/g, "").slice(0, 100) }); if (generation.current === token) { stop(); setError(message); } };
    try {
      const videoConstraints = { width: { ideal: 640 }, height: { ideal: 480 } };
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video: { ...videoConstraints, ...(settings.cameraId ? { deviceId: { exact: settings.cameraId } } : {}) }, audio: false });
      } catch (mediaError) {
        if (!settings.cameraId || !(mediaError instanceof DOMException) || !["NotFoundError", "OverconstrainedError"].includes(mediaError.name)) throw mediaError;
        media = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      }
      if (generation.current !== token) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      media.getVideoTracks().forEach(track => track.addEventListener("ended", () => fail("Camera disconnected. Reconnect it and try again.")));
      const element = video.current;
      if (!element) { cleanup(); return; }
      element.srcObject = media;
      await element.play();
      if (generation.current !== token) return;
      setRatio(element.videoWidth / element.videoHeight || 4 / 3);
      const process = new Worker(new URL("camera/pose-worker.js", new URL(import.meta.env.BASE_URL, window.location.href)));
      worker.current = process;
      process.onerror = () => fail("Camera recognition could not start. Check the installed camera assets and try again.");
      watchdog.current = window.setTimeout(() => fail("Camera recognition timed out. Try CPU mode in Setup."), 30000);
      let lastVideoTime = -1;
      let lastFrameAt = performance.now();
      const sendFrame = async () => {
        if (generation.current !== token) return;
        if (element.readyState < 2 || element.currentTime === lastVideoTime) {
          if (performance.now() - lastFrameAt > 3000) { fail("Camera frames stopped. Check the device and try again."); return; }
          frameTimer.current = window.setTimeout(() => void sendFrame(), 80);
          return;
        }
        lastVideoTime = element.currentTime;
        lastFrameAt = performance.now();
        try {
          const bitmap = await createImageBitmap(element);
          if (generation.current !== token) { bitmap.close(); return; }
          process.postMessage({ type: "frame", frame: bitmap, time: performance.now() }, [bitmap]);
          watchdog.current = window.setTimeout(() => fail("Camera recognition stopped responding. Try again."), 10000);
        } catch { fail("Could not read a camera frame. Please try again."); }
      };
      process.onmessage = ({ data }: MessageEvent<{ type: string; landmarks: Landmark[][]; time: number; backend: string; message: string }>) => {
        if (generation.current !== token) return;
        window.clearTimeout(watchdog.current);
        if (data.type === "error") { fail(data.message); return; }
        if (data.type === "ready") { diagnostic("camera.ready", { backend: data.backend }); setBackend(data.backend); setState("on"); onStarted?.(); void sendFrame(); }
        if (data.type === "result") {
          const observation = observe(data.landmarks, settingsRef.current.zones, history, data.time);
          setObservation(observation);
          if (data.time - lastDiagnostic >= 2000) {
            lastDiagnostic = data.time;
            diagnostic("camera.observation", { people: data.landmarks.length, gesture: observation.gesture, durationMs: Math.round(performance.now() - data.time), visibility: Math.min(...[11, 12, 15, 16].map(i => data.landmarks[0]?.[i]?.visibility ?? 0)) });
          }
          setPoints(data.landmarks.length === 1 ? data.landmarks[0] : []);
          frameTimer.current = window.setTimeout(() => void sendFrame(), 80);
        }
      };
      process.postMessage({ type: "init", preferGpu: simple ? false : settings.preferGpu });
    } catch { fail("Camera unavailable. Allow camera access, check the selected device, and try again."); }
  };
  return <section className="camera-panel" aria-label="Camera observation">
    <div className="camera-controls">
      <button className="hint-button" onClick={() => state === "off" ? void start() : stop()}>{state === "off" ? (simple ? "Test camera" : "Start camera") : "Stop camera"}</button>
      <span>{state === "on" ? `Camera on · ${backend}` : state === "starting" ? "Starting camera…" : "Camera off"}</span>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className={`camera-frame ${drawing ? "drawing-zone" : ""}`} style={{ aspectRatio: ratio }} onClick={(event) => {
      if (!drawing || !onZones || state !== "on") return;
      const rect = event.currentTarget.getBoundingClientRect();
      const point = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
      if (!corner) { setCorner(point); return; }
      const zone: Zone = { id: crypto.randomUUID(), name: zoneName.trim(), x: Math.min(corner.x, point.x), y: Math.min(corner.y, point.y), width: Math.abs(corner.x - point.x), height: Math.abs(corner.y - point.y) };
      if (zone.width < 0.03 || zone.height < 0.03) { setCorner(null); return; }
      onZones([...settings.zones, zone]); setDrawing(false); setCorner(null); setZoneName("");
    }}>
      <video ref={video} muted playsInline aria-label="Mirrored camera preview" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {settings.zones.map(zone => <g key={zone.id}><rect x={zone.x * 100} y={zone.y * 100} width={zone.width * 100} height={zone.height * 100} /><text x={zone.x * 100 + 1} y={zone.y * 100 + 4}>{zone.name}</text></g>)}
        {points.filter(p => (p.visibility ?? 0) >= 0.65).map((p, index) => <circle key={index} cx={(1 - p.x) * 100} cy={p.y * 100} r="0.7" />)}
        {corner && <circle cx={corner.x * 100} cy={corner.y * 100} r="1.5" />}
      </svg>
    </div>
    <div className="camera-readout" aria-live="polite">
      <strong>{observation.presence}</strong>
      <span>Gesture: {observation.gesture}</span>
      {!simple && <span>Screen position: {observation.position}</span>}
      {!simple && <span>Room zone: {observation.zone}</span>}
    </div>
    {onZones && <details className="zone-options"><summary>Optional: set room zones</summary><div className="zone-editor">
      <p>Keep the camera fixed and show the whole body, including feet. Name a floor area, then mark its opposite corners on the mirrored preview.</p>
      <label>Room zone name <input maxLength={30} value={zoneName} onChange={event => setZoneName(event.target.value)} placeholder="e.g. Play mat" /></label>
      <button disabled={state !== "on" || !zoneName.trim() || settings.zones.length >= 8} onClick={() => { setDrawing(!drawing); setCorner(null); }}>{drawing ? "Cancel marking" : "Mark room zone"}</button>
      {drawing && <p role="status">{corner ? "Click the opposite corner." : "Click the first corner of the floor area."}</p>}
      {settings.zones.map(zone => <div key={zone.id}>{zone.name} <button aria-label={`Remove ${zone.name}`} onClick={() => onZones(settings.zones.filter(z => z.id !== zone.id))}>Remove</button></div>)}
    </div></details>}
    <p>Supported gestures: raise one hand, raise both hands, or wave side to side twice at chest height or higher. Keep shoulders and wrists visible; finger signs are not recognised.</p>
    <p className="camera-note">{simple ? "When you see “One person visible” and “Hand raised”, the camera is ready." : "Approximate position of a visible person, not identity or distance. No video is saved. Moving the camera requires new room zones."}</p>
  </section>;
}
