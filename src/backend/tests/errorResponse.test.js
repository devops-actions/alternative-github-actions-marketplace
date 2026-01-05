const { ErrorCodes, generateCorrelationId, createErrorResponse, extractErrorDetails, logErrorDetails } = require('../lib/errorResponse');

describe('errorResponse', () => {
  describe('ErrorCodes', () => {
    it('defines expected error codes', () => {
      expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ErrorCodes.PERSISTENCE_FAILED).toBe('PERSISTENCE_FAILED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.CONSTRAINT_VIOLATION).toBe('CONSTRAINT_VIOLATION');
    });
  });

  describe('generateCorrelationId', () => {
    it('generates a non-empty string', () => {
      const id = generateCorrelationId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('generates unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });

    it('generates 32-character hex strings', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('createErrorResponse', () => {
    it('creates error response with all fields', () => {
      const response = createErrorResponse(
        ErrorCodes.VALIDATION_FAILED,
        'Test error message',
        { field: 'testField' },
        400
      );

      expect(response.statusCode).toBe(400);
      expect(response.body.errorCode).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(response.body.message).toBe('Test error message');
      expect(response.body.details).toEqual({ field: 'testField' });
      expect(response.body.correlationId).toBeDefined();
      expect(typeof response.body.correlationId).toBe('string');
      expect(response.correlationId).toBe(response.body.correlationId);
    });

    it('uses default status code 500 when not provided', () => {
      const response = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Internal error'
      );

      expect(response.statusCode).toBe(500);
    });

    it('omits details field when null', () => {
      const response = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Error message',
        null,
        500
      );

      expect(response.body.details).toBeUndefined();
    });

    it('includes details when provided', () => {
      const details = { foo: 'bar', nested: { key: 'value' } };
      const response = createErrorResponse(
        ErrorCodes.PERSISTENCE_FAILED,
        'Persistence error',
        details,
        500
      );

      expect(response.body.details).toEqual(details);
    });
  });

  describe('extractErrorDetails', () => {
    it('extracts basic error properties', () => {
      const error = new Error('Test error');
      error.name = 'TestError';

      const details = extractErrorDetails(error);

      expect(details.message).toBe('Test error');
      expect(details.name).toBe('TestError');
    });

    it('extracts statusCode when present', () => {
      const error = new Error('HTTP error');
      error.statusCode = 409;

      const details = extractErrorDetails(error);

      expect(details.statusCode).toBe(409);
    });

    it('extracts code when present', () => {
      const error = new Error('Error with code');
      error.code = 'ECONNREFUSED';

      const details = extractErrorDetails(error);

      expect(details.code).toBe('ECONNREFUSED');
    });

    it('extracts details property when present', () => {
      const error = new Error('Complex error');
      error.details = { field: 'email', constraint: 'unique' };

      const details = extractErrorDetails(error);

      expect(details.errorDetails).toEqual({ field: 'email', constraint: 'unique' });
    });

    it('extracts response property when present', () => {
      const error = new Error('API error');
      error.response = { status: 400, body: 'Bad request' };

      const details = extractErrorDetails(error);

      expect(details.response).toEqual({ status: 400, body: 'Bad request' });
    });

    it('handles errors with multiple properties', () => {
      const error = new Error('Complex error');
      error.statusCode = 422;
      error.code = 'VALIDATION_ERROR';
      error.details = { fields: ['email', 'password'] };

      const details = extractErrorDetails(error);

      expect(details.message).toBe('Complex error');
      expect(details.statusCode).toBe(422);
      expect(details.code).toBe('VALIDATION_ERROR');
      expect(details.errorDetails).toEqual({ fields: ['email', 'password'] });
    });
  });

  describe('logErrorDetails', () => {
    let mockContext;

    beforeEach(() => {
      mockContext = {
        log: {
          error: jest.fn()
        }
      };
    });

    it('logs basic error information', () => {
      const error = new Error('Test error');
      const correlationId = 'test-correlation-id';

      logErrorDetails(mockContext, error, correlationId);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        'Error occurred [correlationId=%s]:',
        correlationId
      );
      expect(mockContext.log.error).toHaveBeenCalledWith(
        '  Message: %s',
        'Test error'
      );
      expect(mockContext.log.error).toHaveBeenCalledWith(
        '  Name: %s',
        'Error'
      );
    });

    it('logs stack trace when present', () => {
      const error = new Error('Test error with stack');
      const correlationId = 'test-id';

      logErrorDetails(mockContext, error, correlationId);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        '  Stack trace:\n%s',
        error.stack
      );
    });

    it('logs statusCode when present', () => {
      const error = new Error('HTTP error');
      error.statusCode = 409;
      const correlationId = 'test-id';

      logErrorDetails(mockContext, error, correlationId);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        '  Status code: %s',
        409
      );
    });

    it('logs error code when present', () => {
      const error = new Error('Coded error');
      error.code = 'ECONNREFUSED';
      const correlationId = 'test-id';

      logErrorDetails(mockContext, error, correlationId);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        '  Error code: %s',
        'ECONNREFUSED'
      );
    });

    it('logs details as JSON when present', () => {
      const error = new Error('Detailed error');
      error.details = { field: 'email', value: 'invalid' };
      const correlationId = 'test-id';

      logErrorDetails(mockContext, error, correlationId);

      expect(mockContext.log.error).toHaveBeenCalledWith(
        '  Details: %s',
        JSON.stringify(error.details, null, 2)
      );
    });
  });
});
