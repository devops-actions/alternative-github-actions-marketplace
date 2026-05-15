'use strict';

const { resolveLatestVersion, resolveCommitSha } = require('../lib/actionLookup');

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
