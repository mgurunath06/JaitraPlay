import { useCallback, useEffect, useState } from "react";
import type { StateSnapshot } from "../../../../packages/contracts/src";
import { reactMimo } from "../components/mimo";
import { Companion } from "../components/Companion";
import { Hub } from "../states/Hub";
import { Recovery } from "../states/Recovery";
import { SetupPanel } from "../setup/SetupPanel";
import { CameraPanel } from "../camera/CameraPanel";
import { IdentityRoom } from "../identity/IdentityRoom";
import { readSettings } from "../setup/settings";
import { coreClient } from "./coreClient";
import jaitraLabsLogo from "../../../../docs/jl logo.jpg";

const RETRY_MILLISECONDS = 2000;
const SPLASH_MILLISECONDS = 1600;

export function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [homeRequest, setHomeRequest] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [cameraView, setCameraView] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSplashVisible(false), SPLASH_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (setupOpen || confirmExit) {
      window.dispatchEvent(new Event("jaitra:pause-voice"));
      window.dispatchEvent(new Event("jaitra:pause-camera"));
    }
  }, [setupOpen, confirmExit]);
  const [closed, setClosed] = useState(false);
  useEffect(() => { if (confirmExit) window.dispatchEvent(new Event("jaitra:pause-voice")); }, [confirmExit]);
  const [exitError, setExitError] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (setupOpen) setSetupOpen(false);
        else if (playing) setHomeRequest(value => value + 1);
        else setConfirmExit((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setupOpen, playing]);
  const quit = async () => {
    try {
      if (window.jaitra) await window.jaitra.quit();
      else { setClosed(true); setConfirmExit(false); }
    } catch { setExitError(true); }
  };
  if (closed) return <main className="stage"><section className="panel"><h1>See you next time!</h1><p>You can close this browser tab.</p><button className="primary" onClick={() => setClosed(false)}>Play again</button></section></main>;
  return <>
    {!playing && <nav className="app-controls" aria-label="App controls" inert={setupOpen || confirmExit || undefined}>
      <button onClick={() => { setCameraView(false); setSetupOpen(true); }}>Setup</button>
      <button onClick={() => setCameraView(value => !value)}>{cameraView ? "Hide camera view" : "Camera view"}</button>
      <button onClick={() => { setIdentityOpen(v => !v); setCameraView(false); }}>Remember Jaitra</button>
      <button onClick={() => setConfirmExit(true)}>Exit app</button>
    </nav>}
    <IdentityRoom open={identityOpen && !setupOpen && !confirmExit && !cameraView} paused={setupOpen || confirmExit || cameraView} quiet={playing} onClose={() => setIdentityOpen(false)} />
    {setupOpen && <SetupPanel onClose={() => setSetupOpen(false)} />}
    {cameraView && !playing && !setupOpen && !confirmExit && <aside className="play-camera"><CameraPanel settings={readSettings()} /></aside>}
    <div inert={confirmExit || setupOpen || undefined}><ChildApp onPlayingChange={setPlaying} homeRequest={homeRequest} /></div>
    {confirmExit && <div className="exit-overlay">
      <section className="panel exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="exit-title" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll("button");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <h1 id="exit-title">Finished playing?</h1>
        <p>Exit JAITRA Play and return to your desktop.</p>
        {exitError && <p role="alert">Could not close the app. Please try again.</p>}
        <button className="primary" autoFocus onClick={() => setConfirmExit(false)}>Keep playing</button>
        <button className="back-button" onClick={() => void quit()}>Exit now</button>
      </section>
    </div>}
    {splashVisible && <div className="brand-splash">
      <img src={jaitraLabsLogo} alt="Jaitra Labs" />
    </div>}
  </>;
}

function ChildApp({ onPlayingChange, homeRequest }: { onPlayingChange: (playing: boolean) => void; homeRequest: number }) {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [storyReading, setStoryReading] = useState(false);

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
      reactMimo("greeting");
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
    <main className={`stage ${appState === "HUB" ? "stage-hub" : ""} ${storyReading ? "stage-storybook-reading" : ""}`}>
      {!storyReading && <Companion name={companionName} />}
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
      {appState === "HUB" && <Hub onPlayingChange={onPlayingChange} onStoryReadingChange={setStoryReading} homeRequest={homeRequest} activities={activities} voiceAvailable={snapshot.payload.capabilities.voice === "AVAILABLE"} />}
    </main>
  );
}
