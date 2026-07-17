const { getTableClient } = require('../lib/tableStorage');
const { ActionRecord } = require('../lib/actionRecord');
const { withCorsHeaders } = require('../lib/cors');
const { cacheControlHeaders } = require('../lib/cacheHeaders');
const { normalizePartitionKey } = require('../lib/keyUtils');
const { readCache } = require('../lib/statsCache');

const CACHE_MAX_AGE_SECONDS = 300; // 5 minutes

// Encodes an opaque continuation value (string, number, or object) into a
// URL-safe cursor for clients to pass back on the next request.
function encodeCursor(continuationToken) {
  if (continuationToken === undefined || continuationToken === null || continuationToken === '') {
    return null;
  }
  return Buffer.from(JSON.stringify(continuationToken)).toString('base64');
}

// Decodes a cursor produced by encodeCursor. Throws if the cursor is malformed
// so callers can respond with a 400 instead of silently ignoring it.
function decodeCursor(cursor) {
  const json = Buffer.from(String(cursor), 'base64').toString('utf8');
  return JSON.parse(json);
}

function entityToActionInfo(e) {
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
}

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

  // Parse limit parameter. When provided, it also acts as the page size for
  // cursor-based pagination (see `cursor` below) and the response is wrapped
  // as `{ items, nextCursor }`. When omitted, the full result set is returned
  // as a plain array, preserving the historic behaviour relied on by callers
  // that need the complete dataset in one shot (e.g. the frontend's
  // background full fetch, or the E2E test harness).
  let limit = null;
  if (req.query && req.query.limit) {
    const parsed = parseInt(req.query.limit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = parsed;
    }
  }

  // Parse the opaque pagination cursor (only meaningful together with `limit`).
  let continuationToken;
  if (limit !== null && req.query && req.query.cursor) {
    try {
      continuationToken = decodeCursor(req.query.cursor);
    } catch {
      context.res = {
        status: 400,
        headers: withCorsHeaders(req),
        body: { error: 'Invalid cursor parameter.' }
      };
      return;
    }
  }

  const tableClient = getTableClient();
  const tableUrl = tableClient && tableClient.url ? tableClient.url.split('?')[0] : 'unknown';

  // For now, only support in-memory/fake client for integration tests
  if (typeof tableClient.store === 'object' && tableClient.store instanceof Map) {
    // Simulate Table Storage query by owner
    const filteredEntities = Array.from(tableClient.store.values()).filter(e => {
      const entityOwner = e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner);
      return owner ? entityOwner === owner : true;
    });

    const totalCount = filteredEntities.length;
    const baseHeaders = {
      'X-Total-Count': totalCount,
      'X-Table-Endpoint': tableUrl,
      'Content-Type': 'application/json',
      ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
    };

    if (limit !== null) {
      let startIndex = 0;
      if (continuationToken !== undefined) {
        const parsedIndex = Number(continuationToken);
        startIndex = Number.isFinite(parsedIndex) && parsedIndex > 0 ? parsedIndex : 0;
      }

      const pageEntities = filteredEntities.slice(startIndex, startIndex + limit);
      const nextIndex = startIndex + pageEntities.length;
      const nextCursor = nextIndex < filteredEntities.length ? encodeCursor(nextIndex) : null;
      const results = pageEntities.map(entityToActionInfo).filter(Boolean);

      context.log(`ActionsList: returning page of ${results.length} of ${totalCount} entities (fake client), table ${tableUrl}`);

      context.res = {
        status: 200,
        headers: { ...baseHeaders, 'X-Actions-Count': results.length },
        body: { items: results, nextCursor }
      };
      context.res.headers = withCorsHeaders(req, context.res.headers);
      return;
    }

    const results = filteredEntities.map(entityToActionInfo).filter(Boolean);

    context.log(`ActionsList: returning ${results.length} of ${totalCount} entities (fake client), table ${tableUrl}`);

    context.res = {
      status: 200,
      headers: { ...baseHeaders, 'X-Actions-Count': results.length },
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
      const sanitizedOwner = normalizePartitionKey(String(owner).replace(/'/g, "''"));
      queryOptions = { queryOptions: { filter: `PartitionKey eq '${sanitizedOwner}'` } };
    }

    // Best-effort total count from the cached stats aggregate (see ActionsStats).
    // Only valid for the unfiltered dataset, and never worth failing the request over.
    let totalCount = null;
    if (!owner) {
      try {
        const cached = await readCache(tableClient);
        const cachedTotal = cached && cached.data && cached.data.stats && cached.data.stats.total;
        if (typeof cachedTotal === 'number') {
          totalCount = cachedTotal;
        }
      } catch {
        // ignore - the total count header is a nice-to-have
      }
    }

    if (limit !== null) {
      // Cursor-based pagination: fetch a single page of `limit` entities using
      // Azure Table Storage's continuation token, instead of scanning the
      // whole table and slicing in memory.
      const pageSettings = { maxPageSize: limit };
      if (continuationToken !== undefined) {
        pageSettings.continuationToken = continuationToken;
      }

      const pageIterator = tableClient.listEntities(queryOptions).byPage(pageSettings);
      const { value: page } = await pageIterator.next();
      const pageEntities = page || [];
      const results = pageEntities.map(entityToActionInfo).filter(Boolean);
      const nextCursor = encodeCursor(page && page.continuationToken);

      const headers = {
        'X-Actions-Count': results.length,
        'X-Table-Endpoint': tableUrl,
        'Content-Type': 'application/json',
        ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
      };
      if (totalCount !== null) {
        headers['X-Total-Count'] = totalCount;
      }

      context.log(`ActionsList: returning page of ${results.length} entities (limit ${limit}), table ${tableUrl}`);

      context.res = {
        status: 200,
        headers,
        body: { items: results, nextCursor }
      };
      context.res.headers = withCorsHeaders(req, context.res.headers);
      return;
    }

    // No limit specified: preserve the historic "return everything" behaviour.
    const entities = [];
    for await (const entity of tableClient.listEntities(queryOptions)) {
      entities.push(entity);
    }

    const results = entities.map(entityToActionInfo).filter(Boolean);

    const headers = {
      'X-Actions-Count': results.length,
      'X-Table-Endpoint': tableUrl,
      'Content-Type': 'application/json',
      ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
    };
    if (totalCount !== null) {
      headers['X-Total-Count'] = totalCount;
    }

    context.log(`ActionsList: returning ${results.length} entities, table ${tableUrl}`);

    context.res = {
      status: 200,
      headers,
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
