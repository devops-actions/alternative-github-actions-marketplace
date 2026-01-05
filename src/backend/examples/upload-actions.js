#!/usr/bin/env node

/**
 * Example script demonstrating how to use the Actions Marketplace Client
 * to upload action metadata to the API.
 */

const { ActionsMarketplaceClient } = require('../client/index');
const { DefaultAzureCredential } = require('@azure/identity');

async function main() {
  // Example 1: Using HTTP API mode (recommended for most users)
  console.log('Example 1: HTTP API Mode\n');
  
  const httpClient = new ActionsMarketplaceClient({
    apiUrl: process.env.API_URL || 'https://your-api-endpoint.azurewebsites.net'
  });

  try {
    const result = await httpClient.upsertAction({
      owner: 'actions',
      name: 'checkout',
      description: 'Checkout code from a repository',
      version: 'v4.0.0',
      icon: 'download',
      color: 'blue',
      // Add any additional metadata fields...
    });

    console.log('Upload result:', result);
  } catch (error) {
    console.error('Failed to upload action:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.correlationId) {
      console.error('Correlation ID:', error.correlationId);
    }
    if (error.details) {
      console.error('Error details:', JSON.stringify(error.details, null, 2));
    }
  }

  // Example 1b: Using HTTP API mode with Function Key authentication
  console.log('\n\nExample 1b: HTTP API Mode with Function Key\n');
  
  const httpClientWithKey = new ActionsMarketplaceClient({
    apiUrl: process.env.API_URL || 'https://your-api-endpoint.azurewebsites.net',
    functionKey: process.env.FUNCTION_KEY || 'your-function-key-here'
  });

  try {
    const result = await httpClientWithKey.upsertAction({
      owner: 'actions',
      name: 'setup-python',
      description: 'Setup Python environment',
      version: 'v5.0.0',
      icon: 'package',
      color: 'yellow',
    });

    console.log('Upload result:', result);
  } catch (error) {
    console.error('Failed to upload action:', error.message);
  }

  // Example 2: Using Direct Table Storage mode
  console.log('\n\nExample 2: Direct Table Storage Mode\n');
  
  const tableClient = new ActionsMarketplaceClient({
    tableEndpoint: process.env.AZURE_TABLE_ENDPOINT || 'https://your-account.table.core.windows.net',
    tableName: process.env.AZURE_TABLE_NAME || 'actions',
    credential: new DefaultAzureCredential()
  });

  try {
    const result = await tableClient.upsertAction({
      owner: 'actions',
      name: 'setup-node',
      description: 'Setup Node.js environment',
      version: 'v4.0.0',
      icon: 'versions',
      color: 'green',
    });

    console.log('Upload result:', result);
  } catch (error) {
    console.error('Failed to upload action:', error.message);
  }

  // Example 3: Batch upload
  console.log('\n\nExample 3: Batch Upload\n');

  const actions = [
    {
      owner: 'actions',
      name: 'upload-artifact',
      description: 'Upload artifacts',
      version: 'v4.0.0'
    },
    {
      owner: 'actions',
      name: 'download-artifact',
      description: 'Download artifacts',
      version: 'v4.0.0'
    }
  ];

  try {
    const results = await httpClient.batchUpsertActions(actions);
    
    console.log('Batch upload results:');
    results.forEach(result => {
      if (result.success) {
        console.log(`  ✓ ${result.action} - ${result.result.created ? 'created' : 'updated'}`);
      } else {
        console.log(`  ✗ ${result.action} - ${result.error}`);
      }
    });
  } catch (error) {
    console.error('Failed to batch upload:', error.message);
  }
}

// Only run if executed directly (not when required as a module)
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { main };
