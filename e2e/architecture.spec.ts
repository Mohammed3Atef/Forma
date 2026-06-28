import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';

/**
 * ARCHITECTURE / ROLE BOUNDARIES — each role mounts only its own shell. The
 * Client (mobile-only) never renders the Coach/Admin desktop sidebar, and the
 * Coach/Admin portals render the sidebar shell. Complements the static guard
 * `scripts/check-boundaries.mjs` (no cross-role imports) with a runtime check.
 *
 * Login happens at the fixture's default (mobile) viewport — the coach landing
 * is the clients list on mobile — then we resize to desktop for shell checks.
 */

const DESKTOP = { width: 1280, height: 800 };

test.describe('Architecture / role boundaries', () => {
  test('client renders the mobile shell, never the Coach/Admin sidebar', async ({ page, login }) => {
    await login('client');
    await page.setViewportSize(DESKTOP);
    await expect(page.getByTestId(TID.appShell)).toBeVisible();
    await expect(page.getByTestId(TID.bottomNav)).toBeVisible();
    // The client app has no Coach/Admin chrome — even at a desktop width.
    await expect(page.getByTestId(TID.coachSidebar)).toHaveCount(0);
    // Navigating to a coach route as a client never renders the coach sidebar.
    await page.goto('/coach/dashboard');
    await expect(page.getByTestId(TID.bottomNav)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TID.coachSidebar)).toHaveCount(0);
  });

  test('coach renders the desktop sidebar shell (no bottom nav)', async ({ page, login }) => {
    await login('coach');
    await page.setViewportSize(DESKTOP);
    await page.goto('/coach/dashboard');
    await expect(page.getByTestId(TID.coachSidebar)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TID.bottomNav)).toBeHidden();
  });

  test('super-admin renders the desktop sidebar shell', async ({ page, login }) => {
    await login('super_admin');
    await page.setViewportSize(DESKTOP);
    await page.goto('/admin');
    await expect(page.getByTestId(TID.coachSidebar)).toBeVisible({ timeout: 20_000 });
  });
});
