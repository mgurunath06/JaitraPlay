import { useEffect, useRef, useState, type RefObject } from "react";
import type { Person } from "./tracker";
import { distance, faceMatches } from "./tracker";
import type { IdentityProfile, PersonProfile } from "./types";
import { identifyPerson, peopleRequest, suggestPerson } from "./people";
import { speakMimo } from "../components/mimo";

const relationships: PersonProfile["relationship"][] = ["father", "mother", "sibling", "grandparent", "relative", "friend", "caregiver", "other"];
export function PeoplePanel({ people, running, video, frame, childProfile, onNamedTracks }: { people: Person[]; running: boolean; video: RefObject<HTMLVideoElement | null>; frame: RefObject<HTMLCanvasElement | null>; childProfile?: IdentityProfile | null; onNamedTracks: (names: Record<number, string>) => void }) {
  const livePeople = useRef(people); livePeople.current = people;
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [suggestion, setSuggestion] = useState<ReturnType<typeof suggestPerson>>();
  const [pending, setPending] = useState<{ trackId: number; portrait: string; descriptor: number[]; suggestion: ReturnType<typeof suggestPerson> }[]>([]);
  const [portrait, setPortrait] = useState<string>("");
  const reviewed = useRef(new Set<number>());
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<PersonProfile["relationship"]>("father");
  const [editing, setEditing] = useState<string>("");
  const [selected, setSelected] = useState<number | null>(null);
  const [rejected, setRejected] = useState<number[]>([]);
  const [samples, setSamples] = useState<number[][]>([]);
  const last = useRef<number[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmed = useRef(new Map<number, { id: string; descriptor: number[] }>());
  const votes = useRef(new Map<number, { id: string; count: number; descriptor?: number[] }>());
  const [recognized, setRecognized] = useState<Record<number, PersonProfile>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frozen, setFrozen] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const load = async () => {
    try {
      const result = await peopleRequest("get");
      if (!Array.isArray(result)) throw new Error("Invalid saved people response");
      setProfiles(result as PersonProfile[]); setReady(true); setStatus("");
    }
    catch { setStatus("Could not load saved people. Retry before enrolling."); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const next: Record<number, PersonProfile> = {};
    const active = new Map<number, { id: string; count: number; descriptor?: number[] }>();
    for (const person of running ? people : []) {
      const confirmation = confirmed.current.get(person.id);
      const manual = confirmation && person.face && distance(confirmation.descriptor, person.face.descriptor) < 0.5
        ? profiles.find(p => p.id === confirmation.id) : undefined;
      if (!manual) confirmed.current.delete(person.id);
      const match = !rejected.includes(person.id) && person.face ? manual ?? identifyPerson(person.face, profiles) : undefined;
      if (!match) continue;
      const previous = votes.current.get(person.id);
      const vote = { id: match.id, descriptor: person.face?.descriptor, count: previous?.id === match.id ? previous.count + (previous.descriptor === person.face?.descriptor ? 0 : 1) : 1 };
      active.set(person.id, vote);
      if (vote.count >= 3) next[person.id] = match;
    }
    // A saved identity cannot identify two visible people at the same time.
    for (const id of confirmed.current.keys()) if (!active.has(id)) confirmed.current.delete(id);
    const assignments = Object.values(next);
    for (const [track, match] of Object.entries(next)) {
      if (assignments.filter(p => p.id === match.id).length > 1) delete next[Number(track)];
    }
    votes.current = active; setRecognized(next);
    onNamedTracks(Object.fromEntries(Object.entries(next).map(([id, p]) => [id, p.name])));
    window.dispatchEvent(new CustomEvent("jaitra:people", { detail: Object.entries(next).map(([trackId, p]) => ({ id: p.id, name: p.name, relationship: p.relationship, trackId: Number(trackId) })) }));
  }, [people, profiles, rejected, running, onNamedTracks]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent("jaitra:people", { detail: [] })); }, []);
  useEffect(() => {
    if (!ready || !running || pending.length >= 20) return;
    const v = frame.current;
    if (!v?.width) return;
    const captures: typeof pending = [];
    for (const person of people) {
      if (!person.face || rejected.includes(person.id) || reviewed.current.has(person.id) || identifyPerson(person.face, profiles) || (childProfile && faceMatches(person.face, childProfile))) continue;
      const f = person.face, crop = document.createElement("canvas");
      crop.width = 240; crop.height = Math.round(240 * f.height / f.width);
      crop.getContext("2d")?.drawImage(v, f.x * v.width, f.y * v.height, f.width * v.width, f.height * v.height, 0, 0, crop.width, crop.height);
      captures.push({ trackId: person.id, portrait: crop.toDataURL("image/jpeg"), descriptor: [...f.descriptor], suggestion: suggestPerson(f, profiles) });
      reviewed.current.add(person.id);
      if (captures.length + pending.length >= 20) break;
    }
    if (captures.length) setPending(current => [...current, ...captures].slice(0, 20));
  }, [people, ready, running, profiles, rejected, frame, pending.length, childProfile]);
  useEffect(() => {
    if (portrait || samples.length || editing || busy || !pending.length) return;
    const capture = pending[0];
    setPortrait(capture.portrait); setSelected(capture.trackId);
    setSamples([capture.descriptor]); last.current = capture.descriptor;
    setSuggestion(capture.suggestion); setName("");
    setPending(current => current.slice(1));
    setStatus("Who is this? Name this captured face and choose their relationship, or mark it as not a person.");
  }, [portrait, samples.length, editing, busy, pending]);
  const add = (descriptor: number[]) => {
    if (last.current === descriptor) { setStatus("Wait for a fresh view."); return; }
    const reference = samples[0] ?? profiles.find(p => p.id === editing)?.descriptors[0];
    if (reference && distance(reference, descriptor) > 0.5) { setStatus("This face does not match the selected profile clearly enough. Check the selection."); return; }
    if (samples.length >= 12) { setStatus("Save these views before adding more."); return; }
    last.current = descriptor; setSamples(current => [...current, [...descriptor]]);
    setStatus("View captured. Try a different angle or distance for the next view.");
  };
  const resetCapture = () => { setSamples([]); last.current = null; };
  const save = async (approved?: PersonProfile) => {
    const existing = approved ?? profiles.find(p => p.id === editing);
    const descriptors = [...(existing?.descriptors ?? []), ...samples].slice(-48);
    if (!(approved?.name ?? name).trim() || descriptors.length < 1) { setStatus("Enter a name and capture a clear face view."); return; }
    const profile: PersonProfile = { id: existing?.id || crypto.randomUUID(), name: approved?.name ?? name.trim(), relationship: approved?.relationship ?? relationship, descriptors, version: 1, model: "face-api-1.7.15-recognition" };
    setBusy(true);
    try { await peopleRequest("save", profile);
      // Publish the explicit confirmation immediately only while the same face is still on this track.
      const live = livePeople.current.find(p => p.id === selected);
      if (live?.face && samples[0] && distance(live.face.descriptor, samples[0]) < 0.5) {
        confirmed.current.set(live.id, { id: profile.id, descriptor: [...samples[0]] });
        votes.current.set(live.id, { id: profile.id, count: 3, descriptor: live.face.descriptor });
        setRecognized(current => ({ ...current, [live.id]: profile }));
        onNamedTracks({ ...Object.fromEntries(Object.entries(recognized).map(([id, p]) => [id, p.name])), [live.id]: profile.name });
      }
      setProfiles(current => [...current.filter(p => p.id !== profile.id), profile]); setEditing(""); setName(""); setPortrait(""); setSuggestion(undefined); resetCapture(); setStatus(`${profile.name} saved as Jaitra’s ${profile.relationship}.`); }
    catch { setStatus("Save failed. Your captured views are still here; retry."); }
    finally { setBusy(false); }
  };
  const father = Object.values(recognized).filter(p => p.relationship === "father");
  return <fieldset className="people-panel" disabled={busy}>
    <legend>Frozen faces to name</legend>
    <p>Each new face appears here while the live video keeps running. Name it and choose its relationship to Jaitra. After saving, its name appears on the tracked face in the video.</p>
    {portrait && <div><img src={portrait} alt="Captured face awaiting a name" style={{ width: 240, maxWidth: "100%" }} /><p>This still image stays here while you enter the name.</p>
      {suggestion && <div>
        <p>{suggestion.confidence}% estimated match confidence: {suggestion.profile.name} — {suggestion.profile.relationship}</p>
        <p>This similarity score is not a calibrated probability. Please check the face.</p>
        <button disabled={!ready} onClick={() => void save(suggestion.profile)}>Approve: this is {suggestion.profile.name}</button>
      </div>}
      <label>Correct identity <select value={editing} onChange={e => {
        const p = profiles.find(p => p.id === e.target.value); setEditing(p?.id ?? ""); setName(p?.name ?? ""); setRelationship(p?.relationship ?? "father");
      }}><option value="">Someone new — enter name below</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.relationship}</option>)}</select></label>
      <button onClick={() => { if (selected !== null) setRejected(current => [...current, selected]); setPortrait(""); resetCapture(); setSelected(null); }}>Not a person / discard face</button>
      <button onClick={() => { setPortrait(""); resetCapture(); setSelected(null); }}>Skip this face</button>
    </div>}
    {pending.length > 0 && <div aria-label="Faces waiting for review"><p>{pending.length} more captured {pending.length === 1 ? "face" : "faces"} waiting for review. The live video continues.</p>{pending.map(p => <img key={p.trackId} src={p.portrait} alt="Queued face awaiting review" width={96} />)}</div>}
    {!ready && <button onClick={() => void load()}>Retry loading people</button>}
    {!portrait && <label>Saved person <select value={editing} onChange={e => {
      const p = profiles.find(p => p.id === e.target.value); setEditing(p?.id ?? ""); setName(p?.name ?? ""); setRelationship(p?.relationship ?? "father"); resetCapture(); setSelected(null); setPortrait("");
    }}><option value="">New person</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name} — {p.relationship} ({p.descriptors.length} views)</option>)}</select></label>}
    <label>Name <input maxLength={64} value={name} onChange={e => setName(e.target.value)} /></label>
    <label>Relationship to Jaitra <select value={relationship} onChange={e => setRelationship(e.target.value as PersonProfile["relationship"])}>{relationships.map(r => <option key={r}>{r}</option>)}</select></label>
    {running && people.filter(p => recognized[p.id]).map(p => <div key={p.id}>
      <button aria-pressed={selected === p.id} disabled={rejected.includes(p.id)} onClick={() => { setSelected(selected === p.id ? null : p.id); resetCapture(); }}>Select {recognized[p.id].name} ({recognized[p.id].relationship})</button>
      <button onClick={() => { setRejected(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id]); if (selected === p.id) { setSelected(null); resetCapture(); } }}>{rejected.includes(p.id) ? "Restore selection" : "Not a person / ignore"}</button>
    </div>)}
    {rejected.length > 0 && <button onClick={() => { for (const id of rejected) reviewed.current.delete(id); setRejected([]); }}>Review ignored tracks again</button>}
    <button disabled={!ready || !running || !people.find(p => p.id === selected)?.face} onClick={() => { const face = people.find(p => p.id === selected)?.face; if (face) add(face.descriptor); }}>Capture selected person’s view</button>
    <button disabled={!running} onClick={() => {
      const v = video.current, c = canvas.current; if (!v || !c) return;
      c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")?.drawImage(v, 0, 0); setFrozen(true);
      setStatus("Draw a box around the missed face in the still image. A clear face is required to save a recognition view.");
    }}>Mark a missed face</button>
    <canvas ref={canvas} hidden={!frozen} style={{ width: "100%", touchAction: "none" }} onPointerDown={e => {
      const c = e.currentTarget, rect = c.getBoundingClientRect(); c.setPointerCapture(e.pointerId);
      start.current = { x: (e.clientX - rect.left) * c.width / rect.width, y: (e.clientY - rect.top) * c.height / rect.height };
    }} onPointerUp={async e => {
      const c = e.currentTarget, rect = c.getBoundingClientRect(), a = start.current; start.current = null; if (!a) return;
      const x = Math.max(0, Math.min(c.width, (e.clientX - rect.left) * c.width / rect.width));
      const y = Math.max(0, Math.min(c.height, (e.clientY - rect.top) * c.height / rect.height));
      const w = Math.abs(x - a.x), h = Math.abs(y - a.y); if (w < 20 || h < 20) return;
      const crop = document.createElement("canvas"); const scale = Math.min(640 / w, 640 / h); crop.width = Math.round(w * scale); crop.height = Math.round(h * scale);
      crop.getContext("2d")?.drawImage(c, Math.min(x, a.x), Math.min(y, a.y), w, h, 0, 0, crop.width, crop.height);
      setBusy(true);
      try { const { detectFaces } = await import("./faces"); const found = await detectFaces(crop); if (found.length === 1) { add(found[0].descriptor); setFrozen(false); } else setStatus("Select exactly one clear face, or capture a closer view."); }
      catch { setStatus("Could not analyze that selection. Try again."); }
      finally { setBusy(false); }
    }} />
    {frozen && <button onClick={() => setFrozen(false)}>Discard manual selection</button>}
    <p>{samples.length} new views captured</p>
    <button onClick={resetCapture} disabled={!samples.length}>Discard captured views</button>
    <button disabled={!ready || !name.trim() || (!editing && samples.length < 1)} onClick={() => void save()}>Save person and relationship</button>
    {editing && <button onClick={async () => { setBusy(true); try { await peopleRequest("delete", editing); setProfiles(current => current.filter(p => p.id !== editing)); setEditing(""); setName(""); resetCapture(); setStatus("Saved person deleted."); } catch { setStatus("Delete failed. Retry."); } finally { setBusy(false); } }}>Forget this person</button>}
    <button disabled={father.length !== 1 || !running} onClick={() => speakMimo("Jaitra, go to Father.")}>Say “Jaitra, go to Father”</button>
    <p>Recognition needs three matching observations. Ignored selections apply to the current track; new tracks need review. Manual face crops save descriptors only. Uncertain or missing people are not used for the Father prompt.</p>
    <p role="status">{status}</p>
  </fieldset>;
}
