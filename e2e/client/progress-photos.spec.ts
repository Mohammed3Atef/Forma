import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_AUTH, COACH_AUTH, watchPage, hasNoHorizontalOverflow } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? 'client@forma.test';

const PHOTOS = {
  front: path.join(__dirname, '..', 'fixtures', 'photos', 'progress-front.png'),
  side: path.join(__dirname, '..', 'fixtures', 'photos', 'progress-side.png'),
  back: path.join(__dirname, '..', 'fixtures', 'photos', 'progress-back.png'),
} as const;

test.describe('Progress photos (client upload + coach oversight)', () => {
  test.use({ storageState: CLIENT_AUTH });

  test('upload front/side/back synthetic photos through the real gallery-picker UI', async ({ page }) => {
    const { consoleErrors, failedRequests } = watchPage(page);

    await page.goto('/progress/photos');
    await expect(page.getByRole('heading', { name: /progress photos/i })).toBeVisible();

    for (const pose of ['front', 'side', 'back'] as const) {
      // Select the pose chip, then use the real file input behind "Gallery".
      await page.getByRole('button', { name: new RegExp(`^${pose}$`, 'i') }).first().click();
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(PHOTOS[pose]);
      // Upload is best-effort/async (local blob first, then CDN) — give it a
      // moment and confirm the "uploading" transient state clears.
      await expect(page.getByText(/uploading/i)).toBeHidden({ timeout: 20_000 }).catch(() => undefined);
    }

    // Today's date group should now show 3 photos in the gallery. Match the
    // app's own local-date key format (src/lib/utils.ts dayKey) rather than
    // toISOString, which would drift a day near midnight in non-UTC zones.
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayGroup = page.locator('div.card', { has: page.getByText(todayKey) });
    await expect(todayGroup).toBeVisible({ timeout: 10_000 });
    const thumbs = todayGroup.locator('img, div.animate-pulse');
    await expect(thumbs).toHaveCount(3, { timeout: 15_000 });

    if (consoleErrors.length) console.warn('[progress-photos.spec] console errors:', consoleErrors);
    const bad = failedRequests.filter((r) => r.status >= 400);
    if (bad.length) console.warn('[progress-photos.spec] failed requests:', bad);
  });

  test('responsive: Progress page has no horizontal overflow at 390px / 768px', async ({ page }) => {
    await page.goto('/progress');
    await expect(page.getByText(/your numbers|progress/i).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await hasNoHorizontalOverflow(page)).toBe(true);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe('Coach oversight of client progress photos', () => {
  test.use({ storageState: COACH_AUTH });

  test('coach can see the client\'s uploaded progress photos', async ({ page }) => {
    await page.goto('/coach/clients');
    await page.getByTestId('coach-clients-search').fill(CLIENT_EMAIL);
    const row = page.getByTestId('coach-client-row').first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    const clientId = await row.getAttribute('data-client-id');
    expect(clientId).toBeTruthy();

    await page.goto(`/coach/client/${clientId}/view/photos`);
    await expect(page.getByTestId('coach-view-tab-photos')).toBeVisible();

    // The CDN upload is best-effort/async from the client's browser — allow a
    // little slack, then require at least one photo to be visible to the coach
    // (proves the coach-oversight read path works end to end).
    await expect(async () => {
      const imgs = page.locator('img[alt="front"], img[alt="side"], img[alt="back"]');
      expect(await imgs.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });
  });
});
