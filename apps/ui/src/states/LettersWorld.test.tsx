import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { coreClient } from "../app/coreClient";
import { LettersWorld } from "./LettersWorld";
import { GrownUpGate } from "./GrownUpGate";
import { getAbcQuestion } from "./abcQuestions";
import { readGrownUpSettings } from "./grownUpSettings";

vi.mock("../camera/CameraPanel", () => ({ CameraPanel: () => <div>Camera preview</div> }));

const activities = [
  { activityId: "air_writing", title: "Air Writing", description: "Move your hand", icon: "✍️" },
  { activityId: "sound_hunt", title: "Sound Hunt", description: "Say a word", icon: "🔎" },
  { activityId: "letter_labels", title: "Letter Labels", description: "Find a label", icon: "🏷️" },
  { activityId: "word_cards", title: "Word Cards", description: "Use cards", icon: "🧩" },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); window.localStorage.clear(); });

it("shows the four tap rungs in order and hides beta and prop modes by default", () => {
  render(<LettersWorld activities={activities} settings={{ advancedInput: false, physicalLetters: false }} voiceAvailable={false} onBack={vi.fn()} />);
  const labels = screen.getAllByText(/Step [1-4]/).map(item => item.textContent);
  expect(labels).toEqual(["Step 1", "Step 2", "Step 3", "Step 4"]);
  for (const title of ["Find a Letter", "Hear a Sound", "Blend Sounds", "Build a Word"]) expect(screen.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  expect(screen.queryByText("Air Writing")).not.toBeInTheDocument();
  expect(screen.queryByText("Letter Labels")).not.toBeInTheDocument();
});

it("reveals beta and real-letter activities only under their matching toggles", () => {
  const { rerender } = render(<LettersWorld activities={activities} settings={{ advancedInput: true, physicalLetters: false }} voiceAvailable={false} onBack={vi.fn()} />);
  expect(screen.getByText("Air Writing")).toBeVisible();
  expect(screen.getByText("Sound Hunt")).toBeVisible();
  expect(screen.getAllByText("Beta")).toHaveLength(2);
  expect(screen.queryByText("Letter Labels")).not.toBeInTheDocument();
  rerender(<LettersWorld activities={activities} settings={{ advancedInput: false, physicalLetters: true }} voiceAvailable={false} onBack={vi.fn()} />);
  expect(screen.queryByText("Air Writing")).not.toBeInTheDocument();
  expect(screen.getByText("Letter Labels")).toBeVisible();
  expect(screen.getByText("Word Cards")).toBeVisible();
  expect(screen.getAllByText("Needs real letters")).toHaveLength(2);
});

it("plays letter, sound and blend rounds locally with taps", async () => {
  const request = vi.spyOn(coreClient, "getQuestion");
  const { rerender } = render(<LettersWorld activities={[]} settings={{ advancedInput: false, physicalLetters: false }} voiceAvailable={false} onBack={vi.fn()} />);
  for (const title of ["Find a Letter", "Hear a Sound", "Blend Sounds"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Option [1-4]/ })).toHaveLength(4));
    fireEvent.click(screen.getAllByRole("button", { name: /Option [1-4]/ })[0]);
    expect(screen.getByRole("button", { name: /Next question/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Exit to home/ }));
    rerender(<LettersWorld activities={[]} settings={{ advancedInput: false, physicalLetters: false }} voiceAvailable={false} onBack={vi.fn()} />);
  }
  expect(request).not.toHaveBeenCalled();
});

it("builds a word by tapping letters in order", () => {
  render(<LettersWorld activities={[]} settings={{ advancedInput: false, physicalLetters: false }} voiceAvailable={false} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Build a Word/ }));
  expect(screen.getByRole("button", { name: /Next word/ })).toBeDisabled();
  for (const letter of ["C", "A", "T"]) fireEvent.click(screen.getByRole("button", { name: letter }));
  expect(screen.getByText(/You built CAT/)).toBeVisible();
  expect(screen.getByRole("button", { name: /Next word/ })).toBeEnabled();
});

it("opens the grown-up gate only after a two-second pointer or keyboard hold", () => {
  vi.useFakeTimers();
  render(<GrownUpGate settings={{ advancedInput: false, physicalLetters: false, hiddenGames: [], hiddenSections: [] }} onChange={vi.fn()} />);
  const gear = screen.getByRole("button", { name: /Hold for two seconds/ });
  fireEvent.click(gear);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.pointerDown(gear, { button: 0 });
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.pointerUp(gear);
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.keyDown(gear, { key: "Enter" });
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("dialog", { name: "Grown-up settings" })).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: /Camera and microphone games/ }));
  expect(window.localStorage.getItem("jaitra-advanced-input")).toBe("true");
});

it("keeps the stable grown-up storage keys and uses safe defaults", () => {
  expect(readGrownUpSettings()).toEqual({ advancedInput: false, physicalLetters: false, hiddenGames: [], hiddenSections: [] });
  window.localStorage.setItem("jaitra-advanced-input", "true");
  expect(readGrownUpSettings()).toEqual({ advancedInput: true, physicalLetters: false, hiddenGames: [], hiddenSections: [] });
});

it("saves a valid riddle mix inside the grown-up dialog", () => {
  vi.useFakeTimers();
  render(<GrownUpGate settings={{ advancedInput: false, physicalLetters: false, hiddenGames: [], hiddenSections: [] }} onChange={vi.fn()} />);
  fireEvent.pointerDown(screen.getByRole("button", { name: /Hold for two seconds/ }), { button: 0 });
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("dialog")).toHaveFocus();
  const inputs = ["Everyday objects", "Food & nature riddles", "Colours", "Geography", "Numbers & patterns"].map(label => screen.getByRole("spinbutton", { name: `${label} percent` }));
  for (const [index, input] of inputs.entries()) fireEvent.change(input, { target: { value: index === 4 ? "100" : "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save topic mix" }));
  expect(JSON.parse(window.localStorage.getItem("jaitra-riddle-topic-mix")!)).toEqual({ objects: 0, riddles: 0, colours: 0, geography: 0, patterns: 100 });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Hold for two seconds/ })).toHaveFocus();
});

it("keeps a valid answer among four choices for every tap quiz mode", async () => {
  for (const activityId of ["abc_letters", "abc_sounds", "abc_blend"]) {
    const question = await getAbcQuestion(activityId, { previousPrompt: null, neededHint: false, recentPrompts: [] });
    expect(question.choices).toHaveLength(4);
    expect(new Set(question.choices.map(choice => choice.value)).size).toBe(4);
    expect(question.choices.some(choice => choice.value === question.answer)).toBe(true);
  }
});

it("varies the answer position across ABC tap rounds", async () => {
  let draw = 0;
  vi.spyOn(Math, "random").mockImplementation(() => Math.floor(draw++ / 3) % 2 === 0 ? 0 : 0.999);
  for (const activityId of ["abc_letters", "abc_sounds", "abc_blend"]) {
    const positions = new Set<number>();
    for (let round = 0; round < 24; round++) {
      const question = await getAbcQuestion(activityId, { previousPrompt: null, neededHint: false, recentPrompts: [] });
      const position = question.choices.findIndex(choice => choice.value === question.answer);
      expect(position).toBeGreaterThanOrEqual(0);
      positions.add(position);
    }
    expect(positions.size).toBeGreaterThan(1);
    expect(positions.has(0)).toBe(true);
    expect([...positions].some(position => position !== 0)).toBe(true);
  }
});
