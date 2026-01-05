const { ActionsMarketplaceClient, ActionRecord, MarketplaceApiError } = require('../client/index');

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

    it('stores functionKey when provided', () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com/api',
        functionKey: 'test-function-key'
      });

      expect(client.apiUrl).toBe('https://example.com/api');
      expect(client.functionKey).toBe('test-function-key');
      expect(client.useHttpApi).toBe(true);
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

    it('sends HTTP request without code parameter when functionKey is not provided', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ updated: true, created: true, owner: 'test', name: 'action' })
      });
      global.fetch = mockFetch;

      await client.upsertAction({
        owner: 'test',
        name: 'action',
        description: 'Test action'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/ActionsUpsert',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('sends HTTP request with code parameter when functionKey is provided', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com',
        functionKey: 'my-function-key-123'
      });

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ updated: true, created: true, owner: 'test', name: 'action' })
      });
      global.fetch = mockFetch;

      await client.upsertAction({
        owner: 'test',
        name: 'action',
        description: 'Test action'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/ActionsUpsert?code=my-function-key-123',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('URL-encodes functionKey with special characters', async () => {
      const client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com',
        functionKey: 'key+with/special=chars&more'
      });

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ updated: true, created: true, owner: 'test', name: 'action' })
      });
      global.fetch = mockFetch;

      await client.upsertAction({
        owner: 'test',
        name: 'action',
        description: 'Test action'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/ActionsUpsert?code=key%2Bwith%2Fspecial%3Dchars%26more',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
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

  describe('listActions', () => {
    describe('HTTP mode', () => {
      it('fetches actions from HTTP API endpoint without owner filter', async () => {
        const client = new ActionsMarketplaceClient({
          apiUrl: 'https://example.com'
        });

        const mockActions = [
          { owner: 'actions', name: 'checkout', description: 'Checkout code' },
          { owner: 'actions', name: 'setup-node', description: 'Setup Node.js' }
        ];

        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => mockActions
        });
        global.fetch = mockFetch;

        const result = await client.listActions();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api/actions/list',
          expect.objectContaining({
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          })
        );
        expect(result).toEqual(mockActions);
      });

      it('fetches actions from HTTP API endpoint with owner filter', async () => {
        const client = new ActionsMarketplaceClient({
          apiUrl: 'https://example.com'
        });

        const mockActions = [
          { owner: 'actions', name: 'checkout', description: 'Checkout code' }
        ];

        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => mockActions
        });
        global.fetch = mockFetch;

        const result = await client.listActions({ owner: 'actions' });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api/actions/list/actions',
          expect.objectContaining({
            method: 'GET'
          })
        );
        expect(result).toEqual(mockActions);
      });

      it('appends function key when provided', async () => {
        const client = new ActionsMarketplaceClient({
          apiUrl: 'https://example.com',
          functionKey: 'test-key-123'
        });

        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => []
        });
        global.fetch = mockFetch;

        await client.listActions();

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/api/actions/list?code=test-key-123',
          expect.anything()
        );
      });

      it('throws error on non-200 response', async () => {
        const client = new ActionsMarketplaceClient({
          apiUrl: 'https://example.com'
        });

        const mockFetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Internal server error'
        });
        global.fetch = mockFetch;

        await expect(client.listActions()).rejects.toThrow(
          'Failed to list actions via HTTP API: 500 Internal server error'
        );
      });

      it('throws error when response is not an array', async () => {
        const client = new ActionsMarketplaceClient({
          apiUrl: 'https://example.com'
        });

        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ error: 'not an array' })
        });
        global.fetch = mockFetch;

        await expect(client.listActions()).rejects.toThrow(
          'Invalid response format: expected an array of actions'
        );
      });

      it('returns empty array when no actions exist', async () => {
        const client = new ActionsMarketplaceClient({
          apiUrl: 'https://example.com'
        });

        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => []
        });
        global.fetch = mockFetch;

        const result = await client.listActions();

        expect(result).toEqual([]);
      });
    });

    describe('Table Storage mode', () => {
      let mockTableClient;
      let client;

      beforeEach(() => {
        mockTableClient = {
          getEntity: jest.fn(),
          createEntity: jest.fn(),
          updateEntity: jest.fn(),
          listEntities: jest.fn()
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

      it('lists all actions from table storage', async () => {
        const entity1 = ActionRecord.fromRequest({
          owner: 'actions',
          name: 'checkout',
          description: 'Checkout code'
        }).toEntity();
        entity1.etag = 'etag1';
        entity1.partitionKey = 'actions';
        entity1.rowKey = 'checkout';

        const entity2 = ActionRecord.fromRequest({
          owner: 'actions',
          name: 'setup-node',
          description: 'Setup Node.js'
        }).toEntity();
        entity2.etag = 'etag2';
        entity2.partitionKey = 'actions';
        entity2.rowKey = 'setup-node';

        async function* mockListEntities() {
          yield entity1;
          yield entity2;
        }

        mockTableClient.listEntities.mockReturnValue(mockListEntities());

        const result = await client.listActions();

        expect(result).toHaveLength(2);
        expect(result[0].owner).toBe('actions');
        expect(result[0].name).toBe('checkout');
        expect(result[1].owner).toBe('actions');
        expect(result[1].name).toBe('setup-node');
        expect(mockTableClient.listEntities).toHaveBeenCalledWith({});
      });

      it('filters actions by owner', async () => {
        const entity = ActionRecord.fromRequest({
          owner: 'github',
          name: 'action',
          description: 'Test'
        }).toEntity();
        entity.etag = 'etag1';
        entity.partitionKey = 'github';
        entity.rowKey = 'action';

        async function* mockListEntities() {
          yield entity;
        }

        mockTableClient.listEntities.mockReturnValue(mockListEntities());

        const result = await client.listActions({ owner: 'github' });

        expect(result).toHaveLength(1);
        expect(result[0].owner).toBe('github');
        expect(mockTableClient.listEntities).toHaveBeenCalledWith({
          queryOptions: { filter: "PartitionKey eq 'github'" }
        });
      });

      it('sanitizes owner parameter to prevent OData injection', async () => {
        async function* mockListEntities() {
          // Empty generator
        }

        mockTableClient.listEntities.mockReturnValue(mockListEntities());

        // Attempt injection with single quotes
        await client.listActions({ owner: "test' or '1'='1" });

        // Verify that single quotes are escaped
        expect(mockTableClient.listEntities).toHaveBeenCalledWith({
          queryOptions: { filter: "PartitionKey eq 'test'' or ''1''=''1'" }
        });
      });

      it('returns empty array when no actions exist', async () => {
        async function* mockListEntities() {
          // Empty generator
        }

        mockTableClient.listEntities.mockReturnValue(mockListEntities());

        const result = await client.listActions();

        expect(result).toEqual([]);
      });

      it('skips malformed entities and continues', async () => {
        const validEntity = ActionRecord.fromRequest({
          owner: 'actions',
          name: 'checkout',
          description: 'Checkout code'
        }).toEntity();
        validEntity.etag = 'etag1';
        validEntity.partitionKey = 'actions';
        validEntity.rowKey = 'checkout';

        const malformedEntity = {
          partitionKey: 'bad',
          rowKey: 'entity',
          PayloadJson: 'invalid json'
        };

        async function* mockListEntities() {
          yield malformedEntity;
          yield validEntity;
        }

        mockTableClient.listEntities.mockReturnValue(mockListEntities());

        const result = await client.listActions();

        expect(result).toHaveLength(1);
        expect(result[0].owner).toBe('actions');
        expect(result[0].name).toBe('checkout');
      });

      it('throws error on table storage failure', async () => {
        mockTableClient.listEntities.mockImplementation(() => {
          throw new Error('Table storage connection failed');
        });

        await expect(client.listActions()).rejects.toThrow(
          'Failed to list actions from table storage: Table storage connection failed'
        );
      });
    });
  });

  describe('enhanced error handling for HTTP API mode', () => {
    let client;

    beforeEach(() => {
      client = new ActionsMarketplaceClient({
        apiUrl: 'https://example.com'
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('throws MarketplaceApiError with structured error details', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          errorCode: 'VALIDATION_FAILED',
          message: 'Missing required field: owner',
          details: { field: 'owner', value: 'unknown' },
          correlationId: 'abc123'
        })
      });
      global.fetch = mockFetch;

      await expect(
        client.upsertAction({ owner: 'test', name: 'test-action' })
      ).rejects.toThrow(MarketplaceApiError);

      try {
        await client.upsertAction({ owner: 'test', name: 'test-action' });
      } catch (error) {
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(error.message).toBe('Missing required field: owner');
        expect(error.details).toEqual({ field: 'owner', value: 'unknown' });
        expect(error.correlationId).toBe('abc123');
        expect(error.statusCode).toBe(400);
      }
    });

    it('throws MarketplaceApiError for persistence failures', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          errorCode: 'PERSISTENCE_FAILED',
          message: 'Failed to persist action record.',
          details: {
            message: 'Table storage connection failed',
            statusCode: 503
          },
          correlationId: 'xyz789'
        })
      });
      global.fetch = mockFetch;

      await expect(
        client.upsertAction({ owner: 'test', name: 'action' })
      ).rejects.toThrow(MarketplaceApiError);

      try {
        await client.upsertAction({ owner: 'test', name: 'action' });
      } catch (error) {
        expect(error.code).toBe('PERSISTENCE_FAILED');
        expect(error.message).toBe('Failed to persist action record.');
        expect(error.correlationId).toBe('xyz789');
        expect(error.statusCode).toBe(500);
        expect(error.details).toBeDefined();
        expect(error.details.statusCode).toBe(503);
      }
    });

    it('handles legacy error format without structured fields', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Failed to persist action record.'
        })
      });
      global.fetch = mockFetch;

      await expect(
        client.upsertAction({ owner: 'test', name: 'action' })
      ).rejects.toThrow(MarketplaceApiError);

      try {
        await client.upsertAction({ owner: 'test', name: 'action' });
      } catch (error) {
        expect(error.message).toBe('Failed to persist action record.');
        expect(error.statusCode).toBe(500);
      }
    });

    it('handles non-JSON error responses', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'Internal Server Error'
      });
      global.fetch = mockFetch;

      await expect(
        client.upsertAction({ owner: 'test', name: 'action' })
      ).rejects.toThrow(MarketplaceApiError);

      try {
        await client.upsertAction({ owner: 'test', name: 'action' });
      } catch (error) {
        expect(error.message).toContain('Internal Server Error');
        expect(error.statusCode).toBe(500);
      }
    });

    it('includes error details in toString output', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          errorCode: 'VALIDATION_FAILED',
          message: 'Validation error',
          correlationId: 'test-123'
        })
      });
      global.fetch = mockFetch;

      try {
        await client.upsertAction({ owner: 'test', name: 'action' });
      } catch (error) {
        const errorString = error.toString();
        expect(errorString).toContain('VALIDATION_FAILED');
        expect(errorString).toContain('test-123');
      }
    });

    it('provides structured error in toJSON', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          errorCode: 'VALIDATION_FAILED',
          message: 'Field validation failed',
          details: { field: 'repoInfo.updated_at' },
          correlationId: 'correlation-456'
        })
      });
      global.fetch = mockFetch;

      try {
        await client.upsertAction({ owner: 'test', name: 'action' });
      } catch (error) {
        const json = error.toJSON();
        expect(json.name).toBe('MarketplaceApiError');
        expect(json.code).toBe('VALIDATION_FAILED');
        expect(json.message).toBe('Field validation failed');
        expect(json.correlationId).toBe('correlation-456');
        expect(json.statusCode).toBe(400);
      }
    });
  });
});
