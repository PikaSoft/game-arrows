import { Theme } from '../../../shared/themes';
import { Shape } from '../core/grid';

/** Digits the player has placed: a clear blue, so they stand apart from the givens. */
const PLACED = '#2f7fd0';

/** What the renderer needs to know about the session each frame. */
export interface NumbersView {
  size: number;
  shape: Shape;
  grid: number[];
  notes: number[];
  selected: number | null;
  hinted: number | null;
  isGiven(i: number): boolean;
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

const FLASH_MS = 450;

export class NumbersRenderer {
  view: NumbersView | null = null;
  cell = 36;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** A square flashing red after a wrong digit. */
  private flash: { cell: number; t0: number } | null = null;
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

  setView(v: NumbersView | null): void {
    this.view = v;
    this.flash = null;
    this.pops.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    this.cell = Math.max(20, Math.min((this.cssW - 16) / v.size, (this.cssH - 12) / v.size, 64));
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

  wrong(cell: number): void {
    this.flash = { cell, t0: performance.now() };
    this.invalidate();
  }

  pop(cell: number): void {
    this.pops.set(cell, performance.now());
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
      more = this.drawCells(v, now) || more;
      this.drawGrid(v);
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawCells(v: NumbersView, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    const { size, shape } = v;
    let more = false;
    ctx.fillStyle = this.theme.surface;
    ctx.fillRect(this.ox, this.oy, size * c, size * c);
    const sel = v.selected;
    const selDigit = sel !== null ? v.grid[sel] : 0;
    const peers = sel !== null ? new Set(shape.peers[sel]) : null;
    const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < size * size; i++) {
      const x = i % size;
      const y = (i / size) | 0;
      const px = this.ox + x * c;
      const py = this.oy + y * c;
      // Highlights: the selected square, its row, column and box, and squares with the same digit.
      let tint = 0;
      if (i === sel) tint = 0.38;
      else if (selDigit && v.grid[i] === selDigit) tint = 0.26;
      else if (peers?.has(i)) tint = 0.1;
      if (tint) {
        ctx.fillStyle = this.theme.accent;
        ctx.globalAlpha = tint;
        ctx.fillRect(px, py, c, c);
        ctx.globalAlpha = 1;
      }
      if (this.flash && this.flash.cell === i) {
        const t = (now - this.flash.t0) / FLASH_MS;
        if (t >= 1) this.flash = null;
        else {
          ctx.fillStyle = this.theme.danger;
          ctx.globalAlpha = 0.45 * (1 - t);
          ctx.fillRect(px, py, c, c);
          ctx.globalAlpha = 1;
          more = true;
        }
      }
      if (v.hinted === i) {
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = Math.max(2, c * 0.08);
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
        ctx.strokeRect(px + 2, py + 2, c - 4, c - 4);
        ctx.globalAlpha = 1;
        more = true;
      }
      const d = v.grid[i];
      if (d) {
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
        const given = v.isGiven(i);
        ctx.fillStyle = given ? this.theme.text : PLACED;
        ctx.font = font(given ? 700 : 600, Math.round(c * 0.58 * scale));
        ctx.fillText(String(d), px + c / 2, py + c / 2 + c * 0.03);
      } else if (v.notes[i]) {
        // Notes in a small grid: 3x3 on 9x9 boards, 3x2 on 6x6.
        const cols = 3;
        const rows = Math.ceil(size / 3);
        ctx.fillStyle = this.theme.muted;
        ctx.font = font(600, Math.max(8, Math.round((c / rows) * 0.62)));
        for (let n = 1; n <= size; n++) {
          if (!(v.notes[i] & (1 << (n - 1)))) continue;
          const nx = (n - 1) % cols;
          const ny = Math.floor((n - 1) / cols);
          ctx.fillText(String(n), px + (nx + 0.5) * (c / cols), py + (ny + 0.5) * (c / rows) + 1);
        }
      }
    }
    return more;
  }

  /** Thin lines between squares, thick ones round the boxes. */
  private drawGrid(v: NumbersView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { size, shape } = v;
    ctx.strokeStyle = this.theme.line;
    for (let k = 0; k <= size; k++) {
      const vMajor = k % shape.boxW === 0;
      ctx.globalAlpha = vMajor ? 0.9 : 0.22;
      ctx.lineWidth = vMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(this.ox + k * c, this.oy);
      ctx.lineTo(this.ox + k * c, this.oy + size * c);
      ctx.stroke();
      const hMajor = k % shape.boxH === 0;
      ctx.globalAlpha = hMajor ? 0.9 : 0.22;
      ctx.lineWidth = hMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(this.ox, this.oy + k * c);
      ctx.lineTo(this.ox + size * c, this.oy + k * c);
      ctx.stroke();
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
