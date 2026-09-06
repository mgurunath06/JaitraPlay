import { app, BrowserWindow, ipcMain, session } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface QuestionRequest {
  previousPrompt: string | null;
  neededHint: boolean;
  recentPrompts: string[];
}
interface TranscriptionRequest { audio: string; sampleRate: number; phrases?: string[] }

const directory = fileURLToPath(new URL(".", import.meta.url));
const coreUrl = process.env.JAITRA_CORE_URL ?? "http://127.0.0.1:8765";
const developmentUrl = process.env.JAITRA_UI_DEV_URL;
let mainWindow: BrowserWindow | null = null;

const isWsl = process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME);
// Pose preprocessing needs WebGL even with CPU inference. SwiftShader supplies it
// on GPU-less WSL; the Ubuntu appliance keeps its native graphics driver.
if (isWsl || process.env.JAITRA_SOFTWARE_RENDERING === "1") {
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
}

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

function validStoryId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);
}

async function coreImageRequest(path: string): Promise<string> {
  const response = await fetch(coreEndpoint(path), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Core image request failed: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "image/png";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return `data:${contentType};base64,${data}`;
}

function installIpcHandlers(): void {
  ipcMain.handle("jaitra:identity", (event, action: unknown, profile: unknown) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("Unknown sender");
    if (action !== "get" && action !== "save" && action !== "delete") throw new Error("Invalid identity operation");
    const body = action === "save" ? JSON.stringify(profile) : undefined;
    if (action === "save" && (!body || body.length > 50000)) throw new Error("Invalid identity profile");
    return coreRequest("/api/v1/identity/jaitra", {
      method: action === "get" ? "GET" : action === "save" ? "PUT" : "DELETE",
      headers: { "Content-Type": "application/json" }, body,
    });
  });
  ipcMain.handle("jaitra:transcribe", (event, request: unknown) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("Unknown sender");
    if (!request || typeof request !== "object") throw new Error("Invalid audio");
    const { audio, sampleRate, phrases } = request as { audio: unknown; sampleRate: unknown; phrases?: unknown };
    const normalizedSampleRate = Number(sampleRate);
    if (typeof audio !== "string" || audio.length > 1024000 || ![16000, 44100, 48000].includes(normalizedSampleRate) || (phrases !== undefined && (!Array.isArray(phrases) || phrases.length > 40 || phrases.some(phrase => typeof phrase !== "string" || phrase.length > 40)))) throw new Error("Invalid audio");
    return coreRequest("/api/v1/voice/transcribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio, sampleRate: normalizedSampleRate, phrases } satisfies TranscriptionRequest),
    }, 30000);
  });
  ipcMain.handle("jaitra:quit", () => app.quit());
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
  ipcMain.handle("jaitra:create-storybook", (_event, topic: unknown) => {
    if (topic !== null && (typeof topic !== "string" || topic.length < 3 || topic.length > 120)) {
      throw new Error("Invalid story topic");
    }
    return coreRequest("/api/v1/storybooks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    }, 10000);
  });
  ipcMain.handle("jaitra:list-storybooks", () => coreRequest("/api/v1/storybooks", undefined, 10000));
  ipcMain.handle("jaitra:get-storybook", (_event, storyId: unknown) => {
    if (!validStoryId(storyId)) throw new Error("Invalid story id");
    return coreRequest(`/api/v1/storybooks/${storyId}`, undefined, 10000);
  });
  ipcMain.handle("jaitra:get-storybook-image", (_event, storyId: unknown, pageNumber: unknown) => {
    if (!validStoryId(storyId) || !Number.isInteger(pageNumber) || Number(pageNumber) < 1 || Number(pageNumber) > 15) {
      throw new Error("Invalid story image request");
    }
    return coreImageRequest(`/api/v1/storybooks/${storyId}/pages/${Number(pageNumber)}/image`);
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
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === mainWindow?.webContents && permission === "media" && details.isMainFrame && "mediaTypes" in details && details.mediaTypes?.length === 1 && ["audio", "video"].includes(details.mediaTypes[0]));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === mainWindow?.webContents && permission === "media" && details.isMainFrame && (details.mediaType === "audio" || details.mediaType === "video")
  );
  installIpcHandlers();
  mainWindow = createWindow();
});

app.on("activate", () => {
  if (mainWindow === null) mainWindow = createWindow();
});

app.on("window-all-closed", () => app.quit());
