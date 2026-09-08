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
  const [word, setWord] = useState("blue");
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
      setVoiceReady(ready); setStatus(ready ? "Microphone recognition is ready." : "Voice recognition is off. Install the speech model and restart the app.");
    }).catch(() => { if (active) setStatus("The app core is not running. Restart the app, then test again."); });
    if (navigator.mediaDevices?.enumerateDevices) void navigator.mediaDevices.enumerateDevices().then(items => { if (active) setDevices(items); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const update = (next: SetupSettings) => {
    try { saveSettings(next); setSettings(next); setMessage("Saved on this device."); }
    catch { setMessage("Could not save setup. Check available storage and try again."); }
  };
  return <div className="setup-overlay">
    <section className="setup-panel" role="dialog" aria-modal="true" aria-labelledby="setup-title" onKeyDown={trapFocus}>
      <header className="setup-header"><div><p className="eyebrow">Quick device check</p><h1 id="setup-title">Voice & camera setup</h1></div><button autoFocus className="back-button" onClick={onClose}>Done</button></header>
      <p>Choose each device and test it once. Audio is captured briefly for local recognition and is not saved. Saved corrections teach word matching, not a new voice model.</p>
      <div className="setup-columns">
        <section aria-labelledby="voice-setup-title">
          <h2 id="voice-setup-title">1. Test the microphone</h2>
          <p>{status}</p>
          <label>Microphone <select value={settings.microphoneId} onChange={event => { update({ ...settings, microphoneId: event.target.value }); setHeard(""); setSuccess(false); }}><option value="">System default</option>{devices.filter(d => d.kind === "audioinput" && d.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${i + 1}`}</option>)}</select></label>
          <label className="microphone-processing"><input type="checkbox" checked={settings.microphoneProcessing === true} onChange={event => update({ ...settings, microphoneProcessing: event.target.checked })} /> Browser noise cleanup (try off for EMEET speakerphones)</label>
          <p>Use the input meter to check that sound reaches the app. If it stays low, check the selected input and Ubuntu input volume. Try both cleanup settings; the device may already process sound.</p>
          <label>Test word <select value={word} onChange={event => { setWord(event.target.value); setHeard(""); setSuccess(false); }}>{words.map(w => <option key={w} value={w}>{w === "mimo" ? "Mimo" : w}</option>)}</select></label>
          <p className="practice-prompt">Press the microphone and say <strong>{word === "mimo" ? "Mimo" : word}</strong> once.</p>
          {voiceReady && <VoiceAnswer key={`${word}-${settings.microphoneId}-${settings.microphoneProcessing}`} constrainRecognition={false} useCorrections={false} choices={[{ value: word === "three" ? "3" : word, label: word, color: null }]} onTranscript={text => { setHeard(text); setSuccess(false); void refreshDevices(); }} onAnswer={() => setSuccess(true)} />}
          {success && <p className="device-success" role="status">✓ Voice recognised correctly.</p>}
          {heard && !success && <div className="teach-word"><p>Heard “{heard}”. If the child really said “{word}”, save this correction.</p><button disabled={!clean(heard) || clean(heard).length > 80 || (words.includes(clean(heard)) && clean(heard) !== word)} onClick={() => {
            update({ ...settings, voiceAliases: { ...settings.voiceAliases, [clean(heard)]: word === "three" ? "3" : word } });
            setHeard("");
          }}>Save correction</button></div>}
          {Object.keys(settings.voiceAliases).length > 0 && <button onClick={() => update({ ...settings, voiceAliases: {} })}>Clear {Object.keys(settings.voiceAliases).length} saved voice fixes</button>}
        </section>
        <section aria-labelledby="camera-setup-title">
          <h2 id="camera-setup-title">2. Test the camera</h2>
          <label>Camera <select value={settings.cameraId} onChange={event => update({ ...settings, cameraId: event.target.value, zones: [] })}><option value="">System default</option>{devices.filter(d => d.kind === "videoinput" && d.deviceId).map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>)}</select></label>
          <p>Press Test camera, stand in the frame, and raise one hand.</p>
          <CameraPanel settings={settings} simple onZones={zones => update({ ...settings, zones })} onStarted={() => void refreshDevices()} />
        </section>
      </div>
      <footer><button onClick={() => void refreshDevices()}>Refresh device list</button><span role="status">{message}</span></footer>
    </section>
  </div>;
}
