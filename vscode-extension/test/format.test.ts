import { describe, expect, it } from 'vitest';

import {
  formatActionDetail,
  formatNoDataset,
  formatResolutions,
  formatSearchResults,
  formatStats,
  type DatasetProvenance
} from '../src/tools/format';
import { indexOf, SAMPLE_ROWS, SHA_CHECKOUT_LATEST, SHA_CHECKOUT_V6 } from './helpers';

const index = indexOf(SAMPLE_ROWS);
const provenance: DatasetProvenance = {
  generatedAt: '2026-07-26T04:30:00.000Z',
  age: '8 hours ago',
  count: 5
};

describe('formatNoDataset', () => {
  it('tells the model not to guess', () => {
    const text = formatNoDataset('network unreachable');
    expect(text).toContain('Do not guess action versions');
    expect(text).toContain('network unreachable');
    expect(text).toContain('Refresh Dataset Now');
  });

  it('omits the reason line when there is none', () => {
    expect(formatNoDataset(null)).not.toContain('Reason:');
  });
});

describe('formatResolutions', () => {
  it('reports the dataset provenance so staleness is visible', () => {
    const text = formatResolutions(index.resolveMany(['actions/checkout']), provenance);
    expect(text).toContain('generated 2026-07-26T04:30:00.000Z (8 hours ago)');
    expect(text).toContain('can lag the upstream repositories');
  });

  it('includes the latest version, SHA, and publish date', () => {
    const text = formatResolutions(index.resolveMany(['actions/checkout']), provenance);
    expect(text).toContain('latest version: v7.0.1');
    expect(text).toContain(`latest commit SHA: ${SHA_CHECKOUT_LATEST}`);
    expect(text).toContain('latest published: 2026-07-20T15:10:05Z');
  });

  it('spells out that a missing SHA is unknown and must not be substituted', () => {
    const text = formatResolutions(index.resolveMany(['actions/setup-node']), provenance);
    expect(text).toContain('latest commit SHA: UNKNOWN');
    expect(text).toContain('do not substitute another SHA');
  });

  it('states when a pin is current', () => {
    expect(formatResolutions(index.resolveMany(['actions/checkout@v7.0.1']), provenance))
      .toContain('up to date: yes');
  });

  it('states the newer version when a pin is stale', () => {
    const text = formatResolutions(index.resolveMany(['actions/checkout@v6']), provenance);
    expect(text).toContain('up to date: no - newer version available (v7.0.1)');
    expect(text).toContain('are behind the latest version: actions/checkout (v6 -> v7.0.1)');
  });

  it('says "unknown" rather than implying a verdict for an unplaceable SHA', () => {
    const text = formatResolutions(index.resolveMany(['actions/checkout@feedfacefeedfacefeedfacefeedfacefeedface']), provenance);
    expect(text).toContain('up to date: unknown');
  });

  it('names the tag a pinned SHA resolves to', () => {
    expect(formatResolutions(index.resolveMany([`actions/checkout@${SHA_CHECKOUT_V6}`]), provenance))
      .toContain('pinned SHA resolves to: v6');
  });

  it('warns about archived repositories in the row and the summary', () => {
    const text = formatResolutions(index.resolveMany(['someone/abandoned-action']), provenance);
    expect(text).toContain('the repository is ARCHIVED');
    expect(text).toContain('point at archived repositories: someone/abandoned-action');
  });

  it('tells the model not to invent a version for an unknown action', () => {
    const text = formatResolutions(index.resolveMany(['nobody/nothing']), provenance);
    expect(text).toContain('NOT FOUND');
    expect(text).toContain('Do not invent a version');
  });

  it('counts how many references resolved', () => {
    expect(formatResolutions(index.resolveMany(['actions/checkout', 'nobody/nothing']), provenance))
      .toContain('Resolved 1 of 2 action reference(s).');
  });

  it('offers a ready-to-paste pinned reference', () => {
    expect(formatResolutions(index.resolveMany(['actions/checkout']), provenance))
      .toContain(`recommended uses value: actions/checkout@${SHA_CHECKOUT_LATEST} # v7.0.1`);
  });

  it('says a version is unpublished rather than leaving it blank', () => {
    expect(formatResolutions(index.resolveMany(['someone/no-releases']), provenance))
      .toContain('latest version: none published');
  });

  it('omits the advisory block when nothing is wrong', () => {
    const text = formatResolutions(index.resolveMany(['actions/checkout@v7.0.1']), provenance);
    expect(text).not.toContain('are behind the latest version');
    expect(text).not.toContain('archived repositories');
  });
});

describe('formatSearchResults', () => {
  it('lists matches with their versions and SHAs', () => {
    const text = formatSearchResults('actions', index.search('actions'), provenance);
    expect(text).toContain('2 action(s) matching "actions"');
    expect(text).toContain('- actions/checkout');
    expect(text).toContain(`latest commit SHA: ${SHA_CHECKOUT_LATEST}`);
    expect(text).toContain('dependents: 15,368,157');
  });

  it('flags archived and verified results', () => {
    expect(formatSearchResults('abandoned', index.search('abandoned', { includeArchived: true }), provenance))
      .toContain('warning: ARCHIVED');
    expect(formatSearchResults('setup', index.search('setup'), provenance)).toContain('verified: yes');
  });

  it('tells the model not to invent an action when nothing matches', () => {
    const text = formatSearchResults('zzz', [], provenance);
    expect(text).toContain('No actions match "zzz"');
    expect(text).toContain('Do not invent an action');
  });

  it('reports an unscored action as unscored rather than zero', () => {
    expect(formatSearchResults('codeql', index.search('codeql'), provenance)).toContain('OpenSSF score: not scored');
  });
});

describe('formatStats', () => {
  const text = formatStats(index.stats(), provenance);

  it('reports totals and facets', () => {
    expect(text).toContain('total actions: 5');
    expect(text).toContain('verified: 1');
    expect(text).toContain('archived: 1');
  });

  it('reports SHA coverage as a share of versioned actions', () => {
    expect(text).toContain('with a resolvable commit SHA: 3 (75% of actions that have a version)');
  });

  it('explains why the rest cannot be SHA-pinned', () => {
    expect(text).toContain('store version tags without commit SHAs upstream');
  });

  it('lists action types most common first', () => {
    expect(text.indexOf('Node: 3')).toBeLessThan(text.indexOf('Docker: 1'));
  });

  it('handles a dataset with no scores', () => {
    expect(formatStats(indexOf([{ owner: 'o', name: 'n' }]).stats(), provenance))
      .toContain('average OpenSSF score: not available');
  });
});

describe('formatActionDetail', () => {
  const detail = {
    owner: 'actions',
    name: 'checkout',
    actionType: { actionType: 'Node', fileFound: 'action.yml', nodeVersion: '24' },
    repoInfo: {
      archived: false,
      disabled: false,
      latest_release_published_at: '2026-07-20T15:10:05Z',
      updated_at: '2026-07-25T02:47:35Z'
    },
    dependents: { dependents: '15,368,157' },
    verified: false,
    ossfScore: 6.9,
    dependabotEnabled: true,
    secretScanningEnabled: true,
    vulnerabilityStatus: { critical: 0, high: 2 },
    releaseInfo: [{ tag_name: 'v7.0.1' }, { tag_name: 'v7.0.0' }],
    tagInfo: [{ tag: 'v7.0.1', sha: SHA_CHECKOUT_LATEST }, { tag: 'v7', sha: SHA_CHECKOUT_LATEST }, 'v6.0.0']
  };

  it('renders the maintenance signals', () => {
    const text = formatActionDetail('actions/checkout', detail, provenance, 'api');
    expect(text).toContain('action type: Node');
    expect(text).toContain('node version: 24');
    expect(text).toContain('archived: no');
    expect(text).toContain('dependents: 15,368,157');
    expect(text).toContain('OpenSSF score: 6.9');
  });

  // Decision Records/requirements.md: vulnerability and security posture details
  // are not surfaced to users, and a tool result is a user-facing surface.
  it('withholds vulnerability and security posture details', () => {
    const text = formatActionDetail('actions/checkout', detail, provenance, 'api');
    expect(text).not.toMatch(/vulnerab/i);
    expect(text).not.toMatch(/dependabot/i);
    expect(text).not.toMatch(/secret scanning/i);
    expect(text).not.toContain('critical');
  });

  it('lists releases newest first and tags with their SHAs', () => {
    const text = formatActionDetail('actions/checkout', detail, provenance, 'api');
    expect(text).toContain('published releases (newest first): v7.0.1, v7.0.0');
    expect(text).toContain(`v7.0.1: ${SHA_CHECKOUT_LATEST}`);
  });

  it('marks a tag with no SHA as unknown', () => {
    expect(formatActionDetail('actions/checkout', detail, provenance, 'api'))
      .toContain('v6.0.0: UNKNOWN - do not substitute another SHA');
  });

  it('says when the answer came from the cache instead of the api', () => {
    expect(formatActionDetail('actions/checkout', detail, provenance, 'cache'))
      .toContain('from the locally cached dataset; the API was unreachable');
  });

  it('reports unknown values instead of blanks for a sparse payload', () => {
    const text = formatActionDetail('o/n', { owner: 'o', name: 'n' }, provenance, 'api');
    expect(text).toContain('action type: unknown');
    expect(text).toContain('node version: n/a');
    expect(text).toContain('latest release published: unknown');
    expect(text).toContain('No releases or tags are recorded');
  });

  it('reads the snake_case openssf score variant', () => {
    expect(formatActionDetail('o/n', { openssf_score: 4.2 }, provenance, 'api'))
      .toContain('OpenSSF score: 4.2');
  });
});
