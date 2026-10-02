import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

/** Real UI sign-in through the Login form (`/login`). */
export async function uiLogin(page: Page, email: string, password: string) {
  if (!/\/login/.test(page.url())) await page.goto('/login');
  await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

/** Coach sign-out from `/coach/settings` (RoleAccount → confirm dialog). */
export async function coachSignOut(page: Page) {
  await page.goto('/coach/settings');
  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await page.getByTestId('confirm-accept').click();
}

/** Raw tRPC call from Node (no browser) — e.g. restoring a password after a reset test. */
export async function trpcMutation(baseURL: string, path: string, input: unknown, token?: string) {
  const r = await fetch(`${baseURL}/api/trpc/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function runCron(baseURL: string, secret: string) {
  const r = await fetch(`${baseURL}/api/cron/daily-maintenance`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
  return { status: r.status, body: await r.text() };
}

/** Coach self-signup through the real UI (`/login?signup=1`). Returns the email used. */
export async function uiSignupCoach(page: Page, email: string, password: string, phone = '+201099990000') {
  if (!/signup=1/.test(page.url())) await page.goto('/login?signup=1');
  await expect(page.getByTestId('login-phone')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-phone').fill(phone);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-confirm').fill(password);
  await page.getByTestId('login-submit').click();
  return email;
}

export const uniq = (p: string) => `${p}.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@e2e.test`;

/**
 * `shot()` + a stable on-disk copy at e2e-out/<run>/shots/<spec>/<test>/<name>.png
 * so evidence can be cited by path (fixture attachments are inline-only).
 */
export async function snap(page: Page, testInfo: import('@playwright/test').TestInfo, name: string, fullPage = false) {
  const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);
  const file = `e2e-out/${process.env.E2E_RUN_ID}/shots/${slug(testInfo.titlePath[0] ?? '')}/${slug(testInfo.title)}/${name}.png`;
  const body = await page.screenshot({ path: file, fullPage });
  await testInfo.attach(`${name}.png`, { body, contentType: 'image/png' });
  return file;
}

/**
 * HARNESS WORKAROUND (not product behaviour): `vite dev` watches the repo root
 * and Playwright writes trace resources (`*.html`) under `e2e-out/` — for every
 * concurrent run — so Vite broadcasts "page reload" over HMR and the app
 * reloads mid-test. A production build has no HMR socket at all, so stubbing
 * the HMR WebSocket (accepted, never forwarded) only removes the dev artefact.
 */
export async function noHmr(context: import('@playwright/test').BrowserContext) {
  await context.routeWebSocket(() => true, () => { /* swallow: never connect to the Vite HMR server */ });
  // Evidence: keep the body of every 5xx so a server error can be diagnosed after the run.
  context.on('response', async (r) => {
    if (r.status() < 500) return;
    const body = await r.text().catch(() => '<unreadable>');
    const fs = await import('node:fs');
    fs.mkdirSync(`e2e-out/${process.env.E2E_RUN_ID}`, { recursive: true });
    fs.appendFileSync(`e2e-out/${process.env.E2E_RUN_ID}/a-5xx-bodies.log`, `${new Date().toISOString()} ${r.status()} ${r.request().method()} ${r.url()}
${body.slice(0, 4000)}

`);
  });
  return context;
}
