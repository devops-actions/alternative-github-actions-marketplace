'use strict';

jest.mock('../lib/backendClient', () => ({
  fetchActionsList: jest.fn()
}));

const { preWarm, getAction, clearCache, getCacheStats } = require('../lib/cache');
const { fetchActionsList } = require('../lib/backendClient');

beforeEach(() => {
  clearCache();
  jest.clearAllMocks();
});

describe('preWarm', () => {
  test('populates cache with actions sorted by dependents descending', async () => {
    fetchActionsList.mockResolvedValue([
      { owner: 'Actions', name: 'Checkout', dependents: { dependents: '50' } },
      { owner: 'Actions', name: 'Setup-Node', dependents: { dependents: '200' } },
      { owner: 'Actions', name: 'Cache', dependents: { dependents: '100' } }
    ]);

    const count = await preWarm();

    expect(count).toBe(3);
    expect(getCacheStats().size).toBe(3);
    // Keys are stored lowercase
    expect(getAction('actions', 'checkout')).toBeDefined();
    expect(getAction('actions', 'setup-node')).toBeDefined();
    expect(getAction('actions', 'cache')).toBeDefined();
  });

  test('returns 0 when backend returns non-array', async () => {
    fetchActionsList.mockResolvedValue({ error: 'not an array' });

    const count = await preWarm();

    expect(count).toBe(0);
    expect(getCacheStats().size).toBe(0);
  });

  test('returns 0 when backend throws', async () => {
    fetchActionsList.mockRejectedValue(new Error('backend unavailable'));

    const count = await preWarm();

    expect(count).toBe(0);
  });

  test('filters out actions with missing owner or name', async () => {
    fetchActionsList.mockResolvedValue([
      { owner: 'actions', name: 'checkout', dependents: { dependents: '10' } },
      { owner: null, name: 'bad', dependents: { dependents: '5' } },
      { owner: 'org', dependents: { dependents: '3' } }
    ]);

    const count = await preWarm();

    expect(count).toBe(1);
    expect(getAction('actions', 'checkout')).toBeDefined();
  });

  test('handles actions with missing dependents (treats as 0)', async () => {
    fetchActionsList.mockResolvedValue([
      { owner: 'org1', name: 'action1' },
      { owner: 'org2', name: 'action2', dependents: null },
      { owner: 'org3', name: 'action3', dependents: { dependents: '5' } }
    ]);

    const count = await preWarm();
    expect(count).toBe(3);
  });

  test('returns 0 and does not populate cache for empty array', async () => {
    fetchActionsList.mockResolvedValue([]);

    const count = await preWarm();

    expect(count).toBe(0);
    expect(getCacheStats().size).toBe(0);
  });

  test('stores actions with lowercase owner and name', async () => {
    fetchActionsList.mockResolvedValue([
      { owner: 'MyOrg', name: 'MyAction', dependents: { dependents: '1' } }
    ]);

    await preWarm();
    expect(getAction('myorg', 'myaction')).toBeDefined();
    expect(getAction('MyOrg', 'MyAction')).toBeNull();
  });
});
