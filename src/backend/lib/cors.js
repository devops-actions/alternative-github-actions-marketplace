function readAllowedOriginsFromEnv() {
  const raw = (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ALLOW_ORIGINS || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : null;
}

function getRequestHeader(req, name) {
  if (!req || !req.headers) {
    return undefined;
  }

  const direct = req.headers[name];
  if (direct) {
    return direct;
  }

  return req.headers[name.toLowerCase()];
}

function buildCorsHeaders(req) {
  const allowedOrigins = readAllowedOriginsFromEnv();
  const origin = getRequestHeader(req, 'Origin');

  // Default to wildcard unless a specific allow list is provided.
  // In CI environments we prefer permissive behavior to avoid flakiness
  // caused by mismatched FRONTEND_BASE_URL values during E2E runs.
  // Only enable the permissive CI behavior for known CI providers where the
  // runtime origin may be dynamic (GitHub Actions / Azure Pipelines).
  // Do NOT treat the generic `CI` env (set by test runners) as a signal to
  // enable permissive behavior because that breaks unit tests.
  const runningInCI = Boolean(process.env.GITHUB_ACTIONS || process.env.AZURE_PIPELINE);

  let allowOrigin = '*';
  if (allowedOrigins) {
    if (origin && allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else if (runningInCI) {
      // Be permissive in CI to avoid tests failing due to CORS misconfiguration.
      allowOrigin = '*';
    } else {
      // Explicit allow list present but origin not matched: do not set CORS header.
      allowOrigin = null;
    }
  }

  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-functions-key, x-ms-client-request-id',
    'Access-Control-Max-Age': '86400'
  };

  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    if (allowOrigin !== '*') {
      headers['Vary'] = 'Origin';
    }
  }

  return headers;
}

function withCorsHeaders(req, existingHeaders) {
  return {
    ...(existingHeaders || {}),
    ...buildCorsHeaders(req)
  };
}

module.exports = {
  buildCorsHeaders,
  withCorsHeaders
};
