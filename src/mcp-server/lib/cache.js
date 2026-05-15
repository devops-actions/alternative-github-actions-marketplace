'use strict';

const { LRUCache } = require('lru-cache');
const { fetchActionsList } = require('./backendClient');

const cache = new LRUCache({
  max: 500,
  ttl: 5 * 60 * 1000,
  updateAgeOnGet: true
});

/**
 * Get a cached action by owner:name key.
 */
function getAction(owner, name) {
  const key = `${owner}:${name}`;
  return cache.get(key) || null;
}

/**
 * Set a cached action.
 */
function setAction(owner, name, data) {
  const key = `${owner}:${name}`;
  cache.set(key, data);
}

/**
 * Check if an action is in cache.
 */
function hasAction(owner, name) {
  const key = `${owner}:${name}`;
  return cache.has(key);
}

/**
 * Get cache stats.
 */
function getCacheStats() {
  return {
    size: cache.size,
    max: cache.max
  };
}

/**
 * Pre-warm the cache with the most popular actions (by dependents).
 * Silently fails if the backend is unavailable.
 */
async function preWarm() {
  try {
    const actions = await fetchActionsList({ limit: 200 });
    if (!Array.isArray(actions)) return 0;

    const sorted = actions
      .filter(a => a && a.owner && a.name)
      .sort((a, b) => {
        const dA = parseInt((a.dependents && a.dependents.dependents) || '0', 10);
        const dB = parseInt((b.dependents && b.dependents.dependents) || '0', 10);
        return dB - dA;
      });

    let count = 0;
    for (const action of sorted) {
      const owner = String(action.owner).toLowerCase();
      const name = String(action.name).toLowerCase();
      setAction(owner, name, action);
      count++;
    }

    console.log(JSON.stringify({
      event: 'cache_prewarm',
      timestamp: new Date().toISOString(),
      count
    }));

    return count;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'cache_prewarm_failed',
      timestamp: new Date().toISOString(),
      error: error.message
    }));
    return 0;
  }
}

/**
 * Clear the cache (for testing).
 */
function clearCache() {
  cache.clear();
}

module.exports = { getAction, setAction, hasAction, getCacheStats, preWarm, clearCache };
