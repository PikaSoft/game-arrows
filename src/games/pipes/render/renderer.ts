import { Theme } from '../../../shared/themes';
import { degree } from '../core/rules';
import { DIRS } from '../core/types';

/** Water: the same blue on every theme, so it always reads as water. */
export const WATER = '#3f95dc';

/** What the renderer needs to know about the session each frame. */
export interface PipeView {
  w: number;
  h: number;
  /** Each tile's openings before any turns. */
  base: number[];
  /** Quarter turns applied to each tile. */
  turns: number[];
  locked: boolean[];
  source: number;
  hinted: number | null;
  watered(): Set<number>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  t0: number;
  life: number;
  size: number;
}

const SHAKE_MS = 300;
/** How long a quarter turn takes. */
const TURN_MS = 140;

export class PipeRenderer {
  view: PipeView | null = null;
  /** Cell size and the board's top-left corner, in CSS pixels. */
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** Turns each tile is drawn at: glides toward the session's turns. */
  private shown: number[] = [];
  /** When each tile last joined the water, for a short brightening. */
  private wetSince = new Map<number, number>();
  private shakes = new Map<number, number>();
  private particles: Particle[] = [];
  private raf = 0;
  private lastFrame = 0;

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
    this.layout();
    this.invalidate();
  }

  setView(v: PipeView | null): void {
    this.view = v;
    this.shown = v ? v.turns.slice() : [];
    this.wetSince.clear();
    this.shakes.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  /** Show every tile at its current turn straight away (after restart). */
  snap(): void {
    if (this.view) this.shown = this.view.turns.slice();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    this.cell = Math.max(16, Math.min((this.cssW - 24) / v.w, (this.cssH - 24) / v.h, 76));
    this.ox = (this.cssW - v.w * this.cell) / 2;
    this.oy = (this.cssH - v.h * this.cell) / 2;
  }

  /** The tile under a point on the canvas, or null. */
  tileAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.w || y >= v.h ? null : y * v.w + x;
  }

  shake(i: number): void {
    this.shakes.set(i, performance.now());
    this.invalidate();
  }

  confetti(): void {
    const t0 = performance.now();
    for (let k = 0; k < 90; k++) {
      this.particles.push({
        x: Math.random() * this.cssW,
        y: -10 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 0.08,
        vy: 0.12 + Math.random() * 0.18,
        color: this.theme.confetti[k % this.theme.confetti.length],
        t0: t0 + Math.random() * 400,
        life: 2200,
        size: 3 + Math.random() * 3,
      });
    }
    this.invalidate();
  }

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    const dt = Math.min(64, now - (this.lastFrame || now));
    this.lastFrame = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      // Glide each tile toward its turn. A long way behind (several fast taps) catches up quicker.
      let settling = false;
      for (let i = 0; i < v.turns.length; i++) {
        const target = v.turns[i];
        const s = this.shown[i] ?? target;
        const gap = target - s;
        if (Math.abs(gap) < 0.01) {
          this.shown[i] = target;
          continue;
        }
        const step = (dt / TURN_MS) * Math.max(1, Math.abs(gap) * 1.5);
        this.shown[i] = Math.abs(gap) <= step ? target : s + Math.sign(gap) * step;
        settling = true;
      }
      // Water only flows through tiles that have finished turning.
      const wet = v.watered();
      for (let i = 0; i < v.turns.length; i++) if (this.shown[i] !== v.turns[i]) wet.delete(i);
      for (const i of wet) if (!this.wetSince.has(i)) this.wetSince.set(i, now);
      for (const i of [...this.wetSince.keys()]) if (!wet.has(i)) this.wetSince.delete(i);
      this.drawBoard(v);
      for (let i = 0; i < v.turns.length; i++) more = this.drawTile(v, i, wet.has(i), now) || more;
      if (v.hinted !== null) {
        this.drawHint(v.hinted, now);
        more = true;
      }
      more = more || settling;
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
    else this.lastFrame = 0;
  }

  private drawBoard(v: PipeView): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox - c * 0.08, this.oy - c * 0.08, v.w * c + c * 0.16, v.h * c + c * 0.16, c * 0.18);
    ctx.fill();
    // Faint grid lines between tiles.
    ctx.strokeStyle = this.theme.muted;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < v.w; x++) {
      ctx.moveTo(this.ox + x * c, this.oy);
      ctx.lineTo(this.ox + x * c, this.oy + v.h * c);
    }
    for (let y = 1; y < v.h; y++) {
      ctx.moveTo(this.ox, this.oy + y * c);
      ctx.lineTo(this.ox + v.w * c, this.oy + y * c);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** One tile: its pipe arms turned to where it is drawn, wet or dry. True while animating. */
  private drawTile(v: PipeView, i: number, wet: boolean, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    const x = i % v.w;
    const y = (i / v.w) | 0;
    let cx = this.ox + (x + 0.5) * c;
    const cy = this.oy + (y + 0.5) * c;
    let moving = false;
    const sh = this.shakes.get(i);
    if (sh !== undefined) {
      const t = (now - sh) / SHAKE_MS;
      if (t >= 1) this.shakes.delete(i);
      else {
        cx += Math.sin(t * Math.PI * 6) * (1 - t) * c * 0.08;
        moving = true;
      }
    }
    if (v.locked[i]) {
      // A locked tile sits on a slightly darker square with a small pin in the corner.
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.roundRect(cx - c * 0.46, cy - c * 0.46, c * 0.92, c * 0.92, c * 0.12);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(cx + c * 0.34, cy - c * 0.34, Math.max(1.5, c * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const base = v.base[i];
    const deg = degree(base);
    const isSource = i === v.source;
    const glow = wet ? Math.max(0, 1 - (now - (this.wetSince.get(i) ?? 0)) / 400) : 0;
    if (glow > 0) moving = true;
    const fill = wet ? WATER : this.mix(this.theme.surface, this.theme.muted, 0.35);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((this.shown[i] ?? 0) * (Math.PI / 2));
    const arm = c * 0.5;
    const outer = c * 0.3;
    const inner = c * 0.18;
    const arms = () => {
      ctx.beginPath();
      for (let d = 0; d < 4; d++) {
        if (!(base & DIRS[d])) continue;
        // Directions in the tile's own frame: north is up before rotation.
        const ax = [0, 1, 0, -1][d];
        const ay = [-1, 0, 1, 0][d];
        ctx.moveTo(0, 0);
        ctx.lineTo(ax * arm, ay * arm);
      }
    };
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    // Pipe walls, then the inside of the pipe.
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = outer;
    arms();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, outer / 2, 0, Math.PI * 2);
    ctx.fillStyle = this.theme.line;
    ctx.fill();
    ctx.strokeStyle = fill;
    ctx.lineWidth = inner;
    arms();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, inner / 2, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    if (isSource) {
      // The tap: a ring in the accent colour with water in the middle.
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.accent;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, c * 0.05);
      ctx.strokeStyle = this.theme.line;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = WATER;
      ctx.fill();
    } else if (deg === 1) {
      // An outlet: a round basin that fills when the water arrives.
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = wet ? WATER : this.theme.surface;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, c * 0.06);
      ctx.strokeStyle = this.theme.line;
      ctx.stroke();
      if (wet) {
        ctx.beginPath();
        ctx.arc(cx - c * 0.06, cy - c * 0.06, c * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
      }
    }
    if (glow > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = WATER;
      ctx.globalAlpha = 0.18 * glow;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    return moving;
  }

  private drawHint(i: number, now: number): void {
    const v = this.view!;
    const ctx = this.ctx;
    const c = this.cell;
    const x = i % v.w;
    const y = (i / v.w) | 0;
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2, c * 0.07);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    ctx.beginPath();
    ctx.roundRect(this.ox + x * c + c * 0.05, this.oy + y * c + c * 0.05, c * 0.9, c * 0.9, c * 0.14);
    ctx.stroke();
    ctx.restore();
  }

  private drawParticles(now: number): boolean {
    if (!this.particles.length) return false;
    const ctx = this.ctx;
    this.particles = this.particles.filter((q) => now - q.t0 < q.life);
    for (const q of this.particles) {
      const dt = now - q.t0;
      if (dt < 0) continue;
      const x = q.x + q.vx * dt;
      const y = q.y + q.vy * dt + 0.00012 * dt * dt;
      ctx.globalAlpha = 1 - dt / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(x - q.size / 2, y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    return this.particles.length > 0;
  }

  private mix(a: string, b: string, k: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
}
