import { defineConfig } from '@playwright/test';

const baseURL = process.env.FRONTEND_BASE_URL || 'http://localhost:4173';

export default defineConfig({
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
