export type ClockLevel = "hours" | "halves" | "quarters" | "five_minutes";
export interface ClockTime { hour: number; minute: number }
export const clockMinutes: Record<ClockLevel, number[]> = {
  hours: [0], halves: [0, 30], quarters: [0, 15, 30, 45], five_minutes: Array.from({ length: 12 }, (_, i) => i * 5),
};
export const digitalTime = ({ hour, minute }: ClockTime) => `${hour}:${String(minute).padStart(2, "0")}`;
export function spokenTime({ hour, minute }: ClockTime): string {
  if (minute === 0) return `${hour} o’clock`;
  if (minute === 15) return `quarter past ${hour}`;
  if (minute === 30) return `half past ${hour}`;
  if (minute === 45) return `quarter to ${hour % 12 + 1}`;
  return minute < 30 ? `${minute} past ${hour}` : `${60 - minute} to ${hour % 12 + 1}`;
}
export function clockAngles({ hour, minute }: ClockTime) {
  return { hour: (hour % 12) * 30 + minute / 2, minute: minute * 6 };
}
export function clockRound(level: ClockLevel, previous?: ClockTime): { time: ClockTime; choices: ClockTime[] } {
  const pool = Array.from({ length: 12 }, (_, i) => clockMinutes[level].map(minute => ({ hour: i + 1, minute }))).flat();
  const available = pool.filter(t => digitalTime(t) !== (previous && digitalTime(previous)));
  const time = available[Math.floor(Math.random() * available.length)];
  const wrong = pool.filter(t => digitalTime(t) !== digitalTime(time));
  const choices = [time];
  while (choices.length < 4) choices.push(wrong.splice(Math.floor(Math.random() * wrong.length), 1)[0]);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { time, choices };
}

export function matchClockAnswer(text: string, choices: ClockTime[]): string | null {
  const words: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50" };
  const normalize = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).map(word => words[word] ?? word).join(" ").replace(/\b(20|30|40|50) 5\b/g, (_, tens: string) => String(Number(tens) + 5)).replace(/^(the time is|it is|its) /, "").trim();
  const heard = normalize(text);
  const matches = choices.filter(time => [spokenTime(time), `${time.hour} ${time.minute}`, digitalTime(time), ...(time.minute === 0 ? [String(time.hour)] : [])].some(phrase => normalize(phrase) === heard));
  return matches.length === 1 ? digitalTime(matches[0]) : null;
}
