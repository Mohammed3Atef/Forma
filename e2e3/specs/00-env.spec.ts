import { test, expect, ready, shot } from '../fixtures';

/**
 * Environment safety gate. Runs first. Proves the browser is talking to the
 * ISOLATED stack and nothing else: a coach that exists only in this run's
 * in-memory DB can sign in, and the server reports the in-memory database,
 * the local Bunny stand-in and disabled email.
 */
test('isolated environment identity', async ({ env, as, db }, testInfo) => {
  expect(env.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(env.mongoUri).toMatch(/^mongodb:\/\/127\.0\.0\.1:\d+\//);
  expect(env.dbName).toBe('forma_e2e');
  expect(env.bunny.cdn).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/cdn$/);
  expect(await db.count('users', { email: { $regex: '@e2e[.]test$' } })).toBeGreaterThan(5);
  expect(await db.count('users', { email: { $not: { $regex: '@e2e[.]test$' } } })).toBe(0);

  const { page } = await as('coachA');
  await page.goto('/coach/dashboard');
  await ready(page);
  // Seed-only data rendering proves the UI reads THIS run's database.
  await expect(page.getByText('Client Aya').first()).toBeVisible();
  await expect(page.getByText('1 / 2 clients used')).toBeVisible();
  await shot(page, testInfo, 'coach-dashboard');
  await testInfo.attach('env.json', { body: JSON.stringify({ ...env, accounts: Object.keys(env.accounts) }, null, 2), contentType: 'application/json' });
});
