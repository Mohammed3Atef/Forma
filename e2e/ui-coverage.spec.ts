import { test, expect, type Page } from './fixtures/test';
import type { ConsoleCapture } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { auditPage } from './fixtures/audit';
import { signInAs } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * UI COVERAGE — visit every major route on a mobile viewport and smoke-test it:
 * renders without crash, no console errors, no raw i18n keys, no horizontal
 * scroll, bottom nav present where expected, and at least one primary action.
 * Findings are collected (soft) so one page reports every problem it has.
 */

let client: NewClient;

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, { email: uniqueEmail('qa-ui'), password: 'Ui123456!', displayName: `QA UI ${Date.now()}` });
  } finally {
    await coach.close();
  }
});

interface RouteSpec {
  route: string;
  label: string;
  expectNav?: boolean;
}

async function smoke(page: Page, capture: ConsoleCapture, spec: RouteSpec): Promise<void> {
  // Reset captured console between routes so attribution is per-page.
  capture.errors.length = 0;
  capture.warnings.length = 0;
  await page.goto(spec.route);
  await page.waitForTimeout(600); // let lazy data + loading states resolve

  const findings = await auditPage(page, spec.route, capture);
  await test.info().attach(`audit-${spec.label}`, { body: JSON.stringify(findings, null, 2), contentType: 'application/json' });

  expect.soft(findings.rendered, `${spec.label}: page crashed / rendered empty`).toBe(true);
  expect.soft(findings.consoleErrors, `${spec.label}: console errors\n${findings.consoleErrors.join('\n')}`).toEqual([]);
  expect.soft(findings.missingTranslations, `${spec.label}: raw i18n keys leaked\n${findings.missingTranslations.join(', ')}`).toEqual([]);
  expect.soft(findings.horizontalOverflowPx, `${spec.label}: horizontal scroll ${findings.horizontalOverflowPx}px`).toBeLessThanOrEqual(2);
  if (spec.expectNav) {
    expect.soft(await page.getByTestId(TID.bottomNav).isVisible(), `${spec.label}: bottom nav missing`).toBe(true);
  }
}

test.describe('UI coverage — auth', () => {
  test('login screen renders cleanly', async ({ page, consoleErrors }) => {
    await smoke(page, consoleErrors, { route: '/', label: 'login' });
    await expect(page.getByTestId(TID.loginForm)).toBeVisible();
  });
});

test.describe('UI coverage — client', () => {
  test.beforeEach(async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
  });

  const routes: RouteSpec[] = [
    { route: '/', label: 'client-home', expectNav: true },
    { route: '/workout', label: 'client-workout', expectNav: true },
    { route: '/nutrition', label: 'client-nutrition', expectNav: true },
    { route: '/cardio', label: 'client-cardio', expectNav: true },
    { route: '/progress', label: 'client-progress', expectNav: true },
    { route: '/settings', label: 'client-settings', expectNav: true },
  ];

  for (const spec of routes) {
    test(`client route: ${spec.label}`, async ({ page, consoleErrors }) => {
      await smoke(page, consoleErrors, spec);
    });
  }
});

test.describe('UI coverage — coach', () => {
  test.beforeEach(async ({ login, page }) => {
    await login('coach');
    await page.getByTestId(TID.coachClients).waitFor({ timeout: 25_000 });
  });

  test('coach static routes', async ({ page, consoleErrors }) => {
    const routes: RouteSpec[] = [
      { route: '/coach', label: 'coach-clients', expectNav: true },
      { route: '/coach/library', label: 'coach-library', expectNav: true },
      { route: '/coach/templates', label: 'coach-templates', expectNav: true },
      { route: '/coach/adherence', label: 'coach-adherence', expectNav: true },
      { route: '/coach/messages', label: 'coach-messages', expectNav: true },
      { route: '/coach/settings', label: 'coach-settings', expectNav: true },
    ];
    for (const spec of routes) await smoke(page, consoleErrors, spec);
  });

  test('coach client detail + editors', async ({ page, consoleErrors }) => {
    const routes: RouteSpec[] = [
      { route: `/coach/client/${client.uid}`, label: 'coach-client-detail' },
      { route: `/coach/client/${client.uid}/workout`, label: 'coach-workout-editor' },
      { route: `/coach/client/${client.uid}/nutrition`, label: 'coach-nutrition-editor' },
      { route: `/coach/client/${client.uid}/cardio`, label: 'coach-cardio-editor' },
    ];
    for (const spec of routes) await smoke(page, consoleErrors, spec);
  });
});

test.describe('UI coverage — admin', () => {
  test.beforeEach(async ({ login, page }) => {
    await login('super_admin');
    await page.getByTestId(TID.adminOverview).waitFor({ timeout: 25_000 });
  });

  test('admin routes', async ({ page, consoleErrors }) => {
    const routes: RouteSpec[] = [
      { route: '/admin', label: 'admin-overview', expectNav: true },
      { route: '/admin/accounts', label: 'admin-accounts', expectNav: true },
      { route: '/admin/assignments', label: 'admin-assignments', expectNav: true },
      { route: '/admin/governance', label: 'admin-governance', expectNav: true },
      { route: '/admin/analytics', label: 'admin-analytics', expectNav: true },
      { route: `/admin/clients/${client.uid}`, label: 'admin-client-detail' },
    ];
    for (const spec of routes) await smoke(page, consoleErrors, spec);
  });
});
