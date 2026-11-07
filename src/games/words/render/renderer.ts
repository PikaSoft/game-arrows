import { Theme } from '../../../shared/themes';

const GOOD = '#5aa457';

export type Flash = 'new' | 'again' | 'unknown';

/** Draws the letter grid, the path being traced, and a short flash after each try. */
export class WordsRenderer {
  size = 4;
  letters: string[] = [];
  /** The squares being traced, in order. */
  path: number[] = [];
  /** Squares to point at for a hint (the start of a word). */
  hint: number[] = [];
  cell = 70;
  ox = 0;
  oy = 0;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private flash: { cells: number[]; kind: Flash; t0: number } | null = null;
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
    this.cell = Math.max(36, Math.min((this.cssW - 20) / this.size, (this.cssH - 12) / this.size, 92));
    this.ox = (this.cssW - this.size * this.cell) / 2;
    this.oy = (this.cssH - this.size * this.cell) / 2;
    this.invalidate();
  }

  /**
   * The square under a point, but only near its middle: a finger cutting a corner on its
   * way to a diagonal neighbour shouldn't pick up the squares beside the corner.
   */
  cellAt(px: number, py: number): number | null {
    const c = this.cell;
    const fx = (px - this.ox) / c;
    const fy = (py - this.oy) / c;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    if (Math.hypot(fx - x - 0.5, fy - y - 0.5) > 0.42) return null;
    return y * this.size + x;
  }

  show(cells: number[], kind: Flash): void {
    this.flash = { cells, kind, t0: performance.now() };
    this.invalidate();
  }

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private centre(i: number): [number, number] {
    return [this.ox + ((i % this.size) + 0.5) * this.cell, this.oy + (((i / this.size) | 0) + 0.5) * this.cell];
  }

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (!this.letters.length) return;
    const c = this.cell;
    let more = false;
    let flashCells = new Set<number>();
    let flashColour = '';
    let flashAlpha = 0;
    if (this.flash) {
      const t = (now - this.flash.t0) / 450;
      if (t >= 1) this.flash = null;
      else {
        flashCells = new Set(this.flash.cells);
        flashColour = this.flash.kind === 'new' ? GOOD : this.flash.kind === 'again' ? this.theme.muted : this.theme.danger;
        flashAlpha = 1 - t;
        more = true;
      }
    }
    const inPath = new Set(this.path);
    // The line through the path, under the letters.
    if (this.path.length > 1) {
      ctx.strokeStyle = this.theme.accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = c * 0.22;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.path.forEach((i, k) => {
        const [x, y] = this.centre(i);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < this.letters.length; i++) {
      const x = this.ox + (i % this.size) * c;
      const y = this.oy + ((i / this.size) | 0) * c;
      const pad = c * 0.07;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad + 3, c - pad * 2, c - pad * 2, c * 0.18);
      ctx.fill();
      ctx.fillStyle = inPath.has(i) ? this.theme.accent : this.theme.surface;
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad, c - pad * 2, c - pad * 2, c * 0.18);
      ctx.fill();
      if (flashCells.has(i)) {
        ctx.fillStyle = flashColour;
        ctx.globalAlpha = flashAlpha * 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = this.theme.text;
      ctx.font = `800 ${Math.round(c * 0.48)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.letters[i].toUpperCase(), x + c / 2, y + c / 2 + c * 0.02);
    }
    // A hint: rings round where a word starts, the first square brightest.
    this.hint.forEach((i, k) => {
      const [x, y] = this.centre(i);
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = Math.max(2.5, c * 0.06);
      ctx.globalAlpha = (0.55 + 0.45 * Math.sin(now / 180)) * (k === 0 ? 1 : 0.5);
      ctx.beginPath();
      ctx.arc(x, y, c * 0.44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      more = true;
    });
    if (more) this.invalidate();
  }
}
