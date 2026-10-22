import fs from 'node:fs';
import path from 'node:path';
import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';
import { allowDevModuleStorm, LOCALE_OF, waitForLocaleSaved } from './_c-helpers';
import { confirmNo, confirmYes, fullAssessment, openPlanBuilder } from './_b-helpers';

/**
 * B3.1 — Coach shell (blueprint §5, owner O-2): Today · Clients · Messages ·
 * Library, Me behind the avatar; tabs < 768 px, a collapsed rail 768–1023,
 * a labelled rail ≥ 1024; every coach screen lights its destination; cold
 * deep links Back up the IA; every shell exit asks while an editor is dirty;
 * Arabic mirrors. The last test captures the visual-QA matrix
 * (390 / 768 / 1024 / 1440 × EN / AR) into `e2e-out/<run>/b31-visual/`.
 *
 * Seeded coachA / clientA only; nothing is saved (dirty edits are discarded)
 * and the language is restored to English.
 */
const CA = 'e2e-client-a';
const ar = JSON.parse(fs.readFileSync('src/i18n/ar.json', 'utf8'));
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } };
const sized = (width: number, height = 900) => ({ viewport: { width, height } });

async function setCoachLanguage(page: Page, label: 'English' | 'العربية') {
  await page.goto('/coach/settings');
  await ready(page);
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitForLocaleSaved(page, LOCALE_OF[label]); // B3.9.0: the profile save lands before we navigate away (was a fixed 600 ms)
}

test.describe('B3.1 coach shell', () => {
  test.beforeAll(async ({ db }) => {
    // The workout editor renders only for a client with a complete assessment (E-B-1).
    await db.updateOne('clientProfiles', { _id: CA }, { $set: { assessment: fullAssessment('Client Aya') } });
  });

  test('phone: four tabs, Me behind the avatar, /coach opens Today, a client lights Clients; no hamburger, no WhatsApp button', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', phone);
    await page.goto('/coach');
    await expect(page).toHaveURL(/\/coach\/dashboard$/); // IA-K01: every breakpoint
    await ready(page);
    const tabs = page.getByTestId('bottom-nav');
    await expect(tabs).toBeVisible();
    for (const key of ['today', 'clients', 'messages', 'library']) await expect(tabs.getByTestId(`nav-${key}`)).toBeVisible();
    await expect(tabs.getByRole('link')).toHaveCount(4);
    await expect(page.getByTestId('nav-today')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('coach-rail')).toBeHidden();
    for (const gone of ['nav-menu-button', 'brand-bar', 'whatsapp-fab', 'coach-sidebar']) await expect(page.getByTestId(gone)).toHaveCount(0);
    await shot(page, testInfo, '01-phone-today');

    await page.getByTestId('nav-clients').click();
    await expect(page).toHaveURL(/\/coach\/clients$/);
    await page.goto(`/coach/client/${CA}`);
    await expect(page.getByTestId('nav-clients')).toHaveAttribute('aria-current', 'page'); // NAV-K11
    await page.getByTestId('nav-library').click();
    await expect(page).toHaveURL(/\/coach\/library$/);
    await page.getByTestId('lib-tab-exercises').click();
    await page.getByTestId('lib-tab-programs').click();
    await expect(page).toHaveURL(/\/coach\/library\?tab=programs$/); // B3.7: Programs is a Library segment
    await expect(page.getByTestId('nav-library')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('me-button').click();
    await expect(page).toHaveURL(/\/coach\/me$/);
    await expect(page.getByTestId('coach-me')).toBeVisible();
    // B3.2: assessments to review live on Today (no Me row).
    // B3.8: Revenue, Reports and Client Plans are one row, Business (+ a direct Packages row).
    for (const row of ['me-business', 'me-packages', 'me-forma', 'me-account', 'me-help', 'me-sign-out']) await expect(page.getByTestId(row)).toBeVisible();
    await expect(page.getByTestId('me-assessments')).toHaveCount(0);
    await expect(page.getByTestId('me-help')).toHaveAttribute('href', /wa\.me|whatsapp/);
    await expect(page.getByTestId('me-button')).toHaveAttribute('aria-current', 'page');
    await shot(page, testInfo, '02-phone-me');
    await page.getByTestId('me-forma').click();
    await expect(page).toHaveURL(/\/coach\/plan$/);
    await page.getByTestId('shell-back').click();
    await expect(page).toHaveURL(/\/coach\/me$/);
  });

  test('tablet: a collapsed icon rail with accessible names and no tab bar; desktop: the labelled rail with Me', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const tablet = (await as('coachA', sized(768, 1024))).page;
    await tablet.goto('/coach/clients');
    await ready(tablet);
    const rail = tablet.getByTestId('coach-rail');
    await expect(rail).toBeVisible();
    await expect(tablet.getByTestId('bottom-nav')).toBeHidden();
    expect(Math.round((await rail.boundingBox())!.width)).toBe(72);
    for (const key of ['today', 'clients', 'messages', 'library']) {
      const link = tablet.getByTestId(`rail-${key}`);
      await expect(link).toHaveAttribute('aria-label', /.+/);
      await expect(link).toHaveAttribute('title', /.+/);
    }
    await expect(tablet.getByTestId('rail-clients')).toHaveAttribute('aria-current', 'page');
    await shot(tablet, testInfo, '03-tablet-rail');

    const desk = (await as('coachA', sized(1440))).page;
    await desk.goto('/coach/messages');
    await ready(desk);
    const wide = desk.getByTestId('coach-rail');
    expect(Math.round((await wide.boundingBox())!.width)).toBe(240);
    await expect(desk.getByTestId('rail-messages')).toContainText('Messages');
    await expect(desk.getByTestId('rail-messages')).toHaveAttribute('aria-current', 'page');
    await expect(desk.getByTestId('rail-me')).toContainText('Me');
    await expect(desk.getByTestId('global-search')).toBeVisible();
    await shot(desk, testInfo, '04-desktop-rail');
  });

  test('cold deep links render inside the shell, light their destination, and Back goes up the IA', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', sized(1440));
    const cases: [string, string, string | null][] = [
      // B3.8 completion (owner decision 7): the desktop sidebar names these sections itself.
      ['/coach/plan', 'rail-forma', '/coach/me'],
      ['/coach/settings', 'rail-account', '/coach/me'],
      ['/coach/revenue', 'rail-business', '/coach/me'], // B3.8: redirects to Me › Business
      ['/coach/business', 'rail-business', '/coach/me'],
      ['/coach/me', 'rail-me', null],
      ['/coach/templates', 'rail-library', null], // B3.7: redirects to Library › Programs, a root (no Back)
      ['/coach/clients?view=checkins', 'rail-clients', null], // B3.3: weekly check-ins live in Clients
      [`/coach/messages/${CA}`, 'rail-messages', null],
      [`/coach/client/${CA}/notes`, 'rail-clients', null],
    ];
    for (const [path, lit, up] of cases) {
      await page.goto(path); // a fresh document: no in-app history
      await ready(page);
      await expect(page.getByTestId(lit), path).toHaveAttribute('aria-current', 'page');
      if (up) {
        await page.getByTestId('shell-back').click();
        await expect(page, path).toHaveURL(new RegExp(`${up.replace(/\//g, '\\/')}$`));
      } else {
        await expect(page.getByTestId('shell-back'), `${path} keeps its own Back`).toHaveCount(0);
      }
    }
  });

  test('⌘K on a cold deep link finds the whole roster (DT-08) and opens the client inside the shell', async ({ as, audit }) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', sized(1440));
    await page.goto('/coach/me'); // the dashboard — once the palette's only client source — never loads here
    await ready(page);
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('command-input');
    await expect(input).toBeFocused();
    await input.fill('Aya');
    await page.getByRole('option', { name: /Client Aya/ }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/client/${CA}$`));
    await expect(page.getByTestId('rail-clients')).toHaveAttribute('aria-current', 'page');
  });

  test('a dirty editor: every shell exit (tab, rail, Me, ⌘K) asks first and Cancel keeps the edit', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', sized(1440));
    await page.goto(`/coach/client/${CA}/workout`);
    await openPlanBuilder(page, 'workout-plan-name');
    const name = page.getByTestId('workout-plan-name');
    const original = await name.inputValue();
    await name.fill(`${original} B3.1 guard`);
    await expect(page.getByTestId('workout-unsaved')).toBeVisible();
    const guard = page.getByTestId('confirm-dialog').filter({ hasText: 'Discard changes?' });
    const editor = new RegExp(`/coach/client/${CA}/workout$`);

    const exits: [string, () => Promise<void>][] = [
      ['rail Today', () => page.getByTestId('rail-today').click()],
      ['rail Me', () => page.getByTestId('rail-me').click()],
      // (B3.2: the coach has no bell — O-5.)
      [
        '⌘K command',
        async () => {
          await page.getByTestId('global-search').click();
          await page.getByTestId('command-input').fill('Me');
          await page.getByRole('option', { name: 'Me', exact: true }).click();
        },
      ],
    ];
    for (const [what, exit] of exits) {
      await exit();
      await expect(guard, what).toBeVisible();
      await confirmNo(page);
      await expect(page, what).toHaveURL(editor);
      await expect(name, what).toHaveValue(`${original} B3.1 guard`);
    }
    await shot(page, testInfo, '05-guard-kept');
    // Leave = discard (nothing was saved): the tab now navigates.
    await page.getByTestId('rail-clients').click();
    await expect(guard).toBeVisible();
    await confirmYes(page);
    await expect(page).toHaveURL(/\/coach\/clients$/);
  });

  test('Arabic: the rail moves to the right, labels are translated, the shell Back chevron mirrors', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachA', sized(1440));
    await setCoachLanguage(page, 'العربية');
    try {
      await page.goto('/coach/plan');
      await ready(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const box = (await page.getByTestId('coach-rail').boundingBox())!;
      expect(box.x).toBeGreaterThan(1440 / 2); // inline-start = right in RTL
      await expect(page.getByTestId('rail-today')).toContainText(ar.coachNav.today);
      await expect(page.getByTestId('rail-me')).toContainText(ar.coachNav.me);
      const flipped = await page.getByTestId('shell-back').evaluate((b) => {
        const m = getComputedStyle(b.querySelector('svg')!).transform.match(/matrix\(([^,]+),/);
        return !!m && Number(m[1]) < 0;
      });
      expect(flipped).toBe(true);
      await shot(page, testInfo, '06-ar-desktop');
    } finally {
      await setCoachLanguage(page, 'English').catch(() => undefined);
    }
  });

  test('visual QA matrix: 390 / 768 / 1024 / 1440 × EN / AR across the coach destinations', async ({ as, audit }, testInfo) => {
    test.setTimeout(600_000);
    allowDevModuleStorm(audit);
    const outDir = path.join(path.dirname(testInfo.outputDir), '..', 'b31-visual');
    fs.mkdirSync(outDir, { recursive: true });
    const pages = ['/coach/dashboard', '/coach/clients', `/coach/client/${CA}`, '/coach/messages', '/coach/library', '/coach/me'];
    const widths: [number, number][] = [[390, 844], [768, 1024], [1024, 800], [1440, 900]];
    const captured: { file: string; overflow: number; dir: string; label: string }[] = [];
    for (const lang of ['en', 'ar'] as const) {
      const first = (await as('coachA', sized(1440))).page;
      if (lang === 'ar') await setCoachLanguage(first, 'العربية');
      try {
        for (const [w, h] of widths) {
          const page = w === 1440 ? first : (await as('coachA', w === 390 ? phone : sized(w, h))).page;
          // The language is a device setting: every fresh context switches its own.
          if (lang === 'ar' && page !== first) await setCoachLanguage(page, 'العربية');
          for (const p of pages) {
            await page.goto(p);
            await ready(page);
            await page.waitForTimeout(700); // let late banners / lists settle
            const file = path.join(outDir, `${w}-${lang}-${p.replace(/^\/coach\/?/, '').replace(/\//g, '_') || 'root'}.png`);
            await page.screenshot({ path: file, fullPage: false });
            // Evidence per shot: horizontal overflow, direction, and the Clients label actually rendered.
            const nav = page.locator(w < 768 ? '[data-testid="nav-clients"]' : '[data-testid="rail-clients"]');
            const label = ((await nav.innerText()).trim() || (await nav.getAttribute('aria-label')) || '').trim();
            const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.dir }));
            captured.push({ file: path.basename(file), ...m, label });
          }
        }
      } finally {
        if (lang === 'ar') await setCoachLanguage(first, 'English').catch(() => undefined);
      }
    }
    fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(captured, null, 2));
    await testInfo.attach('b31-visual.json', { body: JSON.stringify({ dir: outDir, captured }, null, 2), contentType: 'application/json' });
    expect(captured).toHaveLength(pages.length * widths.length * 2);
    expect(captured.filter((c) => c.overflow > 0), 'no horizontal overflow').toEqual([]);
    for (const c of captured) {
      const isAr = c.file.includes('-ar-');
      expect(c.dir, c.file).toBe(isAr ? 'rtl' : 'ltr');
      expect(c.label, c.file).toBe(isAr ? ar.coachNav.clients : 'Clients');
    }
  });
});
