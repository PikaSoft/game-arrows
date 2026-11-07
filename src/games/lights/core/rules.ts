import { Pattern } from './types';

const OFFSETS: Record<Pattern, [number, number][]> = {
  plus: [
    [0, 0],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ],
  cross: [
    [0, 0],
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ],
};

/** The tiles a tap on tile i changes, itself first. */
export function affected(w: number, h: number, pattern: Pattern, i: number): number[] {
  const x = i % w;
  const y = (i / w) | 0;
  const out: number[] = [];
  for (const [dx, dy] of OFFSETS[pattern]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
  }
  return out;
}

/** Tap tile i `times` times: every tile it reaches moves that many steps on. */
export function press(board: number[], w: number, h: number, pattern: Pattern, states: number, i: number, times = 1): number[] {
  const out = board.slice();
  for (const j of affected(w, h, pattern, i)) out[j] = (((out[j] + times) % states) + states) % states;
  return out;
}

export const allOff = (board: number[]): boolean => board.every((v) => v === 0);
