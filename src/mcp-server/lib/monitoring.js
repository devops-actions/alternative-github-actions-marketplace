'use strict';

let totalCalls = 0;
let periodCalls = 0;
const actionCounts = new Map();

/**
 * Log a tool call for monitoring.
 */
function logToolCall(owner, name, input) {
  totalCalls++;
  periodCalls++;
  const key = `${owner}/${name}`;
  actionCounts.set(key, (actionCounts.get(key) || 0) + 1);

  console.log(JSON.stringify({
    event: 'action_lookup',
    timestamp: new Date().toISOString(),
    input,
    owner,
    name
  }));
}

/**
 * Get current monitoring stats.
 */
function getStats() {
  return {
    totalCalls,
    periodCalls,
    uniqueActions: actionCounts.size,
    topActions: getTopActions(10)
  };
}

/**
 * Get top N looked-up actions.
 */
function getTopActions(n = 10) {
  return [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([action, count]) => ({ action, count }));
}

/**
 * Reset periodic counters (called by the periodic flush).
 */
function flushPeriod() {
  const stats = {
    event: 'period_stats',
    timestamp: new Date().toISOString(),
    periodCalls,
    totalCalls,
    uniqueActions: actionCounts.size,
    topActions: getTopActions(10)
  };
  console.log(JSON.stringify(stats));
  periodCalls = 0;
}

let flushInterval = null;

/**
 * Start periodic stats logging (every 5 minutes).
 */
function startPeriodicFlush() {
  if (flushInterval) return;
  flushInterval = setInterval(flushPeriod, 5 * 60 * 1000);
  flushInterval.unref();
}

/**
 * Stop periodic flush (for testing).
 */
function stopPeriodicFlush() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

/**
 * Reset all counters (for testing).
 */
function resetStats() {
  totalCalls = 0;
  periodCalls = 0;
  actionCounts.clear();
}

module.exports = {
  logToolCall,
  getStats,
  getTopActions,
  flushPeriod,
  startPeriodicFlush,
  stopPeriodicFlush,
  resetStats
};
