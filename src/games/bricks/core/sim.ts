import { Rng } from '../../../shared/rng';
import { BRICK_H, BricksLevel, FIELD_H, FIELD_W, UNBREAKABLE, WALL_TOP } from './types';

/** Simulation steps per second. Small steps keep the ball from skipping through bricks. */
export const STEP_HZ = 240;
export const START_LIVES = 3;

export const BALL_R = 0.18;
/**
 * The paddle sits well above the bottom of the field, so a finger dragging below it on a
 * phone doesn't cover it or the ball coming down.
 */
export const PADDLE_GAP = 4;
export const PADDLE_Y = FIELD_H - PADDLE_GAP;
export const PADDLE_H = 0.36;
export const PADDLE_W = 2.4;
const WIDE_W = 3.6;
/** The ball never leaves the paddle flatter than this from the horizontal. */
const MIN_ANGLE = (22 * Math.PI) / 180;
/** Furthest from straight up a paddle hit can send the ball (at the paddle's very edge). */
const MAX_DEFLECT = (62 * Math.PI) / 180;
const CAPSULE_SPEED = 4;
const POWER_SECONDS = { wide: 15, slow: 12 };
const DROP_CHANCE = 0.14;

export type Power = 'wide' | 'slow' | 'multi';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Capsule {
  x: number;
  y: number;
  kind: Power;
}

/** What happened during a step, for sound and effects. */
export interface Events {
  bricksHit: { row: number; col: number; broke: boolean }[];
  wall: boolean;
  paddle: boolean;
  caught: Power[];
  lost: boolean;
  lifeLost: boolean;
  cleared: boolean;
  gameOver: boolean;
}

const none = (): Events => ({ bricksHit: [], wall: false, paddle: false, caught: [], lost: false, lifeLost: false, cleared: false, gameOver: false });

/**
 * The rules of the game with no drawing or timing: one `step()` advances 1/STEP_HZ of a
 * second. The ball waits on the paddle until `serve()`. Everything is deterministic for
 * a given level and sequence of paddle moves.
 */
export class BricksSim {
  wall: number[][];
  balls: Ball[] = [];
  capsules: Capsule[] = [];
  /** Paddle centre x. */
  paddleX = FIELD_W / 2;
  lives = START_LIVES;
  /** True while the ball sits on the paddle waiting to be served. */
  waiting = true;
  /** Seconds left on each timed power-up. */
  wideLeft = 0;
  slowLeft = 0;
  time = 0;
  private rng: Rng;

  constructor(readonly level: BricksLevel) {
    this.wall = level.rows.map((r) => r.slice());
    this.rng = new Rng(level.number * 7717 + 5);
  }

  get paddleW(): number {
    return this.wideLeft > 0 ? WIDE_W : PADDLE_W;
  }
  get speed(): number {
    return this.level.speed * (this.slowLeft > 0 ? 0.75 : 1);
  }
  /** Breakable bricks left. */
  get left(): number {
    let n = 0;
    for (const r of this.wall) for (const v of r) if (v > 0 && v !== UNBREAKABLE) n++;
    return n;
  }
  get cleared(): boolean {
    return this.left === 0;
  }
  get over(): boolean {
    return this.lives <= 0 || this.cleared;
  }

  /** Move the paddle so its centre is at x (kept inside the field). */
  movePaddle(x: number): void {
    const half = this.paddleW / 2;
    this.paddleX = Math.max(half, Math.min(FIELD_W - half, x));
  }

  /** The ball resting on the paddle, where it will leave from. */
  restingBall(): Ball {
    return { x: this.paddleX, y: PADDLE_Y - BALL_R - 0.01, vx: 0, vy: 0 };
  }

  /** Launch the ball from the paddle, a little to one side of straight up. */
  serve(): void {
    if (!this.waiting || this.over) return;
    this.waiting = false;
    const a = (this.rng.next() < 0.5 ? -1 : 1) * (0.25 + this.rng.next() * 0.2);
    const b = this.restingBall();
    this.balls = [{ ...b, vx: Math.sin(a) * this.level.speed, vy: -Math.cos(a) * this.level.speed }];
  }

  step(): Events {
    const ev = none();
    if (this.over) return ev;
    const dt = 1 / STEP_HZ;
    this.time += dt;
    this.wideLeft = Math.max(0, this.wideLeft - dt);
    const wasSlow = this.slowLeft > 0;
    this.slowLeft = Math.max(0, this.slowLeft - dt);
    if (wasSlow && this.slowLeft === 0) this.setSpeed(this.level.speed);
    if (this.wideLeft === 0) this.movePaddle(this.paddleX); // shrinking may push it inside
    if (this.waiting) return ev;
    for (const b of this.balls) this.moveBall(b, dt, ev);
    // Balls that fall past the paddle are gone.
    const before = this.balls.length;
    this.balls = this.balls.filter((b) => b.y - BALL_R < FIELD_H);
    if (this.balls.length < before) ev.lost = true;
    this.moveCapsules(dt, ev);
    if (this.cleared) {
      ev.cleared = true;
      return ev;
    }
    if (!this.balls.length) {
      this.lives--;
      ev.lifeLost = true;
      this.capsules = [];
      this.wideLeft = 0;
      this.slowLeft = 0;
      if (this.lives <= 0) ev.gameOver = true;
      else this.waiting = true;
    }
    return ev;
  }

  private setSpeed(s: number): void {
    for (const b of this.balls) {
      const v = Math.hypot(b.vx, b.vy) || 1;
      b.vx = (b.vx / v) * s;
      b.vy = (b.vy / v) * s;
    }
  }

  private moveBall(b: Ball, dt: number, ev: Events): void {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Walls: left, right and top.
    if (b.x < BALL_R) {
      b.x = BALL_R;
      b.vx = Math.abs(b.vx);
      ev.wall = true;
    } else if (b.x > FIELD_W - BALL_R) {
      b.x = FIELD_W - BALL_R;
      b.vx = -Math.abs(b.vx);
      ev.wall = true;
    }
    if (b.y < BALL_R) {
      b.y = BALL_R;
      b.vy = Math.abs(b.vy);
      ev.wall = true;
    }
    // Paddle: only when coming down onto its top.
    const half = this.paddleW / 2;
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 0.2 && Math.abs(b.x - this.paddleX) <= half + BALL_R) {
      // Where it lands sets the angle: the middle sends it straight up, the edges wide.
      const off = Math.max(-1, Math.min(1, (b.x - this.paddleX) / half));
      const a = off * MAX_DEFLECT;
      const s = this.speed;
      b.vx = Math.sin(a) * s;
      b.vy = -Math.cos(a) * s;
      b.y = PADDLE_Y - BALL_R;
      ev.paddle = true;
    }
    this.hitBricks(b, ev);
    this.keepSteep(b);
  }

  /** Bounce off the first brick the ball overlaps, and knock a hit off it. */
  private hitBricks(b: Ball, ev: Events): void {
    const rows = this.wall.length;
    const r0 = Math.max(0, Math.floor((b.y - BALL_R - WALL_TOP) / BRICK_H));
    const r1 = Math.min(rows - 1, Math.floor((b.y + BALL_R - WALL_TOP) / BRICK_H));
    const c0 = Math.max(0, Math.floor(b.x - BALL_R));
    const c1 = Math.min(FIELD_W - 1, Math.floor(b.x + BALL_R));
    let best: { row: number; col: number; d: number; nx: number; ny: number } | null = null;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!this.wall[r][c]) continue;
        const top = WALL_TOP + r * BRICK_H;
        const px = Math.max(c, Math.min(c + 1, b.x));
        const py = Math.max(top, Math.min(top + BRICK_H, b.y));
        const dx = b.x - px;
        const dy = b.y - py;
        const d = dx * dx + dy * dy;
        if (d > BALL_R * BALL_R) continue;
        if (!best || d < best.d) best = { row: r, col: c, d, nx: dx, ny: dy };
      }
    }
    if (!best) return;
    // Bounce off the face it came through: the side the closest point is on, or for a
    // ball whose centre got inside, the side it was heading into least deeply.
    let flipX: boolean;
    if (best.nx !== 0 || best.ny !== 0) flipX = Math.abs(best.nx) > Math.abs(best.ny);
    else {
      const top = WALL_TOP + best.row * BRICK_H;
      const inX = b.vx > 0 ? b.x - best.col : best.col + 1 - b.x;
      const inY = b.vy > 0 ? b.y - top : top + BRICK_H - b.y;
      flipX = inX < inY;
    }
    if (flipX) {
      b.vx = best.nx > 0 || (best.nx === 0 && b.vx < 0) ? Math.abs(b.vx) : -Math.abs(b.vx);
      b.x += Math.sign(b.vx) * 0.02;
    } else {
      b.vy = best.ny > 0 || (best.ny === 0 && b.vy < 0) ? Math.abs(b.vy) : -Math.abs(b.vy);
      b.y += Math.sign(b.vy) * 0.02;
    }
    const v = this.wall[best.row][best.col];
    if (v === UNBREAKABLE) {
      ev.bricksHit.push({ row: best.row, col: best.col, broke: false });
      return;
    }
    this.wall[best.row][best.col] = v - 1;
    const broke = v - 1 === 0;
    ev.bricksHit.push({ row: best.row, col: best.col, broke });
    if (broke && this.level.powerUps && this.rng.next() < DROP_CHANCE) {
      const kinds: Power[] = ['wide', 'slow', 'multi'];
      this.capsules.push({ x: best.col + 0.5, y: WALL_TOP + (best.row + 0.5) * BRICK_H, kind: this.rng.pick(kinds) });
    }
  }

  /** Never let the ball run nearly flat: it would bounce between the side walls for ever. */
  private keepSteep(b: Ball): void {
    const s = Math.hypot(b.vx, b.vy);
    if (!s) return;
    const minVy = s * Math.sin(MIN_ANGLE);
    if (Math.abs(b.vy) < minVy) {
      b.vy = (b.vy < 0 ? -1 : 1) * minVy;
      b.vx = Math.sign(b.vx || 1) * Math.sqrt(s * s - minVy * minVy);
    }
  }

  private moveCapsules(dt: number, ev: Events): void {
    const half = this.paddleW / 2;
    this.capsules = this.capsules.filter((c) => {
      c.y += CAPSULE_SPEED * dt;
      if (c.y >= PADDLE_Y - 0.15 && c.y <= PADDLE_Y + PADDLE_H && Math.abs(c.x - this.paddleX) <= half + 0.4) {
        this.power(c.kind);
        ev.caught.push(c.kind);
        return false;
      }
      return c.y < FIELD_H + 1;
    });
  }

  private power(kind: Power): void {
    if (kind === 'wide') this.wideLeft = POWER_SECONDS.wide;
    else if (kind === 'slow') {
      this.slowLeft = POWER_SECONDS.slow;
      this.setSpeed(this.speed);
    } else {
      // Each ball splits into three, fanned out.
      const more: Ball[] = [];
      for (const b of this.balls) {
        for (const turn of [-0.35, 0.35]) {
          const c = Math.cos(turn);
          const s = Math.sin(turn);
          more.push({ x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c });
        }
      }
      this.balls.push(...more.slice(0, Math.max(0, 9 - this.balls.length)));
    }
  }
}
