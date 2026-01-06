const { ActionRecord } = require('../lib/actionRecord');
const { getTableClient, getActionEntity } = require('../lib/tableStorage');
const { ErrorCodes, createErrorResponse, extractErrorDetails, logErrorDetails } = require('../lib/errorResponse');

async function fetchExisting(tableClient, partitionKey, rowKey) {
  return getActionEntity(partitionKey, rowKey, { tableClient });
}

async function persistActionRecord(tableClient, actionRecord, existing) {
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
      return persistActionRecord(tableClient, actionRecord, latest);
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
    return persistActionRecord(tableClient, actionRecord, latest);
  }
}

module.exports = async function actionsUpsert(context, req) {
  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      headers: { 'Allow': 'POST' },
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

    context.res = {
      status: result.created ? 201 : 200,
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
      body: errorResponse.body
    };
  }
};
