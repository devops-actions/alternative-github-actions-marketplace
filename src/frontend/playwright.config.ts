import { defineConfig } from '@playwright/test';
import os from 'node:os';

const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

const parsedWorkers = Number(process.env.PLAYWRIGHT_WORKERS);
const workers = Number.isFinite(parsedWorkers) && parsedWorkers > 0
  ? parsedWorkers
  : (process.env.CI ? Math.min(4, os.cpus().length || 1) : undefined);

export default defineConfig({
  fullyParallel: true,
  workers,
  use: {
    baseURL,
    headless: true
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  timeout: 60000
});
