const {
  VERSIONS_FIELDS,
  VERSIONS_SCHEMA_VERSION,
  FLAG_VERIFIED,
  FLAG_ARCHIVED,
  FLAG_OSSF,
  FLAG_DISABLED,
  buildVersionsFeed,
  buildRow,
  buildTagShaMap,
  collectFloatingTags,
  normalizeVersionEntry,
  normalizeDescription,
  parseDependents,
  resolveLatestVersion,
  stripOwnerPrefix
} = require('../lib/versionsBuilder');

const FIELD = VERSIONS_FIELDS.reduce((acc, name, index) => ({ ...acc, [name]: index }), {});

function createFakeTableClient(entities) {
  return {
    async *listEntities() {
      for (const entity of entities) {
        yield entity;
      }
    }
  };
}

function entity(payload) {
  return { PayloadJson: JSON.stringify(payload) };
}

describe('normalizeVersionEntry', () => {
  it('returns plain strings trimmed', () => {
    expect(normalizeVersionEntry('  v1.2.3  ')).toBe('v1.2.3');
  });

  it('reads tag_name from release objects', () => {
    expect(normalizeVersionEntry({ tag_name: 'v7.0.1', target_commitish: 'main' })).toBe('v7.0.1');
  });

  it('reads tag from tag objects', () => {
    expect(normalizeVersionEntry({ sha: 'abc', tag: 'v3' })).toBe('v3');
  });

  it('returns null for unusable entries', () => {
    expect(normalizeVersionEntry(null)).toBeNull();
    expect(normalizeVersionEntry('   ')).toBeNull();
    expect(normalizeVersionEntry(42)).toBeNull();
    expect(normalizeVersionEntry({ target_commitish: 'main' })).toBeNull();
  });
});

describe('stripOwnerPrefix', () => {
  it('removes the {owner}_ prefix the pipeline adds', () => {
    expect(stripOwnerPrefix('actions', 'actions_checkout')).toBe('checkout');
  });

  it('matches the prefix case-insensitively but preserves the remainder', () => {
    expect(stripOwnerPrefix('010DevX101', '010devx101_Setup-Seal')).toBe('Setup-Seal');
  });

  it('leaves names without the prefix untouched', () => {
    expect(stripOwnerPrefix('actions', 'checkout')).toBe('checkout');
  });

  it('keeps composite sub-paths encoded', () => {
    expect(stripOwnerPrefix('github', 'github_codeql-action_analyze')).toBe('codeql-action_analyze');
  });

  it('tolerates non-string input', () => {
    expect(stripOwnerPrefix('actions', undefined)).toBe('');
    expect(stripOwnerPrefix(undefined, 'checkout')).toBe('checkout');
  });
});

describe('buildTagShaMap', () => {
  it('maps tags to lowercased shas', () => {
    const map = buildTagShaMap([
      { sha: 'AAAAAAA111111111111111111111111111111111', tag: 'v1' },
      { sha: 'bbbbbbb2222222222222222222222222222222222', tag: 'v2' }
    ]);
    expect(map.get('v1')).toBe('aaaaaaa111111111111111111111111111111111');
  });

  it('ignores string tags, which carry no sha at all', () => {
    expect(buildTagShaMap(['v1', 'v2']).size).toBe(0);
  });

  it('ignores values that are not shas', () => {
    const map = buildTagShaMap([{ sha: 'not-a-sha', tag: 'v1' }]);
    expect(map.size).toBe(0);
  });

  it('keeps the first sha when a tag repeats', () => {
    const map = buildTagShaMap([
      { sha: '1111111111111111111111111111111111111111', tag: 'v1' },
      { sha: '2222222222222222222222222222222222222222', tag: 'v1' }
    ]);
    expect(map.get('v1')).toBe('1111111111111111111111111111111111111111');
  });

  it('tolerates missing or non-array input', () => {
    expect(buildTagShaMap(undefined).size).toBe(0);
    expect(buildTagShaMap({ sha: '1111111111111111111111111111111111111111', tag: 'v1' }).get('v1')).toBeDefined();
  });

  // Decision Records/version-sha-map.md defines versionShaMap as the agreed
  // shape; production currently carries {sha, tag} objects instead.
  it('reads the versionShaMap shape from the decision record', () => {
    const map = buildTagShaMap([], {
      'v1.0.0': 'a'.repeat(40),
      'v1.1.0': 'b'.repeat(40)
    });
    expect(map.get('v1.0.0')).toBe('a'.repeat(40));
    expect(map.get('v1.1.0')).toBe('b'.repeat(40));
  });

  it('prefers versionShaMap over a conflicting tagInfo entry', () => {
    const map = buildTagShaMap(
      [{ tag: 'v1', sha: 'c'.repeat(40) }],
      { v1: 'a'.repeat(40) }
    );
    expect(map.get('v1')).toBe('a'.repeat(40));
  });

  it('merges both sources when they cover different tags', () => {
    const map = buildTagShaMap(
      [{ tag: 'v2', sha: 'c'.repeat(40) }],
      { v1: 'a'.repeat(40) }
    );
    expect([...map.keys()].sort()).toEqual(['v1', 'v2']);
  });

  it('ignores invalid shas in versionShaMap', () => {
    expect(buildTagShaMap([], { v1: 'nope', v2: null }).size).toBe(0);
  });

  it('ignores a versionShaMap that is not a plain object', () => {
    expect(buildTagShaMap([], ['v1', 'a'.repeat(40)]).size).toBe(0);
    expect(buildTagShaMap([], 'nope').size).toBe(0);
  });
});

describe('collectFloatingTags', () => {
  it('keeps major and major.minor tags only', () => {
    const map = new Map([
      ['v4', 'a'.repeat(40)],
      ['v4.1', 'b'.repeat(40)],
      ['v4.1.2', 'c'.repeat(40)],
      ['latest', 'd'.repeat(40)]
    ]);
    expect(collectFloatingTags(map).map(([tag]) => tag)).toEqual(['v4', 'v4.1']);
  });

  it('accepts tags without the v prefix', () => {
    expect(collectFloatingTags(new Map([['3', 'a'.repeat(40)]]))).toEqual([['3', 'a'.repeat(40)]]);
  });
});

describe('resolveLatestVersion', () => {
  it('prefers the first release when releases exist', () => {
    const result = resolveLatestVersion({
      releaseInfo: [{ tag_name: 'v7.0.1' }, { tag_name: 'v7.0.0' }],
      tagInfo: [{ tag: 'v6', sha: 'a'.repeat(40) }]
    });
    expect(result).toEqual({ version: 'v7.0.1', source: 'release' });
  });

  it('falls back to the first tag when there are no releases', () => {
    const result = resolveLatestVersion({ releaseInfo: [], tagInfo: ['v1.1.1', 'v1.1.0'] });
    expect(result).toEqual({ version: 'v1.1.1', source: 'tag' });
  });

  it('reports nothing when neither is populated', () => {
    expect(resolveLatestVersion({})).toEqual({ version: null, source: null });
  });

  it('tolerates non-array release/tag values', () => {
    expect(resolveLatestVersion({ releaseInfo: { tag_name: 'v2' } })).toEqual({ version: 'v2', source: 'release' });
  });
});

describe('parseDependents', () => {
  it('strips thousands separators', () => {
    expect(parseDependents('15,368,157')).toBe(15368157);
  });

  it('drops a trailing plus', () => {
    expect(parseDependents('999+')).toBe(999);
  });

  it('passes numbers through', () => {
    expect(parseDependents(42)).toBe(42);
  });

  it('returns null for unusable values', () => {
    expect(parseDependents(undefined)).toBeNull();
    expect(parseDependents('n/a')).toBeNull();
    expect(parseDependents(Number.NaN)).toBeNull();
  });
});

describe('buildRow', () => {
  const fullPayload = {
    owner: 'actions',
    name: 'actions_checkout',
    releaseInfo: [{ tag_name: 'v7.0.1', target_commitish: 'main' }],
    tagInfo: [
      { sha: '3d3c42e5aac5ba805825da76410c181273ba90b1', tag: 'v7.0.1' },
      { sha: '3d3c42e5aac5ba805825da76410c181273ba90b1', tag: 'v7' },
      { sha: 'd23441a48e516b6c34aea4fa41551a30e30af803', tag: 'v6' }
    ],
    repoInfo: {
      latest_release_published_at: '2026-07-20T15:10:05Z',
      updated_at: '2026-07-25T02:47:35Z',
      archived: false,
      disabled: false
    },
    actionType: { actionType: 'Node' },
    ossfScore: 6.9,
    dependents: { dependents: '15,368,157' },
    verified: false
  };

  it('projects the latest version, sha, and date', () => {
    const row = buildRow(fullPayload);
    expect(row[FIELD.owner]).toBe('actions');
    expect(row[FIELD.name]).toBe('checkout');
    expect(row[FIELD.latestVersion]).toBe('v7.0.1');
    expect(row[FIELD.latestSha]).toBe('3d3c42e5aac5ba805825da76410c181273ba90b1');
    expect(row[FIELD.publishedAt]).toBe('2026-07-20T15:10:05Z');
    expect(row[FIELD.actionType]).toBe('Node');
    expect(row[FIELD.dependents]).toBe(15368157);
    expect(row[FIELD.ossfScore]).toBe(6.9);
  });

  it('includes floating tags with their shas', () => {
    expect(buildRow(fullPayload)[FIELD.floatingTags]).toEqual([
      ['v7', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
      ['v6', 'd23441a48e516b6c34aea4fa41551a30e30af803']
    ]);
  });

  it('uses 0 instead of an empty array when there are no floating tags', () => {
    const row = buildRow({ ...fullPayload, tagInfo: ['v7.0.1'] });
    expect(row[FIELD.floatingTags]).toBe(0);
  });

  it('reports a null sha rather than guessing when the dataset has none', () => {
    const row = buildRow({ ...fullPayload, tagInfo: ['v7.0.1', 'v7'] });
    expect(row[FIELD.latestVersion]).toBe('v7.0.1');
    expect(row[FIELD.latestSha]).toBeNull();
  });

  it('resolves the sha from versionShaMap when tagInfo has no shas', () => {
    const row = buildRow({
      ...fullPayload,
      tagInfo: ['v7.0.1', 'v7'],
      versionShaMap: { 'v7.0.1': 'f'.repeat(40), v7: 'f'.repeat(40) }
    });
    expect(row[FIELD.latestSha]).toBe('f'.repeat(40));
    expect(row[FIELD.floatingTags]).toEqual([['v7', 'f'.repeat(40)]]);
  });

  it('does not borrow a sha from a different version', () => {
    const row = buildRow({
      ...fullPayload,
      releaseInfo: [{ tag_name: 'v8.0.0' }]
    });
    expect(row[FIELD.latestVersion]).toBe('v8.0.0');
    expect(row[FIELD.latestSha]).toBeNull();
  });

  it('encodes verified, archived, ossf, and disabled as flag bits', () => {
    const row = buildRow({
      ...fullPayload,
      verified: true,
      repoInfo: { ...fullPayload.repoInfo, archived: true, disabled: true }
    });
    expect(row[FIELD.flags]).toBe(FLAG_VERIFIED | FLAG_ARCHIVED | FLAG_OSSF | FLAG_DISABLED);
  });

  it('treats a string "true" verified value as verified', () => {
    expect(buildRow({ ...fullPayload, verified: 'true' })[FIELD.flags] & FLAG_VERIFIED).toBe(FLAG_VERIFIED);
  });

  it('sets the ossf flag from the boolean when no score is present', () => {
    const row = buildRow({ ...fullPayload, ossfScore: undefined, ossf: true });
    expect(row[FIELD.ossfScore]).toBeNull();
    expect(row[FIELD.flags] & FLAG_OSSF).toBe(FLAG_OSSF);
  });

  it('reads the snake_case openssf_score variant', () => {
    expect(buildRow({ ...fullPayload, ossfScore: undefined, openssf_score: 7.5 })[FIELD.ossfScore]).toBe(7.5);
  });

  it('parses a stringified ossf score', () => {
    expect(buildRow({ ...fullPayload, ossfScore: '4.25' })[FIELD.ossfScore]).toBe(4.25);
  });

  it('returns null for payloads without an owner or name', () => {
    expect(buildRow({ name: 'checkout' })).toBeNull();
    expect(buildRow({ owner: 'actions' })).toBeNull();
    expect(buildRow(null)).toBeNull();
    expect(buildRow('nope')).toBeNull();
  });

  it('handles a payload with no version data at all', () => {
    const row = buildRow({ owner: 'someone', name: 'someone_thing' });
    expect(row[FIELD.latestVersion]).toBeNull();
    expect(row[FIELD.latestSha]).toBeNull();
    expect(row[FIELD.publishedAt]).toBeNull();
    expect(row[FIELD.actionType]).toBeNull();
    expect(row[FIELD.dependents]).toBeNull();
    expect(row[FIELD.flags]).toBe(0);
  });

  it('projects the description, trimmed', () => {
    const row = buildRow({ ...fullPayload, description: '  Checkout a Git repository  ' });
    expect(row[FIELD.description]).toBe('Checkout a Git repository');
  });

  it('reports a null description when the pipeline has not sent one', () => {
    // This is the common case today: the ingest pipeline doesn't populate
    // description yet, so every row reports null - "unknown", not "none".
    expect(buildRow(fullPayload)[FIELD.description]).toBeNull();
  });
});

describe('normalizeDescription', () => {
  it('trims whitespace', () => {
    expect(normalizeDescription('  Lint your Dockerfiles  ')).toBe('Lint your Dockerfiles');
  });

  it('treats blank or non-string values as null', () => {
    expect(normalizeDescription('   ')).toBeNull();
    expect(normalizeDescription(undefined)).toBeNull();
    expect(normalizeDescription(null)).toBeNull();
    expect(normalizeDescription(42)).toBeNull();
  });

  it('truncates to 200 characters with an ellipsis', () => {
    const result = normalizeDescription('x'.repeat(250));
    expect(result).toHaveLength(200);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves a description at exactly the limit untouched', () => {
    const exact = 'x'.repeat(200);
    expect(normalizeDescription(exact)).toBe(exact);
  });
});

describe('buildVersionsFeed', () => {
  it('builds an envelope describing its own shape', async () => {
    const client = createFakeTableClient([
      entity({ owner: 'actions', name: 'actions_checkout', releaseInfo: [{ tag_name: 'v4' }] })
    ]);

    const snapshot = await buildVersionsFeed(client, { now: new Date('2026-07-26T04:30:00Z') });

    expect(snapshot.schemaVersion).toBe(VERSIONS_SCHEMA_VERSION);
    expect(snapshot.generatedAt).toBe('2026-07-26T04:30:00.000Z');
    expect(snapshot.fields).toEqual(VERSIONS_FIELDS);
    expect(snapshot.flags).toEqual({ verified: 1, archived: 2, ossf: 4, disabled: 8 });
    expect(snapshot.count).toBe(1);
    expect(snapshot.actions).toHaveLength(1);
  });

  it('sorts rows by owner then name so identical data yields an identical payload', async () => {
    const client = createFakeTableClient([
      entity({ owner: 'zed', name: 'zed_alpha' }),
      entity({ owner: 'Actions', name: 'Actions_setup-node' }),
      entity({ owner: 'actions', name: 'actions_checkout' })
    ]);

    const snapshot = await buildVersionsFeed(client);

    expect(snapshot.actions.map((row) => `${row[0]}/${row[1]}`)).toEqual([
      'actions/checkout',
      'Actions/setup-node',
      'zed/alpha'
    ]);
  });

  it('counts unusable entities as skipped instead of failing', async () => {
    const client = createFakeTableClient([
      { PayloadJson: 'not json' },
      entity({ owner: 'actions', name: 'actions_checkout' }),
      entity({ name: 'no-owner' }),
      {}
    ]);

    const snapshot = await buildVersionsFeed(client);

    expect(snapshot.count).toBe(1);
    expect(snapshot.skipped).toBe(3);
  });

  it('accepts entities whose payload is already an object', async () => {
    const client = createFakeTableClient([
      { PayloadJson: { owner: 'actions', name: 'actions_checkout' } }
    ]);

    const snapshot = await buildVersionsFeed(client);
    expect(snapshot.count).toBe(1);
  });

  it('returns an empty envelope for an empty table', async () => {
    const snapshot = await buildVersionsFeed(createFakeTableClient([]));
    expect(snapshot.count).toBe(0);
    expect(snapshot.actions).toEqual([]);
  });
});
