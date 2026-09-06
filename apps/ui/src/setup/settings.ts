export interface Zone { id: string; name: string; x: number; y: number; width: number; height: number }
export interface SetupSettings {
  microphoneId: string;
  cameraId: string;
  preferGpu: boolean;
  zones: Zone[];
  voiceAliases: Record<string, string>;
}
const key = "jaitra.setup.v1";
const defaults: SetupSettings = { microphoneId: "", cameraId: "", preferGpu: false, zones: [], voiceAliases: {} };
export function readSettings(): SetupSettings {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<SetupSettings>;
    return {
      microphoneId: typeof data.microphoneId === "string" ? data.microphoneId : "",
      cameraId: typeof data.cameraId === "string" ? data.cameraId : "",
      preferGpu: data.preferGpu === true,
      zones: Array.isArray(data.zones) ? data.zones.filter((z) => z && typeof z.name === "string" && z.name.length <= 30 && typeof z.id === "string" && [z.x, z.y, z.width, z.height].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && z.width > 0 && z.height > 0 && z.x + z.width <= 1.001 && z.y + z.height <= 1.001).slice(0, 8) : [],
      voiceAliases: data.voiceAliases && typeof data.voiceAliases === "object" ? Object.fromEntries(Object.entries(data.voiceAliases).filter(([a, b]) => a.length <= 80 && typeof b === "string" && b.length <= 40).slice(0, 50)) : {},
    };
  } catch { return { ...defaults }; }
}
export function saveSettings(settings: SetupSettings): void {
  localStorage.setItem(key, JSON.stringify(settings));
  window.dispatchEvent(new Event("jaitra:settings-changed"));
}
