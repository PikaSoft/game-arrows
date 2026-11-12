import { Theme } from '../../../shared/themes';
import { SIDE_SPAN, TOP_SPAN } from '../core/rules';
import { Events, LoopSim } from '../core/sim';
import { CRATE } from '../core/types';

export const CUBE_COLORS = ['#d9584a', '#4f9ed8', '#e8c547', '#5aa457', '#8e62c4', '#ee8a3a'];

/** How long a cube takes to fall onto the belt or hop into a tray, and a full tray to leave. */
const DROP_MS = 170;
const FLY_MS = 160;
const SHIP_MS = 260;
const SLIDE_MS = 180;
/** Crates shown in a column and trays shown waiting in a bay before a "+2" label takes over. */
const SHOWN_CRATES = 4;
const SHOWN_TRAYS = 5;

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

interface Flight {
  bay: number;
  /** Which place in the tray the cube lands in. */
  slot: number;
  color: number;
  x: number;
  y: number;
  t0: number;
  /** The cube that filled a tray: it belongs to the tray that is leaving. */
  last: boolean;
}

export class LoopRenderer {
  sim: LoopSim | null = null;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private bits: Bit[] = [];
  /** Cubes still falling from a chute, by cube id: where they fell from and when. */
  private drops = new Map<number, { x: number; y: number; t0: number }>();
  private flights: Flight[] = [];
  /** Per bay, the tray that is leaving and when it starts to go. */
  private ships: ({ color: number; t0: number } | null)[] = [];
  /** Per column, when its stack last moved down a place. */
  private slides: number[] = [];
  private jamAt = 0;

  // Layout, in CSS pixels. P is the length of the belt.
  private P = 600;
  private R = 20;
  private W = 180;
  private H = 60;
  private th = 30;
  private x0 = 0;
  private yT = 0;

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
    // The whole picture is 0.43 belt lengths wide and 0.62 tall: crates, belt, trays.
    const P = Math.max(200, Math.min((this.cssW - 12) / 0.43, (this.cssH - 8) / 0.62));
    this.P = P;
    this.R = 0.035 * P;
    this.W = TOP_SPAN * P;
    this.H = SIDE_SPAN * P - Math.PI * this.R;
    this.th = 0.05 * P;
    this.x0 = (this.cssW - (this.W + 2 * this.R)) / 2;
    this.yT = (this.cssH - 0.62 * P) / 2 + 0.205 * P + this.th / 2;
  }

  setSim(s: LoopSim | null): void {
    this.sim = s;
    this.bits = [];
    this.clearMotion();
  }

  /** Forget anything in flight, after an undo or restart. */
  clearMotion(): void {
    this.drops.clear();
    this.flights = [];
    this.ships = [];
    this.slides = [];
    this.jamAt = 0;
  }

  /** The point a given way round the belt, in belt slots from the top-left. */
  private point(place: number, capacity: number): [number, number] {
    const { P, R, W, H, x0, yT } = this;
    const arc = (Math.PI * R) / 2;
    let d = ((((place / capacity) % 1) + 1) % 1) * P;
    if (d < W) return [x0 + R + d, yT];
    d -= W;
    if (d < arc) return [x0 + R + W + R * Math.sin(d / R), yT + R - R * Math.cos(d / R)];
    d -= arc;
    if (d < H) return [x0 + 2 * R + W, yT + R + d];
    d -= H;
    if (d < arc) return [x0 + R + W + R * Math.cos(d / R), yT + R + H + R * Math.sin(d / R)];
    d -= arc;
    if (d < W) return [x0 + R + W - d, yT + 2 * R + H];
    d -= W;
    if (d < arc) return [x0 + R - R * Math.sin(d / R), yT + R + H + R * Math.cos(d / R)];
    d -= arc;
    if (d < H) return [x0, yT + R + H - d];
    d -= H;
    return [x0 + R - R * Math.cos(d / R), yT + R - R * Math.sin(d / R)];
  }

  private colX(i: number, cols: number): number {
    return this.x0 + this.R + (this.W * (i + 0.5)) / cols;
  }
  private bayX(j: number, bays: number): number {
    return this.x0 + this.R + (this.W * (j + 0.5)) / bays;
  }
  private get crateW(): number {
    return Math.min(0.085 * this.P, (this.W / (this.sim?.cols ?? 2)) * 0.9);
  }
  private get trayW(): number {
    return Math.min(0.095 * this.P, (this.W / (this.sim?.bayCount ?? 2)) * 0.9);
  }
  /** Bottom of the lowest crate in a column: just above the chute. */
  private get stackBottom(): number {
    return this.yT - this.th / 2 - 0.05 * this.P;
  }
  private get trayTop(): number {
    return this.yT + 2 * this.R + this.H + this.th / 2 + 0.016 * this.P;
  }
  /** Where the cubes of a column wait and drop from. */
  private chuteY(): number {
    return this.yT - this.th / 2 - 0.024 * this.P;
  }

  /** The column under a point on the canvas, or -1. Anywhere above the belt counts. */
  colAt(px: number, py: number): number {
    const s = this.sim;
    if (!s || py > this.yT + this.R) return -1;
    const step = this.W / s.cols;
    const i = Math.floor((px - (this.x0 + this.R)) / step);
    // A little grace either side of the outer columns.
    if (i < 0) return px > this.x0 + this.R - step * 0.4 ? 0 : -1;
    if (i >= s.cols) return px < this.x0 + this.R + this.W + step * 0.4 ? s.cols - 1 : -1;
    return i;
  }

  /** Start the animations for what just happened on the belt. */
  handle(ev: Events): void {
    const s = this.sim;
    if (!s) return;
    const now = performance.now();
    for (const d of ev.dropped) this.drops.set(d.id, { x: this.colX(d.col, s.cols), y: this.chuteY(), t0: now });
    for (const t of ev.taken) {
      const [x, y] = this.point(s.intakeAt[t.bay], s.capacity);
      this.drops.delete(t.id);
      this.flights.push({ bay: t.bay, slot: t.fill, color: t.color, x, y, t0: now, last: t.fill === CRATE - 1 });
    }
    for (const sh of ev.shipped) this.ships[sh.bay] = { color: sh.color, t0: now + FLY_MS };
    if (ev.jammed) this.jamAt = now;
  }

  /** A column's stack moves down a place after a tap. */
  tapped(col: number): void {
    this.slides[col] = performance.now();
  }

  confetti(): void {
    const now = performance.now();
    for (let k = 0; k < 90; k++) {
      this.bits.push({
        x: Math.random() * this.cssW,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 40,
        vy: 60 + Math.random() * 80,
        color: this.theme.confetti[k % this.theme.confetti.length],
        t0: now + Math.random() * 400,
        life: 2200,
        size: 4 + Math.random() * 4,
      });
    }
  }

  private cube(x: number, y: number, size: number, color: string, alpha = 1): void {
    const ctx = this.ctx;
    const h = size / 2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - h, y - h, size, size, size * 0.26);
    ctx.fill();
    // A darker foot and a lighter top give it some depth.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.roundRect(x - h, y + h - size * 0.24, size, size * 0.24, [0, 0, size * 0.26, size * 0.26]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.roundRect(x - h + size * 0.16, y - h + size * 0.14, size * 0.4, size * 0.18, size * 0.09);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private beltPath(): void {
    const { R, W, H, x0, yT } = this;
    this.ctx.beginPath();
    this.ctx.roundRect(x0, yT, W + 2 * R, H + 2 * R, R);
  }

  /** `frac` is how far the belt is towards its next slot, from 0 to 1. */
  draw(frac: number): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s) return;
    const { P, th } = this;
    const t = this.theme;
    const C = s.capacity;
    const level = s.level;
    const cubeSize = Math.min((P / C) * 0.8, th * 0.8);
    const mini = this.crateW / 4.9;

    // ----- Belt -----
    const jamming = s.jammed ? 0.5 + 0.5 * Math.sin((now - this.jamAt) / 110) : 0;
    ctx.lineJoin = 'round';
    this.beltPath();
    ctx.strokeStyle = t.line;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = th + 5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.beltPath();
    ctx.strokeStyle = t.surface;
    ctx.lineWidth = th;
    ctx.stroke();
    if (s.jammed) {
      this.beltPath();
      ctx.strokeStyle = t.danger;
      ctx.globalAlpha = 0.18 + 0.22 * jamming;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Arrows that ride the belt, showing which way it turns.
    const move = s.rot + frac;
    ctx.strokeStyle = t.line;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = Math.max(1.5, th * 0.07);
    ctx.lineCap = 'round';
    const arrows = 10;
    for (let k = 0; k < arrows; k++) {
      const at = ((k / arrows) * C + move) % C;
      const [ax, ay] = this.point(at, C);
      const [bx, by] = this.point(at + 0.05, C);
      const ang = Math.atan2(by - ay, bx - ax);
      const a = th * 0.2;
      ctx.beginPath();
      ctx.moveTo(ax - a * Math.cos(ang - 0.9), ay - a * Math.sin(ang - 0.9));
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax - a * Math.cos(ang + 0.9), ay - a * Math.sin(ang + 0.9));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ----- Supply columns -----
    const cw = this.crateW;
    const ch = 0.032 * P;
    const gap = 0.007 * P;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < s.cols; i++) {
      const x = this.colX(i, s.cols);
      const left = level.supply[i].length - s.next[i];
      // The chute: a short funnel down to the belt.
      const top = this.stackBottom + gap;
      const bottom = this.yT - th / 2 - 2;
      ctx.fillStyle = t.line;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(x - cw / 2, top);
      ctx.lineTo(x + cw / 2, top);
      ctx.lineTo(x + cw * 0.3, bottom);
      ctx.lineTo(x - cw * 0.3, bottom);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // Cubes waiting in the chute.
      const waiting = s.chutes[i];
      if (waiting.length) {
        const m = Math.min(mini, 0.02 * P);
        const stepX = Math.min(m * 1.12, (cw * 0.86 - m) / Math.max(1, waiting.length - 1));
        const startX = x - (stepX * (waiting.length - 1)) / 2;
        for (let k = waiting.length - 1; k >= 0; k--) this.cube(startX + stepX * k, this.chuteY(), m, CUBE_COLORS[waiting[k]]);
      }
      // The stack, front crate lowest.
      const slideT = this.slides[i] ? Math.min(1, (now - this.slides[i]) / SLIDE_MS) : 1;
      const lift = (1 - slideT) * (1 - slideT) * (ch + gap);
      const shown = Math.min(left, SHOWN_CRATES);
      for (let k = 0; k < shown; k++) {
        const crate = level.supply[i][s.next[i] + k];
        const y = this.stackBottom - ch - k * (ch + gap) - lift;
        const front = k === 0;
        const hidden = level.covered && !front;
        ctx.fillStyle = t.surface;
        ctx.strokeStyle = t.line;
        ctx.lineWidth = front ? 2.5 : 1.5;
        ctx.globalAlpha = front ? 1 : 0.75;
        ctx.beginPath();
        ctx.roundRect(x - cw / 2, y, cw, ch, ch * 0.28);
        ctx.fill();
        ctx.stroke();
        if (hidden) {
          ctx.fillStyle = t.muted;
          ctx.font = `700 ${Math.round(ch * 0.62)}px system-ui, sans-serif`;
          ctx.fillText('?', x, y + ch / 2 + 1);
        } else {
          const m = Math.min(mini, ch * 0.66);
          const stepX = (cw - m * 0.5) / CRATE;
          for (let q = 0; q < CRATE; q++) this.cube(x + (q - (CRATE - 1) / 2) * stepX, y + ch / 2, m, CUBE_COLORS[crate[q]], front ? 1 : 0.75);
        }
        ctx.globalAlpha = 1;
      }
      if (left > SHOWN_CRATES) {
        ctx.fillStyle = t.muted;
        ctx.font = `700 ${Math.round(ch * 0.5)}px system-ui, sans-serif`;
        ctx.fillText(`+${left - SHOWN_CRATES}`, x, this.stackBottom - SHOWN_CRATES * (ch + gap) - ch * 0.35 - lift);
      }
    }

    // ----- Collector bays -----
    const tw = this.trayW;
    const trayH = 0.04 * P;
    const top = this.trayTop;
    this.flights = this.flights.filter((f) => now - f.t0 < FLY_MS);
    for (let j = 0; j < s.bayCount; j++) {
      const x = this.bayX(j, s.bayCount);
      const bay = level.bays[j];
      // The intake: a notch from the belt down to the tray.
      ctx.fillStyle = t.line;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.3, this.yT + 2 * this.R + this.H + th / 2 + 2);
      ctx.lineTo(x + tw * 0.3, this.yT + 2 * this.R + this.H + th / 2 + 2);
      ctx.lineTo(x + tw / 2, top);
      ctx.lineTo(x - tw / 2, top);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      const ship = this.ships[j];
      let shipT = -1;
      if (ship) {
        shipT = (now - ship.t0) / SHIP_MS;
        if (shipT >= 1) {
          this.ships[j] = null;
          shipT = -1;
        }
      }
      const flying = this.flights.filter((f) => f.bay === j);
      const slotX = (q: number) => x + (q - (CRATE - 1) / 2) * ((tw - 6) / CRATE);
      const m = Math.min((tw - 10) / CRATE - 2, trayH * 0.7);
      const tray = (color: number, fill: number, y: number, alpha: number) => {
        const col = CUBE_COLORS[color];
        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.surface;
        ctx.beginPath();
        ctx.roundRect(x - tw / 2, y, tw, trayH, trayH * 0.3);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.globalAlpha = alpha * 0.2;
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.stroke();
        for (let q = 0; q < CRATE; q++) {
          if (q < fill) this.cube(slotX(q), y + trayH / 2, m, col, alpha);
          else {
            ctx.globalAlpha = alpha * 0.4;
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(slotX(q) - m / 2, y + trayH / 2 - m / 2, m, m, m * 0.26);
            ctx.stroke();
            ctx.globalAlpha = alpha;
          }
        }
        ctx.globalAlpha = 1;
      };

      const leaving = ship && shipT < 0; // the last cube is still on its way in
      const front = s.frontTray(j);
      // The front tray. While a full one leaves, the next slides up from the queue.
      const rise = shipT >= 0 ? (1 - shipT) * (trayH * 0.6) : 0;
      if (leaving) {
        tray(ship!.color, CRATE - flying.filter((f) => f.last).length, top, 1);
      } else if (front >= 0) {
        tray(front, s.fill[j] - flying.filter((f) => !f.last).length, top + rise, shipT >= 0 ? shipT : 1);
      } else if (shipT < 0) {
        // Bay finished: a quiet tick.
        ctx.strokeStyle = t.muted;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - trayH * 0.35, top + trayH * 0.5);
        ctx.lineTo(x - trayH * 0.08, top + trayH * 0.78);
        ctx.lineTo(x + trayH * 0.4, top + trayH * 0.2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (shipT >= 0) tray(ship!.color, CRATE, top + shipT * trayH * 0.4, 1 - shipT);

      // Trays waiting behind the front one.
      const firstWaiting = s.bayIdx[j] + (leaving ? 0 : 1);
      const pillH = 0.017 * P;
      const pillGap = 0.006 * P;
      const waitingTrays = bay.length - firstWaiting;
      const pillTop = top + trayH + 0.012 * P + rise * 0.5;
      for (let k = 0; k < Math.min(waitingTrays, SHOWN_TRAYS); k++) {
        ctx.fillStyle = CUBE_COLORS[bay[firstWaiting + k]];
        ctx.beginPath();
        ctx.roundRect(x - tw * 0.36, pillTop + k * (pillH + pillGap), tw * 0.72, pillH, pillH / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (waitingTrays > SHOWN_TRAYS) {
        ctx.fillStyle = t.muted;
        ctx.font = `700 ${Math.round(pillH * 0.95)}px system-ui, sans-serif`;
        ctx.fillText(`+${waitingTrays - SHOWN_TRAYS}`, x, pillTop + SHOWN_TRAYS * (pillH + pillGap) + pillH * 0.6);
      }

      // Cubes hopping from the belt into the tray.
      for (const f of flying) {
        const e = Math.min(1, (now - f.t0) / FLY_MS);
        const tx = slotX(f.slot);
        const ty = top + trayH / 2;
        const size = cubeSize + (m - cubeSize) * e;
        this.cube(f.x + (tx - f.x) * e, f.y + (ty - f.y) * e * e, size, CUBE_COLORS[f.color]);
      }
    }

    // ----- Cubes on the belt -----
    for (let p = 0; p < C; p++) {
      const c = s.belt[p];
      if (c < 0) continue;
      let [x, y] = this.point(p + frac, C);
      const id = s.idAt(p);
      const drop = this.drops.get(id);
      let size = cubeSize;
      if (drop) {
        const e = (now - drop.t0) / DROP_MS;
        if (e >= 1) this.drops.delete(id);
        else {
          x = drop.x + (x - drop.x) * e;
          y = drop.y + (y - drop.y) * e * e;
          size = cubeSize * (0.6 + 0.4 * e);
        }
      }
      if (s.jammed) x += Math.sin((now - this.jamAt) / 40 + p) * 1.2;
      this.cube(x, y, size, CUBE_COLORS[c]);
    }

    // ----- Confetti -----
    if (this.bits.length) {
      this.bits = this.bits.filter((b) => now - b.t0 < b.life);
      for (const b of this.bits) {
        const age = (now - b.t0) / 1000;
        if (age < 0) continue;
        ctx.globalAlpha = Math.max(0, 1 - (age * 1000) / b.life);
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x + b.vx * age, b.y + b.vy * age + 120 * age * age, b.size, b.size);
      }
      ctx.globalAlpha = 1;
    }
  }
}
