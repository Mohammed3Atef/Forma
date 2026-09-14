import 'dotenv/config';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH = (role: string) => path.join(__dirname, '..', '.auth', `${role}.json`);

const ROLE_CREDS: Record<string, { emailVar: string; passVar: string }> = {
  super: { emailVar: 'E2E_SUPER_EMAIL', passVar: 'E2E_SUPER_PASSWORD' },
  admin: { emailVar: 'E2E_ADMIN_EMAIL', passVar: 'E2E_ADMIN_PASSWORD' },
  coach: { emailVar: 'E2E_COACH_EMAIL', passVar: 'E2E_COACH_PASSWORD' },
  client: { emailVar: 'E2E_CLIENT_EMAIL', passVar: 'E2E_CLIENT_PASSWORD' },
  coachB: { emailVar: 'E2E_COACHB_EMAIL', passVar: 'E2E_COACHB_PASSWORD' },
  coachC: { emailVar: 'E2E_COACHC_EMAIL', passVar: 'E2E_COACHC_PASSWORD' },
};

/** A protected (auth-required) route per role — used only to verify the saved
 *  session actually works. `/` is the public marketing page and never bounces
 *  to `/login` even when logged out, so checking there is a no-op. */
const ROLE_PROTECTED_ROUTE: Record<string, string> = {
  super: '/admin',
  admin: '/admin',
  coach: '/coach/clients',
  coachB: '/coach/clients',
  coachC: '/coach/clients',
  client: '/messages',
};

/**
 * Opens a fresh context using the shared `.auth/<role>.json` storageState
 * (avoids any new `/auth/login` call — production's login endpoint is
 * rate-limited and several agents share these accounts concurrently). As a
 * safety net, if that saved session turns out to already be invalid (bounced
 * to the login screen — observed at least once mid-run, most plausibly
 * because a concurrent agent's own `setup` run rewrote the same shared file
 * with a different/rotated session while this one was in flight), falls back
 * to one real login for that role so the test can still proceed.
 */
export async function openAs(browser: Browser, role: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: AUTH(role) });
  const page = await context.newPage();
  await page.goto(ROLE_PROTECTED_ROUTE[role] ?? '/');
  await page.waitForLoadState('networkidle');
  const bounced = await page.getByText('Welcome back').isVisible().catch(() => false);
  if (bounced) {
    const creds = ROLE_CREDS[role];
    if (!creds) throw new Error(`No credentials mapping for role "${role}"`);
    const email = process.env[creds.emailVar];
    const password = process.env[creds.passVar];
    if (!email || !password) throw new Error(`Missing ${creds.emailVar}/${creds.passVar} in .env`);
    console.log(`[auth] storageState for "${role}" was already invalid (bounced to login) — logging in fresh instead.`);
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page.locator('body')).not.toContainText('Welcome back', { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
  }
  return { context, page };
}

/** Console/page errors captured for a page, for the final report. */
export function trackConsoleErrors(page: Page, label: string, sink: string[]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(`[${label}] console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    sink.push(`[${label}] pageerror: ${err.message}`);
  });
}

/**
 * Logs in through the real /login form and returns a fresh context+page for
 * that session. Caller must close the context.
 *
 * NOTE: we deliberately do NOT reuse the `.auth/*.json` storageState files
 * here (even for roles that have one). In practice the coach.json fixture
 * came back already-invalidated (a 401 on first use, bounced to the login
 * screen) when used a minute or so after the `setup` project regenerated it —
 * see the BUG note in the final report. Logging in fresh immediately before
 * each conversation sidesteps that timing issue entirely.
 */
export async function loginAs(browser: Browser, email: string, password: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.locator('body')).not.toContainText('Welcome back', { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  return { context, page };
}

/**
 * Coach desktop client list -> full CoachClientDetail page for a client
 * matching `query` (email or name), via the per-row "Open" action (works
 * whether or not the row is selected).
 */
export async function openClientDetail(page: Page, query: string) {
  await page.goto('/coach/clients');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('coach-clients-search').fill(query);
  const row = page.getByTestId('data-row').filter({ hasText: query });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: 'Open' }).click();
  await page.waitForLoadState('networkidle');
}

/**
 * Coach desktop client list -> straight into that client's message thread via
 * the list's selection preview panel's "Messages" shortcut.
 */
export async function openClientMessagesFromList(page: Page, query: string) {
  await page.goto('/coach/clients');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('coach-clients-search').fill(query);
  const row = page.getByTestId('data-row').filter({ hasText: query });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  const preview = page.getByTestId('coach-desktop-preview');
  await preview.getByRole('button', { name: 'Messages' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('message-thread')).toBeVisible({ timeout: 10_000 });
}

/**
 * Client accounts are gated behind a mandatory 8-step onboarding assessment
 * (`ClientApp.tsx`'s `blocked` check, backed by `AssessmentWizard.tsx`) — it
 * blocks the ENTIRE dashboard, including `/messages`, until submitted. Real
 * by-design behavior, not a bug, but a demo account that hasn't done it yet
 * (e.g. a freshly-transferred client) can't be messaged until it's complete.
 * Only step 0 (basic info) and step 4 (health) have real validation; every
 * other step accepts its defaults, so this fills the minimum to submit.
 * No-op if the wizard isn't showing.
 */
export async function completeOnboardingIfPresent(
  page: Page,
  opts: { dob: string; heightCm: number; weightKg: number; gender: 'male' | 'female' },
) {
  const wizard = page.getByTestId('assessment-wizard');
  if (!(await wizard.isVisible().catch(() => false))) return;

  await page.getByTestId('a-dob').fill(opts.dob);
  await page.getByTestId('a-height').fill(String(opts.heightCm));
  await page.getByTestId('a-weight').fill(String(opts.weightKg));
  await page.getByTestId(`opt-${opts.gender}`).click();
  await page.getByTestId('assessment-next').click(); // step 0 -> 1

  await page.getByTestId('assessment-next').click(); // 1 -> 2
  await page.getByTestId('assessment-next').click(); // 2 -> 3
  await page.getByTestId('assessment-next').click(); // 3 -> 4

  await page.getByTestId('a-no-injuries').click(); // health: required to advance
  await page.getByTestId('assessment-next').click(); // 4 -> 5

  await page.getByTestId('assessment-next').click(); // 5 -> 6
  await page.getByTestId('assessment-next').click(); // 6 -> 7 (photos, optional)

  await page.getByTestId('assessment-submit').click();
  await expect(page.getByTestId('assessment-done')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('assessment-go-dashboard').click();
  await page.waitForLoadState('networkidle');
}

/** Count of visible message-bubble nodes in the open thread. */
export function bubbleCount(page: Page) {
  return page.getByTestId('message-bubble').count();
}

/** Send one message via the composer and wait for it to render as a new bubble. */
export async function sendAndVerify(page: Page, text: string) {
  const before = await bubbleCount(page);
  await page.getByTestId('message-input').fill(text);
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-bubble').last()).toContainText(text, { timeout: 10_000 });
  const after = await bubbleCount(page);
  expect(after).toBe(before + 1);
}
