import { defineConfig, devices } from '@playwright/test';

/**
 * Navigation-pass e2e coverage, run against the LOCAL dev server
 * (`npm run dev`, via the `forma-local-api` Vite plugin) instead of
 * production — so these specs exercise the actual code changes on this
 * machine before anything is deployed. Scoped to `e2e/navigation/**` only;
 * the full production suite (`playwright.config.ts`) is untouched.
 *
 * No separate auth-setup project: each spec file logs in once for real via
 * `testAs()` (see `e2e/navigation/_helpers.ts`) and reuses that one
 * continuous session across every test in the file — a per-test fresh
 * context/storageState was tried first and dropped, since replaying a
 * storageState file mid-run raced the single-use `auth.refresh` cookie
 * rotation, and a fresh UI login per test hit production's own login rate
 * limiter (10 attempts / 15 min per ip+email) once a file had more than a
 * handful of tests.
 *
 * baseURL's port must match whatever `npm run dev` actually bound to (Vite
 * increments past 5173 if something else already holds it) — check the
 * `VITE ... Local:` line it prints on startup.
 */
export default defineConfig({
  testDir: './e2e/navigation',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5175',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
});
