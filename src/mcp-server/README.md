# MCP Server: GitHub Actions Version Lookup

A remote [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets AI assistants look up the latest versions of GitHub Actions from the alternative marketplace database.

## What it does

Provides a `lookup-action-versions` tool that accepts an array of GitHub Action references and returns:
- The latest available version for each action
- Whether the referenced version is already up-to-date
- All known versions/tags

## Connecting to the server

### GitHub Copilot (VS Code)

Add to `.vscode/mcp.json`:
```json
{
  "servers": {
    "actions-marketplace": {
      "type": "http",
      "url": "https://<your-server-host>/mcp"
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "actions-marketplace": {
      "url": "https://<your-server-host>/mcp"
    }
  }
}
```

### Cursor / Other MCP clients

Use the server URL `https://<your-server-host>/mcp` in your client's MCP configuration.

## Tool: `lookup-action-versions`

### Input

```json
{
  "actions": [
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "github/codeql-action/analyze@v3"
  ]
}
```

### Output

```json
{
  "results": [
    {
      "input": "actions/checkout@v4",
      "found": true,
      "owner": "actions",
      "name": "checkout",
      "latestVersion": "v4.2.2",
      "commitSha": null,
      "currentVersion": "v4",
      "isLatest": true,
      "allVersions": ["v4.2.2", "v4.2.1", "v4.2.0", "v4.1.0", "v3.6.0"]
    }
  ]
}
```

### Limits

- Maximum 20 actions per request
- Rate limited to 60 requests per minute per IP

## Local development

```bash
cd src/mcp-server
npm install

# Set the backend API URL (defaults to http://localhost:7071/api)
export BACKEND_API_URL=https://your-functions-app.azurewebsites.net/api

# Start the server
npm start
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `BACKEND_API_URL` | `http://localhost:7071/api` | Backend Functions API base URL |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | (empty) | Optional App Insights connection |

### Testing

```bash
npm test
```

### Health check

```
GET /health
```

Returns server uptime, call stats, and cache info.

### Manual MCP test

List available tools:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Call the lookup tool:
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"lookup-action-versions","arguments":{"actions":["actions/checkout@v4"]}}}'
```

## Docker

```bash
docker build -t mcp-server .
docker run -p 3000:3000 -e BACKEND_API_URL=https://your-api.azurewebsites.net/api mcp-server
```

## Architecture

- **Transport**: Streamable HTTP (stateless mode) per MCP specification
- **Caching**: In-memory LRU (500 entries, 5-minute TTL), pre-warmed with top actions
- **Rate limiting**: 3 tiers (global 200/min, MCP 60/min, burst 10/sec) per IP
- **Monitoring**: Structured JSON logs, periodic stats, action lookup tracking
- **Hosting**: Designed for Azure Container Apps (Consumption plan, scale-to-zero)

