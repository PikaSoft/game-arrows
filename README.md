# Arrow Escape

A mobile-first puzzle game. The board is packed with bent arrows. Tap an arrow and, if
the straight line ahead of its head is clear to the edge, it slides off the board,
following its own path. Clear every arrow to finish the level.

## Rules

- **Blocked taps** bounce the arrow back and cost one of three hearts.
- **Out of hearts:** keep going for no stars, or restart.
- **Stars** equal the hearts left when the board is cleared.
- **Auto-finish:** once every remaining arrow is free, the rest leave on their own.
- **Hints:** 3 per level. Each one highlights an arrow that can leave now (preferring
  one that unblocks others).
- **HUD:** shows how many arrows are free right now and how many are left, plus a timer
  (best times are saved).
- **Big boards:** pinch or scroll to zoom, drag to pan, and the corner button re-fits
  the board.

## Levels

Levels 1 to 5 are tutorials. After that, levels are generated from the level number as
the seed, so level N is the same board for everyone. Generated levels ramp up over the
first 30, then vary, with bigger boards most common.

The difficulty label is measured from the finished board, not from its size. The
solver plays the level through and, at each step, works out how many arrows a player
checking at random would look at before finding one that can leave:
(arrows left + 1) / (free arrows + 1). The label comes from the average over the
level, ignoring the auto-finish at the end:

| Label | Arrows checked per move |
| --- | --- |
| Easy | under 4.5 |
| Medium | 4.5 to 6.5 |
| Hard | 6.5 to 8.5 |
| Super Hard | 8.5 or more |

This blends the two obvious measures. A raw count of free moves alone would call big
boards easy, since they always have more free arrows in absolute terms. A percentage
alone would treat 1 free arrow out of 5 the same as 20 out of 100, though the small
board is far quicker to scan. Hover the label in game to see the number.

The generator (`src/core/generator.ts`) builds boards backwards. It places arrows one
at a time, each with a clear exit line when placed, so the reverse order is always a
solution. It also keeps every empty cell exposed to an edge, so the grid fills
completely. Neighbouring arrows are then joined into longer snakes where that keeps the
board solvable. Finally a tightening pass turns arrows around one at a time and keeps
each change that leaves the board solvable with fewer arrows free during play, so you
have to work out which arrows unlock others instead of tapping whatever points at the
edge. Each level keeps the best of several candidate boards by that same measure. `src/core/solver.ts` checks solvability exactly. Removing an arrow can
never block another one, so greedy removal is enough.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (generator, solver, rules)
npm run build    # production build in dist/
```

Built with Vite, TypeScript and Canvas 2D. There are no runtime dependencies. Progress
and settings are stored in the browser's localStorage.

## Deploying

`.github/workflows/pages.yml` tests, builds and publishes to GitHub Pages on every push
to `main`. To enable it, go to **Settings → Pages** in the repo and set **Source** to
**GitHub Actions**.

### Update prompt

Each build gets an id (the commit SHA in CI, a timestamp locally). It is baked into the
game and also written to `dist/version.json`. The running game fetches `version.json` on
start, when the tab comes back into view and every 15 minutes. If the live id differs
from its own, a banner offers to reload to the new version. The check is off in
`npm run dev`.
