import { Theme } from '../../../shared/themes';
import { DOT, STAR } from '../core/types';

/** Soft region colours, mixed with the theme's surface so they suit light and dark themes. */
const REGION_COLORS = ['#f6c2b9', '#f7dca0', '#c9e6b0', '#b6dcef', '#d8c6ef', '#f5c6df', '#bfe6dd', '#f1d1b0', '#d6d9a8', '#c5cdf2'];
const STAR_COLOR = '#e8a637';

/** What the renderer needs to know about the session each frame. */
export interface StarsView {
  size: number;
  level: { regions: number[] };
  known: number[];
  mistakes: Set<number>;
  hinted: number | null;
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

export class StarsRenderer {
  view: StarsView | null = null;
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

  setView(v: StarsView | null): void {
    this.view = v;
    this.focus = null;
    this.pops.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    this.cell = Math.max(18, Math.min((this.cssW - 20) / v.size, (this.cssH - 16) / v.size, 64));
    this.ox = (this.cssW - v.size * this.cell) / 2;
    this.oy = (this.cssH - v.size * this.cell) / 2;
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
      more = this.drawSquares(v, now);
      this.drawBorders(v);
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

  private drawSquares(v: StarsView, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    let more = false;
    const fx = this.focus !== null ? this.focus % v.size : -1;
    const fy = this.focus !== null ? (this.focus / v.size) | 0 : -1;
    for (let i = 0; i < v.known.length; i++) {
      const x = i % v.size;
      const y = (i / v.size) | 0;
      const px = this.ox + x * c;
      const py = this.oy + y * c;
      ctx.fillStyle = this.mix(REGION_COLORS[v.level.regions[i] % REGION_COLORS.length], this.theme.surface, 0.35);
      ctx.fillRect(px, py, c, c);
      if (x === fx || y === fy) {
        ctx.fillStyle = this.theme.accent;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(px, py, c, c);
        ctx.globalAlpha = 1;
      }
      let scale = 1;
      const p = this.pops.get(i);
      if (p !== undefined) {
        const t = (now - p) / 220;
        if (t >= 1) this.pops.delete(i);
        else {
          scale = 1 + Math.sin(t * Math.PI) * 0.25;
          more = true;
        }
      }
      const wrong = v.mistakes.has(i);
      if (v.known[i] === STAR) this.drawStar(px + c / 2, py + c / 2, c * 0.34 * scale, wrong ? this.theme.danger : STAR_COLOR);
      else if (v.known[i] === DOT) {
        ctx.fillStyle = wrong ? this.theme.danger : this.theme.line;
        ctx.globalAlpha = wrong ? 1 : 0.45;
        ctx.beginPath();
        ctx.arc(px + c / 2, py + c / 2, Math.max(2, c * (wrong ? 0.12 : 0.08)) * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (wrong) {
        ctx.strokeStyle = this.theme.danger;
        ctx.lineWidth = Math.max(2, c * 0.06);
        ctx.strokeRect(px + c * 0.1, py + c * 0.1, c * 0.8, c * 0.8);
      }
    }
    return more;
  }

  /** Thin lines between squares, thick ones where regions meet, and a frame. */
  private drawBorders(v: StarsView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const n = v.size;
    const reg = v.level.regions;
    ctx.strokeStyle = this.theme.line;
    ctx.lineCap = 'round';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        // Right edge and bottom edge of each square.
        if (x < n - 1) {
          const thick = reg[i] !== reg[i + 1];
          ctx.globalAlpha = thick ? 0.9 : 0.2;
          ctx.lineWidth = thick ? Math.max(2, c * 0.07) : 1;
          ctx.beginPath();
          ctx.moveTo(this.ox + (x + 1) * c, this.oy + y * c);
          ctx.lineTo(this.ox + (x + 1) * c, this.oy + (y + 1) * c);
          ctx.stroke();
        }
        if (y < n - 1) {
          const thick = reg[i] !== reg[i + n];
          ctx.globalAlpha = thick ? 0.9 : 0.2;
          ctx.lineWidth = thick ? Math.max(2, c * 0.07) : 1;
          ctx.beginPath();
          ctx.moveTo(this.ox + x * c, this.oy + (y + 1) * c);
          ctx.lineTo(this.ox + (x + 1) * c, this.oy + (y + 1) * c);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(2.5, c * 0.08);
    ctx.strokeRect(this.ox, this.oy, n * c, n * c);
    ctx.globalAlpha = 1;
  }

  private drawStar(cx: number, cy: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
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
