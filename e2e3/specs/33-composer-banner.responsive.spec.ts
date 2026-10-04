import { test, expect, ready, shot } from '../fixtures';

/**
 * Release-gate regression (found on production): with the read-only
 * subscription banner above the client chat, the fixed-height thread pushed
 * the composer under the bottom nav — the Send button could not be tapped at
 * any width, even after scrolling. The thread now sizes itself from its real
 * top edge. Runs on every responsive project (1280/1024/768/430/390).
 */
test('client with an expired subscription: banner shown AND the composer is reachable and sends', async ({ as, db, env }, testInfo) => {
  const relId = `${env.accounts.coachA.id}__${env.accounts.clientA.id}`;
  const before = await db.findOne<{ subscription: Record<string, unknown> }>('coachClients', { _id: relId });
  try {
    const now = Date.now();
    await db.updateOne('coachClients', { _id: relId }, { $set: { 'subscription.status': 'active', 'subscription.startAt': now - 40 * 86_400_000, 'subscription.endAt': now - 86_400_000 } });
    const { page } = await as('clientA');
    await page.goto('/messages');
    await ready(page);
    await expect(page.getByTestId('subscription-banner')).toBeVisible();
    const send = page.getByTestId('message-send');
    await expect(send).toBeVisible();
    // The element under the Send button's centre must be the button itself (not the bottom nav).
    const hit = await send.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { ok: t === el || el.contains(t), bottom: Math.round(r.bottom), vh: window.innerHeight, at: (t as HTMLElement | null)?.dataset?.testid ?? t?.tagName };
    });
    await shot(page, testInfo, 'composer-with-banner');
    expect(hit.ok, `send covered by ${hit.at} (bottom ${hit.bottom} / viewport ${hit.vh})`).toBe(true);
    const text = `banner-composer ${testInfo.project.name} ${Date.now().toString(36)}`;
    await page.getByTestId('message-input').fill(text);
    await send.click();
    await expect(page.getByTestId('message-bubble').filter({ hasText: text })).toBeVisible({ timeout: 15_000 });
    // No page-level scroll needed to reach the composer.
    const docScroll = await page.evaluate(() => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight);
    expect(docScroll, 'page should not need scrolling to reach the composer').toBeLessThanOrEqual(2);
  } finally {
    if (before) await db.updateOne('coachClients', { _id: relId }, { $set: { subscription: before.subscription } });
  }
});
