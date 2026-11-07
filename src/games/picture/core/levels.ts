import { Rng } from '../../../shared/rng';
import { pictureSpecFor, PictureSpec, ratePicture, TUTORIAL_COUNT } from './difficulty';
import { runsOf } from './line';
import { PICTURES, toGrid, TUTORIAL_PICTURES } from './pictures';
import { Clues, rate } from './solver';
import { PictureLevel } from './types';

export function cluesOf(w: number, h: number, cells: number[]): Clues {
  return {
    w,
    h,
    rows: Array.from({ length: h }, (_, y) => runsOf(cells.slice(y * w, y * w + w))),
    cols: Array.from({ length: w }, (_, x) => runsOf(Array.from({ length: h }, (_, y) => cells[y * w + x]))),
  };
}

/**
 * A blobby random picture: random values, smoothed by averaging each cell with its
 * neighbours a few times, then the highest `density` share of cells filled. Smoothing
 * makes shapes instead of static, which gives clues with longer runs.
 */
export function blobs(w: number, h: number, density: number, smooth: number, rng: Rng): number[] {
  let v = Array.from({ length: w * h }, () => rng.next());
  for (let s = 0; s < smooth; s++) {
    const next = v.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            sum += v[ny * w + nx];
            n++;
          }
        }
        next[y * w + x] = sum / n;
      }
    }
    v = next;
  }
  const cut = v.slice().sort((a, b) => b - a)[Math.max(0, Math.round(w * h * density) - 1)];
  return v.map((x) => (x >= cut ? 1 : 0));
}

interface Candidate {
  cells: number[];
  score: number;
}

/**
 * Make random pictures and keep only those that line logic alone can finish (so they
 * have exactly one answer). Of those, keep the one whose score is closest to `target`.
 */
export function generate(spec: PictureSpec, rng: Rng, target: number): Candidate {
  const { w, h } = spec;
  let best: Candidate | null = null;
  const off = (c: Candidate) => Math.abs(c.score - target);
  for (let attempt = 0; attempt < 400; attempt++) {
    const smooth = attempt > 200 ? spec.smooth + 1 : spec.smooth;
    const cells = blobs(w, h, spec.density, smooth, rng);
    const r = rate(cluesOf(w, h, cells));
    if (!r.solved) continue;
    const c = { cells, score: r.score };
    if (!best || off(c) < off(best)) best = c;
    if (off(best) < 0.05) break;
  }
  if (best) return best;
  // Very unlikely: give up on the target and smooth harder until one works.
  return generate({ ...spec, smooth: spec.smooth + 1 }, rng, target);
}

export function buildPictureLevel(n: number): PictureLevel {
  const spec = pictureSpecFor(n);
  let cells: number[];
  let name: string | undefined;
  let score: number;
  if (spec.drawing !== undefined) {
    const d = spec.drawing < 0 ? TUTORIAL_PICTURES[-spec.drawing - 1] : PICTURES[spec.drawing];
    cells = toGrid(d).cells;
    name = d.name;
    score = rate(cluesOf(spec.w, spec.h, cells)).score;
  } else {
    const c = generate(spec, new Rng(n * 92821 + 37), spec.target);
    cells = c.cells;
    score = c.score;
  }
  const clues = cluesOf(spec.w, spec.h, cells);
  score = Math.round(score * 100) / 100;
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    solution: cells,
    rows: clues.rows,
    cols: clues.cols,
    name,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : ratePicture(score),
    score,
    tip: spec.tip,
  };
}
