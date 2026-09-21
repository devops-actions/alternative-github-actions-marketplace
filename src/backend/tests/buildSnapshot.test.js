jest.mock('../lib/snapshotStore', () => ({
  writeSnapshot: jest.fn(async (json) => ({ etag: '"w1"', bytes: Buffer.byteLength(json) }))
}));

const { writeSnapshot } = require('../lib/snapshotStore');
const { buildSnapshotDocument, refreshSnapshot, SNAPSHOT_VERSION } = require('../lib/buildSnapshot');

function entity(partitionKey, payload, extra = {}) {
  return { partitionKey, rowKey: payload.name, PayloadJson: JSON.stringify(payload), ...extra };
}

function fakeTableClient(entities) {
  return {
    async *listEntities() {
      for (const e of entities) {
        yield e;
      }
    }
  };
}

const alpha = { owner: 'alpha', name: 'one', repoInfo: { updated_at: '2026-01-01T00:00:00Z' } };
const beta = { owner: 'beta', name: 'two', repoInfo: { updated_at: '2026-07-01T00:00:00Z' } };
const gamma = { owner: 'gamma', name: 'three', repoInfo: { updated_at: '2026-04-01T00:00:00Z' } };

describe('buildSnapshotDocument', () => {
  it('projects every action entity into the document', async () => {
    const client = fakeTableClient([entity('alpha', alpha), entity('beta', beta)]);

    const { document } = await buildSnapshotDocument(client);

    expect(document.version).toBe(SNAPSHOT_VERSION);
    expect(document.count).toBe(2);
    expect(document.items).toHaveLength(2);
    expect(typeof document.generatedAt).toBe('string');
  });

  it('sorts newest-first so a client taking a prefix gets the most relevant actions', async () => {
    // Deliberately supplied in PartitionKey order, which is what the table
    // scan returns and what made the old 50-row preview show stale actions.
    const client = fakeTableClient([entity('alpha', alpha), entity('beta', beta), entity('gamma', gamma)]);

    const { document } = await buildSnapshotDocument(client);

    expect(document.items.map(i => i.owner)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts actions with no updated_at last rather than dropping them', async () => {
    const undated = { owner: 'delta', name: 'four' };
    const client = fakeTableClient([entity('delta', undated), entity('beta', beta)]);

    const { document } = await buildSnapshotDocument(client);

    expect(document.items.map(i => i.owner)).toEqual(['beta', 'delta']);
    expect(document.count).toBe(2);
  });

  it('excludes the stats cache row, which shares the table but is not an action', async () => {
    const client = fakeTableClient([
      entity('alpha', alpha),
      { partitionKey: 'statsCache', rowKey: 'aggregate', CacheJson: JSON.stringify({ stats: { total: 1 } }) }
    ]);

    const { document, skipped } = await buildSnapshotDocument(client);

    expect(document.count).toBe(1);
    expect(document.items[0].owner).toBe('alpha');
    // Skipping bookkeeping is not a data problem, so it must not be reported
    // as a skipped (malformed) record.
    expect(skipped).toBe(0);
  });

  it('counts unparsable payloads as skipped instead of failing the build', async () => {
    const client = fakeTableClient([
      entity('alpha', alpha),
      { partitionKey: 'bad', rowKey: 'x', PayloadJson: '{ not json' }
    ]);

    const { document, skipped } = await buildSnapshotDocument(client);

    expect(document.count).toBe(1);
    expect(skipped).toBe(1);
  });

  it('counts payloads without owner/name as skipped', async () => {
    const client = fakeTableClient([
      entity('alpha', alpha),
      { partitionKey: 'x', rowKey: 'y', PayloadJson: JSON.stringify({ repoInfo: {} }) }
    ]);

    const { document, skipped } = await buildSnapshotDocument(client);

    expect(document.count).toBe(1);
    expect(skipped).toBe(1);
  });

  it('produces an empty document for an empty table rather than throwing', async () => {
    const { document, stats, skipped } = await buildSnapshotDocument(fakeTableClient([]));

    expect(document.count).toBe(0);
    expect(document.items).toEqual([]);
    expect(skipped).toBe(0);
    expect(stats).toEqual({ total: 0, byType: {}, verified: 0, archived: 0, withOssf: 0 });
  });

  it('aggregates stats from the same pass so they cannot disagree with the snapshot', async () => {
    const client = fakeTableClient([
      entity('a', { owner: 'a', name: '1', actionType: { actionType: 'Node' }, verified: true, openssf_score: 7 }),
      entity('b', { owner: 'b', name: '2', actionType: { actionType: 'Docker' }, repoInfo: { archived: true } }),
      entity('c', { owner: 'c', name: '3', actionType: { actionType: 'Node' }, ossf: true })
    ]);

    const { document, stats } = await buildSnapshotDocument(client);

    expect(stats.total).toBe(document.count);
    expect(stats).toEqual({
      total: 3,
      byType: { Node: 2, Docker: 1 },
      verified: 1,
      archived: 1,
      withOssf: 2
    });
  });

  it('excludes skipped records from the stats totals as well as the snapshot', async () => {
    const client = fakeTableClient([
      entity('a', alpha),
      { partitionKey: 'bad', rowKey: 'x', PayloadJson: '{ not json' },
      { partitionKey: 'statsCache', rowKey: 'aggregate', CacheJson: '{}' }
    ]);

    const { document, stats } = await buildSnapshotDocument(client);

    expect(stats.total).toBe(1);
    expect(stats.total).toBe(document.count);
  });
});

describe('refreshSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the serialised document and reports what it wrote', async () => {
    const client = fakeTableClient([entity('alpha', alpha), entity('beta', beta)]);

    const result = await refreshSnapshot(client);

    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeSnapshot.mock.calls[0][0]);
    expect(written.count).toBe(2);
    expect(written.items).toHaveLength(2);

    expect(result.count).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.bytes).toBeGreaterThan(0);
    expect(typeof result.durationMs).toBe('number');
  });

  it('propagates a write failure so the caller can report it', async () => {
    writeSnapshot.mockRejectedValueOnce(new Error('storage unavailable'));
    const client = fakeTableClient([entity('alpha', alpha)]);

    await expect(refreshSnapshot(client)).rejects.toThrow('storage unavailable');
  });
});
