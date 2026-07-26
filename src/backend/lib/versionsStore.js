/**
 * Persistence for the action versions feed.
 *
 * The feed is a few megabytes of JSON, which does not fit in a Table Storage
 * entity (64 KB per property, 1 MB per entity), so it lives in Blob Storage on
 * the same storage account the Function App already uses. It is stored gzipped:
 * that is the form most requests are served in, and it keeps the
 * blob-to-function transfer small on every cold start.
 *
 * Shares the `snapshots` container with the overview snapshot in
 * `lib/snapshotStore.js` (different blob), and follows the same environment
 * variable conventions so both are configured the same way.
 */

const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DEFAULT_CONTAINER_NAME = 'snapshots';
const DEFAULT_BLOB_NAME = 'actions-versions.json.gz';

let cachedContainerClient;

function resolveContainerName() {
  return process.env.ACTIONS_SNAPSHOT_CONTAINER || DEFAULT_CONTAINER_NAME;
}

function resolveBlobName() {
  return process.env.ACTIONS_VERSIONS_BLOB || DEFAULT_BLOB_NAME;
}

function createContainerClient(options = {}) {
  if (options.containerClient) {
    return options.containerClient;
  }

  const containerName = options.containerName || resolveContainerName();
  const connectionString = process.env.ACTIONS_TABLE_CONNECTION || process.env.AzureWebJobsStorage;
  const endpoint = process.env.ACTIONS_BLOB_URL || process.env.ACTIONS_BLOB_ENDPOINT;

  let serviceClient;
  if (connectionString) {
    serviceClient = BlobServiceClient.fromConnectionString(connectionString);
  } else if (endpoint) {
    serviceClient = new BlobServiceClient(endpoint, options.credential || new DefaultAzureCredential());
  } else {
    throw new Error('Missing blob storage configuration. Set ACTIONS_TABLE_CONNECTION, AzureWebJobsStorage, or ACTIONS_BLOB_URL.');
  }

  return serviceClient.getContainerClient(containerName);
}

function getContainerClient() {
  if (!cachedContainerClient) {
    cachedContainerClient = createContainerClient();
  }
  return cachedContainerClient;
}

/**
 * Test seam: injects a container client (or resets to auto-detection with null).
 * @param {object|null} containerClient
 */
function setContainerClient(containerClient) {
  cachedContainerClient = containerClient || undefined;
}

/**
 * Hashes the uncompressed snapshot JSON.
 *
 * Used as the ETag so that a rebuild producing byte-identical content keeps the
 * same ETag and clients continue to get 304s. Hashing the gzip output instead
 * would be fragile: zlib is not guaranteed to be byte-stable across versions.
 *
 * @param {string} json
 * @returns {string}
 */
function hashPayload(json) {
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Formats a payload hash as a strong HTTP ETag.
 * @param {string} hash
 * @returns {string}
 */
function toEtag(hash) {
  return `"${hash}"`;
}

/**
 * Compares an If-None-Match header against the current ETag.
 *
 * Handles the comma-separated list form and the `*` wildcard, and tolerates the
 * weak-validator prefix that some proxies add.
 *
 * @param {string|undefined|null} headerValue
 * @param {string} etag
 * @returns {boolean} true when the client already has this exact snapshot
 */
function matchesEtag(headerValue, etag) {
  if (!headerValue || !etag) {
    return false;
  }

  const normalize = (value) => String(value).trim().replace(/^W\//, '');
  const target = normalize(etag);

  return String(headerValue)
    .split(',')
    .map(normalize)
    .some((candidate) => candidate === '*' || candidate === target);
}

/**
 * Serializes, compresses, and stores a snapshot envelope.
 *
 * @param {object} snapshot - envelope from buildSnapshot
 * @param {{ containerClient?: object }} [options]
 * @returns {Promise<{ etag: string, payloadHash: string, rawBytes: number, gzipBytes: number }>}
 */
async function writeVersions(snapshot, options = {}) {
  const containerClient = options.containerClient || getContainerClient();
  const json = JSON.stringify(snapshot);
  const payloadHash = hashPayload(json);
  const compressed = await gzip(Buffer.from(json, 'utf8'), { level: zlib.constants.Z_BEST_COMPRESSION });

  await containerClient.createIfNotExists();

  const blobClient = containerClient.getBlockBlobClient(resolveBlobName());
  await blobClient.upload(compressed, compressed.length, {
    blobHTTPHeaders: {
      blobContentType: 'application/json',
      blobContentEncoding: 'gzip'
    },
    metadata: {
      payloadhash: payloadHash,
      generatedat: String(snapshot.generatedAt || ''),
      count: String(snapshot.count ?? ''),
      schemaversion: String(snapshot.schemaVersion ?? ''),
      rawbytes: String(json.length)
    }
  });

  return {
    etag: toEtag(payloadHash),
    payloadHash,
    rawBytes: json.length,
    gzipBytes: compressed.length
  };
}

async function bufferFromStream(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Reads the stored snapshot.
 *
 * Returns the gzipped bytes plus the metadata needed to answer a conditional
 * request without decompressing anything.
 *
 * @param {{ containerClient?: object }} [options]
 * @returns {Promise<{ gzipped: Buffer, etag: string, payloadHash: string, generatedAt: string|null, count: number|null, schemaVersion: number|null, rawBytes: number|null }|null>}
 */
async function readVersions(options = {}) {
  const containerClient = options.containerClient || getContainerClient();
  const blobClient = containerClient.getBlockBlobClient(resolveBlobName());

  let response;
  try {
    response = await blobClient.download();
  } catch (error) {
    if (error && (error.statusCode === 404 || error.code === 'BlobNotFound' || error.code === 'ContainerNotFound')) {
      return null;
    }
    throw error;
  }

  const gzipped = await bufferFromStream(response.readableStreamBody);
  const metadata = response.metadata || {};
  const payloadHash = metadata.payloadhash || hashPayload((await gunzip(gzipped)).toString('utf8'));

  const count = Number(metadata.count);
  const schemaVersion = Number(metadata.schemaversion);
  const rawBytes = Number(metadata.rawbytes);

  return {
    gzipped,
    etag: toEtag(payloadHash),
    payloadHash,
    generatedAt: metadata.generatedat || null,
    count: Number.isFinite(count) ? count : null,
    schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : null,
    rawBytes: Number.isFinite(rawBytes) ? rawBytes : null
  };
}

/**
 * Decompresses stored snapshot bytes back to JSON text.
 * @param {Buffer} gzipped
 * @returns {Promise<string>}
 */
async function decompressVersions(gzipped) {
  const buffer = await gunzip(gzipped);
  return buffer.toString('utf8');
}

module.exports = {
  DEFAULT_CONTAINER_NAME,
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
};
