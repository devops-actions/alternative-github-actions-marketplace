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
    expect(context.res.body).toHaveLength(50);
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
    expect(context.res.body).toHaveLength(10);
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
    expect(context.res.body).toHaveLength(100);
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
    expect(context.res.body).toHaveLength(25);
    expect(context.res.body.every(a => a.owner === 'testowner')).toBe(true);
  });
});
