import { test, expect, ready } from '../fixtures';
import { uiLogin, coachSignOut, trpcMutation, snap, noHmr } from './_a-helpers';

/**
 * Phase-3 auth journeys through the REAL login UI (the `as()` fixture mints
 * sessions directly; here every sign-in goes through the form).
 */

test.describe('auth', () => {
  test('UI login + role redirects (coach, client, super)', async ({ anon, env }, testInfo) => {
    const cases: { role: 'coachA' | 'clientA' | 'super'; url: RegExp; marker: (p: import('@playwright/test').Page) => Promise<void> }[] = [
      { role: 'coachA', url: /\/coach\/dashboard$/, marker: async (p) => expect(p.getByText('Client Aya').first()).toBeVisible() },
      { role: 'clientA', url: /127\.0\.0\.1:\d+\/$/, marker: async (p) => expect(p.getByTestId('login-email')).toHaveCount(0) },
      { role: 'super', url: /\/admin$/, marker: async (p) => expect(p.getByRole('link', { name: 'Coaches' }).first()).toBeVisible() },
    ];
    for (const c of cases) {
      const { context: _c679, page } = await anon(); await noHmr(_c679);
      await page.goto('/login');
      await uiLogin(page, env.accounts[c.role].email, env.password);
      await expect(page).toHaveURL(c.url, { timeout: 20_000 });
      await ready(page);
      await c.marker(page);
      await snap(page, testInfo, `login-${c.role}`);
    }
  });

  test('wrong password shows an error and stays on login', async ({ anon, env }, testInfo) => {
    const { context: _c679, page } = await anon(); await noHmr(_c679);
    await page.goto('/login');
    await uiLogin(page, env.accounts.coachB.email, 'Wrong-Pass-123!');
    await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password.');
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await snap(page, testInfo, 'wrong-password');
  });

  test('coach logout → anonymous; next login as a different coach shows no previous-user data', async ({ anon, env }, testInfo) => {
    const { context: _c679, page } = await anon(); await noHmr(_c679);
    await uiLogin(page, env.accounts.coachA.email, env.password);
    await expect(page).toHaveURL(/\/coach\/dashboard$/, { timeout: 20_000 });
    await ready(page);
    await expect(page.getByText('Client Aya').first()).toBeVisible();
    await page.goto('/coach/plan');
    await expect(page.getByTestId('coach-plan')).toBeVisible();
    await coachSignOut(page);
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 15_000 });
    await snap(page, testInfo, 'coach-signed-out');
    // Same tab, different coach.
    await uiLogin(page, env.accounts.coachB.email, env.password);
    await ready(page);
    await page.goto('/coach/dashboard');
    await ready(page);
    await expect(page.getByText('Client Bilal').first()).toBeVisible();
    await expect(page.getByText('Client Aya')).toHaveCount(0);
    await page.goto('/coach/clients');
    await ready(page);
    await expect(page.getByText('Client Bilal').first()).toBeVisible();
    await expect(page.getByText('Client Aya')).toHaveCount(0);
    await snap(page, testInfo, 'coachB-after-switch');
  });

  test('client logout (confirm dialog) → anonymous; next login as a different client shows no previous-user data', async ({ anon, env }, testInfo) => {
    const { context: _c679, page } = await anon(); await noHmr(_c679);
    await uiLogin(page, env.accounts.clientA.email, env.password);
    await ready(page);
    await page.goto('/settings');
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Client Aya' })).toBeVisible();
    await page.getByTestId('settings-tab-account').click();
    await expect(page.getByText(env.accounts.clientA.email).first()).toBeVisible();
    await page.getByTestId('client-sign-out').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await snap(page, testInfo, 'client-signout-confirm');
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 15_000 });
    await snap(page, testInfo, 'client-signed-out');
    await uiLogin(page, env.accounts.clientB.email, env.password);
    await ready(page);
    await page.goto('/settings');
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Client Bilal' })).toBeVisible();
    await expect(page.getByText('Client Aya')).toHaveCount(0);
    await page.getByTestId('settings-tab-account').click();
    await expect(page.getByText(env.accounts.clientB.email).first()).toBeVisible();
    await expect(page.getByText(env.accounts.clientA.email)).toHaveCount(0);
    await page.goto('/');
    await ready(page);
    await expect(page.getByText('Client Aya')).toHaveCount(0);
    await snap(page, testInfo, 'clientB-after-switch');
  });

  test('refresh keeps the session', async ({ anon, env }, testInfo) => {
    const { context: _c679, page } = await anon(); await noHmr(_c679);
    await uiLogin(page, env.accounts.coachA.email, env.password);
    await expect(page).toHaveURL(/\/coach\/dashboard$/, { timeout: 20_000 });
    await ready(page);
    await page.goto('/coach/plan');
    await expect(page.getByTestId('coach-plan')).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page).toHaveURL(/\/coach\/plan$/);
    await expect(page.getByTestId('coach-plan')).toBeVisible();
    await snap(page, testInfo, 'after-reload');
  });

  test('revoked session → reload lands on login, no loop, no error', async ({ as, db, env, audit }, testInfo) => {
    const { context: _c7878, page } = await as('coachA'); await noHmr(_c7878);
    await page.goto('/coach/dashboard');
    await ready(page);
    await db.updateMany('refreshTokens', { userId: env.accounts.coachA.id }, { $set: { revoked: true } });
    const refreshCalls: string[] = [];
    page.on('request', (r) => { if (/auth\.refresh/.test(r.url())) refreshCalls.push(r.url()); });
    await page.reload();
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(4000); // observe for a loop
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-error')).toHaveCount(0);
    expect(refreshCalls.length, `refresh calls after reload: ${refreshCalls.length}`).toBeLessThanOrEqual(2);
    await snap(page, testInfo, 'revoked-login');
    const otherHttp = audit.events.filter((e) => e.kind === 'http' && !/auth\.(refresh|me)/.test(e.url ?? ''));
    await testInfo.attach('non-refresh-http.json', { body: JSON.stringify(otherHttp, null, 2), contentType: 'application/json' });
  });

  test('login rate limit: 11 bad attempts for one email → friendly error, page usable', async ({ anon }, testInfo) => {
    const { context: _c679, page } = await anon(); await noHmr(_c679);
    const email = `nobody.${Date.now()}@ratelimit.invalid`;
    await page.goto('/login');
    for (let i = 1; i <= 11; i++) {
      await uiLogin(page, email, `Bad-Pass-${i}!`);
      await expect(page.getByTestId('login-error')).toBeVisible();
      await expect(page.getByTestId('login-submit')).toBeEnabled();
    }
    await expect(page.getByTestId('login-error')).toHaveText('Too many attempts — please wait a bit and try again.');
    await snap(page, testInfo, 'rate-limited');
    // Page still usable: the form is interactive and another account can still sign in.
    await page.getByTestId('login-email').fill('');
    await expect(page.getByTestId('login-email')).toBeEditable();
    await page.getByTestId('login-toggle-mode').click();
    await expect(page.getByTestId('login-phone')).toBeVisible();
    await page.getByTestId('login-toggle-mode').click();
    await expect(page.getByTestId('login-forgot')).toBeVisible();
  });

  test('forgot password shows the generic confirmation', async ({ anon, env }, testInfo) => {
    const { context: _c679, page } = await anon(); await noHmr(_c679);
    await page.goto('/login');
    await page.getByTestId('login-forgot').click();
    await expect(page.getByTestId('login-error')).toHaveText('Enter your email above first.');
    await page.getByTestId('login-email').fill(env.accounts.coachB.email);
    await page.getByTestId('login-forgot').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText(`Password reset link sent to ${env.accounts.coachB.email}.`);
    await snap(page, testInfo, 'forgot-known');
    await page.getByTestId('confirm-accept').click();
    // Unknown email: identical response (no enumeration).
    await page.getByTestId('login-email').fill(`ghost.${Date.now()}@e2e.test`);
    await page.getByTestId('login-forgot').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('Password reset link sent to ghost.');
    await snap(page, testInfo, 'forgot-unknown');
  });

  test('reset password via link → login with the new password (then restored)', async ({ anon, db, env }, testInfo) => {
    const userId = env.accounts.clientFree.id;
    const NEW = 'Reset-Pass-2026!x';
    const raw = await db.resetToken(userId);
    try {
      const { context: _c679, page } = await anon(); await noHmr(_c679);
      await page.goto(`/reset/${raw}`);
      await expect(page.getByTestId('reset-password-form')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('reset-password').fill(NEW);
      await page.getByTestId('reset-password-confirm').fill(NEW);
      await page.getByTestId('reset-submit').click();
      await expect(page.getByText('Back to sign in').or(page.getByRole('button', { name: /sign in/i })).first()).toBeVisible();
      await snap(page, testInfo, 'reset-done');
      // Token is single-use.
      const reuse = await trpcMutation(env.baseURL, 'auth.confirmPasswordReset', { token: raw, newPassword: 'Another-Pass-1!' });
      expect(reuse.status).toBe(400);
      await page.goto('/login');
      await uiLogin(page, env.accounts.clientFree.email, env.password);
      await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password.');
      await uiLogin(page, env.accounts.clientFree.email, NEW);
      await ready(page);
      await expect(page.getByTestId('login-email')).toHaveCount(0);
      await snap(page, testInfo, 'login-new-password');
    } finally {
      const raw2 = await db.resetToken(userId);
      const res = await trpcMutation(env.baseURL, 'auth.confirmPasswordReset', { token: raw2, newPassword: env.password });
      expect(res.status, 'password restore').toBe(200);
    }
  });

  test('signed-in user opening /invite/<code> sees the interstitial → sign out and continue', async ({ as }, testInfo) => {
    const { context: _c7878, page } = await as('coachA'); await noHmr(_c7878);
    await page.goto('/invite/ANYCODE');
    await expect(page.getByTestId('signed-in-interstitial')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('signed-in-interstitial')).toContainText('Coach Amira');
    await snap(page, testInfo, 'invite-interstitial');
    await page.getByTestId('signed-in-switch').click();
    await expect(page.getByTestId('accept-invite')).toBeVisible();
    await expect(page.getByTestId('invite-invalid')).toBeVisible();
    await expect(page).toHaveURL(/\/invite\/ANYCODE$/);
    await snap(page, testInfo, 'invite-anon');
  });

  test('signed-in user opening /reset/<token> sees the interstitial → sign out and continue', async ({ as, db, env }, testInfo) => {
    const raw = await db.resetToken(env.accounts.clientA.id); // never submitted
    const { context: _c3535, page } = await as('clientA'); await noHmr(_c3535);
    await page.goto(`/reset/${raw}`);
    await expect(page.getByTestId('signed-in-interstitial')).toBeVisible({ timeout: 20_000 });
    await snap(page, testInfo, 'reset-interstitial');
    await page.getByTestId('signed-in-switch').click();
    await expect(page.getByTestId('reset-password-form')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/reset/${raw}$`));
    await snap(page, testInfo, 'reset-anon');
  });

  test.skip('Google sign-in', () => {
    // BLOCKED: needs a real Google Identity Services popup + a Google-issued ID token
    // verified against Google's servers; GOOGLE_CLIENT_ID is '' in the isolated env.
  });
});
