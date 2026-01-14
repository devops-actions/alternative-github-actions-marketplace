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

function createFakeTableClient(entities) {
  return {
    url: 'http://127.0.0.1:10002/devstoreaccount1/actions',
    async *listEntities() {
      for (const entity of entities) {
        yield entity;
      }
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
          repoInfo: { archived: true }
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

    const body = JSON.parse(context.res.body);
    expect(body).toEqual(
      expect.objectContaining({
        total: 2,
        verified: 1,
        archived: 1,
        byType: expect.objectContaining({ Node: 1, Docker: 1 })
      })
    );
  });
});
