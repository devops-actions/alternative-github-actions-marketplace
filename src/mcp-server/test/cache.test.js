'use strict';

const { getAction, setAction, hasAction, clearCache, getCacheStats, preWarm } = require('../lib/cache');

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

  describe('preWarm', () => {
    test('returns 0 when fetchActionsList fails', async () => {
      // Mock fetchActionsList to throw an error
      const cache = require('../lib/cache');
      const originalFetchActionsList = cache.fetchActionsList;
      cache.fetchActionsList = jest.fn().mockRejectedValue(new Error('Backend unavailable'));

      const count = await preWarm();
      expect(count).toBe(0);

      // Restore original
      cache.fetchActionsList = originalFetchActionsList;
    });

    test('returns 0 when fetchActionsList returns non-array', async () => {
      const cache = require('../lib/cache');
      const originalFetchActionsList = cache.fetchActionsList;
      cache.fetchActionsList = jest.fn().mockResolvedValue(null);

      const count = await preWarm();
      expect(count).toBe(0);

      cache.fetchActionsList = originalFetchActionsList;
    });

    test('filters out invalid actions', async () => {
      const cache = require('../lib/cache');
      const originalFetchActionsList = cache.fetchActionsList;
      
      // Mock fetchActionsList to return actions with some invalid entries
      cache.fetchActionsList = jest.fn().mockResolvedValue([
        { owner: 'actions', name: 'checkout', dependents: { dependents: 1000 } },
        null,
        { owner: null, name: 'invalid' },
        { owner: 'github', name: 'codeql', dependents: { dependents: 500 } }
      ]);

      const count = await preWarm();
      expect(count).toBe(2);
      
      // Check that valid actions were cached
      expect(hasAction('actions', 'checkout')).toBe(true);
      expect(hasAction('github', 'codeql')).toBe(true);
      
      cache.fetchActionsList = originalFetchActionsList;
    });

    test('sorts actions by dependents count', async () => {
      const cache = require('../lib/cache');
      const originalFetchActionsList = cache.fetchActionsList;
      
      cache.fetchActionsList = jest.fn().mockResolvedValue([
        { owner: 'actions', name: 'setup-node', dependents: { dependents: 100 } },
        { owner: 'actions', name: 'checkout', dependents: { dependents: 2000 } },
        { owner: 'github', name: 'codeql', dependents: { dependents: 500 } }
      ]);

      await preWarm();
      
      // The action with most dependents should be cached
      expect(hasAction('actions', 'checkout')).toBe(true);
      expect(hasAction('github', 'codeql')).toBe(true);
      expect(hasAction('actions', 'setup-node')).toBe(true);
      
      cache.fetchActionsList = originalFetchActionsList;
    });

    test('handles actions with missing dependents info', async () => {
      const cache = require('../lib/cache');
      const originalFetchActionsList = cache.fetchActionsList;
      
      cache.fetchActionsList = jest.fn().mockResolvedValue([
        { owner: 'actions', name: 'checkout' },
        { owner: 'github', name: 'codeql', dependents: { dependents: '100' } }
      ]);

      const count = await preWarm();
      expect(count).toBe(2);
      
      cache.fetchActionsList = originalFetchActionsList;
    });
  });
});
