import { Rng } from '../../../shared/rng';
import { BOX, kicks, PIECE_COUNT, PieceId, SHAPES } from './pieces';

/** Well size. The top HIDDEN rows sit above the screen; pieces appear there. */
export const COLS = 10;
export const HIDDEN = 2;
export const VISIBLE = 20;
export const ROWS = VISIBLE + HIDDEN;

/** A landed piece locks after this long without moving down. */
export const LOCK_MS = 500;
/** Moves or turns on the ground that restart the lock timer, per piece. */
export const LOCK_RESETS = 15;
/** Full rows flash for this long before they clear. */
export const CLEAR_MS = 260;
export const LINES_PER_LEVEL = 10;
/** Points for clearing 1 to 4 rows at once, times the level. */
export const LINE_POINTS = [0, 100, 300, 500, 800];
export const PREVIEW = 3;

export interface Piece {
  id: PieceId;
  rot: number;
  /** Top-left of the piece's box. */
  x: number;
  y: number;
}

/** What happened when a piece locked. */
export interface LockResult {
  /** Full rows (well rows, top = 0), cleared once the flash is over. */
  rows: number[];
  points: number;
  /** A four-row clear straight after another one. */
  backToBack: boolean;
  /** Clears in a row: 1 for the second clearing lock running, and so on. 0 for none. */
  combo: number;
  levelUp: boolean;
  over: boolean;
}

export interface StepResult {
  /** The piece moved down a row by itself. */
  fell: boolean;
  lock: LockResult | null;
}

/** Milliseconds per row of falling at a level: quicker each level, flat from level 20. */
export function gravityMs(level: number): number {
  const l = Math.min(level, 20);
  return Math.max(16, 1000 * Math.pow(0.8 - (l - 1) * 0.007, l - 1));
}

/**
 * Block Fall rules, with no drawing or timing of their own: the UI calls step() with the
 * time passed and the move methods on input.
 */
export class FallSim {
  /** 0 is empty, otherwise piece id + 1. Row-major, ROWS x COLS. */
  board = new Uint8Array(COLS * ROWS);
  piece: Piece | null = null;
  queue: PieceId[] = [];
  hold: PieceId | null = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  pieces = 0;
  tetras = 0;
  over = false;
  /** Rows flashing before they clear, and time left. */
  clearing: { rows: number[]; t: number } | null = null;
  private rng: Rng;
  private fallAcc = 0;
  private lockT = 0;
  private resets = 0;
  private lowest = 0;
  private lastFour = false;
  private combo = -1;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.fill();
    this.spawn();
  }

  // ---------- Pieces ----------

  /** Top the queue up from shuffled bags of all seven. */
  private fill(): void {
    while (this.queue.length <= PREVIEW + PIECE_COUNT) {
      const bag = [0, 1, 2, 3, 4, 5, 6] as PieceId[];
      this.queue.push(...this.rng.shuffle(bag));
    }
  }

  /** Next pieces, for the preview. */
  next(): PieceId[] {
    return this.queue.slice(0, PREVIEW);
  }

  private spawn(id?: PieceId): void {
    if (id === undefined) {
      id = this.queue.shift()!;
      this.fill();
    }
    const box = BOX[id];
    const p: Piece = { id, rot: 0, x: Math.floor((COLS - box) / 2), y: 0 };
    this.fallAcc = 0;
    this.lockT = 0;
    this.resets = 0;
    if (!this.fits(p)) {
      this.piece = null;
      this.over = true;
      return;
    }
    // Step straight down into view where there is room.
    if (this.fits({ ...p, y: p.y + 1 })) p.y++;
    this.piece = p;
    this.lowest = p.y;
  }

  /** Cells of a piece in well coordinates. */
  cells(p: Piece): [number, number][] {
    return SHAPES[p.id][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);
  }

  fits(p: Piece): boolean {
    for (const [x, y] of this.cells(p)) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
      if (this.board[y * COLS + x]) return false;
    }
    return true;
  }

  /** How many rows the current piece could still fall. */
  dropDistance(): number {
    const p = this.piece;
    if (!p) return 0;
    let d = 0;
    while (this.fits({ ...p, y: p.y + d + 1 })) d++;
    return d;
  }

  /** Where the piece would land: the ghost. */
  ghost(): Piece | null {
    return this.piece ? { ...this.piece, y: this.piece.y + this.dropDistance() } : null;
  }

  private grounded(): boolean {
    return !!this.piece && !this.fits({ ...this.piece, y: this.piece.y + 1 });
  }

  /** A move or turn worked: on the ground that restarts the lock timer, a limited number of times. */
  private moved(): void {
    if (this.grounded() && this.resets < LOCK_RESETS) {
      this.resets++;
      this.lockT = 0;
    }
  }

  private get live(): boolean {
    return !!this.piece && !this.over && !this.clearing;
  }

  // ---------- Moves ----------

  move(dx: number): boolean {
    if (!this.live) return false;
    const p = { ...this.piece!, x: this.piece!.x + dx };
    if (!this.fits(p)) return false;
    this.piece = p;
    this.moved();
    return true;
  }

  /** Turn a quarter: 1 clockwise, -1 anticlockwise. Tries wall kicks if it doesn't fit. */
  rotate(dir: 1 | -1): boolean {
    if (!this.live) return false;
    const cur = this.piece!;
    const to = (cur.rot + dir + 4) % 4;
    for (const [kx, ky] of kicks(cur.id, cur.rot, to)) {
      const p = { ...cur, rot: to, x: cur.x + kx, y: cur.y + ky };
      if (this.fits(p)) {
        this.piece = p;
        this.noteLowest();
        this.moved();
        return true;
      }
    }
    return false;
  }

  /** One row down by hand, for a point. */
  softDrop(): boolean {
    if (!this.live) return false;
    const p = { ...this.piece!, y: this.piece!.y + 1 };
    if (!this.fits(p)) return false;
    this.piece = p;
    this.fallAcc = 0;
    this.score += 1;
    this.noteLowest();
    return true;
  }

  /** Straight to the bottom and lock, for 2 points a row. */
  hardDrop(): LockResult | null {
    if (!this.live) return null;
    const d = this.dropDistance();
    this.piece = { ...this.piece!, y: this.piece!.y + d };
    this.score += 2 * d;
    return this.lock();
  }

  /** Put the piece aside (or swap with the one aside). Once per piece. */
  holdPiece(): boolean {
    if (!this.live || !this.canHold) return false;
    const id = this.piece!.id;
    const back = this.hold;
    this.hold = id;
    this.canHold = false;
    this.spawn(back ?? undefined);
    return true;
  }

  /** A new lowest row for this piece gives back the lock resets. */
  private noteLowest(): void {
    if (this.piece && this.piece.y > this.lowest) {
      this.lowest = this.piece.y;
      this.resets = 0;
      this.lockT = 0;
    }
  }

  // ---------- Time ----------

  step(dt: number): StepResult {
    const out: StepResult = { fell: false, lock: null };
    if (this.over) return out;
    if (this.clearing) {
      this.clearing.t -= dt;
      if (this.clearing.t <= 0) this.finishClear();
      return out;
    }
    if (!this.piece) return out;
    this.fallAcc += dt;
    const g = gravityMs(this.level);
    while (this.fallAcc >= g) {
      if (this.grounded()) {
        this.fallAcc = 0;
        break;
      }
      this.fallAcc -= g;
      this.piece = { ...this.piece, y: this.piece.y + 1 };
      this.noteLowest();
      out.fell = true;
    }
    if (this.grounded()) {
      this.lockT += dt;
      if (this.lockT >= LOCK_MS) out.lock = this.lock();
    } else this.lockT = 0;
    return out;
  }

  /** Write the piece into the well, score full rows and start their flash. */
  private lock(): LockResult {
    const p = this.piece!;
    let above = true;
    for (const [x, y] of this.cells(p)) {
      this.board[y * COLS + x] = p.id + 1;
      if (y >= HIDDEN) above = false;
    }
    this.piece = null;
    this.pieces++;
    this.canHold = true;
    const rows: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS && full; x++) if (!this.board[y * COLS + x]) full = false;
      if (full) rows.push(y);
    }
    const n = rows.length;
    let points = LINE_POINTS[n] * this.level;
    const backToBack = n === 4 && this.lastFour;
    if (backToBack) points = Math.floor(points * 1.5);
    if (n) {
      this.combo++;
      points += 50 * this.combo * this.level;
      this.lastFour = n === 4;
      if (n === 4) this.tetras++;
    } else this.combo = -1;
    this.score += points;
    const before = this.level;
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
    const res: LockResult = { rows, points, backToBack, combo: Math.max(0, this.combo), levelUp: this.level > before, over: false };
    if (n) this.clearing = { rows, t: CLEAR_MS };
    else if (above) this.over = true;
    else this.spawn();
    res.over = this.over;
    return res;
  }

  private finishClear(): void {
    const rows = this.clearing!.rows;
    this.clearing = null;
    const keep: Uint8Array[] = [];
    for (let y = 0; y < ROWS; y++) if (!rows.includes(y)) keep.push(this.board.slice(y * COLS, (y + 1) * COLS));
    this.board.fill(0);
    const off = ROWS - keep.length;
    keep.forEach((row, i) => this.board.set(row, (off + i) * COLS));
    this.spawn();
  }

  /** Finish a line-clear flash at once (tests, and skipping ahead). */
  settle(): void {
    if (this.clearing) this.finishClear();
  }
}
