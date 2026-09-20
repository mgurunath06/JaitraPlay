import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Hub } from "./Hub";
import { speakMimo } from "../components/mimo";

vi.mock("../components/mimo", () => ({ quietMimo: vi.fn(), reactMimo: vi.fn(), speakMimo: vi.fn(), clearMimoAnswer: vi.fn(), showMimoAnswer: vi.fn() }));

const activities = [
  { activityId: "picture_guess", title: "Look & Guess", description: "Pictures", icon: "🐘", availability: "AVAILABLE" as const },
  { activityId: "memory_cards", title: "Find the Pairs", description: "Pairs", icon: "🃏", availability: "AVAILABLE" as const },
  { activityId: "riddle_guess", title: "Guess It!", description: "Riddles", icon: "❓", availability: "AVAILABLE" as const },
  { activityId: "storybook", title: "Storybook", description: "Stories", icon: "📖", availability: "AVAILABLE" as const },
  { activityId: "tell_time", title: "What's the Time?", description: "Clock", icon: "🕒", availability: "AVAILABLE" as const },
  { activityId: "air_writing", title: "Air Writing", description: "Letters", icon: "?", availability: "AVAILABLE" as const },
];

afterEach(() => { vi.useRealTimers(); window.localStorage.clear(); vi.clearAllMocks(); });

it("groups existing games with child titles and keeps future games off the shelf", () => {
  render(<Hub activities={activities} onPlayingChange={vi.fn()} homeRequest={0} />);
  expect(screen.getByRole("heading", { name: /Guessing Games/ })).toBeVisible();
  expect(screen.getByRole("heading", { name: /Letters & Numbers/ })).toBeVisible();
  expect(screen.getByRole("heading", { name: /Stories & Time/ })).toBeVisible();
  expect(screen.queryByRole("heading", { name: /Songs & Kindness/ })).not.toBeInTheDocument();
  for (const title of ["Look & Guess", "Find the Pairs", "Guess It!", "ABC Play", "Storybook", "What's the Time?"]) {
    expect(screen.getByRole("button", { name: `${title}, available` })).toBeVisible();
  }
  expect(screen.queryByRole("button", { name: /Count It!/ })).not.toBeInTheDocument();
  expect(within(screen.getByRole("button", { name: "Find the Pairs, available" })).getByText("🃏")).toBeVisible();
  const guess = screen.getByRole("button", { name: "Look & Guess, available" });
  fireEvent.focus(guess);
  fireEvent.click(guess);
  expect(speakMimo).toHaveBeenCalledOnce();
  expect(speakMimo).toHaveBeenCalledWith("Look & Guess");
});

it("honours saved game and section visibility and lets a grown-up change it", () => {
  vi.useFakeTimers();
  window.localStorage.setItem("jaitra-hidden-games", JSON.stringify(["memory_cards"]));
  window.localStorage.setItem("jaitra-hidden-sections", JSON.stringify(["stories"]));
  render(<Hub activities={activities} onPlayingChange={vi.fn()} homeRequest={0} />);
  expect(screen.queryByRole("button", { name: "Find the Pairs, available" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Stories & Time/ })).not.toBeInTheDocument();
  const gear = screen.getByRole("button", { name: /Hold for two seconds/ });
  fireEvent.pointerDown(gear, { button: 0 });
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Find the Pairs" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Show Stories & Time section" }));
  expect(screen.getByRole("button", { name: "Find the Pairs, available" })).toBeVisible();
  expect(screen.getByRole("heading", { name: /Stories & Time/ })).toBeVisible();
});

it("shows all six new local games in their shelf sections and opens a quiz", () => {
  const newGames = [
    ["counting_numbers", "Count It!", "🔢"],
    ["shapes_sorting", "Shapes", "🔶"],
    ["rhyme_time", "Sing & Rhyme", "🎵"],
    ["good_manners", "Kind Words", "🤝"],
    ["animal_sounds", "Animal Sounds", "🐮"],
    ["daily_routine", "My Day", "🌞"],
  ].map(([activityId, title, icon]) => ({ activityId, title, icon, description: "Tap to play", availability: "AVAILABLE" as const }));
  render(<Hub activities={newGames} onPlayingChange={vi.fn()} homeRequest={0} />);
  expect(screen.getByRole("heading", { name: /Letters & Numbers/ })).toBeVisible();
  expect(screen.getByRole("heading", { name: /Songs & Kindness/ })).toBeVisible();
  expect(screen.getByRole("heading", { name: /Stories & Time/ })).toBeVisible();
  for (const game of newGames) expect(screen.getByRole("button", { name: `${game.title}, available` })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Count It!, available" }));
  expect(screen.getByText("Count It!")).toBeVisible();
});
