import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * AdminPlans: super-admin tier CRUD. Built-in tiers (trial/starter/pro/enterprise)
 * are only viewed/edited non-destructively (open + verify prefilled values, close
 * without saving). All destructive CRUD (create/edit/archive) happens against a
 * new throwaway "demo_test_tier" key so real coach-plan data is never disturbed.
 */
test.describe('Super admin: Plan Tiers', () => {
  test.use({ storageState: AUTH('super') });

  test('lists built-in tiers and opens an edit sheet non-destructively', async ({ page }) => {
    const issues = trackIssues(page, 'plans-view');
    await page.goto('/admin/plans');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-plans')).toBeVisible();

    const list = page.getByTestId('plan-list');
    await expect(list).toBeVisible();
    for (const key of ['trial', 'starter', 'pro', 'enterprise']) {
      await expect(page.locator(`[data-testid="plan-row"][data-key="${key}"]`)).toBeVisible();
    }

    // Open edit on "starter" — verify it's prefilled, then close WITHOUT saving.
    const starterRow = page.locator('[data-testid="plan-row"][data-key="starter"]');
    await starterRow.getByTestId('plan-edit').click();
    await expect(page.getByTestId('plan-form')).toBeVisible();
    const maxClientsValue = await page.getByTestId('plan-max').inputValue();
    const priceValue = await page.getByTestId('plan-price').inputValue();
    expect(Number(maxClientsValue)).toBeGreaterThan(0);
    expect(priceValue.length).toBeGreaterThan(0);
    // No key field for an existing tier (key is immutable) — the edit form omits it.
    await expect(page.getByTestId('plan-key')).not.toBeVisible();
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('plan-form')).not.toBeVisible();

    // "trial" is the one tier that can never be archived (no archive button rendered).
    const trialRow = page.locator('[data-testid="plan-row"][data-key="trial"]');
    await expect(trialRow.getByTestId('plan-archive')).toHaveCount(0);

    reportIssues(issues, 'plans-view');
  });

  test('create, edit and archive a throwaway demo_test_tier', async ({ page }) => {
    const issues = trackIssues(page, 'plans-crud');
    await page.goto('/admin/plans');
    await page.waitForLoadState('networkidle');

    // Clean up a leftover from a previous run, if any (archive doesn't delete the row).
    const existing = page.locator('[data-testid="plan-row"][data-key="demo_test_tier"]');
    if (await existing.count()) {
      test.info().annotations.push({ type: 'note', description: 'demo_test_tier already existed from a prior run — reusing it.' });
    } else {
      await page.getByTestId('plan-add').click();
      await expect(page.getByTestId('plan-form')).toBeVisible();
      await page.getByTestId('plan-key').fill('demo_test_tier');
      await page.getByTestId('plan-label').fill('Demo Test Tier');
      await page.getByTestId('plan-max').fill('5');
      await page.getByTestId('plan-price').fill('123');
      await page.getByTestId('plan-currency').fill('EGP');
      await page.getByTestId('plan-save').click();
      await expect(page.getByTestId('plan-form')).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="plan-row"][data-key="demo_test_tier"]')).toBeVisible({ timeout: 10_000 });
    }

    // Edit it — bump the price.
    const row = page.locator('[data-testid="plan-row"][data-key="demo_test_tier"]');
    await row.getByTestId('plan-edit').click();
    await expect(page.getByTestId('plan-form')).toBeVisible();
    await page.getByTestId('plan-price').fill('456');
    await page.getByTestId('plan-save').click();
    await expect(page.getByTestId('plan-form')).not.toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('456');

    // Archive it (this is the throwaway tier — archiving is the intended cleanup).
    await row.getByTestId('plan-archive').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-accept').click();
    await expect(row).toContainText('archived', { timeout: 10_000 });

    reportIssues(issues, 'plans-crud');
  });
});
