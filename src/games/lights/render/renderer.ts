import { Theme } from '../../../shared/themes';

/** Lit lights: warm yellow, the same on every theme. */
export const LIGHT = '#f6c344';

/** What the renderer needs to know about the session each frame. */
export interface LightsView {
  w: number;
  h: number;
  board: number[];
  level: { states: number; pattern: 'plus' | 'cross' };
  hinted: number | null;
  reach(i: number): number[];
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

const FLIP_MS = 220;

export class LightsRenderer {
  view: LightsView | null = null;
  /** Tile the finger is on: its reach is outlined, so the player sees what a tap will do. */
  pressed: number | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** When each tile last changed, for a short pop. */
  private flips = new Map<number, number>();
  private particles: Particle[] = [];
  private raf = 0;

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

  setView(v: LightsView | null): void {
    this.view = v;
    this.pressed = null;
    this.flips.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    this.cell = Math.max(20, Math.min((this.cssW - 20) / v.w, (this.cssH - 20) / v.h, 84));
    this.ox = (this.cssW - v.w * this.cell) / 2;
    this.oy = (this.cssH - v.h * this.cell) / 2;
  }

  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.w || y >= v.h ? null : y * v.w + x;
  }

  /** Tiles that just changed pop briefly. */
  flip(tiles: number[]): void {
    const now = performance.now();
    for (const i of tiles) this.flips.set(i, now);
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
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      const reach = this.pressed !== null ? new Set(v.reach(this.pressed)) : null;
      for (let i = 0; i < v.board.length; i++) more = this.drawTile(v, i, now, reach?.has(i) ?? false) || more;
      if (v.hinted !== null) {
        this.drawHint(v, v.hinted, now);
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawTile(v: LightsView, i: number, now: number, inReach: boolean): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    const x = i % v.w;
    const y = (i / v.w) | 0;
    let pop = 0;
    let moving = false;
    const f = this.flips.get(i);
    if (f !== undefined) {
      const t = (now - f) / FLIP_MS;
      if (t >= 1) this.flips.delete(i);
      else {
        pop = Math.sin(t * Math.PI);
        moving = true;
      }
    }
    const pad = c * (0.07 + pop * 0.04);
    const px = this.ox + x * c + pad;
    const py = this.oy + y * c + pad;
    const s = c - pad * 2;
    const r = c * 0.16;
    const step = v.board[i];
    const three = v.level.states === 3;
    // Three-step lights: 1 is bright, 2 is dim (one tap from off).
    const glow = step === 0 ? 0 : three && step === 2 ? 0.45 : 1;
    // Tile body.
    ctx.fillStyle = this.theme.line;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.roundRect(px, py + c * 0.04, s, s, r);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(px, py, s, s, r);
    ctx.fill();
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.shadowColor = LIGHT;
      ctx.shadowBlur = c * 0.35 * glow;
      ctx.fillStyle = LIGHT;
      ctx.beginPath();
      ctx.roundRect(px, py, s, s, r);
      ctx.fill();
      ctx.restore();
      // A soft highlight.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.globalAlpha = glow;
      ctx.beginPath();
      ctx.roundRect(px + s * 0.12, py + s * 0.1, s * 0.76, s * 0.18, s * 0.09);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = inReach ? Math.max(2, c * 0.05) : 1;
    ctx.strokeStyle = inReach ? this.theme.accent : this.theme.muted;
    ctx.globalAlpha = inReach ? 1 : 0.5;
    ctx.beginPath();
    ctx.roundRect(px, py, s, s, r);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // On three-step boards, pips show how many taps each light needs to go off.
    if (three && step !== 0) {
      const pips = step === 1 ? 2 : 1;
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.7;
      for (let k = 0; k < pips; k++) {
        ctx.beginPath();
        ctx.arc(px + s * (pips === 1 ? 0.5 : 0.38 + k * 0.24), py + s * 0.78, Math.max(1.5, c * 0.045), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    return moving;
  }

  private drawHint(v: LightsView, i: number, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const x = i % v.w;
    const y = (i / v.w) | 0;
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2.5, c * 0.07);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    ctx.beginPath();
    ctx.roundRect(this.ox + x * c + c * 0.02, this.oy + y * c + c * 0.02, c * 0.96, c * 0.96, c * 0.2);
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
}
