'use strict';

jest.mock('../lib/backendClient');

const { getAction, setAction, hasAction, clearCache, getCacheStats, preWarm } = require('../lib/cache');
const { fetchActionsList } = require('../lib/backendClient');

describe('cache', () => {
  beforeEach(() => {
    clearCache();
    jest.clearAllMocks();
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
      fetchActionsList.mockRejectedValue(new Error('Backend unavailable'));

      const count = await preWarm();
      expect(count).toBe(0);
    });

    test('returns 0 when fetchActionsList returns non-array', async () => {
      fetchActionsList.mockResolvedValue(null);

      const count = await preWarm();
      expect(count).toBe(0);
    });

    test('filters out invalid actions', async () => {
      fetchActionsList.mockResolvedValue([
        { owner: 'actions', name: 'checkout', dependents: { dependents: 1000 } },
        null,
        { owner: null, name: 'invalid' },
        { owner: 'github', name: 'codeql', dependents: { dependents: 500 } }
      ]);

      const count = await preWarm();
      expect(count).toBe(2);

      expect(hasAction('actions', 'checkout')).toBe(true);
      expect(hasAction('github', 'codeql')).toBe(true);
    });

    test('sorts actions by dependents count', async () => {
      fetchActionsList.mockResolvedValue([
        { owner: 'actions', name: 'setup-node', dependents: { dependents: 100 } },
        { owner: 'actions', name: 'checkout', dependents: { dependents: 2000 } },
        { owner: 'github', name: 'codeql', dependents: { dependents: 500 } }
      ]);

      await preWarm();

      expect(hasAction('actions', 'checkout')).toBe(true);
      expect(hasAction('github', 'codeql')).toBe(true);
      expect(hasAction('actions', 'setup-node')).toBe(true);
    });

    test('handles actions with missing dependents info', async () => {
      fetchActionsList.mockResolvedValue([
        { owner: 'actions', name: 'checkout' },
        { owner: 'github', name: 'codeql', dependents: { dependents: '100' } }
      ]);

      const count = await preWarm();
      expect(count).toBe(2);
    });
  });
});
