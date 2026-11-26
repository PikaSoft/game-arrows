import { Theme } from '../../../shared/themes';
import { PieceId, SHAPES } from '../core/pieces';
import { CLEAR_MS, COLS, FallSim, HIDDEN, Piece, VISIBLE } from '../core/sim';

/** Piece colours, the same on every theme. */
export const FALL_COLORS = ['#2f6fe0', '#e5413b', '#f2b324', '#8e4fd6', '#2cb5c4', '#2e9e44', '#ee7d2a'];

/** Width of the side panel (hold and next), and the gap before it, in cells. */
const PANEL = 4.4;
const GAP = 0.5;

export class FallRenderer {
  sim: FallSim | null = null;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** Cell size and the well's top-left, in CSS pixels. */
  k = 24;
  ox = 0;
  oy = 0;

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
    const wide = COLS + GAP + PANEL;
    this.k = Math.max(4, Math.floor(Math.min((this.cssW - 16) / wide, (this.cssH - 16) / VISIBLE)));
    this.ox = Math.round((this.cssW - this.k * wide) / 2);
    this.oy = Math.round((this.cssH - this.k * VISIBLE) / 2);
    this.draw();
  }

  setSim(s: FallSim | null): void {
    this.sim = s;
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    this.drawWell();
    if (!s) return;
    const k = this.k;
    // Locked blocks, with full rows flashing away.
    const flash = s.clearing;
    for (let y = HIDDEN; y < HIDDEN + VISIBLE; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = s.board[y * COLS + x];
        if (v) this.square(this.ox + x * k, this.oy + (y - HIDDEN) * k, k, FALL_COLORS[v - 1], s.over ? 0.55 : 1);
      }
    }
    if (flash) {
      const t = Math.max(0, flash.t / CLEAR_MS);
      const ctx = this.ctx;
      for (const y of flash.rows) {
        if (y < HIDDEN) continue;
        const h = k * t;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.ox, this.oy + (y - HIDDEN) * k + (k - h) / 2, COLS * k, h);
        ctx.globalAlpha = 1;
      }
    }
    // Where the piece will land, then the piece.
    const g = s.ghost();
    if (g && s.piece && g.y !== s.piece.y) this.drawPiece(g, true);
    if (s.piece) this.drawPiece(s.piece, false);
    this.drawPanel(s);
  }

  private drawWell(): void {
    const ctx = this.ctx;
    const k = this.k;
    const w = COLS * k;
    const h = VISIBLE * k;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox - 5, this.oy - 5, w + 10, h + 10, k * 0.3);
    ctx.fill();
    ctx.strokeStyle = this.theme.line;
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(this.ox + x * k + 0.5, this.oy);
      ctx.lineTo(this.ox + x * k + 0.5, this.oy + h);
    }
    for (let y = 1; y < VISIBLE; y++) {
      ctx.moveTo(this.ox, this.oy + y * k + 0.5);
      ctx.lineTo(this.ox + w, this.oy + y * k + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(this.ox - 5, this.oy - 5, w + 10, h + 10, k * 0.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawPiece(p: Piece, ghost: boolean): void {
    const k = this.k;
    const color = FALL_COLORS[p.id];
    for (const [cx, cy] of SHAPES[p.id][p.rot]) {
      const y = p.y + cy - HIDDEN;
      if (y < 0) continue;
      const px = this.ox + (p.x + cx) * k;
      const py = this.oy + y * k;
      if (ghost) this.outline(px, py, k, color);
      else this.square(px, py, k, color, this.sim?.over ? 0.55 : 1);
    }
  }

  /** Hold and Next boxes beside the well. */
  private drawPanel(s: FallSim): void {
    const ctx = this.ctx;
    const k = this.k;
    const x = this.ox + (COLS + GAP) * k;
    const w = PANEL * k;
    const label = (text: string, y: number) => {
      ctx.fillStyle = this.theme.muted;
      ctx.font = `600 ${Math.max(10, Math.round(k * 0.55))}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(text, x + k * 0.15, y);
    };
    const box = (y: number, h: number) => {
      ctx.fillStyle = this.theme.surface;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, k * 0.3);
      ctx.fill();
    };
    const lh = k * 0.85;
    let y = this.oy;
    label('Hold', y);
    y += lh;
    box(y, k * 2.6);
    if (s.hold !== null) this.mini(s.hold, x, y, w, k * 2.6, s.canHold ? 1 : 0.35);
    y += k * 3.4;
    label('Next', y);
    y += lh;
    const next = s.next();
    const each = k * 2.3;
    box(y, each * next.length + k * 0.3);
    next.forEach((id, i) => this.mini(id, x, y + k * 0.15 + i * each, w, each, 1));
  }

  /** A small piece centred in a box. */
  private mini(id: PieceId, x: number, y: number, w: number, h: number, alpha: number): void {
    const cells = SHAPES[id][0];
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cw = Math.max(...xs) - minX + 1;
    const ch = Math.max(...ys) - minY + 1;
    const m = Math.floor(this.k * 0.72);
    const ox = x + (w - cw * m) / 2;
    const oy = y + (h - ch * m) / 2;
    for (const [cx, cy] of cells) this.square(ox + (cx - minX) * m, oy + (cy - minY) * m, m, FALL_COLORS[id], alpha);
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

  private outline(x: number, y: number, s: number, colour: string): void {
    const ctx = this.ctx;
    const pad = Math.max(2, s * 0.1);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, s - pad * 2, s - pad * 2, s * 0.16);
    ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
