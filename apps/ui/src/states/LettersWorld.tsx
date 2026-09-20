import { useState } from "react";
import { clearMimoAnswer, reactMimo, speakMimo } from "../components/mimo";
import { PlayApp, type PlayableActivity } from "./PlayApp";
import { getAbcQuestion, abcQuestionSpeech, type TapMode } from "./abcQuestions";
import type { GrownUpSettings } from "./grownUpSettings";
import { AirWritingApp, BodyLettersApp, CoReadingApp, LetterLabelsApp, SoundHuntApp, TwoLetterWordsApp, WordCardsApp } from "./LiteracyApps";

interface LettersWorldProps {
  activities: PlayableActivity[];
  settings: GrownUpSettings;
  voiceAvailable: boolean;
  onBack: () => void;
}

const LADDER: { activityId: TapMode | "abc_words"; title: string; description: string; icon: string }[] = [
  { activityId: "abc_letters", title: "Find a Letter", description: "Listen and tap the letter.", icon: "🔠" },
  { activityId: "abc_sounds", title: "Hear a Sound", description: "Tap the letter that makes it.", icon: "👂" },
  { activityId: "abc_blend", title: "Blend Sounds", description: "Put two sounds together.", icon: "🔤" },
  { activityId: "abc_words", title: "Build a Word", description: "Tap letters in the right order.", icon: "🧩" },
];
const BETA_IDS = ["air_writing", "body_letters", "sound_hunt", "co_reading", "two_letter_words"];
const PHYSICAL_IDS = ["letter_labels", "word_cards"];

export function LettersWorld({ activities, settings, voiceAvailable, onBack }: LettersWorldProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const backToWorld = () => { clearMimoAnswer(); setSelected(null); };

  if (selected === "abc_words") return <WordBuilder onBack={backToWorld} />;
  const tapActivity = LADDER.find(activity => activity.activityId === selected);
  if (tapActivity && tapActivity.activityId !== "abc_words") {
    return <PlayApp key={tapActivity.activityId} activity={tapActivity} onBack={backToWorld} questionLoader={getAbcQuestion} questionSpeech={abcQuestionSpeech} />;
  }
  if (selected === "air_writing" && settings.advancedInput) return <AirWritingApp onBack={backToWorld} />;
  if (selected === "body_letters" && settings.advancedInput) return <BodyLettersApp onBack={backToWorld} />;
  if (selected === "sound_hunt" && settings.advancedInput) return <SoundHuntApp voiceAvailable={voiceAvailable} onBack={backToWorld} />;
  if (selected === "co_reading" && settings.advancedInput) return <CoReadingApp voiceAvailable={voiceAvailable} onBack={backToWorld} />;
  if (selected === "two_letter_words" && settings.advancedInput) return <TwoLetterWordsApp voiceAvailable={voiceAvailable} onBack={backToWorld} />;
  if (selected === "letter_labels" && settings.physicalLetters) return <LetterLabelsApp onBack={backToWorld} />;
  if (selected === "word_cards" && settings.physicalLetters) return <WordCardsApp onBack={backToWorld} />;

  const extras = activities.filter(activity =>
    (settings.advancedInput && BETA_IDS.includes(activity.activityId))
    || (settings.physicalLetters && PHYSICAL_IDS.includes(activity.activityId))
  );

  return <section className="panel hub letters-world" aria-labelledby="letters-world-title">
    <div className="hub-heading">
      <div><p className="eyebrow">One step at a time</p><h1 id="letters-world-title">ABC Play</h1></div>
      <button className="back-button game-back" type="button" onClick={onBack}>← All games</button>
    </div>
    <p className="letters-intro">Tap your way from letters to little words.</p>
    <div className="letters-ladder">
      {LADDER.map((mode, index) => <button className="activity-card letter-mode-card" type="button" key={mode.activityId} onClick={() => { reactMimo("start"); setSelected(mode.activityId); }}>
        <span className="letter-step">Step {index + 1}</span>
        <span className="activity-icon" aria-hidden="true">{mode.icon}</span>
        <span className="activity-title">{mode.title}</span>
        <span className="activity-description">{mode.description}</span>
      </button>)}
    </div>
    {extras.length > 0 && <section className="letters-extras" aria-label="Extra letter activities">
      <h2>More ways to play</h2>
      <div className="activity-grid">
        {extras.map(activity => <button className="activity-card" type="button" key={activity.activityId} onClick={() => setSelected(activity.activityId)}>
          <span className="activity-icon" aria-hidden="true">{activity.icon}</span>
          <span className="activity-title">{activity.title}</span>
          <span className="activity-description">{activity.description}</span>
          <span className="letter-mode-badge">{BETA_IDS.includes(activity.activityId) ? "Beta" : "Needs real letters"}</span>
        </button>)}
      </div>
    </section>}
  </section>;
}

const WORDS = ["cat", "sun", "map", "bed", "cup", "dog", "hen", "top"];

function WordBuilder({ onBack }: { onBack: () => void }) {
  const [round, setRound] = useState(0);
  const [built, setBuilt] = useState("");
  const word = WORDS[round % WORDS.length];
  const choices = [...word, ...["e", "o", "s"].filter(letter => !word.includes(letter)).slice(0, 2)];
  const rotated = [...choices.slice(round % choices.length), ...choices.slice(0, round % choices.length)];
  const complete = built.length === word.length;
  const correct = built === word;
  const tap = (letter: string) => {
    if (complete) return;
    const next = built + letter;
    setBuilt(next);
    if (next.length === word.length) reactMimo(next === word ? "correct" : "encourage");
  };
  return <section className="panel game-panel literacy-game" aria-labelledby="build-word-title">
    <div className="game-toolbar"><button className="back-button game-back" type="button" onClick={onBack}>← ABC Play</button><span className="game-name" id="build-word-title">🧩 Build a Word</span><span /></div>
    <p className="eyebrow">Step 4 · Tap the letters in order</p>
    <h1 className="word-blend">{word.toUpperCase()}</h1>
    <button className="hint-button" type="button" onClick={() => speakMimo(`Build the word ${word}.`)}>🔊 Hear Mimo</button>
    <div className="built-word" aria-label={`Letters chosen: ${built || "none"}`}>{word.split("").map((_, index) => <span key={index}>{built[index]?.toUpperCase() ?? "_"}</span>)}</div>
    <div className="letter-card-grid">{rotated.map(letter => <button key={letter} type="button" disabled={complete || built.includes(letter)} onClick={() => tap(letter)}>{letter.toUpperCase()}</button>)}</div>
    {complete && <p role="status">{correct ? `You built ${word.toUpperCase()}! ⭐` : "Good try! Look at the word and try again."}</p>}
    <div className="literacy-actions"><button className="secondary-button" type="button" onClick={() => setBuilt("")}>Start again</button><button className="next-button" type="button" disabled={!correct} onClick={() => { setRound(value => value + 1); setBuilt(""); }}>Next word →</button></div>
  </section>;
}
