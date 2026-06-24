import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';

/**
 * MARKETING LANDING — the anonymous front door at "/". A signed-out visitor
 * sees the landing page (not the bare login form); its CTAs route into the
 * existing auth screen at /login. The page is bilingual (EN/AR + RTL) and must
 * not introduce horizontal scroll on mobile or desktop.
 */
test.describe('Landing page (anonymous)', () => {
  test('renders the hero and "Get started" opens sign-up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId(TID.landingPage)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TID.landingHero)).toBeVisible();

    await page.getByTestId(TID.landingCtaPrimary).click();
    await expect(page).toHaveURL(/\/login\?signup=1$/);
    await expect(page.getByTestId(TID.loginForm)).toBeVisible({ timeout: 15_000 });
    // Sign-up mode → the confirm-password field is present.
    await expect(page.getByTestId(TID.loginConfirm)).toBeVisible();
  });

  test('"Sign in" CTA opens the login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId(TID.landingPage)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(TID.landingCtaSignin).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId(TID.loginForm)).toBeVisible({ timeout: 15_000 });
  });

  test('language toggle flips direction to RTL and back', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId(TID.landingPage)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(TID.landingLangToggle).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId(TID.landingHero)).toBeVisible();
    await page.getByTestId(TID.landingLangToggle).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('no horizontal overflow at mobile and desktop widths', async ({ page }) => {
    for (const size of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(page.getByTestId(TID.landingPage)).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500); // let reveal + lazy images settle
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow ${overflow}px at ${size.width}px`).toBeLessThanOrEqual(1);
    }
  });
});
