const { getTableClient } = require('../lib/tableStorage');
const { readCache, writeCache } = require('../lib/statsCache');
const { computeStats } = require('../lib/computeStats');

// Runs on a schedule (see function.json) to keep the stats cache warm.
//
// Without this, /actions/stats falls back to a full O(n) table scan whenever
// the cache is missing (e.g. the very first request after the table is
// created). That scan is expensive over the ~30k entity dataset and made the
// About page (and anything else calling fetchStats) feel like it hung. The
// upsert pipeline already keeps the cache incrementally patched per-write,
// but this timer provides a periodic full recompute as a safety net so the
// cache never drifts and never needs to be (re)built inside a user request.
// A ~8 hour cadence is comfortably tighter than the ~24h staleness the UI tolerates.
module.exports = async function statsWarmup(context) {
  const tableClient = getTableClient();

  try {
    const stats = await computeStats(tableClient);
    const existing = await readCache(tableClient).catch(() => null);
    const existingData = existing && existing.data ? existing.data : {};

    await writeCache(tableClient, { ...existingData, stats });

    context.log(`StatsWarmup: refreshed stats cache (total=${stats.total}, archived=${stats.archived})`);
  } catch (error) {
    context.log.error('StatsWarmup: failed to refresh stats cache:', error);
  }
};
