import type { Landmark } from "../camera/observe";

export const AIR_LETTERS = ["c", "o", "l", "t", "i", "s", "v", "x"] as const;
export const BODY_LETTERS = ["T", "Y", "I", "L", "V", "O", "X"] as const;
export const TWO_LETTER_WORDS = [
  ["at", "🍽️ at the table"], ["in", "📦 in the box"], ["on", "📚 on the book"],
  ["it", "👉 it"], ["is", "✨ is"], ["up", "⬆️ up"], ["an", "🍎 an apple"],
  ["us", "👨‍👩‍👦 us"], ["go", "🟢 go"], ["no", "🔴 no"], ["my", "🙋 my"],
  ["we", "👫 we"], ["he", "👦 he"], ["be", "🐝 be"], ["so", "💭 so"], ["do", "✅ do"],
] as const;
export const BUILD_WORDS = ["cat", "sun", "dog", "map", "bed", "cup", "hen", "top"];

export function letterChoices(word: string, round: number, size = 6): string[] {
  const target = [...new Set(word)];
  const distractors = [..."aeiostbcdfghlmnpru"].filter(letter => !target.includes(letter));
  const choices: string[] = [];
  while (choices.length < size && (target.length || distractors.length)) {
    if (target.length) choices.push(target.shift()!);
    if (choices.length < size && distractors.length) choices.push(distractors.shift()!);
  }
  const shift = round % choices.length;
  return [...choices.slice(shift), ...choices.slice(0, shift)];
}

export function focusTokens(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z]+/).filter(token => token.length >= 1 && token.length <= 4))].slice(0, 12);
}

type Point = { x: number; y: number };
const templates: Record<(typeof AIR_LETTERS)[number], Point[]> = {
  c: [{x:.85,y:.18},{x:.65,y:.08},{x:.35,y:.12},{x:.14,y:.35},{x:.12,y:.68},{x:.35,y:.9},{x:.72,y:.86},{x:.88,y:.72}],
  o: [{x:.55,y:.08},{x:.25,y:.14},{x:.1,y:.45},{x:.18,y:.78},{x:.48,y:.92},{x:.78,y:.8},{x:.9,y:.48},{x:.76,y:.16},{x:.55,y:.08}],
  l: [{x:.38,y:.08},{x:.38,y:.86},{x:.82,y:.86}],
  t: [{x:.12,y:.2},{x:.88,y:.2},{x:.5,y:.2},{x:.5,y:.9}],
  i: [{x:.5,y:.12},{x:.5,y:.9}],
  s: [{x:.82,y:.18},{x:.58,y:.08},{x:.25,y:.18},{x:.18,y:.4},{x:.7,y:.55},{x:.82,y:.76},{x:.58,y:.92},{x:.2,y:.82}],
  v: [{x:.12,y:.12},{x:.5,y:.9},{x:.88,y:.12}],
  x: [{x:.12,y:.12},{x:.88,y:.9},{x:.5,y:.5},{x:.88,y:.12},{x:.12,y:.9}],
};

function normalize(points: Point[]): Point[] {
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const width = Math.max(.001, maxX - minX), height = Math.max(.001, maxY - minY);
  return points.map(p => ({ x: (p.x - minX) / width, y: (p.y - minY) / height }));
}
function resample(points: Point[], count = 32): Point[] {
  if (points.length < 2) return points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths.at(-1) || 1;
  return Array.from({ length: count }, (_, index) => {
    const target = total * index / (count - 1);
    let end = lengths.findIndex(value => value >= target); if (end <= 0) end = 1;
    const start = end - 1, span = Math.max(.001, lengths[end] - lengths[start]), ratio = (target - lengths[start]) / span;
    return { x: points[start].x + (points[end].x - points[start].x) * ratio, y: points[start].y + (points[end].y - points[start].y) * ratio };
  });
}
export function airWritingScore(letter: (typeof AIR_LETTERS)[number], points: Point[]): number {
  if (points.length < 6) return 0;
  const actual = resample(normalize(points)), expected = resample(normalize(templates[letter]));
  const distance = (candidate: Point[]) => candidate.reduce((sum, point, index) => sum + Math.hypot(point.x - expected[index].x, point.y - expected[index].y), 0) / candidate.length;
  return Math.max(0, Math.min(1, 1 - Math.min(distance(actual), distance([...actual].reverse())) / .65));
}

const visible = (point?: Landmark) => Boolean(point && (point.visibility ?? 0) >= .45);
export function wristPoint(poses: Landmark[][]): Point | null {
  if (poses.length !== 1) return null;
  const pose = poses[0], point = visible(pose[16]) ? pose[16] : visible(pose[15]) ? pose[15] : undefined;
  return point ? { x: 1 - point.x, y: point.y } : null;
}
export function matchesBodyLetter(letter: string, poses: Landmark[][]): boolean {
  if (poses.length !== 1) return false;
  const p = poses[0];
  if (![11,12,15,16,27,28].every(index => visible(p[index]))) return false;
  const shoulders = Math.max(.05, Math.abs(p[11].x - p[12].x));
  const raised = p[15].y < p[11].y - shoulders * .25 && p[16].y < p[12].y - shoulders * .25;
  const armsWide = Math.abs(p[15].x - p[16].x) > shoulders * 1.8;
  const leftLevel = Math.abs(p[15].y - p[11].y) < shoulders * .45;
  const rightLevel = Math.abs(p[16].y - p[12].y) < shoulders * .45;
  const armsLevel = leftLevel && rightLevel;
  const feetWide = Math.abs(p[27].x - p[28].x) > shoulders * 1.15;
  const wristsClose = Math.hypot(p[15].x - p[16].x, p[15].y - p[16].y) < shoulders * .65;
  const armsDown = p[15].y > p[11].y + shoulders && p[16].y > p[12].y + shoulders;
  if (letter === "T") return armsLevel && armsWide;
  if (letter === "Y") return raised && armsWide && !feetWide;
  if (letter === "I") return armsDown && !feetWide;
  if (letter === "L") return (leftLevel && p[16].y > p[12].y + shoulders * .7) || (rightLevel && p[15].y > p[11].y + shoulders * .7);
  if (letter === "V") return armsDown && feetWide;
  if (letter === "O") return raised && wristsClose;
  if (letter === "X") return raised && armsWide && feetWide;
  return false;
}
