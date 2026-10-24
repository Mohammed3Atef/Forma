/**
 * B2 visual QA — full-page screenshots of client screens on an isolated e2e3
 * stack (seed first with seed-client.mjs). Signs in as clientA with a real
 * refresh token from the stack's control API.
 *
 *   node e2e3/visual/shots.mjs <port> <stubPort> <outDir> [widths=390,1440] [langs=en,ar] [routes=name:/path,...]
 *
 * Language is synced per account, so the script sets the server copy of the
 * client's settings locale for each language and restores English at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const [port = '5260', stubPort = '5360', outArg = 'e2e-out/b2-visual', widthsArg = '390,1440', langsArg = 'en,ar', routesArg] = process.argv.slice(2);
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const widths = widthsArg.split(',').map(Number);
const langs = langsArg.split(',');
const DEFAULT_ROUTES = 'today:/,train:/workout,day:/workout/routine/upper-a,nutrition:/nutrition,progress:/progress,coach:/messages,updates:/coach-notes,checkins:/check-ins,you:/settings';
const routes = (routesArg ?? DEFAULT_ROUTES).split(',').map((r) => {
  const i = r.indexOf(':');
  return { name: r.slice(0, i), path: r.slice(i + 1) };
});

const env = JSON.parse(fs.readFileSync(path.join('e2e-out', `current-env-${port}.json`), 'utf8'));
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(env.mongoUri)) throw new Error('Refusing to run: env file does not point at the isolated e2e3 database (loopback only).');
const mongo = await MongoClient.connect(env.mongoUri);
const db = mongo.db(env.dbName);
const C = 'e2e-client-a';

async function setLocale(locale) {
  for (const name of ['settings', 'profile']) {
    await db.collection('syncSingletons').updateOne({ _id: `${C}__${name}` }, { $set: { 'data.locale': locale, updatedAt: Date.now() + 1, 'data.updatedAt': Date.now() + 1 } });
  }
}

const browser = await chromium.launch();
const base = `http://127.0.0.1:${port}`;
const results = [];
for (const lang of langs) {
  await setLocale(lang);
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, timezoneId: 'Africa/Cairo', deviceScaleFactor: 1, hasTouch: width < 768 });
    const { raw } = await fetch(`http://127.0.0.1:${stubPort}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: C }) }).then((r) => r.json());
    await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
    await ctx.addInitScript((l) => { try { localStorage.setItem('forma.locale', l); } catch { /* about:blank has no storage */ } }, lang);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const r of routes) {
      // One retry: a long matrix can outlive a laptop sleep / a dev-server hiccup (ERR_NETWORK_IO_SUSPENDED).
      await page.goto(base + r.path, { waitUntil: 'domcontentloaded' }).catch(async () => {
        await page.waitForTimeout(3000);
        await page.goto(base + r.path, { waitUntil: 'domcontentloaded' });
      });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(900);
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      const file = path.join(OUT, `${lang}-${width}-${r.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      results.push({ lang, width, route: r.path, file: path.basename(file), overflow, dir: await page.evaluate(() => document.documentElement.dir) });
      fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(results, null, 2)); // incremental: a crash keeps what was measured
    }
    if (errors.length) results.push({ lang, width, pageErrors: errors });
    await ctx.close();
  }
}
await setLocale('en');
await browser.close();
await mongo.close();
fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(results, null, 2));
for (const r of results) console.log(JSON.stringify(r));
