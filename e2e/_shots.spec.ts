import { test } from './fixtures/test';

const DIR = 'C:/Users/moham/AppData/Local/Temp/claude/d--Gym/ee2eab21-d79d-4e36-9f40-1c4a14cb70b4/scratchpad';

test('shots', async ({ page }) => {
  // Desktop LTR
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByTestId('landing-page').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/landing-desktop.png`, fullPage: true });

  // Mobile LTR
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('landing-page').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/landing-mobile.png`, fullPage: true });

  // Desktop RTL
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByTestId('landing-lang-toggle').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/landing-rtl.png`, fullPage: true });
});
