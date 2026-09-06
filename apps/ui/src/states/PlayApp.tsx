import { reactMimo } from "../components/mimo";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GeneratedQuestion } from "../../../../packages/contracts/src";
import { VoiceAnswer } from "../voice/VoiceAnswer";
import { coreClient } from "../app/coreClient";

export interface PlayableActivity {
  activityId: string;
  title: string;
  description: string;
  icon: string;
}

const PROVIDER_LABELS: Record<GeneratedQuestion["provider"], string> = {
  mwapi: "MWAPI",
  startupapi: "STARTUPAPI",
  openrouter: "OPENROUTER",
  local: "LOCAL",
};

export function PlayApp({ activity, onBack, voiceAvailable = false }: { activity: PlayableActivity; onBack: () => void; voiceAvailable?: boolean }) {
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const recentPrompts = useRef<string[]>([]);
  const requestSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [round, setRound] = useState(1);
  const [stars, setStars] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);

  const loadQuestion = useCallback(async (previousPrompt: string | null, neededHint: boolean) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(false);
    try {
      const next = await coreClient.getQuestion(activity.activityId, {
        previousPrompt,
        neededHint,
        recentPrompts: recentPrompts.current,
      });
      if (sequence !== requestSequence.current) return;
      setQuestion(next);
      recentPrompts.current = [...recentPrompts.current, next.prompt].slice(-10);
      setHintUsed(false);
    } catch {
      if (sequence === requestSequence.current) setError(true);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [activity.activityId]);

  useEffect(() => {
    // Defer one tick so StrictMode's discarded effect does not generate a paid round.
    const timer = window.setTimeout(() => void loadQuestion(null, false), 0);
    return () => { window.clearTimeout(timer); requestSequence.current += 1; };
  }, [loadQuestion]);

  const next = () => {
    reactMimo("start");
    const previous = question?.prompt ?? null;
    setQuestion(null);
    setRound((value) => value + 1);
    void loadQuestion(previous, hintUsed);
  };

  return (
    <GameShell
      activity={activity}
      round={round}
      stars={stars}
      provider={question?.provider ?? null}
      onBack={onBack}
    >
      {loading && <LoadingRound />}
      {error && (
        <div className="question-error" role="alert">
          <span aria-hidden="true">🌧️</span>
          <h2>Mimo needs a tiny moment</h2>
          <p>The question helpers are reconnecting.</p>
          <button className="next-button" type="button" onClick={() => void loadQuestion(question?.prompt ?? null, hintUsed)}>Try again</button>
        </div>
      )}
      {!loading && !error && question && (
        question.kind === "room_hunt" ? (
          <RoomHunt question={question} onNext={next} />
        ) : activity.activityId === "memory_cards" ? (
          <MemoryRound question={question} hintUsed={hintUsed} onHint={() => { reactMimo("hint"); setHintUsed(true); }} onComplete={() => setStars((value) => value + 1)} onNext={next} />
        ) : (
          <QuizRound voiceAvailable={voiceAvailable} activityId={activity.activityId} question={question} hintUsed={hintUsed} onHint={() => { reactMimo("hint"); setHintUsed(true); }} onCorrect={() => setStars((value) => value + 1)} onNext={next} />
        )
      )}
    </GameShell>
  );
}

function QuizRound({ activityId, question, hintUsed, onHint, onCorrect, onNext, voiceAvailable }: { voiceAvailable: boolean; activityId: string; question: GeneratedQuestion; hintUsed: boolean; onHint: () => void; onCorrect: () => void; onNext: () => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const correct = choice === question.answer;
  const choose = (value: string) => {
    if (choice !== null) return;
    setChoice(value);
    reactMimo(value === question.answer ? "correct" : "encourage");
    if (value === question.answer) onCorrect();
  };
  const colourGame = activityId === "colours_shapes";

  return (
    <>
      <h2 className="game-question">{question.prompt}</h2>
      <div className="hint-row">
        {!hintUsed ? <button className="hint-button" type="button" onClick={onHint}>💡 Show a hint</button> : <p className="game-clue">💡 {question.hint}</p>}
      </div>
      <div className={`choice-grid ${colourGame ? "colour-grid" : ""} ${activityId === "picture_guess" ? "picture-grid" : ""}`}>
        {question.choices.map((item, index) => {
          const selected = choice === item.value;
          const answer = choice !== null && item.value === question.answer;
          return (
            <button key={item.value} type="button" className={`choice-button ${selected ? "selected" : ""} ${answer ? "correct" : ""}`} disabled={choice !== null} onClick={() => choose(item.value)} aria-label={colourGame ? `Colour choice ${index + 1}` : item.label}>
              {item.color ? <span className="colour-swatch" style={/[●■▲★]/u.test(item.label) ? { color: item.color, backgroundColor: "transparent", fontSize: "5rem" } : { backgroundColor: item.color }} aria-hidden="true">{/[●■▲★]/u.test(item.label) ? item.label : ""}</span> : <span className={`choice-label ${/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+$/u.test(item.label) ? "is-picture" : ""}`}>{item.label}</span>}
              {!colourGame && <span className="sr-only">{item.value}</span>}
            </button>
          );
        })}
      </div>
      {choice === null && voiceAvailable && <VoiceAnswer choices={question.choices} onAnswer={choose} />}
      {choice !== null && (
        <div className={`game-feedback ${correct ? "success" : "try-again"}`} role="status">
          <span><strong>{correct ? "Brilliant! ⭐" : "Good try!"}</strong> {question.explanation}</span>
          <button type="button" className="next-button" onClick={onNext}>Next question →</button>
        </div>
      )}
    </>
  );
}

function MemoryRound({ question, hintUsed, onHint, onComplete, onNext }: { question: GeneratedQuestion; hintUsed: boolean; onHint: () => void; onComplete: () => void; onNext: () => void }) {
  const [cards] = useState(() => {
    const deck = question.choices.flatMap((item) => [item, item]);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  });
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [scored, setScored] = useState(false);
  const complete = matched.length === cards.length;

  const turn = (index: number) => {
    if (complete || matched.includes(index) || open.includes(index)) return;
    const first = open.length === 1 ? open : [];
    const nextOpen = [...first, index];
    setOpen(nextOpen);
    if (nextOpen.length === 2 && cards[nextOpen[0]].value === cards[nextOpen[1]].value) {
      const nextMatched = [...matched, ...nextOpen];
      setMatched(nextMatched);
      setOpen([]);
      if (nextMatched.length === cards.length && !scored) {
        setScored(true);
        reactMimo("correct");
        onComplete();
      }
    }
  };

  return (
    <>
      <h2 className="game-question">{question.prompt}</h2>
      <div className="hint-row">
        {!hintUsed ? <button className="hint-button" type="button" onClick={onHint}>💡 Show a hint</button> : <p className="game-clue">💡 {question.hint}</p>}
      </div>
      <div className="memory-grid">
        {cards.map((card, index) => {
          const visible = open.includes(index) || matched.includes(index);
          return <button key={`${card.value}-${index}`} type="button" className={`memory-card ${visible ? "visible" : ""}`} onClick={() => turn(index)} aria-label={visible ? card.label : `Hidden card ${index + 1}`}><span aria-hidden="true">{visible ? card.label : "?"}</span></button>;
        })}
      </div>
      {complete && <div className="game-feedback success" role="status"><strong>You found every pair! ⭐</strong><button type="button" className="next-button" onClick={onNext}>New matching game →</button></div>}
    </>
  );
}

function RoomHunt({ question, onNext }: { question: GeneratedQuestion; onNext: () => void }) {
  const [found, setFound] = useState(false);
  return <div className="room-hunt">
    <p className="eyebrow">Look around you</p>
    <h2 className="game-question">{question.prompt}</h2>
    <p>{question.hint}</p>
    {!found ? <>
      <button className="primary" onClick={() => { reactMimo("correct"); setFound(true); }}>I found one!</button>
      <button className="back-button" onClick={onNext}>Skip this hunt</button>
    </> : <div className="game-feedback success" role="status">
      <span>{question.explanation}</span>
      <button className="next-button" onClick={onNext}>Next adventure →</button>
    </div>}
  </div>;
}

function GameShell({ activity, round, stars, provider, onBack, children }: { activity: PlayableActivity; round: number; stars: number; provider: GeneratedQuestion["provider"] | null; onBack: () => void; children: ReactNode }) {
  const providerLabel = provider === null ? "CHECKING" : PROVIDER_LABELS[provider];
  return (
    <section className="panel game-panel" aria-labelledby="game-title">
      <div className="game-toolbar">
        <button className="back-button game-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Exit to home</button>
        <span className="game-name" id="game-title"><span aria-hidden="true">{activity.icon}</span> {activity.title}</span>
        <span className="game-status">
          <span className="provider-indicator" aria-label={`Question API: ${providerLabel}`}>API · {providerLabel}</span>
          <span className="score" aria-label={`${stars} stars`}>⭐ {stars}</span>
        </span>
      </div>
      <div className="endless-progress">Question {round} · Keep playing as long as you like</div>
      {children}
    </section>
  );
}

function LoadingRound() {
  return <div className="loading-round" role="status"><span aria-hidden="true">✨</span><h2>Mimo is making a new question…</h2></div>;
}
