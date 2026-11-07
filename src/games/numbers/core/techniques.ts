import { bits, candidates, digitOf, Shape } from './grid';

/*
 * A solver that works the way people do: it only ever uses a named technique, easiest
 * first, and records the hardest one it needed. Techniques come in four tiers:
 *   1. Hidden single in a box: the only square in a box where a digit fits.
 *   2. Naked single (a square with one digit left) and hidden single in a row or column.
 *   3. Pointing and claiming (a digit's spots in a box all in one line, or the other way
 *      round).
 *   4. Naked and hidden pairs, naked and hidden triples, and X-wings.
 * A puzzle these can't finish is never used.
 */

export interface State {
  grid: number[];
  cand: number[];
}

export interface Step {
  name: string;
  tier: number;
  /** Set when the step places a digit. */
  place?: { cell: number; digit: number };
}

export function startState(sh: Shape, grid: number[]): State {
  return { grid: grid.slice(), cand: candidates(sh, grid) };
}

export function place(sh: Shape, s: State, cell: number, digit: number): void {
  s.grid[cell] = digit;
  s.cand[cell] = 0;
  const bit = 1 << (digit - 1);
  for (const p of sh.peers[cell]) s.cand[p] &= ~bit;
}

/** Cells of a unit where digit d (as a bit) is still possible. */
const spots = (s: State, unit: number[], bit: number) => unit.filter((i) => s.cand[i] & bit);

/** Remove `mask` from every cell in `cells`. True if anything changed. */
function strip(s: State, cells: number[], mask: number): boolean {
  let changed = false;
  for (const i of cells) {
    if (s.cand[i] & mask) {
      s.cand[i] &= ~mask;
      changed = true;
    }
  }
  return changed;
}

type Technique = (sh: Shape, s: State) => Step | null;

const hiddenIn =
  (pick: (sh: Shape) => number[][], name: string, tier: number): Technique =>
  (sh, s) => {
    for (const unit of pick(sh)) {
      for (let d = 1; d <= sh.size; d++) {
        const sp = spots(s, unit, 1 << (d - 1));
        if (sp.length === 1) return { name, tier, place: { cell: sp[0], digit: d } };
      }
    }
    return null;
  };

const nakedSingle: Technique = (_, s) => {
  for (let i = 0; i < s.cand.length; i++) if (s.cand[i] && bits(s.cand[i]) === 1) return { name: 'Naked single', tier: 2, place: { cell: i, digit: digitOf(s.cand[i]) } };
  return null;
};

/** Pointing: a digit's spots in a box all lie in one row or column, so it can't be elsewhere in that line. */
const pointing: Technique = (sh, s) => {
  for (const box of sh.boxes) {
    for (let d = 1; d <= sh.size; d++) {
      const bit = 1 << (d - 1);
      const sp = spots(s, box, bit);
      if (sp.length < 2) continue;
      for (const lines of [sh.rows, sh.cols]) {
        const line = lines.find((l) => sp.every((c) => l.includes(c)));
        if (line && strip(s, line.filter((c) => !box.includes(c)), bit)) return { name: 'Pointing', tier: 3 };
      }
    }
  }
  return null;
};

/** Claiming: a digit's spots in a row or column all lie in one box, so it can't be elsewhere in that box. */
const claiming: Technique = (sh, s) => {
  for (const line of [...sh.rows, ...sh.cols]) {
    for (let d = 1; d <= sh.size; d++) {
      const bit = 1 << (d - 1);
      const sp = spots(s, line, bit);
      if (sp.length < 2) continue;
      const b = sh.boxOf[sp[0]];
      if (!sp.every((c) => sh.boxOf[c] === b)) continue;
      if (strip(s, sh.boxes[b].filter((c) => !line.includes(c)), bit)) return { name: 'Claiming', tier: 3 };
    }
  }
  return null;
};

/** Naked pair or triple: k cells of a unit share exactly k digits between them, so those digits leave the rest of the unit. */
const nakedSet =
  (k: number, name: string, tier: number): Technique =>
  (sh, s) => {
    for (const unit of sh.units) {
      const open = unit.filter((i) => s.cand[i] && bits(s.cand[i]) <= k);
      const pick = (start: number, chosen: number[], mask: number): Step | null => {
        if (bits(mask) > k) return null;
        if (chosen.length === k) {
          if (bits(mask) !== k) return null;
          return strip(s, unit.filter((c) => !chosen.includes(c) && s.cand[c]), mask) ? { name, tier } : null;
        }
        for (let j = start; j < open.length; j++) {
          const r = pick(j + 1, [...chosen, open[j]], mask | s.cand[open[j]]);
          if (r) return r;
        }
        return null;
      };
      const r = pick(0, [], 0);
      if (r) return r;
    }
    return null;
  };

/** Hidden pair or triple: k digits of a unit fit only in the same k cells, so those cells hold nothing else. */
const hiddenSet =
  (k: number, name: string, tier: number): Technique =>
  (sh, s) => {
    for (const unit of sh.units) {
      const digits: { bit: number; cells: number[] }[] = [];
      for (let d = 1; d <= sh.size; d++) {
        const bit = 1 << (d - 1);
        const sp = spots(s, unit, bit);
        if (sp.length >= 2 && sp.length <= k) digits.push({ bit, cells: sp });
      }
      const pick = (start: number, mask: number, cells: Set<number>, count: number): Step | null => {
        if (cells.size > k) return null;
        if (count === k) {
          if (cells.size !== k) return null;
          let changed = false;
          for (const c of cells) {
            if (s.cand[c] & ~mask) {
              s.cand[c] &= mask;
              changed = true;
            }
          }
          return changed ? { name, tier } : null;
        }
        for (let j = start; j < digits.length; j++) {
          const r = pick(j + 1, mask | digits[j].bit, new Set([...cells, ...digits[j].cells]), count + 1);
          if (r) return r;
        }
        return null;
      };
      const r = pick(0, 0, new Set(), 0);
      if (r) return r;
    }
    return null;
  };

/** X-wing: a digit fits in exactly the same two columns in two rows (or rows in two columns). */
const xWing: Technique = (sh, s) => {
  for (const [lines, cross] of [
    [sh.rows, sh.cols],
    [sh.cols, sh.rows],
  ] as const) {
    for (let d = 1; d <= sh.size; d++) {
      const bit = 1 << (d - 1);
      const pairs = lines
        .map((line, li) => ({ li, sp: spots(s, line, bit) }))
        .filter((p) => p.sp.length === 2)
        .map((p) => ({ li: p.li, at: p.sp.map((c) => cross.findIndex((l) => l.includes(c))) }));
      for (let a = 0; a < pairs.length; a++) {
        for (let b = a + 1; b < pairs.length; b++) {
          if (pairs[a].at[0] !== pairs[b].at[0] || pairs[a].at[1] !== pairs[b].at[1]) continue;
          const keep = new Set([...lines[pairs[a].li], ...lines[pairs[b].li]]);
          const others = [...cross[pairs[a].at[0]], ...cross[pairs[a].at[1]]].filter((c) => !keep.has(c));
          if (strip(s, others, bit)) return { name: 'X-wing', tier: 4 };
        }
      }
    }
  }
  return null;
};

const TECHNIQUES: Technique[] = [
  hiddenIn((sh) => sh.boxes, 'Hidden single in a box', 1),
  nakedSingle,
  hiddenIn((sh) => [...sh.rows, ...sh.cols], 'Hidden single in a line', 2),
  pointing,
  claiming,
  nakedSet(2, 'Naked pair', 4),
  hiddenSet(2, 'Hidden pair', 4),
  nakedSet(3, 'Naked triple', 4),
  hiddenSet(3, 'Hidden triple', 4),
  xWing,
];

/** The next step from a state, easiest technique first (it changes `s` for eliminations, not placements). */
export function nextStep(sh: Shape, s: State): Step | null {
  for (const t of TECHNIQUES) {
    const r = t(sh, s);
    if (r) return r;
  }
  return null;
}

export interface Rating {
  solved: boolean;
  /** Hardest tier needed, and its technique's name. */
  tier: number;
  hardest: string;
  steps: number;
}

/** Solve with techniques only, easiest first, and report the hardest one needed. */
export function rateHuman(sh: Shape, grid: number[]): Rating {
  const s = startState(sh, grid);
  let tier = 0;
  let hardest = '';
  let steps = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (s.grid.every((v) => v)) return { solved: true, tier, hardest, steps };
    const step = nextStep(sh, s);
    if (!step) return { solved: false, tier: 5, hardest: 'Beyond these techniques', steps };
    if (step.place) place(sh, s, step.place.cell, step.place.digit);
    if (step.tier > tier) {
      tier = step.tier;
      hardest = step.name;
    }
    steps++;
  }
  return { solved: false, tier: 5, hardest: 'Beyond these techniques', steps };
}

/** The next digit a player could place by technique from this grid, for hints. */
export function nextPlacement(sh: Shape, grid: number[]): { cell: number; digit: number; name: string } | null {
  const s = startState(sh, grid);
  for (let guard = 0; guard < 500; guard++) {
    const step = nextStep(sh, s);
    if (!step) return null;
    if (step.place) return { ...step.place, name: step.name };
  }
  return null;
}
