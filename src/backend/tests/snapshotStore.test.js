const {
  readSnapshot,
  readSnapshotProperties,
  writeSnapshot,
  setSnapshotBlobClient
} = require('../lib/snapshotStore');

function notFound(code = 'BlobNotFound') {
  const err = new Error(code);
  err.statusCode = 404;
  err.code = code;
  return err;
}

function fakeBlobClient(overrides = {}) {
  return {
    download: jest.fn(),
    getProperties: jest.fn(),
    upload: jest.fn(async () => ({ etag: '"w1"' })),
    ...overrides
  };
}

function fakeContainerClient() {
  return { createIfNotExists: jest.fn(async () => ({ succeeded: true })) };
}

async function* stringStream(value) {
  yield Buffer.from(value, 'utf8');
}

afterEach(() => {
  setSnapshotBlobClient(undefined, undefined);
  jest.clearAllMocks();
});

describe('readSnapshot', () => {
  it('returns the body with its ETag and last-modified stamp', async () => {
    const blobClient = fakeBlobClient({
      download: jest.fn(async () => ({
        readableStreamBody: stringStream('{"count":1}'),
        etag: '"v1"',
        lastModified: new Date('2026-07-26T10:00:00Z')
      }))
    });

    const result = await readSnapshot(blobClient);

    expect(result.json).toBe('{"count":1}');
    expect(result.etag).toBe('"v1"');
  });

  it('returns null when the blob has never been written', async () => {
    const blobClient = fakeBlobClient({ download: jest.fn(async () => { throw notFound(); }) });
    await expect(readSnapshot(blobClient)).resolves.toBeNull();
  });

  it('returns null when the container itself is missing', async () => {
    const blobClient = fakeBlobClient({
      download: jest.fn(async () => { throw notFound('ContainerNotFound'); })
    });
    await expect(readSnapshot(blobClient)).resolves.toBeNull();
  });

  it('rethrows real failures rather than masking them as an empty snapshot', async () => {
    const blobClient = fakeBlobClient({
      download: jest.fn(async () => {
        const err = new Error('AuthorizationFailure');
        err.statusCode = 403;
        throw err;
      })
    });

    await expect(readSnapshot(blobClient)).rejects.toThrow('AuthorizationFailure');
  });
});

describe('readSnapshotProperties', () => {
  it('reads metadata without downloading the body', async () => {
    const blobClient = fakeBlobClient({
      getProperties: jest.fn(async () => ({ etag: '"v1"', lastModified: new Date() }))
    });

    const result = await readSnapshotProperties(blobClient);

    expect(result.etag).toBe('"v1"');
    expect(blobClient.download).not.toHaveBeenCalled();
  });

  it('returns null when there is no snapshot yet', async () => {
    const blobClient = fakeBlobClient({ getProperties: jest.fn(async () => { throw notFound(); }) });
    await expect(readSnapshotProperties(blobClient)).resolves.toBeNull();
  });
});

describe('writeSnapshot', () => {
  it('creates the container before uploading so a fresh environment works unattended', async () => {
    // Regression: this used to look for a `containerClient` property on the
    // blob client, which BlockBlobClient does not expose — so the container was
    // never created and the first write failed with ContainerNotFound.
    const blobClient = fakeBlobClient();
    const containerClient = fakeContainerClient();
    setSnapshotBlobClient(blobClient, containerClient);

    await writeSnapshot('{"count":0}', blobClient);

    expect(containerClient.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(blobClient.upload).toHaveBeenCalledTimes(1);
  });

  it('uploads the exact bytes and reports the size written', async () => {
    const blobClient = fakeBlobClient();
    setSnapshotBlobClient(blobClient, fakeContainerClient());

    const json = '{"count":2,"items":[]}';
    const result = await writeSnapshot(json, blobClient);

    const [body, length] = blobClient.upload.mock.calls[0];
    expect(body.toString('utf8')).toBe(json);
    expect(length).toBe(Buffer.byteLength(json));
    expect(result.bytes).toBe(Buffer.byteLength(json));
  });

  it('tags the blob as JSON', async () => {
    const blobClient = fakeBlobClient();
    setSnapshotBlobClient(blobClient, fakeContainerClient());

    await writeSnapshot('{}', blobClient);

    const options = blobClient.upload.mock.calls[0][2];
    expect(options.blobHTTPHeaders.blobContentType).toBe('application/json; charset=utf-8');
  });
});
