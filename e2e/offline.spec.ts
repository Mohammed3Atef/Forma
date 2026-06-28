import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, setDoc, doc } from './fixtures/firestore';

/**
 * OFFLINE / CLIENT — the client app is offline-first (service worker + IndexedDB).
 * Log data offline, reload offline (data must persist), reconnect (data must
 * sync), and confirm no legacy seed data reappears after a reload.
 */

async function waitForSW(page: Page): Promise<void> {
  await page
    .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 25_000 })
    .catch(() => {
      throw new Error('service worker never took control — offline behaviour cannot be tested');
    });
}

/** Wait until no blocking onboarding/assessment overlay is mounted. */
async function waitNoOverlay(page: Page): Promise<void> {
  await expect(page.getByTestId(TID.assessmentWizard)).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByTestId('onboarding-overlay')).toHaveCount(0, { timeout: 25_000 });
}

test.describe('Offline & sync (client)', () => {
  // Robust guard: the offline client MUST have a complete profile + a submitted
  // assessment, otherwise the gate/onboarding overlay blocks the cardio flow.
  test.beforeAll(async () => {
    const s = await signInAs('client');
    const now = Date.now();
    try {
      await setDoc(doc(s.db, 'clientData', s.uid, 'profile', 'main'), {
        id: s.uid, name: 'QA Client', age: 30, weightKg: 80, heightCm: 178, goal: 'recomp', activityLevel: 'moderate', locale: 'en', createdAt: now, updatedAt: now,
      }, { merge: true });
      await setDoc(doc(s.db, 'clientData', s.uid, 'profile', 'assessment'), {
        basic: { fullName: 'QA Client', dateOfBirth: '1995-01-01', age: 30, gender: 'male', heightCm: 178, weightKg: 80 },
        goals: { primaryGoal: 'recomp', goalPriorities: [] },
        lifestyle: { occupation: 'desk', sleepHours: 8, activityLevel: 'moderate', trainingDaysPerWeek: 4 },
        training: { level: 'intermediate', location: 'commercial_gym' },
        health: { injuries: [], noInjuries: true, hasMedicalConditions: false },
        nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 3 },
        motivation: { biggestChallenge: 'consistency', commitmentLevel: 8 },
        progressPhotos: {},
        completionPercentage: 100, completed: true, completedAt: now, status: 'submitted', submittedAt: now, updatedAt: now,
      }, { merge: true });
    } finally {
      await s.close();
    }
  });

  test.beforeEach(async ({ login, page }) => {
    await login('client');
    // Cardio now lives in the nav menu (not the bottom bar); home is a bar tab.
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
    // Ensure the coach-content pull finished and no overlay is intercepting.
    await waitNoOverlay(page);
  });

  test('log offline → reload offline → data persists → reconnect syncs; no seed data returns', async ({ page, context }) => {
    await waitForSW(page);

    // Go offline and log a distinctive step count.
    await context.setOffline(true);
    await page.goto('/cardio');
    await page.getByRole('button', { name: /log activity|log/i }).first().click();
    const steps = page.getByPlaceholder('10000');
    await expect(steps).toBeVisible({ timeout: 10_000 });
    await steps.fill('8888');
    const mins = page.getByPlaceholder('40');
    if (await mins.isVisible().catch(() => false)) await mins.fill('25');
    await page.getByRole('dialog').getByRole('button', { name: /save/i }).first().click();
    await expect(page.getByText('8,888').first()).toBeVisible({ timeout: 10_000 });

    // Reload while still offline — the PWA shell + IndexedDB must restore it.
    await page.reload();
    await page.goto('/cardio');
    await expect(page.getByText('8,888').first()).toBeVisible({ timeout: 15_000 });

    // No legacy seed data leaked back in after the offline reload.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('mohamed');
    expect(body).not.toContain('mohammed');

    // Reconnect — the sync engine should flush without errors.
    await context.setOffline(false);
    await page.waitForTimeout(2500);
    await page.reload();
    await page.goto('/cardio');
    await expect(page.getByText('8,888').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Offline UX — banner + Coach/Admin gating', () => {
  test('client shows the global offline banner and keeps rendering; reconnect clears it', async ({ page, login, context }) => {
    await login('client');
    await expect(page.getByTestId(TID.appShell)).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(TID.appShell)).toBeVisible(); // offline-first: no crash

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toBeHidden({ timeout: 10_000 });
  });

  test('coach management actions are disabled offline', async ({ page, login, context }) => {
    await login('coach'); // mobile landing first (fixture waits for the clients list)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/coach/clients');
    await expect(page.getByTestId(TID.coachClients)).toBeVisible({ timeout: 25_000 });

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(TID.coachAddClient)).toBeDisabled(); // coach mutation safety

    await context.setOffline(false);
  });
});
