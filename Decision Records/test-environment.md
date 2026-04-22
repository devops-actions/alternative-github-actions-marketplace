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
- The CI workflow (.github/workflows/swa-test.yml) runs these steps and skips deployment if Azure secrets are not provided.
- Use Node.js 22 to match the project's engine requirements for the frontend and Node 20+ for backend tools.
