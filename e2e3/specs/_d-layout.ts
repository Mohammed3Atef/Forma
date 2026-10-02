import fs from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Role } from '../fixtures';
import { overflow } from './_d-helpers';

/**
 * Layout + RTL checks shared by `45-layout.responsive.spec.ts` (1280/1024/768/430/390)
 * and `44-layout-1440.spec.ts` (1440). Language is switched through the REAL UI
 * controls (client Settings › Preferences segmented control; coach/admin
 * account page chips; landing header toggle) and restored to English after.
 */
const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const tr = (dict: Record<string, unknown>, key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict) as string;

type Pg = { path: string; name: string };
const PAGES: Record<'client' | 'coach' | 'super', { role: Role; pages: Pg[] }> = {
  client: { role: 'clientA', pages: [{ path: '/', name: 'client-home' }, { path: '/workout', name: 'client-workout' }, { path: '/progress', name: 'client-progress' }, { path: '/messages', name: 'client-messages' }] },
  coach: {
    role: 'coachA',
    pages: [
      { path: '/coach/dashboard', name: 'coach-dashboard' },
      { path: '/coach/clients', name: 'coach-clients' },
      { path: '/coach/client/e2e-client-a', name: 'coach-client-workspace' },
      { path: '/coach/messages/e2e-client-a', name: 'coach-thread' },
    ],
  },
  super: { role: 'super', pages: [{ path: '/admin', name: 'admin-overview' }, { path: '/admin/accounts', name: 'admin-accounts' }, { path: '/admin/coaches', name: 'admin-coaches' }] },
};
const NAV_KEYS = {
  client: ['today', 'fuel', 'train', 'progress', 'inbox'],
  coach: ['coachDashboard', 'coachClients', 'coachMessages', 'coachRevenue'],
  super: ['adminOverview', 'adminAccounts', 'adminCoaches'],
};

async function settle(page: Page) {
  await ready(page);
  await page.waitForTimeout(400);
}

/** Bottom nav vs sidebar by breakpoint. Client shell is a phone-width column with the bottom nav at EVERY width (by design, AppShell max-w-md). */
async function navCheck(page: Page, kind: 'client' | 'coach' | 'super') {
  const w = page.viewportSize()!.width;
  const bottom = page.getByTestId('bottom-nav');
  const side = page.getByTestId('coach-sidebar');
  if (kind === 'client') {
    await expect(bottom).toBeVisible();
    return { bottom: true, sidebar: false };
  }
  if (w < 768) {
    await expect(bottom).toBeVisible();
    await expect(side).toBeHidden();
  } else {
    await expect(side).toBeVisible();
    await expect(bottom).toBeHidden();
  }
  return { bottom: w < 768, sidebar: w >= 768 };
}

/** Nav labels whose text is cut (overflow hidden + scrollWidth > clientWidth). */
async function clippedNav(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="bottom-nav"] *, [data-testid="coach-sidebar"] a *'))
      .filter((el) => {
        const e = el as HTMLElement;
        if (!e.textContent?.trim() || e.children.length > 0 || e.offsetParent === null) return false;
        const cs = getComputedStyle(e);
        return (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1;
      })
      .map((e) => (e as HTMLElement).textContent?.trim()),
  );
}

/** Labels shown in the role's nav right now (bottom-nav text / sidebar title). */
async function navLabels(page: Page, kind: 'client' | 'coach' | 'super') {
  const out: Record<string, string> = {};
  for (const k of NAV_KEYS[kind]) {
    const b = page.getByTestId(`nav-${k}`);
    const s = page.getByTestId(`sidebar-${k}`);
    if (await b.isVisible().catch(() => false)) out[k] = ((await b.innerText()).trim() || (await b.getAttribute('aria-label')) || '').trim();
    else if (await s.isVisible().catch(() => false)) out[k] = ((await s.getAttribute('title')) || (await s.innerText())).trim();
  }
  return out;
}

async function switchLanguage(page: Page, kind: 'client' | 'coach' | 'super', locale: 'en' | 'ar' | 'ar-eg') {
  if (kind === 'client') {
    await page.goto('/settings?tab=preferences');
    await settle(page);
    const label = locale === 'en' ? 'EN' : locale === 'ar' ? 'ع' : 'مصري';
    await page.locator('.seg button', { hasText: new RegExp(`^${label}$`) }).click();
  } else {
    await page.goto(kind === 'coach' ? '/coach/settings' : '/admin/settings');
    await settle(page);
    const label = locale === 'en' ? 'English' : locale === 'ar' ? 'العربية' : 'مصري';
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(locale === 'en' ? /^en/ : /^ar/);
  await page.waitForTimeout(600); // let the profile save land before navigating away
}

async function chevronFlipped(page: Page) {
  const back = page.getByRole('button', { name: tr(ar, 'common.back'), exact: true }).first();
  await expect(back).toBeVisible();
  return back.evaluate((b) => {
    const svg = b.querySelector('svg') as SVGElement | null;
    const t = svg ? getComputedStyle(svg).transform : 'none';
    const m = t.match(/matrix\(([^,]+),/);
    return { transform: t, flipped: !!m && Number(m[1]) < 0 };
  });
}

export function defineLayoutTests() {
  // Pages that poll keep networkidle busy and the shared machine runs 4 suites at once — give each journey room.
  test.describe.configure({ timeout: 180_000 });
  test('anon landing + login: no horizontal overflow', async ({ anon }, testInfo) => {
    const { page } = await anon();
    const res: Record<string, unknown> = {};
    for (const p of ['/', '/login']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      await shot(page, testInfo, `anon${p === '/' ? '-landing' : '-login'}`, true);
      res[p] = await overflow(page);
    }
    await testInfo.attach('overflow.json', { body: JSON.stringify(res, null, 2), contentType: 'application/json' });
    for (const [p, o] of Object.entries(res)) expect((o as { ok: boolean }).ok, `${p} overflow ${JSON.stringify(o)}`).toBe(true);
  });

  for (const kind of ['client', 'coach', 'super'] as const) {
    test(`${kind}: pages fit, nav per breakpoint, labels not clipped (EN)`, async ({ as }, testInfo) => {
      const { page } = await as(PAGES[kind].role);
      const res: Record<string, unknown> = {};
      for (const p of PAGES[kind].pages) {
        await page.goto(p.path);
        await settle(page);
        await shot(page, testInfo, `${p.name}-en`, true);
        res[p.name] = { overflow: await overflow(page), nav: await navCheck(page, kind), clipped: await clippedNav(page) };
      }
      await testInfo.attach('layout.json', { body: JSON.stringify(res, null, 2), contentType: 'application/json' });
      for (const [n, r] of Object.entries(res) as [string, { overflow: { ok: boolean }; clipped: string[] }][]) {
        expect.soft(r.overflow.ok, `${n} horizontal overflow ${JSON.stringify(r.overflow)}`).toBe(true);
        expect.soft(r.clipped, `${n} clipped nav labels`).toEqual([]);
      }
    });
  }

  test('coach Add client sheet opens fully on screen', async ({ as }, testInfo) => {
    const { page } = await as('coachA');
    await page.goto('/coach/clients');
    await settle(page);
    await page.getByTestId('coach-add-client').click();
    const panel = page.getByTestId('sheet-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('add-client-chooser')).toBeVisible();
    await page.waitForTimeout(500); // slide-in animation
    await shot(page, testInfo, 'add-client-sheet');
    const box = await panel.boundingBox();
    const vp = page.viewportSize()!;
    // Last actionable control of the sheet (its de-facto footer) must be inside the viewport.
    const last = page.getByTestId('add-choose-existing');
    await expect(last).toBeInViewport();
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  });

  for (const kind of ['client', 'coach', 'super'] as const) {
    test(`${kind}: Arabic via the real language control — rtl, nav/CTA translated, charts ltr, chevrons flipped`, async ({ as, db }, testInfo) => {
      // Client: three weigh-ins (test-owned sync records, removed after) so /progress draws a real chart.
      const seeded: string[] = [];
      if (kind === 'client') {
        for (const daysAgo of [14, 7, 1]) {
          const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
          const _id = `e2e-client-a__weightLogs__${date}`;
          seeded.push(_id);
          await db.deleteMany('syncRecords', { _id });
          await db.insertOne('syncRecords', { _id, clientId: 'e2e-client-a', collection: 'weightLogs', data: { id: date, date, weightKg: 70 - daysAgo / 7, updatedAt: Date.now(), dirty: false }, updatedAt: Date.now(), syncedAt: Date.now() });
        }
      }
      const { page } = await as(PAGES[kind].role);
      await page.goto(kind === 'client' ? '/' : kind === 'coach' ? '/coach/dashboard' : '/admin');
      await settle(page);
      try {
        await switchLanguage(page, kind, 'ar');
        const res: Record<string, unknown> = {};
        for (const p of PAGES[kind].pages) {
          await page.goto(p.path);
          await settle(page);
          await shot(page, testInfo, `${p.name}-ar`, true);
          const dir = await page.evaluate(() => document.documentElement.dir);
          const labels = await navLabels(page, kind);
          const leaked = Object.entries(labels).filter(([k, v]) => v === tr(en, `nav.${k}`));
          const r: Record<string, unknown> = { dir, overflow: await overflow(page), labels, leaked, clipped: await clippedNav(page) };
          if (p.path === '/progress') {
            await expect.poll(() => page.locator('main div.relative[dir="ltr"] ul.sr-only li').count(), { timeout: 15_000 }).toBeGreaterThan(1).catch(() => undefined);
            r.charts = await page.evaluate(() => Array.from(document.querySelectorAll('main [dir="ltr"]')).length);
            // Chronology: the weight line's points, in physical left→right order, must be oldest→newest.
            r.chronology = await page.evaluate(() => {
              const ul = document.querySelector('main div.relative[dir="ltr"] ul.sr-only');
              const box = document.querySelector('main div.relative[dir="ltr"]') as HTMLElement | null;
              return { items: ul ? Array.from(ul.querySelectorAll('li')).map((l) => l.textContent) : [], direction: box ? getComputedStyle(box).direction : null };
            });
          }
          if (p.path === '/coach/client/e2e-client-a' || p.path === '/coach/messages/e2e-client-a') r.chevron = await chevronFlipped(page);
          if (p.path === '/coach/clients') r.addClientLabel = await page.getByTestId('coach-add-client').getAttribute('aria-label');
          res[p.name] = r;
        }
        await testInfo.attach('rtl.json', { body: JSON.stringify(res, null, 2), contentType: 'application/json' });
        for (const [n, r] of Object.entries(res) as [string, Record<string, unknown>][]) {
          expect.soft(r.dir, `${n} dir`).toBe('rtl');
          expect.soft((r.overflow as { ok: boolean }).ok, `${n} overflow ${JSON.stringify(r.overflow)}`).toBe(true);
          expect.soft(Object.keys(r.labels as object).length, `${n} nav labels found`).toBeGreaterThan(0);
          expect.soft(r.leaked, `${n} English nav labels in Arabic UI`).toEqual([]);
          expect.soft(r.clipped, `${n} clipped nav labels`).toEqual([]);
          if ('charts' in r) {
            expect.soft(r.charts as number, `${n} chart containers with dir=ltr`).toBeGreaterThan(0);
            const c = r.chronology as { items: string[]; direction: string };
            expect.soft(c.direction, `${n} chart computed direction`).toBe('ltr');
            expect.soft(c.items.length, `${n} chart points`).toBe(3);
            // Seeded 68 kg (14d ago) → 69 (7d) → 69.86 (1d): list order == physical left→right order under dir=ltr.
            expect.soft(c.items.map((i) => i.match(/(\d+(\.\d+)?)\s/)?.[1]?.slice(0, 2)), `${n} oldest→newest`).toEqual(['68', '69', '69']);
            expect.soft(c.items[2], `${n} newest last`).toMatch(/69\.8/);
          }
          if ('chevron' in r) expect.soft((r.chevron as { flipped: boolean }).flipped, `${n} back chevron mirrored ${JSON.stringify(r.chevron)}`).toBe(true);
          if ('addClientLabel' in r) expect.soft(r.addClientLabel).not.toBe(tr(en, 'coach.addClient'));
        }
      } finally {
        await switchLanguage(page, kind, 'en').catch(() => undefined);
        for (const _id of seeded) await db.deleteMany('syncRecords', { _id });
      }
    });
  }

  test('ar-eg on client home + coach dashboard', async ({ as }, testInfo) => {
    const res: Record<string, unknown> = {};
    for (const [kind, path] of [['client', '/'], ['coach', '/coach/dashboard']] as const) {
      const { page } = await as(PAGES[kind].role);
      await page.goto(path);
      await settle(page);
      try {
        await switchLanguage(page, kind, 'ar-eg');
        await page.goto(path);
        await settle(page);
        await shot(page, testInfo, `${kind}-ar-eg`, true);
        const labels = await navLabels(page, kind);
        res[kind] = { dir: await page.evaluate(() => document.documentElement.dir), lang: await page.evaluate(() => document.documentElement.lang), labels, overflow: await overflow(page), leaked: Object.entries(labels).filter(([k, v]) => v === tr(en, `nav.${k}`)) };
      } finally {
        await switchLanguage(page, kind, 'en').catch(() => undefined);
      }
    }
    await testInfo.attach('ar-eg.json', { body: JSON.stringify(res, null, 2), contentType: 'application/json' });
    for (const [k, r] of Object.entries(res) as [string, Record<string, unknown>][]) {
      expect.soft(r.dir, k).toBe('rtl');
      expect.soft(r.leaked, k).toEqual([]);
      expect.soft((r.overflow as { ok: boolean }).ok, `${k} overflow`).toBe(true);
    }
  });
}

export type { TestInfo };
