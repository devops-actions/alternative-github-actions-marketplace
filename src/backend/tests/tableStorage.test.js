const { getActionEntity, setTableClient } = require('../lib/tableStorage');

describe('tableStorage helpers', () => {
  afterEach(() => {
    setTableClient(undefined);
  });

  it('returns entity when it exists', async () => {
    const entity = { partitionKey: 'owner', rowKey: 'name' };
    const client = {
      getEntity: jest.fn().mockResolvedValue(entity)
    };

    const result = await getActionEntity('owner', 'name', { tableClient: client });

    expect(result).toBe(entity);
    expect(client.getEntity).toHaveBeenCalledWith('owner', 'name');
  });

  it('returns null when the entity does not exist', async () => {
    const notFound = Object.assign(new Error('Not found'), { statusCode: 404 });
    const client = {
      getEntity: jest.fn().mockRejectedValue(notFound)
    };

    const result = await getActionEntity('absent', 'entity', { tableClient: client });

    expect(result).toBeNull();
    expect(client.getEntity).toHaveBeenCalledWith('absent', 'entity');
  });

  it('propagates unexpected errors', async () => {
    const failure = Object.assign(new Error('boom'), { statusCode: 500 });
    const client = {
      getEntity: jest.fn().mockRejectedValue(failure)
    };

    await expect(getActionEntity('owner', 'name', { tableClient: client })).rejects.toThrow('boom');
    expect(client.getEntity).toHaveBeenCalledWith('owner', 'name');
  });
});
