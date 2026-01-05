const crypto = require('crypto');

const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION'
};

function generateCorrelationId() {
  return crypto.randomBytes(16).toString('hex');
}

function createErrorResponse(errorCode, message, details = null, statusCode = 500) {
  const correlationId = generateCorrelationId();
  
  return {
    statusCode,
    body: {
      errorCode,
      message,
      details: details || undefined,
      correlationId
    },
    correlationId
  };
}

function extractErrorDetails(error) {
  const details = {
    message: error.message,
    name: error.name
  };

  if (error.statusCode) {
    details.statusCode = error.statusCode;
  }

  if (error.code) {
    details.code = error.code;
  }

  if (error.details) {
    details.errorDetails = error.details;
  }

  if (error.response) {
    details.response = error.response;
  }

  return details;
}

function logErrorDetails(context, error, correlationId) {
  context.log.error('Error occurred [correlationId=%s]:', correlationId);
  context.log.error('  Message: %s', error.message);
  context.log.error('  Name: %s', error.name);
  
  if (error.stack) {
    context.log.error('  Stack trace:\n%s', error.stack);
  }
  
  if (error.statusCode) {
    context.log.error('  Status code: %s', error.statusCode);
  }
  
  if (error.code) {
    context.log.error('  Error code: %s', error.code);
  }
  
  if (error.details) {
    context.log.error('  Details: %s', JSON.stringify(error.details, null, 2));
  }
}

module.exports = {
  ErrorCodes,
  generateCorrelationId,
  createErrorResponse,
  extractErrorDetails,
  logErrorDetails
};
