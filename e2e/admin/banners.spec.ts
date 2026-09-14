import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

const TITLE = 'Welcome to Forma!';
const BODY = 'Glad to have you training with us — check out your plan to get started.';

test.describe('Super admin: Banners', () => {
  test.use({ storageState: AUTH('super') });

  test('create a client-targeted banner, then edit it', async ({ page }) => {
    const issues = trackIssues(page, 'banners-admin');
    await page.goto('/admin/banners');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('admin-banners')).toBeVisible();

    const existingRow = page.getByTestId('banner-row').filter({ hasText: TITLE });
    if (await existingRow.count()) {
      test.info().annotations.push({ type: 'note', description: `"${TITLE}" banner already existed — editing it in place instead of creating a duplicate.` });
    } else {
      await page.getByTestId('banner-new').click();
      const sheet = page.getByTestId('sheet-panel');
      await expect(sheet).toBeVisible();
      await page.getByTestId('banner-title').fill(TITLE);
      await sheet.getByLabel('Message').fill(BODY);
      // Audience: target clients only.
      await sheet.getByRole('button', { name: 'Client', exact: true }).click();
      await sheet.getByLabel('Placement').selectOption('client_home');
      await page.getByTestId('banner-save').click();
      await expect(sheet).not.toBeVisible({ timeout: 10_000 });
    }

    const row = page.getByTestId('banner-row').filter({ hasText: TITLE });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('Live'); // active by default

    // Edit: tweak the body text and verify it sticks.
    await row.getByRole('button', { name: 'Edit' }).click();
    const editSheet = page.getByTestId('sheet-panel');
    await expect(editSheet).toBeVisible();
    await expect(editSheet.getByTestId('banner-title')).toHaveValue(TITLE);
    await editSheet.getByLabel('Message').fill(`${BODY} (edited)`);
    await page.getByTestId('banner-save').click();
    await expect(editSheet).not.toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('(edited)', { timeout: 10_000 });

    reportIssues(issues, 'banners-admin');
  });
});

test.describe('Client: banner surface shows the targeted banner', () => {
  test.use({ storageState: AUTH('client') });

  test('BannerHost renders the active client_home banner on the client home', async ({ page }) => {
    const issues = trackIssues(page, 'banners-client');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('banner-host')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('app-banner').filter({ hasText: TITLE })).toBeVisible();
    reportIssues(issues, 'banners-client');
  });
});
