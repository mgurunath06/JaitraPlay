import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { saveGrownUpSettings, type GrownUpSettings } from "./grownUpSettings";

const HOLD_MS = 2000;

export function GrownUpGate({ settings, onChange }: { settings: GrownUpSettings; onChange: (settings: GrownUpSettings) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const start = () => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => { timer.current = null; setOpen(true); }, HOLD_MS);
  };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); start(); }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cancel(); }
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button === 0) start();
  };
  const update = (next: GrownUpSettings) => {
    if (saveGrownUpSettings(next)) { onChange(next); setMessage("Saved on this device."); }
    else setMessage("Could not save settings on this device.");
  };
  return <>
    <button className="grown-up-gear" type="button" aria-label="Hold for two seconds to open grown-up settings" onPointerDown={onPointerDown} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={cancel} onClick={event => event.preventDefault()}>⚙️</button>
    {open && <div className="grown-up-overlay"><section className="grown-up-panel" role="dialog" aria-modal="true" aria-labelledby="grown-up-title">
      <h2 id="grown-up-title">Grown-up settings</h2>
      <p>Choose which extra letter activities appear in ABC Play.</p>
      <label><input type="checkbox" checked={settings.advancedInput} onChange={event => update({ ...settings, advancedInput: event.target.checked })} /> Camera and microphone games <strong>Beta</strong></label>
      <p className="grown-up-note">These input modes are experimental and need a grown-up nearby.</p>
      <label><input type="checkbox" checked={settings.physicalLetters} onChange={event => update({ ...settings, physicalLetters: event.target.checked })} /> Games with real letter cards or labels</label>
      <p role="status">{message}</p>
      <button className="next-button" type="button" onClick={() => { setOpen(false); setMessage(""); }}>Done</button>
    </section></div>}
  </>;
}
