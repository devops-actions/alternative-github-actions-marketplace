MCP Server (skeleton)

This folder contains a minimal MCP server skeleton used as a starting point for implementing an MCP (Model Control Plane) server for this project.

Quickstart

- Run:
  - node index.js
  - or from this directory: npm install && npm start

API

- GET /health
  - Returns 200 with JSON { status: "ok" }
- POST /invoke
  - Accepts a JSON body and returns 200 with { received: <body> }

Extending

- Replace the simple in-memory handler in index.js with your MCP logic.
- Add authentication, logging, and proper request validation as needed.
- Consider switching to Express or a framework if routing grows.

Tests

- A small smoke test is provided at test/test-health.js which starts the server and verifies /health returns 200.
  - From src/mcp-server: npm test

Next steps for maintainers

- Add durable storage or message queues for long-running/async invocations.
- Add OpenAPI spec and implement request validation.
- Wire the mcp-server into CI and add unit tests for any new business logic.

License: follow repository license.
