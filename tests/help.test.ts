import { describe, expect, it } from 'vitest';
import { bricksSpecFor } from '../src/games/bricks/core/difficulty';
import { crateSpecFor } from '../src/games/crates/core/difficulty';
import { iceSpecFor } from '../src/games/ice/core/difficulty';
import { lightsSpecFor } from '../src/games/lights/core/difficulty';
import { linesSpecFor } from '../src/games/lines/core/difficulty';
import { minesSpecFor } from '../src/games/mines/core/difficulty';
import { numbersSpecFor } from '../src/games/numbers/core/difficulty';
import { pictureSpecFor } from '../src/games/picture/core/difficulty';
import { pipeSpecFor } from '../src/games/pipes/core/difficulty';
import { sandSpecFor } from '../src/games/sandglass/core/difficulty';
import { buildSnakeLevel } from '../src/games/snake/core/levels';
import { squeezeSpecFor } from '../src/games/squeeze/core/difficulty';
import { starsSpecFor } from '../src/games/stars/core/difficulty';
import { tentsSpecFor } from '../src/games/tents/core/difficulty';
import { wordsSpecFor } from '../src/games/words/core/difficulty';
import { buildLevel } from '../src/games/arrows/core/levels';
import { HELP } from '../src/games/help';

const IDS = ['arrows', 'sandglass', 'snake', 'snake-trails', 'squeeze', 'pipes', 'lines', 'crates', 'lights', 'ice', 'picture', 'numbers', 'tents', 'mines', 'bricks', 'stack', 'lanes', 'merge', 'words', 'stars'];

const SPECS: Record<string, (n: number) => { tip?: string }> = {
  bricks: bricksSpecFor,
  crates: crateSpecFor,
  ice: iceSpecFor,
  lights: lightsSpecFor,
  lines: linesSpecFor,
  mines: minesSpecFor,
  numbers: numbersSpecFor,
  picture: pictureSpecFor,
  pipes: pipeSpecFor,
  sandglass: sandSpecFor,
  squeeze: squeezeSpecFor,
  stars: starsSpecFor,
  tents: tentsSpecFor,
  words: wordsSpecFor,
};

describe('how to play', () => {
  it('has a goal and tips for every game', () => {
    expect(Object.keys(HELP).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      expect(HELP[id].goal.length).toBeGreaterThan(20);
      expect(HELP[id].tips.length).toBeGreaterThan(2);
    }
  });

  it('includes every tip a level shows', () => {
    for (const [id, spec] of Object.entries(SPECS)) {
      for (let n = 1; n <= 120; n++) {
        const tip = spec(n).tip;
        if (tip) expect(HELP[id].tips, `${id} level ${n}`).toContain(tip);
      }
    }
    for (let n = 1; n <= 3; n++) expect(HELP['snake-trails'].tips).toContain(buildSnakeLevel(n).tip);
    for (let n = 1; n <= 5; n++) expect(HELP.arrows.tips).toContain(buildLevel(n).tip);
  });
});
