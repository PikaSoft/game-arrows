import { Rng } from '../../../shared/rng';
import { codeCount } from './rules';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level whose code may use a colour more than once. */
export const REPEAT_INTRO = 10;
export const MAX_COLOURS = 8;

export interface CodesSpec {
  slots: number;
  colours: number;
  repeats: boolean;
  tip?: string;
}

const TUTORIALS: CodesSpec[] = [
  {
    slots: 3,
    colours: 4,
    repeats: false,
    tip: 'Guess the hidden code. A filled dot is a right colour in the right place; a hollow dot is a right colour in the wrong place.',
  },
  { slots: 3, colours: 5, repeats: false, tip: "The dots don't say which pegs they mean. Compare your guesses to work it out." },
  { slots: 4, colours: 5, repeats: false, tip: 'Crack the code in par guesses or fewer for three stars.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function codesSpecFor(n: number): CodesSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  if (n === REPEAT_INTRO) return { slots: 4, colours: 6, repeats: true, tip: 'From now on the code can use a colour more than once.' };
  const rng = new Rng(n * 4231 + 17);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 36);
  // Before the repeat level: four pegs, five or six colours, no repeats.
  if (n < REPEAT_INTRO) return { slots: 4, colours: 5 + (n >= 7 ? 1 : 0), repeats: false };
  // The odd breather.
  if (rng.next() < 0.1) return { slots: 4, colours: 6, repeats: false };
  const slots = t < 0.4 ? 4 : t < 1 ? (rng.next() < t ? 5 : 4) : rng.int(4, 5);
  let colours = Math.min(MAX_COLOURS, 6 + Math.round(t * 2) + (t >= 1 ? rng.int(-1, 0) : 0));
  const repeats = rng.next() < 0.65;
  // Late levels sometimes use six pegs, kept without repeats so the code space stays small.
  if (t >= 1 && rng.next() < 0.15) return { slots: 6, colours: MAX_COLOURS, repeats: false };
  if (!repeats) colours = Math.max(colours, slots + 1);
  return { slots, colours, repeats };
}

/** Labels from how many codes are possible, in bits (log2 of the count). */
export const CODES_THRESHOLDS = [8, 11, 14];

export const codesScore = (s: { slots: number; colours: number; repeats: boolean }): number =>
  Math.round(Math.log2(codeCount(s.slots, s.colours, s.repeats)) * 10) / 10;

export function rateCodes(score: number): Difficulty {
  if (score < CODES_THRESHOLDS[0]) return 'Easy';
  if (score < CODES_THRESHOLDS[1]) return 'Medium';
  if (score < CODES_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
