import { defineConfig } from '@playwright/test';
import os from 'node:os';
import { config as dotenvConfig } from 'dotenv';

// Load .env file for local testing if present.
dotenvConfig();

const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

const parsedWorkers = Number(process.env.PLAYWRIGHT_WORKERS);
// In CI with large API payloads (16MB+), too many parallel workers overwhelm the backend.
// Default to 2 workers in CI to reduce concurrent load on the Function App.
const workers = Number.isFinite(parsedWorkers) && parsedWorkers > 0
  ? parsedWorkers
  : (process.env.CI ? Math.min(2, os.cpus().length || 1) : undefined);

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  workers,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    headless: true
  },
  expect: {
    timeout: 60000
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  timeout: 180000
});
