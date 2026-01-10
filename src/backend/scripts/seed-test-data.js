#!/usr/bin/env node

/**
 * Seed local Azurite storage with test data for development
 */

const { ActionsMarketplaceClient } = require('../client/index');
const sampleActions = require('../tests/data/sampleActions.json');

const connectionString = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

async function seedTestData() {
  try {
    console.log('Seeding test data...');
    
    const client = new ActionsMarketplaceClient({
      connectionString,
      tableName: 'actions',
      allowInsecureConnection: true
    });

    let successCount = 0;
    let errorCount = 0;

    for (const action of sampleActions) {
      try {
        await client.upsertAction(action);
        successCount++;
        console.log(`  ✓ ${action.owner}/${action.name}`);
      } catch (error) {
        errorCount++;
        console.error(`  ✗ ${action.owner}/${action.name}: ${error.message}`);
      }
    }

    console.log(`\nSeeding complete: ${successCount} succeeded, ${errorCount} failed`);
  } catch (error) {
    console.error('✗ Failed to seed test data:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedTestData();
}

module.exports = { seedTestData };
