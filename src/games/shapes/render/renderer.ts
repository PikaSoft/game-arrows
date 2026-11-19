import { Theme } from '../../../shared/themes';
import { ShapeGame, SIZE, TRAY } from '../core/game';
import { PIECES } from '../core/pieces';

/** Piece colours, the same on every theme. */
export const PIECE_COLORS = ['#e5413b', '#2f6fe0', '#2e9e44', '#f2b324', '#8e4fd6', '#2cb5c4', '#ee7d2a'];

/** A piece being dragged: which tray slot, and where the finger is (canvas pixels). */
export interface Drag {
  slot: number;
  px: number;
  py: number;
}

interface Fade {
  i: number;
  colour: number;
  t0: number;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  t0: number;
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

const FADE_MS = 320;
const POP_MS = 180;
const POPUP_MS = 900;

export class ShapesRenderer {
  game: ShapeGame | null = null;
  drag: Drag | null = null;
  /** Board square size and top-left; tray area below. */
  cell = 36;
  ox = 0;
  oy = 0;
  trayTop = 0;
  trayCell = 18;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private fades: Fade[] = [];
  private pops = new Map<number, number>();
  private popups: Popup[] = [];
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

  setGame(g: ShapeGame | null): void {
    this.game = g;
    this.drag = null;
    this.fades = [];
    this.pops.clear();
    this.popups = [];
    this.particles = [];
    this.invalidate();
  }

  /** The board fills the width (up to a point); the tray takes about a third of its height below. */
  layout(): void {
    if (!this.cssW) return;
    // Board height + tray (3.2 squares) + gaps must fit.
    this.cell = Math.max(20, Math.min((this.cssW - 24) / SIZE, (this.cssH - 24) / (SIZE + 3.6), 56));
    this.ox = (this.cssW - SIZE * this.cell) / 2;
    const total = SIZE * this.cell + this.cell * 3.6;
    this.oy = Math.max(8, (this.cssH - total) / 2);
    this.trayTop = this.oy + SIZE * this.cell + this.cell * 0.6;
    this.trayCell = Math.min(this.cell * 0.55, (this.cssW - 24) / TRAY / 5.6);
  }

  /** Centre of tray slot k. */
  slotCentre(k: number): [number, number] {
    const w = (this.cssW - 16) / TRAY;
    return [8 + w * (k + 0.5), this.trayTop + this.cell * 1.5];
  }

  /** The tray slot under a point, or null. Generous: the whole third of the tray area. */
  slotAt(px: number, py: number): number | null {
    if (py < this.trayTop - this.cell * 0.3) return null;
    const w = (this.cssW - 16) / TRAY;
    const k = Math.floor((px - 8) / w);
    return k >= 0 && k < TRAY ? k : null;
  }

  /** How far above the finger a dragged piece sits, so the thumb never hides it. */
  private lift(): number {
    return this.cell * 1.4;
  }

  /** Top-left of a dragged piece in canvas pixels, and the board square it snaps to. */
  dragSpot(d: Drag): { left: number; top: number; gx: number; gy: number } {
    const p = PIECES[this.game!.tray[d.slot]];
    const left = d.px - (p.w * this.cell) / 2;
    const top = d.py - this.lift() - p.h * this.cell;
    return { left, top, gx: Math.round((left - this.ox) / this.cell), gy: Math.round((top - this.oy) / this.cell) };
  }

  /** Squares just filled pop in; cleared squares fade out; points float up from the clear. */
  played(filled: number[], cleared: { i: number; colour: number }[], gained: number, at: [number, number] | null): void {
    const now = performance.now();
    for (const i of filled) this.pops.set(i, now);
    for (const c of cleared) this.fades.push({ ...c, t0: now });
    if (at && gained) this.popups.push({ x: at[0], y: at[1], text: `+${gained}`, t0: now });
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
    const g = this.game;
    if (g) {
      this.drawBoard(g, now);
      more = this.drawFades(now) || more;
      this.drawTray(g);
      if (this.drag) this.drawDrag(g, this.drag);
      more = this.drawPopups(now) || more;
      if (this.pops.size) more = true;
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private square(x: number, y: number, s: number, colour: string, alpha = 1): void {
    const ctx = this.ctx;
    const pad = Math.max(1, s * 0.06);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, s - pad * 2, s - pad * 2, s * 0.18);
    ctx.fill();
    // A soft highlight along the top for a little depth.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(x + pad * 2, y + pad * 2, s - pad * 4, s * 0.22, s * 0.1);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawBoard(g: ShapeGame, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox - 6, this.oy - 6, SIZE * c + 12, SIZE * c + 12, c * 0.25);
    ctx.fill();
    // Where a dragged piece would land, and the lines it would clear.
    let ghost: Set<number> | null = null;
    let lines: Set<number> | null = null;
    if (this.drag) {
      const id = g.tray[this.drag.slot];
      const { gx, gy } = this.dragSpot(this.drag);
      if (id >= 0 && g.fits(id, gx, gy)) {
        ghost = new Set(PIECES[id].cells.map(([cx, cy]) => (gy + cy) * SIZE + gx + cx));
        const w = g.wouldClear(id, gx, gy);
        lines = new Set<number>();
        for (const r of w.rows) for (let k = 0; k < SIZE; k++) lines.add(r * SIZE + k);
        for (const col of w.cols) for (let k = 0; k < SIZE; k++) lines.add(k * SIZE + col);
      }
    }
    for (let i = 0; i < SIZE * SIZE; i++) {
      const x = this.ox + (i % SIZE) * c;
      const y = this.oy + ((i / SIZE) | 0) * c;
      const v = g.cells[i];
      if (lines?.has(i)) {
        ctx.fillStyle = this.theme.accent;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x, y, c, c);
        ctx.globalAlpha = 1;
      }
      if (v) {
        let s = c;
        const p = this.pops.get(i);
        if (p !== undefined) {
          const t = (now - p) / POP_MS;
          if (t >= 1) this.pops.delete(i);
          else s = c * (0.75 + 0.25 * t);
        }
        this.square(x + (c - s) / 2, y + (c - s) / 2, s, PIECE_COLORS[v - 1]);
      } else if (ghost?.has(i)) {
        this.square(x, y, c, PIECE_COLORS[PIECES[g.tray[this.drag!.slot]].colour], 0.4);
      } else {
        ctx.fillStyle = this.theme.line;
        ctx.globalAlpha = 0.07;
        ctx.beginPath();
        ctx.roundRect(x + c * 0.06, y + c * 0.06, c * 0.88, c * 0.88, c * 0.16);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawFades(now: number): boolean {
    const c = this.cell;
    this.fades = this.fades.filter((f) => now - f.t0 < FADE_MS);
    for (const f of this.fades) {
      const t = (now - f.t0) / FADE_MS;
      const s = c * (1 - 0.6 * t);
      const x = this.ox + (f.i % SIZE) * c + (c - s) / 2;
      const y = this.oy + ((f.i / SIZE) | 0) * c + (c - s) / 2;
      this.square(x, y, s, PIECE_COLORS[f.colour], 1 - t);
    }
    return this.fades.length > 0;
  }

  /** The three pieces waiting below the board, small. Ones that fit nowhere are faded. */
  private drawTray(g: ShapeGame): void {
    const s = this.trayCell;
    for (let k = 0; k < TRAY; k++) {
      const id = g.tray[k];
      if (id < 0 || this.drag?.slot === k) continue;
      const p = PIECES[id];
      const [cx, cy] = this.slotCentre(k);
      const fits = g.fitsAnywhere(id);
      for (const [x, y] of p.cells) this.square(cx - (p.w * s) / 2 + x * s, cy - (p.h * s) / 2 + y * s, s, fits ? PIECE_COLORS[p.colour] : this.theme.muted, fits ? 1 : 0.45);
    }
  }

  private drawDrag(g: ShapeGame, d: Drag): void {
    const id = g.tray[d.slot];
    if (id < 0) return;
    const p = PIECES[id];
    const { left, top } = this.dragSpot(d);
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = this.cell * 0.3;
    ctx.shadowOffsetY = this.cell * 0.12;
    for (const [x, y] of p.cells) this.square(left + x * this.cell, top + y * this.cell, this.cell, PIECE_COLORS[p.colour]);
    ctx.restore();
  }

  private drawPopups(now: number): boolean {
    const ctx = this.ctx;
    this.popups = this.popups.filter((q) => now - q.t0 < POPUP_MS);
    for (const q of this.popups) {
      const t = (now - q.t0) / POPUP_MS;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = this.theme.text;
      ctx.font = `800 ${Math.max(14, this.cell * 0.6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(q.text, q.x, q.y - t * this.cell * 1.2);
    }
    ctx.globalAlpha = 1;
    return this.popups.length > 0;
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
