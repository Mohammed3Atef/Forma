/**
 * B3.4 release gate — older clients against the NEW check-in API (owner review, 2026-10-18).
 *
 * Runs the ACTUAL previous client builds — RC2 (cf3a5d9, the build live in production) and B3.3
 * (28035b6, the last local checkpoint, the first with drafts + the offline outbox) — and this
 * build, each a production bundle with its own service worker, against ONE isolated e2e3 stack
 * running the new API. Nothing here touches a shared or production system.
 *
 *   node e2e3/pwa/b34-checkin-compat.mjs <rc2Dist> <b33Dist> <newDist> <outDir>
 *
 * Builds: `git worktree add <dir> <commit>` + `npx vite build --outDir <dist>` with
 * VITE_GOOGLE_CLIENT_ID / VITE_ANALYTICS_* empty. Writes <outDir>/matrix.json + screenshots.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { chromium } from '@playwright/test';

const [rc2Arg, b33Arg, newArg, outArg] = process.argv.slice(2);
const DIST = { rc2: path.resolve(rc2Arg), b33: path.resolve(b33Arg), new: path.resolve(newArg) };
const OUT = path.resolve(outArg ?? `e2e-out/b34-compat-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });
const API = 5251;
const STUB = 5351;

const X = 'e2e-client-a';
const A = 'e2e-coach-a';
const B = 'e2e-coach-b';
const W = '2026-10-12';
const W_END = '2026-10-18';
const KEY_A = `${X}__${W}`;
const KEY_B = `${X}__${W}__${B}`;

// ---- isolated stack (new API) --------------------------------------------
const stack = spawn(process.execPath, ['e2e3/env/server.mjs'], {
  env: { ...process.env, E2E_PORT: String(API), E2E_STUB_PORT: String(STUB), E2E_RUN_DIR: path.join(OUT, 'stack') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
stack.stdout.on('data', (d) => fs.appendFileSync(path.join(OUT, 'stack.log'), d));
stack.stderr.on('data', (d) => fs.appendFileSync(path.join(OUT, 'stack.log'), d));
const portOpen = (port) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1', () => { s.end(); res(true); });
  s.on('error', () => res(false));
});
const until = Date.now() + 180_000;
while (!(await portOpen(API)) || !fs.existsSync(path.join(OUT, 'stack', 'env.json'))) {
  if (Date.now() > until) { stack.kill(); throw new Error('stack did not start'); }
  await new Promise((r) => setTimeout(r, 1000));
}
const ENV = JSON.parse(fs.readFileSync(path.join(OUT, 'stack', 'env.json'), 'utf8'));
// Warm the dev API once (first tRPC request compiles the router).
for (let i = 0; i < 60; i++) {
  const ok = await fetch(`http://127.0.0.1:${API}/api/trpc/health.ping`).then((r) => r.status < 500).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}

// ---- helpers --------------------------------------------------------------
async function db(op, collection, args = {}) {
  const r = await fetch(`http://127.0.0.1:${STUB}/__e2e/db`, { method: 'POST', body: JSON.stringify({ op, collection, ...args }) }).then((x) => x.json());
  if (!r.ok) throw new Error(r.error);
  return r.out;
}
const ROLE = { [A]: 'coach', [B]: 'coach', [X]: 'client', 'e2e-admin': 'admin' };
const bearer = (id) => jwt.sign({ role: ROLE[id], accountStatus: 'active' }, ENV.jwtSecret, { subject: id, expiresIn: 900, algorithm: 'HS256' });
async function trpc(kind, proc, input, who) {
  const base = `http://127.0.0.1:${API}/api/trpc/${proc}`;
  const r = await fetch(kind === 'query' ? `${base}?input=${encodeURIComponent(JSON.stringify(input))}` : base, {
    method: kind === 'query' ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer(who)}` },
    body: kind === 'query' ? undefined : JSON.stringify(input),
  });
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { data: j.error.data });
  return j.result?.data;
}
const request = (coach) => trpc('mutation', 'checkIns.request', { clientId: X, weekStart: W, weekEnd: W_END, coachId: coach }, coach);
async function handOver() {
  await trpc('mutation', 'coachClients.end', { id: `${A}__${X}`, reason: 'released' }, A);
  await new Promise((r) => setTimeout(r, 5));
  await trpc('mutation', 'coachClients.assign', { clientId: X, subscription: { status: 'active', months: 1 } }, B);
}
async function reset() {
  const now = Date.now();
  await db('deleteMany', 'checkIns', { filter: { clientId: X } });
  await db('deleteMany', 'notifications', { filter: { clientId: X } });
  await db('deleteMany', 'coachClients', { filter: { clientId: X } });
  await db('insertOne', 'coachClients', { doc: { _id: `${A}__${X}`, coachId: A, clientId: X, status: 'active', createdBy: A, createdAt: now - 86_400_000, updatedAt: now, subscription: { status: 'active', startAt: now - 86_400_000, endAt: now + 29 * 86_400_000, months: 1, price: 800, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } } });
  await db('updateOne', 'users', { filter: { _id: X }, update: { $set: { assignedCoachId: A } } });
  await db('updateMany', 'coachPlans', { filter: { _id: { $in: [A, B] } }, update: { $set: { activeClientCount: 1 } } });
}
const rec = (id) => db('findOne', 'checkIns', { filter: { _id: id } });
const brief = (d) => (d ? { status: d.status, notes: d.notes ?? null, coachId: d.coachId ?? null } : null);
async function waitFor(fn, ok, ms = 20_000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
  return v;
}

// ---- static servers (one origin per build; an "update" origin can switch builds) ----
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const servers = [];
function serve(port, root) {
  const ref = { root };
  const s = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) {
      const p = http.request({ host: '127.0.0.1', port: API, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API}` } }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      p.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(p);
      return;
    }
    // Vercel serves its analytics script in production; locally it would fall back to index.html (a page error).
    if (u.pathname.startsWith('/_vercel/')) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.end('');
    }
    let file = path.join(ref.root, decodeURIComponent(u.pathname));
    if (!file.startsWith(ref.root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ref.root, 'index.html');
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', u.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
    res.end(fs.readFileSync(file));
  });
  s.listen(port, '127.0.0.1');
  servers.push(s);
  return ref;
}
const ORIGIN = { rc2: 5271, b33: 5272, new: 5273 };
for (const [k, port] of Object.entries(ORIGIN)) serve(port, DIST[k]);
const UPD = { b33: { port: 5274, ref: serve(5274, DIST.b33) }, rc2: { port: 5275, ref: serve(5275, DIST.rc2) } };
const entryOf = (dist) => (fs.readFileSync(path.join(dist, 'index.html'), 'utf8').match(/src="(\/assets\/index-[^"]+\.js)"/) ?? [])[1];
const NEW_ENTRY = entryOf(DIST.new);

const browser = await chromium.launch();
async function clientPage(port) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { raw } = await fetch(`http://127.0.0.1:${STUB}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: X }) }).then((r) => r.json());
  await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
  const c = { ctx, page: null, errors: [], submits: [], base: `http://127.0.0.1:${port}` };
  await attach(c);
  return c;
}
async function attach(c) {
  c.page = await c.ctx.newPage();
  c.page.on('pageerror', (e) => c.errors.push(String(e).slice(0, 200)));
  c.page.on('request', (r) => {
    if (r.url().includes('checkIns.submit')) c.submits.push(r.postData());
  });
}
const runningNew = (c) => c.page.evaluate((entry) => [...document.scripts].some((s) => s.src.includes(entry)), NEW_ENTRY).catch(() => false);
/**
 * Take the update the way the old app offers it: its own update control (B1+), or — when that is
 * covered (a full-screen check-in) or absent — closing and reopening the app, which activates the
 * waiting service worker. Returns how the new build arrived.
 */
async function applyUpdate(c) {
  await c.page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update()).catch(() => undefined);
  await c.page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30_000 }).catch(() => undefined);
  const btn = c.page.getByTestId('update-available');
  if (await btn.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)) {
    await btn.click({ timeout: 5_000 }).catch(() => undefined);
    await settle(c.page, 500);
    if (await c.page.getByTestId('confirm-accept').count()) await c.page.getByTestId('confirm-accept').click().catch(() => undefined);
    await c.page.waitForFunction((entry) => [...document.scripts].some((s) => s.src.includes(entry)), NEW_ENTRY, { timeout: 20_000 }).catch(() => undefined);
    if (await runningNew(c)) return 'update control';
  }
  const url = c.page.url();
  await c.page.close();
  await attach(c);
  await c.page.goto(url);
  await c.page.waitForFunction((entry) => [...document.scripts].some((s) => s.src.includes(entry)), NEW_ENTRY, { timeout: 20_000 }).catch(() => undefined);
  if (await runningNew(c)) return 'reopen';
  await c.page.reload();
  return (await runningNew(c)) ? 'reopen+reload' : 'NOT UPDATED';
}
const settle = (page, ms = 1200) => page.waitForTimeout(ms);
async function home(c) {
  await c.page.goto(`${c.base}/`);
  return c.page.getByTestId('client-home').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
}
/** Click the Home check-in card; returns the route it opened (or null when there is no card). */
async function homeCard(c) {
  if (!(await home(c))) return 'NO_HOME';
  await settle(c.page, 1500);
  const card = c.page.getByTestId('home-checkin');
  if (!(await card.count())) return null;
  await card.first().click();
  await c.page.waitForURL(/\/check-in\//, { timeout: 10_000 }).catch(() => undefined);
  return new URL(c.page.url()).pathname;
}
async function historyRows(c) {
  await c.page.goto(`${c.base}/check-ins`);
  await settle(c.page, 2500);
  const rows = c.page.locator('[data-testid="checkin-history-row"], [data-testid="client-checkins"] a[href^="/check-in/"]');
  const targets = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? 'button'));
  return { rows: targets.length, targets };
}
/** The check-in screen once it has rendered (Home gone; RC2 has no `checkin-flow` id). */
async function checkinScreen(c) {
  await c.page
    .waitForFunction(
      () =>
        !document.querySelector('[data-testid="client-home"]') &&
        (!!document.querySelector('[data-testid="checkin-flow"],[data-testid="checkin-next"],[data-testid="checkin-submit"],[data-testid="checkin-closed"],[data-testid="checkin-queued"],[data-testid="checkin-load-error"]') ||
          /not found|غير موجودة|مش موجودة|Reviewed|Submitted/i.test(document.body.innerText)),
      null,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await settle(c.page, 600);
  return screenState(c);
}
/** What /check-in/<key> shows: the wizard, a read-only summary, a closed notice, an error… */
async function openKey(c, key) {
  await c.page.goto(`${c.base}/check-in/${key}`);
  return checkinScreen(c);
}
async function screenState(c) {
  return c.page.evaluate(() => {
    const has = (id) => !!document.querySelector(`[data-testid="${id}"]`);
    if (has('checkin-closed')) return 'closed';
    if (has('checkin-queued')) return `queued:${document.querySelector('[data-testid="checkin-queued"]').getAttribute('data-outbox-status')}`;
    if (has('checkin-flow') || has('checkin-next') || has('checkin-submit')) return 'wizard';
    if (has('checkin-load-error')) return 'load-error';
    const t = document.body.innerText;
    if (/not found|غير موجودة|مش موجودة/i.test(t)) return 'not-found';
    if (/Reviewed|Submitted/i.test(t)) return `summary:${/A: well done/.test(t) ? 'with-A-feedback' : 'no-feedback'}`;
    return 'other';
  });
}
async function fillAndSubmit(c, notes, opts = {}) {
  try {
    return await fillAndSubmitRaw(c, notes, opts);
  } catch (e) {
    return { error: `THROWN: ${String(e).split(/\r?\n/)[0]}`, notesStillOnScreen: null };
  }
}
async function fillAndSubmitRaw(c, notes, { taps = 1 } = {}) {
  await c.page.locator('[data-testid="checkin-next"],[data-testid="checkin-submit"]').first().waitFor({ timeout: 15_000 });
  for (let i = 0; i < 6 && !(await c.page.getByTestId('checkin-notes').count()); i++) {
    await c.page.getByTestId('checkin-next').click({ timeout: 5_000 }).catch(() => undefined);
    await settle(c.page, 250);
  }
  await c.page.getByTestId('checkin-notes').fill(notes, { timeout: 10_000 });
  await settle(c.page, 300);
  const submit = c.page.getByTestId('checkin-submit');
  for (let i = 0; i < taps; i++) await submit.click({ timeout: 3000 }).catch(() => undefined);
  await settle(c.page, 2500);
  const error = await c.page.getByTestId('checkin-error').count();
  const notesStill = await c.page.getByTestId('checkin-notes').inputValue().catch(() => null);
  return { error: !!error, notesStillOnScreen: notesStill };
}
const draftOf = (c, key) => c.page.evaluate((k) => {
  for (let i = 0; i < localStorage.length; i++) {
    const n = localStorage.key(i);
    if (n && n.startsWith('forma.checkinDraft.v1.') && n.endsWith(`.${k}`)) return JSON.parse(localStorage.getItem(n)).form?.notes ?? null;
  }
  return null;
}, key);
async function shot(c, name) {
  await c.page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => undefined);
}

const matrix = [];
function row(scenario, build, step, observed, expected, pass, note = '') {
  matrix.push({ scenario, build, step, observed, expected, pass, note });
  console.log(`[compat] ${pass ? 'PASS' : 'FAIL'} ${scenario} | ${build} | ${step} | ${JSON.stringify(observed)}${note ? ` — ${note}` : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ===========================================================================
// S1 — the common hand-over: A's week completed, then B asks for the same week.
// ===========================================================================
for (const build of ['rc2', 'b33', 'new']) {
  await reset();
  await request(A);
  await trpc('mutation', 'checkIns.submit', { weekStart: W, notes: 'For A', byKey: true }, X);
  await trpc('mutation', 'checkIns.review', { clientId: X, weekStart: W, feedback: 'A: well done' }, A);
  await handOver();
  await request(B);
  const c = await clientPage(ORIGIN[build]);
  const S = 'S1 completed A + open B, same week';
  const card = await homeCard(c);
  const expCard = build === 'new' ? `/check-in/${W}__${B}` : `/check-in/${W}`;
  row(S, build, 'Home check-in card opens', card, expCard, card === expCard);
  const cardScreen = card && card !== 'NO_HOME' ? await checkinScreen(c) : null;
  row(S, build, 'Home card shows B\'s request (wizard)', cardScreen, 'wizard', cardScreen === 'wizard');
  await shot(c, `S1-${build}-card`);
  const hist = await historyRows(c);
  row(S, build, 'History rows (A\'s completed + B\'s open)', hist, build === 'new' ? '2 rows: both records by key' : '1 row per week (B\'s) — A\'s completed record returns after the update', build === 'new' ? hist.rows === 2 : hist.rows === 1);
  await shot(c, `S1-${build}-history`);
  const aLink = await openKey(c, W);
  row(S, build, 'A\'s old notification link /check-in/W', aLink, build === 'new' ? 'summary:with-A-feedback' : 'wizard (B\'s record — the one this app lists for the week)', build === 'new' ? aLink === 'summary:with-A-feedback' : aLink === 'wizard');
  const bLink = await openKey(c, `${W}__${B}`);
  row(S, build, 'B\'s notification link /check-in/W__coachB', bLink, 'wizard', bLink === 'wizard');
  // Submit from the Home card (the everyday path), tapping Submit three times.
  await homeCard(c);
  const sub = await fillAndSubmit(c, `From ${build}`, { taps: 3 });
  const [ra, rb] = await Promise.all([rec(KEY_A), waitFor(() => rec(KEY_B), (d) => d?.status === 'submitted')]);
  row(S, build, 'Submit from Home → B\'s record; A\'s untouched', { A: brief(ra), B: brief(rb), uiError: sub.error }, { A: 'reviewed/For A', B: `submitted/From ${build}` }, ra?.status === 'reviewed' && ra?.notes === 'For A' && rb?.status === 'submitted' && rb?.notes === `From ${build}`);
  row(S, build, 'Repeated taps → one submission request', c.submits.length, 1, c.submits.length === 1);
  row(S, build, 'Submission addressed', c.submits.map((p) => (p ?? '').replace(/"notes":"[^"]*",?/, '')), build === 'new' ? 'key + byKey' : 'week only (no byKey)', true, 'evidence');
  await shot(c, `S1-${build}-submitted`);
  row(S, build, 'page errors', c.errors, [], c.errors.length === 0);
  await c.ctx.close();
}

// ===========================================================================
// S2 — two open requests in one week: A's left open, B's new.
// ===========================================================================
for (const build of ['rc2', 'b33', 'new']) {
  await reset();
  await request(A);
  await handOver();
  await request(B);
  const c = await clientPage(ORIGIN[build]);
  const S = 'S2 open A (stale) + open B, same week';
  const card = await homeCard(c);
  const expCard = build === 'new' ? `/check-in/${W}__${B}` : `/check-in/${W}`;
  row(S, build, 'Home check-in card opens', card, expCard, card === expCard);
  const hist = await historyRows(c);
  row(S, build, 'History rows (A\'s stale request hidden)', hist, 1, hist.rows === 1);
  if (build === 'new') {
    const aLink = await openKey(c, W);
    row(S, build, 'A\'s old link /check-in/W → closed notice', aLink, 'closed', aLink === 'closed');
    await shot(c, `S2-${build}-closed`);
    await homeCard(c);
    const sub = await fillAndSubmit(c, 'New app for B');
    const [ra, rb] = await Promise.all([rec(KEY_A), waitFor(() => rec(KEY_B), (d) => d?.status === 'submitted')]);
    row(S, build, 'Submit from Home → B\'s record; A\'s untouched', { A: brief(ra), B: brief(rb), uiError: sub.error }, { A: 'requested', B: 'submitted' }, ra?.status === 'requested' && !ra?.notes && rb?.status === 'submitted' && rb?.notes === 'New app for B');
  } else {
    // By week the answers could be meant for either request: refused, never redirected; answers kept.
    await homeCard(c);
    const sub = await fillAndSubmit(c, `Old ${build} by week`);
    const [ra, rb] = await Promise.all([rec(KEY_A), rec(KEY_B)]);
    const draft = build === 'b33' ? await draftOf(c, W) : null;
    row(S, build, 'Submit by week (Home card) → refused, both untouched', { A: brief(ra), B: brief(rb), uiError: sub.error }, 'both requested, error shown', ra?.status === 'requested' && rb?.status === 'requested' && sub.error === true && !ra?.notes && !rb?.notes);
    row(S, build, 'Answers kept after the refusal', { onScreen: sub.notesStillOnScreen, draft }, build === 'b33' ? 'on screen + device draft' : 'on screen (RC2 has no drafts)', sub.notesStillOnScreen === `Old ${build} by week` && (build !== 'b33' || draft === `Old ${build} by week`));
    await shot(c, `S2-${build}-refused`);
    // B's notification link names B's record exactly — that works on the old app.
    const bLink = await openKey(c, `${W}__${B}`);
    row(S, build, 'B\'s notification link opens B\'s request', bLink, 'wizard', bLink === 'wizard');
    const sub2 = await fillAndSubmit(c, `Old ${build} via link`);
    const [ra2, rb2] = await Promise.all([rec(KEY_A), waitFor(() => rec(KEY_B), (d) => d?.status === 'submitted')]);
    row(S, build, 'Submit via B\'s link → B\'s record; A\'s untouched', { A: brief(ra2), B: brief(rb2), uiError: sub2.error }, { A: 'requested', B: 'submitted' }, ra2?.status === 'requested' && !ra2?.notes && rb2?.status === 'submitted' && rb2?.notes === `Old ${build} via link`);
  }
  const notes = await db('find', 'notifications', { filter: { clientId: X, forRole: 'client', type: 'checkin_requested' } });
  row(S, build, 'client notifications (entityId → route)', notes.map((n) => `${n.entityId} → ${n.route}${n.resolvedAt ? ' (resolved)' : ''}`), 'B\'s carries the key', notes.some((n) => n.entityId === `${W}__${B}` && n.route === `/check-in/${W}__${B}`));
  row(S, build, 'page errors', c.errors, [], c.errors.length === 0);
  await c.ctx.close();
}

// ===========================================================================
// S3 — B3.3 offline/outbox operations queued BEFORE the update, delivered by the NEW build.
// ===========================================================================
async function b33ThenUpdate(label, { between }) {
  await reset();
  await request(A);
  UPD.b33.ref.root = DIST.b33;
  const c = await clientPage(UPD.b33.port);
  await home(c);
  await c.page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => undefined);
  // The server is unreachable for submissions: the B3.3 outbox keeps the operation.
  await c.ctx.route('**/api/trpc/**checkIns.submit**', (r) => r.abort('internetdisconnected'));
  await c.page.goto(`${c.base}/check-in/${W}`);
  await c.page.getByTestId('checkin-flow').waitFor({ timeout: 15_000 }).catch(() => undefined);
  await fillAndSubmit(c, `Queued in B3.3 ${label}`);
  const queuedState = await screenState(c);
  const oldBody = c.submits[0] ?? '';
  await shot(c, `S3-${label}-b33-queued`);
  await between?.();
  // The app updates: the server now serves the new build; the old app takes it from its update prompt.
  UPD.b33.ref.root = DIST.new;
  await c.page.goto(`${c.base}/`);
  const how = await applyUpdate(c);
  const updated = how !== 'NOT UPDATED';
  c.submits.length = 0;
  // The new build sees the old queued operation (same account outbox) on the check-in it was queued for…
  const seen = await openKey(c, W);
  await c.ctx.unroute('**/api/trpc/**checkIns.submit**');
  c.submits.length = 0; // attempts aborted while unreachable don't count
  // …and sends it by itself once its retry backoff (kept from the old app, at most 5 min) runs out.
  const t0 = Date.now();
  while (!c.submits.length && Date.now() - t0 < 330_000) await settle(c.page, 1000);
  await settle(c.page, 3000);
  return { c, queuedState, oldBody, how, updated, seen, waitedS: Math.round((Date.now() - t0) / 1000) };
}
{
  const S = 'S3 B3.3 queued submission, delivered after updating';
  // (a) No hand-over meanwhile: delivered to A's request (the only record of the week).
  const r1 = await b33ThenUpdate('a', {});
  row(S, 'b33→new', 'queued in B3.3 (outbox), body addressed by week', { screen: r1.queuedState, byKey: /byKey/.test(r1.oldBody) }, { screen: 'queued:*', byKey: false }, r1.queuedState.startsWith('queued') && !/byKey/.test(r1.oldBody));
  row(S, 'b33→new', 'old app takes the update → new build running', { how: r1.how }, 'updated', r1.updated);
  row(S, 'b33→new', '(a) the new build shows the old queued submission on its check-in', r1.seen, 'queued:*', r1.seen.startsWith('queued'));
  const ra = await waitFor(() => rec(KEY_A), (d) => d?.status === 'submitted');
  row(S, 'b33→new', '(a) no hand-over: new build delivers the old op to A\'s record', { A: brief(ra), sentBy: r1.c.submits.map((p) => (/byKey/.test(p ?? '') ? 'byKey' : 'week')), afterS: r1.waitedS }, 'A submitted with the queued answers, sent by week (as queued)', ra?.status === 'submitted' && ra?.notes === 'Queued in B3.3 a' && r1.c.submits.length > 0 && !/byKey/.test(r1.c.submits[0] ?? ''));
  row(S, 'b33→new', '(a) draft cleared only after delivery', await draftOf(r1.c, W), null, (await draftOf(r1.c, W)) === null);
  await r1.c.ctx.close();

  // (b) The client changed coaches and B asked for the same week before the op was delivered.
  const r2 = await b33ThenUpdate('b', { between: async () => { await handOver(); await request(B); } });
  await settle(r2.c.page, 2000);
  const [a2, b2] = await Promise.all([rec(KEY_A), rec(KEY_B)]);
  const opState = await openKey(r2.c, W);
  row(S, 'b33→new', '(b) hand-over + B asked: the old op IS sent, refused, nothing written anywhere', { A: brief(a2), B: brief(b2), sent: r2.c.submits.length, afterS: r2.waitedS, seenBefore: r2.seen }, 'sent ≥ 1; both requested, no notes', r2.c.submits.length > 0 && a2?.status === 'requested' && !a2?.notes && b2?.status === 'requested' && !b2?.notes);
  row(S, 'b33→new', '(b) the answers stay on the device', { screen: opState, draft: await draftOf(r2.c, W) }, 'closed notice showing the saved answers; draft kept', opState === 'closed' && (await draftOf(r2.c, W)) === 'Queued in B3.3 b');
  await shot(r2.c, 'S3-b-new-closed');
  const card = await homeCard(r2.c);
  row(S, 'b33→new', '(b) Home shows B\'s request by key', card, `/check-in/${W}__${B}`, card === `/check-in/${W}__${B}`);
  row(S, 'b33→new', 'page errors', [...r1.c.errors, ...r2.c.errors], [], r1.c.errors.length + r2.c.errors.length === 0);
  await r2.c.ctx.close();
}

// ===========================================================================
// S4 — B3.3 queued op delivered by B3.3 ITSELF after a hand-over (no update yet).
// ===========================================================================
{
  const S = 'S4 B3.3 queued submission after a hand-over (old app delivers)';
  await reset();
  await request(A);
  const c = await clientPage(ORIGIN.b33);
  await home(c);
  await c.ctx.route('**/api/trpc/**checkIns.submit**', (r) => r.abort('internetdisconnected'));
  await c.page.goto(`${c.base}/check-in/${W}`);
  await c.page.getByTestId('checkin-flow').waitFor({ timeout: 15_000 }).catch(() => undefined);
  await fillAndSubmit(c, 'Queued before hand-over');
  await handOver();
  await c.ctx.unroute('**/api/trpc/**checkIns.submit**');
  await c.page.getByTestId('checkin-retry').click().catch(() => undefined);
  await settle(c.page, 4000);
  const ra = await rec(KEY_A);
  const state = await screenState(c);
  row(S, 'b33', 'retry after hand-over (before B asks) → refused, A\'s record untouched', { A: brief(ra), screen: state }, 'A requested, no notes; the old app shows it unsent (or the request gone)', ra?.status === 'requested' && !ra?.notes && (state === 'queued:failed_permanent' || state === 'not-found'));
  row(S, 'b33', 'answers kept on the device', await draftOf(c, W), 'Queued before hand-over', (await draftOf(c, W)) === 'Queued before hand-over');
  await shot(c, 'S4-b33-refused');
  row(S, 'b33', 'page errors', c.errors, [], c.errors.length === 0);
  await c.ctx.close();
}

// ===========================================================================
// S5 — an unsent draft in B3.3, then the app updates mid-check-in.
// ===========================================================================
async function draftThenUpdate(label, between) {
  await reset();
  await request(A);
  UPD.b33.ref.root = DIST.b33;
  const c = await clientPage(UPD.b33.port);
  await home(c);
  await c.page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => undefined);
  await c.page.goto(`${c.base}/check-in/${W}`);
  await c.page.getByTestId('checkin-flow').waitFor({ timeout: 15_000 }).catch(() => undefined);
  for (let i = 0; i < 3; i++) await c.page.getByTestId('checkin-next').click({ timeout: 10_000 }).catch(() => undefined);
  await c.page.getByTestId('checkin-notes').fill(`Draft ${label}`, { timeout: 10_000 }).catch(() => undefined);
  await settle(c.page, 600);
  const before = await draftOf(c, W);
  await between?.();
  UPD.b33.ref.root = DIST.new;
  const how = await applyUpdate(c);
  await settle(c.page, 2500);
  return { c, before, how, updated: how !== 'NOT UPDATED' };
}
{
  const S = 'S5 B3.3 draft, app updated mid-check-in';
  const r1 = await draftThenUpdate('a');
  const state = await screenState(r1.c);
  const onScreen = await r1.c.page.getByTestId('checkin-notes').inputValue().catch(() => null);
  row(S, 'b33→new', '(a) same coach: the new build resumes the draft', { before: r1.before, how: r1.how, screen: state, notes: onScreen, url: new URL(r1.c.page.url()).pathname }, 'wizard with the draft', r1.updated && state === 'wizard' && onScreen === 'Draft a');
  await shot(r1.c, 'S5-a-resumed');
  await r1.c.ctx.close();
  const r2 = await draftThenUpdate('b', async () => { await handOver(); await request(B); });
  const state2 = await openKey(r2.c, W);
  row(S, 'b33→new', '(b) hand-over meanwhile: A\'s request reads closed, the draft shown and kept', { screen: state2, draft: await draftOf(r2.c, W), how: r2.how }, 'closed + draft kept', state2 === 'closed' && (await draftOf(r2.c, W)) === 'Draft b');
  const [a2, b2] = await Promise.all([rec(KEY_A), rec(KEY_B)]);
  row(S, 'b33→new', '(b) nothing sent anywhere', { A: brief(a2), B: brief(b2) }, 'both requested', a2?.status === 'requested' && b2?.status === 'requested' && !a2?.notes && !b2?.notes);
  await shot(r2.c, 'S5-b-closed');
  row(S, 'b33→new', 'page errors', [...r2.c.errors], [], r2.c.errors.length === 0);
  await r2.c.ctx.close();
}

// ===========================================================================
// S6 — RC2 (the production build) updated mid-check-in.
// ===========================================================================
{
  const S = 'S6 RC2 mid-check-in, app updated';
  await reset();
  await request(A);
  UPD.rc2.ref.root = DIST.rc2;
  const c = await clientPage(UPD.rc2.port);
  await home(c);
  await c.page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => undefined);
  await c.page.goto(`${c.base}/check-in/${W}`);
  await settle(c.page, 2000);
  for (let i = 0; i < 3; i++) await c.page.getByTestId('checkin-next').click().catch(() => undefined);
  await c.page.getByTestId('checkin-notes').fill('RC2 typed').catch(() => undefined);
  UPD.rc2.ref.root = DIST.new;
  await c.page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await settle(c.page, 3000);
  // RC2 reloads into the update when the app goes to the background.
  await c.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await c.page.waitForFunction((entry) => [...document.scripts].some((s) => s.src.includes(entry)), NEW_ENTRY, { timeout: 30_000 }).catch(() => undefined);
  const updated = await c.page.evaluate((entry) => [...document.scripts].some((s) => s.src.includes(entry)), NEW_ENTRY);
  await settle(c.page, 2500);
  const state = await screenState(c);
  row(S, 'rc2→new', 'RC2 reloads into the new build on backgrounding; the check-in reopens', { updated, screen: state, url: new URL(c.page.url()).pathname }, 'new build, wizard for A\'s request', updated && state === 'wizard');
  row(S, 'rc2→new', 'RC2 in-memory answers', 'not carried (RC2 never saved check-in answers on the device — same as any RC2 update/reload)', 'pre-existing RC2 behaviour', true, 'pre-existing');
  const sub = await fillAndSubmit(c, 'After RC2 update');
  const ra = await waitFor(() => rec(KEY_A), (d) => d?.status === 'submitted');
  row(S, 'rc2→new', 'submit in the new build → A\'s record', { A: brief(ra), uiError: sub.error }, 'A submitted', ra?.status === 'submitted' && ra?.notes === 'After RC2 update');
  await shot(c, 'S6-rc2-updated');
  row(S, 'rc2→new', 'page errors', c.errors, [], c.errors.length === 0);
  await c.ctx.close();
}

// ===========================================================================
// S7 — no hand-over at all: every build behaves exactly as before.
// ===========================================================================
for (const build of ['rc2', 'b33', 'new']) {
  await reset();
  await request(A);
  const c = await clientPage(ORIGIN[build]);
  const S = 'S7 no hand-over (baseline)';
  const card = await homeCard(c);
  row(S, build, 'Home card opens /check-in/W', card, `/check-in/${W}`, card === `/check-in/${W}`);
  const sub = await fillAndSubmit(c, `Baseline ${build}`);
  const ra = await waitFor(() => rec(KEY_A), (d) => d?.status === 'submitted');
  row(S, build, 'submit → A\'s record', { A: brief(ra), uiError: sub.error }, 'submitted', ra?.status === 'submitted' && ra?.notes === `Baseline ${build}`);
  const n = await db('countDocuments', 'notifications', { filter: { clientId: X, forRole: 'coach', type: 'checkin_submitted' } });
  row(S, build, 'coach notified once', n, 1, n === 1);
  row(S, build, 'page errors', c.errors, [], c.errors.length === 0);
  await c.ctx.close();
}

const failed = matrix.filter((r) => !r.pass);
fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify({ builds: DIST, newEntry: NEW_ENTRY, rows: matrix, failed: failed.length }, null, 2));
console.log(`[compat] ${matrix.length - failed.length}/${matrix.length} checks passed`);
await browser.close();
for (const s of servers) s.close();
stack.kill();
process.exit(failed.length ? 1 : 0);
