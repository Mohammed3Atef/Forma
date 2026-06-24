import { test as base, expect, type Page } from '@playwright/test';
import { credsFor, type RoleKey } from './env';
import { TID } from './selectors';

/**
 * Extended Playwright test with Forma-specific fixtures:
 *  - `consoleErrors`  — auto-captures console errors / page errors for every
 *                       test and attaches them to the report; the UI-coverage
 *                       suite asserts against it.
 *  - `login`          — authenticate as one of the four E2E roles through the
 *                       real login UI and wait for that role's landing.
 *  - `loginWith`      — authenticate with explicit credentials (coach-created
 *                       clients, suspended/pending accounts).
 */

export interface ConsoleCapture {
  errors: string[];
  warnings: string[];
}

/** Console noise that is not a real app defect (network blips, 3rd-party). */
const IGNORE_CONSOLE = [
  /favicon/i,
  /Failed to load resource.*manifest/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /the server responded with a status of 4\d\d .*\.(png|jpg|svg|webp)/i,
];

function isNoise(text: string): boolean {
  return IGNORE_CONSOLE.some((re) => re.test(text));
}

/** The first stable element of each role's landing shell — proves the right app mounted. */
const ROLE_LANDING: Record<RoleKey, string> = {
  super_admin: TID.adminOverview,
  admin: TID.adminOverview,
  coach: TID.coachClients,
  client: TID.navItem('home'),
};

const isVisible = (page: Page, tid: string, timeout = 2000) =>
  page.getByTestId(tid).isVisible({ timeout }).catch(() => false);

/** Which role shell (if any) is currently mounted. */
async function currentShell(page: Page): Promise<RoleKey | null> {
  for (const role of ['coach', 'client', 'admin', 'super_admin'] as RoleKey[]) {
    if (await isVisible(page, ROLE_LANDING[role], 500)) return role;
  }
  return null;
}

/**
 * Sign out any persisted session. Firebase keeps auth in the `firebaseLocalStorageDb`
 * IndexedDB; clearing it + reloading returns the app to the login screen. Needed
 * because tests switch users within one browser context (e.g. a coach `beforeEach`
 * followed by a client `loginWith`).
 */
async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        try {
          const req = indexedDB.deleteDatabase('firebaseLocalStorageDb');
          req.onsuccess = req.onerror = req.onblocked = finish;
        } catch { finish(); }
        setTimeout(finish, 1500);
      }),
  );
}

/** Ensure the login form is showing — signing out a stale session if one is active. */
async function ensureLoginForm(page: Page): Promise<void> {
  await page.goto('/login');
  if (await isVisible(page, TID.loginForm, 3000)) return;
  // An authenticated shell is mounted — sign out, then return to the login screen.
  await clearAuthState(page);
  await page.goto('/login');
  await page.getByTestId(TID.loginForm).waitFor({ state: 'visible', timeout: 30_000 });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT_AUTH = /quota|too-many|network|unavailable|temporar/i;

/**
 * Fill + submit the login form, retrying TRANSIENT auth failures (Firebase
 * `auth/quota-exceeded` etc.) with a backoff — the suite's volume of password
 * sign-ins can briefly trip the rate limit. Returns once the form detaches or
 * the retries are spent (caller then verifies the landing).
 */
async function submitWithRetry(page: Page, email: string, password: string): Promise<void> {
  const waits = [0, 6000, 15000];
  for (let i = 0; i < waits.length; i += 1) {
    if (waits[i]) await sleep(waits[i]);
    await page.getByTestId(TID.loginEmail).fill(email);
    await page.getByTestId(TID.loginPassword).fill(password);
    await page.getByTestId(TID.loginSubmit).click();
    try {
      await page.getByTestId(TID.loginForm).waitFor({ state: 'detached', timeout: 12_000 });
      return;
    } catch {
      const err = (await page.getByTestId(TID.loginError).textContent().catch(() => '')) ?? '';
      if (!TRANSIENT_AUTH.test(err)) return; // not a rate-limit blip — let caller surface it
    }
  }
}

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await ensureLoginForm(page);
  await submitWithRetry(page, email, password);
}

/** Wait until the app has left the login screen (auth succeeded). */
async function waitForAuthenticated(page: Page): Promise<void> {
  await page.getByTestId(TID.loginForm).waitFor({ state: 'detached', timeout: 30_000 });
}

/**
 * Authenticate as a role and wait for that role's shell — not just the login
 * form detaching. Idempotent: if the target role's shell is already mounted it
 * returns immediately. Retries the submit once (a missed click leaves the form
 * up), and throws with diagnostics if the shell never appears.
 */
async function loginAs(page: Page, role: RoleKey): Promise<void> {
  await page.goto('/login');
  const landing = ROLE_LANDING[role];
  // Fresh context → login form shows: skip straight to submitting.
  if (!(await isVisible(page, TID.loginForm, 3000))) {
    // No form: either already this role (idempotent no-op) or a stale session.
    if (await isVisible(page, landing, 1500)) return;
    await clearAuthState(page);
    await page.goto('/login');
    await page.getByTestId(TID.loginForm).waitFor({ state: 'visible', timeout: 30_000 });
  }

  const { email, password } = credsFor(role);
  await submitWithRetry(page, email, password);
  try {
    await page.getByTestId(landing).waitFor({ state: 'visible', timeout: 30_000 });
  } catch (e) {
    const url = page.url();
    const formShown = await isVisible(page, TID.loginForm, 500);
    const shell = await currentShell(page);
    const err = await page.getByTestId(TID.loginError).textContent().catch(() => null);
    throw new Error(
      `login(${role}) failed — email=${email} url=${url} loginForm=${formShown} shell=${shell ?? 'none'} loginError=${err ?? 'none'} :: ${(e as Error).message}`,
    );
  }
}

interface Fixtures {
  consoleErrors: ConsoleCapture;
  login: (role: RoleKey) => Promise<void>;
  loginWith: (email: string, password: string) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const capture: ConsoleCapture = { errors: [], warnings: [] };
      page.on('console', (msg) => {
        const text = msg.text();
        if (isNoise(text)) return;
        if (msg.type() === 'error') capture.errors.push(text);
        else if (msg.type() === 'warning') capture.warnings.push(text);
      });
      page.on('pageerror', (err) => {
        const text = `${err.name}: ${err.message}`;
        if (!isNoise(text)) capture.errors.push(text);
      });
      await use(capture);
      // Attach captured logs so failures carry full context in the report.
      if (capture.errors.length || capture.warnings.length) {
        await testInfo.attach('console-logs', {
          body: JSON.stringify(capture, null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],

  login: async ({ page }, use) => {
    await use(async (role: RoleKey) => {
      await loginAs(page, role);
    });
  },

  loginWith: async ({ page }, use) => {
    await use(async (email: string, password: string) => {
      await submitLogin(page, email, password);
    });
  },
});

export { expect };
export { waitForAuthenticated };
export type { Page, TestInfo, Locator } from '@playwright/test';
