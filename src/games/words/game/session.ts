import { neighbours, pathOf, pointsFor } from '../core/trie';
import { WordsLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

export type SubmitKind = 'new' | 'again' | 'short' | 'unknown';

export interface SubmitResult {
  kind: SubmitKind;
  word: string;
  points: number;
}

/** One round of Word Grid: the words found, points and time left. */
export class Session {
  found: string[] = [];
  points = 0;
  /** Milliseconds left in the round. */
  leftMs: number;
  hints = HINTS_PER_LEVEL;
  /** The word the last hint pointed at, until it's found. */
  hint: { word: string; path: number[] } | null = null;
  private words: Set<string>;

  constructor(readonly level: WordsLevel) {
    this.leftMs = level.seconds * 1000;
    this.words = new Set(level.words);
  }

  get over(): boolean {
    return this.leftMs <= 0;
  }
  get stars(): number {
    return this.level.targets.filter((t) => this.found.length >= t).length;
  }

  /** The word a traced path spells. */
  spell(path: number[]): string {
    return path.map((i) => this.level.letters[i]).join('');
  }

  /** True if square j can come next after `path`: beside the last square and not used yet. */
  canExtend(path: number[], j: number): boolean {
    if (path.includes(j)) return false;
    return !path.length || neighbours(this.level.size, path[path.length - 1]).includes(j);
  }

  /** Try the word a traced path spells. */
  submit(path: number[]): SubmitResult {
    const word = this.spell(path);
    if (word.length < 3) return { kind: 'short', word, points: 0 };
    if (!this.words.has(word)) return { kind: 'unknown', word, points: 0 };
    if (this.found.includes(word)) return { kind: 'again', word, points: 0 };
    if (this.over) return { kind: 'unknown', word, points: 0 };
    const points = pointsFor(word);
    this.found.push(word);
    this.points += points;
    if (this.hint?.word === word) this.hint = null;
    return { kind: 'new', word, points };
  }

  /**
   * Point at a word not yet found: the longest of 5 to 7 letters if there is one (worth
   * having, and not too obscure), else any. Shows where it starts and how long it is.
   * Hints are free.
   */
  useHint(): { word: string; path: number[] } | null {
    if (this.hints <= 0 || this.over) return null;
    const left = this.level.words.filter((w) => !this.found.includes(w));
    if (!left.length) return null;
    const word = left.find((w) => w.length >= 5 && w.length <= 7) ?? left[0];
    const path = pathOf(this.level.size, this.level.letters, word);
    if (!path) return null;
    this.hints--;
    this.hint = { word, path };
    return this.hint;
  }

  /** The longest words not found, for the end of the round. */
  missed(count: number): string[] {
    return this.level.words.filter((w) => !this.found.includes(w)).slice(0, count);
  }
}
