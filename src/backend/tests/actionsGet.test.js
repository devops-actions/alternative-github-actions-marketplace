const path = require('path');
const { ActionRecord } = require('../lib/actionRecord');

jest.mock('../lib/tableStorage', () => ({
  getActionEntity: jest.fn()
}));

const { getActionEntity } = require('../lib/tableStorage');
const actionsGet = require('../ActionsGet');

const sampleActions = require(path.join(__dirname, 'data', 'sampleActions.json'));

function createContext(owner, name) {
  return {
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    bindingData: { owner, name }
  };
}

describe('ActionsGet function', () => {
  const basePayload = sampleActions[0];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with action payload and metadata when entity exists', async () => {
    const record = ActionRecord.fromRequest(basePayload);
    const entity = {
      ...record.toEntity(new Date('2025-01-01T12:00:00Z')),
      etag: 'W/"etag-value"'
    };

    getActionEntity.mockResolvedValue(entity);

    const context = createContext(basePayload.owner, basePayload.name);
    const req = { method: 'GET', query: {} };

    await actionsGet(context, req);

    expect(getActionEntity).toHaveBeenCalledWith(record.partitionKey, record.rowKey);
    expect(context.res.status).toBe(200);
    expect(context.res.body.owner).toBe(basePayload.owner);
    expect(context.res.body.name).toBe(basePayload.name);
    expect(context.res.body._metadata).toMatchObject({
      partitionKey: record.partitionKey,
      rowKey: record.rowKey,
      payloadHash: record.hash,
      lastSyncedUtc: '2025-01-01T12:00:00Z',
      etag: 'W/"etag-value"'
    });
  });

  it('returns 404 when the entity is missing', async () => {
    getActionEntity.mockResolvedValue(null);

    const context = createContext(basePayload.owner, basePayload.name);
    const req = { method: 'GET' };

    await actionsGet(context, req);

    expect(context.res.status).toBe(404);
    expect(context.res.body).toEqual({ error: 'Action not found.' });
  });

  it('returns 400 when owner or name is missing', async () => {
    const context = createContext(undefined, basePayload.name);
    const req = { method: 'GET' };

    await actionsGet(context, req);

    expect(context.res.status).toBe(400);
    expect(context.res.body).toEqual({ error: 'Owner and name route parameters are required.' });
  });

  it('returns 500 when entity retrieval fails', async () => {
    getActionEntity.mockRejectedValue(new Error('storage unavailable'));

    const context = createContext(basePayload.owner, basePayload.name);
    const req = { method: 'GET' };

    await actionsGet(context, req);

    expect(context.res.status).toBe(500);
    expect(context.res.body).toEqual({ error: 'Failed to retrieve action.' });
  });

  it('returns 500 when stored payload cannot be deserialized', async () => {
    const entity = {
      partitionKey: 'owner',
      rowKey: 'name',
      PayloadJson: '{"owner":1,"name":null}',
      PayloadHash: 'hash'
    };

    getActionEntity.mockResolvedValue(entity);

    const context = createContext(basePayload.owner, basePayload.name);
    const req = { method: 'GET' };

    await actionsGet(context, req);

    expect(context.res.status).toBe(500);
    expect(context.res.body).toEqual({ error: 'Stored action payload is invalid.' });
  });
});
