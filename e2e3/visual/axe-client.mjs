/**
 * B2 accessibility sweep — axe (WCAG 2.0/2.1 A + AA) over every client screen
 * on an isolated e2e3 stack (seed first with seed-client.mjs), in English and
 * Arabic, at a phone and a desktop width. Prints one line per screen and
 * writes axe.json with every violation (rule, impact, node count, samples).
 *
 *   node e2e3/visual/axe-client.mjs <port> <stubPort> <outDir> [widths=390,1440] [langs=en,ar]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MongoClient } from 'mongodb';

const [port = '5260', stubPort = '5360', outArg = 'e2e-out/b2-visual/axe', widthsArg = '390,1440', langsArg = 'en,ar'] = process.argv.slice(2);
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const widths = widthsArg.split(',').map(Number);
const langs = langsArg.split(',');
const ROUTES = [
  ['today', '/'],
  ['train', '/workout'],
  ['day', '/workout/routine/upper-a'],
  ['exercise', '/workout/exercise/bench'],
  ['cardio', '/cardio'],
  ['history', '/history'],
  ['nutrition', '/nutrition'],
  ['progress-body', '/progress'],
  ['progress-strength', '/progress?tab=strength'],
  ['progress-consistency', '/progress?tab=consistency'],
  ['measurements', '/progress/measurements'],
  ['chat', '/messages'],
  ['updates', '/coach-notes'],
  ['checkins', '/check-ins'],
  ['assessment', '/assessment'],
  ['you-profile', '/settings'],
  ['you-preferences', '/settings?tab=preferences'],
  ['you-account', '/settings?tab=account'],
  ['subscription', '/settings/subscription'],
];

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
    const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, timezoneId: 'Africa/Cairo', hasTouch: width < 768 });
    const { raw } = await fetch(`http://127.0.0.1:${stubPort}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: C }) }).then((r) => r.json());
    await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
    await ctx.addInitScript((l) => { try { localStorage.setItem('forma.locale', l); } catch { /* about:blank has no storage */ } }, lang);
    const page = await ctx.newPage();
    for (const [name, route] of ROUTES) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(800);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const byImpact = {};
      const rules = r.violations.map((v) => {
        byImpact[v.impact ?? 'none'] = (byImpact[v.impact ?? 'none'] ?? 0) + v.nodes.length;
        return { id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) };
      });
      const row = { lang, width, name, route, byImpact, rules };
      results.push(row);
      console.log(`${lang} ${width} ${name}: ${JSON.stringify(byImpact)} ${rules.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(' ')}`);
    }
    await ctx.close();
  }
}
await setLocale('en');
await browser.close();
await mongo.close();
fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(results, null, 2));
