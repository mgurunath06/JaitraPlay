import { useEffect, useState } from "react";
import { quietMimo, speakMimo, type MimoMood } from "./mimo";
import type { GeneratedQuestion } from "../../../../packages/contracts/src";
import { AnswerDiscovery } from "./AnswerDiscovery";
const messages: Record<MimoMood, string> = {
  greeting: "Hi! I’m Mimo. Let’s play!", start: "Here we go! You’ve got this!",
  correct: "Hooray! Great thinking!", encourage: "Good try! Let’s keep exploring.",
  hint: "Let’s look for a clue together.",
};
export function Companion({ name }: { name: string }) {
  const [reaction, setReaction] = useState<{ mood: MimoMood; turn: number }>({ mood: "greeting", turn: 0 });
  const [answer, setAnswer] = useState<GeneratedQuestion | null>(null);
  useEffect(() => {
    const react = (event: Event) => {
      const mood = (event as CustomEvent<MimoMood>).detail;
      if (!(mood in messages)) return;
      setReaction(previous => ({ mood, turn: previous.turn + 1 }));
      speakMimo(messages[mood]);
    };
    const hidden = () => { if (document.hidden) quietMimo(); };
    const showAnswer = (event: Event) => setAnswer((event as CustomEvent<GeneratedQuestion>).detail);
    const clearAnswer = () => setAnswer(null);
    window.addEventListener("mimo:react", react);
    window.addEventListener("mimo:answer", showAnswer);
    window.addEventListener("mimo:answer-clear", clearAnswer);
    window.addEventListener("jaitra:pause-voice", quietMimo);
    document.addEventListener("visibilitychange", hidden);
    return () => { quietMimo(); window.removeEventListener("mimo:react", react); window.removeEventListener("mimo:answer", showAnswer); window.removeEventListener("mimo:answer-clear", clearAnswer); window.removeEventListener("jaitra:pause-voice", quietMimo); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  return (
    <div className={`companion-wrap mood-${reaction.mood}`} aria-label={`${name}, your play companion`}>
      <div key={reaction.turn} className="companion" aria-hidden="true">
        {reaction.mood === "correct" && <span className="mimo-celebration">
          {Array.from({ length: 8 }, (_, index) => <span className="mimo-spark" key={index}>⭐</span>)}
        </span>}
        <span className="ear ear-left" /><span className="ear ear-right" />
        <span className="hand hand-left" /><span className="hand hand-right" />
        <span className="eye eye-left" /><span className="eye eye-right" />
        <span className="smile" />
      </div>
      <span className="companion-name">{name}</span>
      <p className="mimo-bubble" aria-live="polite">{messages[reaction.mood]}</p>
      {answer && <AnswerDiscovery question={answer} />}
    </div>
  );
}
