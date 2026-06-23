const STATS_CACHE_PARTITION = 'statsCache';
const STATS_CACHE_ROW = 'aggregate';

async function readCache(tableClient) {
  try {
    const entity = await tableClient.getEntity(STATS_CACHE_PARTITION, STATS_CACHE_ROW);
    if (!entity || !entity.CacheJson) return null;
    return { data: JSON.parse(entity.CacheJson), etag: entity.etag };
  } catch (err) {
    if (err && err.statusCode === 404) return null;
    throw err;
  }
}

async function writeCache(tableClient, data) {
  const cacheJson = JSON.stringify({ ...data, cachedAt: new Date().toISOString() });
  const entity = {
    partitionKey: STATS_CACHE_PARTITION,
    rowKey: STATS_CACHE_ROW,
    CacheJson: cacheJson
  };
  try {
    await tableClient.upsertEntity(entity, 'Replace');
  } catch (_err) {
    // best-effort; cache write failure does not affect the response
  }
}

// Atomically patch the cache using optimistic concurrency.
// patchFn receives the current cache data and returns updated data (or null to skip).
async function patchCache(tableClient, patchFn) {
  try {
    let entity;
    try {
      entity = await tableClient.getEntity(STATS_CACHE_PARTITION, STATS_CACHE_ROW);
    } catch (err) {
      if (err && err.statusCode === 404) return; // no cache to patch
      throw err;
    }

    if (!entity || !entity.CacheJson) return;

    const current = JSON.parse(entity.CacheJson);
    const updated = patchFn(current);
    if (!updated) return;

    const updatedEntity = {
      partitionKey: STATS_CACHE_PARTITION,
      rowKey: STATS_CACHE_ROW,
      CacheJson: JSON.stringify(updated)
    };

    await tableClient.updateEntity(updatedEntity, 'Replace', { etag: entity.etag });
  } catch (err) {
    if (err && err.statusCode === 412) return; // ETag conflict - cache will drift, OK
    // Swallow other errors; patch is best-effort and must not break the main flow
  }
}

module.exports = { readCache, writeCache, patchCache };
