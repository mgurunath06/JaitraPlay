import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Hub } from "./Hub";
import { CoReadingApp, SoundHuntApp, TwoLetterWordsApp, WordCardsApp } from "./LiteracyApps";
import { TWO_LETTER_WORDS } from "./literacy";
import { recordVoice } from "../voice/record";
import { coreClient } from "../app/coreClient";
vi.mock("../camera/CameraPanel", () => ({ CameraPanel: () => <div>Camera preview</div> }));
vi.mock("../components/mimo", () => ({ quietMimo: vi.fn(), reactMimo: vi.fn(), speakMimo: vi.fn(), clearMimoAnswer: vi.fn(), showMimoAnswer: vi.fn() }));
vi.mock("../voice/record", () => ({ recordVoice: vi.fn() }));
vi.mock("../setup/settings", () => ({ readSettings: () => ({ weeklyFocus: "oo", zones: [] }) }));
afterEach(() => { cleanup(); window.localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(["air_writing", "sound_hunt", "co_reading", "letter_labels", "body_letters", "two_letter_words", "word_cards"])("opens %s inside ABC Play when its grown-up setting is on", activityId => {
  window.localStorage.setItem(activityId === "letter_labels" || activityId === "word_cards" ? "jaitra-physical-letters" : "jaitra-advanced-input", "true");
  render(<Hub activities={[{ activityId, title: activityId, description: "Practice", icon: "A", availability: "AVAILABLE" }]} onPlayingChange={vi.fn()} homeRequest={0} />);
  fireEvent.click(screen.getByRole("button", { name: "ABC Play, available" }));
  fireEvent.click(screen.getByRole("button", { name: /Practice/ }));
  fireEvent.click(screen.getByRole("button", { name: /Exit to home/ }));
  expect(screen.getByRole("heading", { name: "ABC Play" })).toBeVisible();
});
it("opens Memory Match locally without requesting a generated question", () => {
  const getQuestion = vi.spyOn(coreClient, "getQuestion");
  render(<Hub activities={[{ activityId: "memory_cards", title: "Find the Pairs", description: "Practice", icon: "🃏", availability: "AVAILABLE" }]} onPlayingChange={vi.fn()} homeRequest={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Find the Pairs, available" }));
  expect(screen.getAllByRole("button", { name: /Hidden card/ })).toHaveLength(16);
  expect(getQuestion).not.toHaveBeenCalled();
});
it("highlights whole words and allows co-reading without speech", () => {
  const { container } = render(<CoReadingApp onBack={vi.fn()} voiceAvailable={false} />);
  expect(container.querySelectorAll("mark")).toHaveLength(1);
  expect(container.querySelector("mark")).toHaveTextContent("a");
  fireEvent.click(screen.getByText("Grown-up: word read"));
  fireEvent.click(screen.getByText("Next page →"));
  expect(container.querySelector("mark")).toHaveTextContent("is");
});
it("offers four unique choices throughout the word cycle", () => {
  const { container } = render(<TwoLetterWordsApp onBack={vi.fn()} voiceAvailable={false} />);
  for (const [word] of TWO_LETTER_WORDS) {
    const choices = Array.from(container.querySelectorAll<HTMLButtonElement>(".choice-button"));
    expect(choices).toHaveLength(4);
    expect(new Set(choices.map(choice => choice.textContent?.slice(1))).size).toBe(4);
    fireEvent.click(choices.find(choice => choice.textContent?.slice(1) === word.toUpperCase())!);
    fireEvent.click(screen.getByText("Next word →"));
  }
});
it("builds repeated letters and requires a grown-up to advance physical cards", () => {
  const { container } = render(<WordCardsApp onBack={vi.fn()} />);
  const tiles = Array.from(container.querySelectorAll<HTMLButtonElement>(".letter-card-grid button"));
  expect(tiles.every(tile => tile.textContent?.length === 2)).toBe(true);
  const next = screen.getByText("Grown-up: cards match — next →");
  expect(next).toBeDisabled();
  const o = tiles.find(tile => tile.textContent?.endsWith("O"))!;
  fireEvent.click(o); fireEvent.click(o);
  expect(next).toBeEnabled();
});
it("automatically stops speech and cancels capture on exit", async () => {
  vi.useFakeTimers();
  const stop = vi.fn().mockResolvedValue({ audio: "audio", sampleRate: 16000 });
  const cancel = vi.fn();
  vi.mocked(recordVoice).mockResolvedValue({ stop, cancel });
  vi.spyOn(coreClient, "transcribe").mockResolvedValue({ text: "ball" });
  const { unmount } = render(<SoundHuntApp onBack={vi.fn()} voiceAvailable />);
  await act(async () => fireEvent.click(screen.getByText("🎤 Say what you found")));
  await act(async () => vi.advanceTimersByTimeAsync(6500));
  expect(stop).toHaveBeenCalledOnce();
  await act(async () => fireEvent.click(screen.getByText("🎤 Say what you found")));
  unmount();
  expect(cancel).toHaveBeenCalled();
});
