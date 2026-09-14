import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

const SEARCH_PLACEHOLDER = 'Search name, email or phone';

test.describe('Super admin: Accounts', () => {
  test.use({ storageState: AUTH('super') });

  test('loads, searches, filters by role/status, and paginates if applicable', async ({ page }) => {
    const issues = trackIssues(page, 'accounts');
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-accounts')).toBeVisible();

    const table = page.getByTestId('admin-accounts-table');
    await expect(table).toBeVisible();
    const initialRows = await table.getByTestId('data-row').count();
    expect(initialRows).toBeGreaterThan(0);

    // Search narrows the list to the matched demo client.
    const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
    await search.fill('Yara Mostafa');
    await expect(table.getByTestId('data-row').filter({ hasText: 'Yara Mostafa' })).toBeVisible();
    const searchedCount = await table.getByTestId('data-row').count();
    expect(searchedCount).toBeLessThan(initialRows || searchedCount + 1);
    await search.fill('');

    // Role filter.
    await page.getByRole('button', { name: 'Coach', exact: true }).click();
    const coachRows = await table.getByTestId('data-row').count();
    expect(coachRows).toBeGreaterThanOrEqual(3); // at least the 3 demo coaches
    expect(coachRows).toBeLessThan(initialRows || coachRows + 1);
    await page.getByRole('button', { name: 'All', exact: true }).first().click();

    // Status filter chips (dedicated data-testids).
    await page.getByTestId('status-filter-active').click();
    await expect(page.getByTestId('status-filter-active')).toHaveClass(/chip-on/);
    const activeCount = await table.getByTestId('data-row').count();
    expect(activeCount).toBeGreaterThan(0);
    await page.getByTestId('status-filter-all').click();

    // Pagination: accounts uses infinite-scroll, not the classic Pagination
    // component. Scroll the sentinel into view and see whether more rows load.
    await page.getByTestId('admin-accounts-table').locator('tr').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const afterScrollRows = await table.getByTestId('data-row').count();
    test.info().annotations.push({
      type: 'note',
      description: `Accounts list: ${initialRows} rows initially, ${afterScrollRows} after scroll-to-bottom (infinite scroll; a single page is expected at current demo-data volume).`,
    });

    reportIssues(issues, 'accounts');
  });

  test('create-account form offers the full role set to super_admin (closed without submitting)', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('admin-create-account').click();
    await expect(page.getByTestId('create-account-form')).toBeVisible();
    for (const role of ['super_admin', 'admin', 'coach', 'client']) {
      await expect(page.getByTestId(`create-role-${role}`)).toBeVisible();
    }
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('create-account-form')).not.toBeVisible();
  });

  test('suspend then reactivate demo.client10 (Yara Mostafa) — status change sticks and reverts', async ({ page }) => {
    const issues = trackIssues(page, 'accounts-status-change');
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');

    const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
    await search.fill('demo.client10@forma.test');
    const row = page.getByTestId('admin-accounts-table').getByTestId('data-row').filter({ hasText: 'demo.client10@forma.test' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    await expect(page.getByTestId('status-options')).toBeVisible();
    // Confirm starting state is 'active' before we touch anything (documented as the demo baseline).
    await expect(page.getByTestId('set-status-active')).toHaveClass(/chip-on/);

    // Suspend.
    await page.getByTestId('set-status-suspended').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('status-options')).not.toBeVisible({ timeout: 10_000 }); // sheet closes on success

    // Re-open and verify the suspension stuck. The list is invalidated
    // (background refetch) rather than updated synchronously, so a plain
    // re-search can still read the pre-mutation cache — reload to force a
    // fresh fetch before re-checking (mirrors e2e/transfers' proven pattern).
    await page.waitForTimeout(1200);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await search.fill('demo.client10@forma.test');
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page.getByTestId('set-status-suspended')).toHaveClass(/chip-on/, { timeout: 10_000 });

    // Reactivate — revert cleanly.
    await page.getByTestId('set-status-active').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('status-options')).not.toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(1200);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await search.fill('demo.client10@forma.test');
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page.getByTestId('set-status-active')).toHaveClass(/chip-on/, { timeout: 10_000 });

    reportIssues(issues, 'accounts-status-change');
  });
});
