import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GeneratedQuestion } from "../../../../packages/contracts/src";
import { coreClient } from "../app/coreClient";
import { CameraPanel } from "../camera/CameraPanel";
import type { Landmark, Observation } from "../camera/observe";
import { speakMimo } from "../components/mimo";
import { readSettings } from "../setup/settings";
import { clean } from "../voice/match";
import { recordVoice } from "../voice/record";
import { VoiceAnswer } from "../voice/VoiceAnswer";
import { AIR_LETTERS, airWritingScore, BODY_LETTERS, BUILD_WORDS, focusTokens, letterChoices, matchesBodyLetter, TWO_LETTER_WORDS, wristPoint } from "./literacy";

function Shell({ title, icon, onBack, children }: { title: string; icon: string; onBack: () => void; children: ReactNode }) {
  return <section className="panel game-panel literacy-game"><div className="game-toolbar">
    <button className="back-button game-back" onClick={onBack}>← Exit to home</button><span className="game-name">{icon} {title}</span><span />
  </div>{children}</section>;
}

function SpeechTry({ prompt, onHeard, disabled = false }: { prompt: string; onHeard: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle"|"listening"|"processing">("idle");
  const [message, setMessage] = useState("");
  const capture = useRef<Awaited<ReturnType<typeof recordVoice>> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const cancel = () => { clearTimeout(timer.current); controller.current?.abort(); capture.current?.cancel(); capture.current = null; };
    const hidden = () => { if (document.hidden) { cancel(); setState("idle"); } };
    document.addEventListener("visibilitychange", hidden);
    return () => { cancel(); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  const stop = async () => {
    const recording = capture.current, current = controller.current; if (!recording || !current) return;
    clearTimeout(timer.current); capture.current = null; setState("processing");
    try { const audio = await recording.stop(); const result = await coreClient.transcribe(audio); if (current.signal.aborted) return; setMessage(`I heard “${result.text}”.`); onHeard(result.text); }
    catch { if (!current.signal.aborted) setMessage("I could not hear that clearly. Try again or use the grown-up button."); }
    finally { if (!current.signal.aborted) setState("idle"); }
  };
  const start = async () => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current; setMessage("");
    try { setState("listening"); capture.current = await recordVoice(current.signal); if (current.signal.aborted) { capture.current.cancel(); capture.current = null; return; } timer.current = setTimeout(() => void stop(), 6500); }
    catch { if (!current.signal.aborted) { setState("idle"); setMessage("The microphone is not ready. You can still use the grown-up button."); } }
  };
  return <div className="voice-answer"><button className="hint-button" disabled={disabled || state === "processing"} onClick={() => void (state === "listening" ? stop() : start())}>{state === "listening" ? "Stop and check" : state === "processing" ? "Checking…" : `🎤 ${prompt}`}</button>{state === "listening" && <p>Listening…</p>}{message && <p role="status">{message}</p>}</div>;
}

export function AirWritingApp({ onBack }: { onBack: () => void }) {
  const [round, setRound] = useState(0), [drawing, setDrawing] = useState(false), [points, setPoints] = useState<{x:number;y:number}[]>([]), [message, setMessage] = useState("Start the camera, then trace the glowing letter with one hand.");
  const letter = AIR_LETTERS[round % AIR_LETTERS.length];
  const onPoses = useCallback((poses: Landmark[][]) => { if (!drawing) return; const point = wristPoint(poses); if (point) setPoints(current => [...current.slice(-159), point]); }, [drawing]);
  const finish = () => { const score = airWritingScore(letter, points); setDrawing(false); setMessage(score >= .48 ? `Lovely ${letter.toUpperCase()}! Your path matched ${Math.round(score * 100)}%.` : `Good try. Your path matched ${Math.round(score * 100)}%. Try together or accept the effort.`); };
  const next = () => { setRound(value => value + 1); setPoints([]); setDrawing(false); setMessage("Trace the new letter with one hand."); };
  return <Shell title="Air Writing" icon="✍️" onBack={onBack}><h1 className="literacy-letter">{letter}</h1><p className="game-question">Write “{letter}” in the air</p>
    <svg className="air-writing-board" viewBox="0 0 100 100" aria-label="Your glowing hand trail"><text x="50" y="75" textAnchor="middle">{letter}</text>{points.length > 1 && <polyline points={points.map(p => `${p.x*100},${p.y*100}`).join(" ")} />}</svg>
    <div className="literacy-actions"><button className="primary compact" onClick={() => { setPoints([]); setDrawing(true); speakMimo(`Write the letter ${letter}.`); }}>Start trail</button><button className="secondary-button" disabled={!drawing || points.length < 6} onClick={finish}>Finish drawing</button><button className="secondary-button" onClick={next}>Looks good — next →</button></div><p role="status">{message}</p><CameraPanel settings={readSettings()} simple onPoses={onPoses} /></Shell>;
}

export function SoundHuntApp({ onBack, voiceAvailable }: { onBack: () => void; voiceAvailable: boolean }) {
  const sounds = focusTokens(readSettings().weeklyFocus ?? "").filter(value => value.length === 1); if (!sounds.length) sounds.push("b","m","s","c","t");
  const [round, setRound] = useState(0), [message, setMessage] = useState("Find it in the room, bring it back, and say its name."); const sound = sounds[round % sounds.length];
  const check = (text: string) => { const words = clean(text).split(" "); const correct = words.some(word => word.startsWith(sound)); setMessage(correct ? `Yes — I heard a ${sound.toUpperCase()} sound!` : `I did not catch a ${sound.toUpperCase()} word. That is okay; try once more or let a grown-up confirm.`); if (correct) speakMimo("You found one!"); };
  return <Shell title="Sound Hunt" icon="🔎" onBack={onBack}><h1 className="literacy-letter">{sound.toUpperCase()}</h1><h2 className="game-question">Find something that starts with “{sound}”</h2><p>For example, “buh” for B. Voice helps, but it never blocks the game.</p>{voiceAvailable && <SpeechTry key={round} prompt="Say what you found" onHeard={check} />}<div className="literacy-actions"><button className="secondary-button" onClick={() => setMessage("A grown-up confirmed it. Great finding!")}>Grown-up: correct</button><button className="primary compact" onClick={() => { setRound(v=>v+1); setMessage("Find the next sound in the room."); }}>Next sound →</button></div><p role="status">{message}</p></Shell>;
}

const READ_PAGES = [
  ["a", "Mimo sees a red kite."], ["is", "The little moon is bright."], ["it", "It can hop over a log."], ["we", "We play in the garden."], ["my", "My blue cup is here."], ["go", "Go, little boat, go!"], ["he", "He can pat the cat."], ["up", "Look up at the stars."],
] as const;
export function CoReadingApp({ onBack, voiceAvailable }: { onBack: () => void; voiceAvailable: boolean }) {
  const focus = focusTokens(readSettings().weeklyFocus ?? ""); const pages = [...READ_PAGES].sort(([a],[b]) => Number(focus.includes(b)) - Number(focus.includes(a)));
  const [page, setPage] = useState(0), [read, setRead] = useState(false), [message, setMessage] = useState("Mimo reads the sentence and stops at your big word."); const [word, sentence] = pages[page % pages.length];
  const parts = sentence.split(new RegExp(`(\\b${word}\\b)`, "i")); const accept = (heard?: string) => { if (heard && !clean(heard).split(" ").includes(word)) { setMessage(`I heard “${heard}”. Try ${word.toUpperCase()} once more, or use the grown-up button.`); return; } speakMimo(sentence); setRead(true); setMessage(`You read “${word}” with Mimo!`); };
  return <Shell title="Read With Mimo" icon="📚" onBack={onBack}><p className="co-reading-sentence">{parts.map((part,index) => clean(part) === word ? <mark key={index}>{part}</mark> : part)}</p><p className="game-question">Your word is <strong>{word.toUpperCase()}</strong></p>{voiceAvailable && <SpeechTry key={`${page}-${read}`} prompt="Read the big word" onHeard={accept} disabled={read} />}<div className="literacy-actions"><button className="secondary-button" onClick={() => speakMimo(`${parts[0]} Your turn: read the big word.`)}>Read with Mimo</button><button className="secondary-button" onClick={() => accept()}>Grown-up: word read</button><button className="primary compact" disabled={!read} onClick={() => { setPage(v=>v+1); setRead(false); setMessage("Now read the new big word."); }}>Next page →</button></div><p role="status">{message}</p></Shell>;
}

export function LetterLabelsApp({ onBack }: { onBack: () => void }) {
  const settings = readSettings(), zones = settings.zones; const [round,setRound] = useState(0), [done,setDone] = useState(false), [message,setMessage] = useState(zones.length ? "Start the camera and walk to the named label." : "A grown-up must add and name room zones in Setup first."); const zone = zones[round % Math.max(1,zones.length)];
  const observe = useCallback((observation: Observation) => { if (zone && observation.zone === zone.name) { setDone(true); setMessage(`You reached ${zone.name}. Read the printed label aloud!`); } }, [zone]);
  return <Shell title="Letter Labels Around the Room" icon="🏷️" onBack={onBack}>{zone ? <><h1 className="zone-word">{zone.name.toUpperCase()}</h1><h2 className="game-question">Go and stand next to the word “{zone.name}”</h2><CameraPanel settings={settings} simple onObservation={observe} /><div className="literacy-actions"><button className="secondary-button" onClick={() => {setDone(true);setMessage("A grown-up confirmed the right label.");}}>Grown-up: correct place</button><button className="primary compact" disabled={!done} onClick={() => {setRound(v=>v+1);setDone(false);setMessage("Walk to the next printed word.");}}>Next label →</button></div></> : <p className="question-error">Open Setup, mark floor zones near labelled objects such as DOOR, FAN, BED or CUPBOARD, then return.</p>}<p role="status">{message}</p></Shell>;
}

export function BodyLettersApp({ onBack }: { onBack: () => void }) {
  const [round,setRound] = useState(0), [done,setDone] = useState(false), [message,setMessage] = useState("Start the camera and make the letter with your whole body."); const letter=BODY_LETTERS[round%BODY_LETTERS.length];
  const poses = useCallback((value: Landmark[][]) => { if (!done && matchesBodyLetter(letter,value)) { setDone(true); setMessage(`I can see a body letter ${letter}!`); speakMimo("Wonderful body letter!"); } }, [done,letter]);
  return <Shell title="Body Letters" icon="🤸" onBack={onBack}><h1 className="literacy-letter">{letter}</h1><h2 className="game-question">Make a {letter} with your body</h2><CameraPanel settings={readSettings()} simple onPoses={poses}/><div className="literacy-actions"><button className="secondary-button" onClick={()=>{setDone(true);setMessage("Great shape — a grown-up confirmed it.");}}>Grown-up: looks right</button><button className="primary compact" disabled={!done} onClick={()=>{setRound(v=>v+1);setDone(false);setMessage("Make the next letter.");}}>Next letter →</button></div><p role="status">{message}</p></Shell>;
}

export function TwoLetterWordsApp({ onBack, voiceAvailable }: { onBack: () => void; voiceAvailable: boolean }) {
  const focus=focusTokens(readSettings().weeklyFocus??""); const words=[...TWO_LETTER_WORDS].sort(([a],[b])=>Number(focus.includes(b))-Number(focus.includes(a))); const [round,setRound]=useState(0),[answer,setAnswer]=useState(""); const [word,label]=words[round%words.length];
  const raw=[word,...words.filter(([value])=>value!==word).slice(round%5,round%5+3).map(([value])=>value)]; const shift=(round*3+1)%raw.length;
  const choices: GeneratedQuestion["choices"]=[...raw.slice(shift),...raw.slice(0,shift)].map(value=>({value,label:value.toUpperCase(),color:null}));
  const choose=(value:string)=>{setAnswer(value);speakMimo(value===word?`${word}. You blended it!`:"Good try. Stretch the two sounds together.");};
  return <Shell title="Two-Letter Word Builder" icon="🔤" onBack={onBack}><h1 className="word-blend">{word[0]}… {word[1]}… <strong>{word}</strong></h1><h2 className="game-question">Which word matches “{label}”?</h2><div className="choice-grid">{choices.map((choice,index)=><button className={`choice-button ${answer===choice.value?(choice.value===word?"correct":"selected"):""}`} key={choice.value} onClick={()=>choose(choice.value)}><span className="choice-number">{index+1}</span>{choice.label}</button>)}</div>{voiceAvailable&&<VoiceAnswer choices={choices} numberChoices onAnswer={choose}/>}<div className="literacy-actions"><button className="primary compact" disabled={answer!==word} onClick={()=>{setRound(v=>v+1);setAnswer("");}}>Next word →</button></div></Shell>;
}

export function WordCardsApp({ onBack }: { onBack: () => void }) {
  const focus=focusTokens(readSettings().weeklyFocus??"").filter(v=>v.length>=2); const words=focus.length?focus:BUILD_WORDS; const [round,setRound]=useState(0),[built,setBuilt]=useState<string[]>([]),[message,setMessage]=useState("Lay out your printed or magnetic letters, then tap the same letters here in order."); const word=words[round%words.length].slice(0,4); const letters=letterChoices(word,round); const correct=built.join("")===word;
  return <Shell title="Build It With Letter Cards" icon="🧩" onBack={onBack}><h2 className="game-question">Build <strong>{word.toUpperCase()}</strong> with real letter cards</h2><div className="built-word">{word.split("").map((_,i)=><span key={i}>{built[i]?.toUpperCase()??"_"}</span>)}</div><div className="letter-card-grid">{letters.map((letter,index)=><button key={letter} disabled={built.length>=word.length} onClick={()=>setBuilt(v=>[...v,letter])}><span className="choice-number">{index+1}</span>{letter.toUpperCase()}</button>)}</div><div className="literacy-actions"><button className="secondary-button" onClick={()=>setBuilt([])}>Start again</button><button className="secondary-button" onClick={()=>window.print()}>Print letter cards</button><button className="primary compact" disabled={!correct} onClick={()=>{setRound(v=>v+1);setBuilt([]);setMessage("Build the next word with your real cards.");}}>Grown-up: cards match — next →</button></div><p role="status">{correct?"The letters are in the right order. Now check the real cards — brilliant building!":message}</p><details><summary>Camera check</summary><p>Place the real cards where a grown-up can see them. A grown-up checks the physical cards. Automatic card recognition is not available.</p><CameraPanel settings={readSettings()} simple/></details><div className="printable-letter-cards" aria-hidden="true">{"abcdefghijklmnopqrstuvwxyz".split("").map(letter=><span key={letter}>{letter.toUpperCase()}</span>)}</div></Shell>;
}
