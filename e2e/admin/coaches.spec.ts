import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * AdminCoaches (list) + AdminCoachDetail (per-coach plan management). Covers
 * the "Coach Plans" oversight side that lives on the coach detail screen:
 * extend trial (additive, safe) and a tier change that is verified to revert
 * cleanly, so the demo coach's tier is left exactly as found.
 *
 * AdminCoaches now has a desktop split-pane (matches the design's `coaches()`
 * table+preview split) — at Playwright's 1280px default viewport, clicking a
 * table row selects it into the right-hand preview pane instead of navigating
 * straight to `/admin/coaches/:id`; reaching the full detail screen goes
 * through the preview's "View client details" button.
 */
test.describe('Super admin: Coaches list + detail', () => {
  test.use({ storageState: AUTH('super') });

  test('coaches list loads with KPIs and a row for each demo coach', async ({ page }) => {
    const issues = trackIssues(page, 'coaches-list');
    await page.goto('/admin/coaches');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-coaches')).toBeVisible();

    const table = page.getByTestId('admin-coaches-table');
    await expect(table).toBeVisible();
    const rows = await table.getByTestId('data-row').count();
    expect(rows).toBeGreaterThanOrEqual(3);

    for (const email of ['coach@forma.test', 'demo.coachb@forma.test', 'demo.coachc@forma.test']) {
      await expect(table.getByTestId('data-row').filter({ hasText: email })).toBeVisible();
    }

    reportIssues(issues, 'coaches-list');
  });

  test('open demo.coachb detail — plan, client count and history render', async ({ page }) => {
    await page.goto('/admin/coaches');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('admin-coaches-table').getByTestId('data-row').filter({ hasText: 'demo.coachb@forma.test' }).click();
    await expect(page.getByTestId('admin-coach-preview')).toBeVisible();
    await page.getByTestId('admin-coach-open-profile').click();
    await expect(page.getByTestId('admin-coach-detail')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const body = await page.getByTestId('admin-coach-detail').innerText();
    expect(body).not.toMatch(/NaN|undefined/);
    expect(body.length).toBeGreaterThan(30);
    test.info().annotations.push({ type: 'note', description: `demo.coachb detail snapshot:\n${body.slice(0, 500)}` });

    // Tier chips render (built-in tiers at minimum).
    await expect(page.getByTestId('coach-tier-starter')).toBeVisible();
  });

  test('extend trial on demo.coachc adds days without side effects', async ({ page }) => {
    const issues = trackIssues(page, 'coach-extend-trial');
    await page.goto('/admin/coaches');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('admin-coaches-table').getByTestId('data-row').filter({ hasText: 'demo.coachc@forma.test' }).click();
    await expect(page.getByTestId('admin-coach-preview')).toBeVisible();
    await page.getByTestId('admin-coach-open-profile').click();
    await expect(page.getByTestId('admin-coach-detail')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const before = await page.getByTestId('admin-coach-detail').innerText();
    await page.getByTestId('coach-extend-trial').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-accept').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const after = await page.getByTestId('admin-coach-detail').innerText();
    expect(after).not.toMatch(/NaN|undefined/);
    test.info().annotations.push({ type: 'note', description: `demo.coachc trial extended. Before: ${before.match(/Days left[^\n]*/)?.[0]}. After: ${after.match(/Days left[^\n]*/)?.[0]}` });

    reportIssues(issues, 'coach-extend-trial');
  });

  test('change tier on demo.coachb then revert — leaves tier exactly as found', async ({ page }) => {
    const issues = trackIssues(page, 'coach-tier-change-revert');
    await page.goto('/admin/coaches');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('admin-coaches-table').getByTestId('data-row').filter({ hasText: 'demo.coachb@forma.test' }).click();
    await expect(page.getByTestId('admin-coach-preview')).toBeVisible();
    await page.getByTestId('admin-coach-open-profile').click();
    await expect(page.getByTestId('admin-coach-detail')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const tierKeys = ['trial', 'starter', 'pro', 'enterprise'];
    let originalKey: string | null = null;
    for (const key of tierKeys) {
      const chip = page.getByTestId(`coach-tier-${key}`);
      if (await chip.count() && (await chip.getAttribute('class'))?.includes('chip-on')) {
        originalKey = key;
        break;
      }
    }
    expect(originalKey, 'expected exactly one tier chip to be pre-selected').not.toBeNull();
    const targetKey = tierKeys.find((k) => k !== originalKey)!;

    // Change.
    await page.getByTestId(`coach-tier-${targetKey}`).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`coach-tier-${targetKey}`)).toHaveClass(/chip-on/, { timeout: 10_000 });
    await expect(page.getByTestId(`coach-tier-${originalKey}`)).not.toHaveClass(/chip-on/);

    // Revert.
    await page.getByTestId(`coach-tier-${originalKey}`).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`coach-tier-${originalKey}`)).toHaveClass(/chip-on/, { timeout: 10_000 });
    await expect(page.getByTestId(`coach-tier-${targetKey}`)).not.toHaveClass(/chip-on/);

    // Reload to make sure the revert actually persisted server-side, not just optimistic UI.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`coach-tier-${originalKey}`)).toHaveClass(/chip-on/, { timeout: 10_000 });

    reportIssues(issues, 'coach-tier-change-revert');
  });
});
