const actionsUpsert = require('../ActionsUpsert/index');
const { ActionRecord } = require('../lib/actionRecord');
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
  });
});
