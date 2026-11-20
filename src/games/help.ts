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
      'Once the belt has room for every cube still to come, nothing can jam: the rest plays out by itself and the clock stops.',
      'One or two undos leave two stars; more leave one. You can tap again before the belt has cleared, but that is how belts jam.',
    ],
  },
  fruit: {
    goal: 'Drop fruit into the bucket. Two of the same kind that touch join into one bigger fruit. Score as much as you can before the bucket overflows.',
    tips: [
      'Drag to aim and let go to drop. A tap drops the fruit where you tapped. With keys, use the arrows to aim and Space to drop.',
      'Fruit falls, rolls and gets pushed about by other fruit. A join can set off another one beside it.',
      'On a phone, tip it a little to one side and the bucket leans a few degrees that way, so loose fruit rolls over. Give the phone a shake and the fruit hop a little, which can knock a stuck fruit loose. You can turn either off in Settings while playing.',
      'Only the five smallest fruits are handed to you. The bigger ones (up to the melon) have to be made by joining. Bigger fruit scores more.',
      'The corner shows the fruit that comes next. Keep equal fruit close together and the big ones low down.',
      'When fruit stays above the dashed rim, the rim flashes red. If it is still there two seconds later, the game is over.',
      'Two melons that touch pop and clear some room, for a bonus. A game in progress is kept: come back and Continue.',
    ],
  },
  raiders: {
    goal: 'Raiders march down in waves, firing as they come. Your ship fires by itself: slide it to aim and to dodge. Score as much as you can before you run out of lives.',
    tips: [
      'Drag anywhere to slide the ship. It follows your finger without jumping under it. With keys, use the arrows to move and Space to pause.',
      'Your ship fires on its own, two shots at a time. Line it up under the raiders.',
      'The formation steps down each time it reaches an edge, and speeds up as raiders fall. If a raider reaches your row, the game is over.',
      'The shields soak up shots from both sides and wear away. Shoot a bolt to cancel it out.',
      'Top-row raiders score 30, middle rows 20, bottom rows 10. The ship crossing the top scores 50 to 300. Clearing a wave adds 100 times its number.',
      'A hit costs a heart and the ship blinks for a moment. Every 5000 points brings an extra life, up to five.',
    ],
  },
  codes: {
    goal: 'Guess the hidden row of colours. After each guess, dots tell you how many pegs are right and how many are the right colour in the wrong place.',
    tips: [
      'Guess the hidden code. A filled dot is a right colour in the right place; a hollow dot is a right colour in the wrong place.',
      "The dots don't say which pegs they mean. Compare your guesses to work it out.",
      'Crack the code in par guesses or fewer for three stars.',
      'From now on the code can use a colour more than once.',
      'Tap a colour to fill the selected slot. Tap a slot to select it, and tap it again to empty it. Keys 1 to 8, Backspace and Enter work too.',
      'Each colour has its own shape, so you can play without telling colours apart.',
      'The bulb fills the row with a code that fits every answer so far. Each hint costs a star.',
      'Guesses fill from the bottom up. Long press a filled slot to lock it in: it fills itself on every guess after. Long press again (or press L) to unlock.',
      'Long press a colour below the board to grey it out once you know it is not in the code. Long press again (or Shift and its number) to bring it back.',
    ],
  },
  beams: {
    goal: 'Tap mirrors to turn them. Guide every beam from its lamp to the target of the same colour, and light every crystal on the way.',
    tips: [
      'Tap a mirror to turn it. Guide the beam from the lamp to the target of the same colour.',
      'Each lamp needs the target of its own colour. Beams pass straight through each other.',
      'Mirrors with a pin are fixed. Walls stop a beam dead.',
      'Finish within par taps for three stars. Stuck? A hint turns one mirror into place.',
      'Crystals must be lit by a beam too. Any colour will do.',
      'Each colour has its own shape on its lamp and target, so you can play without telling colours apart.',
      'Undo is free, but an undone tap still counts.',
    ],
  },
  tones: {
    goal: 'Fill every square orange or blue. Never three of one colour in a row, every row and column half and half, and no two rows (or columns) the same.',
    tips: [
      'Fill every square, orange or blue. Never three of one colour in a row, across or down.',
      'Every row and column holds as many orange as blue. The edge numbers count what each line still needs.',
      "Tap a square to place the switch's colour; hold it for the other one. A wrong square costs a heart.",
      'No two rows may be the same, and no two columns. A finished line can rule out a copy.',
      'Two alike side by side, or with one gap between, means the squares beside or between them are the other colour.',
      'Drag along a row or column to fill several squares with one colour. A stroke stops at the first mistake.',
      'Orange is a filled disc and blue a ring, so you can play without telling colours apart.',
      'Hints are free: each one fills a square that can be worked out from the board as it is.',
    ],
  },
  bridges: {
    goal: 'Join the islands with straight bridges. Each number says how many bridges that island needs, bridges never cross, and every island must end up joined in one group.',
    tips: [
      'Drag from an island toward another to build a bridge. Each number says how many bridges that island needs.',
      'Two islands can share one or two bridges. Drag again for the second one.',
      'Bridges run straight and never cross, and every island must end up joined in one group.',
      'You can also tap the water between two islands. A wrong bridge costs a heart.',
      "Don't cut a group off: two 1s joined together could never reach the rest.",
      'An island fills in once it has all its bridges.',
      'Hints are free: each one builds a bridge that can be worked out from the board as it is.',
    ],
  },
  shapes: {
    goal: 'Drag pieces onto the board. A full row or column clears. Place all three pieces to get three more; the game ends when none of them fits.',
    tips: [
      'Drag a piece onto the board. Fill a whole row or column to clear it. The game ends when no piece fits.',
      'Pieces never turn. A shadow shows where the piece will land and lights up the lines it would clear.',
      'Clearing several lines at once scores far more: 10, 40, 90 points for one, two, three lines.',
      'Clear on placements in a row for a streak bonus. A piece that clears nothing ends the streak.',
      'A faded piece in the tray fits nowhere right now. Clear some room for it.',
      'Undo once per game. A game in progress is kept, so you can leave and continue later.',
    ],
  },
  pairs: {
    goal: 'Clear the pile two at a time: tap two free tiles with the same picture. A tile is free when nothing covers it and its left or right side is open.',
    tips: [
      'Tap two matching free tiles to clear them. A tile is free when nothing lies on it and its left or right side is open.',
      'Tiles on top cover the ones below. Free tiles are bright; covered ones are dim.',
      'Some pairs lead to a dead end. Undo is free; each hint or shuffle costs a star.',
      'Every pile can be cleared. When a picture has four free copies, think about which pair to take.',
      'A hint points at a pair that still leads to a clear table. A shuffle deals the tiles left so they can all be cleared.',
      'Pictures differ by shape and style (solid, ring or twin), so you can play without telling colours apart.',
    ],
  },
  cages: {
    goal: 'Fill the grid so every row and column has each number once. The numbers in each outlined cage must make its target with its sign.',
    tips: [
      'Fill the grid so every row and column has 1 to 4 once each. The numbers in each outlined cage add up to its target.',
      'A cage can also use −, × or ÷. For − and ÷, take the smaller number from or into the larger one.',
      'Switch on Notes to pencil in what a square could be. A wrong number costs a heart.',
      'A number may repeat inside a cage, as long as the two are not in the same row or column.',
      'A cage with no sign is a single square: it shows its own number.',
      'Hints are free: each one fills the next square that can be worked out from the board as it is.',
    ],
  },
  pegs: {
    goal: 'Jump a peg over its neighbour into an empty hole; the jumped peg is taken off. Keep going until no jump is left, and finish with as few pegs as you can.',
    tips: [
      'Tap a peg, then the empty hole two steps past its neighbour. It jumps over, and the peg it jumps is taken off.',
      'Finish with one peg on the ringed hole for three stars. One peg anywhere else is two; two pegs left is one.',
      'Undo is free. A hint shows a jump that can still finish on the ring, for a star.',
      'Jumps go across or up and down, never diagonally. You can also drag a peg onto its hole.',
      'Ending with three or more pegs and no jump left does not clear the level: undo and try another way.',
    ],
  },
  tumble: {
    goal: 'Swipe to tip a tall block end over end across the tiles. Stand it upright in the hole to finish.',
    tips: [
      'Swipe to tip the block over. Stand it upright on the hole to finish.',
      "Don't let any part hang over the edge: the block topples off and that move is wasted.",
      'Reach the hole in par moves or fewer for three stars. Undo is free.',
      'Cracked squares hold a lying block, but break under a standing one.',
      'Rolling onto a switch opens or closes the bridges of its colour.',
      'A block lying down only goes into the hole once it stands up on it. Arrow keys and WASD work too; Z undoes.',
      'A hint points the way a shortest route tips next. Each hint costs a star.',
    ],
  },
  flip: {
    goal: 'Turn cards over two at a time and find every matching pair. Remember where each picture was.',
    tips: [
      'Tap two cards to turn them over. A matching pair stays face up; find every pair.',
      'Remember where each picture was. Finish within par misses for three stars.',
      'Tap anywhere to turn a missed pair back early and keep going.',
      'Look closely: some pictures share a shape and colour, and differ only in style.',
      'Every third miss, two face-down cards swap places. Watch them move.',
      'Within par is three stars, up to twice par two, otherwise one.',
      'Pictures differ by shape and style (solid, ring or twin), so you can play without telling colours apart.',
    ],
  },
  fence: {
    goal: 'Draw one closed fence along the dotted lines between dots. Each number says how many of its square\'s four sides the fence uses.',
    tips: [
      'Draw one closed fence along the dotted lines. Each number says how many of its four sides the fence uses.',
      "Switch to Cross, or hold a line, to mark where the fence can't go. A wrong mark costs a heart.",
      'The fence is a single loop: it never branches, never crosses itself and never splits in two.',
      'Every square is inside the fence or outside. A fence between two squares puts them on different sides.',
      'Crosses fill in by themselves round a 0, at a dot with two fences, and round a number that has all its fence.',
      'Drag along the lines to mark several at once. A stroke stops at the first mistake.',
      'Hints are free: each one reveals a line that can be worked out from the board as it is.',
    ],
  },
  glider: {
    goal: 'Fly a glider as far as you can through a winding cave. Hold anywhere to climb, let go to sink, and don\'t touch the walls.',
    tips: [
      'Hold anywhere to climb, let go to sink. Hold to start.',
      'The glider keeps its speed up or down for a moment: let go a little before you reach the height you want.',
      'The cave narrows and twists more, and the glider speeds up, the further you go.',
      'Gems sit near the walls. Each one counts, but flying close to a wall is a risk.',
      'Space, Up or W work as hold too. P (or the pause button) pauses; so does leaving the tab or opening a card.',
    ],
  },
  hop: {
    goal: 'Hop a chick across the road and the stream into the nests on the far bank. Fill all four nests to go up a level. You have three lives.',
    tips: [
      'Swipe or use the arrow keys to hop. A tap hops forward. Swipe to start.',
      'Cars and trucks are dangerous; the grass in the middle and at the start is safe.',
      'In the stream, stand on logs and lily pads; they carry you along. The water, or being carried off the side, costs a life.',
      'Lily pads with a wobble are about to dip under for a moment. Get off them in time.',
      'Land right in an empty nest. The hedge between nests, or a nest already full, costs a life.',
      'Each life has 30 seconds, shown by the bar above the board. Seconds left when you reach a nest are worth extra points.',
      'Points: 10 for each new row, 50 for a nest, and 200 for filling every nest. Each level is a little faster.',
      'P (or the pause button) pauses; so does leaving the tab or opening a card.',
    ],
  },
};
