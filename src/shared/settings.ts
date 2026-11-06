/** Settings shared by every game in the collection. Progress is kept per game. */
export interface Settings {
  sound: boolean;
  haptics: boolean;
  theme: string;
}

export const SETTINGS_KEY = 'pocket-puzzles.settings.v1';
/** Arrow Escape stored settings alongside its progress before the collection existed. */
const LEGACY_KEY = 'arrow-escape.v1';

const defaults = (): Settings => ({ sound: true, haptics: true, theme: 'auto' });

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  const d = defaults();
  const saved = read(SETTINGS_KEY);
  if (saved) return { ...d, ...(saved as Partial<Settings>) };
  // First run of the collection: carry over what the player chose in Arrow Escape.
  const legacy = read(LEGACY_KEY) as { settings?: Partial<Settings>; theme?: string } | null;
  if (!legacy) return d;
  const s: Settings = {
    sound: legacy.settings?.sound ?? d.sound,
    haptics: legacy.settings?.haptics ?? d.haptics,
    theme: typeof legacy.theme === 'string' ? legacy.theme : d.theme,
  };
  saveSettings(s);
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable (private mode, blocked). The games still work.
  }
}
