'use strict';

const { parseActionRef } = require('./inputParser');
const { fetchAction } = require('./backendClient');
const { getAction, setAction } = require('./cache');
const { logToolCall } = require('./monitoring');

const MAX_BATCH_SIZE = 20;

/**
 * Resolve the latest version from tagInfo/releaseInfo arrays.
 * If a currentVersion is provided (e.g., "v4"), find the latest matching that major.
 */
function resolveLatestVersion(actionData, currentVersion) {
  const releases = actionData.releaseInfo || [];
  const tags = actionData.tagInfo || [];

  // Combine and deduplicate, releases first (typically newest-first)
  const allVersions = [...new Set([...releases, ...tags])];

  if (allVersions.length === 0) {
    return { latestVersion: null, allVersions: [], isLatest: null };
  }

  // The latest version is the first in releaseInfo (newest-first), or last in tagInfo (oldest-first)
  const latestVersion = releases.length > 0 ? releases[0] : tags[tags.length - 1];

  let isLatest = null;
  if (currentVersion) {
    const normalized = currentVersion.toLowerCase();
    const latestNormalized = (latestVersion || '').toLowerCase();

    if (normalized === latestNormalized) {
      isLatest = true;
    } else {
      // Check if currentVersion is a major version prefix (e.g., "v4")
      const majorMatch = normalized.match(/^v?(\d+)$/);
      if (majorMatch) {
        const majorPrefix = `v${majorMatch[1]}`;
        // Find latest within this major
        const latestInMajor = allVersions.find(v =>
          v.toLowerCase().startsWith(majorPrefix + '.') || v.toLowerCase() === majorPrefix
        );
        isLatest = latestInMajor ? latestInMajor.toLowerCase() === latestNormalized : false;
      } else {
        isLatest = false;
      }
    }
  }

  return { latestVersion, allVersions, isLatest };
}

/**
 * Look up a single action by parsed reference.
 */
async function lookupSingleAction(parsed) {
  if (parsed.error) {
    return {
      input: parsed.raw || null,
      found: false,
      error: parsed.error,
      owner: null,
      name: null,
      latestVersion: null,
      commitSha: null,
      currentVersion: null,
      isLatest: null,
      allVersions: []
    };
  }

  const { owner, name, version, raw } = parsed;

  // Check cache first
  let actionData = getAction(owner, name);
  let cacheHit = Boolean(actionData);

  if (!actionData) {
    try {
      actionData = await fetchAction(owner, name);
    } catch (error) {
      return {
        input: raw,
        found: false,
        error: `Backend error: ${error.message}`,
        owner,
        name,
        latestVersion: null,
        commitSha: null,
        currentVersion: version,
        isLatest: null,
        allVersions: []
      };
    }

    if (actionData) {
      setAction(owner, name, actionData);
    }
  }

  if (!actionData) {
    return {
      input: raw,
      found: false,
      error: null,
      owner,
      name,
      latestVersion: null,
      commitSha: null,
      currentVersion: version,
      isLatest: null,
      allVersions: []
    };
  }

  logToolCall(owner, name, raw);

  const { latestVersion, allVersions, isLatest } = resolveLatestVersion(actionData, version);

  return {
    input: raw,
    found: true,
    error: null,
    owner,
    name,
    latestVersion,
    commitSha: null, // Not available in current data model
    currentVersion: version,
    isLatest,
    allVersions,
    cacheHit
  };
}

/**
 * Look up multiple actions (batch).
 * @param {string[]} actions - Array of action reference strings
 * @returns {Promise<Object>} Results object with results array
 */
async function lookupActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { results: [], error: 'Input must be a non-empty array of action references.' };
  }

  if (actions.length > MAX_BATCH_SIZE) {
    return {
      results: [],
      error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}. Please split into smaller batches.`
    };
  }

  const parsed = actions.map(parseActionRef);
  const results = await Promise.all(parsed.map(lookupSingleAction));

  return { results };
}

module.exports = { lookupActions, lookupSingleAction, resolveLatestVersion, MAX_BATCH_SIZE };
