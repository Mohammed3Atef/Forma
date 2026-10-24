import { devices, type Page } from '@playwright/test';
import { test, expect, shot } from '../fixtures';

/**
 * B1 — Product foundation browser check (isolated stack, DEV-only showcase at
 * /__foundation). Every B1 primitive at 390 / 430 / 768 / 1024 / 1440 in
 * English and Arabic: no horizontal overflow, correct direction, one visible
 * banner with the rest reachable, accessible names and ≥44px hit areas, the
 * media viewer's honest states, and Arabic-Indic digits accepted by numeric
 * fields. Runs in the chromium-1440 project and sets each width itself.
 */
test.describe.configure({ mode: 'serial', timeout: 240_000 });

const WIDTHS = [390, 430, 768, 1024, 1440] as const;
const LANGS = ['en', 'ar'] as const;

async function noHorizontalOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `page scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
}

/** Smallest dimension of the element's tap area: its box, or its ::before hit area if larger. */
async function hitSize(page: Page, testId: string) {
  return page.getByTestId(testId).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const b = getComputedStyle(el, '::before');
    const bw = b.content !== 'none' && b.position === 'absolute' ? parseFloat(b.width) || 0 : 0;
    const bh = b.content !== 'none' && b.position === 'absolute' ? parseFloat(b.height) || 0 : 0;
    return Math.min(Math.max(r.width, bw), Math.max(r.height, bh));
  });
}

for (const lang of LANGS) {
  test(`foundation kit — ${lang.toUpperCase()} at ${WIDTHS.join(' / ')}`, async ({ anon }, testInfo) => {
    const { page } = await anon({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });
    await page.addInitScript((l) => localStorage.setItem('forma.locale', l), lang);
    await page.goto('/__foundation');
    await expect(page.getByTestId('foundation-showcase')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId(`fs-lang-${lang}`).click();
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(150);
      await test.step(`${width}px`, async () => {
        await noHorizontalOverflow(page);
        for (const id of ['type', 'color', 'buttons', 'status', 'fields', 'banners', 'states', 'sync', 'media', 'nav']) {
          await expect(page.getByTestId(`fs-${id}`)).toBeVisible();
        }

        // One banner region: the most important of three notices shows; the rest are one tap away.
        const region = page.getByTestId('fs-banners').getByTestId('banner-region');
        await expect(region.getByTestId('fs-notice-conflict')).toBeVisible();
        await expect(region.getByTestId('fs-notice-subscription')).toHaveCount(0);
        await expect(region.getByTestId('fs-notice-announcement')).toHaveCount(0);
        const more = region.getByTestId('banner-region-more');
        await expect(more).toHaveAttribute('aria-expanded', 'false');
        await more.click();
        await expect(region.getByTestId('fs-notice-subscription')).toBeVisible();
        await expect(region.getByTestId('fs-notice-announcement')).toBeVisible();
        await more.click();
        await expect(region.getByTestId('fs-notice-subscription')).toHaveCount(0);

        // Accessible names + hit areas (B1.14).
        await expect(page.getByTestId('fs-iconbutton')).toHaveAttribute('aria-label', /.+/);
        expect(await hitSize(page, 'fs-iconbutton')).toBeGreaterThanOrEqual(44);
        expect(await hitSize(page, 'banner-region-more')).toBeGreaterThanOrEqual(44);
        const unnamed = await page.getByTestId('foundation-showcase').evaluate((root) =>
          [...root.querySelectorAll('button, a[href], input, textarea, select')]
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .filter((el) => {
              const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el as HTMLElement).innerText?.trim();
              const id = el.getAttribute('id');
              const forLabel = id ? root.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
              return !label && !forLabel && !el.closest('label');
            })
            .map((el) => el.outerHTML.slice(0, 120)),
        );
        expect(unnamed, 'every visible control has an accessible name').toEqual([]);

        await shot(page, testInfo, `${lang}-${width}`);
      });
    }

    // Arabic-Indic digits typed into a numeric field are understood.
    const numeric = page.getByTestId('fs-numeric');
    await numeric.fill('٧٣٫٥');
    await numeric.blur();
    await expect(numeric).toHaveValue(/73[.,]5|٧٣٫٥/);

    // Media viewer: honest states, Esc closes.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('fs-open-image').click();
    await expect(page.getByTestId('image-viewer')).toBeVisible();
    await expect(page.getByTestId('media-item')).toHaveAttribute('data-state', 'ready');
    await shot(page, testInfo, `${lang}-media-image`);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('image-viewer')).toHaveCount(0);
    await page.getByTestId('fs-open-video').click();
    await expect(page.getByTestId('video-popup')).toBeVisible();
    await expect(page.getByTestId('video-unsupported')).toBeVisible();
    await page.getByTestId('video-popup-close').click();
    await page.getByTestId('fs-open-file').click();
    await expect(page.getByTestId('media-unsupported')).toBeVisible();
    await expect(page.getByTestId('media-open')).toHaveAttribute('href', 'https://cdn.example/plan.pdf');
    await page.keyboard.press('Escape');
  });
}
