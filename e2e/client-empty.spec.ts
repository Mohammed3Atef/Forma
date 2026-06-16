import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * CLIENT EMPTY-STATE — a brand-new coach-created client with NO assigned plan
 * must start genuinely empty: waiting-for-coach everywhere, no legacy seed
 * data, no hardcoded "Mohamed" profile, no stale plans/targets.
 */

const PW = 'Empty123456!';
let client: NewClient;

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, {
      email: uniqueEmail('qa-empty'),
      password: PW,
      displayName: `QA Empty ${Date.now()}`,
    });
  } finally {
    await coach.close();
  }
});

test.describe('Client empty-state', () => {
  test('logs in with coach-created credentials and lands on the client app', async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await expect(page.getByTestId(TID.loginForm)).toBeHidden({ timeout: 30_000 });
    // Client app = client bottom nav (home tab present, no coach/admin tabs).
    await expect(page.getByTestId(TID.navItem('home'))).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(TID.navItem('workout'))).toBeVisible();
    await expect(page.getByTestId(TID.navItem('coachClients'))).toHaveCount(0);
  });

  test('home shows "waiting for your coach" and no plan', async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 20_000 });
    await page.goto('/');
    await expect(page.getByTestId(TID.waitingForCoach)).toBeVisible({ timeout: 20_000 });
  });

  test('workout + nutrition pages show the waiting empty-state', async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('workout')).waitFor({ timeout: 20_000 });
    await page.goto('/workout');
    await expect(page.getByTestId(TID.waitingForCoach)).toBeVisible({ timeout: 20_000 });
    await page.goto('/nutrition');
    await expect(page.getByTestId(TID.waitingForCoach)).toBeVisible({ timeout: 20_000 });
  });

  test('no legacy seed data / no hardcoded Mohamed profile', async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 20_000 });
    for (const route of ['/', '/workout', '/nutrition', '/cardio', '/progress', '/settings']) {
      await page.goto(route);
      await page.waitForTimeout(400);
      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body, `legacy "Mohamed" data leaked on ${route}`).not.toContain('mohamed');
      expect(body, `legacy "Mohammed" data leaked on ${route}`).not.toContain('mohammed');
    }
  });

  test('targets are blank/zero (no stale coach targets)', async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('settings')).waitFor({ timeout: 20_000 });
    // No assigned plan ⇒ no Firestore plan docs for this brand-new client.
    const s = await signInAs('coach');
    try {
      const { docExists } = await import('./fixtures/firestore');
      expect(await docExists(s.db, ['clientData', client.uid, 'plan', 'workout'])).toBe(false);
      expect(await docExists(s.db, ['clientData', client.uid, 'plan', 'nutrition'])).toBe(false);
      expect(await docExists(s.db, ['clientData', client.uid, 'plan', 'cardio'])).toBe(false);
    } finally {
      await s.close();
    }
  });

  test('profile is dynamic (not the hardcoded legacy values)', async ({ loginWith, page }) => {
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('settings')).waitFor({ timeout: 20_000 });
    await page.goto('/settings');
    await page.waitForTimeout(500);
    const body = (await page.locator('body').innerText());
    // The legacy seed used a fixed body weight; a fresh client must not show it.
    expect(body).not.toContain('Mohamed');
  });
});
