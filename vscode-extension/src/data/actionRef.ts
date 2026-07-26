/**
 * Parsing of GitHub Action references as they appear in workflow files.
 *
 * Deliberately kept compatible with the MCP server's parser
 * (src/mcp-server/lib/inputParser.js) so the same input produces the same
 * owner/name/version split whichever surface an agent happens to call.
 */

export interface ParsedActionRef {
  /** The input, trimmed. */
  raw: string;
  /** Lowercased owner. */
  owner: string;
  /** Lowercased repository name. */
  name: string;
  /** Path inside the repository for composite actions, e.g. "analyze". */
  subPath: string | null;
  /** The pin after `@`, or null when unpinned. */
  version: string | null;
  /** True when `version` looks like a commit SHA rather than a tag. */
  isSha: boolean;
}

export interface ActionRefError {
  raw: string;
  error: string;
}

export type ActionRefResult = ParsedActionRef | ActionRefError;

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export function isRefError(result: ActionRefResult): result is ActionRefError {
  return (result as ActionRefError).error !== undefined;
}

export function isShaLike(value: string): boolean {
  return SHA_PATTERN.test(value);
}

/**
 * Parses one action reference.
 *
 * Rejects the reference forms that are valid in a workflow but are not
 * marketplace actions - `docker://` images and `./local/path` actions - with an
 * explanatory error rather than a confusing "not found", because a caller that
 * fed us a workflow's whole `uses:` list should be told why an entry was skipped.
 */
export function parseActionRef(input: unknown): ActionRefResult {
  if (typeof input !== 'string' || !input.trim()) {
    return { raw: typeof input === 'string' ? input : '', error: 'Action reference must be a non-empty string.' };
  }

  const raw = input.trim();

  if (raw.startsWith('docker://')) {
    return { raw, error: 'Docker image references are not marketplace actions.' };
  }

  if (raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('.\\')) {
    return { raw, error: 'Local path actions are not published to the marketplace.' };
  }

  let refPart = raw;
  let version: string | null = null;

  const atIndex = raw.indexOf('@');
  if (atIndex > 0) {
    refPart = raw.slice(0, atIndex);
    version = raw.slice(atIndex + 1).trim() || null;
  }

  const segments = refPart.split('/').map((segment) => segment.trim());

  if (segments.length < 2) {
    return { raw, error: `Expected "owner/name" format, got "${refPart}".` };
  }

  const owner = segments[0].toLowerCase();
  const name = segments[1].toLowerCase();

  if (!owner || !name) {
    return { raw, error: `Owner and name cannot be empty in "${refPart}".` };
  }

  const subPath = segments.length > 2 ? segments.slice(2).filter(Boolean).join('/') : null;

  return {
    raw,
    owner,
    name,
    subPath: subPath || null,
    version,
    isSha: version ? isShaLike(version) : false
  };
}

/**
 * Formats an action reference pinned to a commit SHA, with the version as a
 * trailing comment - the form GitHub and Dependabot both recommend.
 */
export function formatPinnedRef(
  owner: string,
  name: string,
  subPath: string | null,
  sha: string,
  version: string | null
): string {
  const path = subPath ? `${owner}/${name}/${subPath}` : `${owner}/${name}`;
  return version ? `${path}@${sha} # ${version}` : `${path}@${sha}`;
}
