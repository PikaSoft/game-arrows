# Pocket Puzzles

A mobile-first collection of puzzle games. The home screen shows a card for each game
with your current level and stars. Sound, vibration and colours are shared by every
game; progress is kept per game. Players who had Arrow Escape before keep their levels,
stars and settings.

| Game | Idea |
| --- | --- |
| Arrow Escape | Tap bent arrows to slide them off a packed board. |
| Sandglass | Pour sand between bottles until each one holds a single colour. |
| Snake | Classic endless snake: eat apples, grow, beat your best. |
| Snake Trails | Snake with walls: eat enough apples to clear each numbered level. |
| Squeeze | Slide blocks of different shapes out through gaps in the frame. |

Ideas for more games, with notes on building each one, are in
[docs/game-ideas.md](docs/game-ideas.md).

## Arrow Escape

The board is packed with bent arrows. Tap an arrow and, if
the straight line ahead of its head is clear to the edge, it slides off the board,
following its own path. Clear every arrow to finish the level.

### Rules

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

### Levels

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

The generator (`src/games/arrows/core/generator.ts`) builds boards backwards. It places arrows one
at a time, each with a clear exit line when placed, so the reverse order is always a
solution. It also keeps every empty cell exposed to an edge, so the grid fills
completely. Neighbouring arrows are then joined into longer snakes where that keeps the
board solvable. Finally a tightening pass turns arrows around one at a time and keeps
each change that leaves the board solvable with fewer arrows free during play, so you
have to work out which arrows unlock others instead of tapping whatever points at the
edge. Each level keeps the best of several candidate boards by that same measure. `src/games/arrows/core/solver.ts` checks solvability exactly. Removing an arrow can
never block another one, so greedy removal is enough.

## Sandglass

Bottles hold stacked layers of coloured sand. Tap a bottle, then tap another to pour
(or drag one onto another). Finish with every bottle empty or full of one colour.

### Rules

- **Pouring:** sand only lands in an empty bottle or on the same colour, and only if
  there is room. A pour moves the whole run of the top colour, as much as fits; the
  rest stays behind.
- **Moves and stars:** each level has a par from the solver. Finish within par for
  three stars, within par + 25% for two, otherwise one. Nothing can fail.
- **Undo:** unlimited and free, but an undone pour still counts as a move.
- **Extra bottle:** once per level you can add an empty bottle. That clear earns two
  stars at most.
- **No moves left:** when no useful pour remains, a card offers Undo, the extra bottle
  (if unused) or a restart.
- **Covered sand:** from level 20, about one level in four has layers shown as "?".
  A layer shows its colour once the sand above it has been poured off (along with any
  matching sand right under it), and stays shown after an undo. Par allows a little
  extra for finding out what is underneath.
- **Liquids:** from level 35, about one level in three (never one with covered sand)
  makes some colours liquid. Liquid is lighter than sand, so in every bottle the sand
  sits below the liquid, and a pour of sand sinks through any liquid to land on the
  sand beneath. Only the top colour pours, sand or liquid. Sand must land on the same
  colour or on the bottom of a bottle (one holding only liquid counts); liquid must
  land on the same liquid or in an empty bottle.

### Levels

Levels 1 to 4 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from 4 to 12 colours over the first 45 or
so levels, then vary. Taller bottles (5 layers from level 25, 6 from level 40) and
levels with only one spare bottle become more common as you go.

The generator (`src/games/sandglass/core/levels.ts`) deals the sand into the bottles
at random, rejects deals that are already partly sorted, and keeps only boards the
solver can finish. The solver (`src/games/sandglass/core/solver.ts`) is an A* search
whose estimate (runs of sand beyond one per colour) never overestimates, so its answer
is the shortest one; on very big boards it falls back to a faster weighted search that
may be a move or two longer.

The difficulty label is measured like Arrow Escape's. The solver plays the level
through and at every step tries each useful pour to see whether the board can still
be solved afterwards. A player trying pours at random would make
(pours + 1) / (safe pours + 1) attempts to find a safe one. The label comes from the
average over the level, and each level keeps the hardest of several candidate boards:

| Label | Attempts per move |
| --- | --- |
| Easy | under 1.07 |
| Medium | 1.07 to 1.18 |
| Hard | 1.18 to 1.3 |
| Super Hard | 1.3 or more |

The numbers sit close to 1 because with a spare bottle or two most pours are
recoverable; the hard levels are the ones where a wrong pour really does lock the
board. Hover the label in game to see the number.

## Snake and Snake Trails

Two games that share one engine (`src/games/snake/`). Swipe anywhere on the board to
steer (one drag can make several turns), or use the arrow keys or WASD. Space or P
pauses; the game also pauses when a card opens or the tab is hidden.

### Rules

- **Moving:** the snake moves one cell per step. Turning straight back is ignored, and
  up to two quick turns are remembered, so a fast U-turn works.
- **Eating:** each apple adds one cell. Three apples are on the board at once; each
  one eaten is replaced on a random empty cell.
- **Poison:** one poison berry sits on the board. Every 24 steps it jumps to the cell
  your tail just left (or a clear cell beside the tail), and it flickers for the last
  3 steps before it moves. It never lands on an apple or next to your head.
- **Crashing:** the edge of the board, walls, the poison and your own body end the run. Moving into
  the cell your tail is leaving is fine, unless you are growing on that step.

### Snake

Endless. Pick Slow, Normal or Fast on the home screen; the speed creeps up every 5
apples. The best score is kept per speed, along with your longest snake.

### Snake Trails

Each level sets a number of apples to eat. Finish within par for three stars, within
1.5 times par for two, otherwise one. A crash means trying the level again.

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same walls and the same apples. Boards grow from 12 to 20 cells wide,
with more apples, more wall pieces and a faster snake over the first 30 levels, then
vary. Wall pieces (bars, L shapes, pillars and blocks) are placed with mirror or
rotational symmetry, and a layout is kept only if every open cell can be reached and
the snake starts with at least 5 clear cells ahead. Par allows about half the board's
width plus height in steps per apple. The difficulty label blends speed, apple count
and how much of the board is wall.

## Squeeze

The board is a framed grid with one or more gaps cut into the frame, and it is packed
with blocks of different shapes. Drag a block and it follows your finger one cell at a
time, as far as the way is clear. Pull it through a gap it fits and it slides out. Clear
every block to finish.

### Rules

- **Fitting:** shapes never turn. A block fits through a gap only if every column it
  covers (for a gap in the top or bottom) or every row it covers (left or right) lies
  inside the gap, and nothing stands between it and the gap.
- **Gaps light up** while you drag a block that fits them.
- **Tap to send out:** tapping a block that is already lined up with a clear gap sends
  it out.
- **Moves and stars:** one drag is one move, however far the block goes and however
  many turns it takes, including a drag that ends with the block leaving. Each level
  has a par from the solver. Finish within par for three stars, within par + 25% for
  two, otherwise one. Every move can be reversed, so nothing can fail.
- **Undo:** unlimited and free, but an undone move still counts.
- **Coloured gates:** from level 20, about one level in three has gaps marked with a
  dashed bar in a colour. A coloured gate only lets blocks of its colour through; plain
  gaps take any block.

### Levels

Levels 1 to 5 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from 5x5 to 8x8 over the first 35 levels,
then vary; L, T, S and Z shapes join at level 9, and five and six cell shapes at level 30.

The generator (`src/games/squeeze/core/levels.ts`) cuts the gaps, scatters blocks at
random until roughly three quarters of the board is covered (each block must fit at
least one gap), and keeps only boards the solver can clear. The solver
(`src/games/squeeze/core/solver.ts`) is a breadth-first search where one move takes a
block anywhere it can slide to, or out, so its answer is the shortest. Whenever some
block can leave, it only tries that: taking a block out never blocks anything else, so
it is always at least as good. The work per level is capped by solver states, not by
time, so every device builds the same board.

The difficulty label counts setup moves: moves in the shortest solution that do not
take a block out. Every block costs one move to leave; anything beyond that is a block
that has to be shifted out of the way first, which is the part that takes thought.
Each level aims for a setup count that ramps up from 1 to about 6 over the first 35
levels and then varies, with the odd easier breather:

| Label | Setup moves |
| --- | --- |
| Easy | 0 or 1 |
| Medium | 2 or 3 |
| Hard | 4 or 5 |
| Super Hard | 6 or more |

Hover the label in game to see the number.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (generators, solvers, rules)
npm run build    # production build in dist/
```

Built with Vite, TypeScript and Canvas 2D. There are no runtime dependencies. Progress
and settings are stored in the browser's localStorage (`arrow-escape.v1`,
`sandglass.v1`, `snake.v1`, `snake-trails.v1`, `squeeze.v1` and `pocket-puzzles.settings.v1`).

### Layout

```
src/main.ts            the collection: home screen, routing (#/arrows, #/sandglass, #/snake, #/snake-trails, #/squeeze), settings
src/shared/            sound, themes, icons, update check, seeded RNG, worker level loader
src/games/arrows/      Arrow Escape: core rules, generator and solver, rendering, input, UI
src/games/sandglass/   Sandglass: the same split
src/games/snake/       Snake and Snake Trails: rules, level builder, renderer, swipe input, UI
src/games/squeeze/     Squeeze: the same split as Sandglass
```

Each game exports a `GameModule` (`src/games/types.ts`): it builds its own screens and
gets shared services (modal, toast, theme, sound) from the shell. Adding a game means
adding a folder and one line in `src/main.ts`.

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
