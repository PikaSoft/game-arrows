import { Rng } from '../../../shared/rng';
import { rateWords, targetsFor, TUTORIAL_COUNT, wordsSpecFor } from './difficulty';
import { dictionaryTrie } from './dictionary';
import { findWords } from './trie';
import { WordsLevel } from './types';

/** How often each letter is drawn: roughly English letter frequencies, S a little higher for plurals. */
const FREQ: Record<string, number> = {
  e: 12, t: 9, a: 8.5, o: 7.5, i: 7.5, n: 6.7, s: 6.5, r: 6, h: 4.5, d: 4.2, l: 4, u: 3, c: 2.8, m: 2.4,
  g: 2.2, f: 2, p: 2, w: 1.8, y: 1.8, b: 1.6, v: 1, k: 0.9, j: 0.2, x: 0.2, q: 0.1, z: 0.1,
};
const LETTERS = Object.keys(FREQ);
const TOTAL = Object.values(FREQ).reduce((a, b) => a + b, 0);
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function draw(rng: Rng): string {
  let r = rng.next() * TOTAL;
  for (const l of LETTERS) {
    r -= FREQ[l];
    if (r <= 0) return l;
  }
  return 'e';
}

/**
 * Draw grids from the weighted letter bag and find every word in each. Skip grids with
 * too few or too many vowels, too few words, or no word of 6 letters or more. Keep the one
 * whose word count is closest to the level's target.
 */
export function buildWordsLevel(n: number): WordsLevel {
  const spec = wordsSpecFor(n);
  const rng = new Rng(n * 48611 + 5);
  const trie = dictionaryTrie();
  const cells = spec.size * spec.size;
  let best: { letters: string[]; words: string[] } | null = null;
  const off = (words: string[]) => Math.abs(words.length - spec.target);
  for (let attempt = 0; attempt < 200; attempt++) {
    const letters = Array.from({ length: cells }, () => draw(rng));
    const vowels = letters.filter((l) => VOWELS.has(l)).length / cells;
    if (vowels < 0.25 || vowels > 0.5) continue;
    const words = findWords(spec.size, letters, trie);
    if (words.length < 20 || words[0].length < 6) continue;
    if (!best || off(words) < off(best.words)) best = { letters, words };
    if (off(best.words) <= 3) break;
  }
  const b = best!;
  return {
    number: n,
    size: spec.size,
    letters: b.letters,
    words: b.words,
    targets: targetsFor(b.words.length),
    seconds: spec.seconds,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateWords(b.words.length),
    score: b.words.length,
    tip: spec.tip,
  };
}
