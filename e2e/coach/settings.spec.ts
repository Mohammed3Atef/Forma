import { test, expect, AUTH, watchForIssues } from './_helpers';

test.use({ storageState: AUTH('coach') });

test.describe('Coach Account / Settings', () => {
  test('view profile fields; update phone + timezone; verify it persists on reload', async ({ page }, testInfo) => {
    const watch = watchForIssues(page, testInfo);
    await page.goto('/coach/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('coach@forma.test')).toBeVisible();

    const phoneInput = page.locator('input[type="tel"]');
    const timezoneInput = page.locator('input[dir="ltr"][placeholder="Africa/Cairo"]');
    await expect(phoneInput).toBeVisible();
    await expect(timezoneInput).toBeVisible();
    await expect(page.getByTestId('account-currency')).toBeVisible();

    const newPhone = '+201099887766';
    const newTz = 'Africa/Cairo';
    await phoneInput.fill(newPhone);
    await phoneInput.blur();
    await page.waitForTimeout(800);
    await timezoneInput.fill(newTz);
    await timezoneInput.blur();
    await page.waitForTimeout(800);
    await page.getByTestId('account-currency').selectOption('EGP');
    await page.waitForTimeout(800);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input[type="tel"]')).toHaveValue(newPhone);
    await expect(page.locator('input[dir="ltr"][placeholder="Africa/Cairo"]')).toHaveValue(newTz);
    await expect(page.getByTestId('account-currency')).toHaveValue('EGP');

    watch.report();
  });
});
