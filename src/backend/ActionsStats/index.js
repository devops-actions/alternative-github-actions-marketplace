const { getTableClient } = require('../lib/tableStorage');

module.exports = async function actionsStats(context, req) {
  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: { Allow: 'GET' },
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const tableClient = getTableClient();
  const tableUrl = tableClient && tableClient.url ? tableClient.url.split('?')[0] : 'unknown';

  let total = 0;
  const byType = {};
  let verified = 0;

  try {
    for await (const entity of tableClient.listEntities()) {
      total += 1;

      try {
        const payload = typeof entity.PayloadJson === 'string'
          ? JSON.parse(entity.PayloadJson)
          : (entity.PayloadJson || {});

        const type = payload.actionType && payload.actionType.actionType;
        if (type) {
          byType[type] = (byType[type] || 0) + 1;
        }

        if (payload.verified === true) {
          verified += 1;
        }
      } catch (parseErr) {
        // skip malformed payloads
      }
    }

    context.log(`ActionsStats: total=${total}, verified=${verified}, table=${tableUrl}`);

    context.res = {
      status: 200,
      headers: {
        'X-Actions-Count': total,
        'X-Verified-Count': verified,
        'X-Table-Endpoint': tableUrl
      },
      body: {
        total,
        byType,
        verified
      }
    };
  } catch (error) {
    context.log.error('Error computing stats:', error);
    context.res = {
      status: 500,
      body: { error: 'Failed to compute stats.' }
    };
  }
};
