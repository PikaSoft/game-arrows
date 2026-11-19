import { Theme } from '../../../shared/themes';
import { A, B, EMPTY } from '../core/types';

/** The two tones, the same on every theme. A is a filled disc, B a ring, so shape tells them apart too. */
export const TONE_A = '#ee7d2a';
export const TONE_B = '#2f6fe0';

/** What the renderer needs to know about the session each frame. */
export interface TonesView {
  size: number;
  known: number[];
  mistakes: Set<number>;
  hinted: number | null;
  isGiven(i: number): boolean;
  needs(li: number, tone: number): number;
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

const POP_MS = 220;

export class TonesRenderer {
  view: TonesView | null = null;
  /** The square under the finger: its row and column get a soft band. */
  focus: number | null = null;
  cell = 36;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private pops = new Map<number, number>();
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

  setView(v: TonesView | null): void {
    this.view = v;
    this.focus = null;
    this.pops.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  /** The grid plus a margin of 0.9 squares on the right and below for the counters. */
  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const span = v.size + 0.9;
    this.cell = Math.max(18, Math.min((this.cssW - 16) / span, (this.cssH - 12) / span, 60));
    this.ox = (this.cssW - span * this.cell) / 2;
    this.oy = (this.cssH - span * this.cell) / 2;
  }

  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.size || y >= v.size ? null : y * v.size + x;
  }

  pop(cells: number[]): void {
    const now = performance.now();
    for (const i of cells) this.pops.set(i, now);
    this.invalidate();
  }

  celebrate(): void {
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
      this.drawGrid(v);
      for (let i = 0; i < v.known.length; i++) more = this.drawSquare(v, i, now) || more;
      this.drawCounters(v);
      if (v.hinted !== null) {
        const c = this.cell;
        ctx.save();
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = Math.max(2.5, c * 0.09);
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
        ctx.strokeRect(this.ox + (v.hinted % v.size) * c + 3, this.oy + ((v.hinted / v.size) | 0) * c + 3, c - 6, c - 6);
        ctx.restore();
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawGrid(v: TonesView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const n = v.size;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox - 3, this.oy - 3, n * c + 6, n * c + 6, Math.max(6, c * 0.18));
    ctx.fill();
    if (this.focus !== null) {
      // A soft band along the row and column under the finger.
      const fx = this.focus % n;
      const fy = (this.focus / n) | 0;
      ctx.fillStyle = this.theme.accent;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(this.ox, this.oy + fy * c, n * c, c);
      ctx.fillRect(this.ox + fx * c, this.oy, c, n * c);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = this.theme.muted;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (let k = 1; k < n; k++) {
      ctx.moveTo(this.ox + k * c, this.oy);
      ctx.lineTo(this.ox + k * c, this.oy + n * c);
      ctx.moveTo(this.ox, this.oy + k * c);
      ctx.lineTo(this.ox + n * c, this.oy + k * c);
    }
    ctx.stroke();
    // Heavier lines every two squares on big boards, to help count.
    if (n >= 8) {
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 2; k < n; k += 2) {
        ctx.moveTo(this.ox + k * c, this.oy);
        ctx.lineTo(this.ox + k * c, this.oy + n * c);
        ctx.moveTo(this.ox, this.oy + k * c);
        ctx.lineTo(this.ox + n * c, this.oy + k * c);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** One square. True while it is still popping in. */
  private drawSquare(v: TonesView, i: number, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    const x = this.ox + (i % v.size) * c;
    const y = this.oy + ((i / v.size) | 0) * c;
    if (v.isGiven(i)) {
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.09;
      ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
      ctx.globalAlpha = 1;
    }
    const t = v.known[i];
    let moving = false;
    if (t !== EMPTY) {
      let k = 1;
      const p = this.pops.get(i);
      if (p !== undefined) {
        const u = (now - p) / POP_MS;
        if (u >= 1) this.pops.delete(i);
        else {
          k = 0.6 + 0.4 * Math.sin((u * Math.PI) / 2) + 0.12 * Math.sin(u * Math.PI);
          moving = true;
        }
      }
      this.tone(x + c / 2, y + c / 2, c * 0.33 * k, t);
    }
    if (v.mistakes.has(i)) {
      ctx.strokeStyle = this.theme.danger;
      ctx.lineWidth = Math.max(2, c * 0.08);
      ctx.strokeRect(x + 2.5, y + 2.5, c - 5, c - 5);
    }
    return moving;
  }

  /** A tone mark: A a filled disc, B a thick ring. */
  tone(x: number, y: number, r: number, t: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (t === A) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = TONE_A;
      ctx.fill();
    } else if (t === B) {
      const w = Math.max(2.5, r * 0.42);
      ctx.arc(x, y, r - w / 2, 0, Math.PI * 2);
      ctx.strokeStyle = TONE_B;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  }

  /** How many of each tone every line still needs: right of each row, below each column. Zeros fade. */
  private drawCounters(v: TonesView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const n = v.size;
    const font = Math.max(9, c * 0.3);
    ctx.font = `700 ${font}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pair = (li: number, ax: number, ay: number, bx: number, by: number) => {
      const a = v.needs(li, A);
      const b = v.needs(li, B);
      ctx.fillStyle = TONE_A;
      ctx.globalAlpha = a ? 1 : 0.25;
      ctx.fillText(String(a), ax, ay);
      ctx.fillStyle = TONE_B;
      ctx.globalAlpha = b ? 1 : 0.25;
      ctx.fillText(String(b), bx, by);
    };
    const right = this.ox + n * c + c * 0.45;
    for (let y = 0; y < n; y++) {
      const cy = this.oy + (y + 0.5) * c;
      pair(y, right, cy - c * 0.2, right, cy + c * 0.2);
    }
    const below = this.oy + n * c + c * 0.45;
    for (let x = 0; x < n; x++) {
      const cx = this.ox + (x + 0.5) * c;
      pair(n + x, cx - c * 0.2, below, cx + c * 0.2, below);
    }
    ctx.globalAlpha = 1;
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
