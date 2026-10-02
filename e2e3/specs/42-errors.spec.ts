import type { Page, TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Role } from '../fixtures';
import { procsOf } from './_d-helpers';

/**
 * Failing-backend behaviour per screen (Phase-2 X-25). The screen's PRIMARY
 * query procedures answer HTTP 500; after the client's retries settle we
 * classify what the user sees:
 *   PASS                    a real error state (role=alert + Retry) — and Retry recovers
 *   FAIL-permanent-spinner  a loading skeleton / "Working…" that never resolves
 *   FAIL-misleading-empty   an empty / "nothing here" state that lies about the data
 * The assertion is the PASS condition; gaps are expected to fail and are reported.
 */
type Verdict = 'PASS' | 'FAIL-permanent-spinner' | 'FAIL-misleading-empty' | 'FAIL-other';

async function failProcs(page: Page, procs: string[]) {
  const hits: string[] = [];
  const handler = async (route: import('@playwright/test').Route) => {
    const p = procsOf(route.request().url());
    if (p.some((x) => procs.includes(x))) {
      hits.push(p.join(','));
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  };
  await page.route(/\/api\/trpc\//, handler);
  return { hits, off: () => page.unroute(/\/api\/trpc\//, handler) };
}

async function classify(page: Page, emptyTexts: RegExp[]): Promise<{ verdict: Verdict; detail: string }> {
  const main = page.locator('main').first();
  const alert = main.locator('[role="alert"]').filter({ has: page.getByRole('button', { name: 'Retry' }) });
  if (await alert.first().isVisible().catch(() => false)) return { verdict: 'PASS', detail: (await alert.first().innerText()).slice(0, 200) };
  const spinner = main.locator('[role="status"]').or(main.getByText(/^Working…$/));
  if (await spinner.first().isVisible().catch(() => false)) return { verdict: 'FAIL-permanent-spinner', detail: 'loading state still visible' };
  for (const re of emptyTexts) {
    const el = main.getByText(re).first();
    if (await el.isVisible().catch(() => false)) return { verdict: 'FAIL-misleading-empty', detail: (await el.innerText()).slice(0, 200) };
  }
  return { verdict: 'FAIL-other', detail: (await main.innerText()).slice(0, 300) };
}

async function run(
  { page, testInfo, audit }: { page: Page; testInfo: TestInfo; audit: { allow5xx: (re: RegExp) => void } },
  o: { path: string; procs: string[]; empty: RegExp[]; recovered: (p: Page) => Promise<void>; name: string },
) {
  // Injected by this test (route.fulfill 500) — expected.
  audit.allow5xx(new RegExp(o.procs.map((p) => p.replace('.', '\\.')).join('|')));
  const f = await failProcs(page, o.procs);
  const t0 = Date.now();
  await page.goto(o.path);
  await ready(page).catch(() => undefined);
  await page.waitForTimeout(12_000); // react-query retry:1 + backoff, polls, etc.
  const c = await classify(page, o.empty);
  await shot(page, testInfo, `${o.name}-failing`, true);
  testInfo.annotations.push({ type: 'verdict', description: `${o.name}: ${c.verdict} — ${c.detail.replace(/\s+/g, ' ')}` });
  await testInfo.attach('verdict.json', { body: JSON.stringify({ ...c, procs: o.procs, injected: f.hits.length, sampleHits: f.hits.slice(0, 5), ms: Date.now() - t0 }, null, 2), contentType: 'application/json' });
  expect(f.hits.length, 'the primary procedure was actually requested').toBeGreaterThan(0);
  expect(c.verdict, `${o.name}: ${c.detail}`).toBe('PASS');
  await f.off();
  await page.getByRole('button', { name: 'Retry' }).first().click();
  await o.recovered(page);
  await shot(page, testInfo, `${o.name}-recovered`);
}

const screens: { name: string; role: Role; path: string; procs: string[]; empty: RegExp[]; recovered: (p: Page) => Promise<void> }[] = [
  {
    name: 'coach-revenue',
    role: 'coachA',
    path: '/coach/revenue',
    procs: ['coachClients.dashboardSummaries', 'coachClients.listMyClientUsers', 'coachClients.list'],
    empty: [/No clients|EGP\s*0|^0$/],
    recovered: async (p) => expect(p.getByTestId('coach-revenue')).toContainText(/\d/),
  },
  {
    name: 'client-messages',
    role: 'clientA',
    path: '/messages',
    procs: ['messages.list'],
    empty: [/No messages yet/],
    recovered: async (p) => expect(p.getByText('Working…')).toHaveCount(0),
  },
  {
    name: 'coach-messages',
    role: 'coachA',
    path: '/coach/messages',
    procs: ['coachClients.listMyClientUsers'],
    empty: [/No clients yet/, /No results/],
    recovered: async (p) => expect(p.getByText('Client Aya').first()).toBeVisible(),
  },
  {
    name: 'coach-clients',
    role: 'coachA',
    path: '/coach/clients',
    procs: ['coachClients.listMyClientUsers', 'coachClients.dashboardSummaries', 'coachClients.list'],
    empty: [/No clients yet/],
    recovered: async (p) => expect(p.getByText('Client Aya').first()).toBeVisible(),
  },
  {
    name: 'admin-coaches',
    role: 'super',
    path: '/admin/coaches',
    procs: ['adminCoaches.list'],
    empty: [/No coaches/i],
    recovered: async (p) => expect(p.getByText('Coach Amira').first()).toBeVisible(),
  },
  {
    name: 'admin-plans',
    role: 'super',
    path: '/admin/plans',
    procs: ['coachPlanTiers.list'],
    empty: [/No plans yet/],
    recovered: async (p) => expect(p.getByTestId('plan-row').first()).toBeVisible(),
  },
  {
    name: 'coach-my-plan',
    role: 'coachA',
    path: '/coach/plan',
    procs: ['coachPlans.me'],
    empty: [/—/],
    recovered: async (p) => expect(p.getByTestId('coach-plan')).toContainText(/Trial|trial/),
  },
];

for (const s of screens) {
  test(`${s.name}: primary query 500 → real error state with retry`, async ({ as, audit }, testInfo) => {
    test.setTimeout(90_000);
    const { page } = await as(s.role);
    await run({ page, testInfo, audit }, s);
  });
}

test('client home: workout/nutrition/profile fetch 500 → not presented as "waiting for coach"', async ({ as, db, audit }, testInfo) => {
  test.setTimeout(120_000);
  // A real assigned plan (test-owned; removed after) so "waiting for your coach" would be a lie.
  await db.deleteMany('clientWorkoutPlans', { _id: 'e2e-client-a' });
  await db.insertOne('clientWorkoutPlans', {
    _id: 'e2e-client-a',
    clientId: 'e2e-client-a',
    id: 'plan-e2e-d-home',
    name: 'E2E Home Plan',
    days: [{ id: 'd1', dayIndex: 0, title: 'Push Day', focus: 'Chest', exerciseIds: ['ex1'], sections: [{ id: 's1', title: 'Main', kind: 'main', exerciseIds: ['ex1'] }] }],
    exercises: { ex1: { id: 'ex1', name: 'Bench Press', targetMuscle: 'Chest', warmupSets: '1', warmupSetCount: 1, workingSets: 3, repRange: '8-10', restSec: 90, notes: { en: '', ar: '' }, videoUrl: null } },
    updatedAt: Date.now(),
  });
  try {
    // Control: healthy backend shows the plan, not the waiting card.
    const ok = await as('clientA');
    await ok.page.goto('/');
    await ready(ok.page);
    await expect(ok.page.getByTestId('client-home')).toBeVisible();
    await expect(ok.page.getByTestId('waiting-for-coach')).toHaveCount(0, { timeout: 15_000 });
    await shot(ok.page, testInfo, 'home-healthy');

    const { page } = await as('clientA');
    await run(
      { page, testInfo, audit },
      {
        name: 'client-home',
        path: '/',
        procs: ['workoutPlan.get', 'nutritionPlan.get', 'coachTargets.get', 'profile.get'],
        empty: [/Waiting for your coach to assign your plan/],
        recovered: async (p) => expect(p.getByTestId('waiting-for-coach')).toHaveCount(0),
      },
    );
  } finally {
    await db.deleteMany('clientWorkoutPlans', { _id: 'e2e-client-a' });
  }
});

test('plain admin deep link /admin/subscriptions redirects to /admin without a spinner', async ({ as }, testInfo) => {
  const { page } = await as('admin');
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(...procsOf(r.url())));
  await page.goto('/admin/subscriptions');
  await ready(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('admin-subscriptions')).toHaveCount(0);
  await expect(page.locator('main [role="status"]')).toHaveCount(0);
  expect(reqs.filter((p) => ['adminCoaches.list', 'adminGrowth.get', 'coachPlanRequests.listPending'].includes(p))).toEqual([]);
  await shot(page, testInfo, 'admin-redirected');
});
