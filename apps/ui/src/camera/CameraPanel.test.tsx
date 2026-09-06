import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CameraPanel } from "./CameraPanel";
import { readSettings } from "../setup/settings";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
it("releases a camera granted after the panel was closed", async () => {
  let resolve!: (stream: MediaStream) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>(r => { resolve = r; }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const stop = vi.fn();
  const { unmount } = render(<CameraPanel settings={readSettings()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  unmount();
  await act(async () => { resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
  expect(stop).toHaveBeenCalledOnce();
  expect(getUserMedia.mock.calls[0]).toBeDefined();
});
it("shows permission errors without keeping a false presence indication", async () => {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) } });
  render(<CameraPanel settings={readSettings()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  await act(async () => Promise.resolve());
  expect(screen.getByRole("alert")).toHaveTextContent("Camera unavailable");
  expect(screen.getByText("No person visible")).toBeVisible();
  expect(screen.getByRole("button", { name: "Start camera" })).toBeEnabled();
});
it("stops tracks and its worker when the app pauses capture", async () => {
  const stop = vi.fn(), terminate = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }], getVideoTracks: () => [{ addEventListener: vi.fn() }] }) } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.stubGlobal("Worker", class { terminate = terminate; postMessage = vi.fn(); });
  render(<CameraPanel settings={readSettings()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  await act(async () => Promise.resolve());
  act(() => { window.dispatchEvent(new Event("jaitra:pause-camera")); });
  expect(stop).toHaveBeenCalledOnce();
  expect(terminate).toHaveBeenCalledOnce();
  expect(screen.getByText("Camera off")).toBeVisible();
});
