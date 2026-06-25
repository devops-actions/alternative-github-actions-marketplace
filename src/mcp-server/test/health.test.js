'use strict';

const { createApp } = require('../index');

describe('health endpoint', () => {
  let server;
  let baseUrl;

  beforeAll((done) => {
    const app = createApp();
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('GET /health returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  test('GET /health includes cache stats', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    expect(body.cache).toBeDefined();
    expect(typeof body.cache.size).toBe('number');
  });

  test('GET /mcp returns 405', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('DELETE /mcp returns 405', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST /mcp with initialize returns 200', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      })
    });
    expect(res.status).toBe(200);
  });

  test('POST /mcp with invalid JSON body returns error', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: 'not valid json'
    });
    // Express rejects malformed JSON with 400
    expect(res.status).toBe(400);
  });

  test('POST /mcp with oversized body returns 413', async () => {
    // The app is configured with `limit: "1kb"` for express.json
    const largeBody = JSON.stringify({ data: 'x'.repeat(2048) });
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: largeBody
    });
    expect(res.status).toBe(413);
  });
});

