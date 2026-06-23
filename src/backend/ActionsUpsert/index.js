const { ActionRecord } = require('../lib/actionRecord');
const { getTableClient, getActionEntity } = require('../lib/tableStorage');
const { ErrorCodes, createErrorResponse, extractErrorDetails, logErrorDetails } = require('../lib/errorResponse');
const { withCorsHeaders } = require('../lib/cors');
const { patchCache } = require('../lib/statsCache');

async function fetchExisting(tableClient, partitionKey, rowKey) {
  return getActionEntity(partitionKey, rowKey, { tableClient });
}

async function persistActionRecord(tableClient, actionRecord, existing, retryCount = 0) {
  const MAX_RETRIES = 3;

  if (retryCount > MAX_RETRIES) {
    const err = new Error(`Exceeded maximum retries (${MAX_RETRIES}) persisting action record.`);
    err.code = 'MAX_RETRIES_EXCEEDED';
    throw err;
  }

  const backoffMs = retryCount > 0 ? 100 * Math.pow(2, retryCount - 1) : 0;
  if (backoffMs > 0) {
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  }

  const entity = actionRecord.toEntity();

  if (!existing) {
    try {
      await tableClient.createEntity(entity);
      return { updated: true, created: true, lastSyncedUtc: entity.LastSyncedUtc };
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error;
      }
      const latest = await tableClient.getEntity(entity.partitionKey, entity.rowKey);
      return persistActionRecord(tableClient, actionRecord, latest, retryCount + 1);
    }
  }

  try {
    await tableClient.updateEntity(entity, 'Replace', { etag: existing.etag });
    return { updated: true, created: false, lastSyncedUtc: entity.LastSyncedUtc };
  } catch (error) {
    if (error.statusCode !== 412) {
      throw error;
    }
    const latest = await tableClient.getEntity(entity.partitionKey, entity.rowKey);
    if (actionRecord.matchesExisting(latest)) {
      return { updated: false, created: false, lastSyncedUtc: latest.LastSyncedUtc };
    }
    return persistActionRecord(tableClient, actionRecord, latest, retryCount + 1);
  }
}

function parsePayload(entity) {
  if (!entity) return null;
  try {
    return typeof entity.PayloadJson === 'string'
      ? JSON.parse(entity.PayloadJson)
      : (entity.PayloadJson || null);
  } catch (_err) {
    return null;
  }
}

async function updateStatsCache(tableClient, record, existing, result) {
  const newPayload = parsePayload({ PayloadJson: record.canonicalJson });
  const oldPayload = parsePayload(existing);

  const newType = newPayload && newPayload.actionType && newPayload.actionType.actionType;
  const oldType = oldPayload && oldPayload.actionType && oldPayload.actionType.actionType;
  const newVerified = newPayload && newPayload.verified === true;
  const oldVerified = oldPayload && oldPayload.verified === true;
  const newArchived = newPayload && newPayload.repoInfo && newPayload.repoInfo.archived === true;
  const oldArchived = oldPayload && oldPayload.repoInfo && oldPayload.repoInfo.archived === true;
  const newRawScore = newPayload ? (newPayload.openssf_score ?? newPayload.ossfScore ?? newPayload.ossf_score ?? null) : null;
  const newHasOssf = newPayload && (newPayload.ossf === true || (newRawScore !== null && newRawScore !== undefined));
  const oldRawScore = oldPayload ? (oldPayload.openssf_score ?? oldPayload.ossfScore ?? oldPayload.ossf_score ?? null) : null;
  const oldHasOssf = oldPayload && (oldPayload.ossf === true || (oldRawScore !== null && oldRawScore !== undefined));

  await patchCache(tableClient, (cache) => {
    const stats = cache.stats ? { ...cache.stats } : { total: 0, byType: {}, verified: 0, archived: 0, withOssf: 0 };
    const statusTotals = cache.status ? { ...cache.status } : null;

    if (result.created) {
      stats.total = (stats.total || 0) + 1;
    }

    if (newType !== oldType) {
      const byType = { ...stats.byType };
      if (newType) byType[newType] = (byType[newType] || 0) + 1;
      if (oldType) byType[oldType] = Math.max(0, (byType[oldType] || 0) - 1);
      stats.byType = byType;
    }

    if (newVerified !== oldVerified) {
      stats.verified = Math.max(0, (stats.verified || 0) + (newVerified ? 1 : -1));
    }

    if (newArchived !== oldArchived) {
      stats.archived = Math.max(0, (stats.archived || 0) + (newArchived ? 1 : -1));
    }

    if (newHasOssf !== oldHasOssf) {
      stats.withOssf = Math.max(0, (stats.withOssf || 0) + (newHasOssf ? 1 : -1));
    }

    const updatedStatus = statusTotals ? { ...statusTotals } : null;
    if (updatedStatus) {
      if (result.created) {
        updatedStatus.totalCount = (updatedStatus.totalCount || 0) + 1;
      }
      if (result.lastSyncedUtc) {
        const newTs = result.lastSyncedUtc;
        if (!updatedStatus.newestSyncedUtc || newTs > updatedStatus.newestSyncedUtc) {
          updatedStatus.newestSyncedUtc = newTs;
        }
      }
    }

    return { ...cache, stats, status: updatedStatus || cache.status };
  });
}

module.exports = async function actionsUpsert(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { 'Allow': 'POST,OPTIONS' })
    };
    return;
  }

  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { 'Allow': 'POST,OPTIONS' }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  let record;
  try {
    record = ActionRecord.fromRequest(req.body);
  } catch (error) {
    context.log.warn('Validation failed: %s', error.message);
    const errorResponse = createErrorResponse(
      ErrorCodes.VALIDATION_FAILED,
      error.message,
      null,  // Details will be added only if available from the error
      400
    );
    logErrorDetails(context, error, errorResponse.correlationId);
    context.res = {
      status: errorResponse.statusCode,
      headers: withCorsHeaders(req),
      body: errorResponse.body
    };
    return;
  }

  try {
    const tableClient = getTableClient();
    const existing = await fetchExisting(tableClient, record.partitionKey, record.rowKey);

    if (record.matchesExisting(existing)) {
      context.res = {
        status: 200,
        headers: withCorsHeaders(req),
        body: {
          updated: false,
          owner: record.owner,
          name: record.name,
          lastSyncedUtc: existing.LastSyncedUtc
        }
      };
      return;
    }

    const result = await persistActionRecord(tableClient, record, existing);

    // Best-effort incremental cache update; must not block or fail the response.
    updateStatsCache(tableClient, record, existing, result).catch(() => {});

    context.res = {
      status: result.created ? 201 : 200,
      headers: withCorsHeaders(req),
      body: {
        updated: result.updated,
        created: !!result.created,
        owner: record.owner,
        name: record.name,
        lastSyncedUtc: result.lastSyncedUtc
      }
    };
  } catch (error) {
    const errorDetails = extractErrorDetails(error);
    const errorResponse = createErrorResponse(
      ErrorCodes.PERSISTENCE_FAILED,
      'Failed to persist action record.',
      errorDetails,
      500
    );
    logErrorDetails(context, error, errorResponse.correlationId);
    context.res = {
      status: errorResponse.statusCode,
      headers: withCorsHeaders(req),
      body: errorResponse.body
    };
  }
};
