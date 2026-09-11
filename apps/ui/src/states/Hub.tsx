import { quietMimo, reactMimo } from "../components/mimo";
import { useEffect, useState } from "react";
import { PlayApp, type PlayableActivity } from "./PlayApp";
import { ClockApp } from "./ClockApp";
import { StorybookApp } from "./StorybookApp";

interface Activity extends PlayableActivity {
  activityId: string;
  title: string;
  description: string;
  icon: string;
  availability: "AVAILABLE" | "COMING_SOON";
}

export function Hub({ activities, voiceAvailable = false, onPlayingChange, onStoryReadingChange, homeRequest }: { activities: Activity[]; voiceAvailable?: boolean; onPlayingChange: (playing: boolean) => void; onStoryReadingChange?: (reading: boolean) => void; homeRequest: number }) {
  const [selected, setSelected] = useState<Activity | null>(null);

  useEffect(() => { onPlayingChange(Boolean(selected)); return () => onPlayingChange(false); }, [selected, onPlayingChange]);
  useEffect(() => { setSelected(null); quietMimo(); }, [homeRequest]);
  if (selected) {
    if (selected.activityId === "tell_time") return <ClockApp voiceAvailable={voiceAvailable} onBack={() => { quietMimo(); setSelected(null); }} />;
    if (selected.activityId === "storybook") {
      return <StorybookApp voiceAvailable={voiceAvailable} onReadingChange={onStoryReadingChange} onBack={() => { quietMimo(); setSelected(null); }} />;
    }
    return <PlayApp voiceAvailable={voiceAvailable} activity={selected} onBack={() => { quietMimo(); setSelected(null); }} />;
  }

  return (
    <section className="panel hub" aria-labelledby="games-title">
      <div className="hub-heading">
        <div>
          <p className="eyebrow">Mimo’s playroom</p>
          <h1 id="games-title">Choose an app</h1>
        </div>
        <span className="app-count" aria-label={`${activities.length} apps`}>
          {activities.length} apps
        </span>
      </div>
      <div className="activity-grid">
        {activities.map((activity, index) => {
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
