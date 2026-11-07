import { Theme } from '../../../shared/themes';

/** Number colours, one per count, chosen to read on light and dark squares. */
const NUMBER_COLORS = ['', '#2f6fe0', '#2e9e44', '#d9443a', '#5b3fb0', '#a8322a', '#138a7e', '#3b3b3b', '#7d7d7d'];
const FLAG = '#e04a3c';

/** What the renderer needs to know about the session each frame. */
export interface MinesView {
  w: number;
  h: number;
  nums: number[];
  open: Uint8Array;
  flagged: Uint8Array;
  hit: Set<number>;
  hinted: number | null;
  won: boolean;
  isMine(i: number): boolean;
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

export class MinesRenderer {
  view: MinesView | null = null;
  /** Square being pressed, drawn sunk in. */
  pressed: number | null = null;
  cell = 32;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** When each square was uncovered, for a short fade-in. */
  private opened = new Map<number, number>();
  private boom: { cell: number; t0: number } | null = null;
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

  setView(v: MinesView | null): void {
    this.view = v;
    this.pressed = null;
    this.opened.clear();
    this.boom = null;
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    this.cell = Math.max(18, Math.min((this.cssW - 16) / v.w, (this.cssH - 12) / v.h, 52));
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

  reveal(cells: number[]): void {
    const now = performance.now();
    cells.forEach((c, k) => this.opened.set(c, now + Math.min(k, 40) * 8));
    this.invalidate();
  }

  explode(cell: number): void {
    this.boom = { cell, t0: performance.now() };
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
      for (let i = 0; i < v.nums.length; i++) more = this.drawSquare(v, i, now) || more;
      if (v.hinted !== null) {
        const c = this.cell;
        ctx.save();
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = Math.max(2.5, c * 0.09);
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
        ctx.strokeRect(this.ox + (v.hinted % v.w) * c + 2, this.oy + ((v.hinted / v.w) | 0) * c + 2, c - 4, c - 4);
        ctx.restore();
        more = true;
      }
      if (this.boom) {
        const t = (now - this.boom.t0) / 500;
        if (t >= 1) this.boom = null;
        else {
          const c = this.cell;
          const cx = this.ox + ((this.boom.cell % v.w) + 0.5) * c;
          const cy = this.oy + (((this.boom.cell / v.w) | 0) + 0.5) * c;
          ctx.strokeStyle = this.theme.danger;
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = Math.max(2, c * 0.1);
          ctx.beginPath();
          ctx.arc(cx, cy, c * (0.3 + t * 1.2), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          more = true;
        }
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawSquare(v: MinesView, i: number, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    const px = this.ox + (i % v.w) * c;
    const py = this.oy + ((i / v.w) | 0) * c;
    const g = Math.max(1, c * 0.04);
    let more = false;
    if (v.open[i] || v.hit.has(i) || (v.won && v.isMine(i))) {
      // Uncovered: flat and pale.
      let a = 1;
      const t0 = this.opened.get(i);
      if (t0 !== undefined) {
        const t = (now - t0) / 160;
        if (t >= 1) this.opened.delete(i);
        else {
          a = Math.max(0, t);
          more = true;
        }
      }
      ctx.fillStyle = v.hit.has(i) ? this.theme.danger : this.theme.surface;
      ctx.globalAlpha = v.hit.has(i) ? 0.35 : 1;
      ctx.fillRect(px + g / 2, py + g / 2, c - g, c - g);
      ctx.globalAlpha = 1;
      if (v.isMine(i)) {
        if (v.won && !v.hit.has(i)) this.drawFlag(px, py);
        else this.drawMine(px, py);
      } else if (v.nums[i] > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = NUMBER_COLORS[v.nums[i]];
        ctx.font = `800 ${Math.round(c * 0.6)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v.nums[i]), px + c / 2, py + c / 2 + c * 0.03);
        ctx.globalAlpha = 1;
      }
      return more;
    }
    // Covered: a raised tile, sunk in while pressed.
    const sunk = this.pressed === i;
    ctx.fillStyle = this.theme.line;
    ctx.globalAlpha = sunk ? 0.32 : 0.22;
    ctx.beginPath();
    ctx.roundRect(px + g, py + g, c - g * 2, c - g * 2, c * 0.14);
    ctx.fill();
    ctx.globalAlpha = sunk ? 0 : 0.18;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(px + g * 2, py + g * 2, c - g * 4, c * 0.22, c * 0.1);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (v.flagged[i]) this.drawFlag(px, py);
    return more;
  }

  private drawFlag(px: number, py: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.strokeStyle = this.theme.text;
    ctx.lineWidth = Math.max(1.5, c * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + c * 0.38, py + c * 0.78);
    ctx.lineTo(px + c * 0.38, py + c * 0.22);
    ctx.stroke();
    ctx.fillStyle = FLAG;
    ctx.beginPath();
    ctx.moveTo(px + c * 0.38, py + c * 0.22);
    ctx.lineTo(px + c * 0.74, py + c * 0.36);
    ctx.lineTo(px + c * 0.38, py + c * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  private drawMine(px: number, py: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const cx = px + c / 2;
    const cy = py + c / 2;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * c * 0.32, cy - Math.sin(a) * c * 0.32);
      ctx.lineTo(cx + Math.cos(a) * c * 0.32, cy + Math.sin(a) * c * 0.32);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, c * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(cx - c * 0.07, cy - c * 0.07, c * 0.05, 0, Math.PI * 2);
    ctx.fill();
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
