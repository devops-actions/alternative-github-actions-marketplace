Test environment (Static Web App) — running locally

This short guide shows how to run the build/test steps locally that the CI workflow executes.

Backend (run tests):

- cd src\backend
- npm ci
- npm test

Frontend (build):

- cd src\frontend
- npm ci
- npm run build

Notes:
- These unit tests and the frontend build run locally without Azure credentials or production data. The CI workflow (`.github/workflows/swa-test.yml`) runs the backend tests and frontend build; it skips deployment if Azure secrets are not provided.
- Use Node.js 22 for validation because CI and Azure Functions production use Node.js 22. The backend and MCP package manifests declare `node >=20`, which is a broader package minimum, not the production validation target.
