#!/usr/bin/env node

/**
 * Demonstration script showing the enhanced error handling
 * This simulates what would be seen in a GitHub Actions workflow
 */

const { ActionsMarketplaceClient, MarketplaceApiError } = require('../client/index');

async function demonstrateEnhancedErrors() {
  console.log('=== Enhanced Error Handling Demonstration ===\n');

  // Simulate an HTTP API client (we'll mock the fetch calls)
  const client = new ActionsMarketplaceClient({
    apiUrl: 'https://example-api.azurewebsites.net'
  });

  // Test 1: Client-side validation error (missing required field)
  console.log('Test 1: Client-Side Validation Error (Missing Owner Field)');
  console.log('----------------------------------------------------------------');
  
  try {
    await client.upsertAction({ name: 'test-action' });
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.log(`   Type: ${error.name}`);
    console.log('\nNote: Client-side validation throws standard Error');
    console.log('Server-side validation would return MarketplaceApiError with correlationId');
  }

  // Test 1b: Server-side validation error
  console.log('\n\nTest 1b: Server-Side Validation Error (Invalid Field Value)');
  console.log('---------------------------------------------------------------');
  
  // Create a fresh mock for this test
  const mockFetch1 = function() {
    return Promise.resolve({
      ok: false,
      status: 400,
      json: async () => ({
        errorCode: 'VALIDATION_FAILED',
        message: 'Field repoInfo.updated_at must be a valid ISO8601 timestamp',
        details: { 
          field: 'repoInfo.updated_at', 
          value: 'invalid-date',
          expectedFormat: 'ISO8601'
        },
        correlationId: 'abc123def456'
      })
    });
  };
  global.fetch = mockFetch1;

  try {
    await client.upsertAction({
      owner: 'mcasperson',
      name: 'mcasperson_SecondBrain',
      repoInfo: { updated_at: 'invalid-date' }
    });
  } catch (error) {
    if (error instanceof MarketplaceApiError) {
      console.log(`❌ Error: ${error.message}`);
      console.log(`   Code: ${error.code}`);
      console.log(`   Correlation ID: ${error.correlationId}`);
      console.log(`   Details:`, JSON.stringify(error.details, null, 2));
      console.log('\nWorkflow output would show:');
      console.log(`❌ mcasperson/mcasperson_SecondBrain – ${error.code}: ${error.message} (correlationId=${error.correlationId})`);
    }
  }

  // Test 2: Persistence error with detailed context
  console.log('\n\nTest 2: Persistence Error (Database Constraint)');
  console.log('------------------------------------------------');
  
  const mockFetch2 = function() {
    return Promise.resolve({
      ok: false,
      status: 500,
      json: async () => ({
        errorCode: 'PERSISTENCE_FAILED',
        message: 'Failed to persist action record.',
        details: {
          message: 'Entity too large',
          statusCode: 413,
          code: 'EntityTooLarge',
          errorDetails: {
            maxSize: 1048576,
            actualSize: 2000000
          }
        },
        correlationId: 'xyz789abc012'
      })
    });
  };
  global.fetch = mockFetch2;

  try {
    await client.upsertAction({
      owner: 'mcasperson',
      name: 'mcasperson_SecondBrain',
      description: 'Very large action'
    });
  } catch (error) {
    if (error instanceof MarketplaceApiError) {
      console.log(`❌ Error: ${error.message}`);
      console.log(`   Code: ${error.code}`);
      console.log(`   Correlation ID: ${error.correlationId}`);
      console.log(`   Details:`, JSON.stringify(error.details, null, 2));
      console.log('\nWorkflow output would show:');
      console.log(`❌ mcasperson/mcasperson_SecondBrain – ${error.code}: ${error.message} (correlationId=${error.correlationId})`);
      console.log(`   Underlying error: ${error.details.message} (${error.details.code})`);
    }
  }

  // Test 3: Successful operation
  console.log('\n\nTest 3: Successful Upsert');
  console.log('------------------------------------------------');
  
  const mockFetch3 = function() {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        updated: true,
        created: true,
        owner: 'actions',
        name: 'checkout',
        lastSyncedUtc: '2026-01-05T12:34:56Z'
      })
    });
  };
  global.fetch = mockFetch3;

  try {
    const result = await client.upsertAction({
      owner: 'actions',
      name: 'checkout',
      description: 'Checkout code'
    });
    console.log(`✅ Success: ${result.owner}/${result.name}`);
    console.log(`   Created: ${result.created}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Last synced: ${result.lastSyncedUtc}`);
    console.log('\nWorkflow output would show:');
    console.log(`✅ actions/checkout – ${result.created ? 'created' : 'updated'}`);
  } catch (error) {
    console.log('Unexpected error:', error.message);
  }

  console.log('\n\n=== Summary ===');
  console.log('The enhanced error handling provides:');
  console.log('1. Structured error codes (VALIDATION_FAILED, PERSISTENCE_FAILED)');
  console.log('2. Correlation IDs for tracing errors across systems');
  console.log('3. Detailed error context (field names, constraint violations, etc.)');
  console.log('4. Appropriate HTTP status codes (400 for validation, 500 for server errors)');
  console.log('5. Clear, actionable error messages for workflow consumers');
}

// Only run if executed directly
if (require.main === module) {
  demonstrateEnhancedErrors().catch(error => {
    console.error('Error:', error);
    throw error;
  });
}

module.exports = { demonstrateEnhancedErrors };
