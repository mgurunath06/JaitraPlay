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
  private recent: { person: Person; lastSeen: number }[] = [];
  reset() { this.people = []; this.recent = []; this.target = null; this.source = null; this.last = -Infinity; }
  select(id: number) { if (this.people.some(p => p.id === id)) { this.target = id; this.source = "gesture"; } }
  challenge() { for (const p of this.people) { p.lowered = false; p.raisedSince = 0; } }
  update(poses: Landmark[][], faces: Face[], now: number, profile: IdentityProfile | null): Person[] {
    if (now - this.last > 2500) this.reset();
    this.last = now;
    const candidates: { pose: Landmark[]; face?: Face; x: number; y: number }[] = poses
      .filter(p => visible(p[11]) && visible(p[12])).map(pose => ({
        pose,
        // A head anchor stays comparable with a face-only observation when pose
        // briefly loses the shoulders. Fall back to shoulders if the nose is hidden.
        x: visible(pose[0]) ? pose[0].x : (pose[11].x + pose[12].x) / 2,
        y: visible(pose[0]) ? pose[0].y : (pose[11].y + pose[12].y) / 2,
      }));
    const faceCandidates = candidates.map(p => faces.filter(f => visible(p.pose[0]) &&
      p.pose[0].x >= f.x && p.pose[0].x <= f.x + f.width &&
      p.pose[0].y >= f.y && p.pose[0].y <= f.y + f.height));
    for (let i = 0; i < candidates.length; i++) {
      const found = faceCandidates[i];
      if (found.length === 1 && faceCandidates.filter(items => items.includes(found[0])).length === 1) {
        candidates[i].face = found[0];
        candidates[i].x = found[0].x + found[0].width / 2;
        candidates[i].y = found[0].y + found[0].height / 2;
      }
    }
    const usedFaces = new Set(candidates.flatMap(candidate => candidate.face ? [candidate.face] : []));
    for (const face of faces) {
      if (!usedFaces.has(face)) candidates.push({ pose: [], face,
        x: face.x + face.width / 2, y: face.y + face.height / 2 });
    }
    const previous = this.recent.filter(track => now - track.lastSeen <= 2400);
    const links = candidates.map(p => previous.filter(track => {
      const elapsed = Math.max(0, now - track.lastSeen);
      const allowed = 0.12 + Math.min(0.12, elapsed / 10000);
      return Math.hypot(p.x - track.person.x, p.y - track.person.y) < allowed;
    }));
    const next = candidates.map((p, i): Person => {
      const linked = links[i];
      const oldTrack = linked.length === 1 && links.filter(items => items.includes(linked[0])).length === 1 ? linked[0] : undefined;
      const old = oldTrack?.person;
      const raised = [15, 16].some((w, j) => handRaised(p.pose, w, 11 + j));
      const face = p.face;
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
    const visibleIds = new Set(next.map(person => person.id));
    this.recent = [
      ...next.map(person => ({ person, lastSeen: now })),
      ...previous.filter(track => !visibleIds.has(track.person.id)),
    ];
    return next;
  }
  raisedCandidate(now: number): Person | undefined {
    const raised = this.people.filter(p => p.raised);
    return raised.length === 1 && raised[0].lowered && now - raised[0].raisedSince >= 1200 ? raised[0] : undefined;
  }
}
