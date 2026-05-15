'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { lookupActions, MAX_BATCH_SIZE } = require('./actionLookup');

/**
 * Create a configured McpServer instance with the lookup-action-versions tool.
 */
function createMcpServer() {
  const server = new McpServer({
    name: 'actions-marketplace',
    version: '1.0.0'
  });

  server.tool(
    'lookup-action-versions',
    'Look up the latest versions of GitHub Actions. Returns the latest version for each action and whether the provided version pin is up to date.',
    {
      actions: z.array(z.string().describe('Action reference, e.g. "actions/checkout@v4"'))
        .min(1)
        .max(MAX_BATCH_SIZE)
        .describe('Array of GitHub Action references to look up')
    },
    async ({ actions }) => {
      const result = await lookupActions(actions);

      if (result.error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: result.error }, null, 2) }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    }
  );

  return server;
}

module.exports = { createMcpServer };
