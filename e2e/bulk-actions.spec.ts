import { test, expect } from './fixtures/test';

/**
 * BULK ACTIONS — admin selects rows and acts on them in one go. These run
 * against real Firebase, so we drive the whole chain (select → bulk bar →
 * action → confirm) but CANCEL at the confirmation so no real account is
 * actually mutated. Verifies both selectable primitives: the raw account list
 * and the DataTable (coaches).
 */
test.describe('Bulk actions', () => {
  test('accounts: select-all reveals the bulk bar; action prompts then cancels cleanly', async ({ page, login }) => {
    await login('super_admin');
    await page.goto('/admin/accounts');
    await expect(page.getByTestId('admin-accounts')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('account-row').first()).toBeVisible({ timeout: 25_000 });

    // No selection yet → no bulk bar.
    await expect(page.getByTestId('bulk-action-bar')).toBeHidden();

    // Select everything on the page → the bar appears with a count.
    await page.getByTestId('account-select-all').click();
    await expect(page.getByTestId('bulk-action-bar')).toBeVisible();
    await expect(page.getByTestId('bulk-count')).toBeVisible();

    // Trigger a destructive bulk action → confirmation gate → CANCEL (no write).
    await page.getByTestId('bulk-suspend').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();

    // Selection survives the cancel; Clear empties it and hides the bar.
    await expect(page.getByTestId('bulk-action-bar')).toBeVisible();
    await page.getByTestId('bulk-clear').click();
    await expect(page.getByTestId('bulk-action-bar')).toBeHidden();
  });

  test('coaches table: row checkbox selection drives the bulk bar', async ({ page, login }) => {
    await login('super_admin');
    await page.goto('/admin/coaches');
    await expect(page.getByTestId('admin-coaches-table')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('data-row').first()).toBeVisible({ timeout: 25_000 });

    await expect(page.getByTestId('bulk-action-bar')).toBeHidden();
    // Select the first coach via its row checkbox.
    await page.getByTestId('row-select').first().click();
    await expect(page.getByTestId('bulk-action-bar')).toBeVisible();
    await expect(page.getByTestId('bulk-count')).toBeVisible();
    await page.getByTestId('bulk-clear').click();
    await expect(page.getByTestId('bulk-action-bar')).toBeHidden();
  });
});
