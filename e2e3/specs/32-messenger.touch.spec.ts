import { test, expect, ready, shot } from '../fixtures';
import type { Locator, Page } from '@playwright/test';
import { CLIENT_A, allowDevModuleStorm, insertMany, seedMessage, pollDb } from './_c-helpers';

/**
 * Messenger on touch devices (<768 px): message actions open via a touch
 * long-press (pointer events, 450 ms, cancelled by > 10 px movement) into a
 * bottom sheet. Runs on `webkit-iphone` (real WebKit) and `mobile-390`.
 *
 * Long-press input: on Chromium a REAL touch sequence via CDP
 * (Input.dispatchTouchEvent → genuine pointer/touch/contextmenu/selection
 * behaviour). WebKit has no CDP, so there the same sequence is dispatched as
 * PointerEvents with pointerType "touch" on the bubble (what the app listens to).
 */

const bubble = (page: Page, text: string) => page.getByTestId('message-bubble').filter({ hasText: text });
/** The element carrying the pointer handlers: the parent of the (hidden on mobile) ⋮ trigger. */
const pressTarget = (b: Locator) => b.getByTestId('message-actions-trigger').locator('..');

async function longPress(page: Page, target: Locator, opts: { holdMs?: number; moveBy?: number; synthetic?: boolean } = {}): Promise<{ sheetMidHold: boolean }> {
  const hold = opts.holdMs ?? 600;
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const browserName = page.context().browser()?.browserType().name();
  const sheetNow = async () => (await page.getByRole('dialog', { name: 'Message actions' }).count()) > 0;
  if (browserName === 'chromium' && !opts.synthetic) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    if (opts.moveBy) {
      await page.waitForTimeout(80);
      for (let d = 4; d <= opts.moveBy; d += 4) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + d, id: 1 }] });
      }
    }
    await page.waitForTimeout(hold);
    const sheetMidHold = await sheetNow();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return { sheetMidHold };
  }
  let sheetMidHold = false;
  const done = target.evaluate(
    async (el, { hold, moveBy, x, y }) => {
      const fire = (type: string, cx: number, cy: number) =>
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: cx, clientY: cy }));
      fire('pointerdown', x, y);
      if (moveBy) {
        await new Promise((r) => setTimeout(r, 80));
        for (let d = 4; d <= moveBy; d += 4) fire('pointermove', x, y + d);
      }
      await new Promise((r) => setTimeout(r, hold));
      fire('pointerup', x, y + (moveBy ?? 0));
    },
    { hold, moveBy: opts.moveBy ?? 0, x, y },
  );
  await page.waitForTimeout(Math.max(0, hold - 60));
  sheetMidHold = await sheetNow();
  await done;
  return { sheetMidHold };
}

test.describe('messenger touch', () => {
  test.beforeEach(async ({ db, audit }) => {
    allowDevModuleStorm(audit);
    await db.deleteMany('messages', { clientId: CLIENT_A });
  });
  test.afterAll(async () => {
    const stub = `http://127.0.0.1:${process.env.E2E_STUB_PORT ?? '5299'}`;
    await fetch(`${stub}/__e2e/db`, { method: 'POST', body: JSON.stringify({ op: 'deleteMany', collection: 'messages', filter: { clientId: CLIENT_A } }) });
  });

  test('long-press opens the action sheet; a moving press does not; no text selected; react works; composer visible', async ({ as, db }, testInfo) => {
    test.setTimeout(120_000);
    const now = Date.now();
    await insertMany('messages', Array.from({ length: 12 }, (_, i) => seedMessage(i + 1, now - (13 - i) * 60_000)));
    const { page } = await as('clientA');
    await page.goto('/messages');
    await ready(page);
    const vp = page.viewportSize()!;
    expect(vp.width).toBeLessThan(768);

    // Composer stays visible, above the bottom edge, and is not covered.
    const input = page.getByTestId('message-input');
    await expect(input).toBeVisible();
    const ib = (await input.boundingBox())!;
    expect(ib.y + ib.height, 'composer bottom within the viewport').toBeLessThanOrEqual(vp.height);
    const hit = await page.evaluate(([cx, cy]) => {
      const el = document.elementFromPoint(cx, cy);
      return el?.getAttribute('data-testid') ?? el?.tagName ?? null;
    }, [ib.x + ib.width / 2, ib.y + ib.height / 2]);
    expect(hit, 'composer is the top-most element at its own centre').toBe('message-input');
    await expect(page.getByTestId('message-send')).toBeInViewport();
    await shot(page, testInfo, '01-thread-mobile');

    // Send our own message (tap Send — Enter inserts a newline on coarse pointers).
    await input.fill('C touch own message');
    await page.getByTestId('message-send').tap();
    const own = bubble(page, 'C touch own message');
    await expect(own).toBeVisible();
    await expect(page.getByTestId('message-bubble-pending')).toHaveCount(0, { timeout: 15_000 });
    // Composer still visible after sending.
    await expect(input).toBeInViewport();

    // A press that MOVES > 10 px is a scroll, not a long-press.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const mv = await longPress(page, pressTarget(bubble(page, 'seed-012')), { moveBy: 24 });
    expect(mv.sheetMidHold, 'moving press must not open the sheet (even briefly)').toBe(false);
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog', { name: 'Message actions' }), 'moving press must not open the sheet').toHaveCount(0);

    // A still long-press on our own bubble opens the action sheet.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const lp = await longPress(page, pressTarget(own), { holdMs: 600 });
    const sheet = page.getByRole('dialog', { name: 'Message actions' });
    expect(lp.sheetMidHold, 'sheet opened while the finger is still down (450 ms timer)').toBe(true);
    await page.waitForTimeout(400);
    // The sheet must STAY open once the finger lifts.
    const openAfterRelease = (await sheet.count()) > 0;
    await shot(page, testInfo, '02a-after-release');
    expect.soft(openAfterRelease, 'action sheet still open after lifting the finger').toBe(true);
    if (!openAfterRelease) {
      testInfo.annotations.push({ type: 'sheet-closed-on-release', description: 'release click landed on the sheet backdrop; reopening with a click-free synthetic press to test the rest' });
      // The release tap may instead have ACTIVATED the action under the finger (e.g. Edit).
      const editing = page.getByTestId('message-thread').getByRole('button', { name: 'Cancel' });
      const activated = await editing.isVisible().catch(() => false);
      testInfo.annotations.push({ type: 'release-activated-edit', description: String(activated) });
      if (activated) await editing.tap();
      await longPress(page, pressTarget(own), { holdMs: 600, synthetic: true });
    }
    await expect(sheet).toBeVisible();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selected, 'long-press must not select text').toBe('');
    await expect(page.getByTestId('desktop-message-menu')).toHaveCount(0);
    await expect(sheet.getByTestId('action-edit')).toBeVisible();
    await expect(sheet.getByTestId('action-delete')).toBeVisible();
    await shot(page, testInfo, '02-action-sheet');
    // Sheet sits within the viewport.
    const sb = (await page.getByTestId('sheet-panel').boundingBox())!;
    expect(sb.y + sb.height).toBeLessThanOrEqual(vp.height + 1);

    // React from the sheet.
    await sheet.getByTestId('reaction-pick').filter({ hasText: '❤️' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(own.getByTestId('reaction-chip')).toContainText('❤️');
    const rec = await pollDb(() => db.findOne<{ reactions?: Record<string, string> }>('messages', { clientId: CLIENT_A, body: 'C touch own message' }), (r) => !!r?.reactions);
    expect(rec?.reactions).toEqual({ [CLIENT_A]: '❤️' });
    await page.waitForTimeout(11_000); // two poll ticks: the reaction must not flicker away
    await expect(own.getByTestId('reaction-chip')).toContainText('❤️');
    await shot(page, testInfo, '03-reacted');

    // Long-press on the coach's (theirs) bubble: sheet opens without Edit/Delete.
    const lp2 = await longPress(page, pressTarget(bubble(page, 'seed-011')));
    expect(lp2.sheetMidHold).toBe(true);
    await page.waitForTimeout(400);
    if ((await sheet.count()) === 0) {
      const editing = page.getByTestId('message-thread').getByRole('button', { name: 'Cancel' });
      if (await editing.isVisible().catch(() => false)) await editing.tap();
      await longPress(page, pressTarget(bubble(page, 'seed-011')), { synthetic: true });
    }
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('action-edit')).toHaveCount(0);
    await expect(sheet.getByTestId('action-delete')).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    await page.getByTestId('sheet-close').tap();
    await expect(sheet).toHaveCount(0);
    await expect(input).toBeInViewport();
  });
});
