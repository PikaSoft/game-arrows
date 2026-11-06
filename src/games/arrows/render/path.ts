import { Arrow, DELTA } from '../core/types';

export interface Pt {
  x: number;
  y: number;
}

/** How far the arrowhead tip sits beyond the head cell's centre. */
export const TIP = 0.34;
/** Visual tail length for one-cell arrows. */
const STUB = 0.32;

/**
 * The route an arrow travels: its own cells, then straight on out past the edge.
 * `bodyLen` is the drawn length from tail to arrowhead tip.
 */
export interface Route {
  pts: Pt[];
  cum: number[]; // cumulative length at each point
  bodyLen: number;
}

export function buildRoute(a: Arrow, extraCells: number): Route {
  const d = DELTA[a.dir];
  const pts: Pt[] = a.cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
  if (pts.length === 1) pts.unshift({ x: pts[0].x - d.x * STUB, y: pts[0].y - d.y * STUB });
  const head = pts[pts.length - 1];
  for (let k = 1; k <= extraCells; k++) pts.push({ x: head.x + d.x * k, y: head.y + d.y * k });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y));
  }
  const ownLen = cum[a.cells.length === 1 ? 1 : a.cells.length - 1];
  return { pts, cum, bodyLen: ownLen + TIP };
}

function pointAt(r: Route, s: number): Pt {
  const { pts, cum } = r;
  if (s <= 0) return pts[0];
  const last = pts.length - 1;
  if (s >= cum[last]) {
    // Beyond the route: keep going in the final direction.
    const a = pts[last - 1];
    const b = pts[last];
    const over = s - cum[last];
    return { x: b.x + Math.sign(b.x - a.x) * over, y: b.y + Math.sign(b.y - a.y) * over };
  }
  let i = 1;
  while (cum[i] < s) i++;
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
}

/** Points of the arrow body when it has travelled `offset` cells along its route. */
export function bodyAt(r: Route, offset: number): Pt[] {
  const s0 = offset;
  const s1 = offset + r.bodyLen;
  const out: Pt[] = [pointAt(r, s0)];
  for (let i = 0; i < r.pts.length; i++) {
    if (r.cum[i] > s0 + 1e-6 && r.cum[i] < s1 - 1e-6) out.push(r.pts[i]);
  }
  out.push(pointAt(r, s1));
  return out;
}
