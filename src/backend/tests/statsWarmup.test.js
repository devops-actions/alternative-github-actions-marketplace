jest.mock('../lib/tableStorage', () => ({
  getTableClient: jest.fn()
}));

const { getTableClient } = require('../lib/tableStorage');
const statsWarmup = require('../StatsWarmup');

function createContext() {
  const logFn = jest.fn();
  logFn.info = jest.fn();
  logFn.warn = jest.fn();
  logFn.error = jest.fn();

  return { log: logFn };
}

function createFakeTableClient(entities, { cacheEntity = null, upsertEntity } = {}) {
  return {
    url: 'http://127.0.0.1:10002/devstoreaccount1/actions',
    async *listEntities() {
      for (const entity of entities) {
        yield entity;
      }
    },
    async getEntity(partitionKey, rowKey) {
      if (partitionKey === 'statsCache' && rowKey === 'aggregate' && cacheEntity) {
        return cacheEntity;
      }
      const err = new Error('Not Found');
      err.statusCode = 404;
      throw err;
    },
    upsertEntity: upsertEntity || jest.fn(async () => {})
  };
}

describe('StatsWarmup function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recomputes stats and writes them to the cache', async () => {
    const entities = [
      {
        PayloadJson: JSON.stringify({
          verified: true,
          actionType: { actionType: 'Node' },
          repoInfo: { archived: true },
          ossf: true
        })
      },
      {
        PayloadJson: JSON.stringify({
          verified: false,
          actionType: { actionType: 'Docker' },
          repoInfo: { archived: false }
        })
      }
    ];

    const upsertEntity = jest.fn(async () => {});
    getTableClient.mockReturnValue(createFakeTableClient(entities, { upsertEntity }));

    const context = createContext();
    await statsWarmup(context);

    expect(upsertEntity).toHaveBeenCalledTimes(1);
    const [entity] = upsertEntity.mock.calls[0];
    const cached = JSON.parse(entity.CacheJson);
    expect(cached.stats).toEqual(
      expect.objectContaining({ total: 2, verified: 1, archived: 1, withOssf: 1 })
    );
  });

  it('preserves existing non-stats cache data (e.g. status) when refreshing', async () => {
    const cacheEntity = {
      CacheJson: JSON.stringify({ status: { totalCount: 5 }, stats: { total: 1 } }),
      etag: '"abc"'
    };
    const upsertEntity = jest.fn(async () => {});
    getTableClient.mockReturnValue(createFakeTableClient([], { cacheEntity, upsertEntity }));

    const context = createContext();
    await statsWarmup(context);

    const [entity] = upsertEntity.mock.calls[0];
    const cached = JSON.parse(entity.CacheJson);
    expect(cached.status).toEqual({ totalCount: 5 });
    expect(cached.stats).toEqual(
      expect.objectContaining({ total: 0, verified: 0, archived: 0, withOssf: 0 })
    );
  });

  it('logs and swallows errors instead of throwing', async () => {
    const fakeClient = {
      url: 'http://127.0.0.1:10002/devstoreaccount1/actions',
      // eslint-disable-next-line require-yield -- must stay an async generator to match the real client's iterable interface
      async *listEntities() {
        throw new Error('connection refused');
      }
    };
    getTableClient.mockReturnValue(fakeClient);

    const context = createContext();
    await expect(statsWarmup(context)).resolves.toBeUndefined();
    expect(context.log.error).toHaveBeenCalled();
  });
});
