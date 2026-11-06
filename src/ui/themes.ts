export interface Theme {
  id: string;
  name: string;
  bg: string;
  surface: string;
  line: string;
  accent: string;
  /** Arrows that are sliding off the board. */
  moving: string;
  danger: string;
  text: string;
  muted: string;
  heart: string;
  confetti: string[];
}

export const THEMES: Theme[] = [
  {
    id: 'paper',
    name: 'Paper',
    bg: '#f5ecdc',
    surface: '#fbf5ea',
    line: '#6a4a2c',
    accent: '#e3a23b',
    moving: '#3f8f6b',
    danger: '#c9473d',
    text: '#5b3c22',
    muted: '#a58a6d',
    heart: '#e0475b',
    confetti: ['#e3a23b', '#c9473d', '#4fa3e6', '#6a9a4c', '#6a4a2c'],
  },
  {
    id: 'night',
    name: 'Night',
    bg: '#1c1916',
    surface: '#26221e',
    line: '#e7d5b6',
    accent: '#f2b84f',
    moving: '#6fd0a8',
    danger: '#ff6f61',
    text: '#f0e4d0',
    muted: '#8f806c',
    heart: '#ff6b7f',
    confetti: ['#f2b84f', '#ff6f61', '#5fb3f0', '#8fcf6a', '#e7d5b6'],
  },
  {
    id: 'sage',
    name: 'Sage',
    bg: '#e6ece0',
    surface: '#f1f5ec',
    line: '#3d5839',
    accent: '#d8873b',
    moving: '#2f7fb5',
    danger: '#b9443a',
    text: '#33492f',
    muted: '#86977f',
    heart: '#d6455a',
    confetti: ['#d8873b', '#b9443a', '#4c9bd6', '#3d5839', '#e0c04a'],
  },
  {
    id: 'harbour',
    name: 'Harbour',
    bg: '#e9eef4',
    surface: '#f4f7fa',
    line: '#253a55',
    accent: '#e8a637',
    moving: '#2f9a7a',
    danger: '#c84a4a',
    text: '#22344c',
    muted: '#8090a5',
    heart: '#dc4459',
    confetti: ['#e8a637', '#c84a4a', '#3f95dc', '#253a55', '#5fb08a'],
  },
];

export const THEME_ORDER = ['auto', ...THEMES.map((t) => t.id)];

export function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolveTheme(id: string): Theme {
  if (id === 'auto') return prefersDark() ? THEMES[1] : THEMES[0];
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function themeLabel(id: string): string {
  return id === 'auto' ? 'Auto (light/dark)' : resolveTheme(id).name;
}

export function applyTheme(t: Theme): void {
  const r = document.documentElement.style;
  r.setProperty('--bg', t.bg);
  r.setProperty('--surface', t.surface);
  r.setProperty('--line', t.line);
  r.setProperty('--accent', t.accent);
  r.setProperty('--danger', t.danger);
  r.setProperty('--text', t.text);
  r.setProperty('--muted', t.muted);
  r.setProperty('--heart', t.heart);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}
