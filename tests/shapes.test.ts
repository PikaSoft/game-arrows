import { beforeEach, describe, expect, test } from 'vitest';
import { clearPoints, ShapeGame, SIZE } from '../src/games/shapes/core/game';
import { PIECES } from '../src/games/shapes/core/pieces';
import { loadShapes, noteBests, recordGame, resetShapes, saveShapes, SHAPES_KEY } from '../src/games/shapes/game/storage';
import { HELP } from '../src/games/help';
import { Rng } from '../src/shared/rng';

const byPicture = (rows: string[]) => {
  const want = rows.flatMap((r, y) => [...r].map((ch, x) => (ch === '#' ? `${x},${y}` : ''))).filter(Boolean).sort().join(' ');
  return PIECES.findIndex((p) => p.cells.map(([x, y]) => `${x},${y}`).sort().join(' ') === want);
};

/** A game with a chosen board and tray. */
function setUp(cells: number[], tray: number[]): ShapeGame {
  const g = new ShapeGame(1);
  g.cells = cells;
  g.tray = tray;
  g.over = false;
  return g;
}

describe('pieces', () => {
  test('every piece is well formed and different', () => {
    const seen = new Set<string>();
    for (const p of PIECES) {
      expect(p.cells.length).toBeGreaterThan(0);
      for (const [x, y] of p.cells) {
        expect(x).toBeLessThan(p.w);
        expect(y).toBeLessThan(p.h);
      }
      expect(Math.max(...p.cells.map(([x]) => x))).toBe(p.w - 1);
      expect(Math.max(...p.cells.map(([, y]) => y))).toBe(p.h - 1);
      const key = p.cells.map((c) => c.join()).sort().join(' ');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('game', () => {
  test('a piece fits only inside the board and on empty squares', () => {
    const dot = byPicture(['#']);
    const bar = byPicture(['####']);
    const g = setUp(new Array(64).fill(0), [dot, bar, dot]);
    expect(g.fits(bar, 4, 0)).toBe(true);
    expect(g.fits(bar, 5, 0)).toBe(false);
    g.cells[6] = 1;
    expect(g.fits(bar, 4, 0)).toBe(false);
    expect(g.fits(dot, 7, 7)).toBe(true);
  });

  test('filling a row and a column clears both, with the crossing square counted once', () => {
    const cells = new Array(64).fill(0);
    for (let x = 0; x < SIZE; x++) if (x !== 3) cells[2 * SIZE + x] = 1; // row 2, gap at x = 3
    for (let y = 0; y < SIZE; y++) if (y !== 2) cells[y * SIZE + 3] = 2; // column 3, gap at y = 2
    const dot = byPicture(['#']);
    const g = setUp(cells, [dot, dot, dot]);
    const r = g.place(0, 3, 2)!;
    expect(r.rows).toEqual([2]);
    expect(r.cols).toEqual([3]);
    expect(r.cleared.length).toBe(15);
    expect(g.cells.every((v) => v === 0)).toBe(true);
    expect(r.gained).toBe(1 + clearPoints(2, 1));
    expect(g.lines).toBe(2);
    expect(g.streak).toBe(1);
  });

  test('points: more lines at once and streaks score more', () => {
    expect(clearPoints(0, 0)).toBe(0);
    expect(clearPoints(1, 1)).toBe(10);
    expect(clearPoints(2, 1)).toBe(40);
    expect(clearPoints(3, 1)).toBe(90);
    expect(clearPoints(1, 3)).toBe(30);
  });

  test('placing all three deals a new set, and a full board ends the game', () => {
    const dot = byPicture(['#']);
    const g = setUp(new Array(64).fill(0), [dot, dot, dot]);
    g.place(0, 0, 0);
    g.place(1, 2, 0);
    expect(g.tray.filter((t) => t >= 0)).toHaveLength(1);
    const r = g.place(2, 4, 0)!;
    expect(r.dealt).toBe(true);
    expect(g.tray.every((t) => t >= 0)).toBe(true);
    // A board full but for one square, and only big pieces: no fit.
    const cells = new Array(64).fill(1);
    cells[0] = 0;
    cells[63] = 0;
    const square = byPicture(['##', '##']);
    const h = setUp(cells, [square, -1, -1]);
    expect(h.anyFits()).toBe(false);
    expect(h.place(0, 0, 0)).toBeNull();
  });

  test('new sets can be placed in full whenever possible', () => {
    for (let s = 1; s <= 30; s++) {
      const g = new ShapeGame(s);
      expect(g.canPlaceAll(g.tray.slice())).toBe(true);
    }
  });

  test('a tidy player gets a long game, and saving carries it on', () => {
    const rng = new Rng(4);
    const g = new ShapeGame(9);
    while (!g.over && g.placed < 60) {
      // Prefer clears, then the first spot that fits.
      let pick: [number, number, number] | null = null;
      let bestLines = -1;
      g.tray.forEach((id, slot) => {
        if (id < 0) return;
        for (let y = 0; y < SIZE; y++)
          for (let x = 0; x < SIZE; x++) {
            if (!g.fits(id, x, y)) continue;
            const c = g.wouldClear(id, x, y);
            const n = c.rows.length + c.cols.length;
            if (n > bestLines || (n === bestLines && rng.next() < 0.02)) {
              bestLines = n;
              pick = [slot, x, y];
            }
          }
      });
      const [slot, x, y] = pick!;
      g.place(slot, x, y);
    }
    expect(g.placed).toBeGreaterThanOrEqual(20);
    const copy = new ShapeGame(123, g.save());
    expect(copy.cells).toEqual(g.cells);
    expect(copy.tray).toEqual(g.tray);
    expect(copy.score).toBe(g.score);
    expect(copy.lines).toBe(g.lines);
  });
});

describe('help', () => {
  test('the first-game tip is in How to play', async () => {
    const { FIRST_TIP } = await import('../src/games/shapes/ui');
    expect(HELP.shapes.tips).toContain(FIRST_TIP);
  });
});

describe('storage', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
  });

  test('keeps bests and the game in progress, and resets', () => {
    const p = loadShapes();
    p.saved = new ShapeGame(3).save();
    noteBests(p, 120, 5);
    saveShapes(p);
    expect(loadShapes().saved).toEqual(p.saved);
    recordGame(p, 90, 7);
    const q = loadShapes();
    expect(q).toMatchObject({ bestScore: 120, bestLines: 7, games: 1, saved: null });
    expect(JSON.parse(mem.get(SHAPES_KEY)!).games).toBe(1);
    resetShapes(q);
    expect(loadShapes()).toEqual({ bestScore: 0, bestLines: 0, games: 0, saved: null });
  });
});
