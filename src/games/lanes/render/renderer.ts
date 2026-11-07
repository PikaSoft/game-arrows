import { Theme } from '../../../shared/themes';
import { LANES } from '../core/course';
import { LanesSim } from '../core/sim';

const COIN = '#f2c12e';
const HURDLE = '#ee8a3a';
const RUNNER = '#4f9ed8';

/** Rows of road shown ahead of the runner, and behind. */
const AHEAD = 12;
const BEHIND = 3;

export class LanesRenderer {
  sim: LanesSim | null = null;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private laneW = 80;
  private rowH = 40;
  private ox = 0;
  /** Where the runner is drawn across the road (in lanes), easing toward its lane. */
  private shownLane = 1;
  private lastFrame = 0;
  private crashAt = 0;
  private pickups: { lane: number; row: number; t0: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    public theme: Theme,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.rowH = this.cssH / (AHEAD + BEHIND);
    this.laneW = Math.min((this.cssW - 24) / LANES, this.rowH * 2.4);
    this.ox = (this.cssW - this.laneW * LANES) / 2;
  }

  setSim(s: LanesSim | null): void {
    this.sim = s;
    this.shownLane = s ? s.lane : 1;
    this.crashAt = 0;
    this.pickups = [];
  }

  crash(): void {
    this.crashAt = performance.now();
  }

  coin(lane: number, row: number): void {
    this.pickups.push({ lane, row, t0: performance.now() });
  }

  draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    const dt = Math.min(64, now - (this.lastFrame || now));
    this.lastFrame = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s) return;
    const L = this.laneW;
    const R = this.rowH;
    // A shake for a moment after a crash.
    let shake = 0;
    if (this.crashAt) {
      const t = (now - this.crashAt) / 400;
      if (t < 1) shake = Math.sin(t * 40) * (1 - t) * 6;
    }
    ctx.translate(shake, 0);
    const runnerY = this.cssH - BEHIND * R;
    const yOf = (row: number) => runnerY - (row - s.distance) * R;
    const xOf = (lane: number) => this.ox + (lane + 0.5) * L;
    // Road and lane lines, the dashes scrolling past.
    ctx.fillStyle = this.theme.surface;
    ctx.fillRect(this.ox, 0, L * LANES, this.cssH);
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(this.ox, 0);
    ctx.lineTo(this.ox, this.cssH);
    ctx.moveTo(this.ox + L * LANES, 0);
    ctx.lineTo(this.ox + L * LANES, this.cssH);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.setLineDash([R * 0.5, R * 0.5]);
    ctx.lineDashOffset = -((s.distance * R) % R);
    ctx.beginPath();
    for (let k = 1; k < LANES; k++) {
      ctx.moveTo(this.ox + k * L, 0);
      ctx.lineTo(this.ox + k * L, this.cssH);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Things on the road.
    for (const t of s.course.things) {
      const y = yOf(t.row);
      if (y < -R * 2 || y > this.cssH + R) continue;
      const cx = xOf(t.lane);
      if (t.kind === 'wall') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.roundRect(cx - L * 0.4, y - R * 0.95 + 4, L * 0.8, R * 0.9, 8);
        ctx.fill();
        ctx.fillStyle = this.theme.line;
        ctx.beginPath();
        ctx.roundRect(cx - L * 0.4, y - R * 0.95, L * 0.8, R * 0.9, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(cx - L * 0.32, y - R * 0.85, L * 0.64, R * 0.14);
      } else if (t.kind === 'hurdle') {
        // A low bar on two legs: jump it.
        ctx.fillStyle = this.theme.line;
        ctx.fillRect(cx - L * 0.36, y - R * 0.5, L * 0.06, R * 0.42);
        ctx.fillRect(cx + L * 0.3, y - R * 0.5, L * 0.06, R * 0.42);
        ctx.fillStyle = HURDLE;
        ctx.beginPath();
        ctx.roundRect(cx - L * 0.42, y - R * 0.66, L * 0.84, R * 0.24, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 3; k++) ctx.fillRect(cx - L * 0.3 + k * L * 0.25, y - R * 0.66, L * 0.1, R * 0.24);
      } else {
        const bob = Math.sin(now / 200 + t.row) * R * 0.05;
        ctx.fillStyle = COIN;
        ctx.beginPath();
        ctx.arc(cx, y - R * 0.5 + bob, R * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Coins just picked up float off.
    this.pickups = this.pickups.filter((p) => now - p.t0 < 400);
    for (const p of this.pickups) {
      const t = (now - p.t0) / 400;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = COIN;
      ctx.beginPath();
      ctx.arc(xOf(p.lane), runnerY - R * (0.5 + t * 1.5), R * 0.22 * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // The runner: slides between lanes, grows and lifts its shadow while in the air.
    const k = 1 - Math.exp(-dt / 40);
    this.shownLane += (s.lane - this.shownLane) * k;
    if (Math.abs(s.lane - this.shownLane) < 0.01) this.shownLane = s.lane;
    const air = s.airborne ? Math.sin((1 - s.airLeft / 0.55) * Math.PI) : 0;
    const rx = this.ox + (this.shownLane + 0.5) * L;
    const ry = runnerY - R * 0.35;
    const size = R * 0.36 * (1 + air * 0.35);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(rx + air * R * 0.3, ry + R * 0.25, size * 0.9, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.over ? this.theme.danger : RUNNER;
    ctx.beginPath();
    ctx.arc(rx, ry - air * R * 0.3, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Eyes, looking up the road.
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(rx + side * size * 0.35, ry - air * R * 0.3 - size * 0.25, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
