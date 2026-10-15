/**
 * B2 visual QA — the live workout session (start → tick a set → rest timer →
 * options menu → finish sheet), then discards it so the seed stays clean.
 *   node e2e3/visual/session-shots.mjs <port> <stubPort> <outDir> [lang=en] [width=390]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';

const [port = '5260', stubPort = '5360', outArg = 'e2e-out/b2-visual/session', lang = 'en', widthArg = '390'] = process.argv.slice(2);
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });
const width = Number(widthArg);
const env = JSON.parse(fs.readFileSync(path.join('e2e-out', `current-env-${port}.json`), 'utf8'));
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(env.mongoUri)) throw new Error('Refusing to run: env file does not point at the isolated e2e3 database (loopback only).');
const mongo = await MongoClient.connect(env.mongoUri);
const db = mongo.db(env.dbName);
const C = 'e2e-client-a';
for (const name of ['settings', 'profile']) await db.collection('syncSingletons').updateOne({ _id: `${C}__${name}` }, { $set: { 'data.locale': lang, updatedAt: Date.now() + 1, 'data.updatedAt': Date.now() + 1 } });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, timezoneId: 'Africa/Cairo', hasTouch: width < 768 });
const { raw } = await fetch(`http://127.0.0.1:${stubPort}/__e2e/session`, { method: 'POST', body: JSON.stringify({ userId: C }) }).then((r) => r.json());
await ctx.addCookies([{ name: 'forma_rt', value: raw, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' }]);
await ctx.addInitScript((l) => localStorage.setItem('forma.locale', l), lang);
const page = await ctx.newPage();
const shot = async (name, full = false) => page.screenshot({ path: path.join(OUT, `${lang}-${width}-${name}.png`), fullPage: full });
const base = `http://127.0.0.1:${port}`;

await page.goto(`${base}/workout`);
await page.waitForLoadState('networkidle').catch(() => undefined);
await page.waitForTimeout(800);
await page.getByTestId('train-hero').getByRole('button').first().click();
await page.waitForURL(/\/workout\/session/);
await page.waitForTimeout(800);
await shot('session-start');
await shot('session-start-full', true);
const row = page.getByTestId('set-row').first();
await row.getByTestId('set-done-0').click();
await page.waitForTimeout(500);
await shot('session-rest');
await page.getByTestId('session-menu').click();
await page.waitForTimeout(400);
await shot('session-menu');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /finish/i }).last().click();
await page.waitForTimeout(400);
await shot('session-finish');
await page.keyboard.press('Escape');
await page.goto(`${base}/`);
await page.waitForTimeout(1200);
await shot('today-in-progress');
// clean up: discard the session
await page.goto(`${base}/workout/session`);
await page.waitForTimeout(800);
await page.getByTestId('session-menu').click();
await page.getByRole('menuitem').last().click();
await page.getByTestId('confirm-accept').click();
await page.waitForTimeout(800);
for (const name of ['settings', 'profile']) await db.collection('syncSingletons').updateOne({ _id: `${C}__${name}` }, { $set: { 'data.locale': 'en', updatedAt: Date.now() + 2, 'data.updatedAt': Date.now() + 2 } });
await browser.close();
await mongo.close();
console.log('ok', OUT);
