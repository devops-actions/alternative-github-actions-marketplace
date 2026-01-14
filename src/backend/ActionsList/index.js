const { getTableClient } = require('../lib/tableStorage');
const { ActionRecord } = require('../lib/actionRecord');
const { withCorsHeaders } = require('../lib/cors');

module.exports = async function actionsList(context, req) {
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

  const owner = (req && req.query && req.query.owner)
    ? String(req.query.owner)
    : (context.bindingData && context.bindingData.owner);
  
  // Parse limit parameter for pagination
  let limit = null;
  if (req.query && req.query.limit) {
    const parsed = parseInt(req.query.limit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = parsed;
    }
  }
  
  const tableClient = getTableClient();
  const tableUrl = tableClient && tableClient.url ? tableClient.url.split('?')[0] : 'unknown';
  let entities = [];

  // For now, only support in-memory/fake client for integration tests
  if (typeof tableClient.store === 'object' && tableClient.store instanceof Map) {
    // Simulate Table Storage query by owner
    entities = Array.from(tableClient.store.values()).filter(e => {
      const entityOwner = e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner);
      return owner ? entityOwner === owner : true;
    });
    
    // Apply limit if specified
    const totalCount = entities.length;
    if (limit !== null && limit < entities.length) {
      entities = entities.slice(0, limit);
    }
    
    const results = entities.map(e => {
      try {
        return ActionRecord.fromEntity(e).toActionInfo(true, {
          etag: e.etag,
          lastSyncedUtc: e.LastSyncedUtc,
          partitionKey: e.partitionKey || e.PartitionKey,
          rowKey: e.rowKey || e.RowKey
        });
      } catch {
        return null;
      }
    }).filter(Boolean);

    context.log(`ActionsList: returning ${results.length} of ${totalCount} entities (fake client), table ${tableUrl}`);

    context.res = {
      status: 200,
      headers: {
        'X-Actions-Count': results.length,
        'X-Table-Endpoint': tableUrl,
        'Content-Type': 'application/json'
      },
      body: results
    };
    context.res.headers = withCorsHeaders(req, context.res.headers);
    return;
  }

  // Real Table Storage query for production
  try {
    let queryOptions = {};
    
    if (owner) {
      // Sanitize owner to prevent OData injection - escape single quotes first, then normalize case
      const sanitizedOwner = String(owner).replace(/'/g, "''").toLowerCase();
      queryOptions = { queryOptions: { filter: `PartitionKey eq '${sanitizedOwner}'` } };
    }
    
    for await (const entity of tableClient.listEntities(queryOptions)) {
      entities.push(entity);
      // Apply limit during iteration for better performance
      if (limit !== null && entities.length >= limit) {
        break;
      }
    }

    const results = entities.map(e => {
      try {
        return ActionRecord.fromEntity(e).toActionInfo(true, {
          etag: e.etag,
          lastSyncedUtc: e.LastSyncedUtc,
          partitionKey: e.partitionKey,
          rowKey: e.rowKey
        });
      } catch {
        return null;
      }
    }).filter(Boolean);

    context.log(`ActionsList: returning ${results.length} entities${limit !== null ? ` (limited to ${limit})` : ''}, table ${tableUrl}`);

    context.res = {
      status: 200,
      headers: {
        'X-Actions-Count': results.length,
        'X-Table-Endpoint': tableUrl,
        'Content-Type': 'application/json'
      },
      body: results
    };
    context.res.headers = withCorsHeaders(req, context.res.headers);
  } catch (error) {
    context.log.error('Error querying actions table:', error);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to query actions from table storage.' }
    };
  }
};
