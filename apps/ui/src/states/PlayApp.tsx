import { clearMimoAnswer, reactMimo, showMimoAnswer } from "../components/mimo";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GeneratedQuestion, RiddleTopic } from "../../../../packages/contracts/src";
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

const RIDDLE_TOPICS: { id: RiddleTopic; label: string }[] = [
  { id: "objects", label: "Everyday objects" },
  { id: "riddles", label: "Food & nature riddles" },
  { id: "colours", label: "Colours" },
  { id: "geography", label: "Geography" },
  { id: "patterns", label: "Numbers & patterns" },
];
type TopicMix = Record<RiddleTopic, number>;
const DEFAULT_MIX: TopicMix = { objects: 35, riddles: 20, colours: 15, geography: 10, patterns: 20 };
const MIX_STORAGE_KEY = "jaitra-riddle-topic-mix";

function validMix(value: unknown): value is TopicMix {
  if (typeof value !== "object" || value === null) return false;
  const mix = value as Record<string, unknown>;
  return RIDDLE_TOPICS.every(({ id }) => typeof mix[id] === "number" && Number.isInteger(mix[id]) && mix[id] >= 0 && mix[id] <= 100)
    && RIDDLE_TOPICS.reduce((sum, { id }) => sum + Number(mix[id]), 0) === 100;
}

function storedMix(): TopicMix {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(MIX_STORAGE_KEY) ?? "null");
    if (validMix(value)) return value;
  } catch { /* Use the default mix when storage is unavailable. */ }
  return DEFAULT_MIX;
}

function chooseTopic(mix: TopicMix, counts: TopicMix): RiddleTopic {
  const total = RIDDLE_TOPICS.reduce((sum, { id }) => sum + counts[id], 0);
  return RIDDLE_TOPICS.filter(({ id }) => mix[id] > 0).reduce((best, item) =>
    (total + 1) * mix[item.id] / 100 - counts[item.id] > (total + 1) * mix[best.id] / 100 - counts[best.id] ? item : best
  ).id;
}

export function PlayApp({ activity, onBack, voiceAvailable = false }: { activity: PlayableActivity; onBack: () => void; voiceAvailable?: boolean }) {
  const isRiddle = activity.activityId === "riddle_guess";
  const [mix, setMix] = useState<TopicMix>(storedMix);
  const [draftMix, setDraftMix] = useState<TopicMix>(mix);
  const mixRef = useRef(mix);
  const topicCounts = useRef<TopicMix>({ objects: 0, riddles: 0, colours: 0, geography: 0, patterns: 0 });
  const [showTopics, setShowTopics] = useState(isRiddle);
  const [started, setStarted] = useState(!isRiddle);
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const recentPrompts = useRef<string[]>([]);
  const requestSequence = useRef(0);
  const [loading, setLoading] = useState(!isRiddle);
  const [error, setError] = useState(false);
  const [round, setRound] = useState(1);
  const [stars, setStars] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);

  const loadQuestion = useCallback(async (previousPrompt: string | null, neededHint: boolean) => {
    const sequence = ++requestSequence.current;
    const topic = isRiddle ? chooseTopic(mixRef.current, topicCounts.current) : undefined;
    setLoading(true);
    setError(false);
    try {
      const next = await coreClient.getQuestion(activity.activityId, {
        previousPrompt,
        neededHint,
        recentPrompts: recentPrompts.current,
        ...(topic ? { topic } : {}),
      });
      if (sequence !== requestSequence.current) return;
      setQuestion(next);
      if (topic) topicCounts.current[topic] += 1;
      recentPrompts.current = [...recentPrompts.current, next.prompt].slice(-10);
      setHintUsed(false);
    } catch {
      if (sequence === requestSequence.current) setError(true);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [activity.activityId, isRiddle]);

  useEffect(() => {
    // Defer one tick so StrictMode's discarded effect does not generate a paid round.
    if (!started) return;
    const timer = window.setTimeout(() => void loadQuestion(null, false), 0);
    return () => { window.clearTimeout(timer); requestSequence.current += 1; };
  }, [loadQuestion, started]);

  const saveTopics = () => {
    if (!validMix(draftMix)) return;
    setMix(draftMix);
    mixRef.current = draftMix;
    topicCounts.current = { objects: 0, riddles: 0, colours: 0, geography: 0, patterns: 0 };
    try { window.localStorage.setItem(MIX_STORAGE_KEY, JSON.stringify(draftMix)); } catch { /* The current game still uses the choice. */ }
    setShowTopics(false);
    if (!started) setStarted(true);
  };

  const next = () => {
    reactMimo("start");
    clearMimoAnswer();
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
      onTopics={isRiddle ? () => { setDraftMix(mix); setShowTopics(true); } : undefined}
    >
      {showTopics && <div className="topic-menu" aria-label="Riddle topics">
        <h2>Choose your topics</h2>
        <p>Set an approximate mix for the next questions. Use 0% to leave a topic out.</p>
        {RIDDLE_TOPICS.map(({ id, label }) => <label className="topic-row" key={id}>
          <span>{label}</span>
          <input type="number" min="0" max="100" step="5" value={draftMix[id]} onChange={(event) => setDraftMix((current) => ({ ...current, [id]: event.target.value === "" ? NaN : Number(event.target.value) }))} />
          <span>%</span>
        </label>)}
        <p className="topic-total" role="status">Total: {RIDDLE_TOPICS.reduce((sum, { id }) => sum + (Number.isFinite(draftMix[id]) ? draftMix[id] : 0), 0)}% · Must equal 100%</p>
        <div className="topic-actions">
          {started && <button type="button" className="secondary-button" onClick={() => setShowTopics(false)}>Keep playing</button>}
          <button type="button" className="next-button" disabled={!validMix(draftMix)} onClick={saveTopics}>{started ? "Save mix" : "Start playing"}</button>
        </div>
      </div>}
      {!showTopics && <>
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
        ) : (
          <QuizRound voiceAvailable={voiceAvailable} activityId={activity.activityId} question={question} hintUsed={hintUsed} onHint={() => { reactMimo("hint"); setHintUsed(true); }} onCorrect={() => setStars((value) => value + 1)} onNext={next} />
        )
      )}
      </>}
    </GameShell>
  );
}

function QuizRound({ activityId, question, hintUsed, onHint, onCorrect, onNext, voiceAvailable }: { voiceAvailable: boolean; activityId: string; question: GeneratedQuestion; hintUsed: boolean; onHint: () => void; onCorrect: () => void; onNext: () => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const correct = choice === question.answer;
  const choose = (value: string) => {
    if (choice !== null) return;
    setChoice(value);
    showMimoAnswer(question);
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
            <button key={item.value} type="button" className={`choice-button ${selected ? "selected" : ""} ${answer ? "correct" : ""}`} disabled={choice !== null} onClick={() => choose(item.value)} aria-label={`Option ${index + 1}: ${item.label}`}>
              <span className="choice-number" aria-hidden="true">{index + 1}</span>
              {item.color ? <span className="colour-swatch" style={/[●■▲★]/u.test(item.label) ? { color: item.color, backgroundColor: "transparent", fontSize: "5rem" } : { backgroundColor: item.color }} aria-hidden="true">{/[●■▲★]/u.test(item.label) ? item.label : ""}</span> : <span className={`choice-label ${/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+$/u.test(item.label) ? "is-picture" : ""}`}>{item.label}</span>}
              {!colourGame && <span className="sr-only">{item.value}</span>}
            </button>
          );
        })}
      </div>
      {choice === null && voiceAvailable && <VoiceAnswer choices={question.choices} numberChoices onAnswer={choose} />}
      {choice !== null && (
        <div className={`game-feedback ${correct ? "success" : "try-again"}`} role="status">
          <span><strong>{correct ? "Brilliant! ⭐" : "Good try!"}</strong> {question.explanation}</span>
          <button type="button" className="next-button" onClick={onNext}>Next question →</button>
        </div>
      )}
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
      <button className="primary" onClick={() => { showMimoAnswer(question); reactMimo("correct"); setFound(true); }}>I found one!</button>
      <button className="back-button" onClick={onNext}>Skip this hunt</button>
    </> : <div className="game-feedback success" role="status">
      <span>{question.explanation}</span>
      <button className="next-button" onClick={onNext}>Next adventure →</button>
    </div>}
  </div>;
}

function GameShell({ activity, round, stars, provider, onBack, onTopics, children }: { activity: PlayableActivity; round: number; stars: number; provider: GeneratedQuestion["provider"] | null; onBack: () => void; onTopics?: () => void; children: ReactNode }) {
  const providerLabel = provider === null ? "CHECKING" : PROVIDER_LABELS[provider];
  return (
    <section className="panel game-panel" aria-labelledby="game-title">
      <div className="game-toolbar">
        <button className="back-button game-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Exit to home</button>
        <span className="game-name" id="game-title"><span aria-hidden="true">{activity.icon}</span> {activity.title}</span>
        <span className="game-status">
          {onTopics && <button className="topic-button" type="button" onClick={onTopics}>⚙ Topics</button>}
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
