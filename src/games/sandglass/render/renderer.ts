import { Theme } from '../../../shared/themes';
import { landingIndex, sandCount } from '../core/rules';
import { Bottle, isLiquid, LIQUID_BASE } from '../core/types';

/** Twelve sand colours chosen to stay apart from each other on light and dark themes. */
export const SAND_COLORS = [
  '#d9584a', // red
  '#4f9ed8', // blue
  '#e8c547', // yellow
  '#5aa457', // green
  '#8e62c4', // purple
  '#ee8a3a', // orange
  '#e77fb3', // pink
  '#3bb3a7', // teal
  '#8a5a3b', // brown
  '#34508f', // navy
  '#b5d34a', // lime
  '#9a9a9a', // grey
];

/** Liquid colours: bright, glassy tones that read apart from the grainy sand. */
export const LIQUID_COLORS = [
  '#22c3e6', // aqua
  '#d63fa0', // magenta
  '#2fd39a', // mint
  '#7c5cff', // indigo
  '#ffb21f', // amber
  '#f2f2f2', // milk
];

export const colorOf = (c: number): string =>
  isLiquid(c) ? LIQUID_COLORS[(c - LIQUID_BASE) % LIQUID_COLORS.length] : SAND_COLORS[c % SAND_COLORS.length];

export interface Slot {
  x: number; // centre
  base: number; // y of the bottom
  w: number;
  h: number; // full height including the lip
}

interface PourAnim {
  from: number;
  to: number;
  color: number;
  amount: number;
  before: Bottle[];
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

const POUR_MS = 620;
const SETTLE_MS = 260;
const SHAKE_MS = 320;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** What the renderer needs to know about the session each frame. */
export interface SandView {
  bottles: Bottle[];
  capacity: number;
  isHidden(bottle: number, layer: number): boolean;
}

export class SandRenderer {
  view: SandView | null = null;
  selected: number | null = null;
  /** Bottle being dragged and where the finger is (CSS pixels). */
  drag: { index: number; x: number; y: number; dx: number; dy: number } | null = null;
  slots: Slot[] = [];

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private grain: CanvasPattern | null = null;
  private pourAnim: PourAnim | null = null;
  private settle = new Map<number, number>(); // bottle -> time its mound started settling
  private shakes = new Map<number, number>();
  private lifts = new Map<number, number>(); // smoothed lift 0..1 per bottle
  private completedAt = new Map<number, number>();
  private particles: Particle[] = [];
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    public theme: Theme,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.grain = this.makeGrain();
  }

  get animating(): boolean {
    return !!this.pourAnim;
  }

  /** A speckle texture laid over the flat colour so it reads as sand. */
  private makeGrain(): CanvasPattern | null {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d');
    if (!g) return null;
    let seed = 12345;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 420; i++) {
      const light = rand() < 0.5;
      g.fillStyle = light ? `rgba(255,255,255,${0.15 + rand() * 0.25})` : `rgba(0,0,0,${0.08 + rand() * 0.18})`;
      const s = rand() < 0.85 ? 1 : 1.6;
      g.fillRect(rand() * 48, rand() * 48, s, s);
    }
    return this.ctx.createPattern(c, 'repeat');
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

  setView(v: SandView | null): void {
    this.view = v;
    this.selected = null;
    this.drag = null;
    this.pourAnim = null;
    this.settle.clear();
    this.shakes.clear();
    this.lifts.clear();
    this.particles = [];
    this.completedAt.clear();
    this.layout();
    this.invalidate();
  }

  /** Arrange bottles in 1 to 3 rows, picking whichever lets them be biggest. */
  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) {
      this.slots = [];
      return;
    }
    const n = v.bottles.length;
    const cap = v.capacity;
    const W = this.cssW - 16;
    const H = this.cssH - 16;
    // Proportions, as multiples of the bottle width.
    const layerH = 0.62;
    const lip = 0.35;
    const lift = 0.45;
    const rowGap = 0.35;
    const bottleH = cap * layerH + lip + 0.18;
    let best = { rows: 1, w: 0 };
    for (let rows = 1; rows <= 3; rows++) {
      const cols = Math.ceil(n / rows);
      const byW = W / (cols * 1.55);
      const byH = H / (rows * (bottleH + lift + rowGap));
      const w = Math.min(byW, byH, 70);
      if (w > best.w * 1.08) best = { rows, w };
    }
    const { rows, w } = best;
    const h = w * bottleH;
    const rowH = w * (bottleH + lift + rowGap);
    const totalH = rows * rowH - w * rowGap;
    const top = (this.cssH - totalH) / 2;
    const perRow = Math.ceil(n / rows);
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const col = i - row * perRow;
      const gap = Math.min(w * 0.55, (W - inRow * w) / Math.max(1, inRow));
      const rowW = inRow * w + (inRow - 1) * gap;
      const x = (this.cssW - rowW) / 2 + col * (w + gap) + w / 2;
      const base = top + row * rowH + w * lift + h;
      this.slots.push({ x, base, w, h });
    }
  }

  /** Index of the bottle under a point, generous enough for fingers. */
  hitTest(x: number, y: number, except?: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    this.slots.forEach((s, i) => {
      if (i === except) return;
      const left = s.x - s.w * 0.85;
      const right = s.x + s.w * 0.85;
      const topY = s.base - s.h - s.w * 0.5;
      if (x < left || x > right || y < topY || y > s.base + s.w * 0.25) return;
      const d = Math.abs(x - s.x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  pour(from: number, to: number, color: number, amount: number, before: Bottle[]): void {
    this.finishPour();
    this.pourAnim = { from, to, color, amount, before, t0: performance.now() };
    this.invalidate();
  }

  private finishPour(): void {
    const p = this.pourAnim;
    if (!p) return;
    this.pourAnim = null;
    this.settle.set(p.to, performance.now());
  }

  shake(i: number): void {
    this.shakes.set(i, performance.now());
    this.invalidate();
  }

  /** Cork pops on and a little burst of grains. */
  complete(i: number): void {
    const s = this.slots[i];
    if (!s || !this.view) return;
    const delay = this.pourAnim ? POUR_MS * 0.8 : 0;
    const t0 = performance.now() + delay;
    this.completedAt.set(i, t0);
    const b = this.view.bottles[i];
    const color = colorOf(b[0]);
    for (let k = 0; k < 14; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 0.08 + Math.random() * 0.12;
      this.particles.push({ x: s.x, y: s.base - s.h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: k % 3 ? color : this.theme.accent, t0, life: 600, size: 2 + Math.random() * 2 });
    }
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
    const v = this.view;
    let more = false;
    if (v) {
      if (this.pourAnim && now - this.pourAnim.t0 >= POUR_MS) this.finishPour();
      const p = this.pourAnim;
      const order = v.bottles.map((_, i) => i);
      // Draw the moving bottle last so it passes in front of the others.
      const front = p ? p.from : this.drag ? this.drag.index : null;
      if (front !== null) order.push(order.splice(order.indexOf(front), 1)[0]);
      for (const i of order) more = this.drawBottle(i, now) || more;
      if (p) {
        this.drawStream(p, now);
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  /**
   * Layers to draw for bottle i right now, with a fraction for the moving sand or liquid.
   * `at` is where that fraction sits: on top, or under the liquid when sand sinks.
   */
  private contents(i: number, now: number): { layers: number[]; extra: number; extraColor: number; at: number; mound: number } {
    const v = this.view!;
    const p = this.pourAnim;
    if (p && (i === p.from || i === p.to)) {
      const t = (now - p.t0) / POUR_MS;
      const f = easeInOut(clamp01((t - 0.3) / 0.45));
      const moved = p.amount * f;
      const before = p.before[i];
      if (i === p.from) {
        const keep = before.length - p.amount;
        const remaining = p.amount - moved;
        return { layers: before.slice(0, keep), extra: remaining, extraColor: p.color, at: keep, mound: 0 };
      }
      return { layers: before.slice(), extra: moved, extraColor: p.color, at: landingIndex(before, p.color), mound: f > 0 ? 1 : 0 };
    }
    let mound = 0;
    const st = this.settle.get(i);
    if (st !== undefined) {
      const k = (now - st) / SETTLE_MS;
      if (k >= 1) this.settle.delete(i);
      else mound = 1 - easeInOut(k);
    }
    return { layers: v.bottles[i], extra: 0, extraColor: 0, at: v.bottles[i].length, mound };
  }

  /** Returns true if this bottle still needs animation frames. */
  private drawBottle(i: number, now: number): boolean {
    const v = this.view!;
    const s = this.slots[i];
    if (!s) return false;
    const ctx = this.ctx;
    let more = false;
    const { w, h } = s;
    let cx = s.x;
    let base = s.base;
    let angle = 0;

    // Lift for the selected bottle, eased.
    const target = this.selected === i && !this.pourAnim ? 1 : 0;
    const cur = this.lifts.get(i) ?? 0;
    const lift = cur + (target - cur) * 0.35;
    if (Math.abs(lift - target) > 0.01) more = true;
    this.lifts.set(i, Math.abs(lift - target) > 0.01 ? lift : target);
    base -= lift * w * 0.4;

    const p = this.pourAnim;
    if (p && i === p.from) {
      // Fly over the target, tip, pour, then go home.
      const t = (now - p.t0) / POUR_MS;
      const go = easeInOut(clamp01(t / 0.3));
      const back = easeInOut(clamp01((t - 0.8) / 0.2));
      const dst = this.slots[p.to];
      const side = dst.x >= s.x ? -1 : 1;
      // The bottle tips around its mouth, which ends up just above the target.
      const px = dst.x + side * w * 0.15;
      const pb = dst.base - dst.h - w * 0.3 + h;
      const k = go * (1 - back);
      cx = s.x + (px - s.x) * k;
      base = s.base + (pb - s.base) * k;
      angle = -side * 1.15 * k;
      more = true;
    } else if (this.drag && this.drag.index === i) {
      cx = this.drag.x - this.drag.dx;
      base = this.drag.y - this.drag.dy;
    }

    const sh = this.shakes.get(i);
    if (sh !== undefined) {
      const k = (now - sh) / SHAKE_MS;
      if (k >= 1) this.shakes.delete(i);
      else {
        cx += Math.sin(k * Math.PI * 6) * w * 0.12 * (1 - k);
        more = true;
      }
    }

    ctx.save();
    ctx.translate(cx, base);
    if (angle) {
      // Tip around the mouth so the sand falls from there.
      ctx.translate(0, -h);
      ctx.rotate(angle);
      ctx.translate(0, h);
    }

    const r = w / 2;
    const lip = w * 0.35;
    const bodyTop = -h + lip;
    const glass = () => {
      ctx.beginPath();
      ctx.moveTo(-r, -h);
      ctx.lineTo(-r, -r);
      ctx.arc(0, -r, r, Math.PI, 0, true);
      ctx.lineTo(r, -h);
    };

    // Glass body.
    glass();
    ctx.closePath();
    ctx.fillStyle = this.theme.surface;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Sand, clipped to the inside of the glass.
    ctx.save();
    glass();
    ctx.closePath();
    ctx.clip();
    const { layers, extra, extraColor, at, mound } = this.contents(i, now);
    const pad = w * 0.09;
    const layerH = (-bodyTop - pad) / v.capacity;
    const yAt = (k: number) => -pad - k * layerH;
    const hiddenFill = this.mix(this.theme.muted, this.theme.surface, 0.35);
    // Layers above the moving fraction ride up on it.
    const pos = (k: number) => k + (k >= at ? extra : 0);
    const topIsExtra = extra > 0 && at === layers.length;
    // Liquid surfaces are drawn last so a band of sand sinking under them never covers the line.
    const liquidTops: number[] = [];
    for (let k = 0; k < layers.length; k++) {
      const covered = v.isHidden(i, k);
      const c = layers[k];
      const y = yAt(pos(k) + 1);
      if (!covered && isLiquid(c)) {
        this.drawLiquid(-r, y, w, layerH, colorOf(c), k);
        if (k === layers.length - 1 || layers[k + 1] !== c) liquidTops.push(y);
        continue;
      }
      const isTop = k === layers.length - 1 && !topIsExtra;
      this.drawLayer(-r, y, w, layerH, covered ? hiddenFill : colorOf(c), isTop ? mound : 0, w);
      if (covered) this.drawQuestion(0, yAt(pos(k)) - layerH / 2, layerH);
    }
    if (extra > 0) {
      const eh = layerH * extra;
      const y = yAt(at) - eh;
      if (isLiquid(extraColor)) {
        this.drawLiquid(-r, y, w, eh, colorOf(extraColor), at);
        liquidTops.push(y);
      } else this.drawLayer(-r, y, w, eh, colorOf(extraColor), i === p?.to && topIsExtra ? mound : 0, w);
    }
    for (const y of liquidTops) this.drawSurface(-r, y, w);
    ctx.restore();

    // Outline and lip.
    glass();
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = Math.max(2, w * 0.06);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r - w * 0.1, -h);
    ctx.lineTo(r + w * 0.1, -h);
    ctx.stroke();
    // Shine.
    ctx.beginPath();
    ctx.moveTo(-r + w * 0.2, -h + lip * 0.9);
    ctx.lineTo(-r + w * 0.2, -r - w * 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1.5, w * 0.06);
    ctx.stroke();

    // Cork on finished bottles.
    const done = this.completedAt.get(i);
    const complete = v.bottles[i].length === v.capacity && v.bottles[i].every((c) => c === v.bottles[i][0]);
    if (complete && !(p && i === p.to && now - p.t0 < POUR_MS * 0.8)) {
      const k = done !== undefined ? clamp01((now - done) / 220) : 1;
      if (k < 1) more = true;
      const cw = w * 0.82;
      const ch = lip * 1.1;
      const y = -h - ch * 0.55 - (1 - k) * w * 0.6;
      ctx.globalAlpha = k;
      ctx.fillStyle = '#b07a4c';
      ctx.strokeStyle = this.theme.line;
      ctx.lineWidth = Math.max(1.5, w * 0.045);
      ctx.beginPath();
      ctx.roundRect(-cw / 2, y, cw, ch, ch * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (!complete) this.completedAt.delete(i);

    ctx.restore();
    return more;
  }

  private drawLayer(x: number, y: number, w: number, h: number, color: string, mound: number, bw: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    // Overlap downwards a touch so layers never show a seam.
    ctx.moveTo(x, y + h + 0.5);
    ctx.lineTo(x, y);
    if (mound > 0) {
      const mh = bw * 0.16 * mound;
      ctx.quadraticCurveTo(x + w / 2, y - mh * 2, x + w, y);
    } else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h + 0.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (this.grain) {
      ctx.fillStyle = this.grain;
      ctx.fill();
    }
    // A faint lighter crust on top of each layer.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + w, y + 0.5);
    ctx.stroke();
  }

  /** A glassy band of liquid: no grain, a soft shine and a few bubbles. */
  private drawLiquid(x: number, y: number, w: number, h: number, color: string, seed: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h + 0.5);
    // Darker towards the bottom of the band, lighter at the top.
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h + 0.5);
    // A vertical streak of shine.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + w * 0.62, y, w * 0.1, h + 0.5);
    // Bubbles, fixed per layer so they do not flicker between frames.
    if (h > 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const fx = ((seed * 37 + k * 53) % 100) / 100;
        const fy = ((seed * 61 + k * 29) % 100) / 100;
        const br = Math.max(1.2, w * (0.035 + 0.02 * k));
        ctx.beginPath();
        ctx.arc(x + w * (0.2 + fx * 0.35), y + h * (0.25 + fy * 0.5), br, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** The top of a liquid band: a bright meniscus line. */
  private drawSurface(x: number, y: number, w: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.5, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.quadraticCurveTo(x + w / 2, y + Math.max(2, w * 0.06), x + w, y + 1);
    ctx.stroke();
  }

  private drawQuestion(x: number, y: number, size: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.theme.line;
    ctx.globalAlpha = 0.7;
    ctx.font = `800 ${Math.round(size * 0.62)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + 1);
    ctx.globalAlpha = 1;
  }

  /** A falling ribbon of grains from the tipped bottle's mouth into the target. */
  private drawStream(p: PourAnim, now: number): void {
    const t = (now - p.t0) / POUR_MS;
    if (t < 0.27 || t > 0.8) return;
    const v = this.view!;
    const dst = this.slots[p.to];
    const src = this.slots[p.from];
    const side = dst.x >= src.x ? -1 : 1;
    const x0 = dst.x + side * dst.w * 0.15;
    const y0 = dst.base - dst.h - dst.w * 0.3;
    const pad = dst.w * 0.09;
    const layerH = (dst.h - dst.w * 0.35 - pad) / v.capacity;
    // Sand falls through any liquid to land on the sand below it.
    const floor = isLiquid(p.color) ? p.before[p.to].length : sandCount(p.before[p.to]);
    const fill = floor + p.amount * easeInOut(clamp01((t - 0.3) / 0.45));
    const y1 = dst.base - pad - fill * layerH;
    const ctx = this.ctx;
    const color = colorOf(p.color);
    const liquid = isLiquid(p.color);
    const fade = Math.min(1, (t - 0.27) / 0.05, (0.8 - t) / 0.06);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    const len = y1 - y0;
    ctx.fillRect(x0 - dst.w * 0.05, y0, dst.w * 0.1, Math.max(0, len));
    if (liquid) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x0 - dst.w * 0.015, y0, dst.w * 0.03, Math.max(0, len));
      ctx.restore();
      return;
    }
    for (let k = 0; k < 18; k++) {
      const ph = ((now / 300 + k / 18) % 1);
      const y = y0 + ph * len;
      const x = x0 + Math.sin(k * 12.9 + now / 90) * dst.w * 0.09;
      ctx.fillRect(x - 1, y - 1, 2, 2);
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
