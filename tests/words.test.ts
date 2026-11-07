import { describe, expect, test } from 'vitest';
import { rateWords, targetsFor, TUTORIAL_COUNT, WORDS_THRESHOLDS } from '../src/games/words/core/difficulty';
import { dictionaryTrie, WORDS } from '../src/games/words/core/dictionary';
import { buildWordsLevel } from '../src/games/words/core/levels';
import { buildTrie, findWords, neighbours, pathOf, pointsFor } from '../src/games/words/core/trie';
import { WordsLevel } from '../src/games/words/core/types';
import { Session } from '../src/games/words/game/session';
import { loadWords, recordRound, resetWords, WORDS_KEY } from '../src/games/words/game/storage';

describe('word list', () => {
  test('is a clean list of everyday lower-case words, 3 to 10 letters', () => {
    expect(WORDS.length).toBeGreaterThan(45000);
    expect(WORDS.every((w) => /^[a-z]{3,10}$/.test(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of ['cats', 'walked', 'running', 'colour', 'color', 'centre', 'quieter']) expect(WORDS).toContain(w);
  });

  test('leaves out offensive words', () => {
    for (const w of ['fuck', 'shit', 'cunt', 'bitch', 'slut']) expect(WORDS).not.toContain(w);
  });
});

describe('finding words', () => {
  // A 3x3 grid:
  //   c a t
  //   x r s
  //   x x e
  const letters = ['c', 'a', 't', 'x', 'r', 's', 'x', 'x', 'e'];
  const trie = buildTrie(['cat', 'cats', 'car', 'cars', 'art', 'arts', 'rat', 'rate', 'tar', 'tars', 'cast', 'scar', 'xyz']);

  test('neighbours include diagonals', () => {
    expect(neighbours(3, 4).sort()).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(neighbours(3, 0).sort()).toEqual([1, 3, 4]);
  });

  test('every traceable word is found, and only those', () => {
    const got = findWords(3, letters, trie).sort();
    // "cast" works (a to s is a diagonal step). "rate" doesn't (t and e aren't touching),
    // nor does "scar" (s and c aren't), and "xyz" has no y.
    expect(got).toEqual(['art', 'arts', 'car', 'cars', 'cast', 'cat', 'cats', 'rat', 'tar', 'tars']);
  });

  test('a square is used only once per word', () => {
    const t = buildTrie(['aaa', 'aa']);
    expect(findWords(2, ['a', 'a', 'x', 'x'], t)).toEqual([]);
    expect(findWords(2, ['a', 'a', 'a', 'x'], t)).toEqual(['aaa']);
  });

  test('a path can be found for a word on the grid', () => {
    const p = pathOf(3, letters, 'cats')!;
    expect(p.map((i) => letters[i]).join('')).toBe('cats');
    expect(pathOf(3, letters, 'dog')).toBeNull();
  });

  test('longer words score more', () => {
    expect([3, 4, 5, 6, 7, 8].map((n) => pointsFor('x'.repeat(n)))).toEqual([1, 1, 2, 3, 5, 11]);
  });
});

describe('levels', () => {
  const built = new Map<number, WordsLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildWordsLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 40 list exactly the words their grids hold', () => {
    const trie = dictionaryTrie();
    for (let n = 1; n <= 40; n++) {
      const l = get(n);
      expect(l.letters.length).toBe(l.size * l.size);
      expect(l.words).toEqual(findWords(l.size, l.letters, trie));
      expect(l.words.length).toBeGreaterThanOrEqual(20);
      expect(l.words[0].length).toBeGreaterThanOrEqual(6);
      expect(l.targets).toEqual(targetsFor(l.words.length));
      expect(l.targets[2]).toBeLessThanOrEqual(l.words.length);
    }
  });

  test('the same level is the same grid every time, and labels follow the word count', () => {
    for (const n of [1, 12, 33]) expect(buildWordsLevel(n)).toEqual(get(n));
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 40; n++) expect(get(n).difficulty).toBe(rateWords(get(n).words.length));
    expect(rateWords(WORDS_THRESHOLDS[0])).toBe('Easy');
    expect(rateWords(WORDS_THRESHOLDS[2] - 1)).toBe('Super Hard');
  });

  test('star targets are a share of the words, within limits', () => {
    expect(targetsFor(200)).toEqual([10, 20, 30]);
    expect(targetsFor(60)).toEqual([7, 13, 20]);
    expect(targetsFor(20)).toEqual([4, 8, 12]);
  });
});

describe('session', () => {
  const lvl = (): WordsLevel => {
    const letters = ['c', 'a', 't', 'x', 'r', 's', 'x', 'x', 'e'];
    const words = findWords(3, letters, buildTrie(['cat', 'cats', 'car', 'art', 'rate', 'scar']));
    return { number: 1, size: 3, letters, words, targets: [1, 2, 3], seconds: 60, difficulty: 'Easy' };
  };

  test('tracing a word scores it once', () => {
    const s = new Session(lvl());
    expect(s.submit([0, 1, 2])).toEqual({ kind: 'new', word: 'cat', points: 1 });
    expect(s.submit([0, 1, 2]).kind).toBe('again');
    expect(s.submit([0, 1]).kind).toBe('short');
    expect(s.submit([4, 1, 2]).kind).toBe('unknown'); // "rat" isn't in this level's list
    expect(s.found).toEqual(['cat']);
    expect(s.stars).toBe(1);
  });

  test('paths must step to a touching square, without reusing one', () => {
    const s = new Session(lvl());
    expect(s.canExtend([0], 1)).toBe(true);
    expect(s.canExtend([0], 2)).toBe(false); // not beside
    expect(s.canExtend([0, 1], 0)).toBe(false); // already used
  });

  test('hints point at a word not yet found, and run out', () => {
    const s = new Session(lvl());
    const h = s.useHint()!;
    expect(s.level.words).toContain(h.word);
    expect(h.path.map((i) => s.level.letters[i]).join('')).toBe(h.word);
    s.useHint();
    s.useHint();
    expect(s.useHint()).toBeNull();
  });

  test('time running out ends the round; nothing scores after', () => {
    const s = new Session(lvl());
    s.leftMs = 0;
    expect(s.over).toBe(true);
    expect(s.submit([0, 1, 2]).kind).toBe('unknown');
  });
});

describe('storage', () => {
  test('keeps bests, and unlocks the next level only with a star', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadWords();
    recordRound(p, 1, 0, 4, 3);
    expect(p.unlocked).toBe(1);
    recordRound(p, 1, 2, 30, 18);
    recordRound(p, 1, 1, 12, 9);
    expect(p.levels[1]).toEqual({ stars: 2, bestPoints: 30, bestWords: 18 });
    expect(p.unlocked).toBe(2);
    expect(JSON.parse(mem.get(WORDS_KEY)!).unlocked).toBe(2);
    resetWords(p);
    expect(loadWords()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
