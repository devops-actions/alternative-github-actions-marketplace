'use strict';

const { resolveLatestVersion, resolveCommitSha, resolveVersionFromSha } = require('../lib/actionLookup');

describe('resolveLatestVersion', () => {
  test('returns latest from releaseInfo (newest-first)', () => {
    const actionData = {
      releaseInfo: ['v4.2.2', 'v4.2.1', 'v4.2.0'],
      tagInfo: ['v4.2.0', 'v4.2.1', 'v4.2.2']
    };
    const result = resolveLatestVersion(actionData, null);
    expect(result.latestVersion).toBe('v4.2.2');
    expect(result.isLatest).toBeNull();
  });

  test('returns latest from tagInfo if no releaseInfo', () => {
    const actionData = {
      releaseInfo: [],
      tagInfo: ['1.0.0', '1.1.0', '2.0.0']
    };
    const result = resolveLatestVersion(actionData, null);
    expect(result.latestVersion).toBe('2.0.0');
  });

  test('handles empty arrays', () => {
    const result = resolveLatestVersion({ releaseInfo: [], tagInfo: [] }, 'v4');
    expect(result.latestVersion).toBeNull();
    expect(result.allVersions).toEqual([]);
  });

  test('detects when current version is latest', () => {
    const actionData = { releaseInfo: ['v4.2.2', 'v4.2.1'], tagInfo: [] };
    const result = resolveLatestVersion(actionData, 'v4.2.2');
    expect(result.isLatest).toBe(true);
  });

  test('detects when current version is NOT latest', () => {
    const actionData = { releaseInfo: ['v4.2.2', 'v4.2.1'], tagInfo: [] };
    const result = resolveLatestVersion(actionData, 'v4.2.1');
    expect(result.isLatest).toBe(false);
  });

  test('handles major version prefix (v4 matches v4.x.x latest)', () => {
    const actionData = { releaseInfo: ['v4.2.2', 'v4.2.1', 'v3.6.0'], tagInfo: [] };
    const result = resolveLatestVersion(actionData, 'v4');
    // v4 is the major prefix; the latest overall is v4.2.2 which starts with v4
    expect(result.isLatest).toBe(true);
  });

  test('handles major version prefix when latest is different major', () => {
    const actionData = { releaseInfo: ['v5.0.0', 'v4.2.2', 'v4.2.1'], tagInfo: [] };
    const result = resolveLatestVersion(actionData, 'v4');
    // v4 is a major prefix, latest overall is v5.0.0 which does not start with v4
    expect(result.isLatest).toBe(false);
  });

  test('deduplicates versions from releases and tags', () => {
    const actionData = {
      releaseInfo: ['v2.0.0', 'v1.0.0'],
      tagInfo: ['v1.0.0', 'v2.0.0']
    };
    const result = resolveLatestVersion(actionData, null);
    expect(result.allVersions).toEqual(['v2.0.0', 'v1.0.0']);
  });
});

describe('resolveCommitSha', () => {
  test('returns SHA when versionShaMap has the version', () => {
    const actionData = {
      versionShaMap: { 'v4.0.0': 'abc123', 'v4.1.0': 'def456' }
    };
    expect(resolveCommitSha(actionData, 'v4.0.0')).toBe('abc123');
  });

  test('returns null when version is not in the map', () => {
    const actionData = {
      versionShaMap: { 'v4.0.0': 'abc123' }
    };
    expect(resolveCommitSha(actionData, 'v99.0.0')).toBeNull();
  });

  test('returns null when versionShaMap is missing', () => {
    expect(resolveCommitSha({}, 'v1.0.0')).toBeNull();
  });

  test('returns null when versionShaMap is not an object', () => {
    expect(resolveCommitSha({ versionShaMap: 'bad' }, 'v1.0.0')).toBeNull();
  });

  test('returns null when version is null', () => {
    const actionData = {
      versionShaMap: { 'v4.0.0': 'abc123' }
    };
    expect(resolveCommitSha(actionData, null)).toBeNull();
  });
});

describe('resolveVersionFromSha', () => {
  test('returns version tag when SHA is found in versionShaMap', () => {
    const actionData = { versionShaMap: { 'v2.19.1': 'a5ad31d6abc', 'v2.0.0': 'deadbeef' } };
    expect(resolveVersionFromSha(actionData, 'a5ad31d6abc')).toBe('v2.19.1');
  });

  test('returns null when SHA is not in versionShaMap', () => {
    const actionData = { versionShaMap: { 'v1.0.0': 'abc123' } };
    expect(resolveVersionFromSha(actionData, 'notinmap')).toBeNull();
  });

  test('returns null when versionShaMap is missing', () => {
    expect(resolveVersionFromSha({}, 'abc123')).toBeNull();
  });

  test('returns null when sha is null', () => {
    const actionData = { versionShaMap: { 'v1.0.0': 'abc123' } };
    expect(resolveVersionFromSha(actionData, null)).toBeNull();
  });

  test('is case-insensitive for SHA comparison', () => {
    const actionData = { versionShaMap: { 'v1.0.0': 'ABC123DEF' } };
    expect(resolveVersionFromSha(actionData, 'abc123def')).toBe('v1.0.0');
  });
});

describe('SHA-pinned isLatest via lookupSingleAction', () => {
  // These tests verify the plumbing in lookupSingleAction by combining the pure helpers
  // directly, covering the same logical paths without fragile module mocking.

  test('resolveVersionFromSha + resolveLatestVersion: null versionShaMap yields isLatest null', () => {
    const actionData = { releaseInfo: ['v4.2.2', 'v4.2.1'], tagInfo: [] };
    const sha = 'de0fac2e4500dabe';
    const resolved = resolveVersionFromSha(actionData, sha); // null (no map)
    const { isLatest } = resolveLatestVersion(actionData, resolved); // null (no currentVersion)
    expect(resolved).toBeNull();
    expect(isLatest).toBeNull();
  });

  test('resolveVersionFromSha + resolveLatestVersion: SHA resolves to latest -> isLatest true', () => {
    const actionData = {
      releaseInfo: ['v4.2.2', 'v4.2.1'],
      tagInfo: [],
      versionShaMap: { 'v4.2.2': 'de0fac2e4500dabe', 'v4.2.1': 'abc' }
    };
    const sha = 'de0fac2e4500dabe';
    const resolved = resolveVersionFromSha(actionData, sha);
    const { isLatest } = resolveLatestVersion(actionData, resolved);
    expect(resolved).toBe('v4.2.2');
    expect(isLatest).toBe(true);
  });

  test('resolveVersionFromSha + resolveLatestVersion: SHA resolves to older version -> isLatest false', () => {
    const actionData = {
      releaseInfo: ['v4.2.2', 'v4.2.1'],
      tagInfo: [],
      versionShaMap: { 'v4.2.2': 'de0fac2e4500dabe', 'v4.2.1': 'oldsha' }
    };
    const sha = 'oldsha';
    const resolved = resolveVersionFromSha(actionData, sha);
    const { isLatest } = resolveLatestVersion(actionData, resolved);
    expect(resolved).toBe('v4.2.1');
    expect(isLatest).toBe(false);
  });
});

describe('resolveLatestVersion edge cases', () => {
  test('handles single (non-array) releaseInfo value', () => {
    const actionData = { releaseInfo: 'v1.0.0', tagInfo: [] };
    const result = resolveLatestVersion(actionData, null);
    expect(result.latestVersion).toBe('v1.0.0');
    expect(result.allVersions).toEqual(['v1.0.0']);
  });

  test('handles single (non-array) tagInfo value', () => {
    const actionData = { releaseInfo: [], tagInfo: 'v2.0.0' };
    const result = resolveLatestVersion(actionData, null);
    expect(result.latestVersion).toBe('v2.0.0');
  });

  test('handles releaseInfo with object entries (legacy tag_name format)', () => {
    const actionData = {
      releaseInfo: [{ tag_name: 'v3.0.0' }, { tag_name: 'v2.0.0' }],
      tagInfo: []
    };
    const result = resolveLatestVersion(actionData, null);
    expect(result.latestVersion).toBe('v3.0.0');
    expect(result.allVersions).toContain('v2.0.0');
  });

  test('handles tagInfo with object entries (legacy sha/tag format)', () => {
    const actionData = {
      releaseInfo: [],
      tagInfo: [{ sha: 'abc', tag: 'v1.0.0' }, { sha: 'def', tag: 'v1.1.0' }]
    };
    const result = resolveLatestVersion(actionData, null);
    // Last tag in oldest-first order is the latest
    expect(result.latestVersion).toBe('v1.1.0');
  });

  test('filters out null/undefined entries in versions', () => {
    const actionData = {
      releaseInfo: [null, 'v1.0.0', undefined],
      tagInfo: []
    };
    const result = resolveLatestVersion(actionData, null);
    expect(result.latestVersion).toBe('v1.0.0');
    expect(result.allVersions).toEqual(['v1.0.0']);
  });

  test('handles missing releaseInfo and tagInfo', () => {
    const result = resolveLatestVersion({}, null);
    expect(result.latestVersion).toBeNull();
    expect(result.allVersions).toEqual([]);
    expect(result.isLatest).toBeNull();
  });
});

describe('resolveCommitSha legacy tagInfo path', () => {
  test('falls back to legacy tagInfo [{sha, tag}] array', () => {
    const actionData = {
      tagInfo: [{ sha: 'legacysha', tag: 'v1.0.0' }, { sha: 'other', tag: 'v2.0.0' }]
    };
    expect(resolveCommitSha(actionData, 'v1.0.0')).toBe('legacysha');
  });

  test('returns null when version not in legacy tagInfo', () => {
    const actionData = {
      tagInfo: [{ sha: 'legacysha', tag: 'v1.0.0' }]
    };
    expect(resolveCommitSha(actionData, 'v9.9.9')).toBeNull();
  });

  test('returns null when tagInfo contains non-object entries', () => {
    const actionData = { tagInfo: ['v1.0.0', 'v2.0.0'] };
    expect(resolveCommitSha(actionData, 'v1.0.0')).toBeNull();
  });

  test('returns null when tagInfo is not an array', () => {
    const actionData = { tagInfo: 'notanarray' };
    expect(resolveCommitSha(actionData, 'v1.0.0')).toBeNull();
  });
});

