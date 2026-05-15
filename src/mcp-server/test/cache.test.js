'use strict';

const { getAction, setAction, hasAction, clearCache, getCacheStats } = require('../lib/cache');

describe('cache', () => {
  beforeEach(() => {
    clearCache();
  });

  test('set and get an action', () => {
    const data = { owner: 'actions', name: 'checkout', tagInfo: ['v4'] };
    setAction('actions', 'checkout', data);
    const result = getAction('actions', 'checkout');
    expect(result).toEqual(data);
  });

  test('returns null for missing entry', () => {
    expect(getAction('missing', 'action')).toBeNull();
  });

  test('hasAction returns correct boolean', () => {
    setAction('actions', 'checkout', { owner: 'actions', name: 'checkout' });
    expect(hasAction('actions', 'checkout')).toBe(true);
    expect(hasAction('actions', 'missing')).toBe(false);
  });

  test('getCacheStats reflects state', () => {
    expect(getCacheStats().size).toBe(0);
    setAction('a', 'b', {});
    expect(getCacheStats().size).toBe(1);
  });

  test('clearCache empties the store', () => {
    setAction('a', 'b', {});
    clearCache();
    expect(getCacheStats().size).toBe(0);
  });
});
