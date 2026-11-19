/** Settings shared by every game in the collection. Progress is kept per game. */
export interface Settings {
  sound: boolean;
  haptics: boolean;
  theme: string;
  /** Ids of the games the player starred. They are listed first on the home screen. */
  favourites: string[];
}

export const SETTINGS_KEY = 'pocket-puzzles.settings.v1';
/** Arrow Escape stored settings alongside its progress before the collection existed. */
const LEGACY_KEY = 'arrow-escape.v1';

const defaults = (): Settings => ({ sound: true, haptics: true, theme: 'auto', favourites: [] });

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
  if (saved) {
    const s = { ...d, ...(saved as Partial<Settings>) };
    if (!Array.isArray(s.favourites)) s.favourites = [];
    s.favourites = s.favourites.filter((id) => typeof id === 'string');
    return s;
  }
  // First run of the collection: carry over what the player chose in Arrow Escape.
  const legacy = read(LEGACY_KEY) as { settings?: Partial<Settings>; theme?: string } | null;
  if (!legacy) return d;
  const s: Settings = {
    sound: legacy.settings?.sound ?? d.sound,
    haptics: legacy.settings?.haptics ?? d.haptics,
    theme: typeof legacy.theme === 'string' ? legacy.theme : d.theme,
    favourites: [],
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

/** Starred games first, then the rest. Each group keeps the collection's own order. */
export function orderByFavourites<T extends { id: string }>(games: readonly T[], favourites: readonly string[]): T[] {
  const fav = new Set(favourites);
  return [...games.filter((g) => fav.has(g.id)), ...games.filter((g) => !fav.has(g.id))];
}

/** Stars or unstars a game. Returns whether it is now a favourite. */
export function toggleFavourite(s: Settings, id: string): boolean {
  const i = s.favourites.indexOf(id);
  if (i >= 0) s.favourites.splice(i, 1);
  else s.favourites.push(id);
  return i < 0;
}
