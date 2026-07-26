const { getTableClient } = require('../lib/tableStorage');
const { withCorsHeaders } = require('../lib/cors');
const { refreshSnapshot } = require('../lib/buildSnapshot');
const { readCache, writeCache } = require('../lib/statsCache');

// Rebuilds the actions snapshot on demand. Called by the upload pipeline
// (actions-marketplace-checks / api-upsert.yml) once it has finished pushing a
// batch of updates, so the marketplace serves fresh data within a minute of
// the pipeline completing rather than waiting for the next timer tick.
//
// Function-key protected: this is a write path and a full table scan, so it
// must not be triggerable by anonymous callers.
module.exports = async function snapshotRefresh(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { Allow: 'POST,OPTIONS' })
    };
    return;
  }

  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { Allow: 'POST,OPTIONS' }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const tableClient = getTableClient();

  try {
    const result = await refreshSnapshot(tableClient);

    // The snapshot build already aggregated the stats from the same scan, so
    // persist them here rather than paying for a second full pass (which would
    // roughly double this function's runtime against its 5 minute timeout) or
    // leaving StatsWarmup to rescan hours later. Deriving both from one pass is
    // also what guarantees the tile counts and the grid agree.
    let statsWritten = false;
    try {
      const existing = await readCache(tableClient).catch(() => null);
      const existingData = existing && existing.data ? existing.data : {};
      await writeCache(tableClient, { ...existingData, stats: result.stats });
      statsWritten = true;
    } catch (statsError) {
      context.log.warn('SnapshotRefresh: snapshot written but stats cache update failed:', statsError.message);
    }

    context.log(
      `SnapshotRefresh: wrote ${result.count} actions (${result.bytes} bytes, ${result.skipped} skipped) in ${result.durationMs}ms`
    );

    context.res = {
      status: 200,
      headers: withCorsHeaders(req),
      body: {
        count: result.count,
        skipped: result.skipped,
        bytes: result.bytes,
        generatedAt: result.generatedAt,
        durationMs: result.durationMs,
        statsRefreshed: statsWritten,
        statsTotal: statsWritten ? result.stats.total : null
      }
    };
  } catch (error) {
    context.log.error('SnapshotRefresh: failed to rebuild snapshot:', error);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to rebuild the actions snapshot.' }
    };
  }
};
