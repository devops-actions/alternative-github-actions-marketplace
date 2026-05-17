const { ActionRecord } = require('../lib/actionRecord');
const { getActionEntity } = require('../lib/tableStorage');
const { withCorsHeaders } = require('../lib/cors');

function normalizeLastSynced(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.endsWith('.000Z') ? value.replace('.000Z', 'Z') : value;
}

module.exports = async function actionsGet(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { 'Allow': 'GET,OPTIONS' })
    };
    return;
  }

  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { 'Allow': 'GET,OPTIONS' }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const owner = context.bindingData && context.bindingData.owner;
  const name = context.bindingData && context.bindingData.name;

  if (!owner || !name) {
    context.res = {
      status: 400,
      headers: withCorsHeaders(req),
      body: { error: 'Owner and name route parameters are required.' }
    };
    return;
  }

  const partitionKey = ActionRecord.normalizeKey(owner);
  const rowKey = ActionRecord.normalizeKey(name);
  // Some records were ingested with rowKey = "{owner}_{name}"; fall back to that format.
  const rowKeyFallback = `${partitionKey}_${rowKey}`;

  try {
    let entity = await getActionEntity(partitionKey, rowKey);
    if (!entity) {
      entity = await getActionEntity(partitionKey, rowKeyFallback);
    }

    if (!entity) {
      context.res = {
        status: 404,
        headers: withCorsHeaders(req),
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
        headers: withCorsHeaders(req),
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

    let body = record.toActionInfo(true, metadata);
    // Records ingested with the legacy format store name as "{owner}_{name}".
    // Strip the owner prefix so callers always receive the bare action name.
    const ownerPrefix = `${partitionKey}_`;
    if (typeof body.name === 'string' && body.name.startsWith(ownerPrefix)) {
      body = { ...body, name: body.name.slice(ownerPrefix.length) };
    }

    context.res = {
      status: 200,
      headers: withCorsHeaders(req),
      body
    };
  } catch (error) {
    context.log.error('Failed to retrieve action: %s', error.message);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to retrieve action.' }
    };
  }
};
