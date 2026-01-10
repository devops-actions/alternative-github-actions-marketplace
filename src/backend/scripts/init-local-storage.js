#!/usr/bin/env node

/**
 * Initialize local Azurite storage for development
 * Creates the actions table if it doesn't exist
 */

const { TableClient } = require('@azure/data-tables');

const connectionString = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';
const tableName = 'actions';

async function initStorage() {
  try {
    console.log('Initializing local storage...');
    const tableClient = TableClient.fromConnectionString(connectionString, tableName, {
      allowInsecureConnection: true
    });
    
    await tableClient.createTable();
    console.log(`✓ Table '${tableName}' created successfully`);
  } catch (error) {
    if (error.statusCode === 409) {
      console.log(`✓ Table '${tableName}' already exists`);
    } else {
      console.error('✗ Failed to create table:', error.message);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  initStorage();
}

module.exports = { initStorage };
