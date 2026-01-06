class MarketplaceApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MarketplaceApiError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.details = options.details || null;
    this.correlationId = options.correlationId || null;
    this.statusCode = options.statusCode || 500;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MarketplaceApiError);
    }
  }

  toString() {
    let message = `${this.name}: ${this.message}`;
    
    if (this.code) {
      message += ` (code: ${this.code})`;
    }
    
    if (this.correlationId) {
      message += ` [correlationId: ${this.correlationId}]`;
    }
    
    return message;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      correlationId: this.correlationId,
      statusCode: this.statusCode
    };
  }
}

module.exports = {
  MarketplaceApiError
};
