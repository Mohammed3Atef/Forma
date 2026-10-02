import type { Page, Response, TestInfo } from '@playwright/test';
import { test, expect, ready, shot, type Role } from '../fixtures';
import { procsOf } from './_d-helpers';

/**
 * Network hygiene per role: walk the role's main pages, then idle 2 min on
 * the page that polls the most, and record
 *   - tRPC calls per procedure during idle (vs the documented poll cadence),
 *   - duplicate concurrent identical requests (same URL while one is in flight),
 *   - first-load payload (sum of response bodies) + the heaviest assets,
 *   - every 4xx/5xx, classified.
 */
const IDLE_MS = 120_000;
/** Max calls per procedure in IDLE_MS — documented cadence + slack. Anything else polled is reported. */
const BUDGET: Record<string, number> = {
  // THREAD_POLL_MS 5 s (open thread) + BADGE_POLL_MS 20 s (unread badge) + slack.
  'messages.list': Math.ceil(IDLE_MS / 5_000) + Math.ceil(IDLE_MS / 20_000) + 3,
  // SyncEngine: one sync cycle per 120 s pulls each of its 8 collections (SyncEngine.ts COLLECTIONS).
  'sync.pull': 8 * (Math.ceil(IDLE_MS / 120_000) + 1),
  'notifications.list': Math.ceil(IDLE_MS / 25_000) + 2, // NOTIF_POLL_MS 25 s
  'messages.coachThreadsSummary': Math.ceil(IDLE_MS / 20_000) + 2, // BADGE_POLL_MS 20 s
};
const DEFAULT_BUDGET = 6; // e.g. 60 s refetchIntervals + one focus refetch

const plan: { role: Role; pages: string[]; idle: string }[] = [
  { role: 'clientA', pages: ['/', '/workout', '/nutrition', '/progress', '/messages'], idle: '/messages' },
  { role: 'coachA', pages: ['/coach/dashboard', '/coach/clients', '/coach/client/e2e-client-a', '/coach/messages', '/coach/messages/e2e-client-a'], idle: '/coach/messages/e2e-client-a' },
  { role: 'super', pages: ['/admin', '/admin/accounts', '/admin/coaches', '/admin/plans', '/admin/subscriptions'], idle: '/admin' },
];

function track(page: Page) {
  const calls: { proc: string; at: number }[] = [];
  const inflight = new Map<string, number>();
  const dupes: string[] = [];
  const errors: { status: number; url: string }[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    for (const p of procsOf(u)) calls.push({ proc: p, at: Date.now() });
    const key = `${r.method()} ${u}`;
    const n = inflight.get(key) ?? 0;
    if (n > 0 && r.method() === 'GET') dupes.push(key.replace(/^GET https?:\/\/[^/]+/, ''));
    inflight.set(key, n + 1);
  });
  const done = (r: import('@playwright/test').Request) => {
    const key = `${r.method()} ${r.url()}`;
    inflight.set(key, Math.max(0, (inflight.get(key) ?? 1) - 1));
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push({ status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '') });
  });
  return { calls, dupes, errors };
}

async function firstLoad(page: Page, path: string) {
  const sizes: { url: string; bytes: number; type: string }[] = [];
  const pending: Promise<void>[] = [];
  const on = (r: Response) => {
    pending.push(
      r
        .body()
        .then((b) => void sizes.push({ url: r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0], bytes: b.length, type: r.request().resourceType() }))
        .catch(() => undefined),
    );
  };
  page.on('response', on);
  await page.goto(path);
  await ready(page);
  await Promise.all(pending);
  page.off('response', on);
  const total = sizes.reduce((a, s) => a + s.bytes, 0);
  const byType: Record<string, number> = {};
  for (const s of sizes) byType[s.type] = (byType[s.type] ?? 0) + s.bytes;
  return { requests: sizes.length, totalBytes: total, byType, heaviest: [...sizes].sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
}

const classify = (e: { status: number; url: string }) =>
  /auth\.refresh/.test(e.url) && e.status === 401 ? 'expected: anonymous refresh probe' : e.status >= 500 ? 'server error' : e.status === 404 ? 'not found' : e.status === 401 || e.status === 403 ? 'auth/permission' : 'client error';

for (const p of plan) {
  test(`${p.role}: request rates, duplicates, payload, errors over 2 min idle`, async ({ as }, testInfo: TestInfo) => {
    test.setTimeout(IDLE_MS + 150_000);
    const { page } = await as(p.role);
    const t = track(page);
    const load = await firstLoad(page, p.pages[0]);
    for (const path of p.pages.slice(1)) {
      await page.goto(path);
      await ready(page);
      await page.waitForTimeout(1500);
    }
    await page.goto(p.idle);
    await ready(page);
    await page.waitForTimeout(2000);
    const idleStart = Date.now();
    await page.waitForTimeout(IDLE_MS);
    await shot(page, testInfo, `${p.role}-idle-end`);
    const idle: Record<string, number> = {};
    for (const c of t.calls) if (c.at >= idleStart) idle[c.proc] = (idle[c.proc] ?? 0) + 1;
    const total: Record<string, number> = {};
    for (const c of t.calls) total[c.proc] = (total[c.proc] ?? 0) + 1;
    const runaway = Object.entries(idle).filter(([proc, n]) => n > (BUDGET[proc] ?? DEFAULT_BUDGET));
    const errors = t.errors.map((e) => ({ ...e, class: classify(e) }));
    const report = { role: p.role, idlePage: p.idle, idleSeconds: IDLE_MS / 1000, idleCallsPerProc: idle, totalCallsPerProc: total, runaway, duplicatesInFlight: [...new Set(t.dupes)].map((d) => ({ url: d.slice(0, 200), n: t.dupes.filter((x) => x === d).length })), firstLoad: load, errors };
    testInfo.annotations.push({ type: 'perf', description: JSON.stringify({ idle, runaway, dupes: report.duplicatesInFlight.length, firstLoadKB: Math.round(load.totalBytes / 1024), firstLoadReqs: load.requests, errors: errors.length }) });
    await testInfo.attach('network-report.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    expect.soft(runaway, 'procedures polled faster than their documented cadence').toEqual([]);
    expect.soft(errors.filter((e) => e.class === 'server error'), '5xx during the session').toEqual([]);
    expect.soft(report.duplicatesInFlight, 'identical GETs issued while one is still in flight').toEqual([]);
  });
}
