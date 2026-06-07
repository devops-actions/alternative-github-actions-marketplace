'use strict';

jest.mock('../lib/backendClient', () => ({
  fetchAction: jest.fn()
}));

jest.mock('../lib/cache', () => ({
  getAction: jest.fn(),
  setAction: jest.fn()
}));

jest.mock('../lib/monitoring', () => ({
  logToolCall: jest.fn()
}));

const { lookupActions, lookupSingleAction, MAX_BATCH_SIZE } = require('../lib/actionLookup');
const { fetchAction } = require('../lib/backendClient');
const { getAction, setAction } = require('../lib/cache');
const { logToolCall } = require('../lib/monitoring');

beforeEach(() => {
  jest.clearAllMocks();
  getAction.mockReturnValue(null);
});

describe('lookupActions', () => {
  test('returns error for empty array', async () => {
    const result = await lookupActions([]);
    expect(result.error).toBeDefined();
    expect(result.results).toHaveLength(0);
  });

  test('returns error for non-array input', async () => {
    const result = await lookupActions(null);
    expect(result.error).toBeDefined();
    expect(result.results).toHaveLength(0);
  });

  test('returns error when batch exceeds MAX_BATCH_SIZE', async () => {
    const oversized = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `actions/action${i}@v1`);
    const result = await lookupActions(oversized);
    expect(result.error).toContain('Batch size exceeds maximum');
    expect(result.results).toHaveLength(0);
  });

  test('returns results for valid refs with backend data', async () => {
    const actionData = {
      releaseInfo: ['v4.2.2', 'v4.2.0'],
      tagInfo: [],
      versionShaMap: { 'v4.2.2': 'abc123' }
    };
    fetchAction.mockResolvedValue(actionData);

    const result = await lookupActions(['actions/checkout@v4.2.2']);
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].found).toBe(true);
    expect(result.results[0].owner).toBe('actions');
    expect(result.results[0].name).toBe('checkout');
    expect(result.results[0].latestVersion).toBe('v4.2.2');
    expect(result.results[0].isLatest).toBe(true);
  });

  test('returns error result for invalid action reference', async () => {
    const result = await lookupActions(['not-valid']);
    expect(result.results[0].found).toBe(false);
    expect(result.results[0].error).toBeDefined();
  });

  test('processes multiple actions in batch', async () => {
    const actionData = { releaseInfo: ['v1.0.0'], tagInfo: [], versionShaMap: {} };
    fetchAction.mockResolvedValue(actionData);

    const result = await lookupActions([
      'actions/checkout@v1.0.0',
      'actions/setup-node@v1.0.0'
    ]);
    expect(result.results).toHaveLength(2);
    expect(result.results.every(r => r.found)).toBe(true);
  });
});

describe('lookupSingleAction', () => {
  test('returns error result when parsed ref has error', async () => {
    // 'not-valid' has no slash → parseActionRef returns error
    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('not-valid');
    const result = await lookupSingleAction(parsed);
    expect(result.found).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.owner).toBeNull();
  });

  test('returns cached data without calling backend', async () => {
    const actionData = {
      releaseInfo: ['v4.2.2'],
      tagInfo: [],
      versionShaMap: {}
    };
    getAction.mockReturnValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/checkout@v4.2.2');
    const result = await lookupSingleAction(parsed);

    expect(fetchAction).not.toHaveBeenCalled();
    expect(result.found).toBe(true);
    expect(result.cacheHit).toBe(true);
  });

  test('stores fetched data in cache', async () => {
    const actionData = { releaseInfo: ['v1.0.0'], tagInfo: [], versionShaMap: {} };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/setup-node@v1.0.0');
    await lookupSingleAction(parsed);

    expect(setAction).toHaveBeenCalledWith('actions', 'setup-node', actionData);
  });

  test('returns not found when backend returns null', async () => {
    fetchAction.mockResolvedValue(null);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/missing@v1');
    const result = await lookupSingleAction(parsed);

    expect(result.found).toBe(false);
    expect(result.error).toBeNull();
    expect(setAction).not.toHaveBeenCalled();
  });

  test('returns error result when backend throws', async () => {
    fetchAction.mockRejectedValue(new Error('network failure'));

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/failing@v1');
    const result = await lookupSingleAction(parsed);

    expect(result.found).toBe(false);
    expect(result.error).toContain('Backend error');
    expect(result.error).toContain('network failure');
  });

  test('calls logToolCall when action is found', async () => {
    const actionData = { releaseInfo: ['v4.0.0'], tagInfo: [], versionShaMap: {} };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/checkout@v4.0.0');
    await lookupSingleAction(parsed);

    expect(logToolCall).toHaveBeenCalledWith('actions', 'checkout', 'actions/checkout@v4.0.0');
  });

  test('does not call logToolCall when action is not found', async () => {
    fetchAction.mockResolvedValue(null);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/missing@v1');
    await lookupSingleAction(parsed);

    expect(logToolCall).not.toHaveBeenCalled();
  });

  test('handles SHA-pinned input with resolved version tag', async () => {
    const sha = 'abc1234567890abc';
    const actionData = {
      releaseInfo: ['v4.2.2', 'v4.2.1'],
      tagInfo: [],
      versionShaMap: { 'v4.2.2': sha }
    };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef(`actions/checkout@${sha}`);
    const result = await lookupSingleAction(parsed);

    expect(result.found).toBe(true);
    expect(result.currentVersionTag).toBe('v4.2.2');
    expect(result.isLatest).toBe(true);
  });

  test('handles SHA-pinned input that cannot be resolved', async () => {
    const sha = 'deadbeef00001111';
    const actionData = {
      releaseInfo: ['v4.2.2'],
      tagInfo: [],
      versionShaMap: { 'v4.2.2': 'otherrsha000001a' }
    };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef(`actions/checkout@${sha}`);
    const result = await lookupSingleAction(parsed);

    expect(result.found).toBe(true);
    expect(result.currentVersionTag).toBeNull();
    expect(result.isLatest).toBeNull();
  });

  test('returns cacheHit false when data comes from backend', async () => {
    const actionData = { releaseInfo: ['v1.0.0'], tagInfo: [], versionShaMap: {} };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/checkout@v1.0.0');
    const result = await lookupSingleAction(parsed);

    expect(result.cacheHit).toBe(false);
  });

  test('includes allVersions in result', async () => {
    const actionData = {
      releaseInfo: ['v2.0.0', 'v1.5.0', 'v1.0.0'],
      tagInfo: [],
      versionShaMap: {}
    };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/checkout@v2.0.0');
    const result = await lookupSingleAction(parsed);

    expect(result.allVersions).toContain('v2.0.0');
    expect(result.allVersions).toContain('v1.0.0');
  });

  test('handles action ref without version', async () => {
    const actionData = { releaseInfo: ['v4.0.0'], tagInfo: [], versionShaMap: {} };
    fetchAction.mockResolvedValue(actionData);

    const { parseActionRef } = require('../lib/inputParser');
    const parsed = parseActionRef('actions/checkout');
    const result = await lookupSingleAction(parsed);

    expect(result.found).toBe(true);
    expect(result.currentVersion).toBeNull();
    expect(result.isLatest).toBeNull();
  });
});
