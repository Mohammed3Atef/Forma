import { expect, type Page } from '@playwright/test';

/** Shared helpers for the agent-B Phase-3 specs (20–23). Not a spec file. */

/** Accept the app's confirm dialog (DialogHost) and wait for it to close. */
export async function confirmYes(page: Page) {
  const dlg = page.getByTestId('confirm-dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('confirm-accept').click();
  await expect(dlg).toHaveCount(0);
}

/** Cancel the app's confirm dialog. */
export async function confirmNo(page: Page) {
  const dlg = page.getByTestId('confirm-dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('confirm-cancel').click();
  await expect(dlg).toHaveCount(0);
}

/** A toast with this title is visible. */
export async function expectToast(page: Page, title: string | RegExp) {
  await expect(page.getByTestId('toast').filter({ hasText: title }).first()).toBeVisible();
}

/**
 * Simulate the user returning to this tab/window (what React Query's focus
 * manager listens for): bring the page to front and fire visibilitychange +
 * focus. No reload, no navigation.
 */
export async function refocus(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    window.dispatchEvent(new Event('focus'));
  });
}

/** No alert/confirm dialog is open. */
export async function expectNoDialog(page: Page) {
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
}

export const uniq = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/**
 * A complete, submitted onboarding assessment (the shape the AssessmentWizard
 * writes). The shared seed stores a minimal legacy-shaped assessment
 * (`basic.fullName` only), which crashes the coach plan editors' Client
 * Context panel (finding E-B-1, proven separately on clientB). Specs that need
 * the editors patch their client to this shape as setup.
 */
export function fullAssessment(name: string, now = Date.now()) {
  return {
    basic: { fullName: name, dateOfBirth: '1997-01-01', age: 29, gender: 'female', heightCm: 168, weightKg: 66 },
    goals: { primaryGoal: 'fat_loss' },
    lifestyle: { occupation: 'desk', sleepHours: 7, activityLevel: 'moderate', trainingDaysPerWeek: 4 },
    training: { level: 'intermediate', location: 'commercial_gym' },
    health: { injuries: [], noInjuries: true, hasMedicalConditions: false },
    nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 4 },
    motivation: { biggestChallenge: 'consistency', commitmentLevel: 8 },
    progressPhotos: {},
    completionPercentage: 100,
    completed: true,
    completedAt: now - 9 * 86_400_000,
    status: 'submitted',
    submittedAt: now - 9 * 86_400_000,
    updatedAt: now - 9 * 86_400_000,
  };
}

/**
 * Signed-in app mounted and `marker` visible. Like fixtures' `ready()` but
 * without `networkidle` (background polling under load can keep the network
 * busy for a long time; the marker is the real readiness signal).
 */
export async function appReady(page: Page, marker = 'coach-sidebar') {
  await expect(page.getByTestId(marker).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('login-email')).toHaveCount(0);
}
