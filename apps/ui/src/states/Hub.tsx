import { clearMimoAnswer, quietMimo, reactMimo } from "../components/mimo";
import { useEffect, useState } from "react";
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

export function Hub({ activities, voiceAvailable = false, onPlayingChange, onStoryReadingChange, homeRequest }: { activities: Activity[]; voiceAvailable?: boolean; onPlayingChange: (playing: boolean) => void; onStoryReadingChange?: (reading: boolean) => void; homeRequest: number }) {
  const [selected, setSelected] = useState<Activity | null>(null);
  const [grownUpSettings, setGrownUpSettings] = useState(readGrownUpSettings);
  const letterActivities = activities.filter(activity => LETTER_IDS.has(activity.activityId));
  const shelfActivities = activities.filter(activity => !LETTER_IDS.has(activity.activityId));
  if (letterActivities.length && !shelfActivities.some(activity => activity.activityId === "abc_play")) shelfActivities.push(ABC_ACTIVITY);

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
        <span className="app-count" aria-label={`${shelfActivities.length} apps`}>
          {shelfActivities.length} apps
        </span>
      </div>
      <GrownUpGate settings={grownUpSettings} onChange={setGrownUpSettings} />
      <div className="activity-grid">
        {shelfActivities.map((activity, index) => {
          const available = activity.availability === "AVAILABLE";
          return (
            <button
              className={`activity-card activity-card-${index + 1}`}
              key={activity.activityId}
              type="button"
              disabled={!available}
              onClick={() => { reactMimo("start"); setSelected(activity); }}
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
        })}
      </div>
    </section>
  );
}
