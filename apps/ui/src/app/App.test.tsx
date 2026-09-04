import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const idleSnapshot = {
  apiVersion: "1.0" as const,
  type: "STATE_SNAPSHOT" as const,
  payload: {
    appState: "IDLE" as const,
    childDisplayName: "JAITRA",
    companionName: "Mimo",
    capabilities: { voice: "DISABLED" as const, camera: "DISABLED" as const },
    activities: [
      {
        activityId: "picture_guess",
        title: "Picture Guess",
        description: "Spot the animal that Mimo asks for.",
        icon: "🐘",
        availability: "AVAILABLE" as const,
      },
      {
        activityId: "memory_cards",
        title: "Memory Match",
        description: "Turn over cards and find every pair.",
        icon: "🧠",
        availability: "AVAILABLE" as const,
      },
    ],
  },
};

describe("child shell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.jaitra = {
      getSnapshot: vi.fn().mockResolvedValue(idleSnapshot),
      sendCommand: vi.fn().mockResolvedValue({ status: "OK" }),
      getQuestion: vi.fn().mockResolvedValue({
        activityId: "picture_guess",
        prompt: "Can you find the elephant?",
        hint: "Look for a long trunk.",
        choices: [
          { value: "lion", label: "🦁", color: null },
          { value: "elephant", label: "🐘", color: null },
          { value: "frog", label: "🐸", color: null },
          { value: "duck", label: "🦆", color: null },
        ],
        answer: "elephant",
        explanation: "Elephants have long trunks.",
        provider: "mwapi",
      }),
    };
  });

  afterEach(() => {
    delete window.jaitra;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the authoritative idle snapshot", async () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("waking up");
    await act(async () => Promise.resolve());
    expect(screen.getByRole("heading", { name: "Ready to play?" })).toBeVisible();
    expect(screen.getByLabelText("Mimo, your play companion")).toBeVisible();
  });

  it("emits a semantic command without choosing a destination", async () => {
    render(<App />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Let’s play" }));
    await act(async () => Promise.resolve());
    expect(window.jaitra?.sendCommand).toHaveBeenCalledWith("BEGIN_INTERACTION");
  });

  it("shows branded recovery when core is unavailable", async () => {
    window.jaitra!.getSnapshot = vi.fn().mockRejectedValue(new Error("offline"));
    render(<App />);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("tiny moment");
  });

  it("uses the Vite proxy when viewed in a WSL development browser", async () => {
    delete window.jaitra;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => idleSnapshot }),
    );
    render(<App />);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("heading", { name: "Ready to play?" })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith("/api/v1/snapshot", { cache: "no-store" });
  });

  it("shows multiple playable apps and completes a game round", async () => {
    window.jaitra!.getSnapshot = vi.fn().mockResolvedValue({
      ...idleSnapshot,
      payload: { ...idleSnapshot.payload, appState: "HUB" as const },
    });
    render(<App />);
    await act(async () => Promise.resolve());

    expect(screen.getByRole("heading", { name: "Choose an app" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Picture Guess, available" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Memory Match, available" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Picture Guess, available" }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("heading", { name: "Can you find the elephant?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "🐘" }));
    expect(screen.getByRole("status")).toHaveTextContent("Brilliant");
    expect(screen.getByLabelText("1 stars")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    expect(screen.getByRole("heading", { name: "Choose an app" })).toBeVisible();
  });
});
