const { ActionsMarketplaceClient, ActionRecord } = require('../client/index');

jest.mock('../lib/tableStorage');

describe('ActionsMarketplaceClient', () => {
  describe('constructor', () => {
    it('creates client in HTTP API mode when apiUrl is provided', () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com/api'
      });

      expect(client.apiUrl).toBe('https://example.com/api');
      expect(client.useHttpApi).toBe(true);
    });

    it('strips trailing slash from apiUrl', () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com/api/'
      });

      expect(client.apiUrl).toBe('https://example.com/api');
    });

    it('creates client in table mode when tableEndpoint is provided', () => {
      const mockTableClient = { name: 'mock' };
      const { createTableClient } = require('../lib/tableStorage');
      createTableClient.mockReturnValue(mockTableClient);

      const client = new ActionsMarketplaceClient({
        tableEndpoint: 'https://account.table.core.windows.net'
      });

      expect(client.tableClient).toBe(mockTableClient);
      expect(client.useHttpApi).toBe(false);
    });
  });

  describe('upsertAction', () => {
    it('validates action data before processing', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });

      await expect(client.upsertAction({ name: 'test' })).rejects.toThrow('Missing required field: owner');
      await expect(client.upsertAction({ owner: 'test' })).rejects.toThrow('Missing required field: name');
    });
  });

  describe('batchUpsertActions', () => {
    it('processes multiple actions and returns results', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });

      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ updated: true, created: true, owner: 'owner1', name: 'action1' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Bad request'
        });

      const actions = [
        { owner: 'owner1', name: 'action1', description: 'First action' },
        { owner: 'owner2', name: 'action2', description: 'Second action' }
      ];

      const results = await client.batchUpsertActions(actions);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].action).toBe('owner1/action1');
      expect(results[1].success).toBe(false);
      expect(results[1].action).toBe('owner2/action2');
      expect(results[1].error).toContain('Failed to upsert action via HTTP API');
    });

    it('handles validation errors in batch', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });

      const actions = [
        { owner: 'owner1', name: 'action1' },
        { name: 'action2' }  // Missing owner
      ];

      const results = await client.batchUpsertActions(actions);

      expect(results).toHaveLength(2);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Missing required field: owner');
    });

    it('handles invalid action objects gracefully', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });

      const actions = [
        null,
        undefined,
        {},
        { owner: 'test' }
      ];

      const results = await client.batchUpsertActions(actions);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.action).toBeDefined();
      });
    });
  });

  describe('table storage mode', () => {
    let mockTableClient;
    let client;

    beforeEach(() => {
      mockTableClient = {
        getEntity: jest.fn(),
        createEntity: jest.fn(),
        updateEntity: jest.fn()
      };

      const { createTableClient } = require('../lib/tableStorage');
      createTableClient.mockReturnValue(mockTableClient);

      client = new ActionsMarketplaceClient({
        tableEndpoint: 'https://account.table.core.windows.net'
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('creates new entity when not exists', async () => {
      mockTableClient.getEntity.mockRejectedValue({ statusCode: 404 });
      mockTableClient.createEntity.mockResolvedValue({});

      const result = await client.upsertAction({
        owner: 'testowner',
        name: 'testaction',
        description: 'Test'
      });

      expect(result.created).toBe(true);
      expect(result.updated).toBe(true);
      expect(result.owner).toBe('testowner');
      expect(result.name).toBe('testaction');
      expect(mockTableClient.createEntity).toHaveBeenCalled();
    });

    it('skips update when data has not changed', async () => {
      const record = ActionRecord.fromRequest({
        owner: 'testowner',
        name: 'testaction',
        description: 'Test'
      });
      
      const existingEntity = record.toEntity();
      existingEntity.etag = 'existing-etag';

      mockTableClient.getEntity.mockResolvedValue(existingEntity);

      const result = await client.upsertAction({
        owner: 'testowner',
        name: 'testaction',
        description: 'Test'
      });

      expect(result.updated).toBe(false);
      expect(result.created).toBe(false);
      expect(mockTableClient.createEntity).not.toHaveBeenCalled();
      expect(mockTableClient.updateEntity).not.toHaveBeenCalled();
    });

    it('updates entity when data has changed', async () => {
      const oldRecord = ActionRecord.fromRequest({
        owner: 'testowner',
        name: 'testaction',
        description: 'Old description'
      });
      
      const existingEntity = oldRecord.toEntity();
      existingEntity.etag = 'existing-etag';

      mockTableClient.getEntity.mockResolvedValue(existingEntity);
      mockTableClient.updateEntity.mockResolvedValue({});

      const result = await client.upsertAction({
        owner: 'testowner',
        name: 'testaction',
        description: 'New description'
      });

      expect(result.updated).toBe(true);
      expect(result.created).toBe(false);
      expect(mockTableClient.updateEntity).toHaveBeenCalled();
    });

    it('handles concurrent creation conflict by retrying', async () => {
      mockTableClient.getEntity
        .mockRejectedValueOnce({ statusCode: 404 })
        .mockResolvedValueOnce({
          PayloadHash: 'different-hash',
          etag: 'etag-from-concurrent-create'
        });
      
      mockTableClient.createEntity.mockRejectedValue({ statusCode: 409 });
      mockTableClient.updateEntity.mockResolvedValue({});

      const result = await client.upsertAction({
        owner: 'testowner',
        name: 'testaction',
        description: 'Test'
      });

      expect(result.updated).toBe(true);
      expect(mockTableClient.createEntity).toHaveBeenCalledTimes(1);
      expect(mockTableClient.updateEntity).toHaveBeenCalledTimes(1);
    });
  });
});
