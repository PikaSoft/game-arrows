import { Rng } from '../../../shared/rng';
import { codesScore, codesSpecFor, rateCodes, TUTORIAL_COUNT } from './difficulty';
import { expectedGuesses } from './solver';
import { CodesLevel } from './types';

/** A random code for the size, from the level's own seed. */
export function makeCode(slots: number, colours: number, repeats: boolean, rng: Rng): number[] {
  if (repeats) return Array.from({ length: slots }, () => rng.int(0, colours - 1));
  return rng.shuffle([...Array(colours).keys()]).slice(0, slots);
}

/**
 * Par is the solver's average guesses for the size, rounded up, plus one. It doesn't
 * depend on the code, since any one code can be cracked by a lucky early guess. The extra
 * guess is because the solver keeps every answer in its head, which a person playing on a
 * phone shouldn't have to match for three stars.
 */
export function buildCodesLevel(n: number): CodesLevel {
  const spec = codesSpecFor(n);
  const rng = new Rng(n * 9151 + 7);
  const code = makeCode(spec.slots, spec.colours, spec.repeats, rng);
  const expected = expectedGuesses(spec);
  const score = codesScore(spec);
  return {
    number: n,
    slots: spec.slots,
    colours: spec.colours,
    repeats: spec.repeats,
    code,
    par: Math.ceil(expected) + 1,
    expected,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateCodes(score),
    score,
    tip: spec.tip,
  };
}
