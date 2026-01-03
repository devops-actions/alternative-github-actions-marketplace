const { getTableClient } = require('../lib/tableStorage');
const { ActionRecord } = require('../lib/actionRecord');

module.exports = async function actionsList(context, req) {
  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: { 'Allow': 'GET' },
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const owner = context.bindingData && context.bindingData.owner;
  const tableClient = getTableClient();
  let entities = [];

  // For now, only support in-memory/fake client for integration tests
  if (typeof tableClient.store === 'object' && tableClient.store instanceof Map) {
    // Simulate Table Storage query by owner
    entities = Array.from(tableClient.store.values()).filter(e => {
      const entityOwner = e.Owner || (e.PayloadJson && JSON.parse(e.PayloadJson).owner);
      return owner ? entityOwner === owner : true;
    });
    context.res = {
      status: 200,
      body: entities.map(e => {
        try {
          return ActionRecord.fromEntity(e).toActionInfo(true, {
            etag: e.etag,
            lastSyncedUtc: e.LastSyncedUtc,
            partitionKey: e.partitionKey || e.PartitionKey,
            rowKey: e.rowKey || e.RowKey
          });
        } catch {
          return null;
        }
      }).filter(Boolean)
    };
    return;
  }

  // TODO: Implement real Table Storage query for production
  context.res = {
    status: 501,
    body: { error: 'Not implemented for real Table Storage yet.' }
  };
};
