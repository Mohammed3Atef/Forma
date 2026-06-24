import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';

/**
 * RESPONSIVE COACH PORTAL — verifies the shell swaps between the mobile
 * bottom-nav and the tablet/desktop sidebar, the desktop dashboard landing,
 * the desktop CRM layouts (clients table + preview, library table, templates
 * grid, plan-builder, messages split), no horizontal overflow at any width,
 * and that RTL still lays out on desktop.
 *
 * Login happens at a MOBILE viewport first (the `login` fixture waits for the
 * coach clients landing); we then resize to desktop for the desktop checks.
 * This keeps the whole suite to two real Firebase logins.
 */

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'document should not overflow horizontally').toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: 'serial' });

test.describe('Coach portal — responsive shell', () => {
  test('mobile shows bottom nav (no sidebar); desktop shows sidebar (no bottom nav) + lands on dashboard; RTL ok', async ({ page, login }) => {
    await page.setViewportSize(MOBILE);
    await login('coach');

    // Mobile: bottom nav visible, sidebar hidden.
    await expect(page.getByTestId(TID.bottomNav)).toBeVisible();
    await expect(page.getByTestId(TID.coachSidebar)).toBeHidden();
    await noHorizontalOverflow(page);

    // Desktop: sidebar visible, bottom nav hidden, /coach → dashboard.
    await page.setViewportSize(DESKTOP);
    await page.goto('/coach');
    await expect(page).toHaveURL(/\/coach\/dashboard/);
    await expect(page.getByTestId(TID.coachSidebar)).toBeVisible();
    await expect(page.getByTestId(TID.coachDashboard)).toBeVisible();
    await expect(page.getByTestId(TID.bottomNav)).toBeHidden();
    await noHorizontalOverflow(page);

    // RTL still lays out on desktop (logical sidebar border, no overflow).
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await expect(page.getByTestId(TID.coachSidebar)).toBeVisible();
    await noHorizontalOverflow(page);
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
  });

  test('desktop CRM layouts render: clients table+preview, library table, templates grid, plan-builder, messages split', async ({ page, login }) => {
    await page.setViewportSize(MOBILE);
    await login('coach');
    await page.setViewportSize(DESKTOP);

    // Clients: table + master-detail preview.
    await page.goto('/coach/clients');
    await expect(page.getByTestId(TID.coachDesktopClients)).toBeVisible();
    await expect(page.getByTestId(TID.coachDesktopPreview)).toBeVisible();
    await noHorizontalOverflow(page);

    // Library: table + visible search/filters.
    await page.goto('/coach/library');
    await expect(page.getByTestId(TID.coachDesktopLibrary)).toBeVisible();
    await expect(page.getByTestId('lib-search')).toBeVisible();
    await expect(page.getByTestId('lib-tab-foods')).toBeVisible();
    await noHorizontalOverflow(page);

    // Templates: grid.
    await page.goto('/coach/templates');
    await expect(page.getByTestId(TID.coachDesktopTemplates)).toBeVisible();
    await noHorizontalOverflow(page);

    // Plan builder (template editor): widened desktop builder.
    await page.goto('/coach/templates/new');
    await expect(page.getByTestId(TID.coachDesktopPlanBuilder)).toBeVisible();
    await noHorizontalOverflow(page);

    // Messages: split view (inbox + conversation pane).
    await page.goto('/coach/messages');
    await expect(page.getByTestId(TID.coachDesktopMessages)).toBeVisible();
    await noHorizontalOverflow(page);
  });
});
