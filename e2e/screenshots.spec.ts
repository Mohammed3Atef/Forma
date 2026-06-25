import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * SCREENSHOT CAPTURE — logs in as the seeded demo users and saves screenshots of
 * the key coach / admin / client screens into `screenshots/`. Coach & admin are
 * captured at desktop width (they run as a web app); the client at mobile width.
 *
 * SKIPPED by default. To run it you must FIRST seed demo data
 * (`node scripts/seed-demo.mjs --apply`) so the screens have realistic content,
 * then:
 *
 *   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 *
 * Credentials come from env (defaults match scripts/seed-demo.mjs):
 *   DEMO_DOMAIN, DEMO_PASSWORD, and optionally SHOT_COACH_EMAIL /
 *   SHOT_CLIENT_EMAIL / SHOT_ADMIN_EMAIL + SHOT_ADMIN_PASSWORD (admins aren't
 *   created by the seed — point this at an existing super_admin).
 */
const DOMAIN = process.env.DEMO_DOMAIN || 'forma-demo.test';
const PASSWORD = process.env.DEMO_PASSWORD || 'FormaDemo!2026';
const COACH_EMAIL = process.env.SHOT_COACH_EMAIL || `demo.coach-sara@${DOMAIN}`;
const CLIENT_EMAIL = process.env.SHOT_CLIENT_EMAIL || `demo.client-omar@${DOMAIN}`;
const ADMIN_EMAIL = process.env.SHOT_ADMIN_EMAIL || process.env.E2E_SUPER_EMAIL || '';
const ADMIN_PASSWORD = process.env.SHOT_ADMIN_PASSWORD || process.env.E2E_SUPER_PASSWORD || PASSWORD;

const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

async function uiLogin(page: Page, email: string, password: string) {
  // Fresh session each time: clear stored auth, then sign in through the real UI.
  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  await page.goto('/');
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-form')).toBeHidden({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function shot(page: Page, route: string, name: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1200); // let React Query + images settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

test.describe('Demo screenshots', () => {
  test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 (and seed demo data first) to capture.');

  test('coach screens (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await uiLogin(page, COACH_EMAIL, PASSWORD);
    for (const [route, name] of [
      ['/coach', 'coach-dashboard'],
      ['/coach/clients', 'coach-clients'],
      ['/coach/messages', 'coach-messages'],
      ['/coach/library', 'coach-library'],
      ['/coach/templates', 'coach-templates'],
      ['/coach/plan', 'coach-plan'],
      ['/coach/reports', 'coach-reports'],
    ] as const) {
      await shot(page, route, name);
    }
  });

  test('client screens (mobile)', async ({ page }) => {
    await uiLogin(page, CLIENT_EMAIL, PASSWORD);
    for (const [route, name] of [
      ['/', 'client-home'],
      ['/workout', 'client-workout'],
      ['/nutrition', 'client-nutrition'],
      ['/progress', 'client-progress'],
    ] as const) {
      await shot(page, route, name);
    }
  });

  test('admin screens (desktop)', async ({ page }) => {
    test.skip(!ADMIN_EMAIL, 'Set SHOT_ADMIN_EMAIL (or E2E_SUPER_EMAIL) for admin screenshots.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const [route, name] of [
      ['/admin', 'admin-dashboard'],
      ['/admin/coaches', 'admin-coaches'],
      ['/admin/accounts', 'admin-accounts'],
    ] as const) {
      await shot(page, route, name);
    }
  });
});
