import { useEffect, useState, type KeyboardEvent } from "react";
import { CameraPanel } from "../camera/CameraPanel";
import { VoiceAnswer } from "../voice/VoiceAnswer";
import { clean } from "../voice/match";
import { coreClient } from "../app/coreClient";
import { readSettings, saveSettings, type SetupSettings } from "./settings";

export function trapFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']");
  const first = items[0], last = items[items.length - 1];
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
const words = ["mimo", "blue", "red", "three", "elephant", "circle"];
export function SetupPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(readSettings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [status, setStatus] = useState("Checking voice recognition…");
  const [message, setMessage] = useState("");
  const [word, setWord] = useState(words[0]);
  const [heard, setHeard] = useState("");
  const [success, setSuccess] = useState(false);
  const refreshDevices = async () => {
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); }
    catch { setMessage("Device list unavailable. Check microphone and camera permissions."); }
  };
  useEffect(() => {
    let active = true;
    void coreClient.getSnapshot().then(snapshot => {
      if (!active) return;
      const ready = snapshot.payload.capabilities.voice === "AVAILABLE";
      setVoiceReady(ready); setStatus(ready ? "Local voice recognition ready" : "Voice is not ready. Install the speech model, enable voice in config.yaml, and restart the core.");
    }).catch(() => { if (active) setStatus("Cannot reach the core. Start it, then reopen Setup to retry voice practice."); });
    if (navigator.mediaDevices?.enumerateDevices) void navigator.mediaDevices.enumerateDevices().then(items => { if (active) setDevices(items); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const update = (next: SetupSettings) => {
    try { saveSettings(next); setSettings(next); setMessage("Saved on this device."); }
    catch { setMessage("Could not save setup. Check available storage and try again."); }
  };
  return <div className="setup-overlay">
    <section className="setup-panel" role="dialog" aria-modal="true" aria-labelledby="setup-title" onKeyDown={trapFocus}>
      <header className="setup-header"><div><p className="eyebrow">Grown-up controls</p><h1 id="setup-title">Voice & camera setup</h1></div><button autoFocus className="back-button" onClick={onClose}>Close setup</button></header>
      <p>Practise from the usual playing spot. Save word corrections and mark room zones. Audio and video are not recorded to disk.</p>
      <div className="setup-columns">
        <section aria-labelledby="voice-setup-title">
          <h2 id="voice-setup-title">Voice practice & corrections</h2>
          <p>{status}</p>
          <label>Microphone <select value={settings.microphoneId} onChange={event => { update({ ...settings, microphoneId: event.target.value }); setHeard(""); setSuccess(false); }}><option value="">System default</option>{devices.filter(d => d.kind === "audioinput" && d.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${i + 1}`}</option>)}</select></label>
          <label>Practice word <select value={word} onChange={event => { setWord(event.target.value); setHeard(""); setSuccess(false); }}>{words.map(w => <option key={w} value={w}>{w === "mimo" ? "Mimo" : w}</option>)}</select></label>
          <p className="practice-prompt">Say: <strong>{word === "mimo" ? "Mimo" : word}</strong></p>
          {voiceReady && <VoiceAnswer key={`${word}-${settings.microphoneId}`} useCorrections={false} choices={[{ value: word === "three" ? "3" : word, label: word, color: null }]} onTranscript={text => { setHeard(text); setSuccess(false); void refreshDevices(); }} onAnswer={() => setSuccess(true)} />}
          {success && <p role="status">Recognised and confirmed. Try another word.</p>}
          {heard && <div className="teach-word"><p>Only if the child said “{word}”: save “{heard}” as that answer?</p><button disabled={!clean(heard) || clean(heard).length > 80 || (words.includes(clean(heard)) && clean(heard) !== word)} onClick={() => {
            update({ ...settings, voiceAliases: { ...settings.voiceAliases, [clean(heard)]: word === "three" ? "3" : word } });
            setHeard("");
          }}>Teach this answer</button></div>}
          <p>Teaching saves an exact word correction, not a new speech model. Only saved corrections are retained; practice transcripts are otherwise discarded.</p>
          <p>{Object.keys(settings.voiceAliases).length} saved corrections</p>
          <button onClick={() => update({ ...settings, voiceAliases: {} })}>Clear voice corrections</button>
        </section>
        <section aria-labelledby="camera-setup-title">
          <h2 id="camera-setup-title">Camera, room zones & gestures</h2>
          <label>Camera <select value={settings.cameraId} onChange={event => update({ ...settings, cameraId: event.target.value, zones: [] })}><option value="">System default</option>{devices.filter(d => d.kind === "videoinput" && d.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>)}</select></label>
          <label>Camera processing <select value={settings.preferGpu ? "gpu" : "cpu"} onChange={event => update({ ...settings, preferGpu: event.target.value === "gpu" })}><option value="cpu">CPU — development or any machine</option><option value="gpu">Try GPU, fall back to CPU</option></select></label>
          <p>Raise one hand, both hands, or wave side to side. Include only one person for unambiguous feedback.</p>
          <CameraPanel settings={settings} onZones={zones => update({ ...settings, zones })} onStarted={() => void refreshDevices()} />
        </section>
      </div>
      <footer><button onClick={() => void refreshDevices()}>Refresh devices</button><span role="status">{message}</span><p>After setup, use Camera view on the home screen to check gestures. Inside a game, Exit to home brings you back here.</p></footer>
    </section>
  </div>;
}
