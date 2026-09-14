import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Logs in once per role and persists storage state (cookies + localStorage is
 * NOT used for the session — the access token lives in-memory only — so what
 * actually matters here is the httpOnly `forma_rt` refresh cookie Playwright's
 * storageState captures). Every other spec loads the matching state file
 * instead of re-doing the login UI flow.
 *
 * Skips accounts that already have a storageState file on disk (refresh
 * cookies last 30 days, so a saved session stays valid far longer than any
 * test run needs) — safe to re-run this project any time, and critical when
 * several specs/agents run concurrently: without this skip, every single
 * `npx playwright test` invocation would re-trigger 6 real `/auth/login`
 * calls, and production's real login rate limiter (10 attempts / 15 min per
 * ip+email) turns that into a self-inflicted outage under concurrency. Pass
 * `FORCE_REAUTH=1` to force a fresh login for every role regardless.
 */
const ROLES = [
  { name: 'super', emailVar: 'E2E_SUPER_EMAIL', passVar: 'E2E_SUPER_PASSWORD' },
  { name: 'admin', emailVar: 'E2E_ADMIN_EMAIL', passVar: 'E2E_ADMIN_PASSWORD' },
  { name: 'coach', emailVar: 'E2E_COACH_EMAIL', passVar: 'E2E_COACH_PASSWORD' },
  { name: 'client', emailVar: 'E2E_CLIENT_EMAIL', passVar: 'E2E_CLIENT_PASSWORD' },
  { name: 'coachB', emailVar: 'E2E_COACHB_EMAIL', passVar: 'E2E_COACHB_PASSWORD' },
  { name: 'coachC', emailVar: 'E2E_COACHC_EMAIL', passVar: 'E2E_COACHC_PASSWORD' },
] as const;

for (const role of ROLES) {
  setup(`authenticate as ${role.name}`, async ({ page }) => {
    const statePath = path.join(__dirname, '..', '.auth', `${role.name}.json`);
    if (fs.existsSync(statePath) && process.env.FORCE_REAUTH !== '1') {
      setup.skip(true, `${statePath} already exists — skipping re-login (set FORCE_REAUTH=1 to override)`);
      return;
    }

    const email = process.env[role.emailVar];
    const password = process.env[role.passVar];
    if (!email || !password) throw new Error(`Missing ${role.emailVar}/${role.passVar} in .env`);

    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    // Wait for the role app to actually mount (proves login + session bootstrap succeeded).
    await expect(page.locator('body')).not.toContainText('Welcome back', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');

    await page.context().storageState({ path: statePath });
  });
}
