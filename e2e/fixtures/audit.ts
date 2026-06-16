import { expect, type Page } from '@playwright/test';
import type { ConsoleCapture } from './test';

/**
 * Reusable mobile/UX audit assertions used by the UI-coverage and RTL suites.
 * Each returns findings rather than throwing where possible, so a single page
 * can report multiple issues into the QA report instead of stopping at the
 * first failure.
 */

/** i18n key prefixes used by the app. Raw, untranslated keys leaking into the
 * DOM look like `nav.home` / `coach.clients` and indicate a missing string. */
const KEY_PREFIXES = [
  'nav.',
  'auth.',
  'coach.',
  'admin.',
  'client.',
  'clientCoach.',
  'platform.',
  'settings.',
  'common.',
  'onboard.',
  'nutrition.',
  'workout.',
  'cardio.',
  'progress.',
];

/** Scan visible text for raw i18n keys (a missing-translation smell). */
export async function findMissingTranslations(page: Page): Promise<string[]> {
  const prefixes = KEY_PREFIXES;
  return page.evaluate((pfx: string[]) => {
    const hits = new Set<string>();
    const re = new RegExp(`(${pfx.map((p) => p.replace('.', '\\.')).join('|')})[a-zA-Z0-9_]+`, 'g');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null = walker.nextNode();
    while (n) {
      const txt = (n.textContent ?? '').trim();
      if (txt) {
        const m = txt.match(re);
        if (m) m.forEach((x) => hits.add(x));
      }
      n = walker.nextNode();
    }
    return [...hits];
  }, prefixes);
}

/** True/finding for horizontal overflow on a mobile viewport. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const de = document.documentElement;
    // A few px of tolerance for sub-pixel rounding / scrollbar.
    return Math.max(0, de.scrollWidth - de.clientWidth);
  });
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await horizontalOverflow(page);
  expect(overflow, `horizontal overflow of ${overflow}px on mobile viewport`).toBeLessThanOrEqual(2);
}

export function expectNoConsoleErrors(capture: ConsoleCapture): void {
  expect(capture.errors, `console errors:\n${capture.errors.join('\n')}`).toEqual([]);
}

/** Assert the page did not crash to an empty/error body. */
export async function expectRendered(page: Page): Promise<void> {
  const text = (await page.locator('body').innerText().catch(() => '')) ?? '';
  expect(text.trim().length, 'page rendered no visible text (possible crash)').toBeGreaterThan(0);
  // React error boundary / unhandled error overlays.
  await expect(page.getByText(/Something went wrong|Application error|Cannot read propert/i)).toHaveCount(0);
}

/** Composite per-page smoke: render + no console errors + no missing i18n +
 * no horizontal scroll. Returns findings (does not throw) for report rollup. */
export interface PageFindings {
  route: string;
  rendered: boolean;
  consoleErrors: string[];
  missingTranslations: string[];
  horizontalOverflowPx: number;
}

export async function auditPage(
  page: Page,
  route: string,
  capture: ConsoleCapture,
): Promise<PageFindings> {
  let rendered = true;
  try {
    await expectRendered(page);
  } catch {
    rendered = false;
  }
  return {
    route,
    rendered,
    consoleErrors: [...capture.errors],
    missingTranslations: await findMissingTranslations(page),
    horizontalOverflowPx: await horizontalOverflow(page),
  };
}
