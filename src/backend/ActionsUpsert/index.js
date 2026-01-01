const { TableClient } = require('@azure/data-tables');
const { DefaultAzureCredential } = require('@azure/identity');
const { ActionRecord } = require('../lib/actionRecord');

const defaultTableName = process.env.ACTIONS_TABLE_NAME || 'actions';
const storageConnection = process.env.ACTIONS_TABLE_CONNECTION || process.env.AzureWebJobsStorage;
const tableEndpoint = process.env.ACTIONS_TABLE_URL || process.env.ACTIONS_TABLE_ENDPOINT;

function createTableClient() {
  if (storageConnection) {
    return TableClient.fromConnectionString(storageConnection, defaultTableName);
  }

  if (!tableEndpoint) {
    throw new Error('Missing table endpoint. Configure ACTIONS_TABLE_URL or provide a connection string.');
  }

  // Use managed identity when no connection string is supplied.
  const credential = new DefaultAzureCredential();
  return new TableClient(tableEndpoint, defaultTableName, credential);
}

const tableClient = createTableClient();

async function fetchExisting(partitionKey, rowKey) {
  try {
    return await tableClient.getEntity(partitionKey, rowKey);
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function persistActionRecord(actionRecord, existing) {
  const entity = actionRecord.toEntity();

  if (!existing) {
    try {
      await tableClient.createEntity(entity);
      return { updated: true, created: true, lastSyncedUtc: entity.LastSyncedUtc };
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error;
      }
      const latest = await tableClient.getEntity(entity.partitionKey, entity.rowKey);
      return persistActionRecord(actionRecord, latest);
    }
  }

  try {
    await tableClient.updateEntity(entity, 'Replace', { etag: existing.etag });
    return { updated: true, created: false, lastSyncedUtc: entity.LastSyncedUtc };
  } catch (error) {
    if (error.statusCode !== 412) {
      throw error;
    }
    const latest = await tableClient.getEntity(entity.partitionKey, entity.rowKey);
    if (actionRecord.matchesExisting(latest)) {
      return { updated: false, created: false, lastSyncedUtc: latest.LastSyncedUtc };
    }
    return persistActionRecord(actionRecord, latest);
  }
}

module.exports = async function actionsUpsert(context, req) {
  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      headers: { 'Allow': 'POST' },
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  let record;
  try {
    record = ActionRecord.fromRequest(req.body);
  } catch (error) {
    context.log.warn('Failed to parse request body: %s', error.message);
    context.res = {
      status: 400,
      body: { error: error.message }
    };
    return;
  }

  try {
    const existing = await fetchExisting(record.partitionKey, record.rowKey);

    if (record.matchesExisting(existing)) {
      context.res = {
        status: 200,
        body: {
          updated: false,
          owner: record.owner,
          name: record.name,
          lastSyncedUtc: existing.LastSyncedUtc
        }
      };
      return;
    }

    const result = await persistActionRecord(record, existing);

    context.res = {
      status: result.created ? 201 : 200,
      body: {
        updated: result.updated,
        created: !!result.created,
        owner: record.owner,
        name: record.name,
        lastSyncedUtc: result.lastSyncedUtc
      }
    };
  } catch (error) {
    context.log.error('Failed to upsert record: %s', error.message);
    context.res = {
      status: 500,
      body: {
        error: 'Failed to persist action record.'
      }
    };
  }
};
