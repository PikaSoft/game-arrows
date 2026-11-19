import { Feedback } from './types';

/** Mark a guess against the code. Each code peg is counted at most once. */
export function mark(guess: ArrayLike<number>, code: ArrayLike<number>): Feedback {
  let exact = 0;
  const g = new Array<number>(16).fill(0);
  const c = new Array<number>(16).fill(0);
  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) exact++;
    else {
      g[guess[i]]++;
      c[code[i]]++;
    }
  }
  let near = 0;
  for (let k = 0; k < 16; k++) near += Math.min(g[k], c[k]);
  return { exact, near };
}

/** A feedback as one small number, for grouping. */
export const feedbackKey = (f: Feedback, slots: number): number => f.exact * (slots + 1) + f.near;

export const sameFeedback = (a: Feedback, b: Feedback): boolean => a.exact === b.exact && a.near === b.near;

/** How many codes there are for a size. */
export function codeCount(slots: number, colours: number, repeats: boolean): number {
  if (repeats) return Math.pow(colours, slots);
  let n = 1;
  for (let i = 0; i < slots; i++) n *= colours - i;
  return n;
}

/** Every code for a size, packed `slots` bytes each, in counting order. */
export function allCodes(slots: number, colours: number, repeats: boolean): Uint8Array {
  const out = new Uint8Array(codeCount(slots, colours, repeats) * slots);
  const cur = new Array<number>(slots).fill(0);
  let k = 0;
  const used = new Array<boolean>(colours).fill(false);
  const walk = (i: number) => {
    if (i === slots) {
      for (let j = 0; j < slots; j++) out[k++] = cur[j];
      return;
    }
    for (let c = 0; c < colours; c++) {
      if (!repeats && used[c]) continue;
      cur[i] = c;
      used[c] = true;
      walk(i + 1);
      used[c] = false;
    }
  };
  walk(0);
  return out;
}

export interface Guess {
  pegs: number[];
  feedback: Feedback;
}

/** True when `code` would have given every answer in `history`. */
export function fits(code: ArrayLike<number>, history: readonly Guess[]): boolean {
  for (const h of history) if (!sameFeedback(mark(h.pegs, code), h.feedback)) return false;
  return true;
}
