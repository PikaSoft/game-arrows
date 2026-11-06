import { Settings } from '../shared/settings';
import { Sfx } from '../shared/sfx';
import { Theme } from '../shared/themes';

/** What the collection shell gives each game. */
export interface Shell {
  app: HTMLElement;
  sfx: Sfx;
  settings: Settings;
  theme(): Theme;
  /** Called with the new theme whenever the colours change. */
  onTheme(fn: (t: Theme) => void): void;
  setTheme(id: string): void;
  cycleTheme(): void;
  /** Show one screen (by element id) and hide the rest. */
  show(screenId: string): void;
  /** Back to the collection's home screen. */
  goHub(): void;
  toast(msg: string): void;
  openModal(html: string, onClick: (action: string, el: HTMLElement) => void, dismissable?: boolean): void;
  closeModal(): void;
  modalOpen(): boolean;
  openSettings(): void;
  vibrate(pattern: number | number[]): void;
}

export interface GameSummary {
  /** e.g. "Level 12" or "Start playing". */
  status: string;
  stars: number;
}

export interface GameModule {
  id: string;
  name: string;
  tagline: string;
  /** SVG markup for the hub card. */
  icon: string;
  summary(): GameSummary;
  /** Open the game's own home screen. */
  enter(): void;
  /** Leaving the game (back to hub). Stop timers, close anything open. */
  leave(): void;
  resetProgress(): void;
  /** True when Escape should not close the current modal. */
  modalLocked?(): boolean;
}
