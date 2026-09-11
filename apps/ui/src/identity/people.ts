import type { PersonProfile } from "./types";
import type { Face } from "./faces";
import { distance } from "./tracker";

export async function peopleRequest(action: "get" | "save" | "delete", payload?: PersonProfile | string): Promise<unknown> {
  if (window.jaitra?.people) return window.jaitra.people(action, payload);
  if (!import.meta.env.DEV) throw new Error("App bridge unavailable");
  const response = await fetch(`/api/v1/identity/people${action === "delete" ? `/${encodeURIComponent(String(payload))}` : ""}`, {
    method: action === "get" ? "GET" : action === "save" ? "PUT" : "DELETE",
    headers: { "Content-Type": "application/json" }, body: action === "save" ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(5000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not access saved people");
  return response.json();
}

export function identifyPerson(face: Face, profiles: PersonProfile[]): PersonProfile | undefined {
  const ranked = profiles.map(profile => {
    const scores = profile.descriptors.map(d => distance(d, face.descriptor)).sort((a, b) => a - b);
    return { profile, score: scores.length ? scores.slice(0, 3).reduce((a, b) => a + b) / Math.min(3, scores.length) : Infinity };
  }).sort((a, b) => a.score - b.score);
  return ranked[0]?.score < (ranked[0]?.profile.descriptors.length < 3 ? 0.36 : 0.42) && (!ranked[1] || ranked[1].score - ranked[0].score >= 0.06) ? ranked[0].profile : undefined;
}

// Display-only similarity estimate, not a calibrated probability of identity.
export function suggestPerson(face: Face, profiles: PersonProfile[]) {
  const ranked = profiles.map(profile => {
    const scores = profile.descriptors.map(d => distance(d, face.descriptor)).sort((a, b) => a - b).slice(0, 3);
    const meanDistance = scores.length ? scores.reduce((a, b) => a + b) / scores.length : Infinity;
    return { profile, meanDistance, confidence: Math.round(Math.max(0, Math.min(1, 1 - meanDistance / Math.SQRT2)) * 100) };
  }).sort((a, b) => a.meanDistance - b.meanDistance);
  return ranked[0];
}
