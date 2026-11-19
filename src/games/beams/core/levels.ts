import { Rng } from '../../../shared/rng';
import { BeamSpec, beamSpecFor, rateBeams, TUTORIAL_COUNT } from './difficulty';
import { entry, exitPort, portKey, reflect, status } from './rules';
import { solve } from './solver';
import { Beam, BeamLevel, Cell, CRYSTAL, DX, DY, EMPTY, FIXED, MIRROR, Orient, Port, WALL } from './types';

/** Most solutions a board may have: more than this and the mirrors barely matter. */
export const MAX_SOLUTIONS = 3;

interface Layout {
  cells: Cell[];
  solution: Orient[];
  beams: Beam[];
  /** Cells some beam passes straight through. */
  through: Set<number>;
}

function allPorts(w: number, h: number): Port[] {
  const out: Port[] = [];
  for (let x = 0; x < w; x++) out.push({ side: 0, pos: x }, { side: 2, pos: x });
  for (let y = 0; y < h; y++) out.push({ side: 1, pos: y }, { side: 3, pos: y });
  return out;
}

/**
 * Lay out the beams one by one. Each starts at a free spot on the border and goes
 * straight, turning now and then by placing a mirror in a free cell. It follows mirrors
 * earlier beams placed, and never puts a mirror where a beam already passes straight
 * through, so earlier beams keep their paths. Where it leaves the board is its target.
 */
function layOut(spec: BeamSpec, rng: Rng): Layout | null {
  const { w, h } = spec;
  const cells = new Array<Cell>(w * h).fill(EMPTY);
  const solution = new Array<Orient>(w * h).fill(0);
  const through = new Set<number>();
  const used = new Set<number>();
  const beams: Beam[] = [];
  const ports = allPorts(w, h);
  for (let k = 0; k < spec.beams; k++) {
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const lamp = rng.pick(ports);
      if (used.has(portKey(lamp))) continue;
      let { cell, dir } = entry(w, h, lamp);
      const mine: number[] = [];
      const pass: number[] = [];
      let turns = 0;
      let exit: Port | null = null;
      for (let step = 0; step < w * h * 3; step++) {
        const x = cell % w;
        const y = (cell / w) | 0;
        if (cells[cell] === MIRROR) dir = reflect(dir, solution[cell]);
        else if (!through.has(cell) && !pass.includes(cell) && rng.next() < spec.turn) {
          // Turn left or right: pick the mirror that does it.
          const nd = (dir + (rng.next() < 0.5 ? 1 : 3)) % 4;
          const o: Orient = reflect(dir, 0) === nd ? 0 : 1;
          cells[cell] = MIRROR;
          solution[cell] = o;
          mine.push(cell);
          dir = nd;
          turns++;
        } else pass.push(cell);
        const nx = x + DX[dir];
        const ny = y + DY[dir];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          exit = exitPort(x, y, dir);
          break;
        }
        cell = ny * w + nx;
      }
      const ok = exit && !used.has(portKey(exit)) && portKey(exit) !== portKey(lamp) && turns >= spec.minTurns;
      if (!ok) {
        for (const c of mine) cells[c] = EMPTY;
        continue;
      }
      for (const c of pass) through.add(c);
      used.add(portKey(lamp));
      used.add(portKey(exit!));
      beams.push({ colour: k, lamp, target: exit! });
      placed = true;
    }
    if (!placed) return null;
  }
  return { cells, solution, beams, through };
}

interface Candidate {
  level: Omit<BeamLevel, 'number' | 'difficulty' | 'tip'>;
  score: number;
}

/** Fill in decoys, walls, crystals and pins, scramble, and measure the board. */
function dress(spec: BeamSpec, lay: Layout, rng: Rng): Candidate | null {
  const { w, h } = spec;
  const cells = lay.cells.slice();
  const solution = lay.solution.slice();
  const pathMirrors = cells.map((c, i) => (c === MIRROR ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY || lay.through.has(i)) continue;
    const r = rng.next();
    if (r < spec.walls) cells[i] = WALL;
    else if (r < spec.walls + spec.decoys) {
      cells[i] = MIRROR;
      solution[i] = rng.next() < 0.5 ? 0 : 1;
    }
  }
  const open = rng.shuffle([...lay.through]);
  for (let k = 0; k < spec.crystals && k < open.length; k++) cells[open[k]] = CRYSTAL;
  for (const i of pathMirrors) if (rng.next() < spec.fixed) cells[i] = FIXED;
  // Scramble: most of the path's turnable mirrors start the wrong way, decoys at random.
  const start = solution.slice();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== MIRROR) continue;
    if (rng.next() < (pathMirrors.includes(i) ? 0.7 : 0.5)) start[i] = (1 - start[i]) as Orient;
  }
  const board = { w, h, cells, beams: lay.beams };
  if (status(board, start).solved) return null;
  const r = solve(board, start);
  if (r.capped || r.taps === null || r.solutions > MAX_SOLUTIONS || r.taps < 1) return null;
  const score = Math.round(Math.log2(r.nodes) * 10) / 10;
  return { level: { w, h, cells, start, solution: r.orient!, beams: lay.beams, par: r.taps, score }, score };
}

export function generate(spec: BeamSpec, rng: Rng, tries = 40): Candidate | null {
  let best: Candidate | null = null;
  for (let a = 0; a < tries; a++) {
    const lay = layOut(spec, rng);
    if (!lay) continue;
    const c = dress(spec, lay, rng);
    if (!c) continue;
    if (!best || Math.abs(c.score - spec.target) < Math.abs(best.score - spec.target)) best = c;
    if (Math.abs(best.score - spec.target) < 0.3) break;
  }
  return best;
}

export function buildBeamLevel(n: number): BeamLevel {
  const spec = beamSpecFor(n);
  const rng = new Rng(n * 8111 + 59);
  let c = generate(spec, rng);
  // A board always comes out in practice; if not, ease off and try again.
  for (let k = 0; !c && k < 5; k++) c = generate({ ...spec, decoys: spec.decoys * 0.6, crystals: 0 }, rng);
  const lv = c!.level;
  return {
    number: n,
    ...lv,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateBeams(c!.score),
    tip: spec.tip,
  };
}
