const { getTableClient } = require('../lib/tableStorage');
const { withCorsHeaders } = require('../lib/cors');
const { cacheControlHeaders } = require('../lib/cacheHeaders');
const { buildVersionsFeed } = require('../lib/versionsBuilder');
const {
  readVersions,
  writeVersions,
  decompressVersions,
  matchesEtag
} = require('../lib/versionsStore');

// Serves the action versions feed: the latest version of every action with its
// commit SHA and publish date, for clients that resolve versions locally rather
// than querying per action - notably the VS Code extension, which answers AI
// agent tool calls from a cached copy.
//
// Distinct from /actions/snapshot, which serves the frontend overview. That
// projection deliberately carries only the fields the UI renders and drops
// tagInfo and versionShaMap, so it cannot answer "which commit does @v4 point
// at". Keeping them separate keeps the overview payload - on the page-load hot
// path - from growing to carry SHA data the website never reads.

// The feed is rebuilt once a day by VersionsWarmup, so an hour of edge/proxy
// freshness costs nothing and keeps the function off the hot path for clients
// that refresh more eagerly than they need to.
const CACHE_MAX_AGE_SECONDS = 3600;

const ALLOWED_METHODS = 'GET,HEAD,OPTIONS';

// Guards against several concurrent cold requests each kicking off a full table
// scan when no feed exists yet. Scoped to one function host instance, which is
// all that is needed: the point is to avoid self-inflicted pile-ups, not to
// coordinate across instances.
let inFlightBuild = null;

function acceptsGzip(req) {
  const headers = (req && req.headers) || {};
  const value = headers['accept-encoding'] || headers['Accept-Encoding'] || '';
  return String(value).toLowerCase().includes('gzip');
}

function ifNoneMatchHeader(req) {
  const headers = (req && req.headers) || {};
  return headers['if-none-match'] || headers['If-None-Match'] || null;
}

async function buildAndStore(context) {
  if (!inFlightBuild) {
    inFlightBuild = (async () => {
      const tableClient = getTableClient();
      context.log('ActionsVersions: no stored feed found, building one on demand');
      const feed = await buildVersionsFeed(tableClient);
      const written = await writeVersions(feed);
      context.log(`ActionsVersions: built feed (count=${feed.count}, raw=${written.rawBytes}B, gzip=${written.gzipBytes}B)`);
      return readVersions();
    })().finally(() => {
      inFlightBuild = null;
    });
  }

  return inFlightBuild;
}

function metadataHeaders(stored) {
  const headers = {};
  if (stored.generatedAt) {
    headers['X-Versions-Generated-At'] = stored.generatedAt;
  }
  if (stored.count !== null) {
    headers['X-Versions-Count'] = stored.count;
  }
  if (stored.schemaVersion !== null) {
    headers['X-Versions-Schema-Version'] = stored.schemaVersion;
  }
  return headers;
}

module.exports = async function actionsVersions(context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: withCorsHeaders(req, { Allow: ALLOWED_METHODS })
    };
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    context.res = {
      status: 405,
      headers: withCorsHeaders(req, { Allow: ALLOWED_METHODS }),
      body: { error: 'Method not allowed.' }
    };
    return;
  }

  try {
    let stored = await readVersions();

    if (!stored) {
      stored = await buildAndStore(context);
    }

    if (!stored) {
      // The build ran but produced nothing readable - surface it as a retryable
      // condition rather than a hard failure, since the warmup timer will fix it.
      context.res = {
        status: 503,
        headers: withCorsHeaders(req, { 'Retry-After': '60' }),
        body: { error: 'The versions feed is not available yet. Please retry shortly.' }
      };
      return;
    }

    const baseHeaders = {
      ETag: stored.etag,
      Vary: 'Accept-Encoding',
      ...metadataHeaders(stored),
      ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
    };

    // Conditional request: the daily refresh normally lands here and transfers
    // no body at all.
    if (matchesEtag(ifNoneMatchHeader(req), stored.etag)) {
      context.log(`ActionsVersions: 304 for etag ${stored.etag}`);
      context.res = {
        status: 304,
        headers: withCorsHeaders(req, baseHeaders)
      };
      return;
    }

    // `?meta=true` answers "how fresh is the dataset" without moving megabytes,
    // for callers that want to decide before committing to a download.
    if (req.query && String(req.query.meta).toLowerCase() === 'true') {
      context.res = {
        status: 200,
        isRaw: true,
        headers: withCorsHeaders(req, { ...baseHeaders, 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          schemaVersion: stored.schemaVersion,
          generatedAt: stored.generatedAt,
          count: stored.count,
          etag: stored.etag,
          rawBytes: stored.rawBytes,
          gzipBytes: stored.gzipped.length
        })
      };
      return;
    }

    if (req.method === 'HEAD') {
      context.res = {
        status: 200,
        isRaw: true,
        headers: withCorsHeaders(req, { ...baseHeaders, 'Content-Type': 'application/json' }),
        body: ''
      };
      return;
    }

    if (acceptsGzip(req)) {
      context.log(`ActionsVersions: serving gzipped feed (${stored.gzipped.length} bytes, count=${stored.count})`);
      context.res = {
        status: 200,
        isRaw: true,
        headers: withCorsHeaders(req, {
          ...baseHeaders,
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip'
        }),
        body: stored.gzipped
      };
      return;
    }

    const json = await decompressVersions(stored.gzipped);
    context.log(`ActionsVersions: serving uncompressed feed (${json.length} bytes, count=${stored.count})`);
    context.res = {
      status: 200,
      isRaw: true,
      headers: withCorsHeaders(req, { ...baseHeaders, 'Content-Type': 'application/json' }),
      body: json
    };
  } catch (error) {
    context.log.error('Failed to serve the actions versions feed: %s', error.message);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to serve the actions versions feed.' }
    };
  }
};
