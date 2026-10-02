import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Role } from '../fixtures';

/**
 * Accessibility: axe scans (counts by impact, recorded) + keyboard journeys.
 * Known X-13 (inputs labelled only by placeholder) is reported, not failed.
 */
const X13_RULES = new Set(['label', 'label-title-only']);

async function scan(page: Page, testInfo: TestInfo, name: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const byImpact: Record<string, number> = {};
  const rules = r.violations.map((v) => {
    byImpact[v.impact ?? 'none'] = (byImpact[v.impact ?? 'none'] ?? 0) + v.nodes.length;
    return { id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) };
  });
  testInfo.annotations.push({ type: 'axe', description: `${name}: ${JSON.stringify(byImpact)} rules=${rules.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(' ')}` });
  await testInfo.attach(`axe-${name}.json`, { body: JSON.stringify({ byImpact, rules }, null, 2), contentType: 'application/json' });
  return rules;
}

const targets: { name: string; role: Role | null; path: string }[] = [
  { name: 'landing', role: null, path: '/' },
  { name: 'login', role: null, path: '/login' },
  { name: 'client-home', role: 'clientA', path: '/' },
  { name: 'coach-dashboard', role: 'coachA', path: '/coach/dashboard' },
  { name: 'admin-accounts', role: 'super', path: '/admin/accounts' },
];

for (const t of targets) {
  test(`axe: ${t.name} — no critical violations (X-13 placeholder-labels reported only)`, async ({ as, anon }, testInfo) => {
    const { page } = t.role ? await as(t.role) : await anon();
    await page.goto(t.path);
    if (t.role) await ready(page);
    else await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await shot(page, testInfo, t.name);
    const rules = await scan(page, testInfo, t.name);
    const critical = rules.filter((r) => r.impact === 'critical' && !X13_RULES.has(r.id));
    expect.soft(critical, 'critical axe violations (excluding X-13)').toEqual([]);
  });
}

async function focusVisible(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tag: 'body', visible: false };
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    return { tag: el.tagName.toLowerCase(), testid: el.getAttribute('data-testid'), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, boxShadow: cs.boxShadow, visible: !!ring };
  });
}

test('keyboard: Tab through the login form with a visible focus indicator', async ({ anon }, testInfo) => {
  const { page } = await anon();
  await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible();
  await page.getByTestId('login-email').focus();
  const seen: unknown[] = [await focusVisible(page)];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    seen.push(await focusVisible(page));
  }
  await shot(page, testInfo, 'login-focus');
  await testInfo.attach('focus-order.json', { body: JSON.stringify(seen, null, 2), contentType: 'application/json' });
  const ids = (seen as { testid: string | null }[]).map((s) => s.testid);
  expect(ids.indexOf('login-password')).toBeGreaterThan(ids.indexOf('login-email'));
  expect(ids).toContain('login-submit');
  for (const s of seen as { tag: string; visible: boolean; testid: string | null }[]) expect.soft(s.visible, `focus ring on ${s.tag}[${s.testid}]`).toBe(true);
  // Enter submits from the keyboard.
  await page.getByTestId('login-email').fill('coach.a@e2e.test');
  await page.getByTestId('login-password').fill('E2e-Pass-2026!');
  await page.getByTestId('login-password').press('Enter');
  await expect(page.getByTestId('login-email')).toHaveCount(0, { timeout: 20_000 });
});

test('keyboard: Add-client Sheet takes focus, traps Tab, Escape closes and returns focus', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto('/coach/clients');
  await ready(page);
  const trigger = page.getByTestId('coach-add-client');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId('sheet-panel');
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate((p) => p.contains(document.activeElement))).toBe(true);
  const escaped: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    if (!(await panel.evaluate((p) => p.contains(document.activeElement)))) escaped.push(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120) ?? ''));
  }
  await shot(page, testInfo, 'sheet-focus');
  expect(escaped, 'focus left the sheet').toEqual([]);
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect.poll(() => trigger.evaluate((b) => b === document.activeElement)).toBe(true);
});

test('keyboard: Ctrl+K palette opens; arrows move selection; Enter navigates', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto('/coach/dashboard');
  await ready(page);
  await page.keyboard.press('Control+k');
  const input = page.getByTestId('command-input');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  const options = page.getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  if ((await options.count()) > 1) {
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  }
  // Search a client by name and open it from the keyboard (the coach palette has client/library/template
  // entries + quick actions; plain page destinations such as Revenue are not commands).
  await input.fill('Aya');
  await expect(options.first()).toContainText('Client Aya');
  await shot(page, testInfo, 'palette');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page).toHaveURL(/\/coach\/client\/e2e-client-a/);
  // Escape closes without acting.
  await page.keyboard.press('Control+k');
  await expect(input).toBeVisible();
  const focusedOnReopen = await input.evaluate((i) => i === document.activeElement).catch(() => false);
  await page.waitForTimeout(300);
  const focusedLater = await input.evaluate((i) => i === document.activeElement).catch(() => false);
  testInfo.annotations.push({ type: 'observation', description: `palette reopened on /coach/client/:id — input focused immediately=${focusedOnReopen}, after 300 ms=${focusedLater}, active=${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}` });
  await shot(page, testInfo, 'palette-reopened');
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
});

test('coach sidebar + top bar: every icon button / link has an accessible name', async ({ as }, testInfo) => {
  const { page } = await as('coachA');
  await page.goto('/coach/dashboard');
  await ready(page);
  const nameless = await page.evaluate(() => {
    const roots = [document.querySelector('[data-testid="coach-sidebar"]'), document.querySelector('[data-testid="global-search"]')?.closest('header, div')].filter(Boolean) as Element[];
    const out: string[] = [];
    for (const root of roots)
      for (const el of Array.from(root.querySelectorAll('button, a[href]'))) {
        const h = el as HTMLElement;
        if (h.offsetParent === null) continue;
        const labelled = h.getAttribute('aria-labelledby');
        const name = (h.getAttribute('aria-label') || (labelled && document.getElementById(labelled)?.textContent) || h.innerText || h.getAttribute('title') || '').trim();
        if (!name) out.push(h.outerHTML.slice(0, 160));
      }
    return out;
  });
  await shot(page, testInfo, 'coach-chrome');
  await testInfo.attach('nameless.json', { body: JSON.stringify(nameless, null, 2), contentType: 'application/json' });
  expect(nameless).toEqual([]);
});
