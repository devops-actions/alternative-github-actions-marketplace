const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

// Blob storage holding the precomputed actions snapshot. Table Storage cannot
// serve a 35k-row projection in one read, so the snapshot is built once by the
// pipeline (see SnapshotRefresh) and parked here as a single blob.
const CONTAINER_NAME = process.env.ACTIONS_SNAPSHOT_CONTAINER || 'snapshots';
const BLOB_NAME = process.env.ACTIONS_SNAPSHOT_BLOB || 'actions-summary.json';

const storageConnection = process.env.ACTIONS_TABLE_CONNECTION || process.env.AzureWebJobsStorage;
const blobEndpoint = process.env.ACTIONS_BLOB_URL || process.env.ACTIONS_BLOB_ENDPOINT;

function createBlobServiceClient(options = {}) {
  const connectionString = Object.prototype.hasOwnProperty.call(options, 'connectionString')
    ? options.connectionString
    : storageConnection;

  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString);
  }

  const endpoint = Object.prototype.hasOwnProperty.call(options, 'blobEndpoint')
    ? options.blobEndpoint
    : blobEndpoint;

  if (!endpoint) {
    throw new Error('Missing blob endpoint. Configure ACTIONS_BLOB_URL or provide a connection string.');
  }

  const credential = options.credential || new DefaultAzureCredential();
  return new BlobServiceClient(endpoint, credential);
}

let cachedBlobClient;
let cachedContainerClient;

function getSnapshotContainerClient() {
  if (!cachedContainerClient) {
    cachedContainerClient = createBlobServiceClient().getContainerClient(CONTAINER_NAME);
  }
  return cachedContainerClient;
}

function getSnapshotBlobClient() {
  if (!cachedBlobClient) {
    cachedBlobClient = getSnapshotContainerClient().getBlockBlobClient(BLOB_NAME);
  }
  return cachedBlobClient;
}

// Test seam, mirroring setTableClient in lib/tableStorage. Pass a container
// client too when the test exercises writeSnapshot's create-on-first-use path.
function setSnapshotBlobClient(blobClient, containerClient) {
  cachedBlobClient = blobClient;
  cachedContainerClient = containerClient;
}

async function streamToString(readable) {
  if (!readable) {
    return null;
  }

  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads the snapshot blob.
 *
 * @returns {Promise<{ json: string, etag: string, lastModified: Date }|null>}
 *   null when no snapshot has been built yet.
 */
async function readSnapshot(blobClient = getSnapshotBlobClient()) {
  try {
    const response = await blobClient.download();
    const json = await streamToString(response.readableStreamBody);
    if (!json) {
      return null;
    }
    return {
      json,
      etag: response.etag,
      lastModified: response.lastModified
    };
  } catch (error) {
    if (error && (error.statusCode === 404 || error.code === 'BlobNotFound' || error.code === 'ContainerNotFound')) {
      return null;
    }
    throw error;
  }
}

/**
 * Reads only the snapshot's metadata (ETag / Last-Modified) without
 * transferring the body. Used to revalidate the in-process cache cheaply.
 *
 * @returns {Promise<{ etag: string, lastModified: Date }|null>}
 */
async function readSnapshotProperties(blobClient = getSnapshotBlobClient()) {
  try {
    const properties = await blobClient.getProperties();
    return { etag: properties.etag, lastModified: properties.lastModified };
  } catch (error) {
    if (error && (error.statusCode === 404 || error.code === 'BlobNotFound' || error.code === 'ContainerNotFound')) {
      return null;
    }
    throw error;
  }
}

/**
 * Overwrites the snapshot blob. Creates the container on first use so a fresh
 * environment does not need a manual provisioning step.
 */
async function writeSnapshot(json, blobClient = getSnapshotBlobClient()) {
  // Create on first use so a fresh environment does not need the container
  // provisioned out of band. Left private — the snapshot is only ever read
  // back through the API, never served directly from storage.
  const containerClient = getSnapshotContainerClient();
  if (containerClient && typeof containerClient.createIfNotExists === 'function') {
    await containerClient.createIfNotExists();
  }

  const body = Buffer.from(json, 'utf8');
  const response = await blobClient.upload(body, body.length, {
    blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' }
  });

  return { etag: response.etag, bytes: body.length };
}

module.exports = {
  CONTAINER_NAME,
  BLOB_NAME,
  createBlobServiceClient,
  getSnapshotBlobClient,
  getSnapshotContainerClient,
  setSnapshotBlobClient,
  readSnapshot,
  readSnapshotProperties,
  writeSnapshot
};
