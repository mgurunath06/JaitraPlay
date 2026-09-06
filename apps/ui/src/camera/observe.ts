import type { Zone } from "../setup/settings";
export interface Landmark { x: number; y: number; visibility?: number }
export interface Observation {
  presence: "No person visible" | "One person visible" | "Multiple people visible" | "Position uncertain";
  position: string;
  zone: string;
  gesture: string;
}
export interface WristSample { time: number; left: number | null; right: number | null }
const visible = (p?: Landmark) => Boolean(p && (p.visibility ?? 0) >= 0.65 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
function waving(history: WristSample[], hand: "left" | "right", now: number): boolean {
  const recent = history.filter((sample) => now - sample.time < 1800);
  let previous: number | null = null;
  let direction = 0;
  let reversals = 0;
  for (const sample of recent) {
    const x = sample[hand];
    if (x === null) { previous = null; direction = 0; reversals = 0; continue; }
    if (previous !== null && Math.abs(x - previous) > 0.035) {
      const next = Math.sign(x - previous);
      if (direction && next !== direction) reversals++;
      direction = next; previous = x;
    } else if (previous === null) previous = x;
  }
  return reversals >= 2;
}
export function observe(poses: Landmark[][], zones: Zone[], history: WristSample[], now: number): Observation {
  const empty: Observation = { presence: "No person visible", position: "Unknown", zone: "Unknown", gesture: "No gesture" };
  if (poses.length !== 1) { history.length = 0; return { ...empty, presence: poses.length ? "Multiple people visible" : empty.presence }; }
  const p = poses[0];
  if (!visible(p[11]) || !visible(p[12])) { history.length = 0; return { ...empty, presence: "Position uncertain" }; }
  const x = 1 - (p[11].x + p[12].x) / 2;
  const raised = (wrist: number, shoulder: number) => visible(p[wrist]) && p[wrist].y < p[shoulder].y - 0.06;
  const left = raised(15, 11), right = raised(16, 12);
  // Relative wrist motion reduces false waves from moving the whole body sideways.
  history.push({ time: now, left: left ? p[15].x - p[11].x : null, right: right ? p[16].x - p[12].x : null });
  while (history.length && now - history[0].time >= 1800) history.shift();
  let zone = zones.length ? "Feet not visible — room zone unknown" : "No room zones set";
  if (visible(p[27]) && visible(p[28])) {
    const foot = { x: 1 - (p[27].x + p[28].x) / 2, y: (p[27].y + p[28].y) / 2 };
    const hits = zones.filter(z => foot.x >= z.x && foot.x <= z.x + z.width && foot.y >= z.y && foot.y <= z.y + z.height);
    zone = hits.length === 1 ? hits[0].name : hits.length > 1 ? "Overlapping zones — uncertain" : zones.length ? "Outside marked zones" : zone;
  }
  return {
    presence: "One person visible", position: x < 1 / 3 ? "Left" : x > 2 / 3 ? "Right" : "Centre", zone,
    gesture: waving(history, "left", now) || waving(history, "right", now) ? "Waving" : left && right ? "Both hands raised" : left || right ? "Hand raised" : "No gesture",
  };
}
