const { getTableClient } = require('../lib/tableStorage');
const { refreshSnapshot } = require('../lib/buildSnapshot');

// Safety net for the actions snapshot, mirroring StatsWarmup.
//
// The upload pipeline calls SnapshotRefresh directly when it finishes, which
// is the path that normally keeps the data fresh. This timer covers the cases
// that path cannot: the pipeline failing partway, the snapshot blob being
// deleted, or a brand new environment where no upload has run yet — so
// /actions/snapshot is never left indefinitely stale or missing.
//
// Runs at :45 past every 6th hour, half an hour after the api-upsert schedule
// (15 */6) so a normal pipeline run has finished and already refreshed it.
module.exports = async function snapshotWarmup(context) {
  const tableClient = getTableClient();

  try {
    const result = await refreshSnapshot(tableClient);
    context.log(
      `SnapshotWarmup: refreshed snapshot (count=${result.count}, bytes=${result.bytes}, ${result.durationMs}ms)`
    );
  } catch (error) {
    context.log.error('SnapshotWarmup: failed to refresh snapshot:', error);
  }
};
