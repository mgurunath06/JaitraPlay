import { diagnostic } from "../app/diagnostics";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StorybookLibraryItem, StorybookSnapshot } from "../../../../packages/contracts/src";
import { coreClient } from "../app/coreClient";
import { quietMimo, reactMimo } from "../components/mimo";
import { recordVoice, type Recording } from "../voice/record";

type View = "menu" | "listening" | "processing" | "confirm" | "generating" | "reading" | "error";
type TurnDirection = "next" | "previous";

export function StorybookApp({ onBack, voiceAvailable, onReadingChange }: { onBack: () => void; voiceAvailable: boolean; onReadingChange?: (reading: boolean) => void }) {
  const [view, setView] = useState<View>("menu");
  const [topic, setTopic] = useState("");
  const [story, setStory] = useState<StorybookSnapshot | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [library, setLibrary] = useState<StorybookLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [turnDirection, setTurnDirection] = useState<TurnDirection | null>(null);
  const capture = useRef<Recording | null>(null);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const turnTimer = useRef<number | undefined>(undefined);
  const imageCache = useRef(new Map<number, string>());

  const cancelRecording = useCallback(() => {
    controller.current?.abort();
    capture.current?.cancel();
    capture.current = null;
    window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const pause = () => { cancelRecording(); setView((current) => current === "listening" || current === "processing" ? "menu" : current); };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener("jaitra:pause-voice", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => { cancelRecording(); window.removeEventListener("jaitra:pause-voice", pause); document.removeEventListener("visibilitychange", hidden); };
  }, [cancelRecording]);

  const refreshLibrary = useCallback(async () => {
    try { setLibrary(await coreClient.listStorybooks()); }
    catch { setLibrary([]); }
    finally { setLibraryLoading(false); }
  }, []);

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);

  useEffect(() => {
    onReadingChange?.(view === "reading");
    return () => onReadingChange?.(false);
  }, [onReadingChange, view]);

  useEffect(() => () => window.clearTimeout(turnTimer.current), []);

  const stopListening = useCallback(async () => {
    const recording = capture.current;
    const current = controller.current;
    if (!recording || !current) return;
    capture.current = null;
    window.clearTimeout(timer.current);
    setView("processing");
    try {
      const audio = await recording.stop();
      if (current.signal.aborted) return;
      const result = await coreClient.transcribe(audio);
      if (current.signal.aborted) return;
      const heard = result.text.replace(/\s+/g, " ").trim().slice(0, 120);
      if (heard.length < 3) throw new Error("No topic heard");
      setTopic(heard);
      setView("confirm");
    } catch {
      if (!current.signal.aborted) {
        setMessage("I couldn’t hear a story idea. Please try again.");
        setView("error");
      }
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!voiceAvailable) return;
    cancelRecording();
    quietMimo();
    const current = new AbortController();
    controller.current = current;
    setMessage("");
    setView("listening");
    try {
      const recording = await recordVoice(current.signal);
      if (current.signal.aborted) { recording.cancel(); return; }
      capture.current = recording;
      timer.current = window.setTimeout(() => void stopListening(), 8000);
    } catch {
      if (!current.signal.aborted) {
        setMessage("The microphone isn’t ready. Ask a grown-up to check Setup.");
        setView("error");
      }
    }
  }, [cancelRecording, stopListening, voiceAvailable]);

  const createStory = useCallback(async (requestedTopic: string | null) => {
    cancelRecording();
    imageCache.current.clear();
    setImageUrl("");
    setMessage("");
    setView("generating");
    try {
      const created = await coreClient.createStorybook(requestedTopic);
      diagnostic("story.created", { storyId: created.storyId });
      setStory(created);
    } catch {
      setMessage("The story helpers couldn’t begin. Please try again.");
      setView("error");
    }
  }, [cancelRecording]);

  useEffect(() => {
    if (view !== "generating" || !story) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await coreClient.getStorybook(story.storyId);
        if (!active) return;
        setStory(next);
        if (next.status === "ready") { setPageIndex(0); setView("reading"); void refreshLibrary(); }
        if (next.status === "failed") { diagnostic("story.failed", { storyId: next.storyId }); setMessage(next.error ?? "The story could not be finished."); setView("error"); }
      } catch {
        if (active) { setMessage("The story helpers stopped responding. Please try again."); setView("error"); }
      }
    };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 2000);
    return () => { active = false; window.clearInterval(poll); };
  }, [refreshLibrary, story?.storyId, view]);

  useEffect(() => {
    if (view !== "reading" || !story) return;
    const page = story.pages[pageIndex];
    if (!page?.imageReady) return;
    const cached = imageCache.current.get(page.pageNumber);
    if (cached) { setImageUrl(cached); return; }
    let active = true;
    setImageUrl("");
    void coreClient.getStorybookImage(story.storyId, page.pageNumber).then((url) => {
      if (!active) return;
      imageCache.current.set(page.pageNumber, url);
      setImageUrl(url);
    }).catch(() => { if (active) setMessage("This page’s picture could not be opened."); });
    return () => { active = false; };
  }, [pageIndex, story, view]);

  const reset = () => { setStory(null); setTopic(""); setMessage(""); setTurnDirection(null); setView("menu"); };
  const openBook = async (item: StorybookLibraryItem) => {
    cancelRecording(); imageCache.current.clear(); setImageUrl(""); setMessage("");
    try {
      const saved = await coreClient.getStorybook(item.storyId);
      setStory(saved); setPageIndex(0); setView("reading");
    } catch {
      setMessage("That saved story could not be opened. Please try again."); setView("error");
    }
  };
  const exit = () => { cancelRecording(); quietMimo(); onBack(); };
  const currentPage = story?.pages[pageIndex];
  const turnToPage = (nextIndex: number, direction: TurnDirection) => {
    window.clearTimeout(turnTimer.current);
    setMessage("");
    setPageIndex(nextIndex);
    setTurnDirection(direction);
    turnTimer.current = window.setTimeout(() => setTurnDirection(null), 650);
  };

  return (
    <section className="panel storybook-panel" aria-labelledby="storybook-title">
      <div className="storybook-toolbar">
        <button className="back-button game-back" type="button" onClick={exit}>← Exit to home</button>
        <span className="storybook-name" id="storybook-title">📖 Mimo’s Storybook</span>
        {story && <span className="storybook-providers" aria-label={`Story text: ${story.textProvider ?? "checking"}; art: ${story.imageProvider}`}>
          Text · {(story.textProvider ?? "checking").toUpperCase()} | Art · OPENROUTER
        </span>}
      </div>

      {view === "menu" && <div className="storybook-menu">
        <p className="eyebrow">What shall we read today?</p>
        <h1>Choose a storybook</h1>
        {libraryLoading ? <p role="status">Opening your storybook shelf…</p> : library.length > 0 ? <div className="storybook-library">
          {library.map(item => <button key={item.storyId} className="storybook-library-card" type="button" onClick={() => void openBook(item)}>
            <span aria-hidden="true">📖</span><strong>{item.title}</strong><small>{item.topic}</small>
          </button>)}
        </div> : <p className="storybook-note">Your finished storybooks will appear here.</p>}
        <h2>Make a new story</h2>
        <div className="storybook-actions">
          <button className="primary" type="button" onClick={() => { reactMimo("start"); void createStory(null); }}>🍀 I’m Feeling Lucky</button>
          <button className="primary story-topic-button" type="button" disabled={!voiceAvailable} onClick={() => void startListening()}>🎤 Choose a Topic</button>
        </div>
        {!voiceAvailable && <p className="storybook-note">Ask a grown-up to enable the microphone in Setup to choose a topic.</p>}
      </div>}

      {view === "listening" && <div className="storybook-center">
        <span className="storybook-listening" aria-hidden="true">🎤</span>
        <h1>Tell me your story idea!</h1>
        <p role="status">Listening… For example, “Mimo plants a garden.”</p>
        <button className="primary compact" type="button" onClick={() => void stopListening()}>Stop listening</button>
      </div>}

      {view === "processing" && <div className="storybook-center" role="status"><span className="storybook-listening" aria-hidden="true">✨</span><h1>Listening carefully…</h1></div>}

      {view === "confirm" && <div className="storybook-center">
        <p className="eyebrow">Is this what you want?</p>
        <h1>“{topic}”</h1>
        <p>We’ll make a gentle 15-page story using Mimo and his family or teacher.</p>
        <div className="storybook-actions compact-actions">
          <button className="primary compact" type="button" onClick={() => void createStory(topic)}>Make my story</button>
          <button className="secondary-button" type="button" onClick={() => void startListening()}>Try again</button>
          <button className="secondary-button" type="button" onClick={reset}>Cancel</button>
        </div>
      </div>}

      {view === "generating" && <div className="storybook-center" role="status">
        <span className="storybook-listening" aria-hidden="true">🎨</span>
        <h1>{story?.title ?? "Mimo is planning your story…"}</h1>
        <p>{story?.status === "illustrating" ? `Painting picture ${Math.min(story.completedPages + 1, 15)} of 15…` : "Choosing gentle words and happy moments…"}</p>
        <div className="story-progress" aria-label={`${story?.completedPages ?? 0} of 15 pictures complete`}><span style={{ width: `${((story?.completedPages ?? 0) / 15) * 100}%` }} /></div>
        <p className="storybook-note">This can take several minutes. You may return home; the story will keep painting.</p>
      </div>}

      {view === "reading" && story && currentPage && <div className="storybook-reader">
        <div className="storybook-page-heading"><strong>{story.title}</strong><span>Page {currentPage.pageNumber} of {story.totalPages}</span></div>
        <div className="storybook-book-shell">
          <article key={`${story.storyId}-${currentPage.pageNumber}`} className={`storybook-book ${turnDirection ? `turn-${turnDirection}` : ""}`} aria-label={`${story.title}, page ${currentPage.pageNumber}`}>
            <div className="storybook-paper storybook-paper-left">
              <span className="storybook-page-number" aria-hidden="true">{currentPage.pageNumber}</span>
              <p className="storybook-text">{currentPage.text}</p>
            </div>
            <div className="storybook-paper storybook-paper-right">
              <div className="storybook-image-frame">{imageUrl ? <img src={imageUrl} alt="" /> : <span role="status">Opening the picture…</span>}</div>
              <span className="storybook-page-number storybook-page-number-right" aria-hidden="true">{currentPage.pageNumber}</span>
            </div>
          </article>
        </div>
        {message && <p role="alert" className="storybook-note">{message}</p>}
        <div className="storybook-reader-actions">
          <button className="secondary-button" type="button" disabled={pageIndex === 0 || turnDirection !== null} onClick={() => turnToPage(pageIndex - 1, "previous")}>← Previous</button>
          {pageIndex < story.pages.length - 1
            ? <button className="primary compact" type="button" disabled={turnDirection !== null} onClick={() => turnToPage(pageIndex + 1, "next")}>Next page →</button>
            : <button className="primary compact" type="button" onClick={reset}>Make another story</button>}
        </div>
      </div>}

      {view === "error" && <div className="storybook-center" role="alert">
        <span className="storybook-listening" aria-hidden="true">🌧️</span>
        <h1>A tiny pause</h1><p>{message}</p>
        <button className="primary compact" type="button" onClick={reset}>Back to Storybook</button>
      </div>}
    </section>
  );
}
