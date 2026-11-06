import { specFor, TUTORIAL_COUNT } from './difficulty';
import { generate } from './generator';
import { Arrow, Cell, Dir, Level } from './types';

/** Build an arrow from "x,y x,y ..." listed tail first, head last. */
function arrow(id: number, path: string, dir: Dir): Arrow {
  const cells: Cell[] = path
    .trim()
    .split(/\s+/)
    .map((p) => {
      const [x, y] = p.split(',').map(Number);
      return { x, y };
    });
  return { id, cells, dir };
}

const HANDMADE: Omit<Level, 'number' | 'difficulty'>[] = [
  {
    w: 4,
    h: 5,
    tip: 'Tap an arrow. If nothing is in its way, it slides off the board.',
    arrows: [arrow(0, '1,1 2,1', 'R'), arrow(1, '2,3 1,3', 'L'), arrow(2, '3,4 3,3', 'U')],
  },
  {
    w: 5,
    h: 5,
    tip: 'Arrows in front block the way. Clear them first.',
    arrows: [
      arrow(0, '0,2 1,2 2,2', 'R'),
      arrow(1, '3,1 3,2 3,3', 'D'),
      arrow(2, '2,4 3,4', 'R'),
      arrow(3, '0,1 0,0', 'U'),
    ],
  },
  {
    w: 5,
    h: 6,
    tip: 'Bent arrows follow their own path out. Only the line ahead of the head matters.',
    arrows: [
      arrow(0, '0,5 1,5 1,4 1,3 1,2', 'U'),
      arrow(1, '3,0 2,0 1,0 0,0', 'L'),
      arrow(2, '4,5 4,4 3,4 3,3 3,2 2,2', 'L'),
      arrow(3, '2,5 3,5', 'R'),
    ],
  },
];

/** Tutorial levels 4 and 5 are small packed boards from fixed seeds. */
const SEEDED_TUTORIALS: { seed: number; w: number; h: number; tip: string }[] = [
  { seed: 4004, w: 5, h: 7, tip: 'Tapping a blocked arrow costs a water drop. Keep all three for 3 stars.' },
  { seed: 5005, w: 6, h: 9, tip: 'Free shows how many arrows can leave right now. Stuck? Tap the bulb for a hint.' },
];

export function isGenerated(n: number): boolean {
  return n > TUTORIAL_COUNT;
}

export function difficultyOf(n: number): Level['difficulty'] {
  return n <= TUTORIAL_COUNT ? 'Tutorial' : specFor(n).difficulty;
}

/** Build level n (1-based). Deterministic: the same n always gives the same board. */
export function buildLevel(n: number): Level {
  if (n <= HANDMADE.length) {
    return { ...HANDMADE[n - 1], number: n, difficulty: 'Tutorial' };
  }
  if (n <= TUTORIAL_COUNT) {
    const t = SEEDED_TUTORIALS[n - HANDMADE.length - 1];
    const g = generate(t.seed, { w: t.w, h: t.h, minLen: 2, maxLen: 5, straightness: 0.6, candidates: 1 });
    return { number: n, w: g.w, h: g.h, arrows: g.arrows, difficulty: 'Tutorial', tip: t.tip };
  }
  const spec = specFor(n);
  const g = generate(n, spec.params);
  return { number: n, w: g.w, h: g.h, arrows: g.arrows, difficulty: spec.difficulty };
}
