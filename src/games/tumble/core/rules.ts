import { ACROSS, Block, BRIDGE, DOWN, GOAL, NONE, STAND, Switch, SWITCH, TumbleLevel, WEAK } from './types';

/** Tip the block one way: north 0, east 1, south 2, west 3. */
export function roll(b: Block, d: number): Block {
  const { x, y, pose } = b;
  if (pose === STAND) {
    if (d === 1) return { x: x + 1, y, pose: ACROSS };
    if (d === 3) return { x: x - 2, y, pose: ACROSS };
    if (d === 2) return { x, y: y + 1, pose: DOWN };
    return { x, y: y - 2, pose: DOWN };
  }
  if (pose === ACROSS) {
    if (d === 1) return { x: x + 2, y, pose: STAND };
    if (d === 3) return { x: x - 1, y, pose: STAND };
    if (d === 2) return { x, y: y + 1, pose: ACROSS };
    return { x, y: y - 1, pose: ACROSS };
  }
  if (d === 2) return { x, y: y + 2, pose: STAND };
  if (d === 0) return { x, y: y - 1, pose: STAND };
  if (d === 1) return { x: x + 1, y, pose: DOWN };
  return { x: x - 1, y, pose: DOWN };
}

/** The squares the block covers, as [x, y]. */
export function covers(b: Block): [number, number][] {
  if (b.pose === STAND) return [[b.x, b.y]];
  if (b.pose === ACROSS) return [[b.x, b.y], [b.x + 1, b.y]];
  return [[b.x, b.y], [b.x, b.y + 1]];
}

export type Board = Pick<TumbleLevel, 'w' | 'h' | 'tiles' | 'switches'>;

/** Which switch, if any, owns a bridge square. */
export function bridgeOwner(switches: Switch[]): Map<number, number> {
  const m = new Map<number, number>();
  switches.forEach((s, k) => s.bridges.forEach((i) => m.set(i, k)));
  return m;
}

/** The starting open bits: bit k set while switch k's bridges are open. */
export const startOpen = (switches: Switch[]): number => switches.reduce((m, s, k) => (s.open ? m | (1 << k) : m), 0);

export interface Step {
  block: Block;
  open: number;
  /** The block fell off (or broke a cracked square): the move is wasted. */
  fell: boolean;
  /** Squares of a cracked tile that broke, for the renderer. */
  broke: number | null;
  /** Switches pressed by this move. */
  pressed: number[];
  won: boolean;
}

/**
 * One move. The block falls if any part ends over nothing (or a closed bridge), or if
 * it stands on a cracked square. Otherwise each switch under it flips its bridges.
 */
export function step(board: Board, owner: Map<number, number>, b: Block, open: number, d: number): Step {
  const nb = roll(b, d);
  const { w, h, tiles, switches } = board;
  let broke: number | null = null;
  for (const [x, y] of covers(nb)) {
    const fall = { block: b, open, fell: true, broke, pressed: [], won: false };
    if (x < 0 || y < 0 || x >= w || y >= h) return fall;
    const i = y * w + x;
    const t = tiles[i];
    if (t === NONE) return fall;
    if (t === BRIDGE && !(open & (1 << owner.get(i)!))) return fall;
    if (t === WEAK && nb.pose === STAND) {
      broke = i;
      return { ...fall, broke };
    }
  }
  const pressed: number[] = [];
  let o = open;
  for (const [x, y] of covers(nb)) {
    const i = y * w + x;
    if (tiles[i] !== SWITCH) continue;
    const k = switches.findIndex((s) => s.at === i);
    if (k >= 0) {
      o ^= 1 << k;
      pressed.push(k);
    }
  }
  const won = nb.pose === STAND && tiles[nb.y * w + nb.x] === GOAL;
  return { block: nb, open: o, fell: false, broke: null, pressed, won };
}
