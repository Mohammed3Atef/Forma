import { test as base, expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared Phase-3 fixtures:
 *  - `env`      the running isolated environment (server.mjs manifest)
 *  - `db`       scoped DB ops against the run's in-memory Mongo, via the env
 *               server's localhost control API (the mongodb driver can't load
 *               inside Playwright's test loader)
 *  - `as(role)` a FRESH browser context signed in as that seeded account. The
 *               session is a real refresh token (hashed in `refreshTokens`,
 *               sent as the httpOnly `forma_rt` cookie) — exactly what a login
 *               produces — minted directly so dozens of contexts don't trip the
 *               per-account login rate limiter. Login UI is tested in auth.spec.
 *  - `audit`    console errors, page errors, 4xx/5xx, failed requests for every
 *               page of every context the test opens; attached to the report;
 *               an unexplained 5xx or uncaught page error fails the test.
 */

export type Role = 'super' | 'admin' | 'coachA' | 'coachB' | 'coachPro' | 'clientA' | 'clientB' | 'clientFree';
export interface E2EEnv {
  baseURL: string;
  dbName: string;
  mongoUri: string;
  cronSecret: string;
  runDir: string;
  password: string;
  bunny: { dir: string; cdn: string; mode: string };
  accounts: Record<Role, { id: string; email: string; role: string }>;
}

export interface NetEvent {
  kind: 'console' | 'pageerror' | 'http' | 'requestfailed';
  who: string;
  text: string;
  status?: number;
  url?: string;
}

const PORT = process.env.E2E_PORT ?? '5199';
const STUB = `http://127.0.0.1:${process.env.E2E_STUB_PORT ?? '5299'}`;
function readEnv(): E2EEnv {
  return JSON.parse(fs.readFileSync(path.join('e2e-out', `current-env-${PORT}.json`), 'utf8'));
}

async function control<T>(route: string, body: unknown): Promise<T> {
  const r = await fetch(`${STUB}/__e2e/${route}`, { method: 'POST', body: JSON.stringify(body) });
  const j = (await r.json()) as T & { ok?: boolean; error?: string };
  if (!r.ok) throw new Error(`control ${route} failed: ${j.error ?? r.status}`);
  return j;
}

export interface Db {
  findOne<T = Record<string, unknown>>(collection: string, filter?: object): Promise<T | null>;
  find<T = Record<string, unknown>>(collection: string, filter?: object, opts?: { sort?: object; limit?: number }): Promise<T[]>;
  count(collection: string, filter?: object): Promise<number>;
  updateOne(collection: string, filter: object, update: object): Promise<void>;
  updateMany(collection: string, filter: object, update: object): Promise<void>;
  insertOne(collection: string, doc: object): Promise<void>;
  deleteMany(collection: string, filter: object): Promise<void>;
  resetToken(userId: string): Promise<string>;
  bunnyPuts(): Promise<{ path: string; bytes: number; contentType: string }[]>;
}

const db: Db = {
  findOne: async (collection, filter = {}) => (await control<{ out: never }>('db', { op: 'findOne', collection, filter })).out,
  find: async (collection, filter = {}, opts = {}) => (await control<{ out: never[] }>('db', { op: 'find', collection, filter, ...opts })).out,
  count: async (collection, filter = {}) => (await control<{ out: number }>('db', { op: 'countDocuments', collection, filter })).out,
  updateOne: async (collection, filter, update) => void (await control('db', { op: 'updateOne', collection, filter, update })),
  updateMany: async (collection, filter, update) => void (await control('db', { op: 'updateMany', collection, filter, update })),
  insertOne: async (collection, doc) => void (await control('db', { op: 'insertOne', collection, doc })),
  deleteMany: async (collection, filter) => void (await control('db', { op: 'deleteMany', collection, filter })),
  resetToken: async (userId) => (await control<{ raw: string }>('reset-token', { userId })).raw,
  bunnyPuts: async () => control('bunny-puts', {}),
};

/** Expected, explained 4xx: the anonymous boot's silent refresh probe. Everything else is recorded and reviewed. */
export const EXPECTED_HTTP = [/auth\.refresh/];

function attachAudit(context: BrowserContext, who: string, events: NetEvent[]) {
  const watch = (page: Page) => {
    page.on('console', (m) => {
      if (m.type() === 'error') events.push({ kind: 'console', who, text: m.text().slice(0, 400) });
    });
    page.on('pageerror', (e) => events.push({ kind: 'pageerror', who, text: String(e).slice(0, 400) }));
    page.on('response', (r) => {
      if (r.status() >= 400) events.push({ kind: 'http', who, status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), text: r.request().method() });
    });
    page.on('requestfailed', (r) => {
      const why = r.failure()?.errorText ?? '';
      if (!/ERR_ABORTED|cancelled|NS_BINDING_ABORTED|Load request cancelled/i.test(why)) events.push({ kind: 'requestfailed', who, url: r.url(), text: why });
    });
  };
  context.pages().forEach(watch);
  context.on('page', watch);
}

type NewCtxOpts = Parameters<Browser['newContext']>[0];
type Fixtures = {
  env: E2EEnv;
  db: Db;
  audit: { events: NetEvent[]; allow5xx: (re: RegExp) => void; allowPageError: (re: RegExp) => void };
  as: (role: Role, opts?: NewCtxOpts) => Promise<{ context: BrowserContext; page: Page }>;
  anon: (opts?: NewCtxOpts) => Promise<{ context: BrowserContext; page: Page }>;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  env: async ({}, use) => use(readEnv()),
  // eslint-disable-next-line no-empty-pattern
  db: async ({}, use) => use(db),
  audit: [
    async ({ context }, use, testInfo) => {
      const events: NetEvent[] = [];
      const allowed5xx: RegExp[] = [];
      const allowedPE: RegExp[] = [];
      attachAudit(context, 'default', events);
      await use({ events, allow5xx: (re) => allowed5xx.push(re), allowPageError: (re) => allowedPE.push(re) });
      await testInfo.attach('console-network.json', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
      const bad5xx = events.filter((e) => e.kind === 'http' && (e.status ?? 0) >= 500 && !allowed5xx.some((re) => re.test(e.url ?? '')));
      const pageErrors = events.filter((e) => e.kind === 'pageerror' && !allowedPE.some((re) => re.test(e.text)));
      expect.soft(bad5xx, 'unexplained 5xx responses').toEqual([]);
      expect.soft(pageErrors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
  as: async ({ browser, env, audit }, use, testInfo) => {
    const opened: BrowserContext[] = [];
    await use(async (role, opts) => {
      const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: env.baseURL, ...(opts ?? {}) });
      opened.push(ctx);
      attachAudit(ctx, role, audit.events);
      const { raw } = await control<{ raw: string }>('session', { userId: env.accounts[role].id });
      await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
      return { context: ctx, page: await ctx.newPage() };
    });
    for (const c of opened) await c.close();
  },
  anon: async ({ browser, env, audit }, use, testInfo) => {
    const opened: BrowserContext[] = [];
    await use(async (opts) => {
      const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: env.baseURL, ...(opts ?? {}) });
      opened.push(ctx);
      attachAudit(ctx, 'anon', audit.events);
      return { context: ctx, page: await ctx.newPage() };
    });
    for (const c of opened) await c.close();
  },
});

export { expect };

/** Wait until a signed-in role app has mounted (no splash, no login form). */
export async function ready(page: Page) {
  await expect(page.getByTestId('login-email')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

export async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  await testInfo.attach(`${name}.png`, { body: await page.screenshot({ fullPage }), contentType: 'image/png' });
}
