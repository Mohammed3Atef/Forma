/**
 * B3.9 C0 — signed-in COACH offline startup on a LOCAL production build (no deploy).
 *
 * The coach app is one lazy chunk (CoachApp) and every screen is another (CoachToday,
 * CoachClients, CoachMessages, CoachLibrary, …). An installed coach app opened with the network
 * OFF must still start signed-in: the service worker precache serves every chunk, the session
 * falls back to the identity cached on the device. Modelled on b1-client-offline-boot.mjs.
 *
 *   1. serve <distDir> with the vercel.json cache headers; proxy /api to an isolated e2e3 stack
 *      (e2e3/env/server.mjs on <apiPort>/<stubPort>) — refuses to run unless that stack's
 *      manifest (e2e-out/current-env-<apiPort>.json) is loopback-only
 *   2. sign in as the seeded coach `e2e-coach-pro` (a real refresh token from the stack's control
 *      API, sent as the httpOnly `forma_rt` cookie — exactly what a login produces)
 *   3. wait for the SW to control the page; the coach Today screen renders online; the precache
 *      holds the coach chunks
 *   4. for each pass (phone 390×844 → tab bar; desktop 1280×900 → side rail):
 *      offline (context.setOffline + the local server "unplugged") → reload → the signed-in coach
 *      shell renders Today, no login screen, no error boundary, the lazy coach chunks come from
 *      the SW; then IN-APP navigation (tab/rail clicks, never page.goto) to Clients, Messages,
 *      Library and back to Today, recording per screen: error boundary (FAIL), login screen
 *      (FAIL), screen rendered, its chunk served by the SW, offline notice visible, and whether a
 *      skeleton is still on screen > 5 s after arriving (RECORDED, not failed — later slice).
 *   5. no JS chunk reached the network while offline (page responses, SW fetches, and the local
 *      server's own log all agree)
 *
 *   # start the isolated stack first (it never touches a shared or production system):
 *   E2E_PORT=5251 E2E_STUB_PORT=5351 E2E_RUN_DIR=e2e-out/<run>/stack node e2e3/env/server.mjs
 *   node e2e3/pwa/b39-coach-offline-boot.mjs <distDir> <apiPort> <stubPort> <outDir> [phone|desktop|both]
 *
 * Writes <outDir>/results.json + screenshots. Prints `[b39-coach-offline] …` lines and a final
 * `[b39-coach-offline] RESULT: PASS|FAIL`. Exit 0 = PASS, 1 = FAIL, 2 = refused / bad usage.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const TAG = '[b39-coach-offline]';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [distArg, apiPortArg, stubPortArg, outArg, passesArg = 'both'] = process.argv.slice(2);
const ROOT = path.resolve(distArg ?? 'dist');
const API_PORT = Number(apiPortArg ?? 5251);
const STUB_PORT = Number(stubPortArg ?? 5351);
const OUT = path.resolve(outArg ?? `e2e-out/b39-coach-offline-${Date.now()}`);
const COACH = 'e2e-coach-pro';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const PASSES = passesArg === 'both' ? ['phone', 'desktop'] : [passesArg];
const SKELETON_MS = 5_500; // "endless skeleton": still on screen this long after arriving

/** The screens visited offline, in order (in-app clicks), and what proves each one rendered. */
const TARGETS = [
  { key: 'clients', label: 'Clients', path: '/coach/clients', root: '[data-testid="coach-clients"]', chunk: 'CoachClients' },
  { key: 'messages', label: 'Messages', path: '/coach/messages', root: '[data-testid="coach-messages"], [data-testid="coach-desktop-messages"]', chunk: 'CoachMessages' },
  { key: 'library', label: 'Library', path: '/coach/library', root: '[data-testid="coach-library"]', chunk: 'CoachLibrary' },
  { key: 'today', label: 'Today (back)', path: '/coach/dashboard', root: '[data-testid="coach-today"]', chunk: 'CoachToday' },
];
const COACH_CHUNKS = ['CoachApp', 'CoachToday', 'CoachClients', 'CoachMessages', 'CoachLibrary'];
/** The app's own stale/failed lazy-chunk errors (src/lib/staleChunk.ts). */
const CHUNK_ERROR = /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

const log = [];
const failures = [];
const show = (v) => (typeof v === 'string' ? v : util.inspect(v, { depth: 5, breakLength: Infinity, maxArrayLength: 60 }));
const note = (k, v) => {
  log.push({ k, v });
  console.log(`${TAG} ${k}:`, show(v));
};
/** A hard assertion: recorded, and a FAIL makes the run fail. */
const check = (k, ok, detail) => {
  log.push({ k, v: detail ?? ok, pass: !!ok });
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'} ${k}${detail === undefined ? '' : `: ${show(detail)}`}`);
  if (!ok) failures.push(k);
  return !!ok;
};
function refuse(msg) {
  console.error(`${TAG} REFUSING TO RUN: ${msg}`);
  process.exit(2);
}

// ---- safety: only the isolated e2e3 stack on loopback -----------------------------------------
if (!PASSES.every((p) => p === 'phone' || p === 'desktop')) refuse(`unknown pass "${passesArg}" (phone | desktop | both)`);
if (!Number.isInteger(API_PORT) || !Number.isInteger(STUB_PORT)) refuse('usage: node e2e3/pwa/b39-coach-offline-boot.mjs <distDir> <apiPort> <stubPort> <outDir> [phone|desktop|both]');
if (!fs.existsSync(path.join(ROOT, 'index.html')) || !fs.existsSync(path.join(ROOT, 'sw.js'))) refuse(`${ROOT} is not a production PWA build (index.html + sw.js) — run \`npx vite build\``);
const envFile = [path.join(process.cwd(), 'e2e-out', `current-env-${API_PORT}.json`), path.join(REPO, 'e2e-out', `current-env-${API_PORT}.json`)].find((f) => fs.existsSync(f));
if (!envFile) refuse(`no isolated-stack manifest e2e-out/current-env-${API_PORT}.json — start e2e3/env/server.mjs with E2E_PORT=${API_PORT} E2E_STUB_PORT=${STUB_PORT} first`);
const ENV = JSON.parse(fs.readFileSync(envFile, 'utf8'));
const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:\d+(\/|$)/;
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(ENV.mongoUri ?? '')) refuse('env file does not point at the isolated e2e3 database (loopback only).');
if (!LOOPBACK_URL.test(ENV.baseURL ?? '') || new URL(ENV.baseURL).port !== String(API_PORT)) refuse(`env baseURL ${ENV.baseURL} is not http://127.0.0.1:${API_PORT} (loopback only).`);
if (!LOOPBACK_URL.test(ENV.bunny?.cdn ?? '') || new URL(ENV.bunny.cdn).port !== String(STUB_PORT)) refuse(`env Bunny stand-in ${ENV.bunny?.cdn} is not the loopback stub on ${STUB_PORT}.`);
if (ENV.accounts?.coachPro?.id !== COACH) refuse(`env manifest does not list the seeded e2e coach ${COACH}.`);
const CONTROL = `http://127.0.0.1:${STUB_PORT}/__e2e`;
async function control(route, body) {
  const r = await fetch(`${CONTROL}/${route}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const j = await r.json();
  if (!r.ok) throw new Error(`control ${route}: ${j.error ?? r.status}`);
  return j;
}
const seeded = await control('db', { op: 'findOne', collection: 'users', filter: { _id: COACH } }).catch((e) => refuse(`the control API on ${STUB_PORT} did not answer (${e.message}).`));
if (seeded?.out?.role !== 'coach') refuse(`the stack on ${STUB_PORT} has no seeded coach ${COACH}.`);

fs.mkdirSync(OUT, { recursive: true });
const watchdog = setTimeout(() => {
  console.log(`${TAG} RESULT: FAIL (watchdog: the run exceeded 10 minutes)`);
  process.exit(1);
}, 10 * 60_000);
watchdog.unref();

// Warm the dev API once (its first tRPC request compiles the router).
for (let i = 0; i < 60; i++) {
  const ok = await fetch(`http://127.0.0.1:${API_PORT}/api/trpc/health.ping`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.status < 500).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}

// ---- the production build, served like Vercel; /api → the isolated stack -----------------------
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.txt': 'text/plain' };
/** The "network cable": while unplugged the server answers nothing — and records who tried. */
let unplugged = false;
let phase = 'online';
const serverHitsOffline = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (unplugged) {
    serverHitsOffline.push({ phase, method: req.method, path: u.pathname });
    req.socket.destroy();
    return;
  }
  if (u.pathname.startsWith('/api/')) {
    const p = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    p.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(p);
    return;
  }
  // Vercel serves its analytics script in production; locally it would fall back to index.html (a page error).
  if (u.pathname.startsWith('/_vercel/')) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.end('');
  }
  let file;
  try {
    file = path.join(ROOT, decodeURIComponent(u.pathname));
  } catch {
    file = '';
  }
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Same policy as vercel.json: immutable hashed assets, no-cache manifest, everything else (sw.js, workbox, index.html) never cached.
  res.setHeader(
    'Cache-Control',
    u.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : u.pathname === '/manifest.webmanifest' ? 'no-cache' : 'no-cache, no-store, must-revalidate',
  );
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const base = `http://127.0.0.1:${PORT}`;

const entry = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src="\/assets\/(index-[^"]+\.js)"/) ?? [])[1] ?? null;
const chunkName = (file) => (file.match(/^(.*)-[A-Za-z0-9_-]{8}\.js$/) ?? [])[1] ?? file;
const buildChunks = fs.readdirSync(path.join(ROOT, 'assets')).filter((n) => n.endsWith('.js') && COACH_CHUNKS.includes(chunkName(n)));
note('isolated stack', { api: ENV.baseURL, db: 'in-memory (loopback)', bunny: ENV.bunny.mode, coach: COACH, manifest: path.relative(REPO, envFile) });
note('build', { dist: ROOT, entry, coachChunks: buildChunks, servedAt: base, passes: PASSES });
check('build has every lazy coach chunk this run follows', COACH_CHUNKS.every((n) => buildChunks.some((f) => chunkName(f) === n)), buildChunks);

// ---- browser ------------------------------------------------------------------------------------
let browser;
let exitCode = 1;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: PASSES[0] === 'desktop' ? DESKTOP : PHONE });
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const externalHosts = new Set();
  let docLoads = 0;
  let cur = null; // the offline pass being recorded

  const isAssetJs = (u) => u.host === `127.0.0.1:${PORT}` && u.pathname.startsWith('/assets/') && u.pathname.endsWith('.js');
  const safeUrl = (s) => {
    try {
      return new URL(s);
    } catch {
      return null;
    }
  };
  page.on('domcontentloaded', () => (docLoads += 1));
  page.on('pageerror', (e) => pageErrors.push({ phase, text: String(e).slice(0, 300) }));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ phase, text: m.text().slice(0, 300) });
  });
  page.on('response', (r) => {
    const u = safeUrl(r.url());
    if (!cur || !u || !isAssetJs(u)) return;
    const name = path.posix.basename(u.pathname);
    if (r.fromServiceWorker()) cur.jsFromSw.add(name);
    else cur.jsFromNetwork.push(`${name} (${r.status()})`);
  });
  page.on('requestfailed', (r) => {
    const u = safeUrl(r.url());
    if (cur && u && isAssetJs(u)) cur.jsFailed.push(`${path.posix.basename(u.pathname)} (${r.failure()?.errorText ?? '?'})`);
  });
  ctx.on('request', (r) => {
    const u = safeUrl(r.url());
    if (!u) return;
    if (/^https?:$/.test(u.protocol) && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') externalHosts.add(u.hostname);
    // A fetch the SERVICE WORKER itself sent to the network (a precache miss) while offline.
    if (cur && typeof r.serviceWorker === 'function' && r.serviceWorker() && isAssetJs(u)) cur.swNetworkJs.push(path.posix.basename(u.pathname));
  });

  /** Everything the checks read from the page, in one round trip. */
  const probe = () =>
    page
      .evaluate(() => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const main = document.querySelector('main') ?? document.body;
        const text = document.body?.innerText ?? '';
        return {
          path: location.pathname + location.search,
          doc: window.__b39doc ?? null,
          // The top-level ErrorBoundary (src/components/ErrorBoundary.tsx) — its second line is unique to it.
          boundary: text.includes('Reloading usually fixes this') || !!document.querySelector('[data-testid="error-boundary"]'),
          login: !!document.querySelector('[data-testid="login-email"]'),
          shell: !!document.querySelector('[data-testid="app-shell"]'),
          tabBar: !!document.querySelector('[data-testid="bottom-nav"] [data-testid="nav-clients"]'),
          rail: (() => {
            const r = document.querySelector('[data-testid="coach-rail"]');
            return !!r && vis(r);
          })(),
          skeletons: [...main.querySelectorAll('.sk')].filter(vis).length,
          banner: !!document.querySelector('[data-testid="offline-banner"]'),
          notices: [...document.querySelectorAll('[data-testid]')]
            .filter((el) => el.dataset.testid !== 'offline-banner' && /offline|stale/i.test(el.dataset.testid) && vis(el))
            .map((el) => el.dataset.testid),
          statusOffline: [...main.querySelectorAll('[role="status"]')].some((el) => vis(el) && /offline/i.test(el.textContent ?? '')),
          errorStates: [...main.querySelectorAll('[role="alert"][data-testid]')].filter(vis).map((el) => el.dataset.testid),
          todayState: document.querySelector('[data-testid="coach-today"]')?.getAttribute('data-state') ?? null,
          syncState: document.querySelector('[data-testid="sync-status"]')?.getAttribute('data-sync-state') ?? null,
        };
      })
      .catch((e) => ({ error: String(e).slice(0, 200) }));

  /**
   * Sample the screen until `ms` after `t0`: error boundary / login at any moment, the document
   * replaced (a reload = a lazy chunk failed), and whether a skeleton is still there at the end.
   */
  async function watch(t0, ms, docId) {
    const seen = { boundary: false, login: false, docChanged: false, skeletonSeen: false, clearedAt: null, notices: new Set(), statusOffline: false, errorStates: new Set() };
    let last = await probe();
    for (;;) {
      if (last.error) seen.docChanged = true;
      if (last.boundary) seen.boundary = true;
      if (last.login) seen.login = true;
      if (docId && last.doc !== docId) seen.docChanged = true;
      if (last.skeletons > 0) {
        seen.skeletonSeen = true;
        seen.clearedAt = null;
      } else if (seen.skeletonSeen && seen.clearedAt == null) seen.clearedAt = Date.now() - t0;
      (last.notices ?? []).forEach((n) => seen.notices.add(n));
      (last.errorStates ?? []).forEach((n) => seen.errorStates.add(n));
      if (last.statusOffline) seen.statusOffline = true;
      if (Date.now() - t0 >= ms) break;
      await page.waitForTimeout(250);
      last = await probe();
    }
    const skeleton = last.skeletons > 0 ? `persists > ${Math.round(ms / 1000)} s (${last.skeletons} blocks)` : seen.skeletonSeen ? `cleared after ${seen.clearedAt ?? '?'} ms` : 'none';
    return {
      last,
      boundary: seen.boundary,
      login: seen.login,
      sameDocument: !seen.docChanged,
      skeleton,
      endlessSkeleton: last.skeletons > 0,
      offlineNotice: { banner: !!last.banner, screen: [...seen.notices], statusTextOffline: seen.statusOffline },
      errorStates: [...seen.errorStates],
    };
  }

  // ---- 1. online: sign in, SW, Today ------------------------------------------------------------
  const { raw } = await control('session', { userId: COACH });
  await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
  await page.goto(`${base}/coach/dashboard`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => undefined);
  if (!(await page.evaluate(() => !!navigator.serviceWorker?.controller))) await page.reload();
  const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  check('1. SW controls the page', controlled);
  const onlineToday = await page.getByTestId('coach-today').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  await page.waitForFunction(() => document.querySelector('[data-testid="coach-today"]')?.getAttribute('data-state') !== 'loading', null, { timeout: 20_000 }).catch(() => undefined);
  const online = await probe();
  check('2. online: signed-in coach Today renders (coach-today, coach shell, no login)', onlineToday && online.shell && (online.tabBar || online.rail) && !online.login && !online.boundary, {
    path: online.path,
    todayState: online.todayState,
    shell: online.shell,
    nav: online.tabBar ? 'tab bar' : online.rail ? 'rail' : 'MISSING',
  });
  await page.screenshot({ path: path.join(OUT, '1-online-today.png') });
  const precached = await page
    .evaluate(async (names) => {
      const out = {};
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const req of await cache.keys()) {
          const m = new URL(req.url).pathname.match(/^\/assets\/(.*)-[A-Za-z0-9_-]{8}\.js$/);
          if (m && names.includes(m[1])) out[m[1]] = key;
        }
      }
      return out;
    }, COACH_CHUNKS)
    .catch((e) => ({ error: String(e) }));
  check('2. the SW precache holds every lazy coach chunk', COACH_CHUNKS.every((n) => precached[n]), precached);

  // ---- 2. offline passes -------------------------------------------------------------------------
  const passes = {};
  let shotNo = 2;
  for (const kind of PASSES) {
    const nav = kind === 'phone' ? { container: 'bottom-nav', prefix: 'nav-' } : { container: 'coach-rail', prefix: 'rail-' };
    await page.setViewportSize(kind === 'phone' ? PHONE : DESKTOP);
    cur = { kind, jsFromSw: new Set(), jsFromNetwork: [], jsFailed: [], swNetworkJs: [] };
    phase = `offline-${kind}`;
    unplugged = true;
    await ctx.setOffline(true);
    const loadsBefore = docLoads;
    const t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => note(`${kind}: offline reload error`, String(e).split('\n')[0]));
    const docId = Math.random().toString(36).slice(2);
    await page.evaluate((id) => (window.__b39doc = id), docId).catch(() => undefined);
    const booted = await page.getByTestId('coach-today').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
    const bootMs = Date.now() - t0;
    const boot = await watch(t0, SKELETON_MS, docId);
    const navVisible = await page.getByTestId(nav.container).isVisible().catch(() => false);
    const L = boot.last;
    await page.screenshot({ path: path.join(OUT, `${shotNo++}-offline-${kind}-relaunch-today.png`) });
    // The coach's own navigation (the tab bar's Clients tab on phones, the coach rail on desktop) — not just any shell.
    const coachNav = navVisible && (kind === 'phone' ? L.tabBar : L.rail);
    check(`3. ${kind}: OFFLINE relaunch renders the signed-in coach shell on Today`, booted && L.shell && coachNav && !boot.login && (L.path ?? '').startsWith('/coach'), {
      path: L.path,
      renderedInMs: booted ? bootMs : null,
      todayState: L.todayState,
      nav: coachNav ? nav.container : 'MISSING',
    });
    check(`3. ${kind}: no login screen`, !boot.login);
    check(`3. ${kind}: no error boundary`, !boot.boundary);
    check(`3. ${kind}: one document (no reload after the relaunch)`, docLoads - loadsBefore <= 1 && boot.sameDocument, { documentLoads: docLoads - loadsBefore });
    const bootChunks = ['CoachApp', 'CoachToday'].map((n) => [...cur.jsFromSw].find((f) => chunkName(f) === n) ?? null);
    check(`3. ${kind}: lazy CoachApp + CoachToday chunks served by the SW`, bootChunks.every(Boolean), bootChunks);
    const screens = [
      {
        screen: 'Today (relaunch)',
        rendered: booted,
        errorBoundary: boot.boundary,
        loginScreen: boot.login,
        offlineNotice: boot.offlineNotice,
        skeleton: boot.skeleton,
        endlessSkeleton: boot.endlessSkeleton,
        errorStates: boot.errorStates,
        todayState: L.todayState,
      },
    ];
    note(`3. ${kind}: Today offline`, screens[0]);

    for (const tg of TARGETS) {
      const link = page.getByTestId(nav.container).getByTestId(`${nav.prefix}${tg.key}`);
      const t1 = Date.now();
      const clicked = await link.click({ timeout: 10_000 }).then(() => true).catch((e) => (note(`${kind}: ${tg.label} link click failed`, String(e).split('\n')[0]), false));
      const routed = clicked && (await page.waitForFunction((p) => location.pathname.startsWith(p), tg.path, { timeout: 10_000 }).then(() => true).catch(() => false));
      const rendered = routed && (await page.locator(tg.root).first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false));
      const renderMs = rendered ? Date.now() - t1 : null;
      const w = await watch(t1, SKELETON_MS, docId);
      await page.screenshot({ path: path.join(OUT, `${shotNo++}-offline-${kind}-${tg.key}.png`) });
      const chunk = [...cur.jsFromSw].find((f) => chunkName(f) === tg.chunk) ?? null;
      const row = {
        screen: tg.label,
        via: `${nav.container} › ${nav.prefix}${tg.key}`,
        path: w.last.path,
        rendered,
        renderMs,
        errorBoundary: w.boundary,
        loginScreen: w.login,
        sameDocument: w.sameDocument && docLoads - loadsBefore <= 1,
        chunkFromSw: chunk,
        offlineNotice: w.offlineNotice,
        skeleton: w.skeleton,
        endlessSkeleton: w.endlessSkeleton,
        errorStates: w.errorStates,
      };
      screens.push(row);
      note(`4. ${kind}: offline → ${tg.label}`, row);
      check(`4. ${kind}: ${tg.label} reached by an in-app click and rendered`, clicked && routed && rendered, { clicked, routed, rendered, path: w.last.path });
      check(`4. ${kind}: ${tg.label} — no error boundary`, !w.boundary);
      check(`4. ${kind}: ${tg.label} — no login screen`, !w.login);
      check(`4. ${kind}: ${tg.label} — same document (no chunk-failure reload)`, row.sameDocument);
      check(`4. ${kind}: ${tg.label} — its lazy chunk (${tg.chunk}) served by the SW`, !!chunk, chunk);
    }

    check(`5. ${kind}: no JS chunk from the network while offline (page responses, failures, SW fetches)`, cur.jsFromNetwork.length === 0 && cur.jsFailed.length === 0 && cur.swNetworkJs.length === 0, {
      fromNetwork: cur.jsFromNetwork,
      failed: cur.jsFailed,
      swNetworkFetches: cur.swNetworkJs,
    });
    note(`5. ${kind}: JS chunks served by the SW while offline`, { count: cur.jsFromSw.size, coach: [...cur.jsFromSw].filter((f) => /^Coach|^coach|^Today|^Workspace/.test(f)).sort() });
    passes[kind] = { screens, jsFromSw: [...cur.jsFromSw].sort(), jsFromNetwork: cur.jsFromNetwork, jsFailed: cur.jsFailed, swNetworkJs: cur.swNetworkJs };
  }
  cur = null;

  // ---- 3. evidence that nothing reached the network -----------------------------------------------
  const assetHits = serverHitsOffline.filter((h) => h.path.startsWith('/assets/') && h.path.endsWith('.js'));
  check('6. the local server received no JS chunk request while offline', assetHits.length === 0, assetHits);
  note('6. other requests that reached the (unplugged) server while offline (info)', serverHitsOffline.filter((h) => !assetHits.includes(h)));
  const offlineChunkErrors = [...pageErrors, ...consoleErrors].filter((e) => e.phase !== 'online' && CHUNK_ERROR.test(e.text));
  check('6. no lazy-chunk load error while offline (console / page errors)', offlineChunkErrors.length === 0, offlineChunkErrors);
  note('page errors', pageErrors);
  note('console errors (first 15)', consoleErrors.slice(0, 15));
  note('third-party hosts the page contacted (info; the app API is only the loopback stack)', [...externalHosts].sort());

  // Summary of the per-screen offline experience (recorded for the later product slice).
  const summary = Object.fromEntries(
    Object.entries(passes).map(([k, v]) => [
      k,
      v.screens.map((s) => `${s.screen}: ${s.rendered ? 'rendered' : 'NOT RENDERED'}${s.errorBoundary ? ' · ERROR BOUNDARY' : ''}${s.loginScreen ? ' · LOGIN' : ''} · notice ${s.offlineNotice.screen.length || s.offlineNotice.statusTextOffline ? `screen(${s.offlineNotice.screen.join(',') || 'status text'})` : 'none on screen'}${s.offlineNotice.banner ? ' + banner' : ''} · skeleton ${s.skeleton}`),
    ]),
  );
  note('summary', summary);

  const pass = failures.length === 0;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ result: pass ? 'PASS' : 'FAIL', failures, build: { dist: ROOT, entry, coachChunks: buildChunks }, stack: { api: ENV.baseURL, manifest: envFile }, passes, serverHitsOffline, pageErrors, consoleErrors, externalHosts: [...externalHosts].sort(), log }, null, 2));
  if (!pass) note('failed checks', failures);
  console.log(`${TAG} RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  exitCode = pass ? 0 : 1;
} catch (e) {
  console.log(`${TAG} error: ${String(e?.stack ?? e).split('\n').slice(0, 4).join(' | ')}`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ result: 'FAIL', error: String(e?.stack ?? e), failures, log, serverHitsOffline }, null, 2));
  console.log(`${TAG} RESULT: FAIL`);
  exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  server.close();
}
process.exit(exitCode);
