import { useCallback, useEffect, useRef, useState } from "react";
import { speakMimo } from "../components/mimo";
import { readSettings } from "../setup/settings";
import type { Landmark } from "../camera/observe";
import { identityRequest } from "./client";
import { PersonTracker, distance, type Person } from "./tracker";
import type { IdentityProfile } from "./types";

import { ExperimentLog, measuredFaces } from "./experiment";
import { PeoplePanel } from "./PeoplePanel";
import { ExperimentPanel } from "./ExperimentPanel";
import type { FaceObservation } from "./faces";

type Phase = "idle" | "choose" | "confirm" | "capture" | "review";
const prompts = ["Look towards the camera", "Keep looking towards the camera", "Turn your face slightly left", "Hold that gentle left turn", "Turn your face slightly right", "Hold that gentle right turn"];
export function IdentityRoom({ open, paused, quiet, onClose }: { open: boolean; paused: boolean; quiet: boolean; onClose: () => void }) {
  const analysisFrame = useRef<HTMLCanvasElement | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const experiment = useRef(new ExperimentLog());
  const tracker = useRef(new PersonTracker());
  const profile = useRef<IdentityProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [deviceId, setDeviceId] = useState(readSettings().cameraId);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Loading Jaitra’s profile…");
  const [namedTracks, setNamedTracks] = useState<Record<number, string>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const candidate = useRef<number | null>(null);
  const samples = useRef<number[][]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const challenge = useRef(false);
  const nextChallenge = useRef(0);
  const lastGreeting = useRef(-Infinity);
  const wasPresent = useRef(false);
  const lastCaptured = useRef<number[] | null>(null);
  const quietRef = useRef(quiet); quietRef.current = quiet;
  const changePhase = useCallback((value: Phase) => { phaseRef.current = value; setPhase(value); }, []);
  const announce = useCallback((text: string) => { setMessage(text); if (!quietRef.current) speakMimo(text); }, []);

  useEffect(() => {
    let active = true;
    void identityRequest("get").then(result => {
      if (!active) return;
      if (result && "descriptors" in result) { profile.current = result; setSaved(true); setEnabled(true); }
      setLoaded(true); setMessage(result ? "Jaitra’s saved profile is ready." : "A grown-up can help Mimo remember Jaitra.");
    }).catch(() => { if (active) setError("Could not load Jaitra’s profile. Check the core and reopen the app."); });
    const visibility = () => setHidden(document.hidden);
    const settings = () => setDeviceId(readSettings().cameraId);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("jaitra:settings-changed", settings);
    return () => { active = false; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("jaitra:settings-changed", settings); };
  }, []);

  useEffect(() => {
    tracker.current.reset(); setPeople([]); setSelected(null); setNamedTracks({}); setRunning(false);
    challenge.current = false; candidate.current = null; samples.current = []; setCount(0); changePhase("idle");
    window.dispatchEvent(new CustomEvent("jaitra:participant", { detail: null }));
    if (!enabled || paused || hidden || !loaded) return;
    let active = true;
    let stream: MediaStream | undefined;
    let worker: Worker | undefined;
    let timer: number | undefined;
    let watchdog: number | undefined;
    let frameStarted = 0;
    let frameTimestamp = "";
    let lastVideoTime = -1;
    let lastFrameAt = performance.now();
    const canvas = document.createElement("canvas"); analysisFrame.current = canvas; canvas.width = 640; canvas.height = 480;
    const cleanup = () => {
      window.clearTimeout(timer); window.clearTimeout(watchdog);
      stream?.getTracks().forEach(t => t.stop()); worker?.terminate();
      if (video.current) video.current.srcObject = null;
    };
    const fail = () => {
      if (!active) return;
      experiment.current.add({ type: "error", timestamp: new Date().toISOString(), decision: "recognition_stopped" });
      active = false; cleanup(); tracker.current.reset(); setPeople([]); setSelected(null); setRunning(false);
      setError("Recognition stopped. Check camera access and installed models, then pause and resume recognition.");
      window.dispatchEvent(new CustomEvent("jaitra:participant", { detail: null }));
    };
    void (async () => {
      try {
        const faces = await import("./faces");
        await faces.loadFaces();
        if (!active) return;
        // Preserve source detail for reusable evaluation clips. Live face/pose analysis
        // still downsamples every frame to the fixed 640-pixel canvas below.
        stream = await navigator.mediaDevices.getUserMedia({ video: {
          width: { ideal: 1920 }, height: { ideal: 1080 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        }, audio: false });
        if (!active) { cleanup(); return; }
        const element = video.current;
        if (!element) throw new Error("Video unavailable");
        element.srcObject = stream;
        stream.getVideoTracks().forEach(t => t.addEventListener("ended", fail));
        await element.play();
        if (!active) return;
        canvas.height = Math.round(640 * element.videoHeight / element.videoWidth);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        worker = new Worker(new URL("camera/pose-worker.js", new URL(import.meta.env.BASE_URL, window.location.href)));
        worker.onerror = fail;
        const send = async () => {
          if (!active) return;
          try {
            if (element.readyState < 2 || element.currentTime === lastVideoTime) {
              if (performance.now() - lastFrameAt > 3000) { fail(); return; }
              timer = window.setTimeout(() => void send(), 200); return;
            }
            lastVideoTime = element.currentTime; lastFrameAt = performance.now();
            frameStarted = performance.now(); frameTimestamp = new Date().toISOString();
            ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
            const frame = await createImageBitmap(canvas);
            if (!active) { frame.close(); return; }
            worker?.postMessage({ type: "frame", frame, time: performance.now() }, [frame]);
            watchdog = window.setTimeout(fail, 20000);
          } catch { fail(); }
        };
        worker.onmessage = async ({ data }: MessageEvent<{ type: string; landmarks: Landmark[][]; time: number }>) => {
          if (!active) return;
          window.clearTimeout(watchdog);
          if (data.type === "error") { fail(); return; }
          if (data.type === "ready") { setRunning(true); setError(""); void send(); return; }
          if (data.type !== "result") return;
          try {
            // Both detectors see the same captured frame; only one frame is in flight.
            const faceStarted = performance.now();
            let observations: FaceObservation[] = [];
            const found = await faces.detectFaces(canvas, experiment.current.active ? values => { observations = values; } : undefined);
            const faceLatencyMs = performance.now() - faceStarted;
            if (!active) return;
            const now = performance.now();
            const engine = tracker.current;
            const current = engine.update(data.landmarks, found, now, phaseRef.current === "idle" ? profile.current : null);
            setPeople([...current]);
            if (phaseRef.current === "choose") {
              const raised = engine.raisedCandidate(now);
              if (raised) { candidate.current = raised.id; changePhase("confirm"); announce("Please confirm that the highlighted person is Jaitra."); }
            }
            if (["confirm", "capture", "review"].includes(phaseRef.current) && !current.some(p => p.id === candidate.current)) {
              candidate.current = null; samples.current = []; setCount(0); changePhase("choose"); engine.challenge();
              announce("I lost track. Jaitra, lower your hand, then raise it again.");
            }
            if (phaseRef.current === "idle" && profile.current) {
              if (engine.target === null && current.length && now >= nextChallenge.current && !quietRef.current) {
                challenge.current = true; engine.challenge(); nextChallenge.current = now + 30000;
                announce("Is it you, Jaitra? Please lower your hand, then raise it.");
              }
              if (challenge.current && engine.target === null) {
                const raised = engine.raisedCandidate(now);
                if (raised) { engine.select(raised.id); challenge.current = false; }
              }
              const target = current.find(p => p.id === engine.target);
              if (target && !wasPresent.current && now - lastGreeting.current > 60000) {
                lastGreeting.current = now; announce("Hello, Jaitra! Ready to play?");
              }
              wasPresent.current = !!target;
              setSelected(engine.target);
              window.dispatchEvent(new CustomEvent("jaitra:participant", { detail: target ? { name: "Jaitra", trackId: target.id, source: engine.source, pose: target.pose, time: now } : null }));
            }
            if (experiment.current.active) experiment.current.add({ type: "frame", timestamp: frameTimestamp, videoTime: lastVideoTime,
              sourceWidth: element.videoWidth, sourceHeight: element.videoHeight, analysisWidth: canvas.width, analysisHeight: canvas.height,
              latencyMs: performance.now() - frameStarted, faceLatencyMs, phase: phaseRef.current,
              faces: measuredFaces(observations, profile.current),
              people: current.map(p => ({ trackId: p.id, hasFace: !!p.face, matches: p.matches,
                manualLabel: "unlabelled" })),
              decision: engine.target === null ? "uncertain" : engine.source === "gesture" ? "gesture_selected" : "face_track_selected",
              target: engine.target, source: engine.source });
            timer = window.setTimeout(() => void send(), 200);
          } catch { fail(); }
        };
        watchdog = window.setTimeout(fail, 30000);
        worker.postMessage({ type: "init", preferGpu: false });
      } catch { fail(); }
    })();
    return () => { active = false; cleanup(); tracker.current.reset(); window.dispatchEvent(new CustomEvent("jaitra:participant", { detail: null })); };
  }, [enabled, paused, hidden, loaded, deviceId, announce, changePhase]);

  const begin = () => {
    samples.current = []; lastCaptured.current = null; setCount(0); candidate.current = null; tracker.current.reset(); setSelected(null); changePhase("choose");
    window.dispatchEvent(new CustomEvent("jaitra:participant", { detail: null }));
    announce("Jaitra, lower your hand, then raise it and hold it up.");
  };
  const capture = () => {
    const person = tracker.current.people.find(p => p.id === candidate.current);
    if (!person?.face) { setMessage("I need a clear view of Jaitra’s face. Move closer and look towards the camera."); return; }
    if (samples.current.length && distance(samples.current[0], person.face.descriptor) > 0.5) {
      setMessage("This view does not match the first view clearly enough. Face the camera and try again."); return;
    }
    if (lastCaptured.current === person.face.descriptor) { setMessage("Wait for a fresh camera view before capturing again."); return; }
    lastCaptured.current = person.face.descriptor;
    samples.current.push([...person.face.descriptor]); setCount(samples.current.length);
    if (samples.current.length === 6) { changePhase("review"); announce("Six views captured. A grown-up can now save Jaitra’s profile."); }
    else announce(`Jaitra, ${prompts[samples.current.length].toLowerCase()}.`);
  };
  const save = async () => {
    setBusy(true); setError("");
    const next: IdentityProfile = { version: 1, model: "face-api-1.7.15-recognition", name: "Jaitra", descriptors: samples.current.map(s => [...s]) };
    try {
      await identityRequest("save", next); profile.current = next; setSaved(true); changePhase("idle");
      samples.current = []; candidate.current = null; tracker.current.reset(); nextChallenge.current = performance.now() + 5000;
      announce("Jaitra’s profile is saved on this device for future visits.");
    } catch { setError("Could not confirm that the profile was saved. Check the core and try saving again."); }
    finally { setBusy(false); }
  };
  const forget = async () => {
    setBusy(true);
    try {
      await identityRequest("delete"); profile.current = null; setSaved(false); setEnabled(false); setDeleteConfirm(false); setError("");
      setMessage("Jaitra’s saved profile has been deleted.");
    } catch { setError("Could not delete the saved profile. Try again."); }
    finally { setBusy(false); }
  };
  const highlighted = phase === "idle" ? selected : candidate.current;
  const trackedNames = [...new Set(Object.values(namedTracks))];
  return <section className={`identity-room ${open ? "identity-open" : "identity-collapsed"}`} aria-label="Jaitra recognition">
    <div className="identity-status" aria-live="polite">{error ? "Recognition needs attention — open Remember Jaitra" : running ? selected !== null ? "Camera on · Tracking Jaitra" : trackedNames.length ? `Camera on · Tracking ${trackedNames.join(", ")}` : "Camera on · Looking for known people" : saved ? "Jaitra recognition paused" : "Jaitra is not enrolled"}</div>
    {!open && running && selected === null && saved && <p className="identity-prompt" aria-live="polite">{message}</p>}
    <div hidden={!open}>
      <header><h2>Remember Jaitra</h2><button onClick={onClose}>Close</button></header>
      <p>Mimo remembers Jaitra on this device after app restarts. Normal recognition saves no photos or video. The optional camera experiment saves clips only when you start recording. Recognition runs while the app is visible and pauses for other camera views.</p>
      <button disabled={!loaded || busy} onClick={() => { setEnabled(v => !v); setError(""); }}>{enabled ? "Pause recognition" : "Start recognition"}</button>
      <div className="identity-preview">
        <video ref={video} muted playsInline aria-label="Jaitra enrollment camera" />
        {people.map(person => {
          const name = namedTracks[person.id] ?? (person.id === highlighted ? "Jaitra" : "");
          if (!name) return null;
          const suffix = person.id === highlighted && phase !== "idle" ? " · selected for enrollment" : "";
          if (!person.face) return <span key={person.id} className="identity-label identity-track-label"
            aria-label={`${name} tracked; face temporarily hidden`}
            style={{ left: `${(1 - person.x) * 100}%`, top: `${person.y * 100}%` }}>{name} · tracking</span>;
          const face = person.face;
          return <span key={person.id} className={person.id === highlighted ? "identity-face-box selected" : "identity-face-box"}
            aria-label={`${name} face track`}
            style={{ left: `${(1 - face.x - face.width) * 100}%`, top: `${face.y * 100}%`, width: `${face.width * 100}%`, height: `${face.height * 100}%` }}>
            <span>{name}{suffix}</span>
          </span>;
        })}
      </div>
      <PeoplePanel people={people} running={running && phase === "idle"} video={video} frame={analysisFrame} childProfile={profile.current} onNamedTracks={setNamedTracks} />
      <p role="status">{message}</p>
      {error && <p role="alert">{error}</p>}
      {phase === "idle" && <button disabled={!running || busy} onClick={begin}>{saved ? "Enroll Jaitra again" : "Enroll Jaitra"}</button>}
      {phase === "confirm" && <button disabled={busy} onClick={() => { changePhase("capture"); announce(`Jaitra, ${prompts[0].toLowerCase()}.`); }}>This is Jaitra — capture his face views</button>}
      {phase === "capture" && <><p>View {count + 1} of 6: {prompts[count]}</p><button onClick={capture} disabled={!running || busy}>Capture this view</button></>}
      {phase === "review" && <button onClick={() => void save()} disabled={busy || !running}>Save Jaitra for future sessions</button>}
      {phase !== "idle" && <button disabled={busy} onClick={() => { samples.current = []; candidate.current = null; changePhase("idle"); }}>Cancel enrollment</button>}
      {saved && phase === "idle" && <button disabled={busy} onClick={() => setDeleteConfirm(true)}>Forget Jaitra</button>}
      {deleteConfirm && <div><p>Delete Jaitra’s saved recognition profile from this device?</p><button disabled={busy} onClick={() => void forget()}>Yes, delete profile</button><button disabled={busy} onClick={() => setDeleteConfirm(false)}>Keep profile</button></div>}
      <ExperimentPanel video={video} log={experiment.current} profile={profile} />
      <p>A back-only view may need a hand-raise confirmation. The saved profile is never changed by that confirmation.</p>
    </div>
  </section>;
}
