import { useCallback, useEffect, useState } from "react";
import type { StateSnapshot } from "../../../../packages/contracts/src";
import { Companion } from "../components/Companion";
import { Hub } from "../states/Hub";
import { Recovery } from "../states/Recovery";
import { coreClient } from "./coreClient";

const RETRY_MILLISECONDS = 2000;

export function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [recovering, setRecovering] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await coreClient.getSnapshot();
      setSnapshot(next);
      setRecovering(false);
    } catch {
      setRecovering(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), RETRY_MILLISECONDS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const command = async (type: "BEGIN_INTERACTION" | "WELCOME_COMPLETE") => {
    try {
      await coreClient.sendCommand(type);
      await refresh();
    } catch {
      setRecovering(true);
    }
  };

  if (recovering || snapshot?.payload.appState === "RECOVERY") return <Recovery />;
  if (!snapshot) return <Recovery message="Mimo is waking up…" />;

  const { appState, childDisplayName, companionName, activities } = snapshot.payload;
  return (
    <main className="stage">
      <Companion name={companionName} />
      {appState === "IDLE" && (
        <section className="panel" aria-labelledby="welcome-title">
          <p className="eyebrow">Hello, {childDisplayName}!</p>
          <h1 id="welcome-title">Ready to play?</h1>
          <button className="primary" onClick={() => void command("BEGIN_INTERACTION")}>
            Let’s play
          </button>
        </section>
      )}
      {appState === "WELCOME" && (
        <section className="panel" aria-labelledby="hello-title">
          <p className="eyebrow">I’m {companionName}</p>
          <h1 id="hello-title">Let’s find something fun!</h1>
          <button className="primary" onClick={() => void command("WELCOME_COMPLETE")}>
            Show my games
          </button>
        </section>
      )}
      {appState === "HUB" && <Hub activities={activities} />}
    </main>
  );
}
