import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalogClock, ClockApp } from "./ClockApp";
import { clockAngles, clockRound, digitalTime, matchClockAnswer, type ClockLevel } from "./clock";
vi.mock("../components/mimo", () => ({ quietMimo: vi.fn(), reactMimo: vi.fn(), speakMimo: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("places the hour hand between numbers at half past and wraps midnight correctly", () => {
  expect(clockAngles({ hour: 3, minute: 30 })).toEqual({ hour: 105, minute: 180 });
  expect(clockAngles({ hour: 12, minute: 0 })).toEqual({ hour: 0, minute: 0 });
  render(<AnalogClock time={{ hour: 3, minute: 30 }} />);
  expect(screen.getByTestId("hour-hand")).toHaveAttribute("transform", "rotate(105 200 200)");
  expect(screen.getByRole("img")).not.toHaveAccessibleName(/half past/);
});
it("generates distinct choices at each level without immediately repeating the time", () => {
  for (const level of ["hours", "halves", "quarters", "five_minutes"] as ClockLevel[]) {
    const previous = { hour: 12, minute: 0 };
    for (let i = 0; i < 30; i++) {
      const round = clockRound(level, previous);
      expect(digitalTime(round.time)).not.toBe("12:00");
      expect(new Set(round.choices.map(digitalTime)).size).toBe(4);
      expect(round.choices).toContain(round.time);
      expect(round.time.minute % (level === "hours" ? 60 : level === "halves" ? 30 : level === "quarters" ? 15 : 5)).toBe(0);
    }
  }
});
it("allows retries, awards once, and lets the child move on without voice", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  render(<ClockApp onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "2:00" }));
  expect(screen.getByRole("status")).toHaveTextContent("Good try");
  fireEvent.click(screen.getByRole("button", { name: "1:00" }));
  expect(screen.getByLabelText("1 stars")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "1:00" }));
  expect(screen.getByLabelText("1 stars")).toBeVisible();
  fireEvent.click(screen.getByText("Next clock →"));
  fireEvent.click(screen.getByText("Let’s learn together"));
  expect(screen.getByRole("status")).toHaveTextContent("Let’s learn together");
  expect(screen.getByLabelText("1 stars")).toBeVisible();
});
it("changes difficulty and exits using the hub callback", () => {
  const back = vi.fn(); render(<ClockApp onBack={back} />);
  fireEvent.change(screen.getByLabelText("Clock level"), { target: { value: "quarters" } });
  expect(screen.getByLabelText("Clock level")).toHaveValue("quarters");
  fireEvent.click(screen.getByText("← Exit to home")); expect(back).toHaveBeenCalledOnce();
  expect(screen.queryByText("🎤 Speak answer")).not.toBeInTheDocument();
});

it("understands spoken clock phrases including eleven and twelve", () => {
  const choices = [{ hour: 11, minute: 30 }, { hour: 12, minute: 25 }, { hour: 3, minute: 45 }, { hour: 4, minute: 0 }];
  expect(matchClockAnswer("it is half past eleven", choices)).toBe("11:30");
  expect(matchClockAnswer("twelve twenty five", choices)).toBe("12:25");
  expect(matchClockAnswer("quarter to four", choices)).toBe("3:45");
  expect(matchClockAnswer("four o'clock", choices)).toBe("4:00");
  expect(matchClockAnswer("maybe three or four", choices)).toBeNull();
});
