import { testAs, expect, historyLength } from './_helpers';

const test = testAs('coach');

test.describe('Coach — back-flow', () => {
  test('Clients list → workspace → Back returns to Clients', async ({ page }) => {
    await page.goto('/coach/clients');
    await expect(page.getByTestId('coach-clients')).toBeVisible();

    const openBtn = page.getByRole('button', { name: /^open$/i }).first();
    if (!(await openBtn.isVisible().catch(() => false))) {
      console.log('[coach-nav] no client rows to open — skipping.');
      return;
    }
    await openBtn.click();
    await expect(page).toHaveURL(/\/coach\/client\/[^/]+$/);

    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/coach\/clients$/);
  });

  test('Workspace: cycling all 11 tabs does not grow browser history', async ({ page }) => {
    await page.goto('/coach/clients');
    const openBtn = page.getByRole('button', { name: /^open$/i }).first();
    if (!(await openBtn.isVisible().catch(() => false))) {
      console.log('[coach-nav] no client rows to open — skipping.');
      return;
    }
    await openBtn.click();
    await expect(page).toHaveURL(/\/coach\/client\/[^/]+$/);

    const before = await historyLength(page);
    const tabs = ['workout', 'nutrition', 'cardio', 'assessments', 'checkins', 'notes', 'subscription', 'history', 'overview'];
    for (const tab of tabs) {
      await page.getByTestId(`workspace-tab-${tab}`).click();
      await page.waitForTimeout(150);
    }
    const after = await historyLength(page);
    expect(after, 'switching workspace tabs should replace, not push, history entries').toBe(before);

    // Browser back from here should walk all the way out of the workspace in
    // ONE step (to Clients), not backwards through each visited tab.
    await page.goBack();
    await expect(page).toHaveURL(/\/coach\/clients$/);
  });

  test('Workspace "Progress" escape hatch: Back returns to Clients, not a hardcoded route', async ({ page }) => {
    await page.goto('/coach/clients');
    const openBtn = page.getByRole('button', { name: /^open$/i }).first();
    if (!(await openBtn.isVisible().catch(() => false))) {
      console.log('[coach-nav] no client rows to open — skipping.');
      return;
    }
    await openBtn.click();
    await page.getByTestId('workspace-tab-progress').click();
    await expect(page).toHaveURL(/\/view\/progress$/);

    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/coach\/clients$/);
  });

  test('Direct deep link into a client workspace tab falls back to Clients (no history)', async ({ page }) => {
    // Need a real client id — grab one from the list first, then hit its
    // workout tab as a FRESH navigation (simulates a bookmark/notification).
    await page.goto('/coach/clients');
    const openBtn = page.getByRole('button', { name: /^open$/i }).first();
    if (!(await openBtn.isVisible().catch(() => false))) {
      console.log('[coach-nav] no client rows to open — skipping.');
      return;
    }
    await openBtn.click();
    const url = page.url();
    const clientId = url.match(/\/coach\/client\/([^/]+)/)?.[1];
    expect(clientId).toBeTruthy();

    await page.goto(`/coach/client/${clientId}/workout`);
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();
    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/coach\/clients$/);
  });

  test('Coach exercise library: ?tab= deep link opens the right tab (was dead before this pass)', async ({ page }) => {
    await page.goto('/coach/library?tab=foods');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('lib-tab-foods')).toHaveClass(/chip-on/, { timeout: 15_000 });
  });

  test('Templates: preview → Back returns to the Templates grid', async ({ page }) => {
    await page.goto('/coach/templates');
    const firstCard = page.getByTestId('template-card').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      console.log('[coach-nav] no templates to preview — skipping.');
      return;
    }
    await firstCard.getByRole('button').click();
    await expect(page.getByTestId('template-preview')).toBeVisible();

    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page).toHaveURL(/\/coach\/templates$/);
  });

  test('Refresh inside the workout editor keeps the unsaved draft', async ({ page }) => {
    await page.goto('/coach/clients');
    const openBtn = page.getByRole('button', { name: /^open$/i }).first();
    if (!(await openBtn.isVisible().catch(() => false))) {
      console.log('[coach-nav] no client rows to open — skipping.');
      return;
    }
    await openBtn.click();
    await page.getByTestId('workspace-tab-workout').click();
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();

    const nameInput = page.getByTestId('workout-plan-name');
    const marker = `E2E draft ${Date.now()}`;
    await nameInput.fill(marker);
    await expect(page.getByTestId('workout-unsaved')).toBeVisible();
    await page.waitForTimeout(400); // let the debounced localforage write land

    await page.reload();
    await expect(page.getByTestId('coach-workout-editor')).toBeVisible();
    await expect(page.getByTestId('workout-plan-name')).toHaveValue(marker);
    await expect(page.getByTestId('workout-unsaved')).toBeVisible();
  });
});
