import { describe, expect, test } from 'vitest';
import { Session } from '../src/game/session';
import { Level } from '../src/core/types';

// A chain: 2 blocks 1 blocks 0, plus a free arrow 3.
const level: Level = {
  number: 99,
  w: 5,
  h: 5,
  difficulty: 'Easy',
  arrows: [
    { id: 0, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }], dir: 'R' },
    { id: 1, cells: [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }], dir: 'D' },
    { id: 2, cells: [{ x: 2, y: 4 }, { x: 3, y: 4 }], dir: 'R' },
    { id: 3, cells: [{ x: 0, y: 1 }, { x: 0, y: 0 }], dir: 'U' },
  ],
};

describe('session', () => {
  test('blocked taps cost hearts, then require a choice, then cost nothing', () => {
    const s = new Session(level);
    for (let i = 0; i < 2; i++) expect(s.tap(0)).toMatchObject({ kind: 'blocked', lostHeart: true, outOfHearts: false });
    expect(s.tap(0)).toMatchObject({ kind: 'blocked', lostHeart: true, outOfHearts: true });
    expect(s.awaitingContinue).toBe(true);
    expect(s.tap(2).kind).toBe('none'); // locked until the player decides
    s.continueWithoutHearts();
    expect(s.tap(0)).toMatchObject({ kind: 'blocked', lostHeart: false });
    expect(s.stars()).toBe(0);
  });

  test('counts, auto-finish and stars', () => {
    const s = new Session(level);
    expect(s.freeCount).toBe(2);
    expect(s.remaining).toBe(4);
    expect(s.tap(1).kind).toBe('blocked');
    expect(s.tap(2).kind).toBe('exit');
    // Now 1 and 3 are free but 0 is still blocked by 1.
    expect(s.shouldAutoFinish()).toBe(false);
    expect(s.tap(1).kind).toBe('exit');
    expect(s.shouldAutoFinish()).toBe(true);
    const rest = s.startAutoFinish();
    expect(rest.map((r) => r.arrow.id).sort()).toEqual([0, 3]);
    expect(s.won).toBe(true);
    expect(s.timerRunning).toBe(false);
    expect(s.stars()).toBe(2);
  });

  test('hints prefer arrows that unblock others and run out', () => {
    const s = new Session(level);
    expect(s.useHint()?.id).toBe(2);
    s.useHint();
    s.useHint();
    expect(s.hints).toBe(0);
    expect(s.useHint()).toBeNull();
  });
});
