import { defineConfig, devices } from '@playwright/test';
import { loadDotEnv } from './e2e/fixtures/env';

/**
 * Forma end-to-end QA configuration.
 *
 * - Builds the PRODUCTION app and serves the Vite preview (so the service
 *   worker / PWA / offline behaviour is exercised exactly as shipped).
 * - Runs on a MOBILE viewport by default (Forma is mobile-first).
 * - Captures screenshots, video, traces and console logs on failure.
 * - Emits a JSON report consumed by `scripts/qa-report.mjs` to generate
 *   docs/QA_REPORT.md.
 *
 * Required env (validated in e2e/global-setup.ts): VITE_FIREBASE_* and the
 * E2E_* account credentials. See e2e/fixtures/env.ts and docs/QA.md.
 */

loadDotEnv();

const PORT = Number(process.env.E2E_PORT ?? 4390);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/legacy/**'],
  globalSetup: './e2e/global-setup.ts',
  // Generous per-test budget: login retries on transient Firebase auth
  // rate-limits (auth/quota-exceeded) back off up to ~20s before re-trying.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: './test-results/artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ...devices['Pixel 7'],
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
