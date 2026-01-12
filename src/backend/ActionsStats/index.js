const { getTableClient } = require('../lib/tableStorage');
const { withCorsHeaders } = require('../lib/cors');

module.exports = async function actionsStats(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { Allow: 'GET,OPTIONS' })
    };
    return;
  }

  if (req.method !== 'GET') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { Allow: 'GET,OPTIONS' }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  const tableClient = getTableClient();
  const tableUrl = tableClient && tableClient.url ? tableClient.url.split('?')[0] : 'unknown';

  let total = 0;
  const byType = {};
  let verified = 0;
  let archived = 0;

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

        if (payload.repoInfo && payload.repoInfo.archived === true) {
          archived += 1;
        }
      } catch (parseErr) {
        // skip malformed payloads
      }
    }

    context.log(`ActionsStats: total=${total}, verified=${verified}, archived=${archived}, table=${tableUrl}`);

    const payload = { total, byType, verified, archived };

    context.res = {
      status: 200,
      isRaw: true,
      headers: {
        'X-Actions-Count': total,
        'X-Verified-Count': verified,
        'X-Archived-Count': archived,
        'X-Table-Endpoint': tableUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    };
    context.res.headers = withCorsHeaders(req, context.res.headers);
  } catch (error) {
    context.log.error('Error computing stats:', error);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to compute stats.' }
    };
  }
};
