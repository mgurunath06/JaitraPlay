import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { coreClient } from "../app/coreClient";
import { PlayApp } from "./PlayApp";

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

it("starts a riddle immediately with the saved topic mix", async () => {
  window.localStorage.setItem("jaitra-riddle-topic-mix", JSON.stringify({ objects: 0, riddles: 0, colours: 0, geography: 0, patterns: 100 }));
  const getQuestion = vi.spyOn(coreClient, "getQuestion").mockResolvedValue({
    activityId: "riddle_guess", prompt: "What comes next?", hint: "A hint", answer: "4",
    choices: [{ value: "4", label: "4", color: null }],
    explanation: "The number is four.", provider: "local", kind: "quiz", topic: "patterns",
  });
  render(<PlayApp activity={{ activityId: "riddle_guess", title: "Guess It!", description: "", icon: "❓" }} onBack={() => {}} />);
  await waitFor(() => expect(getQuestion).toHaveBeenCalledWith("riddle_guess", expect.objectContaining({ topic: "patterns" })));
  expect(screen.getByText("What comes next?")).toBeVisible();
  expect(screen.queryByText("Choose your topics")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Option 1/ }));
  fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
  await waitFor(() => expect(getQuestion).toHaveBeenCalledTimes(2));
});
