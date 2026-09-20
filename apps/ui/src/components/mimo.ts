import type { GeneratedQuestion } from "../../../../packages/contracts/src";
export type MimoMood = "greeting" | "start" | "correct" | "encourage" | "hint";
export function reactMimo(mood: MimoMood) {
  window.dispatchEvent(new CustomEvent("mimo:react", { detail: mood }));
}
export function showMimoAnswer(question: GeneratedQuestion) {
  window.dispatchEvent(new CustomEvent<GeneratedQuestion>("mimo:answer", { detail: question }));
}
export function clearMimoAnswer() { window.dispatchEvent(new Event("mimo:answer-clear")); }
export function quietMimo() { window.speechSynthesis?.cancel(); }
export function speakMimo(text: string) {
  const synthesis = window.speechSynthesis;
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") return;
  const voice = synthesis.getVoices().find(v => v.localService && v.lang.startsWith("en"));
  if (!voice) return;
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.rate = 0.9; utterance.pitch = 1.15; utterance.volume = 0.6;
  synthesis.speak(utterance);
}
