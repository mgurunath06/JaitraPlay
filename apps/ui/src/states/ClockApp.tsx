import { useEffect, useRef, useState } from "react";
import { quietMimo, reactMimo, speakMimo } from "../components/mimo";
import { VoiceAnswer } from "../voice/VoiceAnswer";
import { clockAngles, clockRound, digitalTime, matchClockAnswer, spokenTime, type ClockLevel, type ClockTime } from "./clock";

export function AnalogClock({ time, revealed = false }: { time: ClockTime; revealed?: boolean }) {
  const angles = clockAngles(time);
  return <svg className="analog-clock" viewBox="0 0 400 400" role="img" aria-label={revealed ? `Clock showing ${spokenTime(time)}` : "Analog clock: short blue hour hand and long orange minute hand"}>
    <circle cx="200" cy="200" r="190" fill="#fffdf5" stroke="#17365d" strokeWidth="8" />
    {Array.from({ length: 60 }, (_, i) => <line key={i} x1="200" y1={i % 5 === 0 ? 24 : 29} x2="200" y2={i % 5 === 0 ? 40 : 35} transform={`rotate(${i * 6} 200 200)`} stroke="#17365d" strokeWidth={i % 5 === 0 ? 4 : 1.5} />)}
    {Array.from({ length: 12 }, (_, i) => { const hour = i + 1, angle = hour * Math.PI / 6; return <text key={hour} x={200 + 140 * Math.sin(angle)} y={200 - 140 * Math.cos(angle)} textAnchor="middle" dominantBaseline="central" fill="#17365d" fontSize="32" fontWeight="700">{hour}</text>; })}
    <line data-testid="hour-hand" x1="200" y1="213" x2="200" y2="110" transform={`rotate(${angles.hour} 200 200)`} stroke="#215aa8" strokeWidth="13" strokeLinecap="round" />
    <line data-testid="minute-hand" x1="200" y1="218" x2="200" y2="75" transform={`rotate(${angles.minute} 200 200)`} stroke="#bd4800" strokeWidth="8" strokeLinecap="round" />
    <circle cx="200" cy="200" r="10" fill="#17365d" />
  </svg>;
}

export function ClockApp({ onBack, voiceAvailable = false }: { onBack: () => void; voiceAvailable?: boolean }) {
  const [level, setLevel] = useState<ClockLevel>("hours");
  const [round, setRound] = useState(() => clockRound("hours"));
  const [number, setNumber] = useState(1);
  const [stars, setStars] = useState(0);
  const [hint, setHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const completed = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => speakMimo("What time does the clock show?"), 0);
    return () => { window.clearTimeout(timer); quietMimo(); };
  }, [number]);
  const next = (difficulty = level) => {
    quietMimo(); setRound(clockRound(difficulty, round.time)); setNumber(n => n + 1);
    setHint(false); setRevealed(false); setFeedback(""); completed.current = false;
  };
  const choose = (answer: string) => {
    if (completed.current) return;
    if (answer === digitalTime(round.time)) {
      completed.current = true; setRevealed(true); setStars(s => s + 1); reactMimo("correct");
      setFeedback(`Yes! It is ${spokenTime(round.time)}.`); speakMimo(`Yes! It is ${spokenTime(round.time)}.`);
    } else {
      setFeedback("Good try. Look at the short hour hand first. You can try again or learn together."); reactMimo("encourage");
    }
  };
  return <section className="panel game-panel clock-game" aria-labelledby="clock-title">
    <div className="game-toolbar"><button className="back-button" onClick={onBack}>← Exit to home</button><h1 id="clock-title">Time with Mimo</h1><span aria-label={`${stars} stars`}>⭐ {stars}</span></div>
    <label>Clock level <select value={level} onChange={e => { const value = e.target.value as ClockLevel; setLevel(value); next(value); }}>
      <option value="hours">Whole hours</option><option value="halves">Half hours</option><option value="quarters">Quarter hours</option><option value="five_minutes">Five-minute steps</option>
    </select></label>
    <h2 className="game-question">What time does the clock show?</h2>
    <button className="hint-button" onClick={() => speakMimo("What time does the clock show?")}>Hear the question</button>
    <AnalogClock time={round.time} revealed={revealed} />
    <p>Short blue hand: hours · Long orange hand: minutes</p>
    <div className="choice-grid">{round.choices.map(time => <button className="choice-button" key={digitalTime(time)} disabled={revealed} onClick={() => choose(digitalTime(time))}>{digitalTime(time)}</button>)}</div>
    {!revealed && voiceAvailable && <VoiceAnswer key={number} constrainRecognition={false} choices={round.choices.map(time => ({ value: digitalTime(time), label: spokenTime(time), color: null }))} onAnswer={choose} onTranscript={text => { const answer = matchClockAnswer(text, round.choices); if (answer) choose(answer); }} />}
    {!revealed && <p>Say the time aloud or tap an answer. A grown-up can help with the microphone.</p>}
    <div className="hint-row"><button className="hint-button" onClick={() => setHint(true)}>Show a hint</button>
      <button className="hint-button" onClick={() => { completed.current = true; setRevealed(true); setFeedback(`Let’s learn together: ${spokenTime(round.time)} (${digitalTime(round.time)}).`); speakMimo(`It is ${spokenTime(round.time)}.`); }}>Let’s learn together</button></div>
    {hint && <p className="game-clue">{round.time.minute === 0 ? "The long hand points to 12: it is a whole hour. Read the short hand." : "Count five minutes for each number the long hand passes after 12. The short hand moves slowly towards the next hour."}</p>}
    {feedback && <p role="status" className="game-feedback">{feedback}</p>}
    <button className="next-button" onClick={() => next()}>{revealed ? "Next clock →" : "Skip this clock →"}</button>
  </section>;
}
