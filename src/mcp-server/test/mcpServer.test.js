'use strict';

const { createMcpServer } = require('../lib/mcpServer');
const { MAX_BATCH_SIZE } = require('../lib/actionLookup');

// Mock the MCP SDK to avoid external dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    constructor(config) {
      this.name = config.name;
      this.version = config.version;
      this._tools = [];
      this._toolHandlers = {};
    }

    tool(name, description, inputSchema, handler) {
      this._tools.push({ name, description, inputSchema });
      this._toolHandlers[name] = handler;
    }

    get tools() {
      return this._tools;
    }

    getToolHandler(name) {
      return this._toolHandlers[name];
    }
  }

  return { McpServer: MockMcpServer };
});

describe('mcpServer', () => {
  test('createMcpServer returns a server instance', () => {
    const server = createMcpServer();
    
    expect(server).toBeDefined();
    expect(server).toHaveProperty('name', 'actions-mkt');
    expect(server).toHaveProperty('version', '1.0.0');
  });

  test('server has lookup-action-versions tool registered', () => {
    const server = createMcpServer();
    
    // The MCP server should have tools registered
    expect(server.tools).toBeDefined();
    expect(Array.isArray(server.tools)).toBe(true);
    
    // Find the lookup-action-versions tool
    const lookupTool = server.tools.find(tool => tool.name === 'lookup-action-versions');
    expect(lookupTool).toBeDefined();
    expect(lookupTool.description).toContain('Look up the latest versions of GitHub Actions');
  });

  test('lookup-action-versions tool has input schema', () => {
    const server = createMcpServer();
    const lookupTool = server.tools.find(tool => tool.name === 'lookup-action-versions');
    
    expect(lookupTool).toBeDefined();
    expect(lookupTool.inputSchema).toBeDefined();
  });

  test('lookup-action-versions tool handler respects MAX_BATCH_SIZE', async () => {
    const server = createMcpServer();
    const handler = server.getToolHandler('lookup-action-versions');
    
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
    
    // Test with an array that exceeds MAX_BATCH_SIZE
    const largeArray = Array(MAX_BATCH_SIZE + 1).fill('actions/checkout@v4');
    const result = await handler({ actions: largeArray });
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Batch size exceeds maximum');
  });

  test('lookup-action-versions tool handler handles empty array', async () => {
    const server = createMcpServer();
    const handler = server.getToolHandler('lookup-action-versions');
    
    const result = await handler({ actions: [] });
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Input must be a non-empty array');
  });

  test('lookup-action-versions tool handler handles null input', async () => {
    const server = createMcpServer();
    const handler = server.getToolHandler('lookup-action-versions');
    
    const result = await handler({ actions: null });
    
    expect(result.isError).toBe(true);
  });
});
