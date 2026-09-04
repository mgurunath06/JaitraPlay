import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { GeneratedQuestion } from "../../../../packages/contracts/src";
import { coreClient } from "../app/coreClient";

export interface PlayableActivity {
  activityId: string;
  title: string;
  description: string;
  icon: string;
}

export function PlayApp({ activity, onBack }: { activity: PlayableActivity; onBack: () => void }) {
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [round, setRound] = useState(1);
  const [stars, setStars] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);

  const loadQuestion = useCallback(async (previousPrompt: string | null, neededHint: boolean) => {
    setLoading(true);
    setError(false);
    try {
      const next = await coreClient.getQuestion(activity.activityId, {
        previousPrompt,
        neededHint,
        recentPrompts,
      });
      setQuestion(next);
      setRecentPrompts((items) => [...items, next.prompt].slice(-10));
      setHintUsed(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [activity.activityId, recentPrompts]);

  useEffect(() => {
    void loadQuestion(null, false);
  }, [activity.activityId]);

  const next = () => {
    const previous = question?.prompt ?? null;
    setQuestion(null);
    setRound((value) => value + 1);
    void loadQuestion(previous, hintUsed);
  };

  return (
    <GameShell activity={activity} round={round} stars={stars} onBack={onBack}>
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
        activity.activityId === "memory_cards" ? (
          <MemoryRound question={question} hintUsed={hintUsed} onHint={() => setHintUsed(true)} onComplete={() => setStars((value) => value + 1)} onNext={next} />
        ) : (
          <QuizRound activityId={activity.activityId} question={question} hintUsed={hintUsed} onHint={() => setHintUsed(true)} onCorrect={() => setStars((value) => value + 1)} onNext={next} />
        )
      )}
    </GameShell>
  );
}

function QuizRound({ activityId, question, hintUsed, onHint, onCorrect, onNext }: { activityId: string; question: GeneratedQuestion; hintUsed: boolean; onHint: () => void; onCorrect: () => void; onNext: () => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const correct = choice === question.answer;
  const choose = (value: string) => {
    if (choice !== null) return;
    setChoice(value);
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
              {item.color ? <span className="colour-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" /> : <span>{item.label}</span>}
              {!colourGame && <span className="sr-only">{item.value}</span>}
            </button>
          );
        })}
      </div>
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
  const cards = question.choices.flatMap((item) => [item, item]);
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

function GameShell({ activity, round, stars, onBack, children }: { activity: PlayableActivity; round: number; stars: number; onBack: () => void; children: ReactNode }) {
  return (
    <section className="panel game-panel" aria-labelledby="game-title">
      <div className="game-toolbar">
        <button className="back-button game-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Apps</button>
        <span className="game-name" id="game-title"><span aria-hidden="true">{activity.icon}</span> {activity.title}</span>
        <span className="score" aria-label={`${stars} stars`}>⭐ {stars}</span>
      </div>
      <div className="endless-progress">Question {round} · Keep playing as long as you like</div>
      {children}
    </section>
  );
}

function LoadingRound() {
  return <div className="loading-round" role="status"><span aria-hidden="true">✨</span><h2>Mimo is making a new question…</h2></div>;
}
