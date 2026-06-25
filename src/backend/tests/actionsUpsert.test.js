const actionsUpsert = require('../ActionsUpsert/index');
const { ErrorCodes } = require('../lib/errorResponse');

jest.mock('../lib/tableStorage');

describe('ActionsUpsert error handling', () => {
  let mockContext;
  let mockTableClient;

  beforeEach(() => {
    mockContext = {
      log: {
        warn: jest.fn(),
        error: jest.fn()
      },
      res: null
    };

    mockTableClient = {
      getEntity: jest.fn(),
      createEntity: jest.fn(),
      updateEntity: jest.fn()
    };

    const { getTableClient } = require('../lib/tableStorage');
    getTableClient.mockReturnValue(mockTableClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validation errors', () => {
    it('returns structured error for missing owner field', async () => {
      const req = {
        method: 'POST',
        body: {
          name: 'test-action'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(400);
      expect(mockContext.res.body.errorCode).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(mockContext.res.body.message).toContain('owner');
      expect(mockContext.res.body.correlationId).toBeDefined();
      expect(typeof mockContext.res.body.correlationId).toBe('string');
    });

    it('returns structured error for missing name field', async () => {
      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(400);
      expect(mockContext.res.body.errorCode).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(mockContext.res.body.message).toContain('name');
      expect(mockContext.res.body.correlationId).toBeDefined();
    });

    it('returns structured error for invalid request body', async () => {
      const req = {
        method: 'POST',
        body: null
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(400);
      expect(mockContext.res.body.errorCode).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(mockContext.res.body.correlationId).toBeDefined();
    });

    it('logs validation error with correlation ID', async () => {
      const req = {
        method: 'POST',
        body: { name: 'test' }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.log.warn).toHaveBeenCalled();
      expect(mockContext.log.error).toHaveBeenCalled();
      const errorLogCall = mockContext.log.error.mock.calls.find(
        call => call[0].includes('correlationId')
      );
      expect(errorLogCall).toBeDefined();
    });
  });

  describe('persistence errors', () => {
    beforeEach(() => {
      mockTableClient.getEntity.mockRejectedValue({ statusCode: 404 });
    });

    it('returns structured error when create fails', async () => {
      const error = new Error('Table storage connection failed');
      error.statusCode = 503;
      error.code = 'ServiceUnavailable';
      mockTableClient.createEntity.mockRejectedValue(error);

      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner',
          name: 'test-action',
          description: 'Test action'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(500);
      expect(mockContext.res.body.errorCode).toBe(ErrorCodes.PERSISTENCE_FAILED);
      expect(mockContext.res.body.message).toBe('Failed to persist action record.');
      expect(mockContext.res.body.correlationId).toBeDefined();
      expect(mockContext.res.body.details).toBeDefined();
      expect(mockContext.res.body.details.statusCode).toBe(503);
      expect(mockContext.res.body.details.code).toBe('ServiceUnavailable');
    });

    it('returns structured error for service unavailable on create', async () => {
      // Mock getEntity to return 404 (entity doesn't exist)
      mockTableClient.getEntity.mockRejectedValue({ statusCode: 404 });

      // Mock createEntity to fail with service unavailable
      const error = new Error('Storage service unavailable');
      error.statusCode = 503;
      error.code = 'ServiceUnavailable';
      mockTableClient.createEntity.mockRejectedValue(error);

      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner',
          name: 'test-action',
          description: 'Test action'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(500);
      expect(mockContext.res.body.errorCode).toBe(ErrorCodes.PERSISTENCE_FAILED);
      expect(mockContext.res.body.correlationId).toBeDefined();
      expect(mockContext.res.body.details).toBeDefined();
      expect(mockContext.res.body.details.statusCode).toBe(503);
      expect(mockContext.res.body.details.code).toBe('ServiceUnavailable');
    });

    it('logs detailed error information including stack trace', async () => {
      const error = new Error('Storage error');
      error.stack = 'Error: Storage error\n  at someFunction (file.js:10:5)';
      mockTableClient.createEntity.mockRejectedValue(error);

      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner',
          name: 'test-action',
          description: 'Test'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        expect.stringContaining('Stack trace'),
        expect.any(String)
      );
      expect(mockContext.log.error).toHaveBeenCalledWith(
        expect.stringContaining('correlationId'),
        expect.any(String)
      );
    });

    it('includes error details in structured response', async () => {
      const error = new Error('Constraint violation');
      error.code = 'EntityTooLarge';
      error.details = { maxSize: 1048576, actualSize: 2000000 };
      mockTableClient.createEntity.mockRejectedValue(error);

      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner',
          name: 'test-action',
          description: 'Test'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.body.details).toBeDefined();
      expect(mockContext.res.body.details.code).toBe('EntityTooLarge');
      expect(mockContext.res.body.details.errorDetails).toEqual({
        maxSize: 1048576,
        actualSize: 2000000
      });
    });
  });

  describe('successful operations', () => {
    it('still returns success response for new entity', async () => {
      mockTableClient.getEntity.mockRejectedValue({ statusCode: 404 });
      mockTableClient.createEntity.mockResolvedValue({});

      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner',
          name: 'test-action',
          description: 'Test action'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(201);
      expect(mockContext.res.body.updated).toBe(true);
      expect(mockContext.res.body.created).toBe(true);
      expect(mockContext.res.body.errorCode).toBeUndefined();
    });

    it('returns 200 when action is unchanged (matches existing)', async () => {
      const { ActionRecord } = require('../lib/actionRecord');
      const { getActionEntity } = require('../lib/tableStorage');
      const record = ActionRecord.fromRequest({
        owner: 'test-owner',
        name: 'test-action',
        description: 'Test action'
      });
      // Return an entity with the same hash so matchesExisting returns true
      const entity = record.toEntity();
      getActionEntity.mockResolvedValue(entity);

      const req = {
        method: 'POST',
        body: {
          owner: 'test-owner',
          name: 'test-action',
          description: 'Test action'
        }
      };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(200);
      expect(mockContext.res.body.updated).toBe(false);
    });
  });

  describe('HTTP method handling', () => {
    it('returns 204 for OPTIONS request', async () => {
      const req = { method: 'OPTIONS' };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(204);
      expect(mockContext.res.headers['Allow']).toBe('POST,OPTIONS');
    });

    it('returns 405 for non-POST/OPTIONS methods', async () => {
      const req = { method: 'GET' };

      await actionsUpsert(mockContext, req);

      expect(mockContext.res.status).toBe(405);
      expect(mockContext.res.body.error).toBe('Method not allowed.');
    });
  });

  describe('conflict handling', () => {
    it('retries on 409 conflict during createEntity (race condition)', async () => {
      const { getActionEntity } = require('../lib/tableStorage');
      // First call: no existing entity
      getActionEntity.mockResolvedValue(null);

      const conflictError = Object.assign(new Error('EntityAlreadyExists'), { statusCode: 409 });
      mockTableClient.createEntity.mockRejectedValue(conflictError);

      // After conflict, getEntity returns the existing entity
      const { ActionRecord } = require('../lib/actionRecord');
      const record = ActionRecord.fromRequest({
        owner: 'conflict-owner',
        name: 'conflict-action',
        description: 'test'
      });
      const existingEntity = record.toEntity();
      mockTableClient.getEntity.mockResolvedValue(existingEntity);
      // After retry: updateEntity succeeds
      mockTableClient.updateEntity.mockResolvedValue({});

      const req = {
        method: 'POST',
        body: { owner: 'conflict-owner', name: 'conflict-action', description: 'test' }
      };

      await actionsUpsert(mockContext, req);

      expect(mockTableClient.createEntity).toHaveBeenCalledTimes(1);
      expect(mockTableClient.getEntity).toHaveBeenCalledTimes(1);
      // Either updated (same payload → matchesExisting) or updated via updateEntity
      expect([200, 201]).toContain(mockContext.res.status);
    });

    it('short-circuits on 412 ETag mismatch when hash matches latest', async () => {
      const { ActionRecord } = require('../lib/actionRecord');
      const { getActionEntity } = require('../lib/tableStorage');

      const record = ActionRecord.fromRequest({
        owner: 'etag-owner',
        name: 'etag-action',
        description: 'unchanged'
      });
      const existingEntity = record.toEntity();
      existingEntity.etag = 'old-etag';

      // getActionEntity returns entity with same hash → matchesExisting passes in upsert handler
      // but we need to exercise persistActionRecord's 412 path
      // To do that: getActionEntity returns entity with DIFFERENT hash so matchesExisting is false
      const differentEntity = { ...existingEntity, PayloadHash: 'different-hash', etag: 'old-etag' };
      getActionEntity.mockResolvedValue(differentEntity);

      const etagError = Object.assign(new Error('PreconditionFailed'), { statusCode: 412 });
      mockTableClient.updateEntity.mockRejectedValue(etagError);

      // After 412, getEntity returns entity with SAME hash as record (concurrent write by someone else with same data)
      mockTableClient.getEntity.mockResolvedValue(existingEntity);

      const req = {
        method: 'POST',
        body: { owner: 'etag-owner', name: 'etag-action', description: 'unchanged' }
      };

      await actionsUpsert(mockContext, req);

      expect(mockTableClient.updateEntity).toHaveBeenCalledTimes(1);
      expect(mockTableClient.getEntity).toHaveBeenCalledTimes(1);
      expect(mockContext.res.status).toBe(200);
      expect(mockContext.res.body.updated).toBe(false);
    });
  });
});
