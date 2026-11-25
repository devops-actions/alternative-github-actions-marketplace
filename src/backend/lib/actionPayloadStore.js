const crypto = require('crypto');
const { createBlobServiceClient, getSnapshotContainerClient } = require('./snapshotStore');

const MAX_INLINE_CODE_UNITS = 32768;

function getPayloadContainerClient(options = {}) {
  if (options.containerClient) return options.containerClient;
  if (Object.keys(options).length === 0) return getSnapshotContainerClient();
  return createBlobServiceClient(options).getContainerClient(
    options.payloadContainerName || process.env.ACTIONS_SNAPSHOT_CONTAINER || 'snapshots'
  );
}

async function prepareActionEntity(record, options = {}) {
  if (record.canonicalJson.length <= MAX_INLINE_CODE_UNITS) {
    return record.toEntity();
  }

  const container = getPayloadContainerClient(options);
  await container.createIfNotExists();
  const blobName = `payloads/${record.hash}.json`;
  const body = Buffer.from(record.canonicalJson, 'utf8');
  try {
    await container.getBlockBlobClient(blobName).upload(body, body.length, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' }
    });
  } catch (error) {
    if (error.code !== 'BlobAlreadyExists' && error.code !== 'ConditionNotMet') {
      throw error;
    }
    // Verify an existing immutable blob before committing another reference.
    await readActionPayload({ PayloadBlobName: blobName, PayloadHash: record.hash }, options);
  }
  return record.toEntity(new Date(), { payloadBlobName: blobName });
}

async function readActionPayload(entity, options = {}) {
  if (!entity) return null;
  if (!entity.PayloadBlobName) {
    return typeof entity.PayloadJson === 'string'
      ? JSON.parse(entity.PayloadJson)
      : (entity.PayloadJson || null);
  }
  if (!/^[a-f0-9]{64}$/.test(entity.PayloadHash)
    || entity.PayloadBlobName !== `payloads/${entity.PayloadHash}.json`) {
    throw new Error('Stored action payload blob reference is invalid.');
  }

  const blob = getPayloadContainerClient(options).getBlockBlobClient(entity.PayloadBlobName);
  const response = await blob.download();
  if (!response.readableStreamBody) {
    throw new Error('Stored action payload blob has no body.');
  }
  const chunks = [];
  for await (const chunk of response.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  if (hash !== entity.PayloadHash) {
    throw new Error('Stored action payload blob hash does not match.');
  }
  const payload = JSON.parse(body.toString('utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Stored action payload blob is not a JSON object.');
  }
  return payload;
}

module.exports = { MAX_INLINE_CODE_UNITS, prepareActionEntity, readActionPayload };
