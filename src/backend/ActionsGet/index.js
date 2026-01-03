const { ActionRecord } = require('../lib/actionRecord');
const { getActionEntity } = require('../lib/tableStorage');

function normalizeLastSynced(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.endsWith('.000Z') ? value.replace('.000Z', 'Z') : value;
}

module.exports = async function actionsGet(context, req) {
  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: { 'Allow': 'GET' },
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const owner = context.bindingData && context.bindingData.owner;
  const name = context.bindingData && context.bindingData.name;

  if (!owner || !name) {
    context.res = {
      status: 400,
      body: { error: 'Owner and name route parameters are required.' }
    };
    return;
  }

  const partitionKey = ActionRecord.normalizeKey(owner);
  const rowKey = ActionRecord.normalizeKey(name);

  try {
    const entity = await getActionEntity(partitionKey, rowKey);

    if (!entity) {
      context.res = {
        status: 404,
        body: { error: 'Action not found.' }
      };
      return;
    }

    let record;
    try {
      record = ActionRecord.fromEntity(entity);
    } catch (error) {
      context.log.error('Failed to deserialize stored entity: %s', error.message);
      context.res = {
        status: 500,
        body: { error: 'Stored action payload is invalid.' }
      };
      return;
    }

    const metadata = {};
    if (entity.LastSyncedUtc) {
      metadata.lastSyncedUtc = normalizeLastSynced(entity.LastSyncedUtc);
    }
    if (entity.timestamp || entity.Timestamp) {
      metadata.timestamp = entity.timestamp || entity.Timestamp;
    }
    if (entity.etag) {
      metadata.etag = entity.etag;
    }

    context.res = {
      status: 200,
      body: record.toActionInfo(true, metadata)
    };
  } catch (error) {
    context.log.error('Failed to retrieve action: %s', error.message);
    context.res = {
      status: 500,
      body: { error: 'Failed to retrieve action.' }
    };
  }
};
