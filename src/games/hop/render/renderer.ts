import { Theme } from '../../../shared/themes';
import { COLS, Lane, MID_ROW, NEST_COLS, NEST_ROW, padState, ROWS, spansAt, START_ROW } from '../core/lanes';
import { Dir, HOP_TIME, HopSim } from '../core/sim';

/** Scenery colours: light and dark sets, the same idea on every theme. */
const DAY = { grass: '#8cc06a', grass2: '#7db45c', hedge: '#4f8a3e', water: '#5aa9d6', water2: '#4b9bc9', road: '#6d6f75', paint: '#e9e4d4', log: '#9a6634', logEnd: '#c58d52', pad: '#4fa65a', padLeaf: '#3c8a47', nest: '#b98a4f', truck: '#efe9da' };
const NIGHT = { grass: '#3f5f34', grass2: '#38552e', hedge: '#26421f', water: '#24506d', water2: '#1f4763', road: '#3a3b40', paint: '#a8a392', log: '#7a5129', logEnd: '#a07142', pad: '#3a7f45', padLeaf: '#2e6a38', nest: '#8d6838', truck: '#b9b4a6' };
const CARS = ['#d9473f', '#3f7fd9', '#e3a23b', '#8a5bd1'];
const CHICK = '#ffd23f';
const BEAK = '#f08a24';

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  t0: number;
  life: number;
}

export class HopRenderer {
  sim: HopSim | null = null;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private k = 30;
  private ox = 0;
  private oy = 0;
  private face: Dir = 0;
  /** The hop being drawn: where it started, and when. */
  private from: { row: number; x: number } | null = null;
  private hopT0 = 0;
  private pendingHop = false;
  private lastRow = START_ROW;
  private lastX = 0;
  private puffs: Puff[] = [];

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
    this.k = Math.max(1, Math.floor(Math.min(this.cssW / COLS, this.cssH / ROWS)));
    this.ox = Math.round((this.cssW - this.k * COLS) / 2);
    this.oy = Math.round((this.cssH - this.k * ROWS) / 2);
    this.draw();
  }

  setSim(s: HopSim | null): void {
    this.sim = s;
    this.puffs = [];
    this.from = null;
    this.pendingHop = false;
    this.face = 0;
    if (s) {
      this.lastRow = s.row;
      this.lastX = s.x;
    }
  }

  /** The chick hopped: turn it to face the way it went and draw the hop. */
  hop(d: Dir): void {
    this.face = d;
    this.pendingHop = true;
  }

  /** A new chick at the start, facing the far bank. */
  respawn(): void {
    this.face = 0;
    this.from = null;
    this.pendingHop = false;
  }

  /** A burst where the chick was lost: feathers on the road, a splash in the water. */
  lost(wet: boolean): void {
    const s = this.sim;
    if (!s) return;
    const t0 = performance.now();
    const colors = wet ? ['#ffffff', '#bfe4f5', CHICK] : [CHICK, '#fff3b0', BEAK];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const v = 0.8 + Math.random() * 1.6;
      this.puffs.push({ x: s.x, y: s.row + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (wet ? 1.2 : 0), color: colors[i % 3], t0, life: 650 });
    }
  }

  /** A nest filled: a little ring of sparkles. */
  home(col: number): void {
    const t0 = performance.now();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.puffs.push({ x: col + 0.5, y: NEST_ROW + 0.5, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, color: this.theme.accent, t0, life: 500 });
    }
  }

  private get pal() {
    return this.theme.id === 'night' ? NIGHT : DAY;
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s || !this.cssW) return;
    const k = this.k;
    const P = this.pal;
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.beginPath();
    ctx.rect(0, 0, k * COLS, k * ROWS);
    ctx.clip();
    const now = performance.now();
    // Ground, row by row.
    for (let row = 0; row < ROWS; row++) {
      const lane = s.lane(row);
      const y = row * k;
      if (!lane) {
        ctx.fillStyle = row % 2 ? P.grass : P.grass2;
        ctx.fillRect(0, y, k * COLS, k);
      } else if (lane.kind === 'road') {
        ctx.fillStyle = P.road;
        ctx.fillRect(0, y, k * COLS, k);
        if (row > MID_ROW + 1) {
          ctx.strokeStyle = P.paint;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(1.5, k * 0.05);
          ctx.setLineDash([k * 0.4, k * 0.35]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(k * COLS, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = row % 2 ? P.water : P.water2;
        ctx.fillRect(0, y, k * COLS, k);
        // Slow ripples drifting with the current.
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = Math.max(1, k * 0.035);
        const drift = ((s.time * lane.speed * 0.35 * lane.dir) % 2) + 2;
        for (let c = -4; c < COLS + 2; c += 2) {
          const rx = (c + drift + (row % 2)) * k;
          ctx.beginPath();
          ctx.moveTo(rx, y + k * 0.62);
          ctx.quadraticCurveTo(rx + k * 0.25, y + k * 0.5, rx + k * 0.5, y + k * 0.62);
          ctx.stroke();
        }
      }
    }
    // Curbs between grass and road.
    ctx.fillStyle = P.paint;
    ctx.globalAlpha = 0.7;
    const curb = Math.max(2, k * 0.06);
    ctx.fillRect(0, (MID_ROW + 1) * k - curb / 2, k * COLS, curb);
    ctx.fillRect(0, START_ROW * k - curb / 2, k * COLS, curb);
    ctx.globalAlpha = 1;
    // The far bank: hedge, with a nest in each gap.
    ctx.fillStyle = P.hedge;
    ctx.fillRect(0, 0, k * COLS, k);
    NEST_COLS.forEach((c, i) => {
      ctx.fillStyle = P.grass;
      ctx.fillRect(c * k + k * 0.06, k * 0.12, k * 0.88, k * 0.88);
      this.nest(c * k + k / 2, k * 0.62, k);
      if (s.nests[i]) this.chick(c * k + k / 2, k * 0.5, k * 0.8, 2, false);
    });
    for (const lane of s.spec.lanes) this.lane(lane, s.time, now);
    // The chick: hidden after a fall until the next one sets off, and once it's in a nest.
    if (this.pendingHop && (s.row !== this.lastRow || Math.abs(s.x - this.lastX) > 0.5)) {
      this.from = { row: this.lastRow, x: this.lastX };
      this.hopT0 = now;
      this.pendingHop = false;
    }
    this.lastRow = s.row;
    this.lastX = s.x;
    const lost = s.wait > 0 && s.row !== NEST_ROW;
    if (!s.over && !lost && s.row !== NEST_ROW) {
      let cx = s.x;
      let cy = s.row + 0.5;
      let lift = 0;
      const t = this.from ? (now - this.hopT0) / (HOP_TIME * 1000) : 1;
      if (this.from && t < 1) {
        cx = this.from.x + (s.x - this.from.x) * t;
        cy = this.from.row + 0.5 + (s.row - this.from.row) * t;
        lift = Math.sin(t * Math.PI) * 0.18;
      } else this.from = null;
      this.chick(cx * k, (cy - lift) * k, k * (0.82 + lift * 0.5), this.face, true);
    }
    // Feathers and splashes, in cells.
    this.puffs = this.puffs.filter((q) => now - q.t0 < q.life);
    for (const q of this.puffs) {
      const t = (now - q.t0) / 1000;
      ctx.globalAlpha = 1 - (now - q.t0) / q.life;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc((q.x + q.vx * t) * k, (q.y + q.vy * t + 2.5 * t * t) * k, k * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private lane(lane: Lane, t: number, now: number): void {
    const ctx = this.ctx;
    const k = this.k;
    const P = this.pal;
    const y = lane.row * k;
    for (const sp of spansAt(lane, t)) {
      if (sp.right < -0.5 || sp.left > COLS + 0.5) continue;
      const x = sp.left * k;
      const w = sp.th.len * k;
      if (lane.kind === 'logs') {
        ctx.fillStyle = P.log;
        this.round(x + k * 0.04, y + k * 0.14, w - k * 0.08, k * 0.72, k * 0.32);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = Math.max(1, k * 0.04);
        ctx.beginPath();
        for (let i = 1; i < sp.th.len; i++) {
          ctx.moveTo(x + i * k - k * 0.2, y + k * 0.34);
          ctx.lineTo(x + i * k + k * 0.15, y + k * 0.34);
          ctx.moveTo(x + i * k - k * 0.05, y + k * 0.66);
          ctx.lineTo(x + i * k + k * 0.3, y + k * 0.66);
        }
        ctx.stroke();
        ctx.fillStyle = P.logEnd;
        const endX = lane.dir > 0 ? x + w - k * 0.3 : x + k * 0.3;
        ctx.beginPath();
        ctx.ellipse(endX, y + k / 2, k * 0.18, k * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (lane.kind === 'pads') {
        const state = padState(sp.th, t);
        for (let i = 0; i < sp.th.len; i++) {
          const cx = x + (i + 0.5) * k;
          const cy = y + k / 2;
          if (state === 2) {
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.max(1, k * 0.04);
            ctx.beginPath();
            ctx.arc(cx, cy, k * 0.3, 0, Math.PI * 2);
            ctx.stroke();
            continue;
          }
          const wob = state === 1 ? Math.sin(now / 55 + i) * 0.05 : 0;
          ctx.globalAlpha = state === 1 ? 0.7 : 1;
          ctx.fillStyle = P.pad;
          ctx.beginPath();
          ctx.arc(cx, cy, k * (0.42 + wob), 0.35, Math.PI * 2 - 0.05);
          ctx.lineTo(cx, cy);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = P.padLeaf;
          ctx.lineWidth = Math.max(1, k * 0.035);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - k * 0.25, cy - k * 0.1);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - k * 0.1, cy + k * 0.26);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else this.car(x, y, w, lane.dir, sp.th.len, sp.th.look);
    }
  }

  private car(x: number, y: number, w: number, dir: number, len: number, look: number): void {
    const ctx = this.ctx;
    const k = this.k;
    const body = CARS[look % CARS.length];
    const top = y + k * 0.16;
    const h = k * 0.68;
    if (len === 1) {
      ctx.fillStyle = body;
      this.round(x + k * 0.06, top, w - k * 0.12, h, k * 0.2);
      ctx.fill();
      // Windscreen at the front, rear window behind.
      ctx.fillStyle = 'rgba(220,240,255,0.85)';
      const front = dir > 0 ? x + w - k * 0.36 : x + k * 0.18;
      const rear = dir > 0 ? x + k * 0.16 : x + w - k * 0.28;
      ctx.fillRect(front, top + h * 0.15, k * 0.18, h * 0.7);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(rear, top + h * 0.2, k * 0.12, h * 0.6);
      ctx.globalAlpha = 1;
    } else {
      // A truck: a box behind a cab.
      const cabW = k * 0.8;
      const cabX = dir > 0 ? x + w - cabW - k * 0.04 : x + k * 0.04;
      const boxX = dir > 0 ? x + k * 0.04 : x + cabW + k * 0.08;
      ctx.fillStyle = this.pal.truck;
      this.round(boxX, top - k * 0.04, w - cabW - k * 0.12, h + k * 0.08, k * 0.08);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = Math.max(1, k * 0.04);
      ctx.stroke();
      ctx.fillStyle = body;
      this.round(cabX, top + k * 0.04, cabW, h - k * 0.08, k * 0.16);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,240,255,0.85)';
      ctx.fillRect(dir > 0 ? cabX + cabW - k * 0.3 : cabX + k * 0.12, top + h * 0.2, k * 0.18, h * 0.6);
    }
    // Headlights.
    ctx.fillStyle = '#fff6c2';
    const hx = dir > 0 ? x + w - k * 0.1 : x + k * 0.1;
    ctx.beginPath();
    ctx.arc(hx, top + h * 0.2, k * 0.05, 0, Math.PI * 2);
    ctx.arc(hx, top + h * 0.8, k * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  private nest(cx: number, cy: number, k: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.pal.nest;
    ctx.beginPath();
    ctx.ellipse(cx, cy, k * 0.38, k * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(1, k * 0.035);
    ctx.beginPath();
    ctx.ellipse(cx, cy - k * 0.03, k * 0.26, k * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** A round chick seen from above, its beak pointing the way it last hopped. */
  private chick(x: number, y: number, size: number, face: Dir, legs: boolean): void {
    const ctx = this.ctx;
    const r = size * 0.42;
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][face];
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.75, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(a);
    if (legs) {
      ctx.strokeStyle = BEAK;
      ctx.lineWidth = Math.max(1.2, size * 0.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.55);
      ctx.lineTo(-r * 1.05, -r * 0.6);
      ctx.moveTo(-r * 0.5, r * 0.55);
      ctx.lineTo(-r * 1.05, r * 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = CHICK;
    ctx.strokeStyle = this.theme.id === 'night' ? '#7a5a10' : '#b08a1a';
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Wings.
    ctx.fillStyle = '#f2bf2a';
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, -r * 0.82, r * 0.42, r * 0.18, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, r * 0.82, r * 0.42, r * 0.18, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // Beak and eyes.
    ctx.fillStyle = BEAK;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(r * 0.8, -r * 0.25);
    ctx.lineTo(r * 0.8, r * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b2116';
    ctx.beginPath();
    ctx.arc(r * 0.45, -r * 0.4, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.45, r * 0.4, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private round(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
