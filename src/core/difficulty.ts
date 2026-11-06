import { GenParams } from './generator';
import { Rng } from './rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 5;
/** Generated levels that ramp steadily before difficulty starts to vary. */
export const RAMP_LENGTH = 30;

interface Tier {
  label: Exclude<Difficulty, 'Tutorial'>;
  w: [number, number];
  minLen: number;
  maxLen: number;
  straightness: number;
  candidates: number;
}

export const TIERS: Tier[] = [
  { label: 'Easy', w: [7, 10], minLen: 2, maxLen: 6, straightness: 0.6, candidates: 1 },
  { label: 'Medium', w: [11, 15], minLen: 3, maxLen: 9, straightness: 0.5, candidates: 2 },
  { label: 'Hard', w: [16, 22], minLen: 3, maxLen: 13, straightness: 0.45, candidates: 2 },
  { label: 'Super Hard', w: [23, 30], minLen: 4, maxLen: 18, straightness: 0.4, candidates: 2 },
];

/** After the ramp, harder levels are more common. */
const WEIGHTS = [0.1, 0.2, 0.35, 0.35];
const ASPECT = 1.6;

export interface LevelSpec {
  difficulty: Tier['label'];
  params: GenParams;
}

/** Map a level number (generated levels start after the tutorials) to its settings. */
export function specFor(levelNumber: number): LevelSpec {
  const k = levelNumber - TUTORIAL_COUNT; // 1-based index into generated levels
  const rng = new Rng(levelNumber * 104729);
  let tierIndex: number;
  let wFrac: number;
  if (k <= RAMP_LENGTH) {
    const t = (k - 1) / (RAMP_LENGTH - 1);
    const pos = t * TIERS.length;
    tierIndex = Math.min(TIERS.length - 1, Math.floor(pos));
    wFrac = Math.min(1, pos - tierIndex);
  } else {
    let r = rng.next();
    tierIndex = 0;
    while (tierIndex < WEIGHTS.length - 1 && r >= WEIGHTS[tierIndex]) r -= WEIGHTS[tierIndex++];
    wFrac = rng.next();
  }
  const tier = TIERS[tierIndex];
  const w = Math.round(tier.w[0] + (tier.w[1] - tier.w[0]) * wFrac);
  const h = Math.round(w * ASPECT);
  return {
    difficulty: tier.label,
    params: {
      w,
      h,
      minLen: tier.minLen,
      maxLen: tier.maxLen,
      straightness: tier.straightness,
      candidates: tier.candidates,
    },
  };
}
