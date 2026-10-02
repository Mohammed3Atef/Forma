import type { Page } from '@playwright/test';
import { test, expect, ready } from '../fixtures';
import { snap, noHmr } from './_a-helpers';

/** No permanent skeleton: every LoadingState (role=status "Loading…") must clear. */
async function settled(page: Page) {
  await ready(page);
  await expect(page.getByRole('status').filter({ hasText: 'Loading…' })).toHaveCount(0, { timeout: 15_000 });
}

const SUPER_PAGES: { path: string; testId: string }[] = [
  { path: '/admin', testId: 'admin-dashboard' },
  { path: '/admin/accounts', testId: 'admin-accounts' },
  { path: '/admin/coaches', testId: 'admin-coaches' },
  { path: '/admin/members', testId: 'admin-members' },
  { path: '/admin/assignments', testId: 'admin-assignments' },
  { path: '/admin/plans', testId: 'admin-plans' },
  { path: '/admin/subscriptions', testId: 'admin-subscriptions' },
  { path: '/admin/analytics', testId: 'admin-analytics' },
  { path: '/admin/banners', testId: 'admin-banners' },
  { path: '/admin/media', testId: 'admin-media' },
  { path: '/admin/governance', testId: 'admin-governance' },
  { path: '/admin/audit', testId: 'admin-audit' },
];

test.describe('super admin', () => {
  test('every admin destination renders (no permanent spinner, no 5xx)', async ({ as, audit }, testInfo) => {
    test.setTimeout(360_000); // 12 cold routes on a dev server shared with 3 other concurrent suites
    const { context: _c7064, page } = await as('super'); await noHmr(_c7064);
    for (const p of SUPER_PAGES) {
      await page.goto(p.path);
      await expect(page).toHaveURL(new RegExp(`${p.path.replace(/\//g, '\\/')}$`));
      await expect(page.getByTestId(p.testId).first()).toBeVisible({ timeout: 30_000 });
      await settled(page);
      await snap(page, testInfo, `super${p.path.replace(/\//g, '-')}`);
    }
    const errs = audit.events.filter((e) => e.kind === 'http' && (e.status ?? 0) >= 400 && !/auth\.refresh/.test(e.url ?? ''));
    await testInfo.attach('super-4xx-5xx.json', { body: JSON.stringify(errs, null, 2), contentType: 'application/json' });
    expect.soft(errs.filter((e) => (e.status ?? 0) >= 500), 'no 5xx on admin pages').toEqual([]);
  });

  test('accounts: search, role + status filters, row → detail sheet', async ({ as }, testInfo) => {
    const { context: _c7064, page } = await as('super'); await noHmr(_c7064);
    await page.goto('/admin/accounts');
    await settled(page);
    // Desktop (1440): DataTable rows are the visible list; the lg:hidden mobile list carries data-account-role for role checks.
    const rows = page.getByTestId('admin-accounts-table').getByTestId('data-row');
    const roleOf = () => page.getByTestId('account-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-account-role')));
    await expect(rows.first()).toBeVisible();
    const all = await rows.count();
    expect(all).toBeGreaterThanOrEqual(8);

    const search = page.getByPlaceholder('Search name, email or phone');
    await search.fill('Amira');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Coach Amira');
    await snap(page, testInfo, 'accounts-search');
    await search.fill('');
    await expect(rows).toHaveCount(all);

    await page.getByRole('button', { name: 'Coach', exact: true }).click();
    await expect(rows.first()).toBeVisible();
    await expect.poll(async () => [...new Set(await roleOf())]).toEqual(['coach']);
    expect((await roleOf()).length).toBeGreaterThanOrEqual(3);
    await expect(rows).toHaveCount((await roleOf()).length);
    await page.getByTestId('status-filter-suspended').click();
    await expect(rows).toHaveCount(0);
    await page.getByTestId('status-filter-active').click();
    await expect(rows.first()).toBeVisible();
    await snap(page, testInfo, 'accounts-filter-coach-active');

    await rows.filter({ hasText: 'Coach Basem' }).click();
    const sheet = page.getByTestId('sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Coach Basem');
    await expect(sheet.getByTestId('status-options')).toBeVisible();
    await snap(page, testInfo, 'accounts-row-sheet');
    await page.getByTestId('sheet-close').click();
    await expect(sheet).toHaveCount(0);
  });

  test('coaches list → coach detail', async ({ as }, testInfo) => {
    const { context: _c7064, page } = await as('super'); await noHmr(_c7064);
    await page.goto('/admin/coaches');
    await settled(page);
    const table = page.getByTestId('admin-coaches-table');
    await expect(table).toContainText('Coach Amira');
    await table.getByText('Coach Amira').first().click();
    await expect(page.getByTestId('admin-coach-preview')).toContainText('Coach Amira');
    await snap(page, testInfo, 'coach-preview');
    await page.getByTestId('admin-coach-open-profile').click();
    await expect(page).toHaveURL(/\/admin\/coaches\/e2e-coach-a$/);
    await settled(page);
    const detail = page.getByTestId('admin-coach-detail');
    await expect(detail).toContainText('Trial');
    await expect(detail).toContainText('1 / 2');
    await snap(page, testInfo, 'coach-detail');
  });

  test('banners: create https CTA → shows for a coach → delete; javascript: CTA refused', async ({ as, db }, testInfo) => {
    const title = `E2E Offer ${Date.now()}`;
    const { context: _c7064, page } = await as('super'); await noHmr(_c7064);
    try {
      await page.goto('/admin/banners');
      await settled(page);
      await page.getByTestId('banner-new').click();
      await page.getByTestId('banner-title').fill(title);
      await page.getByLabel('Button label').fill('Learn more');
      await page.getByLabel('Button link').fill('https://example.com/offer');
      await page.getByRole('button', { name: 'Coach', exact: true }).click();
      await snap(page, testInfo, 'banner-form');
      await page.getByTestId('banner-save').click();
      await expect(page.getByTestId('sheet')).toHaveCount(0);
      const row = page.getByTestId('banner-row').filter({ hasText: title });
      await expect(row).toBeVisible();
      await snap(page, testInfo, 'banner-listed');
      expect(await db.count('banners', { title })).toBe(1);

      // Coach sees it via BannerHost.
      const { context: _c9770, page: cp } = await as('coachA'); await noHmr(_c9770);
      await cp.goto('/coach/dashboard');
      await ready(cp);
      const b = cp.getByTestId('app-banner').filter({ hasText: title });
      await expect(b).toBeVisible();
      await expect(b.getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', 'https://example.com/offer');
      await snap(cp, testInfo, 'coach-sees-banner');

      // javascript: CTA → refused, nothing stored.
      await page.getByTestId('banner-new').click();
      const evil = `${title} evil`;
      await page.getByTestId('banner-title').fill(evil);
      await page.getByLabel('Button label').fill('Click');
      await page.getByLabel('Button link').fill('javascript:alert(1)');
      await page.getByTestId('banner-save').click();
      const dlg = page.getByTestId('confirm-dialog');
      await expect(dlg).toBeVisible();
      await snap(page, testInfo, 'javascript-cta-refused');
      await expect.soft(dlg, 'refusal message is human-readable').toContainText('Link must start with http:// or https://');
      await expect.soft(dlg, 'refusal message is not raw validation JSON').not.toContainText('"code"');
      expect(await db.count('banners', { title: evil })).toBe(0);
      await page.getByTestId('confirm-accept').click();
      await page.getByTestId('sheet-close').click();

      // Delete the real one.
      await row.getByRole('button', { name: 'Edit' }).click();
      await page.getByTestId('sheet').getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByTestId('confirm-dialog')).toContainText(title);
      await page.getByTestId('confirm-accept').click();
      await expect(row).toHaveCount(0);
      expect(await db.count('banners', { title })).toBe(0);
      await cp.reload();
      await ready(cp);
      await expect(cp.getByTestId('app-banner').filter({ hasText: title })).toHaveCount(0);
      await snap(page, testInfo, 'banner-deleted');
    } finally {
      await db.deleteMany('banners', { title: { $regex: '^E2E Offer ' } });
    }
  });
});

test.describe('plain admin', () => {
  const FORBIDDEN = ['/admin/coaches', '/admin/plans', '/admin/subscriptions', '/admin/media'];
  const FORBIDDEN_KEYS = ['adminCoaches', 'adminPlans', 'adminSubscriptions', 'adminImages'];
  const FORBIDDEN_LABELS = /^(Coaches|Plans|Subscriptions|Images|Media)$/;

  test('sidebar has no super-only destinations; deep links redirect to /admin', async ({ as }, testInfo) => {
    const { context: _c9398, page } = await as('admin'); await noHmr(_c9398);
    await page.goto('/admin');
    await settled(page);
    const sidebar = page.getByTestId('coach-sidebar');
    await expect(sidebar).toBeVisible();
    for (const k of FORBIDDEN_KEYS) await expect(sidebar.getByTestId(`sidebar-${k}`)).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: FORBIDDEN_LABELS })).toHaveCount(0);
    for (const k of ['adminOverview', 'adminAccounts', 'adminMembers', 'adminAssignments', 'adminGovernance', 'adminAudit', 'adminBanners', 'adminAnalytics']) {
      await expect(sidebar.getByTestId(`sidebar-${k}`)).toBeVisible();
    }
    await snap(page, testInfo, 'admin-sidebar');
    for (const p of FORBIDDEN) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
      await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    }
    await page.goto('/admin/coaches/e2e-coach-a');
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
    await snap(page, testInfo, 'deep-link-redirected');
  });

  test('mobile bottom nav + menu sheet have no super-only destinations', async ({ as }, testInfo) => {
    const { context: _c5840, page } = await as('admin', { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true }); await noHmr(_c5840);
    await page.goto('/admin');
    await settled(page);
    const nav = page.getByTestId('bottom-nav');
    await expect(nav).toBeVisible();
    for (const k of FORBIDDEN_KEYS) await expect(nav.getByTestId(`nav-${k}`)).toHaveCount(0);
    await expect(nav.getByTestId('nav-adminAnalytics')).toBeVisible();
    await snap(page, testInfo, 'admin-bottom-nav');
    await page.getByRole('button', { name: 'Menu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Accounts', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: FORBIDDEN_LABELS })).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: FORBIDDEN_LABELS })).toHaveCount(0);
    await snap(page, testInfo, 'admin-menu-sheet');
  });

  test('⌘K palette has no Coaches / Subscriptions commands', async ({ as }, testInfo) => {
    const { context: _c9398, page } = await as('admin'); await noHmr(_c9398);
    await page.goto('/admin');
    await settled(page);
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('command-input');
    await expect(input).toBeVisible();
    const opts = page.getByRole('option');
    await expect(opts.first()).toBeVisible();
    const labels = (await opts.allInnerTexts()).map((s) => s.trim());
    await testInfo.attach('palette-options.json', { body: JSON.stringify(labels), contentType: 'application/json' });
    expect(labels.some((l) => /Accounts/.test(l))).toBe(true);
    expect(labels.filter((l) => /Coaches|Subscriptions/.test(l))).toEqual([]);
    await snap(page, testInfo, 'admin-palette');
    await input.fill('coach');
    await expect(page.getByRole('option').filter({ hasText: /Coaches|Subscriptions/ })).toHaveCount(0);
  });

  test('allowed pages work with no 403 during normal navigation', async ({ as, audit }, testInfo) => {
    test.setTimeout(150_000);
    const { context: _c9398, page } = await as('admin'); await noHmr(_c9398);
    const allowed = [
      { path: '/admin', testId: 'admin-dashboard' },
      { path: '/admin/accounts', testId: 'admin-accounts' },
      { path: '/admin/members', testId: 'admin-members' },
      { path: '/admin/assignments', testId: 'admin-assignments' },
      { path: '/admin/governance', testId: 'admin-governance' },
      { path: '/admin/audit', testId: 'admin-audit' },
      { path: '/admin/banners', testId: 'admin-banners' },
      { path: '/admin/analytics', testId: 'admin-analytics' },
    ];
    for (const p of allowed) {
      const mark = audit.events.length;
      await page.goto(p.path);
      await expect(page).toHaveURL(new RegExp(`${p.path.replace(/\//g, '\\/')}$`));
      await expect(page.getByTestId(p.testId).first()).toBeVisible({ timeout: 20_000 });
      await settled(page);
      await snap(page, testInfo, `admin${p.path.replace(/\//g, '-')}`);
      const forb = audit.events.slice(mark).filter((e) => e.kind === 'http' && e.status === 403);
      for (const f of forb) await testInfo.attach(`403-on-${p.path.replace(/\//g, '_')}.json`, { body: JSON.stringify(f, null, 2), contentType: 'application/json' });
    }
    // Accounts row → sheet works for a plain admin too.
    await page.goto('/admin/accounts');
    await settled(page);
    await page.getByTestId('admin-accounts-table').getByTestId('data-row').filter({ hasText: 'Client Aya' }).click();
    await expect(page.getByTestId('sheet')).toContainText('Client Aya');
    const forbidden = audit.events.filter((e) => e.kind === 'http' && e.status === 403);
    const allErr = audit.events.filter((e) => e.kind === 'http' && !/auth\.refresh/.test(e.url ?? ''));
    await testInfo.attach('admin-http-errors.json', { body: JSON.stringify(allErr, null, 2), contentType: 'application/json' });
    expect(forbidden.map((f) => `${f.status} ${f.text} ${f.url}`), '403s during plain-admin navigation').toEqual([]);
  });
});
