# Pocket Puzzles

A mobile-first collection of puzzle games. The home screen shows a card for each game
with your current level and stars. Sound, vibration and colours are shared by every
game; progress is kept per game. A game's progress can be reset from the settings card
inside that game (the home screen's settings card has no reset buttons). Players who had Arrow Escape before keep their levels,
stars and settings.

Every game has a How to play card, opened from the ? button in its top bar or the How to
play button on its home screen. It sums up the goal and repeats every tip the tutorial
levels show (`src/games/help.ts`; a test checks that no level tip is missing from it).
Real-time games pause while it is open.

| Game | Idea |
| --- | --- |
| Arrow Escape | Tap bent arrows to slide them off a packed board. |
| Sandglass | Pour sand between bottles until each one holds a single colour. |
| Snake | Classic endless snake: eat apples, grow, beat your best. |
| Snake Trails | Snake with walls: eat enough apples to clear each numbered level. |
| Squeeze | Slide blocks of different shapes out through gaps in the frame. |
| Pipe Link | Turn pipe tiles until water from the tap reaches every pipe. |
| Colour Lines | Join each pair of dots with a line; together the lines fill the board. |
| Crate Push | Push every crate onto a target in a small warehouse. No pulling. |
| Light Switch | Each tap flips a light and its neighbours. Turn every light off. |
| Ice Slide | Slide a puck across the ice and stop it exactly on the flag. |
| Picture Grid | Use the number clues to fill the grid and reveal a picture. |
| Number Place | Fill the grid so every row, column and box holds each digit once. |
| Tents and Trees | Pitch a tent beside every tree; tents never touch. |
| Hidden Mines | Uncover every safe square using the numbers. Never a guess. |
| Brick Breaker | Paddle, ball and a wall of bricks: break them all, level by level. |
| Stack Tower | Tap to drop sliding blocks onto a tower; overhangs are cut off. Endless. |
| Lane Dodger | Swipe between three lanes and jump hurdles. Endless. |
| Merge Tiles | Slide tiles so pairs merge; stones get in the way. Endless. |
| Word Grid | Trace words through touching letters against the clock. |
| Star Battle | Place stars so every row, column and region has the same count; stars never touch. |
| Colour Loop | Tip crates of cubes onto a turning belt; trays sort them by colour. Don't jam it. |
| Fruit Drop | Drop fruit into a bucket; matching fruits that touch join into a bigger one. Endless. |
| Star Raiders | Slide your ship and shoot down waves of marching raiders; it fires by itself. Endless. |
| Code Breaker | Guess the hidden row of colours; each answer says how many pegs are right. |
| Mirror Beam | Turn mirrors so every beam of light reaches the target of its colour. |
| Two Tones | Fill the grid with orange and blue: never three in a row, every line half and half. |
| Island Bridges | Join numbered islands with straight bridges that never cross, until every island is linked. |
| Shape Fit | Drag pieces onto an 8x8 board; full rows and columns clear. Endless. |
| Layer Pairs | Clear a layered pile of tiles two matching free tiles at a time. |
| Cage Sums | Each number once per row and column; the numbers in each cage make its target. |
| Peg Jump | Jump pegs over each other to take them off; finish with one peg on the ring. |
| Tumble Block | Swipe to tip a tall block end over end; stand it upright in the hole. |
| Pair Flip | Turn cards over two at a time and find every matching pair. |

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

## Pipe Link

The board is a grid of pipe tiles: straights, corners, T junctions, crosses and end caps
(outlets). One tile holds the tap. Tap a tile to turn it a quarter turn clockwise. Water
flows from the tap through every pipe that meets its neighbour, and the level is done
when it reaches every tile with no pipe end left open.

### Rules

- **Taps and stars:** each level has a par from the solver: the fewest quarter turns
  that solve it. Finish within par for three stars, within par + 25% for two, otherwise
  one. Nothing can fail.
- **Locking:** long-press a tile (or right-click it) to lock it once you are sure. A
  locked tile does not turn until you unlock it the same way. Locking is not a move.
- **Undo:** unlimited and free, but an undone tap still counts.
- **Hints:** 3 per level. Each one turns a wrong tile into place and locks it,
  preferring one next to the water. Its turns count as taps, so par is still possible.

### Levels

Levels 1 to 4 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from about 5x5 to as big as 8x10 over the first 35
levels, then vary, and the networks get bushier (more junctions and dead ends).

The generator (`src/games/pipes/core/levels.ts`) grows a random spanning tree from the
tap, so every tile is joined and there are no loops, then turns each tile at random. It
keeps only boards with exactly one solution that can be reasoned out without guessing,
and of up to 120 candidates keeps the one closest to the level's difficulty target. The
solver (`src/games/pipes/core/solver.ts`) keeps, for each tile, the turns it could still
have. Two rules narrow them: neighbours must agree on the edge between them (an edge
tile can never point off the board), and fixed pipes must not seal off a group of their
own. A backtracking search with the same rules checks there is only one solution. The
work is capped by search nodes, not time, so every device builds the same board.

The difficulty label is measured like Arrow Escape's. The solver reasons in waves, each
using only what was known at the start of it, the way a player looks at the board,
settles what they can, then looks again. When the edge rule stalls, one sweep of trying
each tile's options one step ahead counts as a wave. For each wave it takes
(open tiles + 1) / (tiles fixed this wave + 1) and the label comes from the average:

| Label | Open tiles per tile settled |
| --- | --- |
| Easy | under 1.6 |
| Medium | 1.6 to 2.1 |
| Hard | 2.1 to 2.7 |
| Super Hard | 2.7 or more |

Hover the label in game to see the number.

## Colour Lines

The board holds pairs of coloured dots. Drag from a dot to draw a line to its twin.
Lines can't cross or branch, and the level is done when every pair is joined and the
lines cover every square.

### Rules

- **Drawing:** a line follows your finger one square at a time (a quick drag is walked
  step by step, so it never jumps over anything). Going back over a line shortens it.
  Pressing a dot starts that colour's line afresh; pressing a line's loose end carries
  it on.
- **Crossing:** drawing over another colour's line cuts it back to just before the
  crossing. If you back off again before letting go, the cut line comes back. Lines
  can't enter another colour's dot.
- **Stars:** three for a clear without hints, one fewer for each hint used, never below
  one. Your best time is saved. Nothing can fail.
- **Hints:** 3 per level. Each one draws a line that isn't right yet (the shortest
  first) exactly as it is in the solution, cutting anything in its way.
- **Undo:** unlimited and free.

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from about 5x5 to as big as 9x11 over the first
35 levels, then vary, with about one colour per 6 squares on small boards and one per 8
on big ones (up to 18 colours).

The generator (`src/games/lines/core/paths.ts`) starts with every square on its own and
keeps joining the end of one path to the end of a neighbouring one, at random, as long
as the joined path never runs alongside itself (a path that touches itself leaves room
for a shortcut). Of the boards whose paths are all at least 3 squares long, it keeps only
those with exactly one solution, and of those the one closest to the level's difficulty
target. The solver (`src/games/lines/core/solver.ts`) grows every colour from both dots
at once and backtracks, always trying the line end with the fewest options first. It
prunes a position when an empty square has fewer than two ways in, when a colour's two
ends no longer share an empty area, or when an empty area has no colour that could fill
it. The work is capped by search nodes, not time, so every device builds the same board.

The difficulty label is measured like Arrow Escape's. The solver plays the solution
through and, at each step, looks at every unfinished line end. An end is forced when
only one of its moves keeps the board finishable. A step costs
(line ends + 1) / (forced ends + 1), or (line ends + 1) when nothing is forced and you
have to look further ahead. The label comes from the average:

| Label | Line ends checked per forced move |
| --- | --- |
| Easy | under 1.15 |
| Medium | 1.15 to 1.37 |
| Hard | 1.37 to 1.65 |
| Super Hard | 1.65 or more |

Hover the label in game to see the number.

## Crate Push

A small warehouse holds crates and the same number of targets. Walk the worker around
and push every crate onto a target. Crates can only be pushed, one at a time, never
pulled.

### Rules

- **Moving:** swipe anywhere to step (one drag can make several steps), or use the arrow
  keys or WASD. Walking into a crate pushes it if the square beyond is free.
- **Tap to walk:** tap any floor square to walk there by the shortest way round; tap a
  crate right next to the worker to push it. Walking is free: only pushes count.
- **Pushes and stars:** each level has a par from the solver: the fewest pushes that
  solve it. Finish within par for three stars, within par + 25% for two, otherwise one.
- **Stuck crates:** a crate pushed where it can never reach a target (into a corner, or
  against a wall with no target along it) gets a red edge and a note to undo.
- **Undo:** unlimited and free (Z or Backspace on a keyboard). It takes back the last
  push and puts the worker back where they pushed from. Undone pushes still count.
- **Hints:** 3 per level. Each one walks to and plays the next push of a shortest
  solution from where you are, and costs a star (never below one).

### Levels

Levels 1 to 4 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same room. Rooms grow to about 9x9 (walls included) and from 2 to 5
crates over the first 35 levels, then vary.

The generator (`src/games/crates/core/levels.ts`) carves a room from a few overlapping
rectangles plus some pillars (`room.ts`), crops it to the floor and places targets.
Then it works backward from solved: crates on their targets, the worker in any area,
pulling crates around (`pullAll` in `solver.ts`). A pull is a push played in reverse,
so the number of pulls to reach a position is exactly the fewest pushes that solve it,
and every position found can be solved. The position whose difficulty is closest to
the level's target becomes the start. Positions are named by the crates plus which area
the worker is in, not their exact square, which keeps the search small. The forward
solver (a breadth-first search over pushes that skips crates pushed onto dead squares)
powers hints and checks par in the tests. The work is capped by positions explored,
not time, so every device builds the same room.

The difficulty label counts extra pushes: pushes in the shortest solution beyond what
the crates would need if each could slide to its own target alone. Those are the
crates moved out of the way, or round the long way, first. The count is always even,
since a crate that goes out of its way has to come back:

| Label | Extra pushes |
| --- | --- |
| Easy | 0 to 2 |
| Medium | 4 to 6 |
| Hard | 8 to 10 |
| Super Hard | 12 or more |

Hover the label in game to see the number.

## Light Switch

A grid of lights. Tapping a light switches it and the lights beside it. Turn every
light off.

### Rules

- **Tapping:** press a tile to see which lights it reaches (they're outlined), and let
  go on it to tap. Sliding off before letting go cancels. Tapping the same tile twice
  puts everything back, and the order of taps never matters.
- **Corner taps:** from level 15, about one board in three has taps that reach the four
  diagonal neighbours instead of the four side ones.
- **Three-step lights:** from level 30, about one board in three has lights that go
  bright, dim, off, then bright again, one step per tap. Pips on each light show how
  many taps it needs to go off.
- **Taps and stars:** each level has a par from the solver: the fewest taps that turn
  every light off. Finish within par for three stars, within par + 25% for two,
  otherwise one. Nothing can fail.
- **Undo:** unlimited and free, but an undone tap still counts.
- **Hints:** 3 per level. Each one outlines a tile that a shortest solution from where
  you are taps. It costs a star (never below one).

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from 4x4 to about 7x8 over the first 35 levels,
then vary.

The generator (`src/games/lights/core/levels.ts`) starts with every light off and taps
tiles at random, so the board that comes out can always be solved. The solver
(`src/games/lights/core/solver.ts`) treats the board as linear equations: each tap adds
1 (mod 2, or mod 3 for three-step lights) to the tiles it reaches, so Gaussian
elimination gives an answer plus a few free choices, and trying every free choice finds
the one with the fewest taps. That can be fewer than the taps that made the board. Of
up to 30 boards, the one whose par is closest to the level's target is kept.

Clearing the board row by row always works, so the label measures how long a board is
more than how clever. It comes from par, weighted for how hard the board is to read:
x1.25 for corner taps and x1.4 for three-step lights:

| Label | Weighted par |
| --- | --- |
| Easy | under 6 |
| Medium | 6 to 11 |
| Hard | 12 to 19 |
| Super Hard | 20 or more |

Hover the label in game to see the numbers.

## Ice Slide

A puck sits on a sheet of ice dotted with rocks. Swipe to send it sliding: it only stops
when the next square is the edge or a rock. Stop it exactly on the flag; sliding past
isn't enough.

### Rules

- **Swiping:** one swipe anywhere is one slide. Arrow keys and WASD work too. A swipe
  that moves nothing doesn't count.
- **Holes:** from level 12, about half the boards have holes. A puck that slides over
  one falls in: the swipe counts, but nothing moves.
- **Two pucks:** from level 25, about one board in three has two pucks that slide
  together on every swipe, each with its own flag. They stop against each other, and a
  puck that stops on its flag is home and leaves the ice.
- **Swipes and stars:** each level has a par from the solver: the fewest swipes. Finish
  within par for three stars, within par + 25% for two, otherwise one.
- **Dead ends:** if no swipes can get home from where you are, a note says so.
- **Undo:** unlimited and free (Z or Backspace on a keyboard), but an undone swipe still
  counts.
- **Hints:** 3 per level. Each one shows arrows for the first swipe of a shortest way
  home from where you are, and costs a star (never below one).

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from 6x7 to about 9x11 over the first 35
levels, then vary, with 12% to 20% of squares rock.

The generator (`src/games/ice/core/levels.ts`) scatters rocks and holes, places the
pucks, and picks flags among the squares each puck can stop at on its own, leaning
toward far ones. A breadth-first search over swipes (`src/games/ice/core/solver.ts`)
then gives par and counts dead ends: positions you can slide into but never get home
from. Of the boards tried, the one whose score is closest to the level's target is
kept. The work is capped by attempts and positions searched, not time.

The difficulty label comes from par, weighted by dead ends: par x (1 + dead ends /
positions reachable). A board full of traps punishes the obvious first swipe:

| Label | Weighted par |
| --- | --- |
| Easy | under 7 |
| Medium | 7 to 10 |
| Hard | 11 to 14 |
| Super Hard | 15 or more |

Hover the label in game to see the numbers.

## Picture Grid

Numbers beside each row and above each column give the runs of filled squares in that
line, in order, with at least one empty square between runs. Work out which squares are
filled to reveal a picture.

### Rules

- **Marking:** tap a square to mark it, as filled or crossed (empty) depending on the
  Fill / Cross switch under the board. Hold a square for a moment to use the other mark
  instead, so in Fill mode a long press crosses a square out.
- **Painting:** drag to paint. Every square the finger passes over gets the stroke's
  mark, in any direction. Hold first, then drag, to paint the other mark (crosses, in
  Fill mode).
- **Hearts:** every mark is checked straight away. A wrong one shows what the square
  really is (in red) and costs one of three hearts, and ends the stroke, so one bad
  stroke costs at most one heart. Everything on the board is always true, and a marked
  square can't be changed.
- **Out of hearts:** keep going for no stars, or restart. If the mark that used the last
  heart also finishes the picture, the level just ends with no stars.
- **Stars** equal the hearts left when the picture is done.
- **Finished lines:** once every filled square in a row or column is found, the rest of
  it is crossed off and its numbers fade.
- **Hints:** 3 per level, free. Each one reveals a square that line logic can work out
  from what's on the board, preferring a filled one.

### Levels

Levels 1 to 3 are hand-drawn tutorials (a heart, a house, a mug), and every tenth level
after that is one of 10 hand-drawn pictures, in turn. The rest are generated from the
level number as the seed. Boards grow from 6x6 to about 12x12 over the first 35 levels,
then vary.

Generated pictures (`src/games/picture/core/levels.ts`) start as random values, smoothed
by averaging each square with its neighbours so they form shapes rather than static,
then the top half or so is filled. A board is kept only if line logic alone can finish
it, which also means it has exactly one answer. The line solver
(`src/games/picture/core/line.ts`) works out, for one row or column, what every
placement of its runs that fits the known squares agrees on, without listing the
placements one by one. Every hand-drawn picture is checked the same way in the tests.

The difficulty label is measured like Arrow Escape's. The solver works in waves: every
row and column is solved using only what was known when the wave began, the way a
player scans the board and then looks again. For each wave it takes
(open squares + 1) / (squares settled that wave + 1), and the label comes from the
average:

| Label | Open squares per square settled |
| --- | --- |
| Easy | under 1.5 |
| Medium | 1.5 to 1.9 |
| Hard | 1.9 to 2.5 |
| Super Hard | 2.5 or more |

Hover the label in game to see the number.

## Number Place

Fill the grid so that every row, every column and every box holds each digit exactly
once. Boards are either 6x6 (digits 1 to 6, boxes 3 wide and 2 high) or the classic 9x9
(digits 1 to 9, 3x3 boxes).

### Rules

- **Entering digits:** tap a square, then a digit on the pad. Each pad button shows how
  many of that digit are still to place, and greys out when they're all in. Keyboard:
  digits, arrow keys to move, N for notes, Backspace to clear notes.
- **Notes:** switch to Notes to pencil in the digits a square could be. Placing a digit
  clears it from the notes of every square in the same row, column and box.
- **Hearts:** every digit is checked straight away. A wrong one isn't placed, flashes
  red and costs one of three hearts.
- **Out of hearts:** keep going for no stars, or restart.
- **Stars** equal the hearts left when the grid is full.
- **Hints:** 3 per level, free. Each one fills the next square a player could work out
  from the board as it is, using the easiest technique that does it.
- **Highlights:** the selected square's row, column and box are shaded, and so is every
  square with the same digit.

### Levels

Levels 1 to 3 are tutorials (two 6x6, one 9x9). After that, level N is generated from N
as the seed, so everyone gets the same puzzle. 6x6 boards are about half the levels at
first and turn up now and then later as a breather. 9x9 boards take over as the
techniques needed ramp up over the first 35 levels.

The generator (`src/games/numbers/core/levels.ts`) fills a random complete grid, then
takes clues away: in mirrored pairs at first (for the usual symmetric look), one at a
time on later tries. A removal stays only if the puzzle still has exactly one answer
(a backtracking solver in `grid.ts` counts them) and a solver that works like a person
can still finish it without anything harder than the level calls for. Harder levels get
more tries, and of those, one that really needs the level's hardest technique, with the
fewest clues, is kept.

The difficulty label is the hardest technique that solver needs
(`src/games/numbers/core/techniques.ts`), always trying the easiest first:

| Label | Hardest technique needed |
| --- | --- |
| Easy | Hidden single in a box: the only square in a box where a digit fits |
| Medium | Naked single (one digit left in a square) or hidden single in a row or column |
| Hard | Pointing or claiming: a digit's spots in a box all in one line, or the reverse |
| Super Hard | Naked or hidden pairs, triples, or an X-wing |

Hover the label in game to see the technique.

## Tents and Trees

A campsite full of trees. Pitch one tent beside each tree (above, below, left or right
of it, not diagonally), so that every tent belongs to its own tree. Tents never touch
each other, not even at the corners. The numbers say how many tents go in each row and
column.

### Rules

- **Marking:** tap a square to mark it, as a tent or as grass (empty) depending on the
  Tent / Grass switch under the board. Drag along a row or column to mark several at
  once.
- **Hearts:** every mark is checked straight away, as in Picture Grid. A wrong one shows
  what the square really is (outlined in red) and costs one of three hearts.
- **Out of hearts:** keep going for no stars, or restart. If the mark that used the last
  heart also finishes the board, the level just ends with no stars.
- **Stars** equal the hearts left when every tent is pitched.
- **Grass for free:** squares with no tree beside them start as grass, and so do rows
  and columns that hold no tents. Once a row or column has all its tents, the rest of it
  turns to grass and its number fades.
- **Hints:** 3 per level, free. Each one reveals a square the rules can work out from
  the board as it is, preferring a tent.

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same campsite. Boards grow from 6x6 to about 10x11 over the first 35
levels, then vary, with tents on about 16% to 20% of the squares.

The generator (`src/games/tents/core/levels.ts`) places tents at random so none touch,
gives each a tree on a free square beside it, and counts the tents per row and column.
A backtracking search (`src/games/tents/core/solver.ts`) over the squares beside trees
counts the answers, checking at the end that every tent can be paired with its own tree;
a board is kept only if it has exactly one. It must also be finishable by reasoning: in
waves, each row and column tries every way to place its remaining tents, squares round a
tent become grass, and a tree with one open square beside it gets its tent there. When
those stall, each open square is tried as a tent and as grass, and whatever leads to a
contradiction is ruled out.

The difficulty label is measured like Arrow Escape's: for each wave,
(open squares + 1) / (squares settled that wave + 1), averaged:

| Label | Open squares per square settled |
| --- | --- |
| Easy | under 1.7 |
| Medium | 1.7 to 2.2 |
| Hard | 2.2 to 2.7 |
| Super Hard | 2.7 or more |

Hover the label in game to see the number.

## Hidden Mines

The board hides mines. An uncovered square shows how many of the eight squares around it
are mines. Uncover every safe square. Every board can be finished without guessing.

### Rules

- **Starting:** the start area opens by itself, so there's never a blind first tap.
- **Uncovering:** tap a covered square to uncover it. A 0 opens everything around it.
- **Flags:** hold a square for a moment (or right-click) to flag it as a mine, and again
  to take the flag off. A Reveal / Flag switch swaps what a tap and a long press do.
  Flags are your own notes and are never checked; they just stop a square being
  uncovered by mistake. The counter shows mines left minus flags.
- **Opening around a number:** tap an uncovered number whose mines are all flagged to
  uncover every other square around it. A wrong flag means a mine goes off.
- **Hearts:** setting off a mine costs one of three hearts. The mine stays shown and
  play goes on.
- **Out of hearts:** keep going for no stars, or restart.
- **Stars** equal the hearts left when every safe square is uncovered.
- **Hints:** 3 per level, free. Each one uncovers a square that can be worked out as safe
  from what's showing (or, if only mines can be worked out, flags one).

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from 8x9 to about 10x14 over the first 35
levels, then vary, with mines on 13% to 21% of the squares.

The generator (`src/games/mines/core/levels.ts`) picks a start square near the middle,
scatters mines anywhere except it and its neighbours, and keeps a board only if a solver
that never guesses (`src/games/mines/core/solver.ts`) can finish it from there. The
solver works in waves, each time with the simplest reasoning that gets anywhere:

1. One number at a time: if its mines are all found, the rest around it are safe; if
   its covered squares are exactly the mines it still needs, they're all mines.
2. Two numbers that share squares: if the mines one needs can't all fit in the shared
   squares, the rest must fill its own squares, which can settle the other's.
3. Trying every arrangement of mines along the edge of the open area, together with the
   count of mines left, and keeping what's the same in all of them.

The difficulty label scores how much more than rule 1 a board needs: each wave of rule 2
counts 1 and each wave of rule 3 counts 3:

| Label | Score |
| --- | --- |
| Easy | 0 to 2 |
| Medium | 3 to 5 |
| Hard | 6 to 8 |
| Super Hard | 9 or more |

Hover the label in game to see the hardest reasoning needed.

## Brick Breaker

Keep the ball in play with the paddle and break every brick in the wall. Each level gives
you three balls.

### Rules

- **Paddle:** drag anywhere to move it. The paddle follows your finger's movement rather
  than jumping under it, and sits well up from the bottom of the field, with a faint band
  below it to drag in, so your finger never covers it. Arrow keys work too.
- **Serving:** the ball waits on the paddle; tap (or press Space) to launch it.
- **Angles:** where the ball lands on the paddle sets where it goes: the middle sends it
  straight up, the edges send it out wide.
- **Bricks:** darker bricks take more hits (the dots show how many are left). From level
  12, about half the walls have grey steel bricks that never break.
- **Capsules:** a broken brick sometimes drops one. Catch it with the paddle: W widens the
  paddle for 15 seconds, S slows the ball for 12, and + splits every ball into three.
- **Balls and stars:** dropping the last ball in play costs one of three hearts. Stars
  equal the hearts left when the wall is gone. Lose all three and the level starts over.
- **Pause:** the pause button (or P), opening a card, or leaving the tab pauses the game.

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same wall. Walls grow from 3 to 6 rows and the ball speeds up from
about 12 to 16 units a second over the first 35 levels, then vary, with the odd easier
level.

Walls (`src/games/bricks/core/levels.ts`) are a pattern for the left half (solid,
checker, pyramid, diamond, stripes, columns or scattered), mirrored to the right, with
tougher bricks nearer the top. Steel goes in mirrored pairs, and only where every
breakable brick can still be reached (from below, or over the top once the ball breaks
through) and none is boxed in between steel and the side wall.

The rules (`src/games/bricks/core/sim.ts`) have no drawing or timing in them: the game
runs them at 240 small steps a second, which keeps the ball from skipping through a
brick, and the ball never leaves the paddle or a wall flatter than 22 degrees, so it
can't bounce side to side for ever. The tests play levels through with a simple player
that aims at the lowest bricks, to check they can be cleared.

The difficulty label blends ball speed, the number of hits the wall takes and the share
of steel: (speed - 11) x 1.2 + hits / 20 + steel share x 25:

| Label | Score |
| --- | --- |
| Easy | under 4 |
| Medium | 4 to 7 |
| Hard | 7 to 10.5 |
| Super Hard | 10.5 or more |

Hover the label in game to see the ball speed and score.

## Stack Tower

A block slides back and forth above the tower. Tap anywhere (or press Space) to drop it.
Whatever hangs over the edge of the block below is cut off and falls away, so the tower
gets narrower every time you miss. Miss the tower completely and it's over. Endless:
build as high as you can.

### Rules

- **Perfect drops:** a drop within a hair (0.12 of a block unit) of dead on snaps into
  place with nothing cut off. After three perfect drops in a row, every further one grows
  the block back a little (a quarter unit), up to its starting width.
- **Speed:** the block slides faster as the tower grows, up to a limit.
- **Timing:** the drop uses the moment your finger touched the screen (the touch's own
  timestamp), not the next frame drawn, so a tap lands where you saw the block.
- **Best:** your best height, most perfect drops in one tower and towers built are kept.
  Opening a card or leaving the tab holds the block still.

Each tower gets its own colours and its own order of sides the blocks come in from. The
rules (`src/games/stack/core/sim.ts`) have no timing in them: the sliding block's
position is worked out from how long it has been sliding, so the tests can drop it at
exact spots.

## Lane Dodger

A runner heads up a three-lane road. Swipe left or right to change lanes and dodge the
walls, and swipe up to jump the low hurdles. Endless: run as far as you can, picking up
coins on the way.

### Rules

- **Moving:** swipe anywhere (or use the arrow keys or WASD; Space jumps). Lanes can be
  changed in the air.
- **Walls and hurdles:** walls must be dodged; hurdles can be dodged or jumped. A jump
  lasts just over half a second.
- **Grace:** touching something only counts once it has lasted 80 ms, so a swipe that
  arrives just too late still gets you out of trouble.
- **Speed:** starts at 7 metres a second and rises by 1 for every 100 metres run, up to
  16. The course gets busier as it goes.
- **Best:** your best distance, the most coins in one run and coins collected in total
  are kept. The pause button (or P), opening a card or leaving the tab pauses the run.

The course (`src/games/lanes/core/course.ts`) is built about 40 rows ahead from
hand-designed obstacle patterns, picked at random and mirrored half the time, with a gap
before each that shrinks with distance. A pattern is only used if a small search shows
it can be got through from every lane at the speed the player will be going when they
reach it, allowing for how quickly a person can swipe again (0.2 s) and how far a jump
carries. The rules (`src/games/lanes/core/sim.ts`) run in small fixed steps with no
drawing or timing. The tests include a test player that plans a route each row and runs
2,000 metres to top speed without crashing.

## Merge Tiles

A 5x5 board of numbered tiles. Swipe to slide every tile as far as it goes in that
direction. Two equal tiles that meet merge into one worth both (1 and 1 make 2, 2 and 2
make 4, and so on). A new tile (usually a 1, sometimes a 2) appears after every move. The
game ends when no swipe changes anything.

### Rules

- **Merging:** merges start from the side the tiles move toward, and each tile merges at
  most once per swipe (so four 2s make two 4s, not an 8). The score goes up by each
  merged tile's new value.
- **Stones:** from move 30, a stone turns up every 25 moves. Stones don't slide, block
  tiles and split a row or column in two. Each crumbles after 8 moves (the number on it
  counts down).
- **Undo:** once per game (Z on a keyboard).
- **Saving:** a game in progress is kept, so you can leave and Continue later. Best score,
  best tile and games played are kept too.
- Swipe anywhere, one move per swipe, or use the arrow keys or WASD.

The rules (`src/games/merge/core/rules.ts` and `core/game.ts`) have no drawing or timing
in them. Games are long: a player moving at random lasts about 440 moves, and one that
always keeps the most space free about 1,050.

Merge Tiles first shipped with three-tile merges (tiles 1, 3, 9, 27…). Progress made
under those rules (bests and any saved game) is cleared the first time the game loads
under the new ones; the count of games played is kept.

## Word Grid

A grid of letters (4x4, or 5x5 from level 10). Drag through touching letters, diagonals
included, to spell a word of 3 letters or more, then let go to try it. Each square can be
used once per word. Find as many words as you can before the clock runs out: 2 minutes on
a 4x4 grid, 3 on a 5x5.

### Rules

- **Starting:** the clock starts when you first tap the grid, not while the level loads.
- **Tracing:** going back over the last letter takes it off. Each word scores once:
  1 point for 3 or 4 letters, 2 for 5, 3 for 6, 5 for 7 and 11 for 8 or more.
- **Stars:** each level shows three targets, a number of words to find for each star:
  about 12%, 22% and 33% of the words in the grid, but never more than 10, 20 and 30. One
  star unlocks the next level. Your best stars, points and words found are kept.
- **Hints:** 3 per level, free. Each one rings the first two letters of a word you haven't
  found (5 to 7 letters if there is one) and says how long it is.
- **End of round:** shows how many words the grid held and some of the longest you missed.
  Opening a card or leaving the tab pauses the clock.

### Levels

Levels 1 and 2 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same grid. Grids are drawn from a bag weighted by how often letters
appear in English, with between a quarter and a half vowels, and are kept only if they
hold at least 20 words and one of 6 letters or more. A search through the grid that
follows a letter tree (`src/games/words/core/trie.ts`) finds every word. Each level's
grid hides fewer words than the last over the first 30 or so levels, then it varies.

The difficulty label comes from how many words the grid hides. Grids with plenty of words
leave lots to choose from; sparse ones need a bigger share of them, and those tend to be
harder to spot:

| Label | Words in the grid |
| --- | --- |
| Easy | 120 or more |
| Medium | 85 to 119 |
| Hard | 55 to 84 |
| Super Hard | under 55 |

Hover the label in game to see the count.

### The word list

Word Grid accepts words from the **12dicts** word lists (version 6.0.2) compiled by
**Alan Beale**, who has released them to the public domain and asks that their use be
acknowledged: thank you, Alan. The game uses the 3of6game list, which is meant for word
games, mixes American and British spellings (so both "colour" and "color" count), and
includes plurals and other inflected forms. `tools/build-words.mjs` turns it into
`src/games/words/data/words.txt`, keeping plain lower-case words of 3 to 10 letters and
leaving out a short list of offensive words (52,325 words, about 440 KB, 136 KB
compressed). Only the level builder loads the list, and it runs in a worker, so the rest
of the app never downloads it.

## Star Battle

The grid is split into coloured regions. Place stars so that every row, every column and
every region holds the same number of them (one on most boards, two on the 10x10 ones),
and no two stars touch, not even at the corners.

### Rules

- **Marking:** tap a square to mark it, as a star or a dot (no star) depending on the
  Star / Dot switch under the board. Hold a square for a moment to use the other mark.
  Drag to paint several squares in one stroke, in any direction.
- **Dots for free:** the squares round a star, and the rest of any row, column or region
  that has all its stars, fill with dots by themselves.
- **Hearts:** every mark is checked straight away, as in Picture Grid. A wrong one shows
  what the square really is (outlined in red), costs one of three hearts and ends the
  stroke. Out of hearts: keep going for no stars, or restart.
- **Stars** equal the hearts left when every star is placed.
- **Hints:** 3 per level, free. Each one reveals a square the rules can work out from the
  board as it is, preferring a star.

### Levels

Levels 1 to 3 are tutorials (5x5 and 6x6). After that, level N is generated from N as the
seed, so everyone gets the same board. Grids grow from 6x6 to 9x9 with one star each over
the first 30 or so levels, then vary. From level 35, about one board in five is 10x10
with two stars each.

The generator (`src/games/stars/core/layout.ts`) places a valid set of stars, then grows
a region round each star (or round nearby pairs of stars on two-star boards), the smaller
regions growing more often so they come out irregular but not too uneven. Random regions
almost never pin down one answer, so it then repairs them: while a backtracking search
(`src/games/stars/core/solver.ts`) finds a second answer, one of that answer's stars is
handed to a neighbouring region, keeping every region in one piece. The intended stars
never move, so they still fit. Boards are then kept only if a reasoning solver can
finish them without guessing: in waves, it dots the squares round stars and tries every
way to place each row's, column's and region's remaining stars; when that stalls, it
tries each open square both ways and rules out whatever leads to a contradiction.

The difficulty label is measured like Arrow Escape's: for each wave,
(open squares + 1) / (squares settled that wave + 1), averaged:

| Label | Open squares per square settled |
| --- | --- |
| Easy | under 2.4 |
| Medium | 2.4 to 4 |
| Hard | 4 to 7 |
| Super Hard | 7 or more |

Hover the label in game to see the number. Two-star boards take a second or so to build
(sometimes several), in a worker, while the previous level is being played.

## Colour Loop

A belt turns in a loop. Above it are columns of crates, four cubes to a crate; below it
are bays of coloured trays. Tip crates onto the belt and the trays pick off the cubes of
their own colour as they ride past. Ship every tray to clear the level. It runs in real
time: the belt never stops, and you can tap as fast as you like.

### Rules

- **Tipping:** tap a column (or press its number key) to tip its front crate into the
  chute. The chute drops one cube into each empty belt slot that passes under it.
- **Trays:** only the front tray of each bay collects. It takes each cube of its colour
  that passes, ships out when it holds four, and the next tray slides up.
- **Circling:** cubes that no front tray wants stay on the belt and take up room.
- **Jam:** if a chute still holds cubes after a whole lap with no empty slot passing it,
  the belt jams and the level stops. Undo, restart, or go back to the level list.
- **Undo** takes back the last tap and puts the belt and the clock back exactly as they
  were. It can be used at any time, as often as needed.
- **Stars:** three with no undos, two with one or two, one otherwise. Best times are
  saved.
- **Clock:** from level 8 most levels have one. It starts on the first tap and the level
  ends if it runs out.
- **Auto-finish:** once the belt has room for every cube still to come (or every crate
  is already on it), nothing can jam. The game tips whatever is left, stops the clock
  and runs the belt fast to the end.
- **Later levels:** crates that hold two colours (from level 11) and crates that hide
  their colours until they reach the front (from level 18).
- The HUD shows trays left and how full the belt is. The game pauses when the How to
  play or settings card is open, or the page is hidden.

### Levels

Levels 1 to 4 are hand-made tutorials. After that, level N is generated from N as the
seed, so everyone gets the same board. Over the first 40 levels the colours grow from 3
to 6, the columns from 2 to 4, the bays from 2 to 3, the crates from 5 to 12, and the belt
speeds up from about 4 slots a second to nearly 7; then they vary, with the odd slower,
roomier breather.

The generator (`src/games/loop/core/levels.ts`) deals the trays into bays and one crate
per tray into the columns, then looks for the shortest belt the board can be cleared on
and adds the level's spare slots. The belt itself (`core/sim.ts`) is a fixed-step
simulation where everything happens as the belt moves a slot, so the same taps on the
same steps always play out the same way. That lets the solver (`core/solver.ts`) prove
each level by playing the real belt: it searches tap orders in which every tap waits for
the belt to settle, with a cap on taps tried rather than on time, and the order it finds
is stored with the level. The clock is that careful run's time plus a quarter, half a
second a tap and four seconds. Of a few deals the riskiest is kept.

The difficulty label comes from playing each board carefully but at random 40 times and
counting the share of taps that jam the belt. The score is three times that share (out
of 100), plus 8 for a clock and 6 for covered crates:

| Label | Score |
| --- | --- |
| Easy | under 20 |
| Medium | 20 to 42 |
| Hard | 42 to 68 |
| Super Hard | 68 and up |

Hover the label in game to see the number.

## Fruit Drop

A fruit hangs above a bucket. Drag to aim and let go to drop it (a tap drops it where you
tapped; with keys, the arrows aim and Space drops). Fruit falls, rolls and gets pushed
about by other fruit. Two of the same kind that touch join into one fruit of the next
size up. Endless: score as much as you can before the bucket overflows.

### Rules

- **Fruits:** ten sizes, smallest first: blueberry, raspberry, lime, plum, lemon, orange,
  apple, grapefruit, coconut, melon. Only the five smallest are handed out; the rest have
  to be made by joining. The corner of the board shows the fruit that comes next.
- **Joining:** two equal fruits that touch become one fruit of the next size, where they
  met. The new fruit is bigger and shoves its neighbours, which can set off more joins.
  Two melons that touch pop and vanish.
- **Score:** making the second fruit scores 1, the third 3, then 6, 10 and so on up to 45
  for a melon. Popping two melons scores 100.
- **Overflowing:** when a fruit that has landed stays above the dashed rim, the rim
  flashes red. If fruit is still above it two seconds later, the game is over. A fruit
  on its way down does not count until it has touched something.
- **Kept:** your best score, biggest fruit and games played. A game in progress is saved,
  so the home screen offers Continue. Opening a card or leaving the tab holds everything
  still.

The physics is written for this game (`src/games/fruit/core/sim.ts`); there is no physics
library. Fruits are discs. The bucket advances in fixed steps of 1/120 of a second: each
step moves every fruit, then goes over every touching pair several times, pushing them
apart by weight and working out the bounce and the rub that makes them roll. Nothing in
it depends on the clock or the screen, so the same seed and the same drops always give
the same bucket, and the tests play whole games.

## Star Raiders

A formation of raiders marches side to side across the top of the field, stepping down
each time it reaches an edge and firing bolts as it comes. Your ship slides along the
bottom and fires by itself. Endless: clear wave after wave and score as much as you can
before your lives run out.

### Rules

- **Moving:** drag anywhere to slide the ship. It follows your finger's movement rather
  than jumping under it, and sits well up from the bottom of the field, with a faint band
  below it to drag in. Arrow keys work too. The first press starts the game.
- **Firing:** the ship fires on its own, a shot about every third of a second, with at
  most two shots in flight. A shot that meets a bolt cancels it.
- **Raiders:** 5 rows of 8. Top row scores 30, the next two 20, the bottom two 10. The
  formation speeds up as raiders fall. If a raider reaches the ship's row, the game is over.
- **Bolts:** the lowest raider in a column fires, now and then the column nearest the ship.
  More bolts, faster, wave by wave.
- **Shields:** three blocks of small cells. Shots and bolts wear them away; raiders that
  march into them wipe out what they touch. They are rebuilt each wave.
- **Bonus ship:** now and then a ship crosses the top. Hit it for 50 to 300.
- **Lives:** three hearts. A bolt costs one and the ship blinks, safe, for two seconds.
  Every 5000 points brings an extra life, up to five.
- **Waves:** clearing a wave scores 100 times its number. The next wave starts a little
  lower (up to four steps) and marches and fires faster.
- **Kept:** best score, furthest wave and games played. A game is not saved part way
  through. The pause button (or P or Space), opening a card or leaving the tab pauses.

The rules are in `src/games/raiders/core/sim.ts`, in fixed steps of 1/120 of a second
with a seeded random source, so the same seed and the same moves always give the same
game and the tests can play whole waves.

## Code Breaker

A hidden row of coloured pegs. Make a guess and the game answers with dots: a filled dot
for each peg that is the right colour in the right place, and a hollow dot for each one
that is the right colour in the wrong place. The dots are always listed filled first, so
they never say which pegs they mean. Find the code in as few guesses as you can.

### Rules

- **Guessing:** tap a colour to put it in the selected slot; the selection then moves to
  the next empty slot. Tap a slot to select it, and tap it again to empty it. The undo
  button clears the last peg. Check is enabled once the row is full. On a keyboard, keys
  1 to 8 pick colours, Backspace clears, the arrow keys move the selection and Enter checks.
- **Colour-blind play:** every colour also has its own white shape (dot, triangle, square,
  diamond, plus, ring, bar, cross).
- **Repeats:** from level 10, most codes may use a colour more than once. Guesses may
  always repeat colours.
- **Guesses and stars:** there is no guess limit and nothing can fail. Crack it within
  par for three stars, within par + 2 for two, otherwise one. Empty rows on the board
  show how many guesses par allows.
- **Hints:** 3 per level. Each one fills the row with a code that fits every answer so
  far (the one the solver would try next). It costs a star (never below one).

### Levels

Levels 1 to 3 are tutorials (three pegs and four or five colours, then four pegs). After
that, level N is generated from N as the seed, so everyone gets the same code. Levels 4
to 9 use four pegs and five or six colours with no repeats; level 10 brings in repeats.
Over the next 30 or so levels the code grows to five pegs and up to eight colours, with
the odd easier breather, and late levels sometimes use six pegs with no repeats.

The solver (`src/games/codes/core/solver.ts`) plays like a careful player: it only
guesses codes that still fit every answer, and picks the one that leaves the fewest codes
in the worst case. To keep that quick on a phone it weighs a fixed sample of up to 48
guesses against up to 600 remaining codes, capped by counts rather than time so every
device picks the same guess.

Par doesn't depend on the level's code, since any one code can fall to a lucky early
guess. Instead it is the solver's average over a fixed sample of 16 codes of the same
size, rounded up, plus one guess of slack for not having the solver's perfect memory.

The label comes from how many codes are possible, in bits (log2 of the count):

| Label | Bits | For example |
| --- | --- | --- |
| Easy | under 8 | 4 pegs, 5 colours, no repeats |
| Medium | 8 to 10.9 | 4 pegs, 6 colours, repeats |
| Hard | 11 to 13.9 | 4 pegs, 8 colours, repeats |
| Super Hard | 14 or more | 5 pegs, 8 colours, repeats |

Hover the label in game to see the size, the bits and the solver's average.

## Mirror Beam

Coloured lamps around the edge of the board shine beams in. Mirrors on the board lean
one way or the other (`/` or `\`). Tap a mirror to turn it the other way. Get every
beam to the target of its own colour, also on the edge.

### Rules

- **Beams:** a beam goes straight until it meets a mirror, which turns it a quarter
  turn. Beams pass straight through each other. A wall stops a beam dead.
- **Pinned mirrors:** a mirror with a bolt in the middle can't be turned. Tapping one
  gives a small shake.
- **Crystals:** from level 12, some boards have crystals. A beam of any colour must pass
  through each one.
- **Colour-blind play:** each colour's lamp and target share a shape (dot, triangle,
  square, diamond).
- **Taps and stars:** each level has a par from the solver: the fewest taps that solve
  it. Finish within par for three stars, within par + 25% for two, otherwise one.
  Nothing can fail. The HUD counts targets lit (and crystals, when there are any).
- **Undo:** unlimited and free, but an undone tap still counts.
- **Hints:** 3 per level. Each one turns a mirror that a cheapest solution from where you
  are needs turned (the first one along the beams) and pins it. Its tap counts, so par
  is still possible.

### Levels

Levels 1 to 4 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from 5x6 to about 7x9 over the first 36
levels, then vary, with two to four beams, more decoy mirrors and fewer pinned ones as
levels go on.

The generator (`src/games/beams/core/levels.ts`) lays the beams out one by one. Each
starts at a free spot on the edge and goes straight, now and then placing a mirror in a
free cell to turn. It follows mirrors earlier beams placed, and never puts a mirror where
a beam already passes straight through, so earlier beams keep their paths. Where it
leaves the board becomes its target. The other cells get decoy mirrors and walls,
crystals go on cells a beam passes through, some of the path's mirrors are pinned, and
then most of the turnable ones are turned the wrong way.

The solver (`src/games/beams/core/solver.ts`) follows the beams one at a time and only
decides a mirror when a beam first reaches it, trying it as it is and then turned. A
mirror no beam reaches can't matter, so it is never turned. That gives par (the fewest
turns), the number of solutions, and the search effort. Boards with more than three
solutions are thrown away (the mirrors would barely matter), and of up to 40 candidates
the one whose effort is closest to the level's target is kept. The work is capped by
search steps, not time, so every device builds the same board.

The label comes from the search effort in bits: log2 of the steps the solver takes to
explore every way of turning the mirrors the beams reach. A board where wrong turns die
out at once is quick to search and quick to read; one where they wander far is not.

| Label | Search effort |
| --- | --- |
| Easy | under 6 bits |
| Medium | 6 to 8.4 |
| Hard | 8.5 to 10.4 |
| Super Hard | 10.5 or more |

Hover the label in game to see the number.

## Two Tones

Fill every square of an even-sized grid with orange or blue. Three rules:

1. Never three of one colour in a row, across or down.
2. Every row and every column holds as many orange as blue.
3. No two rows are the same, and no two columns.

Orange is a filled disc and blue a ring, so the game can be played without telling the
colours apart. Every board has exactly one answer.

### Rules

- **Marking:** tap a square to fill it with the colour on the Orange / Blue switch under
  the board. Hold a square for a moment to use the other colour. Drag to fill several
  squares in one stroke. Keyboard: arrow keys move, 1 or A for orange, 2 or B for blue,
  Space flips the switch.
- **Counters:** the numbers right of each row and below each column say how many of each
  colour that line still needs. They fade at 0.
- **Hearts:** every square is checked straight away, as in Star Battle. A wrong one shows
  its real colour (outlined in red), costs one of three hearts and ends the stroke.
- **Out of hearts:** keep going for no stars, or restart.
- **Stars** equal the hearts left when the grid is full.
- **Hints:** 3 per level, free. Each one fills a square the easiest technique that
  works can settle from the board as it is.

### Levels

Levels 1 to 3 are tutorials (4x4, then two 6x6). After that, level N is generated from N
as the seed, so everyone gets the same puzzle. Grids grow from 6x6 to 12x12 over the
first 35 levels, then vary. The no-copies rule is first needed on level 15, and trial and
error from level 26.

The generator (`src/games/tones/core/levels.ts`) builds a full valid grid row by row from
the list of valid rows, keeping every column legal and every row and column different.
It then takes clues away in a seeded random order, keeping a removal only if the
reasoning solver can still finish with nothing harder than the level calls for. Since
that solver only ever places squares that are forced, a board it finishes has exactly
one answer. Of a few tries, a board that really needs the level's hardest technique, with
the fewest clues, is kept. Trial-and-error boards are slow to check, so they get only a
short last pass of removals; they take up to about a second to build, in a worker.

The solver (`src/games/tones/core/solver.ts`) works in waves, always trying the easiest
technique first. The difficulty label is the hardest technique it needs:

| Label | Hardest technique needed |
| --- | --- |
| Easy | Pairs and gaps (two alike side by side, or with one gap, fix their neighbours), or counting (a line with half of one colour fills the rest) |
| Medium | Line logic: of every way left to finish a line, a square that comes out the same in all of them |
| Hard | No copies: as line logic, ruling out ways that copy a finished line |
| Super Hard | Trial and error: a square where one colour leads, by the rules above, to a broken board |

Hover the label in game to see the technique.

## Island Bridges

Islands sit in the sea, each with a number. Join them with straight bridges, across or up
and down, so that:

1. each island has exactly as many bridges as its number,
2. any two islands share at most two bridges,
3. bridges never cross each other or pass over an island, and
4. every island ends up joined, through bridges, in one group.

Every map has exactly one answer.

### Rules

- **Building:** drag from an island toward another to build one bridge between them (the
  link is previewed while dragging). Or tap the water between two islands. Where two
  links cross, lean the tap toward the way the bridge should run; a tap in the very
  middle of such a square is too close to call and only shows a reminder.
- **Hearts:** every bridge is checked straight away, as in the other deduction games.
  A wrong one isn't built, flashes red and costs one of three hearts.
- **Free refusals:** a bridge the board itself rules out (one that would cross a bridge,
  a third bridge, or one more than an island needs) is refused without costing a heart.
- **Out of hearts:** keep going for no stars, or restart.
- **Stars** equal the hearts left when every island is joined.
- **Finished islands** fill in once they have all their bridges. The HUD counts them.
- **Hints:** 3 per level, free. Each one builds a bridge the reasoning steps below can
  work out from the board as it is.

### Levels

Levels 1 to 4 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same map. Maps grow from 7x7 to 9x12 over the first 36 levels, then
vary. Isolation is first needed on level 9, and trial and error from level 22.

The generator (`src/games/bridges/core/levels.ts`) grows a map from one island: again and
again it picks an island and a direction and puts a new island some way off, joined by
one or two bridges. Islands never sit next to each other (even at a corner), and new
bridges never cross old ones. A few extra bridges go between islands that already see
each other, and each island's number is its bridge total. The reasoning solver then has
to finish the map without guessing (which proves it has one answer); of up to 80 maps
(700 for the hardest levels), the first that needs exactly the level's hardest step is
kept.

The solver (`src/games/bridges/core/solver.ts`) keeps, for each link, the bridge counts
(0, 1 or 2) still possible, and narrows them in waves, always with the easiest step that
settles anything:

| Label | Hardest step needed |
| --- | --- |
| Easy | Counting: an island's number against what its links can still give, and no crossing a certain bridge |
| Medium | Isolation: no bridge may finish off a group of islands that isn't the whole map, and a group with one way out must take it |
| Hard | Trial and error: a count that leads, by the steps above, to an impossible map is ruled out |
| Super Hard | Trial and error, three or more times |

Hover the label in game to see the step.

## Shape Fit

An 8x8 board and a tray of three pieces made of squares. Drag a piece onto the board; a
full row or column clears. Once all three are placed, three more arrive. The game ends
when none of the pieces left in the tray fits anywhere.

### Rules

- **Placing:** press a piece in the tray and drag it up. It rides above the finger, so the
  thumb never hides where it will land, and a shadow on the board shows the spot and
  lights up the lines it would clear. Let go over a spot that fits to place it; anywhere
  else it goes back to the tray. Pieces never turn.
- **Points:** one per square placed, plus 10, 40 or 90 for clearing one, two or three
  lines at once (10 x lines squared). Clearing on placements in a row is a streak: each
  clear after the first in a streak adds 10 more per step. A placement that clears
  nothing ends the streak. The title shows the streak while it lasts.
- **Faded pieces** in the tray fit nowhere right now.
- **Undo:** once per game.
- **Saving:** a game in progress is kept, so you can leave and Continue later. Best
  score, most lines in a game and games played are kept too.

### Pieces and fairness

There are 37 pieces (`src/games/shapes/core/pieces.ts`): dots, lines of two to five,
squares and blocks, small and large corners, L, T, S and Z shapes, each turned every way
it can go (a piece never turns once dealt). Each has a weight at the start of a game and
one for later; over the first 60 pieces the draw shifts from mostly small, easy pieces
toward more of the big, awkward ones.

Each new set of three is checked: the game (`src/games/shapes/core/game.ts`) tries up to
8 sets for one whose pieces can all be placed, one after another, in some order (a short
search capped by steps). Failing that it takes a set where at least one piece fits. So a
game ends because of how the board was filled, not because of an unlucky deal. In
simulation, a player who prefers clearing lines and otherwise places pieces snugly lasts
a median of about 150 pieces; one placing at random lasts about 17.

## Layer Pairs

A pile of picture tiles in layers. A tile is free when nothing lies on it (even partly)
and its left or right side is open. Tap a free tile, then a free tile with the same
picture, to lift both off. Clear the table.

### Rules

- **Picking:** the first tap lifts a tile a little; tapping it again puts it down, and
  tapping a free tile with a different picture picks that one instead. Covered tiles
  are dimmed and give a small shake when tapped.
- **Every pile can be cleared**, but some pairs lead to a dead end: when a picture has
  four free copies, which two go first can matter.
- **Undo:** unlimited and free.
- **Hints:** 3 per level. Each one points at a pair that still leads to a clear table (or
  says there is no way out from here, for free). Each hint used costs a star.
- **Shuffles:** 3 per level. A shuffle deals the pictures still on the table again so that
  they can all be cleared. Each costs a star. When no free pair is left, a screen offers
  Undo, Shuffle or Restart.
- **Stars:** three, minus one for each hint or shuffle used, never below one. Best times
  are kept.
- **HUD:** how many free tiles have a free match right now, and how many tiles are left.
- **Pictures** are 8 shapes, each in its own colour, in 3 styles (solid, ring, or two
  small ones), so every picture can be told apart by shape and style alone. They are
  plain shapes, not taken from any traditional tile set.

### Levels

Levels 1 to 3 are tutorials (one layer, then two). After that, level N is generated from
N as the seed, so everyone gets the same pile. Piles grow from a 5x4 base with two layers
to 8x7 with three or four over the first 35 levels (up to about 116 tiles), then vary.

The layout (`src/games/pairs/core/levels.ts`) is mirrored left to right: a bottom block
of tiles with some edge tiles left out, then layers that sit either straight on the
tiles below or straddling four of them, only where every part rests on a tile. Pictures
are dealt backwards (`src/games/pairs/core/solver.ts`): again and again two tiles that
are free in what is left get the same picture and are lifted off. Played forwards, those
pairs in reverse order clear the pile, so every deal can be cleared. Of up to 30 deals,
the one closest to the level's difficulty target is kept. More different pictures make
dead ends more likely (fewer matches to choose from), so the number of pictures grows
with the levels too.

The difficulty label is the share of 60 random playthroughs (each taking any free pair
at random) that get stuck:

| Label | Random playthroughs that get stuck |
| --- | --- |
| Easy | under 20% |
| Medium | 20% to 44% |
| Hard | 45% to 69% |
| Super Hard | 70% or more |

Hover the label in game to see the number. Hints search for a way to clear the rest
(depth first, trying first the pairs that uncover the most, remembering dead ends),
capped by steps; on the biggest piles that takes well under a tenth of a second.

## Cage Sums

Fill a square grid so that every row and every column holds each number from 1 to the
grid's size exactly once. The grid is split into outlined cages, each with a target and a
sign in its corner: the numbers in the cage must make the target with that sign. For −
and ÷ (always two squares), take the smaller number from, or into, the larger one. A
cage with no sign is a single square showing its own number. A number may repeat in a
cage, as long as the two are not in the same row or column. Every board has exactly one
answer.

### Rules

Entering numbers, notes, hearts, stars and hints work as in Number Place (the same
session and number pad, `src/games/cages/game/session.ts`):

- **Entering numbers:** tap a square, then a number on the pad. Keyboard: numbers, arrow
  keys to move, N for notes, Backspace to clear notes.
- **Notes:** switch to Notes to pencil in what a square could be. They sit below the
  cage's label.
- **Hearts:** every number is checked straight away; a wrong one isn't placed and costs
  one of three hearts. Out of hearts: keep going for no stars, or restart.
- **Stars** equal the hearts left when the grid is full.
- **Hints:** 3 per level, free. Each one fills the next square the steps below can work
  out from the board as it is.

### Levels

Levels 1 to 3 are tutorials (4x4 with sums only, 4x4 with every sign, then 5x5). After
that, level N is generated from N as the seed, so everyone gets the same board. Grids
grow from 5x5 to 8x8 over the first 35 levels, then vary, with smaller ones back now and
then as breathers. Pairs and pointing are first needed on level 10, and trial and error
from level 24.

The generator (`src/games/cages/core/levels.ts`) shuffles the rows, columns and numbers
of a simple Latin square, splits it into cages of two to four squares (with at most one
or two single squares), and gives each cage a sign its numbers allow (− and ÷ are
favoured for two-square cages when they work). A reasoning solver then has to finish the
board without guessing, which proves it has one answer. Of up to 120 boards (150 for the
hardest levels), the first that needs exactly the level's hardest step is kept; if none
does, the next step up is tried. Each attempt has a work budget (in cage-filling steps,
not time), so every device builds the same board, mostly in well under a second.

The solver (`src/games/cages/core/solver.ts`) keeps the numbers each square could still
be and works in waves, always with the easiest step that narrows anything:

| Label | Hardest step needed |
| --- | --- |
| Easy | Singles (a settled square clears its row and column; a number with one place left in a line goes there) and cage combinations (a number no working way of filling the cage uses is out) |
| Medium | Pairs and pointing: two squares in a line with the same two numbers left, or a number every way of filling a cage puts in the same line |
| Hard | Trial and error: a number that leads, by the steps above, to an impossible board is out |
| Super Hard | Trial and error, three or more times |

Hover the label in game to see the step.

## Peg Jump

Pegs sit in holes on a board. Jump a peg over a neighbouring peg (across or up and
down, never diagonally) into an empty hole just beyond; the jumped peg is taken off.
Keep going until no jump is left.

### Rules

- **Jumping:** tap a peg to pick it up (the holes it can jump to are marked), then tap
  one of them. Or drag the peg straight onto the hole. A peg that can't jump gives a
  small shake; tapping a picked-up peg puts it down.
- **Finishing:** when no jump is left, the level is cleared if one or two pegs remain.
  Three or more is not a clear: a screen offers Undo or Restart.
- **Stars:** one peg on the ringed hole (drawn dashed) is three, one peg anywhere else
  two, two pegs one. Each hint used costs a star (never below one on a clear).
- **Undo:** unlimited and free.
- **Hints:** 3 per level. Each one picks up a peg and rings the hole for a jump that can
  still finish with one peg on the ring (or, if that's no longer possible, one peg
  anywhere). If neither is possible from here, it says so for free.

### Levels

Levels 1 to 3 are tutorials (two pegs in a row, then 4 and 6 pegs). After that, level N
is generated from N as the seed, so everyone gets the same board. Boards grow from 5x5
to 7x7, and pegs from about 6 to 20, over the first 35 levels, then vary, with the odd
easier breather.

The board (`src/games/pegs/core/levels.ts`) is the union of one to three centred bars and
blocks, so it is mirrored both ways (crosses, fat pluses, wide blocks). Each level is
built backwards from one peg on the ringed hole: a reverse jump takes a peg and puts pegs
on the two holes behind it, which played forwards is an ordinary jump. So every level
can be finished with one peg on the ring. The solver (`src/games/pegs/core/solver.ts`) is
a depth-first search that remembers dead ends, capped by positions (60,000 while
building, 150,000 for hints); boards that need more are skipped. Of up to 40 boards, the
one closest to the level's difficulty target is kept.

The difficulty label is the search effort in bits: log2 of the positions the solver
looks at, trying jumps in a fixed order, before it finds a finish on the ring. A board
where most jumps lead nowhere takes longer to search, and to think through:

| Label | Search effort |
| --- | --- |
| Easy | under 4 bits |
| Medium | 4 to 6.9 |
| Hard | 7 to 9.9 |
| Super Hard | 10 or more |

Hover the label in game to see the number.

## Tumble Block

A tall block, one square by two, stands on a path of squares over nothing. Each swipe
tips it one way: a standing block falls flat across two squares, and a lying one either
rolls over sideways or stands back up. Stand it upright on the hole to finish.

### Rules

- **Moving:** swipe anywhere on the board, one tip per swipe. Arrow keys and WASD work
  too; Z undoes.
- **Wasted moves:** a tip that would leave any part of the block over nothing (or over a
  closed bridge), or stand it on a cracked square, is wasted: it counts as a move, but the
  block stays where it was.
- **Cracked squares** (from level 8) hold a lying block but break under a standing one.
- **Switches and bridges** (from level 14): tipping onto a switch, with either end of the
  block, opens its bridges, and doing it again closes them. Each switch has its own
  colour, and closed bridges show as a dashed outline in that colour. A switch board
  always needs its switch.
- **Moves and stars:** each level has a par from the solver: the fewest moves to the hole.
  Within par is three stars, within par + 25% two, otherwise one. Each hint used costs a
  star (never below one).
- **Undo:** unlimited and free: the move doesn't count.
- **Hints:** 3 per level. Each one shows an arrow for the way a shortest route from here
  tips next.

### Levels

Levels 1 to 3 are tutorials. After that, level N is generated from N as the seed, so
everyone gets the same board. Boards grow from about 7x8 to 9x12 over the first 35
levels, and par from about 6 to 18, then vary, with the odd easier breather.

The generator (`src/games/tumble/core/levels.ts`) grows each board from a random walk of
the block: every square it touches becomes floor, it starts standing, and the hole is
where the walk ends standing. Extra squares go round the walk, some plain squares crack,
and for a switch level a short run of squares the walk reached late becomes bridges
(closed), with the switch on a square it passed earlier. A breadth-first search over
the block's square, pose and which bridges are open (`src/games/tumble/core/solver.ts`)
then finds the true shortest way, which is often not the walk. Of up to 60 boards (200
with switches), the one closest to the level's difficulty target is kept.

The label comes from par weighted by detours: par plus two for every move of a shortest
answer that takes the block further from the hole. A board crossed head on is easy; one
where you must wander away to come back the right way up is not:

| Label | Weighted par |
| --- | --- |
| Easy | under 10 |
| Medium | 10 to 16 |
| Hard | 17 to 24 |
| Super Hard | 25 or more |

Hover the label in game to see the numbers. The view is cropped to the squares in use, so
small boards fill the screen.

## Pair Flip

A grid of face-down cards, each picture on exactly two of them. Tap a card to turn it
over, then another: a matching pair stays face up; two different pictures show for a
moment and turn back. Find every pair.

### Rules

- **Turning cards:** a missed pair turns back by itself after about a second; tap
  anywhere to turn it back early and carry on.
- **Look-alike pictures** (from level 10, then on about half the levels): the pictures
  share a shape and colour and differ only in style (solid, ring or twin).
- **Swapping cards** (from level 18, then on about half the levels): every third miss,
  two face-down cards with different pictures slide past each other into each other's
  places. They are outlined while they move, so you can follow them.
- **Stars** come from misses against par: par or fewer is three, up to twice par two,
  otherwise one. Best times are kept.
- **Pictures** are the same plain shapes as Layer Pairs (8 shapes, each in its own colour,
  in 3 styles), so every picture can be told apart without colour. A face-down card
  carries no picture at all (not even in its label for screen readers).

### Levels

Levels 1 to 3 are tutorials (3x2, 3x4 and 4x4). After that, level N is dealt from N as
the seed (`src/games/flip/core/levels.ts`), so everyone gets the same grid. Grids grow
from 4x4 (8 pairs) to 6x6 (18 pairs) over the first 30 levels, then vary, with the odd
smaller breather. Normal levels spread their pictures over as many shapes as possible;
look-alike levels use every style of a few shapes.

There is no solver: par is three misses for every four pairs, rounded up. Even a
perfect memory misses about 0.6 times per pair on average, since the first look at each
card is a guess, so par can be met with care but not by luck alone.

The label comes from the number of pairs, plus 5 for look-alike pictures and 7 for
swapping cards:

| Label | Score |
| --- | --- |
| Easy | under 10 |
| Medium | 10 to 14 |
| Hard | 15 to 20 |
| Super Hard | 21 or more |

The cards are plain HTML buttons that flip with CSS (no canvas), and the flip is
skipped when the device asks for reduced motion.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (generators, solvers, rules)
npm run build    # production build in dist/
```

Built with Vite, TypeScript and Canvas 2D. There are no runtime dependencies. Progress
and settings are stored in the browser's localStorage (`arrow-escape.v1`,
`sandglass.v1`, `snake.v1`, `snake-trails.v1`, `squeeze.v1`, `pipes.v1`, `lines.v1`, `crates.v1`, `lights.v1`, `ice.v1`, `picture.v1`, `numbers.v1`, `tents.v1`, `mines.v1`, `bricks.v1`, `stack.v1`, `lanes.v1`, `merge.v1`, `words.v1`, `stars.v1`, `loop.v1`, `fruit.v1`, `codes.v1`, `beams.v1`, `tones.v1`, `bridges.v1`, `shapes.v1`, `pairs.v1`, `cages.v1`, `pegs.v1`, `tumble.v1`, `flip.v1` and `pocket-puzzles.settings.v1`).

### Layout

```
src/main.ts            the collection: home screen, routing (#/arrows, #/sandglass, #/snake, #/snake-trails, #/squeeze, #/pipes, #/lines, #/crates, #/lights, #/ice, #/picture, #/numbers, #/tents, #/mines, #/bricks, #/stack, #/lanes, #/merge, #/words, #/stars, #/loop, #/fruit), settings
src/shared/            sound, themes, icons, update check, seeded RNG, worker level loader
src/games/arrows/      Arrow Escape: core rules, generator and solver, rendering, input, UI
src/games/sandglass/   Sandglass: the same split
src/games/snake/       Snake and Snake Trails: rules, level builder, renderer, swipe input, UI
src/games/squeeze/     Squeeze: the same split as Sandglass
src/games/pipes/       Pipe Link: the same split, plus core/tree.ts for the pipe networks
src/games/lines/       Colour Lines: the same split, plus core/paths.ts for growing the lines
src/games/crates/      Crate Push: the same split, plus core/room.ts for carving rooms
src/games/lights/      Light Switch: the same split
src/games/ice/         Ice Slide: the same split
src/games/picture/     Picture Grid: the same split, plus core/line.ts (line solver) and core/pictures.ts (drawings)
src/games/numbers/     Number Place: the same split, plus core/grid.ts (counting answers) and core/techniques.ts
src/games/tents/       Tents and Trees: the same split
src/games/mines/       Hidden Mines: the same split
src/games/bricks/      Brick Breaker: rules in core/sim.ts (fixed steps), walls in core/levels.ts
src/games/stack/       Stack Tower: rules in core/sim.ts, no levels
src/games/lanes/       Lane Dodger: rules in core/sim.ts, the course in core/course.ts
src/games/merge/       Merge Tiles: sliding in core/rules.ts, a game (spawns, stones) in core/game.ts
src/games/words/       Word Grid: word search in core/trie.ts, the word list in data/words.txt
src/games/stars/       Star Battle: stars and regions in core/layout.ts, search and reasoning in core/solver.ts
src/games/fruit/       Fruit Drop: physics and rules in core/sim.ts (fixed steps), no levels
src/games/raiders/     Star Raiders: rules in core/sim.ts (fixed steps), endless waves
tools/build-words.mjs  builds Word Grid's word list from 12dicts
```

Each game exports a `GameModule` (`src/games/types.ts`): it builds its own screens and
gets shared services (modal, toast, theme, sound) from the shell. Every game's element
ids start with its own two-letter prefix (Snake uses `sn-` and Snake Trails `st-`, so
Stack Tower uses `tw-`); two games sharing a prefix would show each other's screens. Adding a game means
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
