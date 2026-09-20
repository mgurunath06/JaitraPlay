import { clearMimoAnswer, quietMimo, speakMimo } from "../components/mimo";
import { useEffect, useRef, useState } from "react";
import { PlayApp, type PlayableActivity } from "./PlayApp";
import { ClockApp } from "./ClockApp";
import { StorybookApp } from "./StorybookApp";
import { MemoryApp } from "./MemoryApp";
import { LettersWorld } from "./LettersWorld";
import { GrownUpGate } from "./GrownUpGate";
import { readGrownUpSettings } from "./grownUpSettings";

interface Activity extends PlayableActivity {
  activityId: string;
  title: string;
  description: string;
  icon: string;
  availability: "AVAILABLE" | "COMING_SOON";
}

const LETTER_IDS = new Set(["air_writing", "body_letters", "sound_hunt", "co_reading", "two_letter_words", "letter_labels", "word_cards"]);
const ABC_ACTIVITY: Activity = { activityId: "abc_play", title: "ABC Play", description: "Find letters, hear sounds and build words.", icon: "🔤", availability: "AVAILABLE" };
const SHELF_SECTIONS = [
  { id: "guessing", title: "Guessing Games", icon: "✨", games: ["picture_guess", "memory_cards", "riddle_guess"] },
  { id: "letters", title: "Letters & Numbers", icon: "🔤", games: ["abc_play", "counting_numbers", "shapes_sorting"] },
  { id: "songs", title: "Songs & Kindness", icon: "🎵", games: ["rhyme_time", "good_manners", "animal_sounds"] },
  { id: "stories", title: "Stories & Time", icon: "📖", games: ["storybook", "tell_time", "daily_routine"] },
];

export function Hub({ activities, voiceAvailable = false, onPlayingChange, onStoryReadingChange, homeRequest }: { activities: Activity[]; voiceAvailable?: boolean; onPlayingChange: (playing: boolean) => void; onStoryReadingChange?: (reading: boolean) => void; homeRequest: number }) {
  const [selected, setSelected] = useState<Activity | null>(null);
  const [grownUpSettings, setGrownUpSettings] = useState(readGrownUpSettings);
  const lastSpoken = useRef({ id: "", time: 0 });
  const letterActivities = activities.filter(activity => LETTER_IDS.has(activity.activityId));
  const shelfActivities = activities.filter(activity => !LETTER_IDS.has(activity.activityId));
  if (letterActivities.length && !shelfActivities.some(activity => activity.activityId === "abc_play")) shelfActivities.push(ABC_ACTIVITY);
  const sections = SHELF_SECTIONS.map(section => ({ ...section, activities: section.games.map(id => shelfActivities.find(activity => activity.activityId === id)).filter((activity): activity is Activity => Boolean(activity)) }));
  const visibleSections = sections.filter(section => !grownUpSettings.hiddenSections.includes(section.id)).map(section => ({ ...section, activities: section.activities.filter(activity => !grownUpSettings.hiddenGames.includes(activity.activityId)) })).filter(section => section.activities.length);
  const visibleCount = visibleSections.reduce((count, section) => count + section.activities.length, 0);
  const announce = (activity: Activity) => {
    const now = Date.now();
    if (lastSpoken.current.id === activity.activityId && now - lastSpoken.current.time < 900) return;
    lastSpoken.current = { id: activity.activityId, time: now };
    speakMimo(activity.title);
  };

  useEffect(() => { onPlayingChange(Boolean(selected)); return () => onPlayingChange(false); }, [selected, onPlayingChange]);
  useEffect(() => { setSelected(null); quietMimo(); clearMimoAnswer(); }, [homeRequest]);
  if (selected) {
    if (selected.activityId === "abc_play") return <LettersWorld activities={letterActivities} settings={grownUpSettings} voiceAvailable={voiceAvailable} onBack={() => { quietMimo(); setSelected(null); }} />;
    if (selected.activityId === "tell_time") return <ClockApp voiceAvailable={voiceAvailable} onBack={() => { quietMimo(); setSelected(null); }} />;
    if (selected.activityId === "storybook") {
      return <StorybookApp voiceAvailable={voiceAvailable} onReadingChange={onStoryReadingChange} onBack={() => { quietMimo(); setSelected(null); }} />;
    }
    if (selected.activityId === "memory_cards") return <MemoryApp onBack={() => { quietMimo(); setSelected(null); }} />;
    return <PlayApp voiceAvailable={voiceAvailable} activity={selected} onBack={() => { quietMimo(); clearMimoAnswer(); setSelected(null); }} />;
  }

  return (
    <section className="panel hub" aria-labelledby="games-title">
      <div className="hub-heading">
        <div>
          <p className="eyebrow">Mimo’s playroom</p>
          <h1 id="games-title">Choose an app</h1>
        </div>
        <span className="app-count" aria-label={`${visibleCount} apps`}>
          {visibleCount} apps
        </span>
      </div>
      <GrownUpGate settings={grownUpSettings} onChange={setGrownUpSettings} sections={sections.map(section => ({ id: section.id, title: section.title, activities: section.activities.map(activity => ({ id: activity.activityId, title: activity.title })) }))} />
      {visibleSections.map(section => <section className="shelf-section" aria-labelledby={`shelf-${section.id}`} key={section.id}>
        <h2 id={`shelf-${section.id}`}>{section.icon} {section.title}</h2>
        <div className="activity-grid shelf-grid">{section.activities.map((activity, index) => {
          const available = activity.availability === "AVAILABLE";
          return (
            <button
              className={`activity-card activity-card-${index + 1}`}
              key={activity.activityId}
              type="button"
              disabled={!available}
              onFocus={() => announce(activity)}
              onClick={() => { announce(activity); setSelected(activity); }}
              aria-label={`${activity.title}, ${available ? "available" : "coming soon"}`}
            >
              <span className="activity-card-top">
                <span className="activity-icon" aria-hidden="true">{activity.icon}</span>
                <span className={`availability ${available ? "available" : "soon"}`}>
                  {available ? "Open" : "Soon"}
                </span>
              </span>
              <span className="activity-title">{activity.title}</span>
              <span className="activity-description">{activity.description}</span>
            </button>
          );
        })}</div>
      </section>)}
      {!visibleCount && <p className="shelf-empty">No games are showing. A grown-up can use ⚙️ to turn them on.</p>}
    </section>
  );
}
