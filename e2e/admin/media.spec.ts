import { test, expect } from '@playwright/test';
import { AUTH, trackIssues, reportIssues } from './_helpers';

/**
 * AdminMedia: super-admin, read-only oversight gallery of every client
 * progress/assessment photo uploaded to the CDN, grouped by client. No
 * search/filter UI exists on this page (confirmed by reading the component) —
 * this test covers load state + (if any images exist) that they render.
 */
test.describe('Super admin: Media', () => {
  test.use({ storageState: AUTH('super') });

  test('loads the media gallery (configured, empty, or populated)', async ({ page }) => {
    const issues = trackIssues(page, 'media');
    await page.goto('/admin/media');
    await page.waitForLoadState('networkidle');

    const body = await page.locator('body').innerText();
    const notConfigured = body.includes("isn't configured");
    const empty = body.includes('No images uploaded yet');
    const loadFailed = body.includes("Couldn't load images");
    const items = await page.getByTestId('admin-media-item').count();

    test.info().annotations.push({
      type: 'note',
      description: `Media page state: notConfigured=${notConfigured} empty=${empty} loadFailed=${loadFailed} imageItems=${items}`,
    });
    expect(loadFailed, 'media page reported a load failure').toBe(false);
    expect(notConfigured || empty || items > 0).toBe(true);

    if (items > 0) {
      // Every image should link out to a real (non-empty) CDN URL.
      const href = await page.getByTestId('admin-media-item').first().getAttribute('href');
      expect(href).toBeTruthy();
    }

    reportIssues(issues, 'media');
  });
});
