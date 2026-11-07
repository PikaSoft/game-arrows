import { Rng } from '../../../shared/rng';
import { rateStars, starsSpecFor, TUTORIAL_COUNT } from './difficulty';
import { growRegions, placeStars, repair } from './layout';
import { rate, search } from './solver';
import { StarsLevel } from './types';

/**
 * Place stars, grow regions round them, then nudge the region borders until the stars are
 * the only answer. Keep only boards the reasoning solver can finish without guessing, and
 * of those the one whose score is closest to the level's target. Work is capped by
 * attempts, not time, so every device builds the same board.
 */
export function buildStarsLevel(n: number): StarsLevel {
  const spec = starsSpecFor(n);
  const rng = new Rng(n * 27449 + 13);
  let best: { regions: number[]; stars: number[]; score: number } | null = null;
  let found = 0;
  const maxAttempts = spec.per === 2 ? 1500 : 800;
  // Two-star boards are slow to find (about one try in sixty works), so take the first.
  const enough = spec.per === 2 ? 1 : 6;
  for (let attempt = 0; attempt < maxAttempts && found < enough; attempt++) {
    const stars = placeStars(spec.size, spec.per, rng);
    if (!stars) continue;
    const grown = growRegions(spec.size, spec.per, stars, rng);
    if (!grown) continue;
    const b = repair(grown, stars, rng, (bb) => {
      const s = search(bb, 2, 300000);
      return s.exhausted ? null : s.all;
    }, 200);
    if (!b) continue;
    const r = rate(b);
    if (!r.solved) continue;
    found++;
    if (!best || Math.abs(r.score - spec.target) < Math.abs(best.score - spec.target)) best = { regions: b.regions, stars: stars.slice().sort((a, c) => a - c), score: r.score };
  }
  if (!best) throw new Error(`no Star Battle board for level ${n}`);
  const score = Math.round(best.score * 100) / 100;
  return {
    number: n,
    size: spec.size,
    per: spec.per,
    regions: best.regions,
    stars: best.stars,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateStars(score),
    score,
    tip: spec.tip,
  };
}
