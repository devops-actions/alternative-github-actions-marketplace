'use strict';

const { logToolCall, getStats, resetStats, flushPeriod, getTopActions, startPeriodicFlush, stopPeriodicFlush } = require('../lib/monitoring');

describe('monitoring', () => {
  beforeEach(() => {
    resetStats();
    stopPeriodicFlush();
  });

  afterEach(() => {
    stopPeriodicFlush();
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

  test('flushPeriod resets periodCalls to zero', () => {
    logToolCall('a', 'b', 'a/b');
    logToolCall('a', 'b', 'a/b');
    expect(getStats().periodCalls).toBe(2);

    flushPeriod();

    expect(getStats().periodCalls).toBe(0);
    // totalCalls is NOT reset by flushPeriod
    expect(getStats().totalCalls).toBe(2);
  });

  test('flushPeriod does not reset totalCalls', () => {
    logToolCall('x', 'y', 'x/y');
    flushPeriod();
    logToolCall('x', 'y', 'x/y');

    expect(getStats().totalCalls).toBe(2);
    expect(getStats().periodCalls).toBe(1);
  });

  test('getTopActions returns actions sorted by count descending', () => {
    logToolCall('a', 'one', 'a/one');
    logToolCall('b', 'two', 'b/two');
    logToolCall('b', 'two', 'b/two');
    logToolCall('b', 'two', 'b/two');
    logToolCall('c', 'three', 'c/three');
    logToolCall('c', 'three', 'c/three');

    const top = getTopActions(3);
    expect(top[0].action).toBe('b/two');
    expect(top[0].count).toBe(3);
    expect(top[1].action).toBe('c/three');
    expect(top[1].count).toBe(2);
    expect(top[2].action).toBe('a/one');
    expect(top[2].count).toBe(1);
  });

  test('getTopActions limits results to n', () => {
    logToolCall('a', 'one', 'a/one');
    logToolCall('b', 'two', 'b/two');
    logToolCall('c', 'three', 'c/three');

    const top = getTopActions(2);
    expect(top).toHaveLength(2);
  });

  test('startPeriodicFlush and stopPeriodicFlush', () => {
    // Should not throw when starting and stopping
    startPeriodicFlush();
    stopPeriodicFlush();
  });

  test('startPeriodicFlush is idempotent (second call is no-op)', () => {
    startPeriodicFlush();
    startPeriodicFlush(); // should not create a second interval
    stopPeriodicFlush();
    // After stopping, periodCalls should still be correct
    logToolCall('a', 'b', 'a/b');
    expect(getStats().periodCalls).toBe(1);
  });

  test('stopPeriodicFlush is safe to call when not started', () => {
    expect(() => stopPeriodicFlush()).not.toThrow();
  });
});

