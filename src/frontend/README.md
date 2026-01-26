# Alternative GitHub Actions Marketplace - Frontend

This is the frontend application for the alternative GitHub Actions Marketplace. It provides a user-friendly interface to browse, search, and explore GitHub Actions.

## Features

- **Overview Page**: Browse all available GitHub Actions with stats and filters
- **Search**: Search actions by name or owner
- **Filtering**: Filter actions by type (Node/JavaScript, Docker, Composite)
- **Detail View**: View comprehensive information about each action
- **In-Memory Caching**: Actions data is loaded at startup and refreshed periodically (every 5 minutes)
- **README Preview**: View action README files in an iframe

## Tech Stack

- **React 18**: UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **React Router**: Client-side routing

## Development

### Prerequisites

- Node.js 22 or higher
- npm

### Setup

```bash
cd src/frontend
npm install
```

### Run locally

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

By default, the app calls the API at `/api/*` and the Vite dev server proxies those requests to `http://localhost:7071`.

If you want to proxy to a different backend origin while developing, set `VITE_API_PROXY_TARGET` (for example, `http://localhost:7072`).

### Build for production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Environment Variables

- `VITE_API_BASE_URL`: Base URL for the API from the browser (default: `/api`)
- `VITE_API_PROXY_TARGET`: Backend origin the Vite dev server should proxy `/api/*` requests to (default: `http://localhost:7071`)
- `VITE_PLAUSIBLE_TRACKING_DOMAIN`: Domain for Plausible Analytics tracking (configured via `PLAUSIBLE_TRACKING_DOMAIN` repository variable)
- `VITE_APPINSIGHTS_CONNECTION_STRING`: Application Insights connection string for telemetry

## Architecture

### Running Playwright tests (important note)

- When running the built frontend and Playwright tests, start the static server and the Playwright test runner in separate terminal sessions. Do NOT start the server and then run tests in the same shell session where the server is running in the foreground — Playwright will try to connect to the server but if you stop or cancel the server process to continue work in that same terminal, the tests will fail with connection errors.
- Example (terminal A): start the static server serving the `dist` folder

```powershell
cd src/frontend
npx http-server ./dist -p 3000
```

- Example (terminal B): run Playwright tests while the server is running

```powershell
cd src/frontend
npx playwright test
```

- Rationale: Running the server in one session and tests in another keeps the server process alive while the Playwright runner connects. If you start the server in the same terminal and then cancel it to run tests, the server will be stopped and Playwright will receive `ERR_CONNECTION_REFUSED` errors.

### Data Service

The `actionsService` is a singleton service that:
- Loads all actions from the API at startup
- Caches actions in memory
- Automatically refreshes the cache every 5 minutes
- Notifies subscribers when data changes
- Provides filtering and search capabilities

### Components

- **OverviewPage**: Main listing page with search and filters
- **DetailPage**: Detailed view of a single action
- **App**: Main application component with routing

## Deployment

The frontend is deployed to Azure Static Web Apps via GitHub Actions. See `.github/workflows/deploy-frontend.yml` for the deployment workflow.

The workflow:
1. Resolves the Static Web App hostname from Azure
2. Installs dependencies
3. Builds the application with environment variables:
   - `VITE_API_BASE_URL`: Backend API URL (resolved from Azure Function App hostname)
   - `VITE_APPINSIGHTS_CONNECTION_STRING`: Application Insights connection string for telemetry
   - `VITE_PLAUSIBLE_TRACKING_DOMAIN`: Plausible Analytics tracking domain (from `PLAUSIBLE_TRACKING_DOMAIN` repository variable)
4. Deploys to Azure Static Web Apps

### Configuration

The Plausible tracking domain is configured via the `PLAUSIBLE_TRACKING_DOMAIN` repository variable. This variable is:
- Passed to the Bicep template during infrastructure deployment (see `.github/workflows/deploy-infra.yml`)
- Used to configure a custom domain on the Azure Static Web App resource
- Used at build time to configure the Plausible Analytics client
- Typically set to your custom domain (e.g., `marketplace.example.com`)

#### Custom Domain Setup

If you configure a custom domain via `PLAUSIBLE_TRACKING_DOMAIN`:

1. **Set the repository variable**: Add `PLAUSIBLE_TRACKING_DOMAIN` with your custom domain (e.g., `marketplace.example.com`)

2. **Deploy infrastructure**: Run the `deploy-infra.yml` workflow to create the custom domain resource on the Static Web App

3. **Configure DNS**: Create a CNAME record in your DNS:
   - **Name**: Your custom domain (e.g., `marketplace.example.com`)
   - **Value**: The Static Web App's default hostname (e.g., `swa-xyz123.azurestaticapps.net`)

4. **Wait for validation**: Azure will validate domain ownership via the CNAME record

Once DNS validation completes, your Static Web App will be accessible via the custom domain, and Plausible Analytics will track visits to that domain.

## API Integration

The frontend expects the following API endpoints:

- `GET /api/actions/list` - Returns all actions
- `GET /api/actions/{owner}/{name}` - Returns a specific action

These endpoints are provided by the Azure Functions backend.
