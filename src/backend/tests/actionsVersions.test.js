jest.mock('../lib/tableStorage', () => ({
  getTableClient: jest.fn()
}));

jest.mock('../lib/versionsStore', () => {
  const actual = jest.requireActual('../lib/versionsStore');
  return {
    ...actual,
    readVersions: jest.fn(),
    writeVersions: jest.fn()
  };
});

const zlib = require('zlib');
const { getTableClient } = require('../lib/tableStorage');
const { readVersions, writeVersions, hashPayload, toEtag } = require('../lib/versionsStore');
const actionsVersions = require('../ActionsVersions');

const sampleSnapshot = {
  schemaVersion: 1,
  generatedAt: '2026-07-26T04:30:00.000Z',
  count: 1,
  fields: ['owner', 'name'],
  actions: [['actions', 'checkout']]
};

const sampleJson = JSON.stringify(sampleSnapshot);
const sampleEtag = toEtag(hashPayload(sampleJson));

function storedSnapshot(overrides = {}) {
  return {
    gzipped: zlib.gzipSync(Buffer.from(sampleJson, 'utf8')),
    etag: sampleEtag,
    payloadHash: hashPayload(sampleJson),
    generatedAt: sampleSnapshot.generatedAt,
    count: sampleSnapshot.count,
    schemaVersion: sampleSnapshot.schemaVersion,
    rawBytes: sampleJson.length,
    ...overrides
  };
}

function createContext() {
  const logFn = jest.fn();
  logFn.info = jest.fn();
  logFn.warn = jest.fn();
  logFn.error = jest.fn();
  return { log: logFn, res: null };
}

function request(overrides = {}) {
  return { method: 'GET', headers: {}, query: {}, ...overrides };
}

describe('ActionsVersions function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_ORIGINS;
  });

  it('serves gzipped bytes when the client accepts gzip', async () => {
    readVersions.mockResolvedValue(storedSnapshot());
    const context = createContext();

    await actionsVersions(context, request({ headers: { 'accept-encoding': 'gzip, deflate, br' } }));

    expect(context.res.status).toBe(200);
    expect(context.res.isRaw).toBe(true);
    expect(context.res.headers['Content-Encoding']).toBe('gzip');
    expect(context.res.headers['Content-Type']).toBe('application/json');
    expect(context.res.headers.ETag).toBe(sampleEtag);
    expect(context.res.headers.Vary).toBe('Accept-Encoding');
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=3600');
    expect(context.res.headers['X-Versions-Count']).toBe(1);
    expect(context.res.headers['X-Versions-Generated-At']).toBe(sampleSnapshot.generatedAt);
    expect(context.res.headers['X-Versions-Schema-Version']).toBe(1);
    expect(JSON.parse(zlib.gunzipSync(context.res.body).toString('utf8'))).toEqual(sampleSnapshot);
  });

  it('decompresses for clients that do not accept gzip', async () => {
    readVersions.mockResolvedValue(storedSnapshot());
    const context = createContext();

    await actionsVersions(context, request());

    expect(context.res.status).toBe(200);
    expect(context.res.headers['Content-Encoding']).toBeUndefined();
    expect(JSON.parse(context.res.body)).toEqual(sampleSnapshot);
  });

  it('returns 304 with no body when the client already has this snapshot', async () => {
    readVersions.mockResolvedValue(storedSnapshot());
    const context = createContext();

    await actionsVersions(context, request({ headers: { 'if-none-match': sampleEtag } }));

    expect(context.res.status).toBe(304);
    expect(context.res.body).toBeUndefined();
    expect(context.res.headers.ETag).toBe(sampleEtag);
    expect(context.res.headers['Cache-Control']).toBe('public, max-age=3600');
  });

  it('serves the full snapshot when the client etag is stale', async () => {
    readVersions.mockResolvedValue(storedSnapshot());
    const context = createContext();

    await actionsVersions(context, request({ headers: { 'if-none-match': '"outdated"' } }));

    expect(context.res.status).toBe(200);
  });

  it('returns metadata only for meta=true', async () => {
    readVersions.mockResolvedValue(storedSnapshot());
    const context = createContext();

    await actionsVersions(context, request({ query: { meta: 'true' } }));

    expect(context.res.status).toBe(200);
    const body = JSON.parse(context.res.body);
    expect(body).toEqual({
      schemaVersion: 1,
      generatedAt: sampleSnapshot.generatedAt,
      count: 1,
      etag: sampleEtag,
      rawBytes: sampleJson.length,
      gzipBytes: expect.any(Number)
    });
  });

  it('answers HEAD with headers and no payload', async () => {
    readVersions.mockResolvedValue(storedSnapshot());
    const context = createContext();

    await actionsVersions(context, request({ method: 'HEAD' }));

    expect(context.res.status).toBe(200);
    expect(context.res.body).toBe('');
    expect(context.res.headers.ETag).toBe(sampleEtag);
  });

  it('builds and stores a snapshot on the first request', async () => {
    readVersions.mockResolvedValueOnce(null).mockResolvedValueOnce(storedSnapshot());
    writeVersions.mockResolvedValue({ etag: sampleEtag, payloadHash: 'h', rawBytes: 10, gzipBytes: 5 });
    getTableClient.mockReturnValue({
      async *listEntities() {
        yield { PayloadJson: JSON.stringify({ owner: 'actions', name: 'actions_checkout' }) };
      }
    });

    const context = createContext();
    await actionsVersions(context, request());

    expect(writeVersions).toHaveBeenCalledTimes(1);
    expect(writeVersions.mock.calls[0][0].count).toBe(1);
    expect(context.res.status).toBe(200);
  });

  it('returns a retryable 503 when the snapshot is still unavailable after building', async () => {
    readVersions.mockResolvedValue(null);
    writeVersions.mockResolvedValue({ etag: '"x"', payloadHash: 'x', rawBytes: 0, gzipBytes: 0 });
    getTableClient.mockReturnValue({
      async *listEntities() {}
    });

    const context = createContext();
    await actionsVersions(context, request());

    expect(context.res.status).toBe(503);
    expect(context.res.headers['Retry-After']).toBe('60');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
  });

  it('handles OPTIONS with 204', async () => {
    const context = createContext();

    await actionsVersions(context, request({ method: 'OPTIONS' }));

    expect(context.res.status).toBe(204);
    expect(context.res.headers.Allow).toBe('GET,HEAD,OPTIONS');
  });

  it('returns 405 for other methods', async () => {
    const context = createContext();

    await actionsVersions(context, request({ method: 'POST' }));

    expect(context.res.status).toBe(405);
    expect(context.res.body.error).toBe('Method not allowed.');
  });

  it('returns 500 without cache headers when storage fails', async () => {
    readVersions.mockRejectedValue(new Error('storage unavailable'));
    const context = createContext();

    await actionsVersions(context, request());

    expect(context.res.status).toBe(500);
    expect(context.res.body.error).toBe('Failed to serve the actions versions feed.');
    expect(context.res.headers['Cache-Control']).toBeUndefined();
    expect(context.log.error).toHaveBeenCalled();
  });

  it('omits metadata headers that the store could not supply', async () => {
    readVersions.mockResolvedValue(storedSnapshot({ generatedAt: null, count: null, schemaVersion: null }));
    const context = createContext();

    await actionsVersions(context, request());

    expect(context.res.headers['X-Versions-Generated-At']).toBeUndefined();
    expect(context.res.headers['X-Versions-Count']).toBeUndefined();
    expect(context.res.headers['X-Versions-Schema-Version']).toBeUndefined();
    expect(context.res.headers.ETag).toBe(sampleEtag);
  });
});
