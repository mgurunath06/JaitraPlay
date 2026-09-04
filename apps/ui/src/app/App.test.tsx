import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const idleSnapshot = {
  apiVersion: "1.0" as const,
  type: "STATE_SNAPSHOT" as const,
  payload: {
    appState: "IDLE" as const,
    childDisplayName: "JAITRA",
    companionName: "Mimo",
    capabilities: { voice: "DISABLED" as const, camera: "DISABLED" as const },
    activities: [{ activityId: "picture_guess", title: "Picture Guess" }],
  },
};

describe("child shell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.jaitra = {
      getSnapshot: vi.fn().mockResolvedValue(idleSnapshot),
      sendCommand: vi.fn().mockResolvedValue({ status: "OK" }),
    };
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
    expect(window.jaitra.sendCommand).toHaveBeenCalledWith("BEGIN_INTERACTION");
  });

  it("shows branded recovery when core is unavailable", async () => {
    window.jaitra.getSnapshot = vi.fn().mockRejectedValue(new Error("offline"));
    render(<App />);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("tiny moment");
  });
});
