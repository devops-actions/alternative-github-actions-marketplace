const path = require('path');
const { ActionsMarketplaceClient } = require('../client/index');
const { FakeTableClient } = require('../integration/support/fakeTableClient');
const { setTableClient } = require('../lib/tableStorage');

const sampleActions = require(path.join(__dirname, 'data', 'sampleActions.json'));

describe('Client Package Integration', () => {
  let fakeTableClient;
  let client;

  beforeEach(() => {
    fakeTableClient = new FakeTableClient();
    setTableClient(fakeTableClient);
    
    // Create client in direct table mode using the fake client
    client = new ActionsMarketplaceClient({
      tableEndpoint: 'https://fake.table.core.windows.net',
      tableName: 'actions'
    });
    
    // Override the client's tableClient with our fake
    client.tableClient = fakeTableClient;
  });

  afterEach(() => {
    setTableClient(null);
  });

  describe('Direct Table Storage Mode', () => {
    it('should upsert a new action successfully', async () => {
      const action = sampleActions[0];

      const result = await client.upsertAction(action);

      expect(result.created).toBe(true);
      expect(result.updated).toBe(true);
      expect(result.owner).toBe(action.owner);
      expect(result.name).toBe(action.name);
      expect(result.lastSyncedUtc).toBeDefined();
    });

    it('should skip update when action data has not changed', async () => {
      const action = sampleActions[0];

      // First upsert
      const result1 = await client.upsertAction(action);
      expect(result1.created).toBe(true);

      // Second upsert with same data
      const result2 = await client.upsertAction(action);
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(false);
      expect(result2.lastSyncedUtc).toBe(result1.lastSyncedUtc);
    });

    it('should update when action data has changed', async () => {
      const action = sampleActions[0];

      // First upsert
      const result1 = await client.upsertAction(action);
      expect(result1.created).toBe(true);

      // Modify and upsert again
      const modifiedAction = { ...action, description: 'Updated description' };
      const result2 = await client.upsertAction(modifiedAction);
      
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(true);
      expect(result2.lastSyncedUtc).not.toBe(result1.lastSyncedUtc);
    });

    it('should handle concurrent creation conflict by retrying', async () => {
      const action = sampleActions[0];

      // Simulate concurrent creation by having another process create first
      const directResult = await client.upsertAction(action);
      expect(directResult.created).toBe(true);

      // Now try to upsert with different data - should update
      const modifiedAction = { ...action, version: 'v2.0.0' };
      const retryResult = await client.upsertAction(modifiedAction);
      
      expect(retryResult.created).toBe(false);
      expect(retryResult.updated).toBe(true);
    });

    it('should batch upsert multiple actions successfully', async () => {
      const actions = [
        sampleActions[0],
        sampleActions[1],
        sampleActions[2]
      ];

      const results = await client.batchUpsertActions(actions);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.result.created).toBe(true);
      });
    });

    it('should handle batch upsert with some failures', async () => {
      const actions = [
        sampleActions[0],
        { name: 'missing-owner' }, // Invalid - missing owner
        sampleActions[1]
      ];

      const results = await client.batchUpsertActions(actions);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Missing required field: owner');
      expect(results[2].success).toBe(true);
    });

    it('should verify data round-trips correctly', async () => {
      const action = {
        owner: 'testowner',
        name: 'testaction',
        description: 'Test action for round-trip',
        version: 'v1.0.0',
        icon: 'test',
        color: 'blue'
      };

      // Upsert the action
      const upsertResult = await client.upsertAction(action);
      expect(upsertResult.created).toBe(true);

      // Retrieve directly from fake table client
      const partitionKey = action.owner.toLowerCase();
      const rowKey = action.name.toLowerCase();
      const entity = await fakeTableClient.getEntity(partitionKey, rowKey);

      // Verify the entity has the correct structure
      expect(entity).toBeDefined();
      expect(entity.Owner).toBe(action.owner);
      expect(entity.Name).toBe(action.name);
      expect(entity.PayloadJson).toBeDefined();
      expect(entity.PayloadHash).toBeDefined();
      expect(entity.LastSyncedUtc).toBe(upsertResult.lastSyncedUtc);

      // Verify payload is preserved
      const storedPayload = JSON.parse(entity.PayloadJson);
      expect(storedPayload.owner).toBe(action.owner);
      expect(storedPayload.name).toBe(action.name);
      expect(storedPayload.description).toBe(action.description);
    });

    it('should handle multiple upserts of same action efficiently', async () => {
      const action = sampleActions[0];
      const upsertCount = 5;
      const results = [];

      for (let i = 0; i < upsertCount; i++) {
        const result = await client.upsertAction(action);
        results.push(result);
      }

      // First should create
      expect(results[0].created).toBe(true);
      expect(results[0].updated).toBe(true);

      // Rest should skip (no changes)
      for (let i = 1; i < upsertCount; i++) {
        expect(results[i].created).toBe(false);
        expect(results[i].updated).toBe(false);
      }

      // All should have same timestamp (no actual updates after first)
      const timestamps = results.map(r => r.lastSyncedUtc);
      expect(new Set(timestamps).size).toBe(1);
    });
  });

  describe('HTTP API Mode (Mocked)', () => {
    let httpClient;
    let mockFetch;

    beforeEach(() => {
      // Save original fetch
      mockFetch = jest.fn();
      global.fetch = mockFetch;

      httpClient = new ActionsMarketplaceClient({
        apiUrl: 'https://fake-api.example.com'
      });
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should successfully upsert via HTTP API', async () => {
      const action = sampleActions[0];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          updated: true,
          created: true,
          owner: action.owner,
          name: action.name,
          lastSyncedUtc: new Date().toISOString()
        })
      });

      const result = await httpClient.upsertAction(action);

      expect(result.created).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://fake-api.example.com/api/ActionsUpsert',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should handle HTTP errors gracefully', async () => {
      const action = sampleActions[0];
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      await expect(httpClient.upsertAction(action)).rejects.toThrow(
        'Failed to upsert action via HTTP API'
      );
    });

    it('should batch upsert via HTTP API', async () => {
      const actions = [sampleActions[0], sampleActions[1]];
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            updated: true,
            created: true,
            owner: actions[0].owner,
            name: actions[0].name,
            lastSyncedUtc: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            updated: true,
            created: true,
            owner: actions[1].owner,
            name: actions[1].name,
            lastSyncedUtc: new Date().toISOString()
          })
        });

      const results = await httpClient.batchUpsertActions(actions);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Package Exports', () => {
    it('should export ActionsMarketplaceClient', () => {
      expect(ActionsMarketplaceClient).toBeDefined();
      expect(typeof ActionsMarketplaceClient).toBe('function');
    });

    it('should export ActionRecord', () => {
      const { ActionRecord } = require('../client/index');
      expect(ActionRecord).toBeDefined();
      expect(typeof ActionRecord).toBe('function');
    });

    it('should create client instances with proper configuration', () => {
      const httpClient = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });
      expect(httpClient.useHttpApi).toBe(true);
      expect(httpClient.apiUrl).toBe('https://example.com');

      const tableClient = new ActionsMarketplaceClient({
        tableEndpoint: 'https://account.table.core.windows.net'
      });
      expect(tableClient.useHttpApi).toBe(false);
      expect(tableClient.tableClient).toBeDefined();
    });
  });
});
