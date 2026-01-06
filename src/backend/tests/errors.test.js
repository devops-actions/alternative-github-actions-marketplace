const { MarketplaceApiError } = require('../lib/errors');

describe('MarketplaceApiError', () => {
  it('creates error with message', () => {
    const error = new MarketplaceApiError('Test error message');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MarketplaceApiError);
    expect(error.message).toBe('Test error message');
    expect(error.name).toBe('MarketplaceApiError');
  });

  it('creates error with default values', () => {
    const error = new MarketplaceApiError('Test error');

    expect(error.code).toBe('UNKNOWN_ERROR');
    expect(error.details).toBeNull();
    expect(error.correlationId).toBeNull();
    expect(error.statusCode).toBe(500);
  });

  it('creates error with custom code', () => {
    const error = new MarketplaceApiError('Test error', {
      code: 'VALIDATION_FAILED'
    });

    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it('creates error with custom details', () => {
    const details = { field: 'email', constraint: 'unique' };
    const error = new MarketplaceApiError('Test error', {
      details
    });

    expect(error.details).toEqual(details);
  });

  it('creates error with custom correlationId', () => {
    const error = new MarketplaceApiError('Test error', {
      correlationId: 'abc123'
    });

    expect(error.correlationId).toBe('abc123');
  });

  it('creates error with custom statusCode', () => {
    const error = new MarketplaceApiError('Test error', {
      statusCode: 400
    });

    expect(error.statusCode).toBe(400);
  });

  it('creates error with all custom options', () => {
    const error = new MarketplaceApiError('Validation failed', {
      code: 'VALIDATION_FAILED',
      details: { field: 'name', value: null },
      correlationId: 'correlation-123',
      statusCode: 400
    });

    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ field: 'name', value: null });
    expect(error.correlationId).toBe('correlation-123');
    expect(error.statusCode).toBe(400);
  });

  describe('toString', () => {
    it('returns formatted string with message', () => {
      const error = new MarketplaceApiError('Test error');
      const str = error.toString();

      expect(str).toContain('MarketplaceApiError');
      expect(str).toContain('Test error');
    });

    it('includes code in string representation', () => {
      const error = new MarketplaceApiError('Test error', {
        code: 'VALIDATION_FAILED'
      });
      const str = error.toString();

      expect(str).toContain('code: VALIDATION_FAILED');
    });

    it('includes correlationId in string representation', () => {
      const error = new MarketplaceApiError('Test error', {
        correlationId: 'abc123'
      });
      const str = error.toString();

      expect(str).toContain('correlationId: abc123');
    });

    it('includes both code and correlationId', () => {
      const error = new MarketplaceApiError('Test error', {
        code: 'PERSISTENCE_FAILED',
        correlationId: 'xyz789'
      });
      const str = error.toString();

      expect(str).toContain('code: PERSISTENCE_FAILED');
      expect(str).toContain('correlationId: xyz789');
    });
  });

  describe('toJSON', () => {
    it('returns JSON representation with all properties', () => {
      const error = new MarketplaceApiError('Test error', {
        code: 'VALIDATION_FAILED',
        details: { field: 'email' },
        correlationId: 'correlation-123',
        statusCode: 400
      });
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'MarketplaceApiError',
        message: 'Test error',
        code: 'VALIDATION_FAILED',
        details: { field: 'email' },
        correlationId: 'correlation-123',
        statusCode: 400
      });
    });

    it('includes null values in JSON', () => {
      const error = new MarketplaceApiError('Test error');
      const json = error.toJSON();

      expect(json.details).toBeNull();
      expect(json.correlationId).toBeNull();
    });
  });

  describe('error stack trace', () => {
    it('captures stack trace', () => {
      const error = new MarketplaceApiError('Test error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('MarketplaceApiError');
    });
  });

  describe('instanceof checks', () => {
    it('is instanceof MarketplaceApiError', () => {
      const error = new MarketplaceApiError('Test error');

      expect(error instanceof MarketplaceApiError).toBe(true);
    });

    it('is instanceof Error', () => {
      const error = new MarketplaceApiError('Test error');

      expect(error instanceof Error).toBe(true);
    });
  });
});
