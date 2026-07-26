import { describe, expect, it } from 'vitest';

import { tokenizeQuery } from '../src/data/actionIndex';
import { indexOf, SAMPLE_ROWS, SHA_CHECKOUT_LATEST, SHA_CHECKOUT_V6 } from './helpers';

const index = indexOf(SAMPLE_ROWS);

describe('ActionIndex.get', () => {
  it('finds an action case-insensitively', () => {
    expect(index.get('ACTIONS', 'CheckOut')?.name).toBe('checkout');
  });

  it('returns undefined for an unknown action', () => {
    expect(index.get('nobody', 'nothing')).toBeUndefined();
  });

  it('resolves an underscore-encoded composite name from its slash spelling', () => {
    expect(index.get('github', 'codeql-action', 'analyze')?.name).toBe('codeql-action_analyze');
  });

  it('falls back to the repository entry for an unindexed sub-path', () => {
    const withRepo = indexOf([
      ...SAMPLE_ROWS,
      { owner: 'github', name: 'codeql-action', latestVersion: 'v3.28.0' }
    ]);
    expect(withRepo.get('github', 'codeql-action', 'init')?.name).toBe('codeql-action');
  });
});

describe('ActionIndex.resolve', () => {
  it('reports the latest version, SHA, and date for an unpinned reference', () => {
    const result = index.resolve('actions/checkout');

    expect(result).toMatchObject({
      found: true,
      owner: 'actions',
      name: 'checkout',
      latestVersion: 'v7.0.1',
      latestSha: SHA_CHECKOUT_LATEST,
      latestPublishedAt: '2026-07-20T15:10:05Z',
      requestedVersion: null,
      isLatest: null
    });
  });

  it('recommends a SHA-pinned uses value', () => {
    expect(index.resolve('actions/checkout').recommendedRef)
      .toBe(`actions/checkout@${SHA_CHECKOUT_LATEST} # v7.0.1`);
  });

  it('recommends a tag when no SHA is available', () => {
    expect(index.resolve('actions/setup-node').recommendedRef).toBe('actions/setup-node@v5.0.0');
  });

  it('marks an exact latest pin as up to date', () => {
    expect(index.resolve('actions/checkout@v7.0.1').isLatest).toBe(true);
  });

  it('marks an older pin as out of date', () => {
    const result = index.resolve('actions/checkout@v6.0.0');
    expect(result.isLatest).toBe(false);
    expect(result.latestVersion).toBe('v7.0.1');
  });

  it('treats a floating major pin inside the latest major as up to date', () => {
    expect(index.resolve('actions/checkout@v7').isLatest).toBe(true);
  });

  it('treats a floating major pin behind the latest major as out of date', () => {
    expect(index.resolve('actions/checkout@v6').isLatest).toBe(false);
  });

  it('resolves the SHA a floating major tag currently points at', () => {
    expect(index.resolve('actions/checkout@v6').requestedSha).toBe(SHA_CHECKOUT_V6);
  });

  it('names the version a pinned SHA corresponds to', () => {
    const result = index.resolve(`actions/checkout@${SHA_CHECKOUT_V6}`);
    expect(result.requestedVersionTag).toBe('v6');
    expect(result.isLatest).toBe(false);
  });

  it('recognises a pinned SHA that is the latest', () => {
    const result = index.resolve(`actions/checkout@${SHA_CHECKOUT_LATEST}`);
    expect(result.requestedVersionTag).toBe('v7.0.1');
    expect(result.isLatest).toBe(true);
  });

  it('resolves a short SHA pin by prefix', () => {
    const result = index.resolve(`actions/checkout@${SHA_CHECKOUT_LATEST.slice(0, 8)}`);
    expect(result.requestedVersionTag).toBe('v7.0.1');
    expect(result.isLatest).toBe(true);
  });

  it('says "unknown" rather than "outdated" for a SHA it cannot place', () => {
    const result = index.resolve('actions/checkout@feedfacefeedfacefeedfacefeedfacefeedface');
    expect(result.requestedVersionTag).toBeNull();
    expect(result.isLatest).toBeNull();
  });

  it('never echoes a caller-supplied SHA back as a resolved SHA', () => {
    expect(index.resolve('actions/checkout@feedfacefeedfacefeedfacefeedfacefeedface').requestedSha).toBeNull();
  });

  it('reports a null SHA instead of borrowing one from another version', () => {
    const result = index.resolve('actions/setup-node@v5.0.0');
    expect(result.latestSha).toBeNull();
    expect(result.requestedSha).toBeNull();
    expect(result.isLatest).toBe(true);
  });

  it('cannot compare a pin when the action has no versions at all', () => {
    const result = index.resolve('someone/no-releases@v1');
    expect(result.found).toBe(true);
    expect(result.latestVersion).toBeNull();
    expect(result.isLatest).toBeNull();
    expect(result.recommendedRef).toBeUndefined();
  });

  it('surfaces the archived flag', () => {
    expect(index.resolve('someone/abandoned-action').archived).toBe(true);
  });

  it('reports a reference that is not in the dataset as not found', () => {
    const result = index.resolve('nobody/nothing@v1');
    expect(result.found).toBe(false);
    expect(result.error).toMatch(/not in the marketplace dataset/);
    expect(result.requestedVersion).toBe('v1');
  });

  it('passes parse errors through', () => {
    expect(index.resolve('docker://alpine').error).toMatch(/Docker image references/);
    expect(index.resolve('').error).toMatch(/non-empty string/);
  });

  it('resolves a composite action and keeps the caller sub-path in the suggestion', () => {
    const result = index.resolve('github/codeql-action/analyze@v3');
    expect(result.found).toBe(true);
    expect(result.subPath).toBe('analyze');
    expect(result.recommendedRef).toBe(`github/codeql-action/analyze@${'a'.repeat(40)} # v3.28.0`);
  });

  it('resolves a batch in input order', () => {
    const results = index.resolveMany(['someone/no-releases', 'actions/checkout', 'bad']);
    expect(results.map((item) => item.input)).toEqual(['someone/no-releases', 'actions/checkout', 'bad']);
    expect(results.map((item) => item.found)).toEqual([true, true, false]);
  });
});

describe('ActionIndex.search', () => {
  it('requires every query token to match', () => {
    expect(index.search('actions checkout').map((item) => item.ref)).toEqual(['actions/checkout']);
    expect(index.search('actions nonexistent')).toEqual([]);
  });

  it('matches across owner and name in any order', () => {
    expect(index.search('checkout actions').map((item) => item.ref)).toEqual(['actions/checkout']);
  });

  it('ignores punctuation in the query and the data', () => {
    expect(index.search('setup-node').map((item) => item.ref)).toEqual(['actions/setup-node']);
    expect(index.search('setup_node').map((item) => item.ref)).toEqual(['actions/setup-node']);
  });

  it('orders results by dependent count', () => {
    expect(index.search('actions').map((item) => item.ref)).toEqual(['actions/checkout', 'actions/setup-node']);
  });

  it('excludes archived actions by default and includes them on request', () => {
    expect(index.search('abandoned')).toEqual([]);
    expect(index.search('abandoned', { includeArchived: true }).map((item) => item.ref))
      .toEqual(['someone/abandoned-action']);
  });

  it('filters by action type', () => {
    expect(index.search('', { actionType: 'Composite' }).map((item) => item.ref)).toEqual(['someone/no-releases']);
  });

  it('filters by owner', () => {
    expect(index.search('', { owner: 'GitHub' }).map((item) => item.ref)).toEqual(['github/codeql-action_analyze']);
  });

  it('filters to verified actions', () => {
    expect(index.search('', { verifiedOnly: true }).map((item) => item.ref)).toEqual(['actions/setup-node']);
  });

  it('returns everything when the query is empty', () => {
    // The archived entry is still excluded by default.
    expect(index.search('')).toHaveLength(SAMPLE_ROWS.length - 1);
  });

  it('applies and clamps the limit', () => {
    expect(index.search('', { limit: 2 })).toHaveLength(2);
    expect(index.search('', { limit: 0 })).toHaveLength(1);
    expect(index.search('', { limit: 1000 })).toHaveLength(SAMPLE_ROWS.length - 1);
  });

  it('includes a marketplace url for each result', () => {
    expect(index.search('checkout')[0].url).toBe('https://marketplace.devopsjournal.io/action/actions/checkout');
  });
});

describe('ActionIndex.stats', () => {
  const stats = index.stats();

  it('counts totals and facets', () => {
    expect(stats.total).toBe(5);
    expect(stats.verified).toBe(1);
    expect(stats.archived).toBe(1);
    expect(stats.withOssf).toBe(1);
  });

  it('counts version and SHA coverage separately', () => {
    expect(stats.withLatestVersion).toBe(4);
    expect(stats.withSha).toBe(3);
  });

  it('groups by action type, bucketing unknown types', () => {
    expect(stats.byType).toEqual({ Node: 3, Docker: 1, Composite: 1 });

    const withUnknown = indexOf([{ owner: 'o', name: 'n', actionType: null }]);
    expect(withUnknown.stats().byType).toEqual({ Unknown: 1 });
  });

  it('averages only the actions that have a score', () => {
    expect(stats.averageOssfScore).toBe(7.2);
  });

  it('reports a null average when nothing is scored', () => {
    expect(indexOf([{ owner: 'o', name: 'n' }]).stats().averageOssfScore).toBeNull();
  });

  it('returns the same object on repeat calls', () => {
    expect(index.stats()).toBe(stats);
  });
});

describe('tokenizeQuery', () => {
  it('splits on punctuation and drops empties', () => {
    expect(tokenizeQuery('  Setup--Node_20!! ')).toEqual(['setup', 'node', '20']);
  });

  it('returns an empty list for an empty query', () => {
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('ActionIndex misc', () => {
  it('exposes the snapshot provenance', () => {
    expect(index.generatedAt).toBe('2026-07-26T04:30:00.000Z');
    expect(index.schemaVersion).toBe(1);
    expect(index.size).toBe(5);
  });
});
