jest.mock('../lib/tableStorage', () => ({
  getTableClient: jest.fn()
}));

const { getTableClient } = require('../lib/tableStorage');
const actionsList = require('../ActionsList/index');

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
  const mockStore = new Map();
  entities.forEach(e => {
    mockStore.set(e.RowKey, e);
  });

  return {
    store: mockStore,
    url: 'https://test.table.core.windows.net/actions'
  };
}

function createTestEntities(count, owner = 'testowner') {
  const entities = [];
  for (let i = 1; i <= count; i++) {
    entities.push({
      PartitionKey: owner.toLowerCase(),
      RowKey: `action${i}`,
      Owner: owner,
      PayloadJson: JSON.stringify({
        owner: owner,
        name: `action${i}`,
        actionType: { actionType: 'Node' },
        repoInfo: { archived: false, updated_at: '2024-01-01' },
        dependents: { dependents: '10' },
        verified: false
      })
    });
  }
  return entities;
}

describe('ActionsList function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return all actions when no limit is specified', async () => {
    const entities = createTestEntities(100);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: {},
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toHaveLength(100);
    expect(context.res.headers['X-Actions-Count']).toBe(100);
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=300');
  });

  test('should limit results when limit parameter is provided', async () => {
    const entities = createTestEntities(100);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: '50' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body.items).toHaveLength(50);
    expect(context.res.body.nextCursor).toBeTruthy();
  });

  test('should handle small limit values', async () => {
    const entities = createTestEntities(100);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: '10' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body.items).toHaveLength(10);
    expect(context.res.body.nextCursor).toBeTruthy();
  });

  test('should ignore invalid limit values', async () => {
    const entities = createTestEntities(100);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: 'invalid' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toHaveLength(100);
  });

  test('should ignore negative limit values', async () => {
    const entities = createTestEntities(100);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: '-10' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toHaveLength(100);
  });

  test('should return all actions when limit exceeds total count', async () => {
    const entities = createTestEntities(100);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: '200' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body.items).toHaveLength(100);
    expect(context.res.body.nextCursor).toBeNull();
  });

  test('should handle OPTIONS request', async () => {
    const context = createContext();
    const req = {
      method: 'OPTIONS',
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(204);
    expect(context.res.headers['Allow']).toBe('GET,OPTIONS');
  });

  test('should reject non-GET/OPTIONS methods', async () => {
    const context = createContext();
    const req = {
      method: 'POST',
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(405);
    expect(context.res.body.error).toBe('Method not allowed.');
  });

  test('should combine owner filter with limit', async () => {
    const entities = createTestEntities(100, 'testowner');
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { 
        owner: 'testowner',
        limit: '25' 
      },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body.items).toHaveLength(25);
    expect(context.res.body.items.every(a => a.owner === 'testowner')).toBe(true);
  });

  test('paginates through all pages using nextCursor until exhausted (fake client)', async () => {
    const entities = createTestEntities(10);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const seenNames = [];
    let cursor;
    let guard = 0;

    do {
      const context = createContext();
      const req = {
        method: 'GET',
        query: cursor ? { limit: '3', cursor } : { limit: '3' },
        headers: {}
      };

      await actionsList(context, req);

      expect(context.res.status).toBe(200);
      context.res.body.items.forEach(a => seenNames.push(a.name));
      cursor = context.res.body.nextCursor;
      guard += 1;
    } while (cursor && guard < 10);

    expect(seenNames).toHaveLength(10);
    expect(new Set(seenNames).size).toBe(10);
  });

  test('returns 400 for a malformed cursor', async () => {
    const entities = createTestEntities(10);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: '3', cursor: 'not-valid-base64-json!!' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.status).toBe(400);
  });

  test('exposes X-Total-Count header reflecting the filtered total', async () => {
    const entities = createTestEntities(10);
    getTableClient.mockReturnValue(createFakeTableClient(entities));

    const context = createContext();
    const req = {
      method: 'GET',
      query: { limit: '3' },
      headers: {}
    };

    await actionsList(context, req);

    expect(context.res.headers['X-Total-Count']).toBe(10);
  });
});

describe('ActionsList real table client path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Mimics the shape of the @azure/data-tables PagedAsyncIterableIterator:
  // both a plain async iterable (`for await`) and a `.byPage()` page iterator
  // that carries a `continuationToken` on each returned page.
  function createRealStyleTableClient(entities, throwError) {
    return {
      url: 'https://real.table.core.windows.net/actions',
      listEntities() {
        return {
          async *[Symbol.asyncIterator]() {
            if (throwError) throw throwError;
            for (const entity of entities) {
              yield entity;
            }
          },
          byPage(settings = {}) {
            const maxPageSize = settings.maxPageSize || entities.length || 1;
            let startIndex = 0;
            if (settings.continuationToken !== undefined) {
              const parsed = Number(settings.continuationToken);
              startIndex = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
            }

            return {
              async next() {
                if (throwError) throw throwError;
                if (startIndex >= entities.length) {
                  return { done: true, value: undefined };
                }
                const page = entities.slice(startIndex, startIndex + maxPageSize);
                const nextIndex = startIndex + page.length;
                page.continuationToken = nextIndex < entities.length ? String(nextIndex) : undefined;
                startIndex = nextIndex;
                return { done: false, value: page };
              },
              [Symbol.asyncIterator]() {
                return this;
              }
            };
          }
        };
      }
    };
  }

  function createTestEntity(owner, name) {
    const { ActionRecord } = require('../lib/actionRecord');
    const record = ActionRecord.fromRequest({
      owner,
      name,
      description: 'test',
      actionType: { actionType: 'Node' },
      repoInfo: { archived: false, updated_at: '2024-01-01' }
    });
    return record.toEntity();
  }

  test('returns entities via listEntities async generator', async () => {
    const entities = [
      createTestEntity('actions', 'checkout'),
      createTestEntity('actions', 'setup-node')
    ];
    getTableClient.mockReturnValue(createRealStyleTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', query: {}, headers: {} };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toHaveLength(2);
    expect(context.res.headers['X-Actions-Count']).toBe(2);
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=300');
  });

  test('applies limit using a single cursor-based page (first page, no cursor)', async () => {
    const entities = Array.from({ length: 10 }, (_, i) =>
      createTestEntity('org', `action${i}`)
    );
    getTableClient.mockReturnValue(createRealStyleTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', query: { limit: '3' }, headers: {} };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body.items).toHaveLength(3);
    expect(context.res.body.items.map(a => a.name)).toEqual(['action0', 'action1', 'action2']);
    expect(context.res.body.nextCursor).toBeTruthy();
  });

  test('fetches the next page using the cursor from the previous page', async () => {
    const entities = Array.from({ length: 10 }, (_, i) =>
      createTestEntity('org', `action${i}`)
    );
    getTableClient.mockReturnValue(createRealStyleTableClient(entities));

    const firstContext = createContext();
    await actionsList(firstContext, { method: 'GET', query: { limit: '3' }, headers: {} });
    const firstCursor = firstContext.res.body.nextCursor;
    expect(firstCursor).toBeTruthy();

    const secondContext = createContext();
    await actionsList(secondContext, {
      method: 'GET',
      query: { limit: '3', cursor: firstCursor },
      headers: {}
    });

    expect(secondContext.res.status).toBe(200);
    expect(secondContext.res.body.items).toHaveLength(3);
    expect(secondContext.res.body.items.map(a => a.name)).toEqual(['action3', 'action4', 'action5']);
    expect(secondContext.res.body.nextCursor).toBeTruthy();
  });

  test('returns a null nextCursor on the last page', async () => {
    const entities = Array.from({ length: 10 }, (_, i) =>
      createTestEntity('org', `action${i}`)
    );
    getTableClient.mockReturnValue(createRealStyleTableClient(entities));

    // Walk through pages of 4 until nextCursor is null: page1 [0-3], page2 [4-7], page3 [8-9].
    let cursor;
    let lastBody;
    let guard = 0;
    do {
      const context = createContext();
      await actionsList(context, {
        method: 'GET',
        query: cursor ? { limit: '4', cursor } : { limit: '4' },
        headers: {}
      });
      lastBody = context.res.body;
      cursor = lastBody.nextCursor;
      guard += 1;
    } while (cursor && guard < 10);

    expect(lastBody.items).toHaveLength(2);
    expect(lastBody.items.map(a => a.name)).toEqual(['action8', 'action9']);
    expect(lastBody.nextCursor).toBeNull();
  });

  test('filters by owner using OData query option', async () => {
    const entities = [
      createTestEntity('myorg', 'myaction')
    ];
    getTableClient.mockReturnValue(createRealStyleTableClient(entities));

    const context = createContext();
    const req = { method: 'GET', query: { owner: 'myorg' }, headers: {} };

    await actionsList(context, req);

    expect(context.res.status).toBe(200);
    expect(context.res.body).toHaveLength(1);
  });

  test('returns 500 when listEntities throws', async () => {
    getTableClient.mockReturnValue(
      createRealStyleTableClient([], new Error('storage unavailable'))
    );

    const context = createContext();
    const req = { method: 'GET', query: {}, headers: {} };

    await actionsList(context, req);

    expect(context.res.status).toBe(500);
    expect(context.res.body.error).toBe('Failed to query actions from table storage.');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });
});
