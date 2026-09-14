import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the saved storageState JSON for a given role fixture (see e2e/fixtures/auth.setup.ts). */
export const AUTH = (role: string) => path.join(__dirname, '..', '.auth', `${role}.json`);

/**
 * Attaches console/pageerror/response listeners and returns an accumulator of
 * anything unusual seen while the test drives the page — console errors,
 * uncaught exceptions, and failed/4xx-5xx network responses. Callers can
 * inspect `.issues` at the end of a test and log/annotate as needed; this
 * intentionally never throws so a stray issue doesn't mask the real assertion
 * failures the test is checking for.
 */
export function trackIssues(page: Page, label: string) {
  const issues: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push(`[${label}] console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    issues.push(`[${label}] pageerror: ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    issues.push(`[${label}] requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) issues.push(`[${label}] http ${status}: ${res.request().method()} ${res.url()}`);
  });
  return issues;
}

export function reportIssues(issues: string[], label: string) {
  if (issues.length) {
    // eslint-disable-next-line no-console
    console.log(`\n--- ${label}: ${issues.length} issue(s) observed ---\n${issues.join('\n')}\n`);
  }
}
