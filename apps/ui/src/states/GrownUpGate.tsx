import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { saveGrownUpSettings, type GrownUpSettings } from "./grownUpSettings";
import { readRiddleMix, RIDDLE_TOPICS, saveRiddleMix, validMix, type TopicMix } from "./riddleMix";

const HOLD_MS = 2000;
interface ShelfSection { id: string; title: string; activities: { id: string; title: string }[] }

export function GrownUpGate({ settings, onChange, sections = [] }: { settings: GrownUpSettings; onChange: (settings: GrownUpSettings) => void; sections?: ShelfSection[] }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [mix, setMix] = useState<TopicMix>(readRiddleMix);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gear = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const close = () => { setOpen(false); setMessage(""); gear.current?.focus(); };
  const start = () => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => { timer.current = null; setMix(readRiddleMix()); setOpen(true); }, HOLD_MS);
  };
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  useEffect(() => { if (open) dialog.current?.focus(); }, [open]);
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
  const toggle = (key: "hiddenGames" | "hiddenSections", id: string, show: boolean) => {
    const current = settings[key];
    update({ ...settings, [key]: show ? current.filter(value => value !== id) : [...new Set([...current, id])] });
  };
  const trapKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
    if (!focusable?.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const total = RIDDLE_TOPICS.reduce((sum, topic) => sum + (Number.isFinite(mix[topic.id]) ? mix[topic.id] : 0), 0);
  return <>
    <button ref={gear} className="grown-up-gear" type="button" aria-label="Hold for two seconds to open grown-up settings" onPointerDown={onPointerDown} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={cancel} onClick={event => event.preventDefault()}>⚙️</button>
    {open && <div className="grown-up-overlay"><section ref={dialog} tabIndex={-1} className="grown-up-panel" role="dialog" aria-modal="true" aria-labelledby="grown-up-title" onKeyDown={trapKeys}>
      <h2 id="grown-up-title">Grown-up settings</h2>
      <div className="grown-up-settings-scroll">
        <section className="grown-up-setting-group" aria-labelledby="mix-title">
          <h3 id="mix-title">Guess It! topic mix</h3>
          <p>Choose approximately how often each kind of question appears. The total must be 100%.</p>
          {RIDDLE_TOPICS.map(topic => <label className="topic-row" key={topic.id}><span>{topic.label}</span><input type="number" min="0" max="100" step="1" value={Number.isFinite(mix[topic.id]) ? mix[topic.id] : ""} onChange={event => setMix(current => ({ ...current, [topic.id]: event.target.value === "" ? NaN : Number(event.target.value) }))} aria-label={`${topic.label} percent`} /><span>%</span></label>)}
          <p className="topic-total" role="status">Total: {total}%</p>
          <button className="next-button" type="button" disabled={!validMix(mix)} onClick={() => setMessage(saveRiddleMix(mix) ? "Topic mix saved on this device." : "Could not save topic mix on this device.")}>Save topic mix</button>
        </section>
        <section className="grown-up-setting-group" aria-labelledby="games-title-settings">
          <h3 id="games-title-settings">Games on the shelf</h3>
          {sections.map(section => <div className="grown-up-shelf-group" key={section.id}>
            <label><input type="checkbox" checked={!settings.hiddenSections.includes(section.id)} onChange={event => toggle("hiddenSections", section.id, event.target.checked)} /> Show {section.title} section</label>
            {section.activities.map(activity => <label className="grown-up-game-toggle" key={activity.id}><input type="checkbox" checked={!settings.hiddenGames.includes(activity.id)} onChange={event => toggle("hiddenGames", activity.id, event.target.checked)} /> Show {activity.title}</label>)}
          </div>)}
        </section>
        <section className="grown-up-setting-group" aria-labelledby="letters-title-settings">
          <h3 id="letters-title-settings">ABC Play extras</h3>
          <label><input type="checkbox" checked={settings.advancedInput} onChange={event => update({ ...settings, advancedInput: event.target.checked })} /> Camera and microphone games <strong>Beta</strong></label>
          <p className="grown-up-note">These input modes are experimental and need a grown-up nearby.</p>
          <label><input type="checkbox" checked={settings.physicalLetters} onChange={event => update({ ...settings, physicalLetters: event.target.checked })} /> Games with real letter cards or labels</label>
        </section>
      </div>
      <p role="status">{message}</p>
      <button className="next-button" type="button" onClick={close}>Done</button>
    </section></div>}
  </>;
}
