import { testAs, expect } from './_helpers';

// AdminCoaches/AdminCoachDetail/AdminAssignments/AdminSubscriptions are
// super-admin-only surfaces (a plain admin is silently redirected away from
// them — see the audit's A13 finding) — 'super' can reach everything a plain
// 'admin' can too, so one role covers this whole file correctly.
const test = testAs('super');

test.describe('Admin — back-flow', () => {
  test('Coaches list → coach detail → Back returns to Coaches', async ({ page }) => {
    await page.goto('/admin/coaches');
    await expect(page.getByTestId('admin-coaches')).toBeVisible();

    const row = page.getByTestId('data-row').first();
    if (!(await row.isVisible().catch(() => false))) {
      console.log('[admin-nav] no coach rows — skipping.');
      return;
    }
    await row.click();
    // Desktop is a split pane (row click just selects); "View client details"
    // is the actual navigation into AdminCoachDetail.
    const openProfile = page.getByTestId('admin-coach-open-profile');
    if (await openProfile.isVisible().catch(() => false)) {
      await openProfile.click();
    }
    await expect(page).toHaveURL(/\/admin\/coaches\/[^/]+$/);

    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/coaches$/);
  });

  test('Assignments → coach capacity row → coach detail → Back returns to Assignments', async ({ page }) => {
    await page.goto('/admin/assignments');
    const row = page.getByTestId('assign-coach-capacity-row').first();
    if (!(await row.isVisible().catch(() => false))) {
      console.log('[admin-nav] no capacity rows — skipping.');
      return;
    }
    await row.click();
    await expect(page).toHaveURL(/\/admin\/coaches\/[^/]+$/);

    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/assignments$/);
  });

  test('Subscriptions → expiring client → client detail → Back returns to Subscriptions', async ({ page }) => {
    await page.goto('/admin/subscriptions');
    const row = page.getByTestId('admin-expiring-client').first();
    if (!(await row.isVisible().catch(() => false))) {
      console.log('[admin-nav] no expiring-client rows — skipping.');
      return;
    }
    await row.click();
    await expect(page).toHaveURL(/\/admin\/clients\/[^/]+$/);

    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/subscriptions$/);
  });

  test('Accounts: search + role filter survive a round trip to client detail and back', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-accounts-table').or(page.locator('.card').first())).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(/search name, email or phone/i).fill('a');
    await page.getByRole('button', { name: /^client$/i }).click(); // role filter chip
    await page.waitForTimeout(600); // debounce
    await expect(page).toHaveURL(/role=client/, { timeout: 15_000 });
    await expect(page).toHaveURL(/q=a/);

    const row = page.getByTestId('account-row').or(page.getByTestId('data-row')).first();
    if (!(await row.isVisible().catch(() => false))) {
      console.log('[admin-nav] no matching account rows — skipping the drill-in half of this test.');
      return;
    }
    await row.click();
    const viewClient = page.getByRole('button', { name: /view client details/i });
    if (await viewClient.isVisible().catch(() => false)) {
      await viewClient.click();
      await expect(page).toHaveURL(/\/admin\/clients\/[^/]+$/);
      await page.getByRole('button', { name: /back/i }).first().click();
    } else {
      await page.getByTestId('sheet-close').click().catch(() => {});
      await page.goBack();
    }

    // Filters must still be applied after returning — not reset to "all".
    await expect(page).toHaveURL(/role=client/);
    await expect(page).toHaveURL(/q=a/);
  });

  test('Direct deep link into a coach detail falls back to Coaches (no history)', async ({ page }) => {
    await page.goto('/admin/coaches');
    const row = page.getByTestId('data-row').first();
    if (!(await row.isVisible().catch(() => false))) {
      console.log('[admin-nav] no coach rows — skipping.');
      return;
    }
    await row.click();
    const openProfile = page.getByTestId('admin-coach-open-profile');
    if (await openProfile.isVisible().catch(() => false)) await openProfile.click();
    const url = page.url();
    const coachId = url.match(/\/admin\/coaches\/([^/]+)/)?.[1];
    if (!coachId) {
      console.log('[admin-nav] could not resolve a coach id — skipping.');
      return;
    }

    await page.goto(`/admin/coaches/${coachId}`);
    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/coaches$/);
  });
});
