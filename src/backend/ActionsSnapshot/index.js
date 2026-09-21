const { withCorsHeaders } = require('../lib/cors');
const { cacheControlHeaders } = require('../lib/cacheHeaders');
const { readSnapshot, readSnapshotProperties } = require('../lib/snapshotStore');

const CACHE_MAX_AGE_SECONDS = 300; // 5 minutes

// Serves the precomputed actions snapshot built by SnapshotRefresh.
//
// /actions/list answers the same question by scanning all ~35k table entities
// and returning their full payloads: ~50 seconds and ~56 MB. That endpoint is
// still needed by the upload pipeline (which reconciles on fields the UI never
// shows) and stays as it is. This endpoint serves a single pre-built,
// pre-sorted blob of just the fields the UI reads, so the overview page has
// its complete dataset in one fast request instead of rendering a
// 50-row preview and swapping it out ~50 seconds later.

// Cached in module scope so warm instances skip the blob download entirely.
// Revalidated against the blob's ETag on every request, which is a metadata
// call rather than a transfer of the body.
let cached = null; // { etag, json }

async function loadSnapshot(context) {
  if (cached) {
    try {
      const properties = await readSnapshotProperties();
      if (properties && properties.etag === cached.etag) {
        return { ...cached, fromMemory: true };
      }
    } catch (error) {
      // Revalidation is an optimisation; fall through to a full read.
      context.log.warn('ActionsSnapshot: ETag revalidation failed, re-reading blob:', error.message);
    }
  }

  const snapshot = await readSnapshot();
  if (!snapshot) {
    return null;
  }

  cached = { etag: snapshot.etag, json: snapshot.json };
  return { ...cached, fromMemory: false };
}

// Exposed so tests can start from a known state.
function resetCache() {
  cached = null;
}

module.exports = async function actionsSnapshot(context, req) {
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

  try {
    const snapshot = await loadSnapshot(context);

    if (!snapshot) {
      // No snapshot has been built yet. Deliberately not falling back to a
      // live table scan: that is the 50-second path this endpoint exists to
      // avoid, and a slow success is harder to notice than an explicit 503.
      context.log.warn('ActionsSnapshot: no snapshot blob found; has SnapshotRefresh run?');
      context.res = {
        status: 503,
        headers: withCorsHeaders(req, { 'Retry-After': '60' }),
        body: {
          error: 'Snapshot not available yet.',
          hint: 'The snapshot is built by the upload pipeline and the SnapshotWarmup timer.'
        }
      };
      return;
    }

    // Repeat visits revalidate cheaply: an unchanged snapshot costs a 304 with
    // no body instead of re-downloading the whole dataset.
    const ifNoneMatch = req.headers && (req.headers['if-none-match'] || req.headers['If-None-Match']);
    if (ifNoneMatch && ifNoneMatch === snapshot.etag) {
      context.res = {
        status: 304,
        headers: withCorsHeaders(req, {
          ETag: snapshot.etag,
          ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
        })
      };
      return;
    }

    context.log(`ActionsSnapshot: served ${snapshot.json.length} bytes (fromMemory=${snapshot.fromMemory})`);

    context.res = {
      status: 200,
      isRaw: true,
      headers: withCorsHeaders(req, {
        'Content-Type': 'application/json; charset=utf-8',
        ETag: snapshot.etag,
        ...cacheControlHeaders(CACHE_MAX_AGE_SECONDS)
      }),
      body: snapshot.json
    };
  } catch (error) {
    context.log.error('ActionsSnapshot: failed to serve snapshot:', error);
    context.res = {
      status: 500,
      headers: withCorsHeaders(req),
      body: { error: 'Failed to read the actions snapshot.' }
    };
  }
};

module.exports.resetCache = resetCache;
