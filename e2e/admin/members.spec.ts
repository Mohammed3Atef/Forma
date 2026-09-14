import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/** AdminMembers: the cross-role member list with join-date segments + subscription oversight. */
test.describe('Super admin: Members', () => {
  test.use({ storageState: AUTH('super') });

  test('loads KPIs, searches, filters by role/status, segments, and sorts', async ({ page }) => {
    const issues = trackIssues(page, 'members');
    await page.goto('/admin/members');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-members')).toBeVisible();

    const table = page.getByTestId('admin-members-table');
    await expect(table).toBeVisible();
    const total = await table.getByTestId('data-row').count();
    expect(total).toBeGreaterThan(0);

    const kpiText = await page.getByTestId('admin-members').innerText();
    test.info().annotations.push({ type: 'note', description: `Members KPI snapshot:\n${kpiText.slice(0, 400)}` });

    // Search.
    await page.getByTestId('members-search').fill('Tarek Fahmy');
    await expect(table.getByTestId('data-row').filter({ hasText: 'Tarek Fahmy' })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('members-search').fill('');

    // Role filter.
    await page.getByTestId('members-role').selectOption('coach');
    const coachRows = await table.getByTestId('data-row').count();
    expect(coachRows).toBeGreaterThanOrEqual(3);
    await page.getByTestId('members-role').selectOption('all');

    // Account-status filter.
    await page.getByTestId('members-status').selectOption('suspended');
    await page.waitForTimeout(300);
    await page.getByTestId('members-status').selectOption('all');

    // Join-date segment.
    await page.getByTestId('members-segment').selectOption('older');
    const olderRows = await table.getByTestId('data-row').count();
    expect(olderRows).toBeGreaterThan(0);
    await page.getByTestId('members-segment').selectOption('all');

    // Sort toggle — just confirm it re-renders without error (order not hand-verified here).
    await page.getByTestId('members-sort').selectOption('oldest');
    await expect(table.getByTestId('data-row').first()).toBeVisible();
    await page.getByTestId('members-sort').selectOption('newest');

    reportIssues(issues, 'members');
  });

  test('clicking a client member row navigates to client detail; a coach row to coach detail', async ({ page }) => {
    await page.goto('/admin/members');
    await page.waitForLoadState('networkidle');
    const table = page.getByTestId('admin-members-table');

    await page.getByTestId('members-role').selectOption('coach');
    await table.getByTestId('data-row').first().click();
    await expect(page).toHaveURL(/\/admin\/coaches\//);
    await page.goBack();

    await page.waitForLoadState('networkidle');
    await page.getByTestId('members-role').selectOption('client');
    await table.getByTestId('data-row').first().click();
    await expect(page).toHaveURL(/\/admin\/clients\//);
  });
});
