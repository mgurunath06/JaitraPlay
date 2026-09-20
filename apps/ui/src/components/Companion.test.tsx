import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Companion } from "./Companion";
import { clearMimoAnswer, reactMimo, showMimoAnswer, speakMimo } from "./mimo";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("greets and encourages without shaming an incorrect answer", () => {
  render(<Companion name="Mimo" />);
  expect(screen.getByText("Hi! I’m Mimo. Let’s play!")).toBeVisible();
  act(() => reactMimo("encourage"));
  expect(screen.getByText("Good try! Let’s keep exploring.")).toBeVisible();
  expect(screen.getByLabelText("Mimo, your play companion")).toHaveClass("mood-encourage");
});
it("only speaks using a local voice and cancels when setup pauses audio", () => {
  const cancel = vi.fn(), speak = vi.fn();
  const getVoices = vi.fn().mockReturnValue([{ localService: false, lang: "en-US" }]);
  vi.stubGlobal("speechSynthesis", { cancel, speak, getVoices });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  speakMimo("Hello"); expect(speak).not.toHaveBeenCalled();
  getVoices.mockReturnValue([{ localService: true, lang: "en-US" }]);
  render(<Companion name="Mimo" />);
  act(() => reactMimo("correct")); expect(speak).toHaveBeenCalledOnce();
  act(() => { window.dispatchEvent(new Event("jaitra:pause-voice")); });
  expect(cancel).toHaveBeenCalledTimes(2);
});
it("shows a map and fact for a geography answer, then clears it", () => {
  render(<Companion name="Mimo" />);
  act(() => showMimoAnswer({
    activityId: "riddle_guess", prompt: "Where is India?", hint: "South Asia",
    choices: [{ value: "india", label: "🇮🇳 India", color: null }], answer: "india",
    explanation: "India is in Asia.", provider: "local", topic: "geography",
  }));
  expect(screen.getByRole("img", { name: /map showing/i })).toBeVisible();
  expect(screen.getByText(/India is in southern Asia/)).toBeVisible();
  act(() => clearMimoAnswer());
  expect(screen.queryByLabelText("Answer discovery")).not.toBeInTheDocument();
});
