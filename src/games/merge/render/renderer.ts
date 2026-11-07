import { Theme } from '../../../shared/themes';
import { Board, SIZE, STONE } from '../core/rules';

/** Tile colours by value: 1, 2, 4, 8, … 4096, then the last again. */
const TILE_COLORS = [
  '#f3e2c4', '#f2d49a', '#f2c77a', '#efae5e', '#ee9d4a', '#e9823f', '#e5683f', '#dc5450',
  '#d24a5c', '#bc4a80', '#a84a9e', '#7f55b4', '#5c5fc4',
];
const STONE_COLOR = '#8b9097';

const SLIDE_MS = 110;
const POP_MS = 160;

const colourOf = (v: number) => TILE_COLORS[Math.min(TILE_COLORS.length - 1, Math.round(Math.log2(v)))];

interface Anim {
  t0: number;
  /** Tiles sliding: value, from and to squares. */
  slides: { value: number; from: number; to: number }[];
  merges: Set<number>;
  spawn: number | null;
  stone: number | null;
}

export class MergeRenderer {
  board: Board | null = null;
  cell = 60;
  ox = 0;
  oy = 0;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private anim: Anim | null = null;
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
    this.cell = Math.max(30, Math.min((this.cssW - 24) / SIZE, (this.cssH - 24) / SIZE, 96));
    this.ox = (this.cssW - SIZE * this.cell) / 2;
    this.oy = (this.cssH - SIZE * this.cell) / 2;
    this.invalidate();
  }

  setBoard(b: Board | null): void {
    this.board = b;
    this.anim = null;
    this.invalidate();
  }

  /** Animate a move: tiles slide from where they were, then merges pop and the new tile grows in. */
  play(before: Board, moves: { from: number; to: number }[], merges: number[], spawn: number | null, stone: number | null): void {
    this.anim = {
      t0: performance.now(),
      slides: moves.map((m) => ({ value: before.cells[m.from], from: m.from, to: m.to })),
      merges: new Set(merges),
      spawn,
      stone,
    };
    this.invalidate();
  }

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private xy(i: number): [number, number] {
    return [this.ox + (i % SIZE) * this.cell, this.oy + ((i / SIZE) | 0) * this.cell];
  }

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const b = this.board;
    if (!b) return;
    const c = this.cell;
    // The tray and its empty squares.
    ctx.fillStyle = this.theme.line;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.roundRect(this.ox - 6, this.oy - 6, SIZE * c + 12, SIZE * c + 12, 14);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const [x, y] = this.xy(i);
      ctx.fillStyle = this.theme.surface;
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, c - 8, c - 8, c * 0.14);
      ctx.fill();
    }
    let more = false;
    const a = this.anim;
    const t = a ? (now - a.t0) / SLIDE_MS : 1;
    if (a && t < 1) {
      // Mid-slide: draw tiles where they're moving between, and stones where they sit.
      const e = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < SIZE * SIZE; i++) if (b.cells[i] === STONE && i !== a.stone) this.drawStone(i, b.life[i], 1);
      for (const s of a.slides) {
        const [fx, fy] = this.xy(s.from);
        const [tx, ty] = this.xy(s.to);
        this.drawTile(fx + (tx - fx) * e, fy + (ty - fy) * e, s.value, 1);
      }
      more = true;
    } else {
      const after = a ? now - a.t0 - SLIDE_MS : POP_MS;
      const p = Math.min(1, after / POP_MS);
      for (let i = 0; i < SIZE * SIZE; i++) {
        const v = b.cells[i];
        if (v === 0) continue;
        if (v === STONE) {
          this.drawStone(i, b.life[i], a && a.stone === i ? p : 1);
          continue;
        }
        const [x, y] = this.xy(i);
        let scale = 1;
        if (a && a.merges.has(i)) scale = 1 + Math.sin(p * Math.PI) * 0.18;
        if (a && a.spawn === i) scale = p;
        this.drawTile(x, y, v, scale);
      }
      if (p < 1) more = true;
      else this.anim = null;
    }
    if (more) this.invalidate();
  }

  private drawTile(x: number, y: number, v: number, scale: number): void {
    if (scale <= 0) return;
    const ctx = this.ctx;
    const c = this.cell;
    const s = (c - 8) * scale;
    const px = x + c / 2 - s / 2;
    const py = y + c / 2 - s / 2;
    ctx.fillStyle = colourOf(v);
    ctx.beginPath();
    ctx.roundRect(px, py, s, s, c * 0.14 * scale);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px + s * 0.1, py + s * 0.08, s * 0.8, s * 0.1);
    const text = String(v);
    ctx.fillStyle = v <= 4 ? '#5b3c22' : '#ffffff';
    ctx.font = `800 ${Math.round(c * (text.length <= 2 ? 0.44 : text.length === 3 ? 0.36 : 0.28) * scale)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + c / 2, y + c / 2 + c * 0.02);
  }

  private drawStone(i: number, life: number, scale: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const [x, y] = this.xy(i);
    const s = (c - 8) * scale;
    const px = x + c / 2 - s / 2;
    const py = y + c / 2 - s / 2;
    ctx.fillStyle = STONE_COLOR;
    ctx.beginPath();
    ctx.roundRect(px, py, s, s, c * 0.3 * scale);
    ctx.fill();
    // Cracks show it wearing down; the number is how many moves it has left.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.25, py + s * 0.2);
    ctx.lineTo(px + s * 0.45, py + s * 0.45);
    ctx.lineTo(px + s * 0.35, py + s * 0.7);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(c * 0.26 * scale)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(life), x + c * 0.68, y + c * 0.68);
  }
}
