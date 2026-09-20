export interface GrownUpSettings {
  advancedInput: boolean;
  physicalLetters: boolean;
}

const ADVANCED_INPUT_KEY = "jaitra-advanced-input";
const PHYSICAL_LETTERS_KEY = "jaitra-physical-letters";

export function readGrownUpSettings(): GrownUpSettings {
  try {
    return {
      advancedInput: window.localStorage.getItem(ADVANCED_INPUT_KEY) === "true",
      physicalLetters: window.localStorage.getItem(PHYSICAL_LETTERS_KEY) === "true",
    };
  } catch {
    return { advancedInput: false, physicalLetters: false };
  }
}

export function saveGrownUpSettings(settings: GrownUpSettings): boolean {
  try {
    window.localStorage.setItem(ADVANCED_INPUT_KEY, String(settings.advancedInput));
    window.localStorage.setItem(PHYSICAL_LETTERS_KEY, String(settings.physicalLetters));
    return true;
  } catch {
    return false;
  }
}
