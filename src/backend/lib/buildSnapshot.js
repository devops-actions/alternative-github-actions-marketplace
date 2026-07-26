const { toActionSummary } = require('./actionSummary');
const { writeSnapshot } = require('./snapshotStore');
const { STATS_CACHE_PARTITION } = require('./statsCache');

// Current snapshot payload shape. Bumped when the projection in
// lib/actionSummary.js changes in a way older clients cannot read, so a
// frontend deployed against an older shape can detect the mismatch instead of
// silently rendering empty cards.
const SNAPSHOT_VERSION = 1;

/**
 * Scans the actions table once and builds the snapshot document served by
 * /api/actions/snapshot.
 *
 * This is the only remaining full table scan in the read path, and it runs on
 * the pipeline's schedule rather than inside a user request.
 *
 * @returns {Promise<{ document: object, skipped: number }>}
 */
async function buildSnapshotDocument(tableClient) {
  const items = [];
  let skipped = 0;

  // Aggregated from the same pass. The stats these produce are derived from
  // exactly the records that made it into the snapshot, so the tile counts and
  // the grid can never disagree — which is the whole point of rebuilding both
  // together rather than letting two independent scans drift apart.
  const byType = {};
  let verified = 0;
  let archived = 0;
  let withOssf = 0;

  for await (const entity of tableClient.listEntities()) {
    // The stats cache lives in the same table under its own partition; it is
    // bookkeeping, not an action.
    if (entity.partitionKey === STATS_CACHE_PARTITION) {
      continue;
    }

    let payload;
    try {
      payload = typeof entity.PayloadJson === 'string'
        ? JSON.parse(entity.PayloadJson)
        : (entity.PayloadJson || null);
    } catch {
      skipped += 1;
      continue;
    }

    const summary = toActionSummary(payload);
    if (!summary) {
      skipped += 1;
      continue;
    }

    items.push(summary);

    const type = summary.actionType.actionType;
    if (type) {
      byType[type] = (byType[type] || 0) + 1;
    }
    if (summary.verified) verified += 1;
    if (summary.repoInfo.archived) archived += 1;
    if (summary.ossf) withOssf += 1;
  }

  // Sort newest-first at build time. The overview page defaults to "Last
  // Updated", so pre-sorting means the first page is meaningful the moment it
  // arrives — and any client taking a prefix of the list gets the most
  // relevant actions rather than whatever sorted first by PartitionKey.
  items.sort((a, b) => {
    const aTime = Date.parse(a.repoInfo.updated_at) || 0;
    const bTime = Date.parse(b.repoInfo.updated_at) || 0;
    return bTime - aTime;
  });

  return {
    document: {
      version: SNAPSHOT_VERSION,
      generatedAt: new Date().toISOString(),
      count: items.length,
      items
    },
    stats: { total: items.length, byType, verified, archived, withOssf },
    skipped
  };
}

/**
 * Builds the snapshot and persists it to blob storage.
 *
 * @returns {Promise<{ count: number, skipped: number, bytes: number, stats: object, generatedAt: string, durationMs: number }>}
 */
async function refreshSnapshot(tableClient) {
  const startedAt = Date.now();
  const { document, stats, skipped } = await buildSnapshotDocument(tableClient);
  const json = JSON.stringify(document);
  const { bytes } = await writeSnapshot(json);

  return {
    count: document.count,
    skipped,
    bytes,
    stats,
    generatedAt: document.generatedAt,
    durationMs: Date.now() - startedAt
  };
}

module.exports = { SNAPSHOT_VERSION, buildSnapshotDocument, refreshSnapshot };
