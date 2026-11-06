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
    poisonEvery: 0,
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
    expect(s.foods.length).toBe(3);
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
    for (let k = 0; k < 40; k++) {
      s.placeFood();
      s.fillFood();
      for (const f of s.foods) expect(s.isWall(f) || s.isSnake(f)).toBe(false);
    }
  });

  test('several apples at once, topped up after eating', () => {
    const s = make({ poisonEvery: 24 });
    expect(s.foods.length).toBe(3);
    expect(new Set(s.foods).size).toBe(3);
    expect(s.foods).not.toContain(s.poison);
    s.placeFood(at(s, 3, 3), at(s, 0, 0), at(s, 7, 0));
    expect(s.step().ate).toBe(true);
    expect(s.foods.length).toBe(3);
    expect(s.foods).toContain(at(s, 0, 0));
    expect(s.foods).toContain(at(s, 7, 0));
    expect(s.foods).not.toContain(at(s, 3, 3));
    const one = make({ foodCount: 1 });
    expect(one.foods.length).toBe(1);
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

  test('poison starts behind the tail and is fatal', () => {
    const s = make({ poisonEvery: 24 });
    expect(s.poison).toBe(at(s, 3, 7));
    const p = make({ poisonEvery: 24 });
    p.placeFood(at(p, 0, 0));
    p.placePoison(at(p, 3, 3));
    const r = p.step();
    expect(r.died).toBe(true);
    expect(p.crashCell).toBe(at(p, 3, 3));
  });

  test('poison jumps to the cell the tail just left, on a timer', () => {
    const s = make({ poisonEvery: 3 });
    s.placeFood(at(s, 0, 0));
    s.step();
    s.step();
    expect(s.poison).toBe(at(s, 3, 7));
    s.step(); // third step: tail leaves (3,4)
    expect(s.poison).toBe(at(s, 3, 4));
    expect(s.isSnake(s.poison)).toBe(false);
    expect(s.poisonIn).toBe(3);
  });

  test('poison never lands on the snake, an apple or beside the head', () => {
    const s = new SnakeSim({ w: 12, h: 12, start: [{ x: 6, y: 6 }, { x: 6, y: 7 }, { x: 6, y: 8 }], dir: 0, rng: new Rng(5), poisonEvery: 2 });
    const turns = [1, 2, 3, 0];
    for (let k = 0; k < 400 && !s.dead; k++) {
      // Walk a square spiral-ish path that stays on the board.
      if (k % 4 === 0) s.turn(turns[(k / 4) % 4] as 0 | 1 | 2 | 3);
      s.step();
      if (s.dead) break;
      if (s.poison >= 0) {
        expect(s.isSnake(s.poison)).toBe(false);
        expect(s.foods).not.toContain(s.poison);
      }
    }
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
