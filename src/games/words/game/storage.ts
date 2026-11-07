/** Word Grid progress: per level, the best stars, points and words found. */
export interface WordsRecord {
  stars: number;
  bestPoints: number;
  bestWords: number;
}

export interface WordsProgress {
  unlocked: number;
  current: number;
  levels: Record<number, WordsRecord>;
}

export const WORDS_KEY = 'words.v1';

const defaults = (): WordsProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadWords(): WordsProgress {
  try {
    const raw = localStorage.getItem(WORDS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<WordsProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveWords(p: WordsProgress): void {
  try {
    localStorage.setItem(WORDS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/**
 * Record a finished round. Bests are kept either way; the next level unlocks only with at
 * least one star. Returns the record before this round.
 */
export function recordRound(p: WordsProgress, level: number, stars: number, points: number, words: number): WordsRecord | undefined {
  const prev = p.levels[level];
  p.levels[level] = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bestPoints: Math.max(points, prev?.bestPoints ?? 0),
    bestWords: Math.max(words, prev?.bestWords ?? 0),
  };
  if (stars > 0) {
    p.unlocked = Math.max(p.unlocked, level + 1);
    p.current = Math.max(p.current, level + 1);
  }
  saveWords(p);
  return prev;
}

export function resetWords(p: WordsProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveWords(p);
}
