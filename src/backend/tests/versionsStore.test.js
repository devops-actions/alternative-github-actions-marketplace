const zlib = require('zlib');

const {
  DEFAULT_BLOB_NAME,
  resolveBlobName,
  createContainerClient,
  getContainerClient,
  setContainerClient,
  hashPayload,
  toEtag,
  matchesEtag,
  writeVersions,
  readVersions,
  decompressVersions
} = require('../lib/versionsStore');

function streamFrom(buffer) {
  return (async function* generate() {
    yield buffer;
  })();
}

function createFakeContainerClient({ blob = null, downloadError = null } = {}) {
  const state = { blob, created: false, uploads: [] };

  return {
    state,
    async createIfNotExists() {
      state.created = true;
      return { succeeded: true };
    },
    getBlockBlobClient() {
      return {
        async upload(body, length, options) {
          state.uploads.push({ body, length, options });
          state.blob = { body, metadata: options.metadata };
        },
        async download() {
          if (downloadError) {
            throw downloadError;
          }
          if (!state.blob) {
            const error = new Error('BlobNotFound');
            error.statusCode = 404;
            throw error;
          }
          return {
            readableStreamBody: streamFrom(state.blob.body),
            metadata: state.blob.metadata
          };
        }
      };
    }
  };
}

const sampleSnapshot = {
  schemaVersion: 1,
  generatedAt: '2026-07-26T04:30:00.000Z',
  count: 2,
  fields: ['owner', 'name'],
  actions: [['actions', 'checkout'], ['actions', 'setup-node']]
};

describe('hashPayload / toEtag', () => {
  it('is stable for identical content', () => {
    expect(hashPayload('{"a":1}')).toBe(hashPayload('{"a":1}'));
  });

  it('changes when content changes', () => {
    expect(hashPayload('{"a":1}')).not.toBe(hashPayload('{"a":2}'));
  });

  it('wraps a hash as a strong etag', () => {
    expect(toEtag('abc')).toBe('"abc"');
  });
});

describe('matchesEtag', () => {
  it('matches an identical etag', () => {
    expect(matchesEtag('"abc"', '"abc"')).toBe(true);
  });

  it('matches inside a comma separated list', () => {
    expect(matchesEtag('"other", "abc"', '"abc"')).toBe(true);
  });

  it('tolerates the weak validator prefix', () => {
    expect(matchesEtag('W/"abc"', '"abc"')).toBe(true);
  });

  it('matches the wildcard', () => {
    expect(matchesEtag('*', '"abc"')).toBe(true);
  });

  it('does not match a different etag', () => {
    expect(matchesEtag('"xyz"', '"abc"')).toBe(false);
  });

  it('returns false for missing values', () => {
    expect(matchesEtag(null, '"abc"')).toBe(false);
    expect(matchesEtag('"abc"', '')).toBe(false);
  });
});

describe('writeVersions', () => {
  it('stores gzipped json with metadata and content headers', async () => {
    const containerClient = createFakeContainerClient();

    const result = await writeVersions(sampleSnapshot, { containerClient });

    expect(containerClient.state.created).toBe(true);
    const upload = containerClient.state.uploads[0];
    expect(upload.options.blobHTTPHeaders).toEqual({
      blobContentType: 'application/json',
      blobContentEncoding: 'gzip'
    });
    expect(upload.options.metadata.generatedat).toBe('2026-07-26T04:30:00.000Z');
    expect(upload.options.metadata.count).toBe('2');
    expect(upload.options.metadata.schemaversion).toBe('1');

    const json = JSON.stringify(sampleSnapshot);
    expect(result.payloadHash).toBe(hashPayload(json));
    expect(result.etag).toBe(toEtag(hashPayload(json)));
    expect(result.rawBytes).toBe(json.length);
    expect(result.gzipBytes).toBe(upload.length);
    expect(zlib.gunzipSync(upload.body).toString('utf8')).toBe(json);
  });

  it('produces the same etag when rebuilt from identical data', async () => {
    const first = await writeVersions(sampleSnapshot, { containerClient: createFakeContainerClient() });
    const second = await writeVersions(sampleSnapshot, { containerClient: createFakeContainerClient() });
    expect(second.etag).toBe(first.etag);
  });
});

describe('readVersions', () => {
  it('round-trips a written snapshot', async () => {
    const containerClient = createFakeContainerClient();
    await writeVersions(sampleSnapshot, { containerClient });

    const stored = await readVersions({ containerClient });

    expect(stored.count).toBe(2);
    expect(stored.schemaVersion).toBe(1);
    expect(stored.generatedAt).toBe('2026-07-26T04:30:00.000Z');
    expect(stored.etag).toBe(toEtag(hashPayload(JSON.stringify(sampleSnapshot))));
    expect(JSON.parse(await decompressVersions(stored.gzipped))).toEqual(sampleSnapshot);
  });

  it('returns null when no snapshot has been stored yet', async () => {
    expect(await readVersions({ containerClient: createFakeContainerClient() })).toBeNull();
  });

  it('returns null when the container does not exist', async () => {
    const error = new Error('ContainerNotFound');
    error.code = 'ContainerNotFound';
    const containerClient = createFakeContainerClient({ downloadError: error });
    expect(await readVersions({ containerClient })).toBeNull();
  });

  it('rethrows unexpected download failures', async () => {
    const containerClient = createFakeContainerClient({ downloadError: new Error('connection reset') });
    await expect(readVersions({ containerClient })).rejects.toThrow('connection reset');
  });

  it('recomputes the hash when blob metadata is missing it', async () => {
    const json = JSON.stringify(sampleSnapshot);
    const containerClient = createFakeContainerClient({
      blob: { body: zlib.gzipSync(Buffer.from(json, 'utf8')), metadata: {} }
    });

    const stored = await readVersions({ containerClient });

    expect(stored.etag).toBe(toEtag(hashPayload(json)));
    expect(stored.count).toBeNull();
    expect(stored.schemaVersion).toBeNull();
    expect(stored.generatedAt).toBeNull();
  });
});

describe('container client configuration', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    setContainerClient(null);
  });

  it('throws a configuration error when nothing is configured', () => {
    delete process.env.ACTIONS_TABLE_CONNECTION;
    delete process.env.AzureWebJobsStorage;
    delete process.env.ACTIONS_BLOB_URL;
    delete process.env.ACTIONS_BLOB_ENDPOINT;

    expect(() => createContainerClient()).toThrow(/Missing blob storage configuration/);
  });

  it('returns an injected client as-is', () => {
    const fake = createFakeContainerClient();
    expect(createContainerClient({ containerClient: fake })).toBe(fake);
  });

  it('builds a client from a connection string and honours the container name override', () => {
    process.env.ACTIONS_TABLE_CONNECTION = 'UseDevelopmentStorage=true';
    process.env.ACTIONS_SNAPSHOT_CONTAINER = 'custom-snapshots';

    const client = createContainerClient();

    expect(client.containerName).toBe('custom-snapshots');
  });

  it('builds a credential based client from an endpoint url', () => {
    delete process.env.ACTIONS_TABLE_CONNECTION;
    delete process.env.AzureWebJobsStorage;
    delete process.env.ACTIONS_SNAPSHOT_CONTAINER;
    process.env.ACTIONS_BLOB_URL = 'https://example.blob.core.windows.net';

    const client = createContainerClient({ credential: { getToken: async () => ({ token: 't', expiresOnTimestamp: 0 }) } });

    expect(client.containerName).toBe('snapshots');
  });

  it('caches the resolved client and lets tests replace it', () => {
    process.env.ACTIONS_TABLE_CONNECTION = 'UseDevelopmentStorage=true';

    const first = getContainerClient();
    expect(getContainerClient()).toBe(first);

    const fake = createFakeContainerClient();
    setContainerClient(fake);
    expect(getContainerClient()).toBe(fake);
  });

  it('exposes a stable blob name', () => {
    expect(DEFAULT_BLOB_NAME).toBe('actions-versions.json.gz');
  });

  // The overview snapshot from lib/snapshotStore.js shares this container, so a
  // clashing default blob name would have one feed silently overwrite the other.
  it('does not collide with the overview snapshot blob', () => {
    const { BLOB_NAME: overviewBlobName } = require('../lib/snapshotStore');
    expect(resolveBlobName()).not.toBe(overviewBlobName);
  });

  it('honours a blob name override', () => {
    process.env.ACTIONS_VERSIONS_BLOB = 'custom-versions.json.gz';
    expect(resolveBlobName()).toBe('custom-versions.json.gz');
  });
});
