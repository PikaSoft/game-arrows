import { Theme } from '../../../shared/themes';
import { Board, Pos } from '../core/rules';
import { SHAPES } from '../core/shapes';
import { Block, OUTWARD, Side } from '../core/types';

/** Block colours, chosen to stay apart from each other on light and dark themes. */
export const BLOCK_COLORS = [
  '#d9584a', // red
  '#4f9ed8', // blue
  '#e8b93a', // yellow
  '#5aa457', // green
  '#8e62c4', // purple
  '#ee8a3a', // orange
  '#e77fb3', // pink
  '#3bb3a7', // teal
];

export const colorOf = (c: number): string => BLOCK_COLORS[c % BLOCK_COLORS.length];

/** What the renderer needs to know about the session each frame. */
export interface SqueezeView {
  board: Board;
  blocks: Block[];
  pos: Pos[];
}

interface Leaving {
  block: number;
  x: number;
  y: number;
  side: Side;
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

const LEAVE_MS = 320;
const SHAKE_MS = 300;
/** Frame thickness and the room left outside it, in cells. */
const FRAME = 0.32;
const MARGIN = 0.9;

export class SqueezeRenderer {
  view: SqueezeView | null = null;
  /** Block being dragged, with its offset from its cell in cells. */
  drag: { block: number; dx: number; dy: number } | null = null;
  /** Gaps the dragged block could leave through: drawn glowing. */
  glow = new Set<number>();

  /** Cell size and the board's top-left corner, in CSS pixels. */
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private shown = new Map<number, { x: number; y: number }>();
  private leaving: Leaving[] = [];
  private shakes = new Map<number, number>();
  private particles: Particle[] = [];
  private raf = 0;
  private lastFrame = 0;

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

  setView(v: SqueezeView | null): void {
    this.view = v;
    this.drag = null;
    this.glow.clear();
    this.shown.clear();
    this.leaving = [];
    this.shakes.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  /** Jump every block straight to where it is, with no glide (after undo or restart). */
  snap(): void {
    this.shown.clear();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, h } = v.board;
    const span = 2 * (FRAME + MARGIN);
    this.cell = Math.max(12, Math.min((this.cssW - 16) / (w + span), (this.cssH - 16) / (h + span), 72));
    this.ox = (this.cssW - w * this.cell) / 2;
    this.oy = (this.cssH - h * this.cell) / 2;
  }

  /** Board coordinates (in cells, fractional) of a point on the canvas. */
  toCell(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.ox) / this.cell, y: (y - this.oy) / this.cell };
  }

  /** Block i slides out through `side` from where it is drawn now. */
  leave(i: number, side: Side): void {
    const at = this.shown.get(i) ?? this.view?.pos[i] ?? { x: 0, y: 0 };
    this.leaving.push({ block: i, x: at.x, y: at.y, side, t0: performance.now() });
    this.shown.delete(i);
    this.invalidate();
  }

  shake(i: number): void {
    this.shakes.set(i, performance.now());
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
    const dt = Math.min(64, now - (this.lastFrame || now));
    this.lastFrame = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      this.drawBoard(v);
      this.drawFrame(v, now);
      more = this.drawLeaving(v, now) || more;
      const order = v.pos.map((_, i) => i).filter((i) => v.pos[i]);
      if (this.drag) order.push(order.splice(order.indexOf(this.drag.block), 1)[0]);
      for (const i of order) more = this.drawBlockAt(v, i, now, dt) || more;
      if (this.glow.size) more = true;
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
    else this.lastFrame = 0;
  }

  private drawBoard(v: SqueezeView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { w, h } = v.board;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox, this.oy, w * c, h * c, c * 0.12);
    ctx.fill();
    // Faint dots at the cell corners help judge where a block will land.
    ctx.fillStyle = this.theme.muted;
    ctx.globalAlpha = 0.35;
    for (let y = 1; y < h; y++) {
      for (let x = 1; x < w; x++) {
        ctx.beginPath();
        ctx.arc(this.ox + x * c, this.oy + y * c, Math.max(1, c * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Each side of the frame as a thick bar, broken where the gaps are. */
  private drawFrame(v: SqueezeView, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { w, h, gaps } = v.board;
    const t = c * FRAME;
    const x0 = this.ox - t / 2;
    const y0 = this.oy - t / 2;
    const x1 = this.ox + w * c + t / 2;
    const y1 = this.oy + h * c + t / 2;
    ctx.lineWidth = t;
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.theme.line;
    const sides: { side: Side; len: number; at: (k: number) => [number, number] }[] = [
      { side: 'top', len: w, at: (k) => [this.ox + k * c, y0] },
      { side: 'bottom', len: w, at: (k) => [this.ox + k * c, y1] },
      { side: 'left', len: h, at: (k) => [x0, this.oy + k * c] },
      { side: 'right', len: h, at: (k) => [x1, this.oy + k * c] },
    ];
    for (const s of sides) {
      const cuts = gaps.filter((g) => g.side === s.side).sort((a, b) => a.start - b.start);
      // Corners: the bar runs past the board's ends to meet the next side.
      let from = -t / 2 / c;
      ctx.beginPath();
      for (const g of cuts) {
        if (g.start > from) {
          const [ax, ay] = s.at(from);
          const [bx, by] = s.at(g.start);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        from = g.start + g.len;
      }
      const end = s.len + t / 2 / c;
      if (end > from) {
        const [ax, ay] = s.at(from);
        const [bx, by] = s.at(end);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    // Gap markers: chevrons pointing out, in the gate's colour when it has one.
    gaps.forEach((g, gi) => {
      const s = sides.find((q) => q.side === g.side)!;
      const [o1, o2] = OUTWARD[g.side];
      const glowing = this.glow.has(gi);
      const col = g.color !== null ? colorOf(g.color) : glowing ? this.theme.accent : this.theme.muted;
      const pulse = glowing ? 0.6 + 0.4 * Math.sin(now / 160) : 1;
      if (g.color !== null) {
        // A coloured gate: a dashed bar across the opening.
        const [ax, ay] = s.at(g.start + 0.08);
        const [bx, by] = s.at(g.start + g.len - 0.08);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = t * 0.45;
        ctx.setLineDash([c * 0.16, c * 0.12]);
        ctx.lineCap = 'butt';
        ctx.globalAlpha = glowing ? pulse : 0.9;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
      }
      if (glowing && g.color === null) {
        const [ax, ay] = s.at(g.start);
        const [bx, by] = s.at(g.start + g.len);
        ctx.save();
        ctx.strokeStyle = this.theme.accent;
        ctx.globalAlpha = 0.35 * pulse;
        ctx.lineCap = 'butt';
        ctx.lineWidth = t * 1.2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, c * 0.06);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = glowing ? pulse : 0.75;
      for (let k = 0; k < g.len; k++) {
        const [mx, my] = s.at(g.start + k + 0.5);
        const cx = mx + o1 * c * 0.42;
        const cy = my + o2 * c * 0.42;
        const a = c * 0.12;
        // Chevron: two arms meeting at the tip, which points outward.
        ctx.beginPath();
        ctx.moveTo(cx - o1 * a + o2 * a * 1.3, cy - o2 * a + o1 * a * 1.3);
        ctx.lineTo(cx + o1 * a, cy + o2 * a);
        ctx.lineTo(cx - o1 * a - o2 * a * 1.3, cy - o2 * a - o1 * a * 1.3);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  /** Glide block i toward where it should be, then draw it. Returns true while moving. */
  private drawBlockAt(v: SqueezeView, i: number, now: number, dt: number): boolean {
    const p = v.pos[i]!;
    const d = this.drag && this.drag.block === i ? this.drag : null;
    const tx = p.x + (d ? d.dx : 0);
    const ty = p.y + (d ? d.dy : 0);
    let s = this.shown.get(i);
    if (!s) {
      s = { x: tx, y: ty };
      this.shown.set(i, s);
    }
    const k = 1 - Math.exp(-dt / (d ? 22 : 45));
    s.x += (tx - s.x) * k;
    s.y += (ty - s.y) * k;
    let moving = false;
    if (Math.abs(tx - s.x) < 0.004 && Math.abs(ty - s.y) < 0.004) {
      s.x = tx;
      s.y = ty;
    } else moving = true;
    let sx = s.x;
    const sh = this.shakes.get(i);
    if (sh !== undefined) {
      const t = (now - sh) / SHAKE_MS;
      if (t >= 1) this.shakes.delete(i);
      else {
        sx += Math.sin(t * Math.PI * 6) * (1 - t) * 0.08;
        moving = true;
      }
    }
    this.drawBlock(v.blocks[i], sx, s.y, !!d, 1);
    return moving;
  }

  private drawLeaving(v: SqueezeView, now: number): boolean {
    this.leaving = this.leaving.filter((l) => now - l.t0 < LEAVE_MS);
    for (const l of this.leaving) {
      const t = (now - l.t0) / LEAVE_MS;
      const b = v.blocks[l.block];
      const sh = SHAPES[b.shape];
      const [o1, o2] = OUTWARD[l.side];
      const dist = (o1 ? sh.w : sh.h) + MARGIN + FRAME;
      const e = t * t * (3 - 2 * t);
      this.drawBlock(b, l.x + o1 * dist * e, l.y + o2 * dist * e, false, 1 - Math.max(0, (t - 0.55) / 0.45));
    }
    return this.leaving.length > 0;
  }

  /** A block as joined cells: rounded where an edge is open, flush where cells touch. */
  private drawBlock(b: Block, bx: number, by: number, lifted: boolean, alpha: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const sh = SHAPES[b.shape];
    const has = new Set(sh.cells.map(([x, y]) => `${x},${y}`));
    const pad = c * 0.06;
    const r = c * 0.16;
    const color = colorOf(b.color);
    const lift = lifted ? c * 0.08 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    const shape = (dx: number, dy: number) => {
      ctx.beginPath();
      for (const [x, y] of sh.cells) {
        const L = !has.has(`${x - 1},${y}`);
        const R = !has.has(`${x + 1},${y}`);
        const T = !has.has(`${x},${y - 1}`);
        const B = !has.has(`${x},${y + 1}`);
        const x0 = this.ox + (bx + x) * c + (L ? pad : 0) + dx;
        const x1 = this.ox + (bx + x + 1) * c - (R ? pad : 0) + dx;
        const y0 = this.oy + (by + y) * c + (T ? pad : 0) + dy;
        const y1 = this.oy + (by + y + 1) * c - (B ? pad : 0) + dy;
        // Overlap joined edges by a hair so no seam shows between cells.
        const ax = x0 - (L ? 0 : 0.5);
        const ay = y0 - (T ? 0 : 0.5);
        const bx2 = x1 + (R ? 0 : 0.5);
        const by2 = y1 + (B ? 0 : 0.5);
        ctx.roundRect(ax, ay, bx2 - ax, by2 - ay, [
          L && T ? r : 0,
          R && T ? r : 0,
          R && B ? r : 0,
          L && B ? r : 0,
        ]);
      }
    };
    // Shadow, then the block, then a soft highlight along the top.
    ctx.fillStyle = lifted ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.22)';
    shape(0, c * 0.07 + lift);
    ctx.fill();
    ctx.fillStyle = this.mix(color, '#000000', 0.22);
    shape(0, c * 0.04 - lift);
    ctx.fill();
    ctx.fillStyle = color;
    shape(0, -lift);
    ctx.fill();
    // A little stud in each cell, so a block's size reads at a glance.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (const [x, y] of sh.cells) {
      ctx.beginPath();
      ctx.arc(this.ox + (bx + x + 0.5) * c, this.oy + (by + y + 0.5) * c - lift, c * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
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

  private mix(a: string, b: string, k: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
}
