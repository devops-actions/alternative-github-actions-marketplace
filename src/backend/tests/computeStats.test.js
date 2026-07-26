const { computeStats } = require('../lib/computeStats');
const { STATS_CACHE_PARTITION, STATS_CACHE_ROW } = require('../lib/statsCache');

function fakeTableClient(entities) {
  return {
    async *listEntities() {
      for (const e of entities) {
        yield e;
      }
    }
  };
}

function actionEntity(owner, name, payload = {}) {
  return {
    partitionKey: owner,
    rowKey: name,
    PayloadJson: JSON.stringify({ owner, name, ...payload })
  };
}

describe('computeStats', () => {
  it('does not count the stats cache row that lives in the same table', async () => {
    // Regression: the cache entity has CacheJson rather than PayloadJson, so it
    // parsed to an empty payload and still incremented `total`. That made
    // /actions/stats report exactly one more action than /actions/list
    // returned, which looked like the two endpoints disagreed.
    const client = fakeTableClient([
      actionEntity('alpha', 'one'),
      actionEntity('beta', 'two'),
      {
        partitionKey: STATS_CACHE_PARTITION,
        rowKey: STATS_CACHE_ROW,
        CacheJson: JSON.stringify({ stats: { total: 999 } })
      }
    ]);

    const stats = await computeStats(client);

    expect(stats.total).toBe(2);
  });

  it('aggregates type, verified, archived and OpenSSF counts', async () => {
    const client = fakeTableClient([
      actionEntity('a', '1', { actionType: { actionType: 'Node' }, verified: true, openssf_score: 7 }),
      actionEntity('b', '2', { actionType: { actionType: 'Docker' }, repoInfo: { archived: true } }),
      actionEntity('c', '3', { actionType: { actionType: 'Node' }, ossf: true })
    ]);

    const stats = await computeStats(client);

    expect(stats).toEqual({
      total: 3,
      byType: { Node: 2, Docker: 1 },
      verified: 1,
      archived: 1,
      withOssf: 2
    });
  });

  it('returns zeroed counts for an empty table', async () => {
    const stats = await computeStats(fakeTableClient([]));

    expect(stats).toEqual({ total: 0, byType: {}, verified: 0, archived: 0, withOssf: 0 });
  });
});
