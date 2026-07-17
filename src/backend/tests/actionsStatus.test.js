jest.mock('../lib/tableStorage', () => ({
  getTableClient: jest.fn()
}));

const { getTableClient } = require('../lib/tableStorage');
const actionsStatus = require('../ActionsStatus');

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

function createFakeTableClient(entities) {
  return {
    url: 'http://127.0.0.1:10002/devstoreaccount1/actions',
    async *listEntities() {
      for (const entity of entities) {
        yield entity;
      }
    },
    async getEntity() {
      const err = new Error('Not Found');
      err.statusCode = 404;
      throw err;
    },
    async upsertEntity() {
      // no-op for tests
    }
  };
}

describe('ActionsStatus function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_ORIGINS;
  });

  it('returns 200 with age distribution and a Cache-Control header', async () => {
    const entities = [
      { LastSyncedUtc: new Date().toISOString() },
      { LastSyncedUtc: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }
    ];

    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStatus(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.isRaw).toBe(true);
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=300');

    const body = JSON.parse(context.res.body);
    expect(body.totalCount).toBe(2);
    expect(body.ageDistribution.within1day).toBe(1);
    expect(body.ageDistribution.within30days).toBe(1);
  });

  it('handles OPTIONS request', async () => {
    const context = createContext();
    const req = { method: 'OPTIONS', headers: {} };

    await actionsStatus(context, req);

    expect(context.res.status).toBe(204);
    expect(context.res.headers['Allow']).toBe('GET,OPTIONS');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });

  it('rejects non-GET/OPTIONS methods', async () => {
    const context = createContext();
    const req = { method: 'POST', headers: {} };

    await actionsStatus(context, req);

    expect(context.res.status).toBe(405);
    expect(context.res.body.error).toBe('Method not allowed.');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });

  it('returns 500 without a Cache-Control header when the table query fails', async () => {
    const fakeClient = {
      url: 'http://127.0.0.1:10002/devstoreaccount1/actions',
      async *listEntities() {
        throw new Error('connection refused');
      },
      async getEntity() {
        const err = new Error('Not Found');
        err.statusCode = 404;
        throw err;
      }
    };
    getTableClient.mockReturnValue(fakeClient);

    const context = createContext();
    const req = { method: 'GET', headers: {} };

    await actionsStatus(context, req);

    expect(context.res.status).toBe(500);
    expect(context.res.body.error).toBe('Failed to compute status.');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });
});
