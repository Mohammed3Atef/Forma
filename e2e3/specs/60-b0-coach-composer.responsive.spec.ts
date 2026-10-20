import type { Page } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';

/**
 * B0 / CO-04 / MS-01 — the coach thread composer must stay reachable above the
 * bottom nav when a plan banner renders above the thread (the client fix,
 * cf3a5d9, was never applied to the coach thread). Runs on every responsive
 * project (1280/1024/768/430/390), in English and Arabic (RTL).
 *
 * B3.2 (owner O-6): "term ending" is now a notice on Today only, so the
 * banner that sits above the thread here is the over-capacity one — still
 * app-wide because it blocks work. Same guarantee, same geometry checks.
 *
 * B3.6 (contract C12 re-certified): ≥ 768 the conversation is the split
 * view's pane, sized from its real top edge below the banner; on phones the
 * conversation is a full-screen task ABOVE the shell (no tab bar, no banner
 * over it — MS-01 / MS-03), so the banner stays on the other coach screens.
 */
test.describe.configure({ timeout: 180_000 });

async function sendIsReachable(page: Page) {
  const send = page.getByTestId('message-send');
  await expect(send).toBeVisible();
  return send.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { ok: t === el || el.contains(t), bottom: Math.round(r.bottom), vh: window.innerHeight, at: (t as HTMLElement | null)?.dataset?.testid ?? t?.tagName };
  });
}

async function setCoachLocale(page: Page, locale: 'en' | 'ar') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: locale === 'en' ? 'English' : 'العربية', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(locale === 'en' ? /^en/ : /^ar/);
  await page.waitForTimeout(600); // let the profile save land
}

for (const locale of ['en', 'ar'] as const) {
  test(`coach thread with an app-wide plan banner: composer reachable and sends (${locale})`, async ({ as, db, env }, testInfo) => {
    const coachId = env.accounts.coachA.id;
    const before = await db.findOne<{ activeClientCount?: number }>('coachPlans', { _id: coachId });
    try {
      // Over capacity (3 active on a 2-client plan, e.g. an add-on expired) — a banner on every screen (BV-14 geometry).
      await db.updateOne('coachPlans', { _id: coachId }, { $set: { activeClientCount: 3 } });
      const { page } = await as('coachA');
      if (locale === 'ar') await setCoachLocale(page, 'ar');
      await page.goto(`/coach/messages/${env.accounts.clientA.id}`);
      await ready(page);
      await expect(page.getByTestId('coach-capacity-banner')).toBeAttached({ timeout: 20_000 });
      await expect(page.getByTestId('coach-thread')).toBeVisible();
      // Let the banner settle, then the column re-measures.
      await page.waitForTimeout(300);
      const wide = (page.viewportSize()?.width ?? 0) >= 768;
      if (wide) {
        // The banner is shown above the split view and never overlaps the conversation.
        await expect(page.getByTestId('coach-capacity-banner')).toBeVisible();
        const banner = (await page.getByTestId('coach-capacity-banner').boundingBox())!;
        const pane = (await page.getByTestId('coach-thread').boundingBox())!;
        expect(banner.y + banner.height).toBeLessThanOrEqual(pane.y + 1);
      } else {
        // Full-screen task: it covers the whole viewport, the tab bar and the banner stay underneath.
        const layer = (await page.getByTestId('coach-thread').boundingBox())!;
        expect(layer.y).toBe(0);
        expect(Math.round(layer.y + layer.height)).toBe(page.viewportSize()!.height);
      }
      const hit = await sendIsReachable(page);
      await shot(page, testInfo, `coach-composer-banner-${locale}`);
      expect(hit.ok, `send covered by ${hit.at} (bottom ${hit.bottom} / viewport ${hit.vh})`).toBe(true);
      expect(hit.bottom).toBeLessThanOrEqual(hit.vh);

      const text = `coach-banner-composer ${locale} ${testInfo.project.name} ${Date.now().toString(36)}`;
      await page.getByTestId('message-input').fill(text);
      await page.getByTestId('message-send').click();
      await expect(page.getByTestId('message-bubble').filter({ hasText: text })).toBeVisible({ timeout: 15_000 });
      const docScroll = await page.evaluate(() => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight);
      expect(docScroll, 'page should not need scrolling to reach the composer').toBeLessThanOrEqual(2);
      if (locale === 'ar') {
        expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
        await setCoachLocale(page, 'en');
      }
    } finally {
      if (before) await db.updateOne('coachPlans', { _id: coachId }, { $set: { activeClientCount: before.activeClientCount ?? 1 } });
    }
  });
}
