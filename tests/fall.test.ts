import { beforeEach, describe, expect, test } from 'vitest';
import { HELP } from '../src/games/help';
import { kicks, PieceId, SHAPES } from '../src/games/fall/core/pieces';
import { CLEAR_MS, COLS, FallSim, gravityMs, HIDDEN, LOCK_MS, LOCK_RESETS, ROWS } from '../src/games/fall/core/sim';
import { FALL_KEY, loadFall, recordGame, resetFall } from '../src/games/fall/game/storage';

/** Fill a row except the given columns. */
function fillRow(s: FallSim, y: number, gaps: number[] = []) {
  for (let x = 0; x < COLS; x++) s.board[y * COLS + x] = gaps.includes(x) ? 0 : 8 - 1;
}

/** Make the current piece a given one at spawn. */
function force(s: FallSim, id: PieceId) {
  s.piece = { id, rot: 0, x: id === 1 ? 4 : 3, y: 1 };
}

describe('pieces', () => {
  test('every shape has four cells inside its box in every rotation, and four turns come back round', () => {
    for (const shape of SHAPES) {
      for (const cells of shape) expect(cells).toHaveLength(4);
      const box = shape[0].reduce((m, [x, y]) => Math.max(m, x, y), 0) + 1;
      for (const cells of shape) for (const [x, y] of cells) expect(Math.max(x, y)).toBeLessThan(box + (box === 2 ? 0 : 1));
    }
    // The square looks the same every way round.
    for (let r = 1; r < 4; r++) expect(new Set(SHAPES[1][r].map(String))).toEqual(new Set(SHAPES[1][0].map(String)));
  });

  test('kicks always try the turn in place first', () => {
    for (let id = 0; id < 7; id++) for (let r = 0; r < 4; r++) expect(kicks(id as PieceId, r, (r + 1) % 4)[0]).toEqual([0, 0]);
  });
});

describe('sim', () => {
  test('pieces come in shuffled sets of seven', () => {
    const s = new FallSim(5);
    const seq: number[] = [s.piece!.id, ...s.queue.slice(0, 13)];
    expect(new Set(seq.slice(0, 7)).size).toBe(7);
    expect(new Set(seq.slice(7, 14)).size).toBe(7);
  });

  test('the same seed gives the same pieces', () => {
    const a = new FallSim(42);
    const b = new FallSim(42);
    expect(a.queue).toEqual(b.queue);
    expect(a.piece).toEqual(b.piece);
  });

  test('a piece spawns in view and in the middle', () => {
    const s = new FallSim(1);
    const cells = s.cells(s.piece!);
    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThanOrEqual(6);
      expect(y).toBeGreaterThanOrEqual(1);
    }
    expect(cells.some(([, y]) => y >= HIDDEN)).toBe(true);
  });

  test('moves stop at the walls', () => {
    const s = new FallSim(1);
    while (s.move(-1));
    expect(Math.min(...s.cells(s.piece!).map((c) => c[0]))).toBe(0);
    while (s.move(1));
    expect(Math.max(...s.cells(s.piece!).map((c) => c[0]))).toBe(COLS - 1);
  });

  test('a turn against the wall kicks the piece off it', () => {
    const s = new FallSim(1);
    force(s, 0);
    expect(s.rotate(1)).toBe(true); // upright bar
    while (s.move(-1));
    expect(Math.min(...s.cells(s.piece!).map((c) => c[0]))).toBe(0);
    expect(s.rotate(1)).toBe(true); // flat again, pushed off the wall
    for (const [x] of s.cells(s.piece!)) expect(x).toBeGreaterThanOrEqual(0);
  });

  test('four turns bring a piece back to how it started when nothing is in the way', () => {
    const s = new FallSim(3);
    force(s, 2);
    s.piece!.y = 8;
    const before = { ...s.piece! };
    for (let i = 0; i < 4; i++) s.rotate(1);
    expect(s.piece).toEqual(before);
  });

  test('hard drop lands on the ghost and scores 2 a row', () => {
    const s = new FallSim(1);
    const g = s.ghost()!;
    const d = s.dropDistance();
    const cellsAtGhost = s.cells(g);
    const r = s.hardDrop()!;
    expect(r.rows).toEqual([]);
    expect(s.score).toBe(2 * d);
    for (const [x, y] of cellsAtGhost) expect(s.board[y * COLS + x]).toBeGreaterThan(0);
    expect(Math.max(...cellsAtGhost.map((c) => c[1]))).toBe(ROWS - 1);
  });

  test('soft drop moves one row and scores 1', () => {
    const s = new FallSim(1);
    const y = s.piece!.y;
    expect(s.softDrop()).toBe(true);
    expect(s.piece!.y).toBe(y + 1);
    expect(s.score).toBe(1);
  });

  test('gravity pulls the piece down and speeds up with the level', () => {
    const s = new FallSim(1);
    const y = s.piece!.y;
    s.step(gravityMs(1) * 3 + 1);
    expect(s.piece!.y).toBe(y + 3);
    expect(gravityMs(1)).toBeCloseTo(1000);
    for (let l = 2; l <= 20; l++) expect(gravityMs(l)).toBeLessThanOrEqual(gravityMs(l - 1));
    for (let l = 2; l <= 12; l++) expect(gravityMs(l)).toBeLessThan(gravityMs(l - 1));
    expect(gravityMs(25)).toBe(gravityMs(20));
  });

  test('a landed piece locks after the lock delay, and moving restarts it a limited number of times', () => {
    const s = new FallSim(1);
    force(s, 1); // the square: easy to slide back and forth
    while (s.softDrop());
    s.step(LOCK_MS - 10);
    expect(s.piece).not.toBeNull();
    const id = s.pieces;
    // Shuffle back and forth to keep it from locking.
    for (let i = 0; i < LOCK_RESETS; i++) {
      expect(s.move(i % 2 ? 1 : -1)).toBe(true);
      s.step(LOCK_MS - 10);
      expect(s.pieces).toBe(id);
    }
    // Out of resets: it locks.
    s.move(1);
    const r = s.step(20);
    expect(r.lock).not.toBeNull();
    expect(s.pieces).toBe(id + 1);
  });

  test('clearing rows scores by count and level, flashes, then drops the rows above', () => {
    const cases: [number, number][] = [
      [1, 100],
      [2, 300],
      [3, 500],
      [4, 800],
    ];
    for (const [n, pts] of cases) {
      const s = new FallSim(7);
      for (let i = 0; i < n; i++) fillRow(s, ROWS - 1 - i, [0]);
      s.board[(ROWS - 1 - n) * COLS + 5] = 3; // a block above that should drop
      force(s, 0);
      s.rotate(1); // upright bar
      while (s.move(-1));
      const r = s.hardDrop()!;
      expect(r.rows).toHaveLength(n);
      expect(s.clearing).not.toBeNull();
      expect(s.piece).toBeNull();
      expect(s.lines).toBe(n);
      const dropped = s.score - r.points;
      expect(r.points).toBe(pts);
      expect(dropped).toBeGreaterThan(0);
      s.step(CLEAR_MS + 1);
      expect(s.clearing).toBeNull();
      expect(s.piece).not.toBeNull();
      // The lone block fell n rows, to the bottom row (n < 4) and the rest is empty.
      expect(s.board[(ROWS - 1) * COLS + 5]).toBe(3);
    }
  });

  test('four rows after four rows is worth half as much again, and runs of clears add a combo', () => {
    const s = new FallSim(9);
    const tetra = () => {
      for (let i = 0; i < 4; i++) fillRow(s, ROWS - 1 - i, [9]);
      force(s, 0);
      s.rotate(1);
      while (s.move(1));
      const r = s.hardDrop()!;
      s.settle();
      return r;
    };
    const a = tetra();
    expect(a.points).toBe(800);
    expect(a.backToBack).toBe(false);
    const b = tetra();
    expect(b.backToBack).toBe(true);
    expect(b.combo).toBe(1);
    expect(b.points).toBe(1200 + 50);
  });

  test('every 10 rows is a level', () => {
    const s = new FallSim(2);
    s.lines = 9;
    fillRow(s, ROWS - 1, [9]);
    force(s, 0);
    s.rotate(1);
    while (s.move(1));
    const r = s.hardDrop()!;
    expect(r.levelUp).toBe(true);
    expect(s.level).toBe(2);
  });

  test('hold swaps the piece once per piece', () => {
    const s = new FallSim(4);
    const first = s.piece!.id;
    const second = s.queue[0];
    expect(s.holdPiece()).toBe(true);
    expect(s.hold).toBe(first);
    expect(s.piece!.id).toBe(second);
    expect(s.holdPiece()).toBe(false);
    s.hardDrop();
    expect(s.holdPiece()).toBe(true);
    expect(s.piece!.id).toBe(first);
  });

  test('the game ends when a new piece has no room', () => {
    const s = new FallSim(6);
    for (let y = 2; y < ROWS; y++) fillRow(s, y, [y % COLS]);
    s.piece = { ...s.piece!, y: 0 };
    const r = s.hardDrop()!;
    expect(r.over).toBe(true);
    expect(s.over).toBe(true);
    expect(s.move(1)).toBe(false);
  });

  test('a game played by dropping pieces straight down always ends', () => {
    const s = new FallSim(11);
    let n = 0;
    while (!s.over && n < 500) {
      s.hardDrop();
      s.settle();
      n++;
    }
    expect(s.over).toBe(true);
  });
});

describe('storage', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    };
  });

  test('records bests and resets', () => {
    const p = loadFall();
    expect(recordGame(p, 500, 8, 1)).toBe(0);
    expect(recordGame(p, 300, 12, 2)).toBe(500);
    expect(p).toEqual({ best: 500, bestLines: 12, bestLevel: 2, runs: 2 });
    expect(JSON.parse(localStorage.getItem(FALL_KEY)!)).toEqual(p);
    resetFall(p);
    expect(loadFall()).toEqual({ best: 0, bestLines: 0, bestLevel: 0, runs: 0 });
  });
});

describe('help', () => {
  test('the first tip is in the help card', async () => {
    const { FIRST_TIP } = await import('../src/games/fall/ui');
    expect(HELP.fall.tips).toContain(FIRST_TIP);
  });
});
