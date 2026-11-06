import { describe, expect, test } from 'vitest';
import { Board } from '../src/core/board';
import { specFor, TUTORIAL_COUNT } from '../src/core/difficulty';
import { generate } from '../src/core/generator';
import { buildLevel } from '../src/core/levels';
import { solve } from '../src/core/solver';
import { Arrow, DELTA, Level, dirBetween } from '../src/core/types';

function checkShape(level: Pick<Level, 'w' | 'h' | 'arrows'>, packed: boolean) {
  const seen = new Set<string>();
  for (const a of level.arrows) {
    expect(a.cells.length).toBeGreaterThan(0);
    for (let i = 0; i < a.cells.length; i++) {
      const c = a.cells[i];
      expect(c.x >= 0 && c.y >= 0 && c.x < level.w && c.y < level.h).toBe(true);
      const k = `${c.x},${c.y}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      if (i > 0) expect(dirBetween(a.cells[i - 1], c)).not.toBeNull();
    }
    if (a.cells.length > 1) {
      // Head direction matches the last segment.
      expect(dirBetween(a.cells[a.cells.length - 2], a.cells[a.cells.length - 1])).toBe(a.dir);
    }
    // Never blocked by its own body.
    const head = a.cells[a.cells.length - 1];
    const d = DELTA[a.dir];
    const own = new Set(a.cells.map((c) => `${c.x},${c.y}`));
    for (let x = head.x + d.x, y = head.y + d.y; x >= 0 && y >= 0 && x < level.w && y < level.h; x += d.x, y += d.y) {
      expect(own.has(`${x},${y}`)).toBe(false);
    }
  }
  if (packed) expect(seen.size).toBe(level.w * level.h);
}

describe('board', () => {
  const arrows: Arrow[] = [
    { id: 0, cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], dir: 'R' },
    { id: 1, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }], dir: 'D' },
  ];
  test('blocking and removal', () => {
    const b = new Board({ w: 3, h: 3, arrows });
    expect(b.isFree(arrows[0])).toBe(false);
    expect(b.blocker(arrows[0])).toMatchObject({ id: 1, dist: 1 });
    expect(b.isFree(arrows[1])).toBe(true);
    expect(b.freeArrows().map((a) => a.id)).toEqual([1]);
    b.remove(1);
    expect(b.isFree(arrows[0])).toBe(true);
    expect(b.distToEdge(arrows[0])).toBe(2);
  });
  test('solver detects cycles', () => {
    const cyc: Arrow[] = [
      { id: 0, cells: [{ x: 0, y: 0 }], dir: 'R' },
      { id: 1, cells: [{ x: 1, y: 0 }], dir: 'L' },
    ];
    expect(solve({ w: 2, h: 1, arrows: cyc }).solvable).toBe(false);
    expect(solve({ w: 3, h: 3, arrows }).solvable).toBe(true);
  });
  test('solver reports the share of free arrows during play', () => {
    // One of two arrows is free at the start; after that the last one finishes itself.
    expect(solve({ w: 3, h: 3, arrows }).freeShare).toBe(0.5);
  });
});

describe('generator', () => {
  test('packed, solvable and self-consistent across seeds and sizes', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const w = 4 + (seed % 12);
      const h = 5 + ((seed * 7) % 16);
      const g = generate(seed, { w, h, minLen: 2 + (seed % 3), maxLen: 4 + (seed % 12), straightness: 0.5, candidates: 1 });
      checkShape(g, true);
      expect(solve(g).solvable).toBe(true);
    }
  });
  test('tightening keeps boards solvable and cuts the free moves', () => {
    let before = 0;
    let after = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const p = { w: 12, h: 19, minLen: 3, maxLen: 9, straightness: 0.5, candidates: 1 };
      const loose = generate(seed, p);
      const tight = generate(seed, { ...p, tighten: 8 });
      checkShape(tight, true);
      expect(solve(tight).solvable).toBe(true);
      before += loose.freeShare;
      after += tight.freeShare;
    }
    expect(after).toBeLessThan(before * 0.8);
  });
  test('deterministic per seed', () => {
    const p = { w: 10, h: 16, minLen: 3, maxLen: 9, straightness: 0.5, candidates: 2 };
    expect(JSON.stringify(generate(42, p))).toBe(JSON.stringify(generate(42, p)));
  });
});

describe('levels', () => {
  test('tutorials are valid and solvable', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) {
      const l = buildLevel(n);
      checkShape(l, n > 3);
      expect(solve(l).solvable).toBe(true);
    }
  });
  test('generated levels across the ramp and beyond', () => {
    for (const n of [6, 12, 20, 28, 35, 41, 77, 150]) {
      const l = buildLevel(n);
      checkShape(l, true);
      expect(solve(l).solvable).toBe(true);
      expect(l.difficulty).toBe(specFor(n).difficulty);
    }
  }, 60000);
  test('difficulty ramps then favours harder levels', () => {
    expect(specFor(TUTORIAL_COUNT + 1).difficulty).toBe('Easy');
    expect(specFor(TUTORIAL_COUNT + 30).difficulty).toBe('Super Hard');
    const counts: Record<string, number> = {};
    for (let n = 40; n < 440; n++) counts[specFor(n).difficulty] = (counts[specFor(n).difficulty] ?? 0) + 1;
    expect(counts['Hard'] + counts['Super Hard']).toBeGreaterThan(counts['Easy'] + counts['Medium']);
  });
});
