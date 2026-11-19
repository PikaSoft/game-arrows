import { Theme } from '../../../shared/themes';
import {
  CELL,
  COLS,
  H,
  RAIDER_H,
  RAIDER_W,
  RaidersSim,
  ROWS,
  SAUCER_H,
  SAUCER_W,
  SAUCER_Y,
  SHIELD_COLS,
  SHIELD_ROWS,
  SHIP_H,
  SHIP_W,
  SHIP_Y,
  W,
} from '../core/sim';

/**
 * Raider shapes, 8 by 6 pixels, two walking frames each. Drawn for this game: a dart
 * (top row), a beetle (middle rows) and a blob (bottom rows).
 */
const SHAPES: string[][][] = [
  [
    ['...##...', '..####..', '.##..##.', '########', '..#..#..', '.#....#.'],
    ['...##...', '..####..', '.##..##.', '########', '.#.##.#.', '#......#'],
  ],
  [
    ['..#..#..', '..####..', '.#.##.#.', '########', '#.####.#', '..#..#..'],
    ['..#..#..', '..####..', '.#.##.#.', '########', '.######.', '.#....#.'],
  ],
  [
    ['.######.', '########', '##.##.##', '########', '.#.##.#.', '#......#'],
    ['.######.', '########', '##.##.##', '########', '#.#..#.#', '.#....#.'],
  ],
];
const KIND_BY_ROW = [0, 1, 1, 2, 2];
const KIND_COLORS = ['#e77fb3', '#4f9ed8', '#5aa457'];
const SAUCER_COLOR = '#d9584a';

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  t0: number;
  life: number;
  size: number;
}

interface Label {
  x: number;
  y: number;
  text: string;
  t0: number;
}

export class RaidersRenderer {
  sim: RaidersSim | null = null;
  /** Size of one field unit in CSS pixels, and the field's top-left corner. */
  unit = 20;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private bits: Bit[] = [];
  private labels: Label[] = [];
  /** Fixed background stars, in field units. */
  private stars: { x: number; y: number; r: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    public theme: Theme,
  ) {
    this.ctx = canvas.getContext('2d')!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 40; k++) this.stars.push({ x: rnd() * W, y: rnd() * (SHIP_Y - 1), r: 0.03 + rnd() * 0.05 });
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.unit = Math.max(8, Math.min((this.cssW - 12) / W, (this.cssH - 8) / H));
    this.ox = (this.cssW - W * this.unit) / 2;
    this.oy = (this.cssH - H * this.unit) / 2;
  }

  setSim(s: RaidersSim | null): void {
    this.sim = s;
    this.bits = [];
    this.labels = [];
  }

  /** A burst of bits at a point (field units). */
  burst(x: number, y: number, color: string, n = 10, spread = 5): void {
    const now = performance.now();
    for (let k = 0; k < n; k++) {
      this.bits.push({
        x: x + (Math.random() - 0.5) * 0.6,
        y: y + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * spread,
        vy: (Math.random() - 0.7) * spread,
        color,
        t0: now,
        life: 350 + Math.random() * 300,
        size: 0.1 + Math.random() * 0.1,
      });
    }
  }

  raiderHit(x: number, y: number, row: number): void {
    this.burst(x, y, KIND_COLORS[KIND_BY_ROW[row]], 12);
  }

  saucerHit(x: number, y: number, points: number): void {
    this.burst(x, y, SAUCER_COLOR, 18, 6);
    this.labels.push({ x, y, text: `+${points}`, t0: performance.now() });
  }

  shipHit(x: number): void {
    this.burst(x, SHIP_Y, this.theme.accent, 20, 7);
  }

  spark(x: number, y: number): void {
    this.burst(x, y, this.theme.muted, 4, 3);
  }

  label(x: number, y: number, text: string): void {
    this.labels.push({ x, y, text, t0: performance.now() });
  }

  draw(): void {
    const ctx = this.ctx;
    const u = this.unit;
    const now = performance.now();
    const ox = this.ox;
    const oy = this.oy;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s) return;
    const t = this.theme;

    // The field, with a few faint stars.
    ctx.fillStyle = t.surface;
    ctx.beginPath();
    ctx.roundRect(ox, oy, W * u, H * u, u * 0.4);
    ctx.fill();
    ctx.fillStyle = t.muted;
    ctx.globalAlpha = 0.35;
    for (const st of this.stars) {
      ctx.beginPath();
      ctx.arc(ox + st.x * u, oy + st.y * u, st.r * u, 0, Math.PI * 2);
      ctx.fill();
    }
    // A faint band below the ship: the room left for a finger to drag in.
    const band = SHIP_Y + SHIP_H / 2 + 0.6;
    ctx.fillStyle = t.line;
    ctx.globalAlpha = 0.05;
    ctx.beginPath();
    ctx.roundRect(ox, oy + band * u, W * u, (H - band) * u, [0, 0, u * 0.4, u * 0.4]);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Shields.
    ctx.fillStyle = t.moving;
    for (const sh of s.shields)
      for (let r = 0; r < SHIELD_ROWS; r++)
        for (let c = 0; c < SHIELD_COLS; c++)
          if (sh.cells[r][c]) ctx.fillRect(ox + (sh.x + c * CELL) * u, oy + (sh.y + r * CELL) * u, CELL * u + 0.5, CELL * u + 0.5);

    // Raiders.
    for (let r = 0; r < ROWS; r++) {
      const kind = KIND_BY_ROW[r];
      const shape = SHAPES[kind][s.frame];
      ctx.fillStyle = KIND_COLORS[kind];
      for (let c = 0; c < COLS; c++) {
        if (!s.alive[r][c]) continue;
        this.pixels(shape, s.raiderX(c) - RAIDER_W / 2, s.raiderY(r) - RAIDER_H / 2, RAIDER_W, RAIDER_H);
      }
    }

    // Saucer.
    if (s.saucer) {
      const x = ox + s.saucer.x * u;
      const y = oy + SAUCER_Y * u;
      ctx.fillStyle = SAUCER_COLOR;
      ctx.beginPath();
      ctx.ellipse(x, y + SAUCER_H * 0.12 * u, (SAUCER_W / 2) * u, SAUCER_H * 0.32 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y - SAUCER_H * 0.1 * u, SAUCER_W * 0.24 * u, SAUCER_H * 0.38 * u, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const dx of [-0.45, 0, 0.45]) {
        const on = Math.floor(now / 160 + dx * 4) % 2 === 0;
        ctx.globalAlpha = on ? 0.95 : 0.4;
        ctx.beginPath();
        ctx.arc(x + dx * u, y + SAUCER_H * 0.12 * u, u * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Shots (the ship's) and bolts (the raiders').
    ctx.strokeStyle = t.line;
    ctx.lineWidth = Math.max(1.5, u * 0.1);
    ctx.lineCap = 'round';
    for (const sh of s.shots) {
      ctx.beginPath();
      ctx.moveTo(ox + sh.x * u, oy + sh.y * u);
      ctx.lineTo(ox + sh.x * u, oy + (sh.y + 0.4) * u);
      ctx.stroke();
    }
    ctx.strokeStyle = t.danger;
    ctx.lineWidth = Math.max(1.5, u * 0.09);
    ctx.lineJoin = 'round';
    for (const b of s.bolts) {
      const wig = Math.floor(b.y * 4) % 2 === 0 ? 1 : -1;
      ctx.beginPath();
      for (let k = 0; k <= 3; k++) {
        const x = ox + (b.x + (k % 2 === 0 ? 1 : -1) * wig * 0.1) * u;
        const y = oy + (b.y - 0.45 + k * 0.15) * u;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Ship: blinking for a while after a hit, gone once the game is over.
    const blink = s.shieldLeft > 0 && Math.floor(now / 110) % 2 === 0;
    if (!s.over && !blink) {
      const x = ox + s.shipX * u;
      const y = oy + SHIP_Y * u;
      const w = SHIP_W * u;
      const h = SHIP_H * u;
      ctx.fillStyle = t.accent;
      ctx.strokeStyle = t.line;
      ctx.lineWidth = Math.max(1, u * 0.06);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y + h / 2);
      ctx.lineTo(x - w / 2, y + h * 0.05);
      ctx.lineTo(x - w * 0.14, y - h * 0.15);
      ctx.lineTo(x - w * 0.07, y - h / 2);
      ctx.lineTo(x + w * 0.07, y - h / 2);
      ctx.lineTo(x + w * 0.14, y - h * 0.15);
      ctx.lineTo(x + w / 2, y + h * 0.05);
      ctx.lineTo(x + w / 2, y + h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Flying bits.
    this.bits = this.bits.filter((q) => now - q.t0 < q.life);
    for (const q of this.bits) {
      const tt = (now - q.t0) / 1000;
      const x = q.x + q.vx * tt;
      const y = q.y + q.vy * tt + 4 * tt * tt;
      ctx.globalAlpha = 1 - (now - q.t0) / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(ox + (x - q.size / 2) * u, oy + (y - q.size / 2) * u, q.size * u, q.size * u);
    }
    ctx.globalAlpha = 1;

    // Floating labels (saucer points, extra lives, waves).
    this.labels = this.labels.filter((l) => now - l.t0 < 1200);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(u * 0.6)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    for (const l of this.labels) {
      const k = (now - l.t0) / 1200;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = t.text;
      ctx.fillText(l.text, ox + l.x * u, oy + (l.y - k * 1.2) * u);
    }
    ctx.globalAlpha = 1;
  }

  /** Draw a pixel shape into a box (field units). */
  private pixels(shape: string[], x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    const u = this.unit;
    const pw = (w / shape[0].length) * u;
    const ph = (h / shape.length) * u;
    const px = this.ox + x * u;
    const py = this.oy + y * u;
    shape.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(px + c * pw, py + r * ph, pw + 0.4, ph + 0.4);
    });
  }
}
