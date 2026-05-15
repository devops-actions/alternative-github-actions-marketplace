'use strict';

const { logToolCall, getStats, resetStats } = require('../lib/monitoring');

describe('monitoring', () => {
  beforeEach(() => {
    resetStats();
  });

  test('logToolCall increments counters', () => {
    logToolCall('actions', 'checkout', 'actions/checkout@v4');
    logToolCall('actions', 'checkout', 'actions/checkout@v4');
    logToolCall('actions', 'setup-node', 'actions/setup-node@v4');

    const stats = getStats();
    expect(stats.totalCalls).toBe(3);
    expect(stats.periodCalls).toBe(3);
    expect(stats.uniqueActions).toBe(2);
  });

  test('getStats returns top actions', () => {
    logToolCall('actions', 'checkout', 'actions/checkout@v4');
    logToolCall('actions', 'checkout', 'actions/checkout@v4');
    logToolCall('other', 'action', 'other/action');

    const stats = getStats();
    expect(stats.topActions[0].action).toBe('actions/checkout');
    expect(stats.topActions[0].count).toBe(2);
  });

  test('resetStats clears everything', () => {
    logToolCall('a', 'b', 'a/b');
    resetStats();
    const stats = getStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.uniqueActions).toBe(0);
  });
});
