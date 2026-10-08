/**
 * B1 — signed-in CLIENT offline boot on a LOCAL production build (no deploy).
 *
 * Since B1.13 (AR-02) the client runtime (tracker stores, reminders, sync) and
 * the outbox are separate lazily-loaded chunks. This proves an installed app
 * still opens signed-in with the network OFF: the service worker precache must
 * serve those chunks, and the per-user IndexedDB must hold the account.
 *
 *   1. serve <dist> with the vercel.json cache headers; proxy /api to an
 *      isolated e2e3 stack (e2e3/env/server.mjs on <apiPort>/<stubPort>)
 *   2. sign in as the seeded client (real refresh token via the stack's control API)
 *   3. wait for the SW to control the page; the client home renders
 *   4. offline → reload → the client home renders again, no login screen,
 *      and the lazy runtime chunks came from the SW cache
 *
 *   node e2e3/pwa/b1-client-offline-boot.mjs <distDir> <apiPort> <stubPort> <outDir>
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [distArg, apiPortArg, stubPortArg, outArg] = process.argv.slice(2);
const ROOT = path.resolve(distArg ?? 'dist');
const API_PORT = Number(apiPortArg ?? 5251);
const STUB_PORT = Number(stubPortArg ?? 5351);
const OUT = path.resolve(outArg ?? `e2e-out/b1-offline-boot-${Date.now()}`);
const PORT = 5261;
fs.mkdirSync(OUT, { recursive: true });

const log = [];
const note = (k, v) => {
  log.push({ k, v });
  console.log(`[b1-offline] ${k}:`, v);
};

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
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
  let file = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', u.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const lazyChunks = fs.readdirSync(path.join(ROOT, 'assets')).filter((n) => /^(clientRuntime|runtime)-.*\.js$/.test(n));
note('lazy runtime chunks in build', lazyChunks);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const session = await fetch(`http://127.0.0.1:${STUB_PORT}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: 'e2e-client-a' }) }).then((r) => r.json());
await ctx.addCookies([{ name: 'forma_rt', value: session.raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);

const base = `http://127.0.0.1:${PORT}`;
await page.goto(`${base}/`);
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => undefined);
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
note('1. SW controls the page', await page.evaluate(() => !!navigator.serviceWorker.controller));
const onlineHome = await page.getByTestId('client-home').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
note('2. signed-in client home renders online', onlineHome);
await page.screenshot({ path: path.join(OUT, '1-online.png') });

// Offline relaunch.
await ctx.setOffline(true);
const fromNetwork = [];
page.on('response', (r) => {
  if (/\/assets\/(clientRuntime|runtime)-/.test(r.url()) && !r.fromServiceWorker()) fromNetwork.push(r.url());
});
const runtimeFromSw = [];
page.on('response', (r) => {
  if (/\/assets\/(clientRuntime|runtime)-/.test(r.url()) && r.fromServiceWorker()) runtimeFromSw.push(path.basename(new URL(r.url()).pathname));
});
await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => note('offline reload error', String(e)));
const offlineHome = await page.getByTestId('client-home').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
note('3. OFFLINE relaunch: signed-in client home renders', offlineHome);
note('3. OFFLINE relaunch: login screen absent', (await page.getByTestId('login-email').count()) === 0);
note('3. lazy runtime chunks served by the SW', runtimeFromSw);
note('3. lazy runtime chunks fetched from network while offline (must be empty)', fromNetwork);
await page.screenshot({ path: path.join(OUT, '2-offline-relaunch.png') });

// Data is there: open Workout from the bottom nav offline (a lazy route chunk from precache).
await page.getByTestId('bottom-nav').getByRole('link').nth(1).click().catch(() => undefined);
await page.waitForTimeout(1500);
note('4. offline navigation to a lazy screen (no error boundary)', (await page.getByText('Something went wrong.').count()) === 0);
await page.screenshot({ path: path.join(OUT, '3-offline-nav.png') });

note('page errors', errors);
const pass = log.find((l) => l.k.startsWith('3. OFFLINE relaunch: signed-in'))?.v === true && fromNetwork.length === 0 && onlineHome;
note('RESULT', pass ? 'PASS' : 'FAIL');
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(log, null, 2));
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
