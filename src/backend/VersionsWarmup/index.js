const { getTableClient } = require('../lib/tableStorage');
const { buildVersionsFeed } = require('../lib/versionsBuilder');
const { writeVersions } = require('../lib/versionsStore');

// Rebuilds the action versions feed once a day (see function.json).
//
// Building it means a full O(n) scan of the ~35k entity table, so it must never
// happen inside a user request. ActionsVersions keeps an on-demand build as a
// last-resort fallback for the very first request after deployment; this timer
// is what keeps the feed fresh from then on.
//
// Scheduled at 04:30 UTC, which falls between SnapshotWarmup's six-hourly :45
// slots (00:45, 06:45, ...), so the two full table scans never start together.
//
// The upstream pipeline (api-upsert.yml) pushes data every ~6 hours, so daily is
// a deliberate trade-off: clients are told to refresh at most once a day, and a
// feed that lags the table by a few hours is well within that tolerance. The
// ETag is derived from the feed content, so a rebuild that finds nothing changed
// keeps the same ETag and clients keep getting 304s.
module.exports = async function versionsWarmup(context) {
  const tableClient = getTableClient();
  const startedAt = Date.now();

  try {
    const feed = await buildVersionsFeed(tableClient);
    const written = await writeVersions(feed);
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    context.log(
      `VersionsWarmup: stored snapshot (count=${feed.count}, skipped=${feed.skipped}, ` +
      `raw=${written.rawBytes}B, gzip=${written.gzipBytes}B, etag=${written.etag}, ${elapsedSeconds}s)`
    );
  } catch (error) {
    context.log.error('VersionsWarmup: failed to rebuild the actions snapshot:', error);
    // Rethrow so the failure shows up as a failed invocation in Application
    // Insights instead of a silently stale snapshot.
    throw error;
  }
};
