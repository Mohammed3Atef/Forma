import { test, expect, ready, shot } from '../fixtures';
import { CLIENT_A, allowDevModuleStorm } from './_c-helpers';

/**
 * B3.6 — the coach's conversation on touch phones (mobile-390, mobile-430 and
 * real WebKit on an iPhone profile): a full-screen task above the shell (no
 * tab bar under the composer, one bottom safe area), the composer reachable
 * and sending by tap, long-press opening the message menu, Back to the inbox.
 * Physical keyboards / home indicators are R-17 (a real-device check).
 */
const TAG = 'b36-touch';

test.describe('coach conversation on a touch phone', () => {
  test.beforeEach(async ({ audit }) => allowDevModuleStorm(audit));
  test.afterAll(async ({ db }) => {
    await db.deleteMany('messages', { clientId: CLIENT_A, body: { $regex: `^${TAG}` } });
  });

  test('full-screen thread: composer reachable, tap to send, long-press menu, Back to the inbox', async ({ as }, testInfo) => {
    const { page } = await as('coachA');
    await page.goto('/coach/messages');
    await ready(page);
    const row = page.locator(`[data-testid="thread-row"][data-client-id="${CLIENT_A}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.tap();
    await expect(page).toHaveURL(new RegExp(`/coach/messages/${CLIENT_A}$`));
    const layer = page.getByTestId('coach-thread');
    await expect(layer).toBeVisible();
    const geo = await page.evaluate(() => {
      const l = document.querySelector('[data-testid="coach-thread"]')!.getBoundingClientRect();
      const s = document.querySelector('[data-testid="message-send"]')!.getBoundingClientRect();
      const hit = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2);
      return { top: l.top, bottom: Math.round(l.bottom), vh: window.innerHeight, sendBottom: s.bottom, hit: (hit as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid') };
    });
    expect(geo.top).toBe(0);
    expect(geo.bottom).toBe(geo.vh);
    expect(geo.hit).toBe('message-send');
    expect(geo.sendBottom).toBeLessThanOrEqual(geo.vh);

    const text = `${TAG} ${testInfo.project.name} ${Date.now().toString(36)}`;
    await page.getByTestId('message-input').tap();
    await page.getByTestId('message-input').fill(text);
    await page.getByTestId('message-send').tap();
    const mine = page.getByTestId('message-bubble').filter({ hasText: text });
    await expect(mine).toBeVisible({ timeout: 15_000 });
    await shot(page, testInfo, `thread-${testInfo.project.name}`);

    // Long-press opens the message's actions as a sheet with a real menu inside.
    await mine.locator('p').first().dispatchEvent('contextmenu');
    const sheet = page.getByRole('dialog', { name: 'Message actions' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('menu')).toBeVisible();
    await page.getByTestId('sheet-close').last().tap();
    await expect(sheet).toHaveCount(0);

    await page.getByTestId('thread-back').tap();
    await expect(page).toHaveURL(/\/coach\/messages$/);
    await expect(row).toBeVisible();
  });
});
