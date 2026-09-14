import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite runs against the live production deployment (https://www.useforma.fit)
 * using the persistent E2E_* accounts in `.env` plus DEMO_-prefixed data created
 * for this pass. No local dev server — this is intentionally a real-environment
 * product QA suite, not a build-time smoke test.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'https://www.useforma.fit',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // Deliberately NOT `dependencies: ['setup']` on the chromium project: that
  // would re-run the full 6-account login flow on EVERY test invocation,
  // regardless of whether valid storageState already exists on disk. With
  // several agents/specs running concurrently against production, that
  // stampede of real /auth/login calls tripped the real production rate
  // limiter (10 attempts / 15 min per ip+email) — a self-inflicted outage,
  // not a product bug. Run `npx playwright test --project=setup` ONCE
  // (auth.setup.ts skips accounts that already have a storageState file, so
  // it's safe to re-run) — every other invocation should target
  // `--project=chromium` only, reusing the saved sessions.
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
