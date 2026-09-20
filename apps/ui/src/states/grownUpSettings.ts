export interface GrownUpSettings {
  advancedInput: boolean;
  physicalLetters: boolean;
  hiddenGames: string[];
  hiddenSections: string[];
}

const ADVANCED_INPUT_KEY = "jaitra-advanced-input";
const PHYSICAL_LETTERS_KEY = "jaitra-physical-letters";
const HIDDEN_GAMES_KEY = "jaitra-hidden-games";
const HIDDEN_SECTIONS_KEY = "jaitra-hidden-sections";

function readList(key: string): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length < 80).slice(0, 40) : [];
  } catch { return []; }
}

export function readGrownUpSettings(): GrownUpSettings {
  try {
    return {
      advancedInput: window.localStorage.getItem(ADVANCED_INPUT_KEY) === "true",
      physicalLetters: window.localStorage.getItem(PHYSICAL_LETTERS_KEY) === "true",
      hiddenGames: readList(HIDDEN_GAMES_KEY),
      hiddenSections: readList(HIDDEN_SECTIONS_KEY),
    };
  } catch {
    return { advancedInput: false, physicalLetters: false, hiddenGames: [], hiddenSections: [] };
  }
}

export function saveGrownUpSettings(settings: GrownUpSettings): boolean {
  try {
    window.localStorage.setItem(ADVANCED_INPUT_KEY, String(settings.advancedInput));
    window.localStorage.setItem(PHYSICAL_LETTERS_KEY, String(settings.physicalLetters));
    window.localStorage.setItem(HIDDEN_GAMES_KEY, JSON.stringify(settings.hiddenGames));
    window.localStorage.setItem(HIDDEN_SECTIONS_KEY, JSON.stringify(settings.hiddenSections));
    return true;
  } catch {
    return false;
  }
}
