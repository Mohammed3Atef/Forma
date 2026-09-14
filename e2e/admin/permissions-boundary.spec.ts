import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * Plain `admin` vs `super_admin` boundary. Backend enforcement (read from
 * source, not re-derived here):
 *  - api/_trpc/routers/adminUsers.ts `create`: role 'admin'|'super_admin' requires
 *    ctx.user.role === 'super_admin', else TRPCError FORBIDDEN.
 *  - `delete`: roleProcedure('super_admin') — a plain admin's call is rejected
 *    before the handler body even runs.
 *  - `setRole`: input role is z.enum(['client','coach']) only, for any actor.
 * This suite verifies the FRONTEND correctly hides all of these for a plain
 * admin (so no admin can even attempt them through the UI), and that the
 * super-only routes redirect cleanly rather than rendering a broken page.
 */
test.describe('Plain admin: cannot perform super-admin-only actions', () => {
  test.use({ storageState: AUTH('admin') });

  test('nav omits Coaches / Plans / Images; direct navigation redirects to /admin', async ({ page }) => {
    const issues = trackIssues(page, 'boundary-nav');
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    for (const label of ['Coaches', 'Plans', 'Images']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }

    for (const route of ['/admin/coaches', '/admin/plans', '/admin/media']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/admin$/);
      // No crash / error boundary.
      await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    }
    reportIssues(issues, 'boundary-nav');
  });

  test('create-account form only offers client/coach roles (admin/super_admin hidden)', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('admin-create-account').click();
    await expect(page.getByTestId('create-account-form')).toBeVisible();
    await expect(page.getByTestId('create-role-client')).toBeVisible();
    await expect(page.getByTestId('create-role-coach')).toBeVisible();
    await expect(page.getByTestId('create-role-admin')).toHaveCount(0);
    await expect(page.getByTestId('create-role-super_admin')).toHaveCount(0);
    await page.getByTestId('sheet-close').click();
  });

  test('delete-account control is hidden for a manageable (client) account', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');
    const search = page.getByPlaceholder('Search name, email or phone');
    await search.fill('demo.client10@forma.test');
    const row = page.getByTestId('admin-accounts-table').getByTestId('data-row').filter({ hasText: 'demo.client10@forma.test' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await expect(page.getByTestId('status-options')).toBeVisible();
    await expect(page.getByTestId('delete-account')).toHaveCount(0);
    // Role-change options are limited to client/coach (never admin/super_admin) even for super_admin, per changeableRoles().
    await expect(page.getByTestId('set-role-admin')).toHaveCount(0);
    await expect(page.getByTestId('set-role-super_admin')).toHaveCount(0);
    await page.getByTestId('sheet-close').click();
  });

  test('cannot manage an admin/super_admin-role account at all (if visible in the list)', async ({ page }) => {
    await page.goto('/admin/accounts');
    await page.waitForLoadState('networkidle');
    const search = page.getByPlaceholder('Search name, email or phone');
    await search.fill('super@forma.test');
    const row = page.getByTestId('admin-accounts-table').getByTestId('data-row').filter({ hasText: 'super@forma.test' });
    const visible = await row.count();
    if (visible === 0) {
      test.info().annotations.push({ type: 'note', description: 'super@forma.test not present/visible in the admin accounts list for a plain-admin actor — nothing further to check here.' });
      return;
    }
    await row.click();
    await expect(page.getByTestId('cannot-edit-account')).toBeVisible();
    await expect(page.getByTestId('status-options')).toHaveCount(0);
    await expect(page.getByTestId('delete-account')).toHaveCount(0);
  });
});
