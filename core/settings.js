// Grown-ups' settings, shared between the games, and which level each game is on (core/levels.js).
// Nothing about the child or their hands is ever stored.
import { OPEN_RULES } from './hands.js';

const STORAGE_KEY = 'camera-games-settings';

// The hands that can be chosen, for the panel.
export const HAND_CHOICES = [['left', 'Left hand'], ['right', 'Right hand']];

const SHARED_DEFAULTS = {
  strictness: { left: OPEN_RULES.defaultStrictness, right: OPEN_RULES.defaultStrictness },
  hands: 'right',
  sound: true,
  voice: true,
  language: 'en',
};

/** gameDefaults adds a game's own settings to the shared ones. */
export function loadSettings(gameDefaults = {}) {
  const defaults = { ...SHARED_DEFAULTS, ...gameDefaults };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!HAND_CHOICES.some(([value]) => value === saved.hands)) delete saved.hands;
    return { ...defaults, ...saved, strictness: { ...defaults.strictness, ...saved.strictness } };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private windows can refuse storage. The defaults still work.
  }
}
