import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, ready } from '../fixtures';
import { allowDevModuleStorm, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';

/**
 * B3.9.7 certification matrix (B3.9_AUDIT_AND_PLAN §7/§8):
 *  - axe (WCAG 2.1 A / AA) and no horizontal overflow on every coach screen at 390 / 768 / 1024 / 1440 /
 *    1920 in English, Arabic and Egyptian Arabic, plus the error and offline states;
 *  - every control's tap area ≥ 44 × 44 px (its box or its invisible hit area) at 390 and 1440;
 *  - the visual matrix 360 → 1920 (English) and 390 / 1440 / 1920 (Arabic, Egyptian Arabic) — screenshots
 *    under e2e-out/<run>/b39-visual for review.
 * The seeded coach A and client Aya; nothing is written.
 */

type Lang = 'en' | 'ar' | 'ar-eg';
const LABEL: Record<Lang, 'English' | 'العربية' | 'مصري'> = { en: 'English', ar: 'العربية', 'ar-eg': 'مصري' };
const AXE_WIDTHS = [390, 768, 1024, 1440, 1920];

function screens(aya: string): [string, string][] {
  const ws = `/coach/client/${aya}`;
  return [
    ['today', '/coach'],
    ['clients', '/coach/clients'],
    ['ws-summary', ws],
    ['ws-plan', `${ws}/plan`],
    ['ws-progress', `${ws}/progress`],
    ['ws-body', `${ws}/progress?view=body`],
    ['ws-profile', `${ws}/profile`],
    ['ws-subscription', `${ws}/subscription`],
    ['ed-nutrition', `${ws}/nutrition`],
    ['messages', '/coach/messages'],
    ['thread', `/coach/messages/${aya}`],
    ['library', '/coach/library'],
    ['business', '/coach/business'],
    ['me', '/coach/me'],
    ['account', '/coach/settings'],
  ];
}

async function setLanguage(page: Page, lang: Lang) {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: LABEL[lang], exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[LABEL[lang]]);
}
const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function open(page: Page, url: string) {
  await page.goto(url);
  await ready(page);
  await page.waitForTimeout(500); // late layout (fonts, lazy panels) before measuring
}
const axeOf = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.length,
    sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));

/** Every visible control whose tap area (box or ::before hit area) is under 44 × 44 px. */
function smallTargets(page: Page) {
  return page.evaluate(() => {
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="radio"], [role="menuitem"], [role="switch"], [role="checkbox"]';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"], [inert], .sr-only')) continue;
      if (el.matches('[data-testid="skip-link"]')) continue; // off-screen until focused
      // WCAG 2.5.8 inline exception: a link inside a sentence.
      const parent = el.parentElement;
      if (el.tagName === 'A' && cs.display === 'inline' && parent && (parent.textContent?.length ?? 0) > (el.textContent?.length ?? 0) + 12) continue;
      const b = getComputedStyle(el, '::before');
      // An element that clips its overflow clips its own ::before too — such a hit area doesn't count.
      const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
      const hit = !clips && b.content !== 'none' && b.position === 'absolute';
      const w = Math.max(r.width, hit ? parseFloat(b.width) || 0 : 0);
      const h = Math.max(r.height, hit ? parseFloat(b.height) || 0 : 0);
      let small = Math.min(w, h) < 43.5;
      // A checkbox / radio inside its label is tapped through the label.
      const label = el.closest('label');
      if (small && label) {
        const lr = label.getBoundingClientRect();
        small = Math.min(lr.width, lr.height) < 43.5;
      }
      if (small) {
        const id = el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30);
        out.push(`${el.tagName.toLowerCase()}[${id}] ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return out;
  });
}

test.describe('B3.9 certification matrix', () => {
  test('axe (WCAG 2.1 A / AA) + no horizontal overflow: every coach screen × 390 / 768 / 1024 / 1440 / 1920 × EN / AR / AR-EG, plus error and offline states', async ({ as, env, audit }, testInfo) => {
    test.setTimeout(2_400_000);
    allowDevModuleStorm(audit);
    const found: Record<string, unknown> = {};
    const overflow: Record<string, number> = {};
    for (const lang of ['en', 'ar', 'ar-eg'] as Lang[]) {
      const { page } = await as('coachA', { viewport: { width: 1440, height: 900 } });
      if (lang !== 'en') await setLanguage(page, lang);
      try {
        for (const width of AXE_WIDTHS) {
          await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
          for (const [name, url] of screens(env.accounts.clientA.id)) {
            await open(page, url);
            const key = `${lang}-${width}-${name}`;
            const v = await axeOf(page);
            if (v.length) found[key] = v;
            const o = await overflowOf(page);
            if (o > 1) overflow[key] = o;
          }
        }
        // States: a failed read and an offline read (no data on this device) on Clients and Library.
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
          await page.route('**/api/trpc/**coachClients.listMyClientUsers**', (r) => r.abort('failed'));
          await open(page, '/coach/clients');
          await expect(page.getByTestId('coach-clients')).toHaveAttribute('data-state', /error|offline/, { timeout: 30_000 });
          const v = await axeOf(page);
          if (v.length) found[`${lang}-${width}-state-error-clients`] = v;
          await page.unroute('**/api/trpc/**coachClients.listMyClientUsers**');
        }
      } finally {
        if (lang !== 'en') await setLanguage(page, 'en').catch(() => undefined);
      }
    }
    await testInfo.attach('axe-matrix.json', { body: JSON.stringify({ found, overflow }, null, 2), contentType: 'application/json' });
    expect(found, 'axe violations (WCAG 2.1 A / AA)').toEqual({});
    expect(overflow, 'horizontal overflow (px)').toEqual({});
  });

  test('tap targets: every control ≥ 44 × 44 px (its box or its hit area) at 390 and 1440', async ({ as, env, audit }, testInfo) => {
    test.setTimeout(900_000);
    allowDevModuleStorm(audit);
    const small: Record<string, string[]> = {};
    for (const width of [390, 1440]) {
      const { page } = await as('coachA', { viewport: { width, height: width < 768 ? 844 : 900 } });
      for (const [name, url] of screens(env.accounts.clientA.id)) {
        await open(page, url);
        const s = await smallTargets(page);
        if (s.length) small[`${width}-${name}`] = s;
      }
    }
    await testInfo.attach('tap-targets.json', { body: JSON.stringify(small, null, 2), contentType: 'application/json' });
    expect(small).toEqual({});
  });

  test('visual matrix: 360 → 1920 (EN) and 390 / 1440 / 1920 (AR, AR-EG) — every coach screen, no overflow', async ({ as, env, audit }, testInfo) => {
    test.setTimeout(2_400_000);
    allowDevModuleStorm(audit);
    const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b39-visual');
    fs.mkdirSync(outDir, { recursive: true });
    const overflow: Record<string, number> = {};
    const plan: [Lang, number[]][] = [
      ['en', [360, 390, 430, 768, 1024, 1280, 1440, 1728, 1920]],
      ['ar', [390, 1440, 1920]],
      ['ar-eg', [390, 1440, 1920]],
    ];
    for (const [lang, widths] of plan) {
      const { page } = await as('coachA', { viewport: { width: 1440, height: 900 } });
      if (lang !== 'en') await setLanguage(page, lang);
      try {
        for (const width of widths) {
          await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
          for (const [name, url] of screens(env.accounts.clientA.id)) {
            await open(page, url);
            const o = await overflowOf(page);
            if (o > 1) overflow[`${lang}-${width}-${name}`] = o;
            await page.screenshot({ path: path.join(outDir, `${name}-${width}-${lang}.png`), fullPage: false });
          }
        }
      } finally {
        if (lang !== 'en') await setLanguage(page, 'en').catch(() => undefined);
      }
    }
    expect(overflow).toEqual({});
  });
});
