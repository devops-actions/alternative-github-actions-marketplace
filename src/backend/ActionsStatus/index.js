const { getTableClient } = require('../lib/tableStorage');
const { withCorsHeaders } = require('../lib/cors');
const { readCache, writeCache } = require('../lib/statsCache');
const { cacheControlHeaders } = require('../lib/cacheHeaders');

const CACHE_MAX_AGE_SECONDS = 300; // 5 minutes

/**
 * Returns data-freshness metrics for the actions database.
 *
 * The key field is LastSyncedUtc, which is set by ActionsUpsert whenever a
 * record's payload *changes*. It is NOT updated when the pipeline runs but
 * finds the same data — so this reflects "last time data changed", not
 * "last time the pipeline checked this action". That distinction is surfaced
 * clearly in the response via the `interpretation` field.
 */

async function computeStatus(tableClient) {
  const now = new Date();
  let totalCount = 0;
  let newestSyncedUtc = null;
  let oldestSyncedUtc = null;

  const buckets = {
    within1day: 0,
    within7days: 0,
    within30days: 0,
    olderThan30days: 0,
    noTimestamp: 0
  };

  for await (const entity of tableClient.listEntities()) {
    totalCount += 1;

    const raw = entity.LastSyncedUtc;
    if (!raw) {
      buckets.noTimestamp += 1;
      continue;
    }

    const syncedAt = new Date(raw);
    if (isNaN(syncedAt.getTime())) {
      buckets.noTimestamp += 1;
      continue;
    }

    if (!newestSyncedUtc || syncedAt > newestSyncedUtc) newestSyncedUtc = syncedAt;
    if (!oldestSyncedUtc || syncedAt < oldestSyncedUtc) oldestSyncedUtc = syncedAt;

    const ageMs = now - syncedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= 1) {
      buckets.within1day += 1;
    } else if (ageDays <= 7) {
      buckets.within7days += 1;
    } else if (ageDays <= 30) {
      buckets.within30days += 1;
    } else {
      buckets.olderThan30days += 1;
    }
  }

  return {
    totalCount,
    newestSyncedUtc: newestSyncedUtc ? newestSyncedUtc.toISOString() : null,
    oldestSyncedUtc: oldestSyncedUtc ? oldestSyncedUtc.toISOString() : null,
    ageDistribution: buckets
  };
}

module.exports = async function actionsStatus(context, req) {
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
  const forceRefresh = req.query && req.query.refresh === 'true';

  try {
    let statusData;
    let fromCache = false;

    if (!forceRefresh) {
      const cached = await readCache(tableClient);
      if (cached && cached.data && cached.data.status) {
        statusData = cached.data.status;
        fromCache = true;
      }
    }

    if (!statusData) {
      statusData = await computeStatus(tableClient);
      // Write merged cache (preserve existing stats data if present)
      const existing = await readCache(tableClient).catch(() => null);
      const existingData = existing && existing.data ? existing.data : {};
      await writeCache(tableClient, { ...existingData, status: statusData });
    }

    const { totalCount, newestSyncedUtc, oldestSyncedUtc, ageDistribution } = statusData;
    context.log(`ActionsStatus: total=${totalCount}, newest=${newestSyncedUtc}, oldest=${oldestSyncedUtc}, fromCache=${fromCache}`);

    const payload = {
      totalCount,
      newestSyncedUtc,
      oldestSyncedUtc,
      ageDistribution,
      generatedAt: new Date().toISOString(),
      interpretation: 'lastSyncedUtc is set when an action\'s data changes in the database. It is not updated on every pipeline run — actions whose data has not changed since the last upload will have an older timestamp.'
    };

    context.res = {
      status: 200,
      isRaw: true,
      headers: withCorsHeaders(req, {
        'Content-Type': 'application/json',
        ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
      }),
      body: JSON.stringify(payload)
    };
  } catch (error) {
    context.log.error('Error computing status:', error);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to compute status.' }
    };
  }
};
