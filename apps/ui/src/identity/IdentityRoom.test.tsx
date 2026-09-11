import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdentityRoom } from "./IdentityRoom";
import { identityRequest } from "./client";
import { detectFaces } from "./faces";
import type { Landmark } from "../camera/observe";
import type { IdentityProfile } from "./types";
vi.mock("./client", () => ({ identityRequest: vi.fn() }));
vi.mock("./faces", () => ({ loadFaces: vi.fn().mockResolvedValue(undefined), detectFaces: vi.fn() }));
const pose = (raised = false): Landmark[] => {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.7, visibility: 1 }));
  p[0].y = 0.2; p[11].y = p[12].y = 0.4; p[15].y = raised ? 0.1 : 0.7; return p;
};
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: { data: { type: string; landmarks?: Landmark[][]; time?: number } }) => Promise<void>) | null = null;
  onerror = null;
  terminate = vi.fn();
  constructor() { workers.push(this); }
  postMessage(data: { type: string }) { if (data.type === "init") void this.onmessage?.({ data: { type: "ready" } }); }
}
const stopTrack = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
  vi.mocked(identityRequest).mockResolvedValue(null);
  vi.mocked(detectFaces).mockImplementation(async () => [{ x: 0.4, y: 0.1, width: 0.2, height: 0.2, descriptor: Array(128).fill(0.1) }]);
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close: vi.fn() }));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }], getVideoTracks: () => [{ addEventListener: vi.fn() }] }) } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function frame(raised = false, elapsed = 200) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(elapsed);
    await workers.at(-1)!.onmessage?.({ data: { type: "result", landmarks: [pose(raised)], time: performance.now() } });
  });
}
it("requires adult confirmation, captures fresh views, and saves only descriptors", async () => {
  render(<IdentityRoom open paused={false} quiet onClose={vi.fn()} />);
  await flush();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Start recognition" })); await flush();
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
    video: expect.objectContaining({ width: { ideal: 1920 }, height: { ideal: 1080 } }),
  }));
  fireEvent.click(screen.getByRole("button", { name: "Enroll Jaitra" }));
  await frame(false); await frame(true); await frame(true, 1300);
  expect(identityRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /This is Jaitra/ }));
  for (let i = 0; i < 6; i++) { await frame(); fireEvent.click(screen.getByRole("button", { name: "Capture this view" })); }
  expect(identityRequest).toHaveBeenCalledTimes(1);
  vi.mocked(identityRequest).mockResolvedValue({ saved: true });
  fireEvent.click(screen.getByRole("button", { name: "Save Jaitra for future sessions" })); await flush();
  expect(identityRequest).toHaveBeenLastCalledWith("save", expect.objectContaining({ name: "Jaitra", descriptors: expect.arrayContaining([Array(128).fill(0.1)]) }));
  const stored = vi.mocked(identityRequest).mock.calls.at(-1)![1]!;
  expect(stored.descriptors).toHaveLength(6);
  expect(Object.keys(stored).sort()).toEqual(["descriptors", "model", "name", "version"]);
});
it("loads the stored profile, resumes recognition and releases camera on pause", async () => {
  const profile: IdentityProfile = { version: 1, model: "face-api-1.7.15-recognition", name: "Jaitra", descriptors: Array.from({ length: 6 }, () => Array(128).fill(0.1)) };
  vi.mocked(identityRequest).mockResolvedValue(profile);
  const view = render(<IdentityRoom open paused={false} quiet onClose={vi.fn()} />); await flush();
  await frame(); await frame(); await frame();
  expect(screen.getByText("Camera on · Tracking Jaitra")).toBeVisible();
  view.rerender(<IdentityRoom open paused quiet onClose={vi.fn()} />); await flush();
  expect(stopTrack).toHaveBeenCalled();
  expect(screen.getByText("Jaitra recognition paused")).toBeVisible();
  expect(identityRequest).toHaveBeenCalledTimes(1);
});
it("does not start a camera when profile loading fails", async () => {
  vi.mocked(identityRequest).mockRejectedValue(new Error("storage unavailable"));
  render(<IdentityRoom open paused={false} quiet onClose={vi.fn()} />); await flush();
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
  expect(screen.getByRole("button", { name: "Start recognition" })).toBeDisabled();
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
});
it("lets a parent label visible tracks without changing the saved profile", async () => {
  render(<IdentityRoom open paused={false} quiet onClose={vi.fn()} />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Start recognition" })); await flush();
  await frame();
  fireEvent.click(screen.getByRole("button", { name: "Label Person 1 as Father" }));
  expect(screen.getByText("Father", { selector: ".identity-person-labels strong" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Label Person 1 as Father" })).toHaveAttribute("aria-pressed", "true");
  expect(identityRequest).toHaveBeenCalledTimes(1);
});
