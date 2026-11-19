import { describe, expect, test } from 'vitest';
import { orderByFavourites, Settings, toggleFavourite } from '../src/shared/settings';

const games = ['arrows', 'sandglass', 'snake', 'pipes', 'fruit'].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((g) => g.id);

describe('orderByFavourites', () => {
  test('no favourites keeps the collection order', () => {
    expect(ids(orderByFavourites(games, []))).toEqual(['arrows', 'sandglass', 'snake', 'pipes', 'fruit']);
  });
  test('favourites come first, each group in collection order', () => {
    expect(ids(orderByFavourites(games, ['fruit', 'snake']))).toEqual(['snake', 'fruit', 'arrows', 'sandglass', 'pipes']);
  });
  test('ignores ids of games that no longer exist', () => {
    expect(ids(orderByFavourites(games, ['gone', 'pipes']))).toEqual(['pipes', 'arrows', 'sandglass', 'snake', 'fruit']);
  });
});

describe('toggleFavourite', () => {
  test('adds then removes', () => {
    const s: Settings = { sound: true, haptics: true, theme: 'auto', favourites: [] };
    expect(toggleFavourite(s, 'snake')).toBe(true);
    expect(s.favourites).toEqual(['snake']);
    expect(toggleFavourite(s, 'snake')).toBe(false);
    expect(s.favourites).toEqual([]);
  });
});
