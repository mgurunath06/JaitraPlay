import { app, BrowserWindow, ipcMain, session } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface QuestionRequest {
  previousPrompt: string | null;
  neededHint: boolean;
  recentPrompts: string[];
}

const directory = fileURLToPath(new URL(".", import.meta.url));
const coreUrl = process.env.JAITRA_CORE_URL ?? "http://127.0.0.1:8765";
const developmentUrl = process.env.JAITRA_UI_DEV_URL;
let mainWindow: BrowserWindow | null = null;

const isWsl = process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME);
if (isWsl) app.disableHardwareAcceleration();

function coreEndpoint(path: string): string {
  const url = new URL(path, coreUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error("JAITRA Core URL must be loopback-only");
  }
  return url.toString();
}

async function coreRequest(
  path: string,
  init?: RequestInit,
  timeoutMilliseconds = 2000,
): Promise<unknown> {
  const response = await fetch(coreEndpoint(path), {
    ...init,
    signal: AbortSignal.timeout(timeoutMilliseconds),
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
  ipcMain.handle("jaitra:get-question", (_event, activityId: unknown, request: unknown) => {
    if (typeof activityId !== "string" || !["picture_guess", "colours_shapes", "memory_cards", "riddle_guess"].includes(activityId)) {
      throw new Error("Unsupported activity");
    }
    const body = request as QuestionRequest;
    return coreRequest(`/api/v1/activities/${encodeURIComponent(activityId)}/question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 70000);
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: "JAITRA Play",
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#10253f",
    fullscreen: !developmentUrl,
    kiosk: !developmentUrl,
    autoHideMenuBar: true,
    show: Boolean(developmentUrl),
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: Boolean(developmentUrl),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`JAITRA preload failed (${preloadPath}):`, error);
  });
  window.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`JAITRA renderer failed to load (${code}): ${description}`);
  });
  window.webContents.on("before-input-event", (event, input) => {
    const blocked = input.key === "F12" || (input.control && input.shift && ["I", "J", "C"].includes(input.key));
    if (!developmentUrl && blocked) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    mainWindow = null;
  });

  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(join(directory, "../dist/ui/index.html"));

  if (developmentUrl) {
    window.center();
    window.show();
    window.focus();
  }
  return window;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  installIpcHandlers();
  mainWindow = createWindow();
});

app.on("activate", () => {
  if (mainWindow === null) mainWindow = createWindow();
});

app.on("window-all-closed", () => app.quit());
