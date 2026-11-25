const { Readable } = require('stream');
const { ActionRecord } = require('../lib/actionRecord');
const { prepareActionEntity, readActionPayload } = require('../lib/actionPayloadStore');
const { setSnapshotBlobClient } = require('../lib/snapshotStore');
const { setTableClient } = require('../lib/tableStorage');
const { FakeTableClient } = require('../integration/support/fakeTableClient');
const { ActionsMarketplaceClient } = require('../client');
const actionsUpsert = require('../ActionsUpsert');
const actionsGet = require('../ActionsGet');
const actionsList = require('../ActionsList');
const { buildSnapshotDocument } = require('../lib/buildSnapshot');
const { buildVersionsFeed } = require('../lib/versionsBuilder');
const { computeStats } = require('../lib/computeStats');
const { toActionSummary } = require('../lib/actionSummary');

function context(owner = 'example', name = 'action') {
  return {
    bindingData: { owner, name },
    log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() })
  };
}

function payload() {
  return {
    owner: 'example',
    name: 'action',
    verified: true,
    actionType: { actionType: 'Node' },
    repoInfo: { updated_at: '2026-11-25T00:00:00Z' },
    releaseInfo: [{ tag_name: 'v1.0.0', published_at: '2026-11-25T00:00:00Z' }],
    versionShaMap: { 'v1.0.0': 'a'.repeat(40) },
    immutableReleaseObservations: Array.from({ length: 500 }, (_, i) => ({
      tag: `v1.0.${i}`,
      sha: 'a'.repeat(40),
      observedAt: '2026-11-25T00:00:00Z'
    }))
  };
}

describe('Lossless oversized action persistence', () => {
  let blobs;
  let container;
  let table;

  beforeEach(() => {
    blobs = new Map();
    container = {
      createIfNotExists: jest.fn().mockResolvedValue({}),
      getBlockBlobClient: jest.fn((name) => ({
        upload: jest.fn(async (body, length, options) => {
          expect(length).toBe(body.length);
          expect(options.conditions).toEqual({ ifNoneMatch: '*' });
          if (blobs.has(name)) {
            throw Object.assign(new Error('Already exists'), { code: 'BlobAlreadyExists', statusCode: 409 });
          }
          blobs.set(name, Buffer.from(body));
        }),
        download: jest.fn(async () => {
          if (!blobs.has(name)) {
            throw Object.assign(new Error('Missing payload blob'), { code: 'BlobNotFound', statusCode: 404 });
          }
          return { readableStreamBody: Readable.from([blobs.get(name)]) };
        })
      }))
    };
    setSnapshotBlobClient(null, container);
    table = new FakeTableClient();
    table.listEntities = async function* () {
      yield* this.store.values();
    };
    setTableClient(table);
  });

  afterEach(() => {
    setSnapshotBlobClient(null, null);
    setTableClient(null);
    jest.restoreAllMocks();
  });

  it.each([32768, 32769])('uses the UTF-16 boundary at %i code units', async (size) => {
    const base = { owner: 'example', name: 'action', description: '' };
    const remaining = size - ActionRecord.fromRequest(base).canonicalJson.length;
    base.description = '\u{1f680}'.repeat(Math.floor(remaining / 2)) + (remaining % 2 ? 'x' : '');
    const record = ActionRecord.fromRequest(base);
    expect(record.canonicalJson.length).toBe(size);
    const entity = await prepareActionEntity(record);
    if (size === 32768) {
      expect(entity.PayloadJson).toBe(record.canonicalJson);
      expect(blobs.size).toBe(0);
    } else {
      expect(entity.PayloadJson).toBeUndefined();
      expect(entity.PayloadBlobName).toBe(`payloads/${record.hash}.json`);
      expect(() => record.toEntity()).toThrow('Oversized action');
      expect(() => ActionRecord.fromEntity(entity)).toThrow('fromStoredEntity');
    }
    expect((await ActionRecord.fromStoredEntity(entity)).canonicalJson).toBe(record.canonicalJson);
  });

  it('round-trips complete history through POST, GET, list, snapshots, versions and stats', async () => {
    const input = payload();
    const record = ActionRecord.fromRequest(input);
    expect(record.canonicalJson.length).toBeGreaterThan(32768);
    const create = context();
    await actionsUpsert(create, { method: 'POST', body: input });
    expect(create.res.status).toBe(201);
    const entity = await table.getEntity('example', 'action');
    expect(entity.PayloadJson).toBeUndefined();
    expect(entity.PayloadHash).toBe(record.hash);
    expect(await readActionPayload(entity)).toEqual(input);

    const unchanged = context();
    await actionsUpsert(unchanged, { method: 'POST', body: input });
    expect(unchanged.res.body.updated).toBe(false);
    expect(blobs.size).toBe(1);

    const get = context();
    await actionsGet(get, { method: 'GET', query: {} });
    expect(get.res.status).toBe(200);
    expect(get.res.body.immutableReleaseObservations).toEqual(input.immutableReleaseObservations);
    for (const query of [{}, { limit: '1' }]) {
      const list = context();
      await actionsList(list, { method: 'GET', query });
      expect(list.res.status).toBe(200);
      const items = Array.isArray(list.res.body) ? list.res.body : list.res.body.items;
      expect(items[0].immutableReleaseObservations).toEqual(input.immutableReleaseObservations);
    }
    const snapshot = await buildSnapshotDocument(table);
    expect(snapshot.document.items).toEqual([toActionSummary(input)]);
    const feed = await buildVersionsFeed(table);
    expect(feed.count).toBe(1);
    expect(feed.actions[0].slice(0, 4)).toEqual(['example', 'action', 'v1.0.0', 'a'.repeat(40)]);
    expect((await computeStats(table)).total).toBe(1);

    const inline = context();
    await actionsUpsert(inline, { method: 'POST', body: { owner: 'example', name: 'action' } });
    expect(inline.res.status).toBe(200);
    expect((await table.getEntity('example', 'action')).PayloadBlobName).toBeUndefined();
    expect(blobs.size).toBe(1);
  });

  it('supports direct Table clients and payloads beyond the Table entity size limit', async () => {
    const input = { ...payload(), description: 'x'.repeat(1100000) };
    const client = new ActionsMarketplaceClient({ containerClient: container, tableEndpoint: 'https://example.table.core.windows.net' });
    client.tableClient = table;
    expect((await client.upsertAction(input)).created).toBe(true);
    const rows = await client.listActions();
    expect(rows[0].description).toBe(input.description);
    expect(rows[0].immutableReleaseObservations).toEqual(input.immutableReleaseObservations);
    expect((await client.upsertAction(input)).updated).toBe(false);
  });

  it('retains old blobs and reuses the prepared payload after a conditional Table conflict', async () => {
    const original = ActionRecord.fromRequest(payload());
    await table.createEntity(await prepareActionEntity(original));
    const update = jest.spyOn(table, 'updateEntity');
    update.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { statusCode: 412 }));
    const changed = {
      ...payload(),
      immutableReleaseObservations: [
        ...payload().immutableReleaseObservations,
        { tag: 'v2.0.0', sha: 'b'.repeat(40), observedAt: '2026-11-26T00:00:00Z' }
      ]
    };
    const result = context();
    await actionsUpsert(result, { method: 'POST', body: changed });
    expect(result.res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(2);
    expect(blobs.size).toBe(2);
    expect(await readActionPayload(await table.getEntity('example', 'action'))).toEqual(changed);
    expect(await readActionPayload({ PayloadBlobName: `payloads/${original.hash}.json`, PayloadHash: original.hash })).toEqual(payload());
  });

  it('does not commit a Table pointer when blob upload fails', async () => {
    container.getBlockBlobClient.mockReturnValue({
      upload: jest.fn().mockRejectedValue(new Error('Blob storage unavailable'))
    });
    const create = jest.spyOn(table, 'createEntity');
    const result = context();
    await actionsUpsert(result, { method: 'POST', body: payload() });
    expect(result.res.status).toBe(500);
    expect(result.res.body.errorCode).toBe('PERSISTENCE_FAILED');
    expect(create).not.toHaveBeenCalled();
  });

  it('hydrates both unpaged and paged production Table iterators', async () => {
    const input = payload();
    const entity = await prepareActionEntity(ActionRecord.fromRequest(input));
    setTableClient({
      listEntities: () => ({
        async *[Symbol.asyncIterator]() { yield entity; },
        byPage: () => (async function* () { yield [entity]; })()
      })
    });
    for (const query of [{ owner: 'example' }, { owner: 'example', limit: '1' }]) {
      const list = context();
      await actionsList(list, { method: 'GET', query });
      expect(list.res.status).toBe(200);
      const items = Array.isArray(list.res.body) ? list.res.body : list.res.body.items;
      expect(items[0].immutableReleaseObservations).toEqual(input.immutableReleaseObservations);
    }
  });

  it('commits the prepared blob after a concurrent create conflict', async () => {
    const create = jest.spyOn(table, 'createEntity');
    const concurrent = ActionRecord.fromRequest({ owner: 'example', name: 'action' }).toEntity();
    create.mockImplementationOnce(async () => {
      table.store.set(table._key('example', 'action'), { ...concurrent, etag: 'W/"1"' });
      throw Object.assign(new Error('Concurrent create'), { statusCode: 409 });
    });
    const result = context();
    await actionsUpsert(result, { method: 'POST', body: payload() });
    expect(result.res.status).toBe(200);
    expect(result.res.body.created).toBe(false);
    expect(blobs.size).toBe(1);
    expect(await readActionPayload(await table.getEntity('example', 'action'))).toEqual(payload());
  });

  it('keeps unreferenced blobs after failed Table writes and verifies them on retry', async () => {
    const create = jest.spyOn(table, 'createEntity');
    create.mockRejectedValueOnce(new Error('Table unavailable'));
    const failed = context();
    await actionsUpsert(failed, { method: 'POST', body: payload() });
    expect(failed.res.status).toBe(500);
    expect(blobs.size).toBe(1);
    const retry = context();
    await actionsUpsert(retry, { method: 'POST', body: payload() });
    expect(retry.res.status).toBe(201);
    expect(blobs.size).toBe(1);
  });

  it.each(['missing', 'corrupt'])('fails reads/feeds explicitly when a referenced blob is %s', async (failure) => {
    const entity = await prepareActionEntity(ActionRecord.fromRequest(payload()));
    await table.createEntity(entity);
    if (failure === 'missing') blobs.clear();
    else blobs.set(entity.PayloadBlobName, Buffer.from('{}'));
    await expect(ActionRecord.fromStoredEntity(entity)).rejects.toThrow();
    await expect(buildSnapshotDocument(table)).rejects.toThrow();
    await expect(buildVersionsFeed(table)).rejects.toThrow();
    await expect(computeStats(table)).rejects.toThrow();
    const get = context();
    await actionsGet(get, { method: 'GET', query: {} });
    expect(get.res.status).toBe(500);
    const list = context();
    await actionsList(list, { method: 'GET', query: {} });
    expect(list.res.status).toBe(500);
    const client = new ActionsMarketplaceClient({ containerClient: container, tableEndpoint: 'https://example.table.core.windows.net' });
    client.tableClient = table;
    await expect(client.listActions()).rejects.toThrow();
  });

  it('rejects corrupt existing blobs rather than committing a pointer', async () => {
    const record = ActionRecord.fromRequest(payload());
    blobs.set(`payloads/${record.hash}.json`, Buffer.from('{}'));
    await expect(prepareActionEntity(record)).rejects.toThrow('hash does not match');
    expect(table.store.size).toBe(0);
  });
});
