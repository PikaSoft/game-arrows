import { describe, expect, test } from 'vitest';
import { isOutdated } from '../src/shared/updateCheck';

describe('isOutdated', () => {
  test('flags a different live build', () => {
    expect(isOutdated('abc', { build: 'def' })).toBe(true);
  });
  test('same build is current', () => {
    expect(isOutdated('abc', { build: 'abc' })).toBe(false);
  });
  test('ignores malformed responses', () => {
    expect(isOutdated('abc', null)).toBe(false);
    expect(isOutdated('abc', {})).toBe(false);
    expect(isOutdated('abc', { build: '' })).toBe(false);
    expect(isOutdated('abc', { build: 42 })).toBe(false);
  });
});
