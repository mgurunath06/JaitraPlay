import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorybookSnapshot } from "../../../../packages/contracts/src";
import { coreClient } from "../app/coreClient";
import { recordVoice } from "../voice/record";
import type * as RecordingModule from "../voice/record";
import { StorybookApp } from "./StorybookApp";

vi.mock("../voice/record", async (original) => ({ ...await original<typeof RecordingModule>(), recordVoice: vi.fn() }));

const planningStory: StorybookSnapshot = {
  storyId: "11111111-1111-1111-1111-111111111111",
  status: "planning",
  topic: "Mimo plants a garden",
  title: null,
  totalPages: 15,
  completedPages: 0,
  pages: [],
  textProvider: null,
  imageProvider: "OpenRouter · bytedance-seed/seedream-5-0-lite",
  error: null,
  createdAt: "2026-09-06T00:00:00Z",
};

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
beforeEach(() => { vi.spyOn(coreClient, "listStorybooks").mockResolvedValue([]); });

describe("storybook", () => {
  it("starts a lucky story without recording", async () => {
    vi.spyOn(coreClient, "createStorybook").mockResolvedValue(planningStory);
    vi.spyOn(coreClient, "getStorybook").mockResolvedValue(planningStory);
    render(<StorybookApp onBack={vi.fn()} voiceAvailable />);
    fireEvent.click(screen.getByRole("button", { name: /Feeling Lucky/ }));
    await act(async () => Promise.resolve());
    expect(coreClient.createStorybook).toHaveBeenCalledWith(null);
    expect(screen.getByRole("status")).toHaveTextContent("planning your story");
  });

  it("confirms a spoken topic before generating", async () => {
    const stop = vi.fn().mockResolvedValue({ audio: "AAAA", sampleRate: 16000 });
    vi.mocked(recordVoice).mockResolvedValue({ stop, cancel: vi.fn() });
    vi.spyOn(coreClient, "transcribe").mockResolvedValue({ text: "Mimo plants a garden" });
    vi.spyOn(coreClient, "createStorybook").mockResolvedValue(planningStory);
    vi.spyOn(coreClient, "getStorybook").mockResolvedValue(planningStory);
    render(<StorybookApp onBack={vi.fn()} voiceAvailable />);

    fireEvent.click(screen.getByRole("button", { name: /Choose a Topic/ }));
    await act(async () => Promise.resolve());
    expect(coreClient.createStorybook).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("heading", { name: /Mimo plants a garden/ })).toBeVisible();
    expect(coreClient.createStorybook).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Make my story" }));
    await act(async () => Promise.resolve());
    expect(coreClient.createStorybook).toHaveBeenCalledWith("Mimo plants a garden");
  });

  it("keeps topic choice unavailable when local transcription is disabled", () => {
    render(<StorybookApp onBack={vi.fn()} voiceAvailable={false} />);
    expect(screen.getByRole("button", { name: /Choose a Topic/ })).toBeDisabled();
    expect(screen.getByText(/enable the microphone in Setup/)).toBeVisible();
  });

  it("lists saved books by title and opens one without generation", async () => {
    const onReadingChange = vi.fn();
    const saved: StorybookSnapshot = {
      ...planningStory,
      status: "ready",
      title: "Mimo’s Garden Day",
      completedPages: 15,
      pages: [
        { pageNumber: 1, text: "Mimo waters a bright garden.", imageReady: true },
        { pageNumber: 2, text: "A tiny green leaf waves hello.", imageReady: true },
      ],
    };
    vi.mocked(coreClient.listStorybooks).mockResolvedValue([{
      storyId: saved.storyId, title: saved.title!, topic: saved.topic,
      createdAt: saved.createdAt, completedPages: 15,
    }]);
    vi.spyOn(coreClient, "getStorybook").mockResolvedValue(saved);
    vi.spyOn(coreClient, "getStorybookImage").mockResolvedValue("saved-page.png");
    vi.spyOn(coreClient, "createStorybook").mockResolvedValue(planningStory);
    render(<StorybookApp onBack={vi.fn()} onReadingChange={onReadingChange} voiceAvailable />);
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole("button", { name: /Mimo’s Garden Day/ }));
    await act(async () => Promise.resolve());

    expect(coreClient.getStorybook).toHaveBeenCalledWith(saved.storyId);
    expect(coreClient.createStorybook).not.toHaveBeenCalled();
    expect(screen.getByText("Mimo waters a bright garden.")).toBeVisible();
    expect(onReadingChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Next page →" }));
    expect(screen.getByRole("article", { name: /page 2/ })).toHaveClass("turn-next");
    expect(screen.getByText("A tiny green leaf waves hello.")).toBeVisible();
  });
});
