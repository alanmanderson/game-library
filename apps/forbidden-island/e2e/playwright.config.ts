import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
  },
  webServer: [
    {
      command: 'cd ../apps/server && npx tsx src/index.ts',
      port: 3000,
      reuseExistingServer: true,
      timeout: 10000,
    },
    {
      command: 'cd ../apps/client && npx vite',
      port: 8000,
      reuseExistingServer: true,
      timeout: 10000,
    },
  ],
});
