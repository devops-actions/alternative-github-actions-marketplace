/**
 * Wire format of GET /api/actions/versions, and the decoding of it.
 *
 * The server sends rows as positional arrays to keep the payload small (see
 * src/backend/lib/snapshotBuilder.js). The position of each field is described
 * by the `fields` array in the envelope rather than assumed, so a server that
 * appends a field does not silently shift the meaning of every column here.
 */

/** Bit values used in a row's `flags` field. */
export const enum ActionFlag {
  Verified = 1,
  Archived = 2,
  Ossf = 4,
  Disabled = 8
}

/** The envelope as it arrives over the wire. */
export interface SnapshotEnvelope {
  schemaVersion: number;
  generatedAt: string;
  count: number;
  skipped?: number;
  fields: string[];
  flags?: Record<string, number>;
  actions: unknown[][];
}

/** One action, decoded from a positional row. */
export interface ActionEntry {
  owner: string;
  name: string;
  /** Latest known version tag, or null when the action has no releases or tags. */
  latestVersion: string | null;
  /** Commit SHA for `latestVersion`. Null means unknown, not "none". */
  latestSha: string | null;
  /** Publish date of the repository's latest release, ISO 8601. */
  publishedAt: string | null;
  actionType: string | null;
  verified: boolean;
  archived: boolean;
  disabled: boolean;
  hasOssf: boolean;
  ossfScore: number | null;
  dependents: number | null;
  /** Floating tags (`v4`, `v4.1`) mapped to the commit they currently point at. */
  floatingTags: Record<string, string>;
}

/** A decoded snapshot: the entries plus the provenance of the data. */
export interface DecodedSnapshot {
  schemaVersion: number;
  generatedAt: string;
  count: number;
  entries: ActionEntry[];
}

/** The highest schema version this extension knows how to decode. */
export const SUPPORTED_SCHEMA_VERSION = 1;

const REQUIRED_FIELDS = ['owner', 'name', 'latestVersion', 'latestSha'] as const;

export class SnapshotFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotFormatError';
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function decodeFloatingTags(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const pair of value) {
    if (!Array.isArray(pair)) {
      continue;
    }
    const tag = asString(pair[0]);
    const sha = asString(pair[1]);
    if (tag && sha) {
      result[tag] = sha;
    }
  }
  return result;
}

/**
 * Decodes a snapshot envelope into entries.
 *
 * Throws SnapshotFormatError for anything that is not a snapshot this version
 * can read, so a bad or truncated download is rejected outright rather than
 * quietly producing an index full of undefined values.
 */
export function decodeSnapshot(raw: unknown): DecodedSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnapshotFormatError('Snapshot is not a JSON object.');
  }

  const envelope = raw as Partial<SnapshotEnvelope>;

  if (!Array.isArray(envelope.fields) || !Array.isArray(envelope.actions)) {
    throw new SnapshotFormatError('Snapshot is missing the "fields" or "actions" property.');
  }

  const schemaVersion = asNumber(envelope.schemaVersion);
  if (schemaVersion === null) {
    throw new SnapshotFormatError('Snapshot is missing a numeric "schemaVersion".');
  }
  if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    throw new SnapshotFormatError(
      `Snapshot schema version ${schemaVersion} is newer than this extension supports (${SUPPORTED_SCHEMA_VERSION}). Update the extension.`
    );
  }

  const index: Record<string, number> = {};
  envelope.fields.forEach((field, position) => {
    if (typeof field === 'string') {
      index[field] = position;
    }
  });

  for (const field of REQUIRED_FIELDS) {
    if (index[field] === undefined) {
      throw new SnapshotFormatError(`Snapshot does not declare the required field "${field}".`);
    }
  }

  const entries: ActionEntry[] = [];
  for (const row of envelope.actions) {
    if (!Array.isArray(row)) {
      continue;
    }

    const owner = asString(row[index.owner]);
    const name = asString(row[index.name]);
    if (!owner || !name) {
      continue;
    }

    const flags = asNumber(row[index.flags]) ?? 0;
    const ossfScore = asNumber(row[index.ossfScore]);

    entries.push({
      owner,
      name,
      latestVersion: asString(row[index.latestVersion]),
      latestSha: asString(row[index.latestSha]),
      publishedAt: asString(row[index.publishedAt]),
      actionType: asString(row[index.actionType]),
      verified: (flags & ActionFlag.Verified) !== 0,
      archived: (flags & ActionFlag.Archived) !== 0,
      disabled: (flags & ActionFlag.Disabled) !== 0,
      hasOssf: (flags & ActionFlag.Ossf) !== 0,
      ossfScore,
      dependents: asNumber(row[index.dependents]),
      floatingTags: decodeFloatingTags(row[index.floatingTags])
    });
  }

  return {
    schemaVersion,
    generatedAt: asString(envelope.generatedAt) ?? new Date(0).toISOString(),
    count: asNumber(envelope.count) ?? entries.length,
    entries
  };
}
