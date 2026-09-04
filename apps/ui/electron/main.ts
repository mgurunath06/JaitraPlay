import { app, BrowserWindow, ipcMain, session } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const coreUrl = process.env.JAITRA_CORE_URL ?? "http://127.0.0.1:8765";
const developmentUrl = process.env.JAITRA_UI_DEV_URL;

function coreEndpoint(path: string): string {
  const url = new URL(path, coreUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error("JAITRA Core URL must be loopback-only");
  }
  return url.toString();
}

async function coreRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(coreEndpoint(path), {
    ...init,
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`Core request failed: ${response.status}`);
  return response.json();
}

function installIpcHandlers(): void {
  ipcMain.handle("jaitra:get-snapshot", () => coreRequest("/api/v1/snapshot"));
  ipcMain.handle("jaitra:send-command", (_event, type: unknown) => {
    if (type !== "BEGIN_INTERACTION" && type !== "WELCOME_COMPLETE") {
      throw new Error("Unsupported child command");
    }
    return coreRequest("/api/v1/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiVersion: "1.0", requestId: randomUUID(), type, payload: {} }),
    });
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: "#10253f",
    fullscreen: !developmentUrl,
    kiosk: !developmentUrl,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(directory, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: Boolean(developmentUrl),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("before-input-event", (event, input) => {
    const blocked = input.key === "F12" || (input.control && input.shift && ["I", "J", "C"].includes(input.key));
    if (!developmentUrl && blocked) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());

  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(join(directory, "../dist/ui/index.html"));
  return window;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  installIpcHandlers();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
