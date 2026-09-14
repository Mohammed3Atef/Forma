import type { Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '.auth');

/** Shared storageState paths for the persistent E2E accounts (see e2e/fixtures/auth.setup.ts). */
export const CLIENT_AUTH = path.join(AUTH_DIR, 'client.json');
export const COACH_AUTH = path.join(AUTH_DIR, 'coach.json');

/**
 * Attaches console-error and failed-network-request listeners to a page and
 * returns the running lists (useful for spotting real regressions during a
 * QA pass — 404/401/403/500s, unhandled rejections, etc). Not assertions by
 * itself; call sites decide what's expected vs. suspicious.
 */
export function watchPage(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: { url: string; status: number }[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) failedRequests.push({ url: res.url(), status });
  });

  return { consoleErrors, pageErrors, failedRequests };
}

/** True if the page has no horizontal overflow at its current viewport. */
export async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
