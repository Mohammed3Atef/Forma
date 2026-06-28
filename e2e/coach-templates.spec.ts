import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';

/**
 * TEMPLATE FLOW — clicking a template opens a READ-ONLY preview (not the editor);
 * Edit enters the editor; leaving with no change does NOT prompt; leaving after a
 * real edit DOES prompt. Self-contained: creates its own template first.
 */
test.describe('Coach templates — preview vs edit', () => {
  test('create → preview is read-only → edit; no false unsaved prompt; prompt only after a change', async ({ page, login }) => {
    await login('coach');
    const name = `QA Tpl ${Date.now()}`;

    // Create a template (new → editor → name → save → lands on the preview).
    await page.goto('/coach/templates/new');
    await expect(page.getByTestId(TID.coachTemplateEditor)).toBeVisible({ timeout: 25_000 });
    await page.getByTestId(TID.templateName).fill(name);
    await page.getByTestId('template-save').click();
    await expect(page.getByTestId('template-preview')).toBeVisible({ timeout: 25_000 });

    // Preview is read-only: it offers Edit, and is NOT the editor.
    await expect(page.getByTestId('template-edit')).toBeVisible();
    await expect(page.getByTestId(TID.coachTemplateEditor)).toHaveCount(0);

    // Enter edit, then leave WITHOUT changing anything → no confirm dialog.
    await page.getByTestId('template-edit').click();
    await expect(page.getByTestId(TID.coachTemplateEditor)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
    await expect(page.getByTestId('template-preview')).toBeVisible({ timeout: 20_000 });

    // Enter edit, make a real change, then leave → confirm dialog appears.
    await page.getByTestId('template-edit').click();
    await expect(page.getByTestId(TID.templateName)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(TID.templateName).fill(`${name} edited`);
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('confirm-accept').click(); // discard + leave
    await expect(page.getByTestId('template-preview')).toBeVisible({ timeout: 20_000 });
  });
});
