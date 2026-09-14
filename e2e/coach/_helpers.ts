import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to a role's saved storageState (see e2e/fixtures/auth.setup.ts). */
export const AUTH = (role: string) => path.join(__dirname, '..', '.auth', `${role}.json`);

/**
 * IMPORTANT — single-use refresh token workaround.
 *
 * The backend's `auth.refresh` rotates the refresh cookie on every use (the
 * second call with an already-consumed cookie returns 401 — confirmed by
 * direct repro: two back-to-back fresh contexts loading the same page from
 * the SAME e2e/.auth/coach.json both call auth.refresh; the first gets 200,
 * the second 401 and lands on /login). Every fresh Playwright context reads
 * the on-disk storageState and, since the access token lives in-memory only,
 * immediately calls auth.refresh on first load — so the SECOND test in any
 * run that reuses the static coach.json file this way is guaranteed to be
 * logged out, unless something persists the rotated cookie back to disk
 * in between. `auth.setup.ts`'s "every other spec loads the matching state
 * file" comment doesn't account for this; it's a real, repo-wide E2E-infra
 * bug (see the writeup handed back in this task's final report), not
 * something specific to this test file.
 *
 * Workaround (scoped to this directory only): every test that uses this
 * `test` re-persists its context's storageState back to coach.json right
 * after it finishes, so the NEXT test — including ones in other spec files —
 * picks up a still-valid, freshly-rotated cookie instead of the stale one.
 * This does NOT fully protect against other concurrent agents/processes also
 * consuming/rotating the same shared coach.json mid-run; if that happens here
 * too, re-run `FORCE_REAUTH=1 npx playwright test --project=setup --grep
 * "authenticate as coach$"` once and re-run this directory's specs.
 */
export const test = base.extend({
  page: async ({ page, context }, use) => {
    await use(page);
    try {
      await context.storageState({ path: AUTH('coach') });
    } catch {
      // best-effort — a failed test may have already torn down the context
    }
  },
});

export { expect };

/**
 * Watches console errors + failed (4xx/5xx) network responses for the
 * duration of a test and records anything unusual as a test annotation
 * (visible in the HTML report) rather than failing the test outright — some
 * noise (analytics beacons, third-party embeds) is expected in a real prod
 * environment. Call `.report()` at the end of the test.
 */
export function watchForIssues(page: Page, testInfo: TestInfo) {
  const issues: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => issues.push(`unhandled page error: ${err.message}`));
  page.on('response', (res) => {
    const status = res.status();
    // auth.refresh 401 is the single-use-rotation artifact documented above,
    // not a real per-test issue — don't let it spam every test's annotations.
    if (status >= 400 && !res.url().includes('auth.refresh')) issues.push(`${status} ${res.request().method()} ${res.url()}`);
  });
  return {
    report() {
      if (issues.length) {
        testInfo.annotations.push({ type: 'console/network issues', description: issues.join('\n') });
      }
    },
  };
}
