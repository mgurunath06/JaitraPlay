import { handRaised, type Landmark } from "../camera/observe";
import type { Face } from "./faces";
import type { IdentityProfile } from "./types";
export interface Person { id: number; pose: Landmark[]; face?: Face; x: number; y: number; raised: boolean; raisedSince: number; lowered: boolean; matches: number }
const visible = (p?: Landmark) => !!p && (p.visibility ?? 0) >= 0.5;
export function distance(a: number[], b: number[]): number {
  if (a.length !== 128 || b.length !== 128 || [...a, ...b].some(n => !Number.isFinite(n))) return Infinity;
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}
export function faceMatches(face: Face, profile: IdentityProfile): boolean {
  const scores = profile.descriptors.map(v => distance(v, face.descriptor)).sort((a, b) => a - b);
  // Require agreement with several enrollment views, not a single accidental match.
  return scores.length >= 3 && scores.slice(0, 3).reduce((a, b) => a + b) / 3 < 0.42;
}
export class PersonTracker {
  people: Person[] = [];
  target: number | null = null;
  source: "face" | "gesture" | null = null;
  private nextId = 1;
  private last = -Infinity;
  reset() { this.people = []; this.target = null; this.source = null; this.last = -Infinity; }
  select(id: number) { if (this.people.some(p => p.id === id)) { this.target = id; this.source = "gesture"; } }
  challenge() { for (const p of this.people) { p.lowered = false; p.raisedSince = 0; } }
  update(poses: Landmark[][], faces: Face[], now: number, profile: IdentityProfile | null): Person[] {
    if (now - this.last > 2500) this.reset();
    this.last = now;
    const candidates = poses.filter(p => visible(p[11]) && visible(p[12])).map(pose => ({
      pose, x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2,
    }));
    const links = candidates.map(p => this.people.filter(old => Math.hypot(p.x - old.x, p.y - old.y) < 0.12));
    const associatedFaces = candidates.map(p => faces.filter(f => visible(p.pose[0]) && p.pose[0].x >= f.x && p.pose[0].x <= f.x + f.width && p.pose[0].y >= f.y && p.pose[0].y <= f.y + f.height));
    const next = candidates.map((p, i): Person => {
      const linked = links[i];
      const old = linked.length === 1 && links.filter(v => v.some(item => item.id === linked[0].id)).length === 1 ? linked[0] : undefined;
      const raised = [15, 16].some((w, j) => handRaised(p.pose, w, 11 + j));
      const found = associatedFaces[i];
      const face = found.length === 1 && associatedFaces.filter(v => v.includes(found[0])).length === 1 ? found[0] : undefined;
      const matches = face && profile && faceMatches(face, profile) ? (old?.matches ?? 0) + 1 : 0;
      return { ...p, id: old?.id ?? this.nextId++, face, raised,
        raisedSince: raised ? (old?.raised ? old.raisedSince : now) : 0,
        lowered: !raised || (old?.lowered ?? false), matches };
    });
    if (!next.some(p => p.id === this.target)) { this.target = null; this.source = null; }
    // A conflicting clear face invalidates an automatic match immediately.
    const target = next.find(p => p.id === this.target);
    if (this.source === "face" && target?.face && profile && !faceMatches(target.face, profile)) {
      this.target = null; this.source = null;
    }
    const recognized = next.filter(p => p.matches >= 3);
    if (recognized.length > 1) { this.target = null; this.source = null; }
    else if (recognized.length === 1 && this.target === null) { this.target = recognized[0].id; this.source = "face"; }
    this.people = next;
    return next;
  }
  raisedCandidate(now: number): Person | undefined {
    const raised = this.people.filter(p => p.raised);
    return raised.length === 1 && raised[0].lowered && now - raised[0].raisedSince >= 1200 ? raised[0] : undefined;
  }
}
