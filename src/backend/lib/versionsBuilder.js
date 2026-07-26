/**
 * Builds the action versions feed: a compact projection of the actions table
 * served by /api/actions/versions.
 *
 * The full dataset is ~35k records and tens of megabytes, which is far too much
 * for a client (e.g. the VS Code extension) to download on a daily refresh.
 * This projection keeps only what a consumer needs to answer "what is the
 * latest version of this action, when was it published, and which commit SHA
 * does it point at" plus the handful of facets worth filtering on.
 *
 * Not to be confused with `lib/actionSummary.js`, which projects the same table
 * for the frontend overview. That one carries the fields the UI renders and
 * deliberately drops tagInfo and versionShaMap - exactly the SHA data this feed
 * exists to provide.
 *
 * Rows are emitted as positional arrays rather than objects: repeating nine
 * property names 35k times costs more than the values themselves. The `fields`
 * array in the envelope names the positions so clients can validate the shape
 * instead of hard-coding indexes blindly.
 */

const VERSIONS_SCHEMA_VERSION = 1;

// Positional field names for each row in `actions`. Append-only: adding a field
// at the end is backwards compatible, reordering or removing one is not and
// requires bumping VERSIONS_SCHEMA_VERSION.
const VERSIONS_FIELDS = [
  'owner',
  'name',
  'latestVersion',
  'latestSha',
  'publishedAt',
  'actionType',
  'flags',
  'ossfScore',
  'dependents',
  'floatingTags'
];

const FLAG_VERIFIED = 1;
const FLAG_ARCHIVED = 2;
const FLAG_OSSF = 4;
const FLAG_DISABLED = 8;

// Floating tags are the ones humans actually pin in workflows: `v4`, `v4.1`.
// Immutable patch tags (`v4.1.2`) are already covered by `latestVersion`, and
// including every tag would inflate the snapshot for little benefit.
const FLOATING_TAG_PATTERN = /^v?\d+(\.\d+)?$/;

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Normalizes a releaseInfo/tagInfo entry to a plain version string.
 *
 * Production data is inconsistent here: entries may be plain strings, GitHub
 * release objects (`{ tag_name, target_commitish }`), or tag objects
 * (`{ sha, tag }`) depending on when the record was ingested.
 *
 * @param {*} entry
 * @returns {string|null}
 */
function normalizeVersionEntry(entry) {
  if (typeof entry === 'string') {
    return entry.trim() || null;
  }
  if (entry && typeof entry === 'object') {
    const value = entry.tag_name || entry.tag || null;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  return null;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

/**
 * Strips the `{owner}_` prefix the ingest pipeline prepends to action names.
 *
 * `/actions/{owner}/{name}` already does this so callers see the bare name;
 * `/actions/list` does not, so the snapshot has to normalize it to keep client
 * lookups consistent.
 *
 * @param {string} owner
 * @param {string} name
 * @returns {string}
 */
function stripOwnerPrefix(owner, name) {
  if (typeof name !== 'string' || typeof owner !== 'string') {
    return typeof name === 'string' ? name : '';
  }
  const prefix = `${owner.toLowerCase()}_`;
  if (name.toLowerCase().startsWith(prefix)) {
    return name.slice(prefix.length);
  }
  return name;
}

/**
 * Builds a tag -> sha map for an action.
 *
 * Two sources exist. `versionShaMap` is the shape agreed in
 * `Decision Records/version-sha-map.md` and takes precedence; `tagInfo` entries
 * of the form `{ sha, tag }` are what production currently carries for roughly
 * half the dataset. The rest store tagInfo as plain strings with no SHA at all -
 * those tags simply have no SHA available, and callers must surface that as
 * "unknown" rather than substituting a value from elsewhere.
 *
 * @param {*} tagInfo
 * @param {*} versionShaMap
 * @returns {Map<string, string>}
 */
function buildTagShaMap(tagInfo, versionShaMap) {
  const map = new Map();

  const add = (tag, sha) => {
    const trimmedSha = typeof sha === 'string' ? sha.trim() : null;
    if (tag && trimmedSha && SHA_PATTERN.test(trimmedSha) && !map.has(tag)) {
      map.set(tag, trimmedSha.toLowerCase());
    }
  };

  if (versionShaMap && typeof versionShaMap === 'object' && !Array.isArray(versionShaMap)) {
    for (const [tag, sha] of Object.entries(versionShaMap)) {
      add(typeof tag === 'string' ? tag.trim() : null, sha);
    }
  }

  for (const entry of toArray(tagInfo)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    add(normalizeVersionEntry(entry), entry.sha);
  }

  return map;
}

/**
 * Picks the latest version for an action payload.
 *
 * `releaseInfo` is newest-first when present and is the more trustworthy
 * signal, because it reflects published releases rather than every tag that
 * happens to exist. `tagInfo` is the fallback for repos that tag without
 * releasing; it is also newest-first in the current dataset.
 *
 * No semver sorting is applied on purpose - the upstream ordering is what the
 * website and MCP server already present, and re-sorting would disagree with
 * them for prerelease-heavy repos.
 *
 * @param {object} payload
 * @returns {{ version: string|null, source: 'release'|'tag'|null }}
 */
function resolveLatestVersion(payload) {
  const releases = toArray(payload && payload.releaseInfo).map(normalizeVersionEntry).filter(Boolean);
  if (releases.length > 0) {
    return { version: releases[0], source: 'release' };
  }

  const tags = toArray(payload && payload.tagInfo).map(normalizeVersionEntry).filter(Boolean);
  if (tags.length > 0) {
    return { version: tags[0], source: 'tag' };
  }

  return { version: null, source: null };
}

/**
 * Collects `[tag, sha]` pairs for floating major/minor tags.
 *
 * Only tags with a known SHA are included: a floating tag without a SHA adds
 * bytes without answering the question consumers ask it ("what commit does
 * `@v4` resolve to right now").
 *
 * @param {Map<string, string>} tagShaMap
 * @returns {Array<[string, string]>}
 */
function collectFloatingTags(tagShaMap) {
  const pairs = [];
  for (const [tag, sha] of tagShaMap) {
    if (FLOATING_TAG_PATTERN.test(tag)) {
      pairs.push([tag, sha]);
    }
  }
  return pairs;
}

/**
 * Parses a dependents count into a number.
 *
 * Values arrive as display strings: comma-grouped ("15,368,157") and sometimes
 * suffixed ("999+"). The suffix is dropped; the snapshot is for ranking and
 * display, not for exact reporting.
 *
 * @param {*} value
 * @returns {number|null}
 */
function parseDependents(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const digits = value.replace(/,/g, '').replace(/\+$/, '');
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOssfScore(payload) {
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

function computeFlags(payload, ossfScore) {
  const repoInfo = (payload.repoInfo && typeof payload.repoInfo === 'object') ? payload.repoInfo : {};
  let flags = 0;

  if (payload.verified === true || payload.verified === 1 || payload.verified === 'true') {
    flags |= FLAG_VERIFIED;
  }
  if (repoInfo.archived === true) {
    flags |= FLAG_ARCHIVED;
  }
  if (payload.ossf === true || ossfScore !== null) {
    flags |= FLAG_OSSF;
  }
  if (repoInfo.disabled === true) {
    flags |= FLAG_DISABLED;
  }

  return flags;
}

/**
 * Projects a single stored action payload onto a snapshot row.
 *
 * @param {object} payload - the parsed PayloadJson of an actions table entity
 * @returns {Array|null} positional row, or null when the payload is unusable
 */
function buildRow(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const owner = typeof payload.owner === 'string' ? payload.owner.trim() : '';
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!owner || !rawName) {
    return null;
  }

  const name = stripOwnerPrefix(owner, rawName);
  const tagShaMap = buildTagShaMap(payload.tagInfo, payload.versionShaMap);
  const { version } = resolveLatestVersion(payload);
  const latestSha = version ? (tagShaMap.get(version) || null) : null;

  const repoInfo = (payload.repoInfo && typeof payload.repoInfo === 'object') ? payload.repoInfo : {};
  const publishedAt = typeof repoInfo.latest_release_published_at === 'string' && repoInfo.latest_release_published_at
    ? repoInfo.latest_release_published_at
    : null;

  const actionType = (payload.actionType && typeof payload.actionType === 'object' && typeof payload.actionType.actionType === 'string')
    ? payload.actionType.actionType
    : null;

  const ossfScore = normalizeOssfScore(payload);
  const flags = computeFlags(payload, ossfScore);
  const dependents = parseDependents(payload.dependents && payload.dependents.dependents);
  const floatingTags = collectFloatingTags(tagShaMap);

  return [
    owner,
    name,
    version,
    latestSha,
    publishedAt,
    actionType,
    flags,
    ossfScore,
    dependents,
    // 0 rather than [] or null: it is the cheapest "nothing here" marker in JSON
    // and this field is empty for the majority of rows.
    floatingTags.length > 0 ? floatingTags : 0
  ];
}

function parsePayload(entity) {
  if (!entity) {
    return null;
  }
  try {
    return typeof entity.PayloadJson === 'string'
      ? JSON.parse(entity.PayloadJson)
      : (entity.PayloadJson || null);
  } catch {
    return null;
  }
}

/**
 * Scans the actions table and builds the full snapshot envelope.
 *
 * This is an O(n) scan over every entity, so it belongs on a schedule
 * (SnapshotWarmup) rather than in a request. ActionsSnapshot only falls back to
 * calling it when no snapshot has ever been stored.
 *
 * @param {object} tableClient
 * @param {{ now?: Date }} [options]
 * @returns {Promise<object>} snapshot envelope
 */
async function buildVersionsFeed(tableClient, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const actions = [];
  let skipped = 0;

  for await (const entity of tableClient.listEntities()) {
    const payload = parsePayload(entity);
    const row = payload ? buildRow(payload) : null;
    if (row) {
      actions.push(row);
    } else {
      skipped += 1;
    }
  }

  // Stable ordering keeps the payload hash (and therefore the ETag) stable
  // across rebuilds when nothing actually changed, so clients keep getting 304s.
  actions.sort((a, b) => {
    const ownerCompare = a[0].toLowerCase().localeCompare(b[0].toLowerCase());
    if (ownerCompare !== 0) {
      return ownerCompare;
    }
    return a[1].toLowerCase().localeCompare(b[1].toLowerCase());
  });

  return {
    schemaVersion: VERSIONS_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    count: actions.length,
    skipped,
    fields: VERSIONS_FIELDS,
    flags: {
      verified: FLAG_VERIFIED,
      archived: FLAG_ARCHIVED,
      ossf: FLAG_OSSF,
      disabled: FLAG_DISABLED
    },
    actions
  };
}

module.exports = {
  VERSIONS_SCHEMA_VERSION,
  VERSIONS_FIELDS,
  FLAG_VERIFIED,
  FLAG_ARCHIVED,
  FLAG_OSSF,
  FLAG_DISABLED,
  buildVersionsFeed,
  buildRow,
  buildTagShaMap,
  collectFloatingTags,
  normalizeVersionEntry,
  parseDependents,
  resolveLatestVersion,
  stripOwnerPrefix
};
