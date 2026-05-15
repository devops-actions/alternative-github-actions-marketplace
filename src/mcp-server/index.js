const http = require('http');
const url = require('url');

const BACKEND_API_URL = process.env.BACKEND_API_URL || '';

async function fetchActionFromBackend(owner, name) {
  if (!BACKEND_API_URL) {
    return null;
  }

  const base = BACKEND_API_URL.replace(/\/+$/, '');
  const actionUrl = `${base}/actions/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  const response = await fetch(actionUrl, {
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function buildVersionResponse(action, version) {
  if (!action) {
    return null;
  }

  const shaMap = action.versionShaMap || {};
  const tagInfo = Array.isArray(action.tagInfo) ? action.tagInfo : [];
  const releaseInfo = Array.isArray(action.releaseInfo) ? action.releaseInfo : [];

  if (version) {
    const sha = shaMap[version] || null;
    const exists = tagInfo.includes(version) || releaseInfo.includes(version);
    if (!exists) {
      return null;
    }
    return { version, sha };
  }

  const versions = tagInfo.map((v) => ({
    version: v,
    sha: shaMap[v] || null
  }));

  return { owner: action.owner, name: action.name, versions };
}

function requestHandler(req, res) {
  const parsed = url.parse(req.url, true);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (parsed.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  if (parsed.pathname === '/invoke' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsedBody = null;
      try { parsedBody = body ? JSON.parse(body) : null; } catch (e) { parsedBody = body; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: parsedBody }));
    });
    return;
  }

  // Version lookup: GET /versions/:owner/:name?version=v1.0.0
  const versionMatch = parsed.pathname.match(/^\/versions\/([^/]+)\/([^/]+)$/);
  if (versionMatch && req.method === 'GET') {
    const owner = decodeURIComponent(versionMatch[1]);
    const name = decodeURIComponent(versionMatch[2]);
    const version = parsed.query.version || null;

    fetchActionFromBackend(owner, name)
      .then((action) => {
        const result = buildVersionResponse(action, version);
        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'not found' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      })
      .catch((err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream error', message: err.message }));
      });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

function createServer() {
  return http.createServer(requestHandler);
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const server = createServer();
  server.listen(port, () => {
    console.log(`MCP server listening on ${port}`);
  });
}

module.exports = { createServer, buildVersionResponse };