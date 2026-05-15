'use strict';

const express = require('express');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpServer } = require('./lib/mcpServer');
const { createRateLimiters } = require('./lib/rateLimiter');
const { getStats, startPeriodicFlush } = require('./lib/monitoring');
const { preWarm, getCacheStats } = require('./lib/cache');

const PORT = process.env.PORT || 3000;

function createApp() {
  const app = express();
  const { globalLimiter, mcpLimiter, burstLimiter } = createRateLimiters();

  app.set('trust proxy', 1);
  app.use(globalLimiter);
  app.use(express.json({ limit: '1kb' }));

  // Health endpoint
  app.get('/health', (req, res) => {
    const stats = getStats();
    const cacheStats = getCacheStats();
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      ...stats,
      cache: cacheStats
    });
  });

  // MCP endpoint: POST handles JSON-RPC requests
  app.post('/mcp', burstLimiter, mcpLimiter, async (req, res) => {
    const server = createMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined // stateless
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('MCP request error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  // Reject GET and DELETE for stateless server
  app.get('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    });
  });

  app.delete('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null
    });
  });

  return app;
}

async function main() {
  startPeriodicFlush();

  // Pre-warm cache (non-blocking, failure is ok)
  preWarm().catch(() => {});

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`MCP server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { createApp };
