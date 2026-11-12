import { defineConfig } from '@playwright/test';

const baseURL = process.env.LAB_BASE_URL ?? 'http://127.0.0.1:5173';
export default defineConfig({
  testDir: './tests',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.LAB_BASE_URL
    ? undefined
    : {
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
  workers: 1,
});
