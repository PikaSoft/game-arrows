import { Rng } from '../../../shared/rng';
import { bricksScore, bricksSpecFor, BricksSpec, rateBricks, TUTORIAL_COUNT } from './difficulty';
import { BricksLevel, FIELD_W, UNBREAKABLE } from './types';

const HALF = FIELD_W / 2;

/** Shapes for the left half of the wall (the right half mirrors it). True where a brick goes. */
const PATTERNS: ((r: number, c: number, rows: number, rng: Rng) => boolean)[] = [
  () => true, // solid
  (r, c) => (r + c) % 2 === 0, // checker
  (r, c) => c >= HALF - 1 - r || r === 0, // pyramid, point up
  (r, c, rows) => Math.abs(r - (rows - 1) / 2) + Math.abs(c - (HALF - 0.5)) <= rows / 2 + 1.5, // diamond
  (r) => r % 2 === 0, // stripes
  (r, c) => c % 3 !== 2 || r === 0, // columns with gaps
  (_r, _c, _rows, rng) => rng.next() < 0.7, // scattered
];

/**
 * Can every breakable brick be reached, going round steel? The wall spans the full width,
 * so the ball gets in from below, and once it finds a way through to the top row it can
 * run along the open space above the wall and come down anywhere there.
 */
export function reachable(rows: number[][]): boolean {
  const h = rows.length;
  const seen = rows.map((r) => r.map(() => false));
  const stack: [number, number][] = [];
  for (let c = 0; c < FIELD_W; c++) if (rows[h - 1][c] !== UNBREAKABLE) stack.push([h - 1, c]);
  let overTop = false;
  const flood = () => {
    while (stack.length) {
      const [r, c] = stack.pop()!;
      if (seen[r][c]) continue;
      seen[r][c] = true;
      if (r === 0) overTop = true;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= h || nc >= FIELD_W || seen[nr][nc] || rows[nr][nc] === UNBREAKABLE) continue;
        stack.push([nr, nc]);
      }
    }
  };
  flood();
  if (overTop) {
    for (let c = 0; c < FIELD_W; c++) if (rows[0][c] !== UNBREAKABLE) stack.push([0, c]);
    flood();
  }
  return rows.every((row, r) => row.every((v, c) => v === 0 || v === UNBREAKABLE || seen[r][c]));
}

/**
 * True if some breakable brick is boxed in on both sides, by steel or the side wall. The
 * ball could then only reach it by going straight up a one-brick-wide shaft, which can
 * take ages.
 */
export function pocketed(rows: number[][]): boolean {
  const blocked = (row: number[], c: number) => c < 0 || c >= FIELD_W || row[c] === UNBREAKABLE;
  return rows.some((row) => row.some((v, c) => v > 0 && v !== UNBREAKABLE && blocked(row, c - 1) && blocked(row, c + 1)));
}

/**
 * Build a wall: a pattern for the left half, mirrored to the right. Tougher bricks sit
 * nearer the top. Steel is sprinkled in (in mirrored pairs) only where it leaves every
 * breakable brick reachable and none boxed in between steel and the side wall.
 */
export function makeWall(spec: BricksSpec, rng: Rng): number[][] {
  for (let attempt = 0; ; attempt++) {
    // Solid walls take longest to clear, so they come up less often than the shapes.
    const pattern = attempt > 20 ? PATTERNS[0] : rng.next() < 0.1 ? PATTERNS[0] : rng.pick(PATTERNS.slice(1));
    const rows: number[][] = [];
    for (let r = 0; r < spec.rows; r++) {
      const row = new Array<number>(FIELD_W).fill(0);
      for (let c = 0; c < HALF; c++) {
        if (!pattern(r, c, spec.rows, rng)) continue;
        // Hits: the top third can be the toughest, the bottom rows are mostly single.
        const band = 1 - r / Math.max(1, spec.rows - 1);
        const hits = Math.max(1, Math.min(spec.maxHits, Math.round(1 + band * (spec.maxHits - 1) * (0.6 + rng.next() * 0.6))));
        row[c] = hits;
        row[FIELD_W - 1 - c] = hits;
      }
      rows.push(row);
    }
    const bricks = rows.flat().filter((v) => v > 0).length;
    if (bricks < 10) continue;
    let steel = Math.round((bricks * spec.steel) / 2);
    for (let tries = 0; steel > 0 && tries < 200; tries++) {
      const r = rng.int(0, spec.rows - 1);
      const c = rng.int(0, HALF - 1);
      if (!rows[r][c] || rows[r][c] === UNBREAKABLE) continue;
      const keep = rows[r][c];
      rows[r][c] = rows[r][FIELD_W - 1 - c] = UNBREAKABLE;
      if (reachable(rows) && !pocketed(rows) && rows.flat().some((v) => v > 0 && v !== UNBREAKABLE)) steel--;
      else rows[r][c] = rows[r][FIELD_W - 1 - c] = keep;
    }
    return rows;
  }
}

export function buildBricksLevel(n: number): BricksLevel {
  const spec = bricksSpecFor(n);
  const rows = makeWall(spec, new Rng(n * 52027 + 9));
  const cells = rows.flat();
  const hits = cells.reduce((s, v) => s + (v > 0 && v !== UNBREAKABLE ? v : 0), 0);
  const steel = cells.filter((v) => v === UNBREAKABLE).length;
  const bricks = cells.filter((v) => v > 0).length;
  const score = bricksScore(spec.speed, hits, bricks ? steel / bricks : 0);
  return {
    number: n,
    rows,
    speed: spec.speed,
    powerUps: spec.powerUps,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateBricks(score),
    score,
    tip: spec.tip,
  };
}
