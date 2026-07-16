const { getTableClient } = require('../lib/tableStorage');
const { withCorsHeaders } = require('../lib/cors');
const { readCache, writeCache } = require('../lib/statsCache');
const { cacheControlHeaders } = require('../lib/cacheHeaders');

const CACHE_MAX_AGE_SECONDS = 300; // 5 minutes

async function computeStats(tableClient) {
  let total = 0;
  const byType = {};
  let verified = 0;
  let archived = 0;
  let withOssf = 0;

  for await (const entity of tableClient.listEntities()) {
    try {
      const payload = typeof entity.PayloadJson === 'string'
        ? JSON.parse(entity.PayloadJson)
        : (entity.PayloadJson || {});

      // Only count entities that we can successfully parse and inspect.
      total += 1;

      const type = payload.actionType && payload.actionType.actionType;
      if (type) {
        byType[type] = (byType[type] || 0) + 1;
      }

      if (payload.verified === true) {
        verified += 1;
      }

      if (payload.repoInfo && payload.repoInfo.archived === true) {
        archived += 1;
      }

      const rawScore = payload.openssf_score ?? payload.ossfScore ?? payload.ossf_score ?? null;
      const hasOssf = payload.ossf === true || (rawScore !== null && rawScore !== undefined);
      if (hasOssf) {
        withOssf += 1;
      }
    } catch (_parseErr) {
      // skip malformed payloads entirely (don't include in totals)
    }
  }

  return { total, byType, verified, archived, withOssf };
}

module.exports = async function actionsStats(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { Allow: 'GET,OPTIONS' })
    };
    return;
  }

  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { Allow: 'GET,OPTIONS' }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const tableClient = getTableClient();
  const tableUrl = tableClient && tableClient.url ? tableClient.url.split('?')[0] : 'unknown';
  const forceRefresh = req.query && req.query.refresh === 'true';

  try {
    let stats;
    let fromCache = false;

    if (!forceRefresh) {
      const cached = await readCache(tableClient);
      if (cached && cached.data && cached.data.stats) {
        stats = cached.data.stats;
        fromCache = true;
      }
    }

    if (!stats) {
      stats = await computeStats(tableClient);
      // Write merged cache (preserve existing status data if present)
      const existing = await readCache(tableClient).catch(() => null);
      const existingData = existing && existing.data ? existing.data : {};
      await writeCache(tableClient, { ...existingData, stats });
    }

    const { total, byType, verified, archived, withOssf } = stats;
    context.log(`ActionsStats: total=${total}, verified=${verified}, archived=${archived}, withOssf=${withOssf}, table=${tableUrl}, fromCache=${fromCache}`);

    const payload = { total, byType, verified, archived, withOssf };

    context.res = {
      status: 200,
      isRaw: true,
      headers: withCorsHeaders(req, {
        'X-Actions-Count': total,
        'X-Verified-Count': verified,
        'X-Archived-Count': archived,
        'X-Ossf-Count': withOssf,
        'X-Table-Endpoint': tableUrl,
        'Content-Type': 'application/json',
        ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
      }),
      body: JSON.stringify(payload)
    };
  } catch (error) {
    context.log.error('Error computing stats:', error);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to compute stats.' }
    };
  }
};
