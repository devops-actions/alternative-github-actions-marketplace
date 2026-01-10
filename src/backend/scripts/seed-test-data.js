#!/usr/bin/env node

/**
 * Seed local Azurite storage with test data for development
 */

const { ActionsMarketplaceClient } = require('../client/index');
const sampleActions = require('../tests/data/sampleActions.json');

const connectionString = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

function buildExpandedActions() {
  const extras = Array.from({ length: 30 }, (_, i) => {
    const base = sampleActions[i % sampleActions.length];
    const day = (i % 28) + 1;
    const updatedAt = new Date(Date.UTC(2025, 0, day, 12, 0, 0)).toISOString();

    return {
      ...base,
      owner: `${base.owner}-gen${i + 1}`,
      name: `${base.name}-gen${i + 1}`,
      repoInfo: {
        ...(base.repoInfo || {}),
        updated_at: updatedAt
      },
      dependents: {
        ...(base.dependents || {}),
        dependentsLastUpdated: updatedAt,
        dependents: String((i + 1) * 3)
      },
      ossfScore: base.ossfScore ? base.ossfScore + (i % 5) * 0.1 : (i % 10) * 0.5 + 1
    };
  });

  return [...sampleActions, ...extras];
}

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

    const actions = buildExpandedActions();
    console.log(`Seeding ${actions.length} actions...`);

    for (const action of actions) {
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
