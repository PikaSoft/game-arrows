# Game ideas

Ideas for new games in Pocket Puzzles, with notes on how to build each one in this
codebase. Every game here suits how the collection already works: one-thumb play on a
phone, level N built from N as the seed, a solver that proves each board can be
finished and measures its difficulty, and stars, hints and best times kept per game.

The names are working titles. Every game is a general genre, so build original rules
and art for each one and don't copy a specific existing game.

## Contents

| # | Game | Kind | Fit | Effort | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | ~~[Pipe Link](#1-pipe-link)~~ | Rotate tiles | Closest | Small | **Built** (`src/games/pipes/`) |
| 2 | ~~[Colour Lines](#2-colour-lines)~~ | Join dots | Closest | Medium | **Built** (`src/games/lines/`) |
| 3 | ~~[Crate Push](#3-crate-push)~~ | Push puzzle | Closest | Medium to large | **Built** (`src/games/crates/`) |
| 4 | ~~[Light Switch](#4-light-switch)~~ | Toggle grid | Closest | Small | **Built** (`src/games/lights/`) |
| 5 | ~~[Ice Slide](#5-ice-slide)~~ | Slide to exit | Closest | Small | **Built** (`src/games/ice/`) |
| 6 | ~~[Picture Grid](#6-picture-grid)~~ | Deduction | Logic | Medium | **Built** (`src/games/picture/`) |
| 7 | ~~[Number Place](#7-number-place)~~ | Deduction | Logic | Medium | **Built** (`src/games/numbers/`) |
| 8 | ~~[Tents and Trees / Star Battle](#8-tents-and-trees--star-battle)~~ | Deduction | Logic | Medium | **Both built** (`src/games/tents/`, `src/games/stars/`) |
| 9 | ~~[Hidden Mines](#9-hidden-mines)~~ | Deduction | Logic | Medium | **Built** (`src/games/mines/`) |
| 10 | ~~[Brick Breaker](#10-brick-breaker)~~ | Arcade | Arcade | Medium | **Built** (`src/games/bricks/`) |
| 11 | ~~[Stack Tower](#11-stack-tower)~~ | Arcade | Arcade | Small | **Built** (`src/games/stack/`) |
| 12 | ~~[Lane Dodger](#12-lane-dodger)~~ | Arcade | Arcade | Small to medium | **Built** (`src/games/lanes/`) |
| 13 | ~~[Merge Tiles](#13-merge-tiles)~~ | Endless | Number | Small | **Built** (`src/games/merge/`) |
| 14 | ~~[Word Grid](#14-word-grid)~~ | Word | Word | Medium to large | **Built** (`src/games/words/`) |
| 15 | ~~[Colour Loop](#15-colour-loop)~~ | Sort on a belt | Arcade | Medium | **Built** (`src/games/loop/`) |
| 16 | ~~[Fruit Drop](#16-fruit-drop)~~ | Drop and merge | Arcade | Small to medium | **Built** (`src/games/fruit/`) |

Effort is a rough guide next to Squeeze: small is under half of its code, large is
more than all of it.

**Top picks**

- **Colour Lines** and **Crate Push** are most like Arrow Escape and Squeeze, and the
  generator, solver and difficulty code carries over best.
- **Picture Grid** adds a new kind of thinking (deduction rather than spotting free
  moves) and keeps players coming back.
- **Stack Tower** is the cheapest way to add a quick arcade game beside Snake.

---

## Adding any game: the common checklist

Every game below follows these steps. The per-game sections only cover what differs.

### 1. Folder

Copy the split Squeeze and Sandglass use:

```
src/games/<id>/
  core/types.ts        level and state types, Difficulty
  core/rules.ts        pure rules: legal moves, applying a move, win check
  core/solver.ts       search, returns the shortest or a rated solution
  core/difficulty.ts   TUTORIAL_COUNT, spec for level N, thresholds, rate()
  core/levels.ts       tutorials plus build<Name>Level(n)
  game/session.ts      one level being played: moves, undo, hints, stars
  game/storage.ts      progress in localStorage under "<id>.v1"
  game/levelWorker.ts  calls build<Name>Level in a worker
  render/renderer.ts   Canvas 2D drawing using the shared Theme
  ui.ts                screens, input, modals, exports create<Name>(shell): GameModule
```

`core/` must not touch the DOM, time or `Math.random`. That keeps it testable and the
same on every device.

### 2. Levels from the seed

- Use `Rng` from `src/shared/rng.ts`, seeded with the level number, for every random
  choice. Never use `Math.random` in `core/`.
- Hand-write the first few tutorial levels in `core/levels.ts`, then generate.
- Cap solver work by a count of states, not by time (as Squeeze does), so slow phones
  build the same board as fast ones.
- Build levels through `LevelSource` (`src/shared/levelSource.ts`) with a worker
  (`game/levelWorker.ts`) so big boards never freeze the screen.

### 3. Difficulty and stars

- Measure difficulty from the finished board, not its size, as Arrow Escape and Squeeze
  do. Put the thresholds in `core/difficulty.ts`, use the shared labels (Easy, Medium,
  Hard, Super Hard) and show the raw number when the label is hovered.
- For move-based puzzles use the house rule: par from the solver, three stars within
  par, two within par + 25%, one otherwise.
- Ramp the spec over roughly the first 30 to 45 levels, then vary it with the odd
  easier breather.

### 4. Hooking it up

- Export a `GameModule` (`src/games/types.ts`) from `ui.ts` and add one line to the
  `games.push(...)` list in `src/main.ts`. Add the route `#/<id>`.
- Add an icon to `src/shared/icons.ts` and use the shared theme colours so all themes
  and dark mode work.
- Use `shell.sfx`, `shell.vibrate`, `shell.toast` and `shell.openModal`; don't build
  your own.
- `leave()` must stop every timer and `requestAnimationFrame` loop.

### 5. Tests and docs

- Add `tests/<id>.test.ts` covering at least: the rules on small hand-made boards, the
  solver on a known puzzle, that levels 1 to 60 all build, are solvable and are the same
  when built twice, and storage round trips.
- Run `npm test` and `npm run build` before pushing.
- Add the game to the table at the top of `README.md`, give it its own section (rules,
  levels, how difficulty is measured), and list its storage key under Development.

---

## 1. Pipe Link

> **Built.** Pipe Link is in the collection (`src/games/pipes/`, route `#/pipes`). See the
> Pipe Link section of the README for how it ended up working. The main differences from
> the plan below: taps only turn clockwise, a long-press (or right-click) locks a tile,
> and the difficulty label is measured in waves of deduction like Arrow Escape's, since
> the edge rule alone solves almost every board and so could not tell them apart.
> Wrap-around boards are not built yet.

**Idea.** A grid of pipe tiles (straight, corner, T, cross, end caps). Tap a tile to
turn it 90 degrees. Connect the source to every outlet with no loose ends.

**Rules**

- Tap rotates clockwise. Optionally long-press rotates the other way.
- Solved when every tile connects only to matching neighbours and everything is joined
  to the source. Water fills the pipes live as they connect, which shows progress.
- Stars from par: the fewest taps needed (sum over tiles of turns from the start to the
  solved rotation).

**Generator**

1. Grow a random spanning tree over the grid from the source (randomised Prim's or a
   random walk). Tree edges become pipe openings; leaves are outlets.
2. Each cell's openings define its tile type.
3. Scramble: give each tile a random rotation. Make sure most tiles start wrong.
4. Check there is only one solution, because some tiles (straights, crosses) can look
   right in more than one way. Easiest: run the logic solver below; if it can't finish
   without guessing, reject and try again.

**Solver and difficulty**

- A constraint solver: for each tile keep the set of rotations that are still possible;
  an edge that faces the border must be closed; a tile's opening must match its
  neighbour's. Repeat until nothing changes.
- Difficulty: how many passes the solver needs, or how many tiles can't be fixed from
  their immediate neighbours alone. Bigger boards add a wrap-around mode later
  (edges join the far side) as a "Super Hard" twist.

**Rendering and input.** One tap per tile, no drag. Animate the rotation (about 120 ms)
and the water spreading.

**Watch out for.** Straight tiles have two rotations that look the same, and crosses
have four; count turns to the nearest correct one when working out par.

---

## 2. Colour Lines

> **Built.** Colour Lines is in the collection (`src/games/lines/`, route `#/lines`). See
> the Colour Lines section of the README for how it ended up working. The main
> differences from the plan below: cutting one long random path into pieces almost never
> gave a board with one solution, so the generator instead grows paths by joining
> neighbouring ones and never lets a path run alongside itself. Nearly every board made
> that way has exactly one solution. The label measures how many line ends you check for
> each one with only one way to go, like Arrow Escape's, rather than counting guesses.

**Idea.** Pairs of coloured dots on a grid. Draw a path between each pair. Paths can't
cross, and the finished board must cover every cell.

**Rules**

- Drag from a dot to draw; drawing over another colour's path cuts it back.
- Solved when every pair is joined and every cell is filled.
- Stars: no par needed. Three stars for no hints and no restarts, fewer for each hint.
  Best time is saved.

**Generator**

1. Fill the grid with random non-overlapping paths: start with a random Hamiltonian-ish
   walk (or start with every cell its own path and merge neighbours), then cut it into
   paths of length 3 or more.
2. Keep only the two ends of each path as dots.
3. Run the solver; keep only boards with exactly one solution. Many random boards have
   several, so expect lots of retries on bigger grids.

**Solver and difficulty**

- Backtracking search on paths with strong pruning: a cell with only one way in must
  be used that way, no isolated empty pocket, no colour cut off from its partner.
- Uniqueness: search for a second solution after the first; stop as soon as one is
  found.
- Difficulty: how many times the solver must guess (branch) before the forced moves
  finish it. Zero guesses is Easy.

**Rendering and input.** Thick rounded strokes; the cell under the finger shows a
glowing dot so the finger doesn't hide where you are. Snap to cell centres.

**Watch out for.** Uniqueness checking dominates generation time on 9x9 and up: cap
by solver states and fall back to a smaller board if needed, as Squeeze does.

---

## 3. Crate Push

> **Built.** Crate Push is in the collection (`src/games/crates/`, route `#/crates`). See
> the Crate Push section of the README for how it ended up working. It follows the plan
> below closely. The main difference: rather than pulling crates at random and solving
> forward, the generator pulls backward from solved to every reachable position at
> once, which gives each position's exact par with no forward search. Rooms are cropped
> to their floor, and the label's extra-push count is always even (a crate that goes out
> of its way has to come back), so the bands are 0 to 2, 4 to 6, 8 to 10 and 12 or more.

**Idea.** A worker in a small warehouse pushes crates onto marked spots. Crates can only
be pushed, never pulled, one at a time.

**Rules**

- Swipe or tap a neighbouring cell to step; walking into a crate pushes it if the cell
  beyond is free.
- Tap any reachable floor cell to walk there along the shortest path (doesn't count as
  a move, only pushes count).
- Unlimited undo, as in Sandglass. Pushes count toward par even if undone.
- Stars from par on pushes.

**Generator** (build it backwards, like Arrow Escape)

1. Carve a room: random walls in a small grid, keep it connected.
2. Place crates on their targets.
3. Play backwards: the worker *pulls* crates around randomly for many steps. Every
   state reached by pulling can be solved by pushing in reverse, so the level is always
   solvable.
4. Score the result with the forward solver (below) and keep the hardest of several
   candidates, as Arrow Escape does.

**Solver and difficulty**

- Breadth-first search over (crate positions, worker region) where one move is one
  push. Treat the worker's position as "which connected area it can reach", which
  shrinks the search a lot.
- Prune dead states: a crate in a corner that isn't a target, or two crates side by
  side against a wall.
- Difficulty: pushes in the shortest solution minus the sum of crate-to-target
  distances (the extra work beyond the obvious), similar to Squeeze's "setup moves".

**Rendering and input.** Top-down tiles; animate the worker step by step when walking a
path. A "stuck" card (like Sandglass's) when the solver sees no way out from here.

**Watch out for.** Search size blows up with crate count. Keep 2 to 5 crates and rooms
of about 8x8; cap by states.

---

## 4. Light Switch

> **Built.** Light Switch is in the collection (`src/games/lights/`, route `#/lights`).
> See the Light Switch section of the README for how it ended up working. It follows the
> plan below, with two of the twists in: corner taps (from level 15) and three-step
> lights (from level 30). Whole-row taps are not built. Every board shape tried has at
> most 8 free choices, so the solver always finds the true fewest taps. Hints point at a
> tile rather than tapping it, and cost a star.

**Idea.** A grid of lights. Tapping one toggles it and its four neighbours. Turn every
light off.

**Rules**

- Stars from par: the fewest taps (from the solver). Tapping the same tile twice undoes
  it, so the shortest answer never taps a tile twice.
- Later twists: tapping toggles a different pattern (diagonals, a whole row), or three
  states that cycle instead of on and off.

**Generator**

1. Start from all off.
2. Tap a random set of tiles (using the seeded `Rng`). The resulting board is always
   solvable by tapping the same set.
3. Rate it with the solver; regenerate if par is too low for the level.

**Solver and difficulty**

- Solve exactly with linear algebra over GF(2) (Gaussian elimination on a matrix where
  each tap is a column). Where there is more than one solution, pick the one with
  fewest taps by trying the free variables (there are few).
- Difficulty: par, scaled by board size. "Light chasing" (solve row by row) works on
  any board, so the label measures length more than insight; add the pattern twists to
  keep later levels fresh.

**Rendering and input.** One tap per tile; a ripple animation to the neighbours.

**Watch out for.** Some grid sizes (e.g. 4x4, 5x5) have boards with no solution. That
can't happen here because boards are built by tapping, but keep the generator that way.

---

## 5. Ice Slide

> **Built.** Ice Slide is in the collection (`src/games/ice/`, route `#/ice`). See the
> Ice Slide section of the README for how it ended up working. It follows the plan
> below, with holes (from level 12) and two pucks that slide together (from level 25).
> One-way arrows and keys and doors are not built. A puck that slides over a hole wastes
> the swipe rather than ending the level, so nothing can fail. Each puck has its own
> flag and must stop exactly on it.

**Idea.** A token on an icy grid slides in the swiped direction until it hits a wall or
a rock. Reach the exit.

**Rules**

- Swipe to slide. Optional later pieces: holes that end the level, one-way arrows,
  keys and locked doors, or several tokens moving together on the same swipe.
- Stars from par: the fewest swipes.

**Generator**

1. Scatter rocks at random on a grid with a border.
2. Breadth-first search from the start over stopping points; pick as the exit the
   reachable cell with the longest shortest path (or one of the longest).
3. Reject boards where par is outside the target for the level.

**Solver and difficulty**

- Plain breadth-first search over stopping cells, four moves each. Tiny state space,
  so it's instant even on big boards.
- Difficulty: par, plus how many "dead" stopping cells (from which the exit can't be
  reached) are near the start. Dead ends punish the obvious first move.

**Rendering and input.** Reuse Snake's swipe input (`src/games/snake/input/swipe.ts`).
Animate the slide with a short ease-out.

**Watch out for.** With multiple tokens the state space grows fast; keep it to two.

---

## 6. Picture Grid

> **Built.** Picture Grid is in the collection (`src/games/picture/`, route `#/picture`).
> See the Picture Grid section of the README for how it ended up working. It follows the
> plan below, with hearts and a Fill / Cross switch instead of tapping to cycle, since
> every mark is checked at once and can't be changed. Boards stop at 12x13, which fits a
> phone without zooming, so the zoom camera wasn't needed. There are 13 hand-drawn
> pictures (3 tutorials and 10 for every tenth level); two of the first drafts (a rocket
> and a key) turned out to have more than one answer and were redrawn or replaced.

**Idea.** A grid with number clues on each row and column giving the runs of filled
cells in order. Fill cells to reveal a picture.

**Rules**

- Tap to fill, tap again to mark as empty (an X), tap again to clear. Drag to paint a
  line in one go.
- Mistakes: either check against the answer and cost a heart (like Arrow Escape), or
  allow free play with a check button. Hearts fit the collection better.
- Stars from hearts left, like Arrow Escape. Best time is saved.

**Generator**

- Two options: generated random pictures, or a hand-drawn set of pictures. Random
  pictures are less satisfying, so a mix works best: tutorials and every tenth level
  from a small hand-made set in `core/levels.ts`, the rest generated.
- Random: fill cells with a smoothed noise pattern (so it looks like blobs, not static)
  at 50 to 60 percent density.
- Keep only boards the line solver can finish without guessing.

**Solver and difficulty**

- Line solver: for each row or column, list every placement of the runs that matches
  what's known, and mark cells that are the same in all of them. Repeat across rows and
  columns until nothing changes. If the grid is complete, it's solvable without
  guessing.
- Difficulty: the number of passes needed, and how many cells needed overlap with
  information from a crossing line (rather than being forced by a single line).

**Rendering and input.** The clues take space on a small screen: use the zoom and pan
camera from Arrow Escape (`src/games/arrows/render/camera.ts`) for boards over 10x10.
Grey out a clue once its line is done.

**Watch out for.** Listing placements naively is slow for 20-cell lines; use the
standard left-most and right-most placement trick or a small dynamic programme.

---

## 7. Number Place

> **Built.** Number Place is in the collection (`src/games/numbers/`, route `#/numbers`).
> See the Number Place section of the README for how it ended up working. It follows the
> plan below, with 6x6 boards as the quick variant (extra regions are not built). Puzzles
> that need triples or X-wings turned out too rare to find by random removal, so the top
> tier starts at naked and hidden pairs. Clues come out in mirrored pairs at first, then
> one at a time on later tries, which leaves more room for hard puzzles.

**Idea.** A 9x9 grid split into nine 3x3 boxes. Fill digits 1 to 9 so each row, column
and box holds each digit once.

**Rules**

- Tap a cell, then a digit. Pencil marks mode for small candidate digits.
- Hearts for wrong digits, as with Picture Grid. Hints reveal one cell, preferring one
  the next technique would find.
- Stars from hearts left. Later variants: 6x6 for quick play, or extra regions.

**Generator**

1. Build a full valid grid: backtracking with the seeded `Rng` picking the digit order.
2. Remove clues one at a time in random order, keeping each removal only if the puzzle
   still has exactly one solution.
3. Rate with the technique solver and keep the board if it matches the level's target.

**Solver and difficulty**

- Two solvers: a fast backtracking one (bitmasks) for checking uniqueness, and a
  "human" one that applies techniques in order of difficulty (single candidates,
  hidden singles, pairs, pointing, X-wing and so on).
- Difficulty: the hardest technique needed. That matches how players feel difficulty
  better than clue count does.

**Rendering and input.** Big digit pad under the board; highlight the row, column, box
and all cells with the same digit.

**Watch out for.** Generating hard puzzles takes many attempts. Cap by solver work and
accept the closest match.

---

## 8. Tents and Trees / Star Battle

> **Star Battle is built too** (`src/games/stars/`, route `#/stars`). Randomly grown
> regions almost never give one answer, so the generator repairs them: while a second
> answer exists, it hands one of that answer's stars to a neighbouring region (the
> intended stars never move). It uses Picture Grid's controls (a Star / Dot switch,
> painting and long press), and squares round a star and the rest of a finished row,
> column or region fill with dots by themselves. One star each on 5x5 to 9x9 grids; two
> each on 10x10 from level 35.
>
> **Tents and Trees is built** (`src/games/tents/`, route `#/tents`). See the Tents and Trees section of the README for how it ended up
> working. It plays like Picture Grid (a Tent / Grass switch, hearts, finished lines fill
> themselves). Squares with no tree beside them, and rows or columns with no tents,
> start as grass. Uniqueness is checked by a backtracking search over the squares beside
> trees (with a tent-to-tree pairing check at the end), and boards are kept only if a
> reasoning solver can finish them without guessing. Star Battle could reuse the same
> UI and the wave-based rating.

Two small-grid logic games that play well in short sessions. Build one first; they can
share most of the code.

**Tents and Trees.** Place a tent next to each tree (up, down, left or right). Tents
never touch each other, even diagonally. Numbers on each row and column say how many
tents it holds.

**Star Battle.** The grid is split into regions. Place stars so each row, column and
region has exactly one (or two, on bigger boards), and no two stars touch.

**Rules (both)**

- Tap to place, tap again to mark empty, tap again to clear.
- Hearts for wrong placements, or a free check button; stars from hearts left.

**Generator**

- Tents: place tents at random (not touching), give each a tree next to it, compute row
  and column counts, then check uniqueness.
- Star Battle: place stars first (a valid non-touching layout), grow random regions
  around each, then check uniqueness. Reshuffle region borders until it's unique.

**Solver and difficulty**

- A deduction solver much like Picture Grid's: apply simple rules repeatedly (a full
  row's other cells are empty, a region with one free cell must be a star, cells next
  to a star are empty), then pairs and region overlaps.
- Difficulty: the hardest rule needed, as in Number Place.

**Watch out for.** Uniqueness again dominates generation time; keep boards 6x6 to 10x10.

---

## 9. Hidden Mines

> **Built.** Hidden Mines is in the collection (`src/games/mines/`, route `#/mines`). See
> the Hidden Mines section of the README for how it ended up working. Instead of a
> pulsing start square, the start area opens by itself, so there is no first tap to get
> wrong. Long press flags (the same gesture as Picture Grid's cross), with a Reveal /
> Flag switch for those who prefer taps, and tapping a number whose mines are flagged
> opens the rest around it. Boards that would need a guess are simply rejected, which
> was fast enough that moving mines wasn't needed.

**Idea.** A grid hides mines. Revealing a cell shows how many of its eight neighbours
are mines. Reveal every safe cell. The selling point: every board can be finished
without guessing.

**Rules**

- Tap to reveal, long-press to flag. The first tap is always safe and opens an area.
- Hitting a mine costs a heart (instead of ending the game). Stars from hearts left.
- Best time is saved.

**Generator**

1. Fix the first tap position for the level (from the seed), so level N is the same
   for everyone.
2. Place mines at random, leaving the first tap and its neighbours clear.
3. Run the no-guess solver from the first tap. If it gets stuck, move a mine near the
   stuck frontier or reject and try again.

**Solver and difficulty**

- Simple rules first (a number equal to its covered neighbours means all are mines; a
  number equal to its flags means the rest are safe). Then subset rules between two
  numbers. Then, if needed, a small exact search over the frontier.
- Difficulty: how often the solver needs subset rules or frontier search rather than
  the simple rules, plus mine density.

**Rendering and input.** Long-press must not conflict with page scroll or zoom; reuse
the gesture handling from `src/games/arrows/input/gestures.ts`. A flag/reveal toggle
button helps players who dislike long-press.

**Watch out for.** Because the first tap is fixed, show where to start (a pulsing cell)
so the player doesn't tap elsewhere and lose a heart.

---

## 10. Brick Breaker

> **Built.** Brick Breaker is in the collection (`src/games/bricks/`, route `#/bricks`).
> See the Brick Breaker section of the README for how it ended up working. It follows the
> plan below. Two things the plan didn't foresee: at first a level took a simulated
> player three to six minutes, so walls were capped at six rows and the ball sped up;
> and a brick boxed in between steel and the side wall could take ages to reach, so
> steel is never placed where it would do that. The "sealed off" check also had to allow
> for the wall spanning the full width (the ball only gets in from below, or over the top
> once it breaks through). Instead of a fixed time step per frame, the sim runs at 240
> small steps a second, which is enough that the ball can't skip through a brick.

**Idea.** A paddle at the bottom, a ball, and rows of bricks. Clear every brick in each
numbered level.

**Rules**

- Drag anywhere to move the paddle. Three lives per level, and stars from lives left
  (like hearts in Arrow Escape). Losing every life means trying the level again, as a
  crash does in Snake Trails.
- Bricks that take several hits, unbreakable bricks, and later power-ups (wider paddle,
  slower ball, multi-ball).

**Generator**

- Layouts from the seed: symmetrical patterns look best, so generate half the grid and
  mirror it. Raise rows, hit counts and ball speed with the level number.
- No solver needed; instead check a level has no brick that's sealed off by unbreakable
  ones.

**Simulation.** Put the physics in `core/sim.ts` with a fixed time step, as Snake does
with `step()`. The UI loop runs `step()` as many times as needed per frame, so the game
plays the same at 60 Hz and 120 Hz. Use swept collision (move the ball along its path,
not by jumps) so fast balls don't pass through bricks.

**Difficulty.** Ball speed, brick count and the share of tough bricks, blended like
Snake Trails' label.

**Watch out for.** Ball angles that go almost flat bounce forever; clamp the angle off
the paddle.

---

## 11. Stack Tower

> **Built.** Stack Tower is in the collection (`src/games/stack/`, route `#/stack`). See
> the Stack Tower section of the README for how it ended up working. It follows the plan
> below, including reading the block's position at the tap's own timestamp. The block's
> position is a function of time since it appeared, so the rules stay pure and the tests
> can drop it at exact spots. It uses a flat side view.

**Idea.** A block slides back and forth above the tower. Tap to drop it. Any part hanging
over the block below is cut off and falls. The tower gets narrower as you miss.

**Rules**

- Endless with a best score (height), like Snake. A near-perfect drop (within a few
  pixels) snaps to perfect, and a streak of perfect drops grows the block back a little.
- The slide speeds up slowly with height.

**Generator.** None needed. Use `Rng` seeded per run only for colours and which side
the block enters from.

**Simulation.** A tiny `core/sim.ts`: the moving block's position and width, the stack,
and `drop()` which returns the new width and the cut-off piece. Keep timing in the UI
and the rules pure, so tests can call `drop()` at given positions.

**Rendering.** Side view or a slight isometric view. The camera scrolls up as the tower
grows. The falling cut-off piece is a nice touch with a short gravity animation.

**Watch out for.** Taps on phones have some lag; measure the block's position at the
tap event's timestamp, not when the frame draws.

---

## 12. Lane Dodger

> **Built.** Lane Dodger is in the collection (`src/games/lanes/`, route `#/lanes`). See
> the Lane Dodger section of the README for how it ended up working. It follows the plan
> below, including the 80 ms grace window. Three things a planning test player turned
> up: each pattern has to be checked at the speed the player will be going when they
> reach it, not the speed when it's laid (it's laid 40 rows ahead, and speed rises); the
> runner's collision length has to be short enough that the generator's whole-row model
> holds; and 15 x 0.2 rounding up to 4 in floats.

**Idea.** A runner moves forward in three lanes. Swipe left or right to change lanes and
dodge obstacles; swipe up to jump low ones.

**Rules**

- Endless with a best distance, like Snake. Coins along the way for a second score.
- Speed rises slowly. Patterns of obstacles get tighter.

**Generator**

- Build the course in chunks from a list of hand-designed obstacle patterns, picked by
  `Rng`. Each chunk must leave at least one lane passable at the current speed; check
  this when the chunk is chosen (a tiny search over lane and time).

**Simulation.** Fixed step in `core/sim.ts`. Reuse Snake's swipe input.

**Rendering.** A simple top-down or low-angle 2D view on Canvas; no 3D needed.

**Watch out for.** A swipe that arrives just after a collision feels unfair; give a
short grace window (about 80 ms) for lane changes.

---

## 13. Merge Tiles

> **Built.** Merge Tiles is in the collection (`src/games/merge/`, route `#/merge`). See
> the Merge Tiles section of the README for how it ended up working. It first shipped with
> both twists below as the core rules (three-tile merges and stones); it now merges pairs
> (1, 2, 4, 8…) and keeps the stones, the 5x5 board and its own look. A game in progress
> is saved, so it can be continued. The daily board is not built.

**Idea.** A 4x4 grid of numbered tiles. Swipe to slide every tile; two equal tiles that
meet merge into their sum. A new tile appears after each move. Keep going as long as you
can.

**Rules**

- Endless with a best score and best tile. One undo per game, or a few "remove a tile"
  helpers, give a bit of mercy.
- Optional twist to make it our own: tiles that must merge three at a time, or blocker
  tiles that clear after a few moves.

**Generator.** New tiles come from `Rng` seeded per run. A "daily board" mode could seed
from the date so everyone plays the same game that day.

**Rules code.** `core/rules.ts` with `slide(grid, dir)` returning the new grid, score
gained and the moves for animation. Test it on hand-made grids for all four directions.

**Rendering.** Animate slides and merges (pop on merge). Reuse Snake's swipe input.

**Watch out for.** Each tile must merge only once per move (so 2, 2, 4 left gives 4, 4,
not 8).

---

## 14. Word Grid

> **Built.** Word Grid is in the collection (`src/games/words/`, route `#/words`). See the
> Word Grid section of the README for how it ended up working. The word list is the
> 12dicts 3of6game list (public domain, by Alan Beale), cleaned by
> `tools/build-words.mjs`. It's loaded only by the level builder, which runs in a worker:
> each level carries the words its grid holds, so the game screens never need the list.
> Two changes from the plan: the star targets are a share of the grid's words but capped
> (at most 10, 20 and 30 words), since 40% of 140 words in two minutes is out of reach;
> and the label comes from how many words the grid hides.

**Idea.** A 4x4 or 5x5 grid of letters. Trace words through touching letters before the
timer runs out.

**Rules**

- Drag through neighbouring letters to make a word of three or more letters; each cell
  once per word. Longer words score more.
- A round lasts about two minutes. Stars from the share of possible words found (e.g.
  10%, 25%, 40%).
- Levels from the seed, so everyone gets the same grid for level N.

**Generator**

1. Pick letters from a weighted bag (vowel balance matters) using `Rng`.
2. Find every word in the grid with a trie and a depth-first search.
3. Reject grids with too few words, or with none longer than five letters.

**Word list.** Needs a dictionary of common English words (about 50,000 to 80,000 words,
roughly 300 to 600 KB uncompressed). Load it lazily only when the game opens, and store
it as a compact trie or sorted list. Choose a word list with a licence that allows use
in a free game, and filter out offensive words.

**Difficulty.** Total words available and how many are long; fewer, longer words is
harder.

**Watch out for.** This is the only game that adds a large download. Keep it out of
the main bundle (dynamic `import()`), and say in the README where the word list came
from.

---

## 15. Colour Loop

> **Built.** Colour Loop is in the collection (`src/games/loop/`, route `#/loop`). See the
> Colour Loop section of the README for how it works.

**Idea.** A belt turns in a loop. Tap a column to tip a crate of cubes onto it; trays
below pick off the cubes of their own colour. Cubes nobody wants yet keep circling, and
a belt with no room left jams.

**What was learnt building it**

- It is real time, but everything happens on the step the belt moves a slot. That keeps
  the simulation exact, so undo can restore a snapshot and the solver can play the real
  belt instead of a simplified model of it.
- The solver only proves a careful solution (each tap waits for the belt to settle).
  Rushing is the player's risk to take.
- Every clear uses the same number of taps, so par moves cannot give stars. Stars come
  from undos used instead.
- Random play fails nearly every later level, so "share of random games that jam" is
  useless as a label. The share of taps that jam spreads the levels out properly.

---

## 16. Fruit Drop

> **Built.** Fruit Drop is in the collection (`src/games/fruit/`, route `#/fruit`). See the
> Fruit Drop section of the README for how it works.

**Idea.** Drop fruit into a bucket from the top. Fruit falls and pushes other fruit
about; two of the same kind that touch join into a bigger one. The game ends when the
bucket overflows.

**What was learnt building it**

- Discs are enough. Pushing overlapping pairs apart by weight, then a small bounce and
  some friction, gives a pile that settles in a few passes per step with no library.
- Friction has to turn the fruit as well as slow it, or the pile looks like it is sliding
  on ice. Landed fruit also needs a little rolling resistance, or it rolls along the
  floor for seconds.
- Fruit dropped on exactly the same spot balances in a tall column, which no real pile
  does. A nudge of a fraction of a pixel on each drop is enough to topple it.
- Tests that lean on where a pile ends up break when a constant changes. Putting fruit
  in place directly and testing one thing at a time holds up better.
- "Overflow" needs a pause before it counts (two seconds here), and must ignore fruit
  that is still falling, or a bounce ends the game.
