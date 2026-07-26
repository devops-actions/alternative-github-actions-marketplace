jest.mock('../lib/snapshotStore', () => ({
  readSnapshot: jest.fn(),
  readSnapshotProperties: jest.fn()
}));

const { readSnapshot, readSnapshotProperties } = require('../lib/snapshotStore');
const actionsSnapshot = require('../ActionsSnapshot');

function createContext() {
  const logFn = jest.fn();
  logFn.info = jest.fn();
  logFn.warn = jest.fn();
  logFn.error = jest.fn();

  return { log: logFn, res: null };
}

const SNAPSHOT_JSON = JSON.stringify({
  version: 1,
  generatedAt: '2026-07-26T10:00:00Z',
  count: 1,
  items: [{ owner: 'actions', name: 'checkout' }]
});

function request(overrides = {}) {
  return { method: 'GET', headers: {}, query: {}, ...overrides };
}

describe('ActionsSnapshot function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    actionsSnapshot.resetCache();
  });

  it('serves the snapshot body with an ETag for revalidation', async () => {
    readSnapshot.mockResolvedValue({ json: SNAPSHOT_JSON, etag: '"v1"', lastModified: new Date() });

    const context = createContext();
    await actionsSnapshot(context, request());

    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe(SNAPSHOT_JSON);
    expect(context.res.headers.ETag).toBe('"v1"');
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=300');
  });

  it('returns 304 when the client already has the current snapshot', async () => {
    readSnapshot.mockResolvedValue({ json: SNAPSHOT_JSON, etag: '"v1"', lastModified: new Date() });

    const context = createContext();
    await actionsSnapshot(context, request({ headers: { 'if-none-match': '"v1"' } }));

    expect(context.res.status).toBe(304);
    expect(context.res.body).toBeUndefined();
  });

  it('sends the body when the client holds a stale ETag', async () => {
    readSnapshot.mockResolvedValue({ json: SNAPSHOT_JSON, etag: '"v2"', lastModified: new Date() });

    const context = createContext();
    await actionsSnapshot(context, request({ headers: { 'if-none-match': '"v1"' } }));

    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe(SNAPSHOT_JSON);
  });

  it('returns 503 rather than falling back to a slow table scan when no snapshot exists', async () => {
    readSnapshot.mockResolvedValue(null);

    const context = createContext();
    await actionsSnapshot(context, request());

    expect(context.res.status).toBe(503);
    expect(context.res.headers['Retry-After']).toBe('60');
  });

  it('reuses the in-process copy when the blob ETag is unchanged', async () => {
    readSnapshot.mockResolvedValue({ json: SNAPSHOT_JSON, etag: '"v1"', lastModified: new Date() });
    await actionsSnapshot(createContext(), request());
    expect(readSnapshot).toHaveBeenCalledTimes(1);

    readSnapshotProperties.mockResolvedValue({ etag: '"v1"', lastModified: new Date() });

    const context = createContext();
    await actionsSnapshot(context, request());

    // Second request revalidated via metadata only — no second download.
    expect(readSnapshot).toHaveBeenCalledTimes(1);
    expect(readSnapshotProperties).toHaveBeenCalledTimes(1);
    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe(SNAPSHOT_JSON);
  });

  it('re-downloads when the blob ETag has changed', async () => {
    readSnapshot.mockResolvedValue({ json: SNAPSHOT_JSON, etag: '"v1"', lastModified: new Date() });
    await actionsSnapshot(createContext(), request());

    const refreshed = JSON.stringify({ version: 1, count: 2, items: [] });
    readSnapshotProperties.mockResolvedValue({ etag: '"v2"', lastModified: new Date() });
    readSnapshot.mockResolvedValue({ json: refreshed, etag: '"v2"', lastModified: new Date() });

    const context = createContext();
    await actionsSnapshot(context, request());

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(context.res.body).toBe(refreshed);
    expect(context.res.headers.ETag).toBe('"v2"');
  });

  it('falls back to a full read when revalidation itself fails', async () => {
    readSnapshot.mockResolvedValue({ json: SNAPSHOT_JSON, etag: '"v1"', lastModified: new Date() });
    await actionsSnapshot(createContext(), request());

    readSnapshotProperties.mockRejectedValue(new Error('metadata call failed'));

    const context = createContext();
    await actionsSnapshot(context, request());

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(context.res.status).toBe(200);
  });

  it('answers preflight without touching storage', async () => {
    const context = createContext();
    await actionsSnapshot(context, request({ method: 'OPTIONS' }));

    expect(context.res.status).toBe(204);
    expect(readSnapshot).not.toHaveBeenCalled();
  });

  it('rejects non-GET methods', async () => {
    const context = createContext();
    await actionsSnapshot(context, request({ method: 'POST' }));

    expect(context.res.status).toBe(405);
  });

  it('returns 500 when the blob read fails outright', async () => {
    readSnapshot.mockRejectedValue(new Error('storage unavailable'));

    const context = createContext();
    await actionsSnapshot(context, request());

    expect(context.res.status).toBe(500);
    expect(context.log.error).toHaveBeenCalled();
  });
});
