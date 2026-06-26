import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInWith, readDoc } from './fixtures/firestore';
import { uniqueEmail } from './fixtures/factory';

/**
 * COACH SELF-SIGNUP (Phase 1). A visitor picks the Coach role on the sign-up
 * tab → lands ACTIVE (no admin approval) → an auto trial plan is created at
 * coachPlans/{uid} with the locked defaults → the onboarding checklist shows.
 *
 * Self-signup mints a real auth user; we drive it once and assert the resulting
 * Firestore state via the SDK (the authoritative boundary).
 */
test.describe('Coach self-signup', () => {
  test('signing up as coach lands active with an auto trial plan + checklist', async ({ page }) => {
    const email = uniqueEmail('qa-coachsignup');
    const password = 'Coach123456!';

    await page.goto('/login');
    await page.getByTestId(TID.loginForm).waitFor();
    await page.getByTestId(TID.loginToggleMode).click(); // → sign-up
    await expect(page.getByTestId(TID.signupRole)).toBeVisible();

    // Choose Coach.
    await page.getByTestId(TID.signupRoleFor('coach')).click();
    await page.getByTestId(TID.loginEmail).fill(email);
    await page.getByTestId(TID.loginPhone).fill('+15557654321');
    await page.getByTestId(TID.loginPassword).fill(password);
    await page.getByTestId(TID.loginConfirm).fill(password);
    await page.getByTestId(TID.loginSubmit).click();

    // Coach lands in the coach shell (active — no pending gate).
    await expect(page.getByTestId(TID.coachClients)).toBeVisible({ timeout: 30_000 });

    // The auto trial plan exists with the locked defaults.
    const sess = await signInWith(email, password, 'qa-coachsignup-read');
    const plan = await readDoc<{ plan: string; status: string; maxClients: number; endsAt: number | null; activeClientCount: number }>(sess.db, ['coachPlans', sess.uid]);
    expect(plan, 'coachPlans doc should be created at signup').not.toBeNull();
    expect(plan!.plan).toBe('trial');
    expect(plan!.status).toBe('active');
    expect(plan!.maxClients).toBe(10);
    expect(plan!.endsAt).toBeGreaterThan(Date.now());
    expect(plan!.activeClientCount).toBe(0);

    // The identity doc is an active coach created by self.
    const rec = await readDoc<{ role: string; accountStatus: string; createdBy: string }>(sess.db, ['users', sess.uid]);
    expect(rec!.role).toBe('coach');
    expect(rec!.accountStatus).toBe('active');
    expect(rec!.createdBy).toBe('self');

    // Onboarding checklist is visible on the dashboard (no clients/templates yet).
    await page.goto('/coach/dashboard');
    await expect(page.getByTestId(TID.coachChecklist)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(TID.coachTrialBanner)).toBeVisible();
  });

  test('client self-signup is disabled — only the Coach role is offered', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId(TID.loginForm).waitFor();
    await page.getByTestId(TID.loginToggleMode).click(); // → sign-up
    await expect(page.getByTestId(TID.signupRole)).toBeVisible();
    // Coach is available; Client is intentionally hidden (re-enabled later).
    await expect(page.getByTestId(TID.signupRoleFor('coach'))).toBeVisible();
    await expect(page.getByTestId(TID.signupRoleFor('client'))).toHaveCount(0);
  });
});
