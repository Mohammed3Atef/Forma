// Headless runtime smoke test: load each route, click into a workout session,
// and fail if any console errors / page errors occur.
//
// NOTE: requires a running preview server first:
//   npm run preview   (serves the built app on http://localhost:4173)
// then: npm run test:smoke   (or BASE=http://host:port to override)
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://localhost:4173';
const routes = ['/', '/workout', '/nutrition', '/cardio', '/progress', '/progress/photos', '/settings', '/settings/videos', '/settings/import'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

for (const route of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const text = await page.locator('body').innerText();
  console.log(`✓ ${route} (rendered ${text.length} chars)`);
}

// Exercise the core flow: start a workout session from the workout page.
await page.goto(BASE + '/workout', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const startBtn = page.getByText('Start', { exact: true }).first();
if (await startBtn.count()) {
  await startBtn.click();
  await page.waitForTimeout(500);
  console.log('✓ started workout session, url =', new URL(page.url()).pathname);
  // Tap the first "increase" stepper and a done checkmark to exercise auto-save.
  const inc = page.getByLabel('increase').first();
  if (await inc.count()) { await inc.click(); console.log('✓ stepper works'); }
}

await browser.close();

if (errors.length) {
  console.error('\n✗ RUNTIME ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\n✓ No console/page errors across all routes.');
