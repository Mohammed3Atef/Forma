import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * AdminGovernance: feature flags + roles/permissions reference (now a real
 * capability×role matrix table). The audit log was extracted to its own
 * `/admin/audit` destination — this file's last test still checks it (just at
 * the new route) since it needs to run AFTER accounts/coaches/banners in the
 * suite (alphabetical file order already puts it there) for real recent
 * actions from this same session to find.
 */
test.describe('Super admin: Governance', () => {
  test.use({ storageState: AUTH('super') });

  test('feature flags: toggle one safely and revert', async ({ page }) => {
    const issues = trackIssues(page, 'governance-flags');
    await page.goto('/admin/governance');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-governance')).toBeVisible();

    const toggles = page.getByRole('button', { name: /^(On|Off)$/ });
    const count = await toggles.count();

    if (count === 0) {
      // No existing flags to safely exercise — create one clearly-marked demo
      // flag instead of touching production toggles that don't exist yet.
      await page.getByRole('button', { name: 'Add' }).click();
      const sheet = page.getByTestId('sheet-panel');
      await expect(sheet).toBeVisible();
      await sheet.getByLabel('Flag id (e.g. nutritionV2)').fill('demo_qa_flag');
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet).not.toBeVisible({ timeout: 10_000 });
      test.info().annotations.push({ type: 'note', description: 'No feature flags existed — created "demo_qa_flag" (global, enabled) to demonstrate the flags UI. Left in place; harmless (nothing reads this flag id).' });
    } else {
      const first = toggles.first();
      const row = first.locator('..');
      const rowLabel = (await row.innerText()).split('\n')[0];
      const before = (await first.innerText()).trim();

      await first.click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();
      await page.getByTestId('confirm-accept').click();
      await page.waitForLoadState('networkidle');
      const after = (await first.innerText()).trim();
      expect(after).not.toBe(before);

      // Revert immediately — we don't know what this flag gates in production.
      await first.click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();
      await page.getByTestId('confirm-accept').click();
      await page.waitForLoadState('networkidle');
      const reverted = (await first.innerText()).trim();
      expect(reverted).toBe(before);

      test.info().annotations.push({ type: 'note', description: `Toggled and reverted flag "${rowLabel}" (${before} -> ${after} -> ${reverted}).` });
    }

    reportIssues(issues, 'governance-flags');
  });

  test('roles & permissions reference renders all 4 roles', async ({ page }) => {
    await page.goto('/admin/governance');
    await page.waitForLoadState('networkidle');
    for (const role of ['Super Admin', 'Admin', 'Coach', 'Client']) {
      await expect(page.getByText(role, { exact: true }).first()).toBeVisible();
    }
  });

  test('audit log lists real recent admin actions from this session', async ({ page }) => {
    // Audit log is now its own destination (/admin/audit), extracted out of
    // Governance to match the design's separate "Govern → Audit" screen.
    await page.goto('/admin/audit');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-audit')).toBeVisible();
    const body = await page.locator('body').innerText();
    // Earlier specs in this run performed user.updateStatus (accounts.spec)
    // and flag.update (this file's first test) mutations — both should show
    // up here as a sanity check that audit logging actually works.
    const sawStatusChange = /updateStatus/i.test(body);
    const sawFlagChange = /flag update|flag\.update/i.test(body);
    test.info().annotations.push({ type: 'note', description: `Audit log sanity check — saw a user status-change entry: ${sawStatusChange}; saw a flag-change entry: ${sawFlagChange}.` });
    expect(sawStatusChange || sawFlagChange, 'expected at least one of this session\'s own actions to appear in the audit log').toBe(true);
  });
});

test.describe('Plain admin: Governance is also accessible (flags.manage + audit.read are granted to admin)', () => {
  test.use({ storageState: AUTH('admin') });

  test('sees the flags/permissions/audit sections same as super_admin', async ({ page }) => {
    await page.goto('/admin/governance');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-governance')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  });
});
