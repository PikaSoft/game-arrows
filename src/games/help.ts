/**
 * How to play each game, shown by the ? button in a game's top bar and the How to play
 * button on its home screen. The tips include every tutorial tip word for word (a test
 * checks this), so anything a tutorial level teaches can be looked up again later.
 */
export interface Help {
  /** One or two sentences on what the game is about. */
  goal: string;
  tips: string[];
}

export const HELP: Record<string, Help> = {
  arrows: {
    goal: 'Tap an arrow to send it off the board. It can only go if nothing is in its way. Clear every arrow to finish.',
    tips: [
      'Tap an arrow. If nothing is in its way, it slides off the board.',
      'Arrows in front block the way. Clear them first.',
      'Bent arrows follow their own path out. Only the line ahead of the head matters.',
      'Tapping a blocked arrow costs a heart. Keep all three for 3 stars.',
      'Free shows how many arrows can leave right now. Stuck? Tap the bulb for a hint.',
    ],
  },
  sandglass: {
    goal: 'Pour sand from bottle to bottle until each one holds a single colour.',
    tips: [
      'Tap a bottle, then tap another to pour. Sand only lands on the same colour or in an empty bottle.',
      'You can also drag a bottle onto another. Finish with one colour per bottle.',
      'Undo is free. Once per level you can add an empty bottle, but that caps you at two stars.',
      'Finish within par for three stars.',
      'Some sand is covered. A layer shows its colour once the sand above it is poured off.',
      'Some colours are liquid. Sand sinks below liquid, and only the top colour pours. Liquid lands only on the same liquid or in an empty bottle.',
    ],
  },
  snake: {
    goal: 'Eat apples, grow longer, and keep clear of the edges, your own tail and the poison.',
    tips: [
      'Swipe anywhere to steer, or use the arrow keys. One drag can make several turns.',
      'Each apple makes you one longer, and the snake speeds up every 5 apples.',
      'The poison berry jumps to where your tail just was every so often. It flickers just before it moves.',
      'Moving into the square your tail is leaving is safe.',
      'Pick Slow, Normal or Fast on the home screen. Your best is kept for each speed.',
    ],
  },
  'snake-trails': {
    goal: 'Steer around the walls and the poison, and eat enough apples to clear each level.',
    tips: [
      'Swipe to steer. Eat 6 apples, and keep off the edges and your own tail.',
      'Walls are solid too. Go around the bar.',
      'Each apple makes you longer. Plan a loop before you get boxed in.',
      'The poison berry jumps to where your tail just was every so often. It flickers just before it moves.',
      'Finish within par time for three stars. A crash means trying the level again.',
    ],
  },
  squeeze: {
    goal: 'Slide the blocks out through the gaps in the frame. Each one needs a gap it fits.',
    tips: [
      'Drag a block out through the gap in the frame. Clear every block to finish.',
      'A block only fits through a gap as wide as it is. Shapes never turn.',
      'Slide blocks aside to clear the way. One drag is one move, however far it goes.',
      'Finish within par for three stars. Undo is free.',
      'While you drag a block, the gaps it fits through light up.',
      'A coloured gate only lets blocks of its colour through. Other gaps take any block.',
    ],
  },
  pipes: {
    goal: 'Turn the tiles until water flows from the tap to every pipe, with no loose ends.',
    tips: [
      'Tap a tile to turn it. Join every pipe to the tap so water reaches them all.',
      'Pipes at the edge can never point off the board. Start there.',
      'Long-press a tile to lock it once you are sure. Locked tiles do not turn.',
      'Finish within par taps for three stars. Stuck? A hint turns one tile into place.',
    ],
  },
  lines: {
    goal: "Join each pair of dots with a line. Lines can't cross, and together they fill the board.",
    tips: [
      'Drag from a dot to its twin to join them. Fill every square to finish.',
      'Lines cannot cross. Drawing over another line cuts it back.',
      'Stuck? A hint draws one line for you, but costs a star.',
    ],
  },
  crates: {
    goal: 'Push every crate onto a target. Crates can only be pushed, never pulled.',
    tips: [
      'Swipe to walk. Walk into a crate to push it. Get every crate onto a target.',
      'Crates can only be pushed, never pulled. A crate in a corner is stuck there.',
      'Tap any floor to walk there. Only pushes count toward par.',
      'Undo is free and unlimited. Stuck? A hint plays the next push for you.',
    ],
  },
  lights: {
    goal: 'Each tap switches a light and the lights beside it. Turn every light off.',
    tips: [
      'Tap a light to switch it and the lights beside it. Turn every light off.',
      'Tapping the same light twice puts it back. The order of taps never matters.',
      'Finish in par taps or fewer for three stars.',
      'On this board a tap switches the lights at its corners instead of its sides.',
      'These lights have three steps: bright, dim, off. Each tap moves them one step on.',
    ],
  },
  ice: {
    goal: 'Swipe to slide the puck across the ice. It only stops at a rock or the edge. Stop it on the flag.',
    tips: [
      'Swipe to slide the puck. It only stops at a rock or the edge. Stop it on the flag.',
      'Sliding past the flag is not enough: the puck has to stop on it.',
      'Reach the flag in par swipes or fewer for three stars.',
      'Holes! A puck that slides over one falls in, and the swipe is wasted.',
      'Two pucks slide together. Each has its own flag, and they stop against each other.',
    ],
  },
  picture: {
    goal: 'The numbers tell you the runs of filled squares in each row and column. Work them out to reveal a picture.',
    tips: [
      'Each number is a run of filled squares in that row or column, in order, with gaps between. Tap to fill.',
      'Hold a square for a moment to cross it out as empty (or switch to Cross). A wrong guess costs a heart.',
      'Drag to paint several squares in one stroke; hold first to paint crosses. Finished lines fade their numbers.',
      'The Fill / Cross switch under the board sets what a tap does.',
    ],
  },
  numbers: {
    goal: 'Fill the grid so every row, column and box holds each digit exactly once.',
    tips: [
      'Fill the grid so every row, column and box has 1 to 6 once each. Tap a square, then a digit.',
      'Switch on Notes to pencil in the digits a square could be. A wrong digit costs a heart.',
      'The full-size grid: 1 to 9 in every row, column and 3x3 box.',
    ],
  },
  tents: {
    goal: 'Pitch a tent beside every tree. The numbers say how many tents each row and column holds.',
    tips: [
      'Put a tent next to every tree (above, below or to the side). The numbers say how many tents each row and column holds.',
      'Tents never touch each other, not even at the corners. Switch to Grass to mark squares that stay empty.',
      'A wrong mark costs a heart. Finished rows and columns fill the rest with grass.',
    ],
  },
  mines: {
    goal: 'Uncover every safe square. Each number says how many mines touch it. Every board can be solved without guessing.',
    tips: [
      'Each number says how many of the eight squares around it hide a mine. Tap to uncover a safe square.',
      'Hold a square to flag a mine (or switch to Flag). Hitting a mine costs a heart.',
      'Tap a number whose mines are all flagged to uncover the rest around it.',
    ],
  },
  bricks: {
    goal: 'Keep the ball in play with the paddle and break every brick. Three balls per level.',
    tips: [
      'Drag anywhere to move the paddle, then tap to launch. Break every brick.',
      'Darker bricks take more hits. Where the ball meets the paddle sets its angle: the edges send it wide.',
      'Catch falling capsules: W widens the paddle, S slows the ball, and + splits it into three.',
      'Steel bricks never break. Bounce the ball round them.',
      'Dropping your last ball in play costs a heart. Stars equal the hearts left when the wall is gone.',
    ],
  },
  stack: {
    goal: 'Tap to drop each sliding block onto the tower. Whatever hangs over the edge is cut off. How high can you go?',
    tips: [
      'Tap anywhere to drop the block. Miss the tower completely and the game is over.',
      'A drop that lands dead on is perfect: nothing is cut off.',
      'After three perfect drops in a row, each further one grows the block back a little.',
      'The block slides faster as the tower grows.',
    ],
  },
  lanes: {
    goal: 'Run as far as you can. Swipe left or right to change lanes, and swipe up to jump the low hurdles.',
    tips: [
      'Walls must be dodged. Low hurdles can be dodged or jumped.',
      'You can change lanes in the air.',
      'Pick up coins on the way. The run gets faster the further you go.',
      'The pause button stops the run, and so does opening this card.',
    ],
  },
  merge: {
    goal: 'Swipe to slide every tile. Two equal tiles that meet merge into one worth both. Stones get in the way, then crumble.',
    tips: [
      'Slide two equal tiles together to merge them. Keep space free: a full board with no pairs ends the game.',
      'Each tile merges once per swipe, so four 2s make two 4s, not an 8.',
      'Stones do not slide. The number on a stone is how many moves it has left.',
      'You can undo one move per game. A game in progress is saved, so you can Continue later.',
    ],
  },
  words: {
    goal: 'Trace words through touching letters before time runs out. Find enough of them for stars.',
    tips: [
      'Drag through touching letters (diagonals too) to spell a word of 3 or more letters. Let go to try it.',
      'Longer words score far more. Find enough words before time runs out to earn stars.',
      'A bigger grid, and a longer round to match.',
      'Stuck? A hint rings the squares where a word starts.',
    ],
  },
  stars: {
    goal: 'Place stars so every row, column and coloured region has the same number, and no two stars touch.',
    tips: [
      'Put one star in every row, every column and every coloured region. Stars never touch, not even at the corners.',
      'Hold a square for a moment to mark it with a dot (it has no star), or switch to Dot. A wrong mark costs a heart.',
      'Drag to mark several squares at once. Squares around a star fill with dots by themselves.',
      'A big one: two stars in every row, column and region.',
    ],
  },
  loop: {
    goal: 'Tip crates of cubes onto the turning belt. Trays pick up the cubes of their own colour. Ship every tray without jamming the belt.',
    tips: [
      'Tap a column to tip its front crate onto the belt. Each tray below picks up the cubes of its own colour.',
      'A full tray ships out and the next one slides up. Only the front tray of each bay collects.',
      'Cubes that no front tray wants keep circling and take up room. Tip the crates your trays are waiting for first.',
      'If a crate cannot drop its cubes within one lap, the belt jams. Undo takes back your last tap. Clear a level with no undos for three stars.',
      'Now there is a clock. It starts on your first tap: ship every tray before it runs out.',
      'Some crates hold two colours. Both lots of cubes drop together.',
      'Crates marked ? show their colours only when they reach the front.',
      'One or two undos leave two stars; more leave one. You can tap again before the belt has cleared, but that is how belts jam.',
    ],
  },
};
