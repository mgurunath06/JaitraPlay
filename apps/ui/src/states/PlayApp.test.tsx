import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { coreClient } from "../app/coreClient";
import { PlayApp } from "./PlayApp";

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

it("sets the riddle mix before play and allows changes during a game", async () => {
  const getQuestion = vi.spyOn(coreClient, "getQuestion").mockResolvedValue({
    activityId: "riddle_guess", prompt: "What am I?", hint: "A hint", answer: "book",
    choices: [{ value: "book", label: "Book", color: null }],
    explanation: "A book.", provider: "local", kind: "quiz", topic: "riddles",
  });
  render(<PlayApp activity={{ activityId: "riddle_guess", title: "Riddles", description: "", icon: "🌱" }} onBack={() => {}} />);
  expect(screen.getByText("Choose your topics")).toBeVisible();
  expect(getQuestion).not.toHaveBeenCalled();
  const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
  fireEvent.change(inputs[0], { target: { value: "100" } });
  fireEvent.change(inputs[1], { target: { value: "0" } });
  fireEvent.change(inputs[2], { target: { value: "0" } });
  fireEvent.change(inputs[3], { target: { value: "0" } });
  fireEvent.change(inputs[4], { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Start playing" }));
  await waitFor(() => expect(getQuestion).toHaveBeenCalledWith("riddle_guess", expect.objectContaining({ topic: "objects" })));
  fireEvent.click(screen.getByRole("button", { name: /Topics/ }));
  const revised = screen.getAllByRole("spinbutton") as HTMLInputElement[];
  fireEvent.change(revised[0], { target: { value: "0" } });
  fireEvent.change(revised[3], { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Save mix" }));
  fireEvent.click(screen.getByRole("button", { name: /Option 1/ }));
  fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
  await waitFor(() => expect(getQuestion).toHaveBeenLastCalledWith("riddle_guess", expect.objectContaining({ topic: "geography" })));
});
