/**
 * Shared helpers for normalizing values used as Azure Table Storage
 * partition/row keys. Centralizing this logic avoids subtle lookup
 * mismatches caused by inconsistent normalization across modules.
 */

function normalize(value) {
  return String(value).trim().toLowerCase();
}

/**
 * Normalizes a value (typically an owner) for use as a partition key.
 * @param {*} owner
 * @returns {string}
 */
function normalizePartitionKey(owner) {
  return normalize(owner);
}

/**
 * Normalizes a value (typically a name or version) for use as a row key.
 * @param {*} name
 * @returns {string}
 */
function normalizeRowKey(name) {
  return normalize(name);
}

module.exports = {
  normalizePartitionKey,
  normalizeRowKey
};
