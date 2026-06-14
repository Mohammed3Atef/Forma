import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Builds the app and serves the production preview (so the service
 * worker / PWA / offline behaviour is exercised exactly as shipped), then runs
 * the suite against it on a mobile viewport.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4390',
    trace: 'on-first-retry',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4390 --strictPort',
    url: 'http://localhost:4390',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
