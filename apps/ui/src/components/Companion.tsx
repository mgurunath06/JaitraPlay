import { useEffect, useState } from "react";
import { quietMimo, speakMimo, type MimoMood } from "./mimo";
const messages: Record<MimoMood, string> = {
  greeting: "Hi! I’m Mimo. Let’s play!", start: "Here we go! You’ve got this!",
  correct: "Hooray! Great thinking!", encourage: "Good try! Let’s keep exploring.",
  hint: "Let’s look for a clue together.",
};
export function Companion({ name }: { name: string }) {
  const [reaction, setReaction] = useState<{ mood: MimoMood; turn: number }>({ mood: "greeting", turn: 0 });
  useEffect(() => {
    const react = (event: Event) => {
      const mood = (event as CustomEvent<MimoMood>).detail;
      if (!(mood in messages)) return;
      setReaction(previous => ({ mood, turn: previous.turn + 1 }));
      speakMimo(messages[mood]);
    };
    const hidden = () => { if (document.hidden) quietMimo(); };
    window.addEventListener("mimo:react", react);
    window.addEventListener("jaitra:pause-voice", quietMimo);
    document.addEventListener("visibilitychange", hidden);
    return () => { quietMimo(); window.removeEventListener("mimo:react", react); window.removeEventListener("jaitra:pause-voice", quietMimo); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  return (
    <div className={`companion-wrap mood-${reaction.mood}`} aria-label={`${name}, your play companion`}>
      <div key={reaction.turn} className="companion" aria-hidden="true">
        <span className="ear ear-left" /><span className="ear ear-right" />
        <span className="hand hand-left" /><span className="hand hand-right" />
        <span className="eye eye-left" /><span className="eye eye-right" />
        <span className="smile" />
      </div>
      <span className="companion-name">{name}</span>
      <p className="mimo-bubble" aria-live="polite">{messages[reaction.mood]}</p>
    </div>
  );
}
