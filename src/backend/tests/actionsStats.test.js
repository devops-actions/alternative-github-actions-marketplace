jest.mock('../lib/tableStorage', () => ({
  getTableClient: jest.fn()
}));

const { getTableClient } = require('../lib/tableStorage');
const actionsStats = require('../ActionsStats');

function createContext() {
  const logFn = jest.fn();
  logFn.info = jest.fn();
  logFn.warn = jest.fn();
  logFn.error = jest.fn();

  return {
    log: logFn,
    res: null
  };
}

function createFakeTableClient(entities, { cacheEntity = null } = {}) {
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
    async upsertEntity() {
      // no-op for tests
    }
  };
}

describe('ActionsStats function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_ORIGINS;
  });

  it('includes archived count in payload and headers', async () => {
    const entities = [
      {
        PayloadJson: JSON.stringify({
          verified: true,
          actionType: { actionType: 'Node' },
          repoInfo: { archived: true },
          ossf: true,
          ossfScore: 5.2
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

    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.isRaw).toBe(true);
    expect(context.res.headers['X-Actions-Count']).toBe(2);
    expect(context.res.headers['X-Verified-Count']).toBe(1);
    expect(context.res.headers['X-Archived-Count']).toBe(1);
    expect(context.res.headers['X-Ossf-Count']).toBe(1);
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=300');

    const body = JSON.parse(context.res.body);
    expect(body).toEqual(
      expect.objectContaining({
        total: 2,
        verified: 1,
        archived: 1,
        withOssf: 1,
        byType: expect.objectContaining({ Node: 1, Docker: 1 })
      })
    );
  });

  it('handles OPTIONS method with 204', async () => {
    const context = createContext();
    const req = { method: 'OPTIONS', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(204);
    expect(context.res.headers['Allow']).toBe('GET,OPTIONS');
  });

  it('returns 405 for non-GET/OPTIONS methods', async () => {
    const context = createContext();
    const req = { method: 'POST', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(405);
    expect(context.res.body.error).toBe('Method not allowed.');
  });

  it('returns 500 when table query fails', async () => {
    const fakeClient = {
      url: 'http://127.0.0.1:10002/devstoreaccount1/actions',
      async *listEntities() {
        throw new Error('connection refused');
      }
    };
    getTableClient.mockReturnValue(fakeClient);

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(500);
    expect(context.res.body.error).toBe('Failed to compute stats.');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });

  it('skips malformed PayloadJson without throwing', async () => {
    const entities = [
      { PayloadJson: 'not valid json' },
      {
        PayloadJson: JSON.stringify({
          verified: true,
          actionType: { actionType: 'Node' },
          repoInfo: { archived: false }
        })
      }
    ];
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    const body = JSON.parse(context.res.body);
    // Only the valid entity should be counted
    expect(body.total).toBe(1);
    expect(body.verified).toBe(1);
  });

  it('counts entities with openssf_score field', async () => {
    const entities = [
      {
        PayloadJson: JSON.stringify({
          verified: false,
          actionType: { actionType: 'Node' },
          repoInfo: { archived: false },
          openssf_score: 7.5
        })
      }
    ];
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    const body = JSON.parse(context.res.body);
    expect(body.withOssf).toBe(1);
    expect(context.res.headers['X-Ossf-Count']).toBe(1);
  });

  it('counts entities with ossf_score field', async () => {
    const entities = [
      {
        PayloadJson: JSON.stringify({
          verified: false,
          actionType: { actionType: 'Node' },
          repoInfo: { archived: false },
          ossf_score: 6.0
        })
      }
    ];
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    const body = JSON.parse(context.res.body);
    expect(body.withOssf).toBe(1);
  });

  it('returns zero counts for empty table', async () => {
    getTableClient.mockReturnValue(createFakeTableClient([]));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    const body = JSON.parse(context.res.body);
    expect(body.total).toBe(0);
    expect(body.verified).toBe(0);
    expect(body.archived).toBe(0);
    expect(body.withOssf).toBe(0);
    expect(body.byType).toEqual({});
  });

  it('handles entity with PayloadJson as object (not string)', async () => {
    const entities = [
      {
        PayloadJson: {
          verified: true,
          actionType: { actionType: 'Node' },
          repoInfo: { archived: false }
        }
      }
    ];
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    const body = JSON.parse(context.res.body);
    expect(body.total).toBe(1);
    expect(body.verified).toBe(1);
  });

  it('handles table URL with query string (strips it)', async () => {
    const fakeClient = {
      url: 'http://127.0.0.1:10002/devstoreaccount1/actions?sv=2021',
      async *listEntities() {
        yield { PayloadJson: JSON.stringify({ verified: false, actionType: null, repoInfo: null }) };
      },
      async getEntity() { const e = new Error(); e.statusCode = 404; throw e; },
      async upsertEntity() {}
    };
    getTableClient.mockReturnValue(fakeClient);

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    const tableEndpoint = context.res.headers['X-Table-Endpoint'];
    expect(tableEndpoint).not.toContain('?');
    expect(tableEndpoint).toContain('actions');
  });

  it('returns cached stats without scanning entities', async () => {
    const cachedData = {
      stats: { total: 99, byType: { Node: 50, Docker: 49 }, verified: 10, archived: 5, withOssf: 20 }
    };
    const cacheEntity = { CacheJson: JSON.stringify(cachedData), etag: '"abc"' };
    getTableClient.mockReturnValue(createFakeTableClient([], { cacheEntity }));

    const context = createContext();
    const req = { method: 'GET', headers: {}, query: {} };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    const body = JSON.parse(context.res.body);
    expect(body.total).toBe(99);
    expect(body.verified).toBe(10);
    expect(body.archived).toBe(5);
    expect(body.withOssf).toBe(20);
  });

  it('forces full scan when refresh=true even with cached data', async () => {
    const cachedData = {
      stats: { total: 99, byType: {}, verified: 0, archived: 0, withOssf: 0 }
    };
    const cacheEntity = { CacheJson: JSON.stringify(cachedData), etag: '"abc"' };
    const entities = [
      { PayloadJson: JSON.stringify({ verified: true, actionType: { actionType: 'Node' }, repoInfo: { archived: false } }) }
    ];
    getTableClient.mockReturnValue(createFakeTableClient(entities, { cacheEntity }));

    const context = createContext();
    const req = { method: 'GET', headers: {}, query: { refresh: 'true' } };

    await actionsStats(context, req);

    expect(context.res.status).toBe(200);
    const body = JSON.parse(context.res.body);
    // Should reflect the actual scan result (1 entity), not the stale cache (99)
    expect(body.total).toBe(1);
    expect(body.verified).toBe(1);
  });
});
