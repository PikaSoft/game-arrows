import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { buildSnakeLevel, connected, START_RUNWAY, startFits } from '../src/games/snake/core/levels';
import { SnakeSim } from '../src/games/snake/core/sim';
import { DX, DY } from '../src/games/snake/core/types';
import { trailStars } from '../src/games/snake/ui';

const make = (opts: Partial<ConstructorParameters<typeof SnakeSim>[0]> = {}) =>
  new SnakeSim({
    w: 8,
    h: 8,
    start: [
      { x: 3, y: 4 },
      { x: 3, y: 5 },
      { x: 3, y: 6 },
    ],
    dir: 0,
    rng: new Rng(1),
    ...opts,
  });
const at = (s: SnakeSim, x: number, y: number) => y * s.w + x;

describe('snake rules', () => {
  test('moves one cell per step, tail follows', () => {
    const s = make();
    s.placeFood(at(s, 0, 0));
    s.step();
    expect(s.body).toEqual([at(s, 3, 3), at(s, 3, 4), at(s, 3, 5)]);
    expect(s.lastTail).toBe(at(s, 3, 6));
  });

  test('ignores turning straight back, buffers two quick turns', () => {
    const s = make();
    s.placeFood(at(s, 0, 0));
    expect(s.turn(2)).toBe(false); // reverse
    expect(s.turn(0)).toBe(false); // same way
    expect(s.turn(1)).toBe(true);
    expect(s.turn(2)).toBe(true); // right then down: a U-turn over two steps
    expect(s.turn(3)).toBe(false); // queue full
    s.step();
    s.step();
    expect(s.head).toBe(at(s, 4, 5));
  });

  test('eating grows by one and counts', () => {
    const s = make();
    s.placeFood(at(s, 3, 3));
    const r = s.step();
    expect(r.ate).toBe(true);
    expect(s.length).toBe(4);
    expect(s.eaten).toBe(1);
    expect(s.lastTail).toBeNull();
    expect(s.isSnake(s.food) || s.isWall(s.food)).toBe(false);
  });

  test('edges and walls kill', () => {
    const s = make({ start: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }] });
    s.placeFood(at(s, 7, 7));
    expect(s.step().died).toBe(true);
    expect(s.dead).toBe(true);
    const w = make({ walls: [3 * 8 + 3] });
    w.placeFood(at(w, 7, 7));
    expect(w.step().died).toBe(true);
    expect(w.crashCell).toBe(at(w, 3, 3));
  });

  test('biting yourself kills, chasing your tail does not', () => {
    // A 2x2 loop: head can move into the cell the tail is leaving.
    const loop = make({ start: [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }], dir: 1 });
    loop.placeFood(at(loop, 0, 0));
    expect(loop.step().died).toBe(false);
    // Five long: turning into your own body is fatal.
    const s = make({ start: [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 5, y: 3 }], dir: 1 });
    s.placeFood(at(s, 0, 0));
    expect(s.step().died).toBe(true);
    // Growing into the tail cell is fatal too, since the tail stays put.
    const g = make({ start: [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }], dir: 1 });
    g.placeFood(at(g, 4, 3));
    expect(g.step().died).toBe(true);
  });

  test('food never lands on the snake or a wall', () => {
    const walls = Array.from({ length: 8 }, (_, x) => 7 * 8 + x);
    const s = make({ walls });
    for (let k = 0; k < 200; k++) {
      s.spawnFood();
      expect(s.isWall(s.food) || s.isSnake(s.food)).toBe(false);
    }
  });

  test('wins on reaching the target', () => {
    const s = make({ target: 2 });
    s.placeFood(at(s, 3, 3));
    s.step();
    expect(s.won).toBe(false);
    s.placeFood(at(s, 3, 2));
    expect(s.step().won).toBe(true);
    expect(s.step()).toEqual({ ate: false, died: false, won: false }); // frozen
  });

  test('stars by time', () => {
    expect(trailStars(10_000, 10_000)).toBe(3);
    expect(trailStars(15_000, 10_000)).toBe(2);
    expect(trailStars(15_001, 10_000)).toBe(1);
  });
});

describe('Snake Trails levels', () => {
  test('same number, same level', () => {
    expect(buildSnakeLevel(17)).toEqual(buildSnakeLevel(17));
  });

  test('every level is playable', () => {
    for (let n = 1; n <= 120; n++) {
      const l = buildSnakeLevel(n);
      const wall = new Uint8Array(l.w * l.h);
      for (const i of l.walls) wall[i] = 1;
      const head = l.start[0];
      expect(startFits(l.w, l.h, wall, head, l.dir), `level ${n} start`).toBe(true);
      // Body sits behind the head.
      l.start.forEach((p, k) => {
        expect(p).toEqual({ x: head.x - DX[l.dir] * k, y: head.y - DY[l.dir] * k });
      });
      expect(connected(l.w, l.h, wall, head.y * l.w + head.x), `level ${n} connected`).toBe(true);
      const free = l.w * l.h - l.walls.length;
      expect(free).toBeGreaterThan((l.target + l.start.length) * 2);
      expect(l.w).toBeGreaterThanOrEqual(12);
      expect(l.w).toBeLessThanOrEqual(20);
      expect(l.speed).toBeGreaterThanOrEqual(5);
      expect(l.speed).toBeLessThanOrEqual(12.5);
      expect(l.par).toBeGreaterThan(0);
      expect(START_RUNWAY).toBe(5);
    }
  });

  test('later levels have walls', () => {
    const withWalls = Array.from({ length: 40 }, (_, k) => buildSnakeLevel(k + 4)).filter((l) => l.walls.length > 0);
    expect(withWalls.length).toBeGreaterThan(35);
  });
});
