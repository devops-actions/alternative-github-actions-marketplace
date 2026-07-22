// Scans the full actions table and aggregates the counts used by the
// /actions/stats endpoint. This is an O(n) scan over every entity, so it is
// deliberately kept out of the request hot path (see StatsWarmup, which runs
// this on a schedule) and only used as a last-resort fallback when no cache
// entry exists yet (e.g. right after the table is first created).
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

module.exports = { computeStats };
