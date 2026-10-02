/**
 * PWA behaviour check against a LOCAL production build (no deployment needed):
 *   1. build A served with the same cache headers vercel.json sets
 *   2. SW installs and controls the page
 *   3. offline → reload still renders (precache) and the offline banner shows
 *   4. "new deploy": build B (index.html + sw precache revision changed) is
 *      swapped in → update detected → reload is DEFERRED while visible, then
 *      happens once the tab is hidden (main.tsx onNeedRefresh contract)
 *
 *   node e2e3/pwa/pwa-check.mjs <outDir>
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

const OUT = path.resolve(process.argv[2] ?? `e2e-out/pwa-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });
const A = path.resolve('dist');
const B = path.join(OUT, 'dist-b');
let root = A;
const PORT = 5410;
const log = [];
const note = (k, v) => {
  log.push({ k, v });
  console.log(`[pwa] ${k}:`, v);
};

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file = path.join(root, decodeURIComponent(u.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const ext = path.extname(file);
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  // Same policy as vercel.json
  res.setHeader('Cache-Control', u.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const url = `http://127.0.0.1:${PORT}/login`;
await page.goto(url);
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => undefined);
let controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
if (!controlled) {
  await page.reload();
  controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
}
note('1. SW controls page after install', controlled);
await page.screenshot({ path: path.join(OUT, '1-online.png') });

// 2. Offline reload
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch((e) => note('offline reload error', String(e)));
await page.waitForTimeout(1500);
const offlineRendered = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0);
const offlineBanner = await page.getByText(/offline/i).first().isVisible().catch(() => false);
note('2. offline reload renders from precache (root children)', offlineRendered);
note('2. offline banner visible', offlineBanner);
await page.screenshot({ path: path.join(OUT, '2-offline.png') });
await ctx.setOffline(false);
await page.waitForTimeout(1000);
const bannerAfter = await page.getByText(/offline/i).first().isVisible().catch(() => false);
note('2. banner cleared after reconnect', !bannerAfter);

// 3. New deploy: B = A with a changed index.html and a bumped precache revision for it
fs.rmSync(B, { recursive: true, force: true });
fs.cpSync(A, B, { recursive: true });
fs.writeFileSync(path.join(B, 'index.html'), fs.readFileSync(path.join(B, 'index.html'), 'utf8').replace('</head>', '<meta name="e2e-build" content="B"></head>'));
const sw = fs.readFileSync(path.join(B, 'sw.js'), 'utf8');
const sw2 = sw.replace(/(\{url:"index\.html",revision:")([0-9a-f]+)(")/, (_m, a, _r, c) => `${a}e2ebuildb${Date.now().toString(16)}${c}`);
note('3. build B sw.js differs', sw2 !== sw);
fs.writeFileSync(path.join(B, 'sw.js'), sw2);
root = B;

let navigations = 0;
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) navigations += 1;
});
// Trigger the app's own update check (it listens to visibilitychange → visible; also polls every 60 s)
await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.update();
});
await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30_000 }).catch(() => undefined);
const waiting = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
note('3. new SW waiting (update detected)', waiting);
await page.waitForTimeout(3000);
note('3. reload deferred while visible (navigations while visible)', navigations);

// Hide the tab: open another page in front (headless Chromium reports the background page as hidden)
const other = await ctx.newPage();
await other.goto('about:blank');
await other.bringToFront();
const hidden = await page.evaluate(() => document.visibilityState);
note('3. original tab visibilityState after switching', hidden);
if (hidden !== 'hidden') {
  // Fallback: emulate the browser firing visibilitychange→hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  note('3. visibility emulated', true);
}
await page.waitForTimeout(5000);
const marker = await page.evaluate(() => document.querySelector('meta[name="e2e-build"]')?.getAttribute('content') ?? null).catch(() => 'navigating');
note('3. reloads into build B once hidden (meta e2e-build)', marker);
note('3. navigations after hide', navigations);
note('page errors', errors);
await page.screenshot({ path: path.join(OUT, '3-after-update.png') }).catch(() => undefined);

fs.writeFileSync(path.join(OUT, 'pwa-results.json'), JSON.stringify(log, null, 2));
await browser.close();
server.close();
