import 'dotenv/config';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };

/** Browser history length — used to prove tab switching doesn't push new entries. */
export function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

type Role = 'super' | 'admin' | 'coach' | 'client';

const CREDS: Record<Role, [string, string]> = {
  super: ['E2E_SUPER_EMAIL', 'E2E_SUPER_PASSWORD'],
  admin: ['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'],
  coach: ['E2E_COACH_EMAIL', 'E2E_COACH_PASSWORD'],
  client: ['E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD'],
};

async function loginAs(page: Page, role: Role): Promise<void> {
  const [emailVar, passVar] = CREDS[role];
  const email = process.env[emailVar];
  const password = process.env[passVar];
  if (!email || !password) throw new Error(`Missing ${emailVar}/${passVar} in .env`);

  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.locator('body')).not.toContainText('Welcome back', { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

/**
 * One real login per spec FILE (not per test): the `page` fixture is
 * redefined at WORKER scope, so every test in the file reuses the same
 * continuous browser session instead of each getting its own fresh context.
 *
 * This sidesteps two real problems with the more obvious alternatives:
 *  - A per-test storageState file goes stale mid-run — `auth.refresh` rotates
 *    the session's refresh cookie on every use, and these are the same
 *    shared QA accounts the production e2e suite and other concurrent
 *    sessions use against the SAME database, so a file written a few tests
 *    ago can already be a step behind by the time a later test reads it back
 *    off disk (a real, documented, repo-wide flake — see
 *    `e2e/coach/_helpers.ts`'s comment).
 *  - A real UI login per test is bulletproof but hits production's own login
 *    rate limiter (10 attempts / 15 min per ip+email) once a file has more
 *    than a handful of tests.
 * A single continuous context has neither problem: the browser's own cookie
 * jar tracks each rotation automatically (confirmed directly — two sequential
 * `auth.refresh` calls in one context both succeed), and it's still one real,
 * un-mocked login per file.
 */
export function testAs(role: Role) {
  return base.extend<Record<string, never>, { sharedPage: Page }>({
    sharedPage: [
      async ({ browser }, use) => {
        const context = await browser.newContext({ locale: 'en-US' });
        const page = await context.newPage();
        await loginAs(page, role);
        await use(page);
        await context.close();
      },
      { scope: 'worker' },
    ],
    // Test-scoped `page` stays declared at its original scope (required by
    // Playwright) but resolves to the one shared, already-logged-in page —
    // every test in the file reuses the same continuous session.
    page: async ({ sharedPage }, use) => {
      await use(sharedPage);
    },
  });
}
