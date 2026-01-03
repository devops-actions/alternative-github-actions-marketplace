const { ActionRecord } = require('../lib/actionRecord');
const { getTableClient, getActionEntity } = require('../lib/tableStorage');

async function fetchExisting(tableClient, partitionKey, rowKey) {
  return getActionEntity(partitionKey, rowKey, { tableClient });
}

async function persistActionRecord(tableClient, actionRecord, existing) {
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
      return persistActionRecord(tableClient, actionRecord, latest);
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
    return persistActionRecord(tableClient, actionRecord, latest);
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
    const tableClient = getTableClient();
    const existing = await fetchExisting(tableClient, record.partitionKey, record.rowKey);

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

    const result = await persistActionRecord(tableClient, record, existing);

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
