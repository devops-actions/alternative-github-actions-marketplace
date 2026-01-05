# Error Handling Comparison: Before vs After

## Before (Original Implementation)

When an upsertAction call failed, the error message was generic:

```
❌ mcasperson/mcasperson_SecondBrain – Failed to upsert action via HTTP API: 500 {"error":"Failed to persist action record."}
```

**Problems:**
- No way to distinguish validation errors from persistence errors
- No correlation ID for tracing
- No details about what field caused the issue
- No information about the specific constraint that failed
- All errors looked the same regardless of the root cause

## After (Enhanced Implementation)

### Validation Error Example

```
❌ mcasperson/mcasperson_SecondBrain – VALIDATION_FAILED: Field repoInfo.updated_at must be a valid ISO8601 timestamp (correlationId=abc123def456)
```

### Persistence Error Example

```
❌ mcasperson/mcasperson_SecondBrain – PERSISTENCE_FAILED: Failed to persist action record. (correlationId=xyz789abc012)
   Underlying error: Entity too large (EntityTooLarge)
   Details: maxSize=1048576, actualSize=2000000
```

**Benefits:**
- ✅ Clear error codes (VALIDATION_FAILED, PERSISTENCE_FAILED, etc.)
- ✅ Correlation IDs for tracing errors server-side
- ✅ Specific field names and values that caused issues
- ✅ Constraint violation details (size limits, type mismatches, etc.)
- ✅ Appropriate HTTP status codes (400 for validation, 500 for server errors)
- ✅ Structured error objects in code with `code`, `details`, `correlationId` properties

## Technical Implementation

### Backend (ActionsUpsert function)

**Before:**
```javascript
catch (error) {
  context.log.error('Failed to upsert record: %s', error.message);
  context.res = {
    status: 500,
    body: { error: 'Failed to persist action record.' }
  };
}
```

**After:**
```javascript
catch (error) {
  const errorDetails = extractErrorDetails(error);
  const errorResponse = createErrorResponse(
    ErrorCodes.PERSISTENCE_FAILED,
    'Failed to persist action record.',
    errorDetails,
    500
  );
  logErrorDetails(context, error, errorResponse.correlationId);
  context.res = {
    status: errorResponse.statusCode,
    body: errorResponse.body  // { errorCode, message, details, correlationId }
  };
}
```

### Client Library

**Before:**
```javascript
if (!response.ok) {
  const errorBody = await response.text();
  throw new Error(`Failed to upsert action via HTTP API: ${response.status} ${errorBody}`);
}
```

**After:**
```javascript
if (!response.ok) {
  let errorBody;
  try {
    errorBody = await response.json();
  } catch (jsonError) {
    const textBody = await response.text();
    throw new MarketplaceApiError(
      `Failed to upsert action via HTTP API: ${response.status} ${textBody}`,
      { statusCode: response.status, details: { responseBody: textBody } }
    );
  }

  if (errorBody.errorCode && errorBody.message) {
    throw new MarketplaceApiError(
      errorBody.message,
      {
        code: errorBody.errorCode,
        details: errorBody.details,
        correlationId: errorBody.correlationId,
        statusCode: response.status
      }
    );
  }
  // ... fallback handling
}
```

## Usage in GitHub Actions Workflows

With the enhanced error handling, workflow summaries can now display:

```javascript
const results = await client.batchUpsertActions(actions);

results.forEach(result => {
  if (result.success) {
    console.log(`✅ ${result.action} – ${result.result.created ? 'created' : 'updated'}`);
  } else {
    const error = result.error;
    if (error.code) {
      console.log(`❌ ${result.action} – ${error.code}: ${error.message} (correlationId=${error.correlationId})`);
      if (error.details) {
        console.log(`   Details:`, JSON.stringify(error.details, null, 2));
      }
    } else {
      console.log(`❌ ${result.action} – ${error.message}`);
    }
  }
});
```

Output:
```
✅ actions/checkout – created
✅ actions/setup-node – updated
❌ mcasperson/mcasperson_SecondBrain – VALIDATION_FAILED: Field repoInfo.updated_at must be a valid ISO8601 timestamp (correlationId=abc123...)
   Details: {"field":"repoInfo.updated_at","value":"2024-13-45","expectedFormat":"ISO8601"}
❌ trufflesecurity/trufflesecurity_trufflehog – PERSISTENCE_FAILED: Failed to persist action record. (correlationId=xyz789...)
   Details: {"message":"Entity too large","code":"EntityTooLarge","maxSize":1048576}
```

This makes it much easier to:
1. Identify and fix validation issues quickly
2. Report issues with correlation IDs for debugging
3. Understand the root cause without checking server logs
4. Distinguish between client errors (400s) and server errors (500s)
