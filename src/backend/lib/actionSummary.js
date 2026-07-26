// Projection of a stored action payload down to just the fields the
// list-driven frontend pages actually read (the overview grid, its filters
// and sorting, and the State of Actions charts).
//
// The full payloads average ~1.7 KB each, so returning all ~35k of them costs
// ~56 MB uncompressed. Every field below is read by OverviewPage or
// StateOfActionsPage; everything else (dependabot, forkFound, tagInfo,
// versionShaMap, mirrorLastUpdated, repoSize, …) is only ever needed on the
// detail page, which fetches a single action via /api/actions/{owner}/{name}.
// Dropping the rest takes the same dataset to ~6 MB.
//
// When the overview or state pages start reading a new field, add it here —
// otherwise it will silently be `undefined` in the snapshot.

// Reads the OpenSSF score from any of the casings that have appeared in the
// pipeline data over time. Returns null when there is no usable numeric score.
function readOssfScore(payload) {
  const raw = payload.openssf_score ?? payload.ossfScore ?? payload.ossf_score ?? null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

// The pipeline stores releaseInfo either as plain tag strings or as full
// GitHub release objects, and the grid only shows the newest tag name — so
// only the first entry is worth shipping.
//
// Kept as an array rather than flattened to a string: the frontend's
// normalizeAction runs releaseInfo through normalizeStringArray, which yields
// an empty array for any non-array input. A bare string would silently drop
// the "Latest: …" line from every card.
function readLatestRelease(payload) {
  const releases = payload.releaseInfo;
  if (!Array.isArray(releases) || releases.length === 0) {
    return [];
  }

  const first = releases[0];
  if (typeof first === 'string') {
    return [first];
  }
  if (first && typeof first === 'object' && typeof first.tag_name === 'string') {
    return [first.tag_name];
  }

  return [];
}

// `verified` has arrived as a boolean, the number 1, and the strings
// 'true'/'1' depending on which pipeline version wrote the record.
function readVerified(payload) {
  const value = payload.verified;
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

/**
 * Projects a full action payload to the summary shape served by
 * /api/actions/snapshot.
 *
 * @param {object} payload - the parsed PayloadJson of an action entity.
 * @returns {object|null} the summary, or null when the payload has no
 *   owner/name and therefore cannot be addressed by the UI.
 */
function toActionSummary(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const owner = typeof payload.owner === 'string' ? payload.owner.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!owner || !name) {
    return null;
  }

  const actionType = payload.actionType || {};
  const repoInfo = payload.repoInfo || {};
  const dependents = payload.dependents || {};
  const vulnerabilities = payload.vulnerabilityStatus || {};

  const ossfScore = readOssfScore(payload);

  // `dependents` has been stored as both a number and a string (sometimes with
  // a "999+" suffix or thousands separators). The UI parses strings, so
  // normalise to one.
  const dependentsCount = dependents.dependents === undefined || dependents.dependents === null
    ? '0'
    : String(dependents.dependents);

  return {
    owner,
    name,
    actionType: {
      actionType: actionType.actionType || '',
      nodeVersion: actionType.nodeVersion ?? null
    },
    repoInfo: {
      updated_at: repoInfo.updated_at || '',
      archived: repoInfo.archived === true
    },
    dependents: { dependents: dependentsCount },
    releaseInfo: readLatestRelease(payload),
    verified: readVerified(payload),
    ossf: payload.ossf === true || ossfScore !== null,
    ossfScore: ossfScore === null ? 0 : ossfScore,
    vulnerabilityStatus: {
      critical: Number(vulnerabilities.critical) || 0,
      high: Number(vulnerabilities.high) || 0
    }
  };
}

module.exports = { toActionSummary };
