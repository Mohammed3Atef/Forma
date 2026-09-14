import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH = (role: string) => path.join(__dirname, '..', '.auth', `${role}.json`);

async function openAddClientSheet(page: Page) {
  await page.goto('/coach/clients');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('coach-add-client').click();
  await page.getByTestId('add-choose-existing').click();
}

async function assignByEmail(page: Page, email: string) {
  await openAddClientSheet(page);
  await page.getByTestId('existing-search').fill(email);
  await page.getByTestId('existing-search-btn').click();
  const result = page.getByTestId('existing-result');
  if (await result.count()) await result.first().click();
  await expect(page.getByTestId('existing-detail')).toBeVisible({ timeout: 10_000 });
  if (await page.getByTestId('existing-already-assigned').isVisible().catch(() => false)) return 'already-mine';
  await expect(page.getByTestId('existing-assign-panel')).toBeVisible();
  if (await page.getByTestId('existing-assign-blocked').isVisible().catch(() => false)) return 'blocked';
  await page.getByTestId('existing-assign').click();
  await expect(page.getByTestId('existing-detail')).not.toBeVisible({ timeout: 10_000 });
  return 'assigned';
}

test.describe('Coach: assign existing (unassigned) client', () => {
  test.use({ storageState: AUTH('coach') });

  test('coach@forma.test assigns client@forma.test (previously unassigned)', async ({ page }) => {
    const outcome = await assignByEmail(page, 'client@forma.test');
    expect(outcome).not.toBe('blocked');
  });
});

test.describe('Coach-to-coach transfer: pull request -> approve (releases) -> requester re-assigns', () => {
  test('demo.coachb requests demo.client12 (Rania Adel) from demo.coachc; coachc approves; coachb picks her up', async ({ browser }) => {
    const ctxB = await browser.newContext({ storageState: AUTH('coachB') });
    const ctxC = await browser.newContext({ storageState: AUTH('coachC') });
    const pageB = await ctxB.newPage();
    const pageC = await ctxC.newPage();

    await openAddClientSheet(pageB);
    await pageB.getByTestId('existing-search').fill('demo.client12@forma.test');
    await pageB.getByTestId('existing-search-btn').click();
    const resultB = pageB.getByTestId('existing-result');
    if (await resultB.count()) await resultB.first().click();
    await expect(pageB.getByTestId('existing-detail')).toBeVisible({ timeout: 10_000 });

    const alreadyMine = await pageB.getByTestId('existing-already-assigned').isVisible().catch(() => false);
    if (!alreadyMine) {
      const alreadyPending = await pageB.getByTestId('existing-transfer-cancel').isVisible().catch(() => false);
      if (!alreadyPending) {
        await pageB.getByTestId('existing-transfer-reason').fill('Better fit for this client’s goals — requesting to take over coaching.');
        await pageB.getByTestId('existing-request-transfer').click();
        await expect(pageB.getByTestId('existing-transfer-cancel')).toBeVisible({ timeout: 10_000 });
      }

      // Coach C approves from the Coach Clients page's incoming-transfers widget — this
      // RELEASES the client (does not itself reassign; the requester must pick them up).
      await pageC.goto('/coach/clients');
      await pageC.waitForLoadState('networkidle');
      const row = pageC.getByTestId('incoming-transfer-row').filter({ hasText: 'Rania Adel' });
      if (await row.count()) {
        await row.getByTestId('incoming-transfer-approve').click();
        // The row clears once the approve mutation's onSuccess invalidates the
        // incoming-transfers query — a reload is a more robust wait than
        // trusting the exact refetch timing.
        await pageC.waitForTimeout(1500);
        await pageC.reload();
        await pageC.waitForLoadState('networkidle');
        await expect(pageC.getByTestId('incoming-transfer-row').filter({ hasText: 'Rania Adel' })).not.toBeVisible({ timeout: 10_000 });
      }

      // Coach B now assigns the (freed) client to complete the pickup.
      await pageB.reload();
      const outcome = await assignByEmail(pageB, 'demo.client12@forma.test');
      expect(outcome).not.toBe('blocked');
    }

    await ctxB.close();
    await ctxC.close();
  });
});

test.describe('Admin: Fresh Start transfer (archives + clears old coach content)', () => {
  test.use({ storageState: AUTH('super') });

  test('super admin transfers demo.client11 (Tarek Fahmy) from demo.coachc to coach@forma.test with Fresh Start', async ({ page }) => {
    await page.goto('/admin/assignments');
    await page.waitForLoadState('networkidle');

    const search = page.locator('input[placeholder]').first();
    await search.fill('Tarek Fahmy');
    const row = page.getByTestId('assign-client-row').filter({ hasText: 'Tarek Fahmy' });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();

    const alreadyTransferred = await page.getByTestId('admin-open-transfer').isVisible().catch(() => false);
    if (!alreadyTransferred) {
      test.info().annotations.push({ type: 'note', description: 'Tarek Fahmy has no assigned coach — cannot demonstrate Fresh Start transfer (expected only if already run before).' });
      return;
    }
    await page.getByTestId('admin-open-transfer').click();

    // Step 1: pick the destination coach — matched by the exact coachId attribute.
    // Text-based matching is unreliable here: coach@forma.test's displayName is
    // literally "coach", a substring several other demo names/emails contain.
    // (id is coach@forma.test's fixed, permanent user id in the demo dataset.)
    const COACH_A_ID = 'b4c03c48-cfc3-4f07-92ef-75149b6c32f9';
    await expect(page.getByTestId('transfer-coach-row').first()).toBeVisible({ timeout: 10_000 });
    const coachRow = page.locator(`[data-testid="transfer-coach-row"][data-coach-id="${COACH_A_ID}"]`);
    await expect(coachRow).toBeVisible({ timeout: 10_000 });
    await coachRow.click();
    await page.getByTestId('transfer-next').click();

    // Step 2: Fresh Start mode (4-step wizard: coach -> type -> subscription handling -> review).
    await expect(page.getByTestId('transfer-type-fresh')).toBeVisible();
    await page.getByTestId('transfer-type-fresh').click();
    await page.getByTestId('transfer-next').click();

    // Step 3: subscription handling — keep the existing term.
    await expect(page.getByTestId('transfer-sub-keep')).toBeVisible();
    await page.getByTestId('transfer-sub-keep').click();
    await page.getByTestId('transfer-next').click();

    // Step 4: review + confirm.
    await expect(page.getByTestId('transfer-review')).toBeVisible();
    await page.getByTestId('transfer-confirm').click();
    await expect(page.getByTestId('transfer-wizard')).not.toBeVisible({ timeout: 15_000 });
  });
});
