import { Rng } from '../../../shared/rng';

export const LANES = 3;

/** Things on the course. A wall must be dodged; a hurdle can be jumped; coins are picked up. */
export type Kind = 'wall' | 'hurdle' | 'coin';

export interface Thing {
  /** Distance along the course (in rows) of its near edge. Each thing is one row long. */
  row: number;
  lane: number;
  kind: Kind;
}

/**
 * Hand-designed patterns, nearest row first, one character per lane:
 * # wall, ^ hurdle, o coin, . empty. `from` is the distance (in metres) before which a
 * pattern doesn't turn up, so the course starts gentle.
 */
export const PATTERNS: { rows: string[]; from: number }[] = [
  { rows: ['#..'], from: 0 },
  { rows: ['..#'], from: 0 },
  { rows: ['.#.'], from: 0 },
  { rows: ['ooo'], from: 0 },
  { rows: ['o..', 'o..', 'o..'], from: 0 },
  { rows: ['#.#'], from: 40 },
  { rows: ['^^^'], from: 60 },
  { rows: ['##.'], from: 80 },
  { rows: ['.##'], from: 80 },
  { rows: ['#..', '...', '...', '..#'], from: 100 },
  { rows: ['.o.', '#o#'], from: 120 },
  { rows: ['^.^', '...', '.#.'], from: 150 },
  { rows: ['#.#', '...', '...', '.#.'], from: 200 },
  { rows: ['##^'], from: 240 },
  { rows: ['^##'], from: 240 },
  { rows: ['#..', '#..', '#.#'], from: 300 },
  { rows: ['.#.', '...', '#.#', '...', '.#.'], from: 400 },
  { rows: ['^^^', '...', '...', '##.'], from: 450 },
];

/** How the player can move, in rows, at a given speed (rows per second). */
export interface Moves {
  /** Rows covered while switching one lane (the move itself is quick, but people aren't). */
  laneRows: number;
  /** Rows covered in the air during a jump. */
  jumpRows: number;
}

export const JUMP_SECONDS = 0.55;
/** How long a person needs to react and swipe again, in seconds. */
const REACT_SECONDS = 0.2;

// The tiny nudges keep float error (15 x 0.2 = 3.0000000000000004) from tipping a count.
export const movesAt = (speed: number): Moves => ({
  laneRows: Math.max(1, Math.ceil(speed * REACT_SECONDS - 1e-9)),
  jumpRows: Math.floor(speed * JUMP_SECONDS + 1e-9),
});

/**
 * Can a player starting in `start` get through these rows (nearest first) alive? A tiny
 * search over row and lane: each row the player can stay, move one lane (then must wait
 * `laneRows` before moving again), or jump (in the air for `jumpRows`, clearing hurdles but
 * not walls). Lanes can change in the air.
 */
export function passable(rows: string[], start: number, m: Moves): boolean {
  // State: lane, rows until the next lane move is allowed, rows left in the air.
  let states = new Set<string>([`${start},0,0`]);
  for (const row of rows) {
    const next = new Set<string>();
    for (const s of states) {
      const [lane, wait, air] = s.split(',').map(Number);
      // Each option: lane, wait after, air left after, and whether it's in the air this row.
      const up = air > 0;
      const options: [number, number, number, boolean][] = [[lane, Math.max(0, wait - 1), Math.max(0, air - 1), up]];
      if (wait === 0) {
        if (lane > 0) options.push([lane - 1, m.laneRows - 1, Math.max(0, air - 1), up]);
        if (lane < LANES - 1) options.push([lane + 1, m.laneRows - 1, Math.max(0, air - 1), up]);
      }
      if (air === 0) options.push([lane, Math.max(0, wait - 1), m.jumpRows - 1, true]);
      for (const [l, w, a, inAir] of options) {
        const cell = row[l];
        if (cell === '#') continue;
        if (cell === '^' && !inAir) continue;
        next.add(`${l},${w},${a}`);
      }
    }
    if (!next.size) return false;
    states = next;
  }
  return true;
}

/**
 * Builds the course ahead of the player, one pattern at a time, with a gap before each
 * that shrinks as the speed rises (but never below what a player needs to get to any
 * lane). A pattern is used only if it can be got through from every lane, gap included.
 */
export class Course {
  things: Thing[] = [];
  /** Distance up to which the course has been laid. */
  laidTo: number;
  private rng: Rng;

  constructor(seed: number, startAt = 12) {
    this.rng = new Rng(seed);
    this.laidTo = startAt;
  }

  /**
   * Lay patterns until the course reaches `to`. `speedAt` gives the player's speed at a
   * distance: each pattern is checked against the speed the player will be going when
   * they get to it, not the speed now (the course is laid well ahead, and speed rises).
   */
  extend(to: number, speedAt: (row: number) => number): void {
    while (this.laidTo < to) {
      // Be cautious about speed across the gap and pattern ahead: lane changes take the
      // most rows at the fastest the player will be going there, and a jump covers the
      // fewest rows at the slowest.
      const m: Moves = { laneRows: movesAt(speedAt(this.laidTo + 20)).laneRows, jumpRows: movesAt(speedAt(this.laidTo)).jumpRows };
      // Enough rows to switch across the road and react, plus a little more early on.
      const minGap = m.laneRows * 2 + 2;
      const gap = minGap + this.rng.int(0, Math.max(1, Math.round(8 - this.laidTo / 150)));
      const at = this.laidTo + gap;
      const options = PATTERNS.filter((p) => p.from <= at);
      let rows: string[] = ['...'];
      for (let tries = 0; tries < 20; tries++) {
        const p = this.rng.pick(options);
        // Mirror half the time for variety.
        const r = this.rng.next() < 0.5 ? p.rows : p.rows.map((x) => [...x].reverse().join(''));
        const withGap = [...new Array(gap).fill('...'), ...r];
        if ([0, 1, 2].every((lane) => passable(withGap, lane, m))) {
          rows = r;
          break;
        }
      }
      rows.forEach((row, k) =>
        [...row].forEach((ch, lane) => {
          const kind: Kind | null = ch === '#' ? 'wall' : ch === '^' ? 'hurdle' : ch === 'o' ? 'coin' : null;
          if (kind) this.things.push({ row: at + k, lane, kind });
        }),
      );
      this.laidTo = at + rows.length;
    }
  }

  /** Forget things the player has left well behind. */
  trim(behind: number): void {
    this.things = this.things.filter((t) => t.row >= behind);
  }
}
