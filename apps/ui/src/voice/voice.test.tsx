import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coreClient } from "../app/coreClient";
import { VoiceAnswer } from "./VoiceAnswer";
import { matchAnswer, recognitionPhrases } from "./match";
import { encodePcm, recordVoice } from "./record";
import type * as RecordingModule from "./record";
vi.mock("./record", async (original) => ({ ...await original<typeof RecordingModule>(), recordVoice: vi.fn() }));
const choices = [
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "red", label: "Red", color: "#ff0000" },
  { value: "3", label: "3", color: null },
];
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("voice answers", () => {
  it("matches words and spoken numbers but rejects ambiguous or partial answers", () => {
    expect(matchAnswer("It is blue", choices)).toBe("blue");
    expect(matchAnswer("three", choices)).toBe("3");
    expect(matchAnswer("blue or red", choices)).toBeNull();
    expect(matchAnswer("blueberry", choices)).toBeNull();
    expect(matchAnswer("", choices)).toBeNull();
    expect(recognitionPhrases(choices)).toEqual(["blue", "red", "3", "three"]);
  });
  it("encodes bounded little-endian PCM", () => {
    const audio = atob(encodePcm([new Float32Array([-1, 0, 1, 1])], 3));
    expect([...audio].map((value) => value.charCodeAt(0))).toEqual([0, 128, 0, 0, 255, 127]);
  });
  it("uses visible choices to recognise and submit one spoken answer", async () => {
    const stop = vi.fn().mockResolvedValue({ audio: "AAAA", sampleRate: 16000 });
    vi.mocked(recordVoice).mockResolvedValue({ stop, cancel: vi.fn() });
    vi.spyOn(coreClient, "transcribe").mockResolvedValue({ text: "blue" });
    const onAnswer = vi.fn();
    render(<VoiceAnswer choices={choices} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Speak answer/ }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Stop now" }));
    await act(async () => Promise.resolve());
    expect(stop).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith("blue");
    expect(coreClient.transcribe).toHaveBeenCalledWith(expect.objectContaining({ phrases: ["blue", "red", "3", "three"] }));
  });
  it("stops after four seconds and cancels on leaving the round", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stop = vi.fn().mockResolvedValue({ audio: "AAAA", sampleRate: 16000 });
    vi.mocked(recordVoice).mockResolvedValue({ stop, cancel });
    vi.spyOn(coreClient, "transcribe").mockResolvedValue({ text: "" });
    const { unmount } = render(<VoiceAnswer choices={choices} onAnswer={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Speak answer/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("didn’t hear");
    fireEvent.click(screen.getByRole("button", { name: /Speak answer/ }));
    await act(async () => Promise.resolve());
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
  it("handles denied permission and ignores a result after exit", async () => {
    vi.mocked(recordVoice).mockRejectedValueOnce(new Error("denied"));
    render(<VoiceAnswer choices={choices} onAnswer={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Speak answer/ }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("Microphone unavailable");
    const cancel = vi.fn();
    vi.mocked(recordVoice).mockResolvedValue({ stop: vi.fn(), cancel });
    fireEvent.click(screen.getByRole("button", { name: /Speak answer/ }));
    await act(async () => Promise.resolve());
    act(() => { window.dispatchEvent(new Event("jaitra:pause-voice")); });
    expect(cancel).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Stop now" })).toBeNull();
  });
});
