'use strict';

/**
 * Parse a GitHub Action reference string into its components.
 *
 * Supported formats:
 *   - "actions/checkout@v4"
 *   - "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683"
 *   - "actions/checkout"
 *   - "github/codeql-action/analyze@v3"
 */
function parseActionRef(ref) {
  if (!ref || typeof ref !== 'string') {
    return { error: 'Invalid action reference: must be a non-empty string.' };
  }

  const trimmed = ref.trim();
  if (!trimmed) {
    return { error: 'Invalid action reference: must be a non-empty string.' };
  }

  let refPart = trimmed;
  let version = null;

  const atIndex = trimmed.indexOf('@');
  if (atIndex > 0) {
    refPart = trimmed.substring(0, atIndex);
    version = trimmed.substring(atIndex + 1);
  }

  const segments = refPart.split('/');
  if (segments.length < 2) {
    return { error: `Invalid action reference: expected "owner/name" format, got "${trimmed}".` };
  }

  const owner = segments[0].trim().toLowerCase();
  const name = segments[1].trim().toLowerCase();

  if (!owner || !name) {
    return { error: `Invalid action reference: owner and name cannot be empty in "${trimmed}".` };
  }

  const subPath = segments.length > 2 ? segments.slice(2).join('/') : null;
  const isHash = version ? /^[0-9a-f]{7,40}$/i.test(version) : false;

  return {
    owner,
    name,
    version: version || null,
    isHash,
    subPath,
    raw: trimmed
  };
}

/**
 * Parse a batch of action references.
 * Returns an array of parsed results (with or without errors).
 */
function parseActionRefs(refs) {
  if (!Array.isArray(refs)) {
    return [];
  }
  return refs.map(parseActionRef);
}

module.exports = { parseActionRef, parseActionRefs };
