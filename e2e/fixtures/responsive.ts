import { expect, type Page } from '@playwright/test';
import { TID } from './selectors';

/**
 * Shared responsive/overlay assertions for the Coach/Admin portal suites.
 * Viewports of record for the consistency pass: mobile · tablet · laptop · desktop.
 */
export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
} as const;

/** No horizontal overflow of the document (sub-pixel tolerance). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return Math.max(0, de.scrollWidth - de.clientWidth);
  });
  expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(2);
}

/**
 * On desktop, the open Sheet must be a centered, content-sized modal — NOT a
 * narrow mobile strip and NOT a full-bleed page. Asserts the panel is comfortably
 * wide (≥ 600px), bounded (leaves a side gutter), and horizontally centred.
 */
export async function expectDialogCenteredAndWide(page: Page): Promise<void> {
  const panel = page.getByTestId(TID.sheetPanel);
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  expect(box, 'sheet panel has a bounding box').toBeTruthy();
  if (!box) return;
  expect(box.width, 'desktop dialog should be content-wide, not a mobile strip').toBeGreaterThan(600);
  expect(box.width, 'desktop dialog should not be full-bleed').toBeLessThan(vw - 40);
  const center = box.x + box.width / 2;
  expect(Math.abs(center - vw / 2), 'dialog should be horizontally centred').toBeLessThan(40);
}

/**
 * An overlay must expose AT MOST ONE back affordance plus the single close (X).
 * Catches the duplicate-back regression (Sheet X + add-mode-back + existing-back).
 */
export async function expectSingleBackControl(page: Page): Promise<void> {
  const panel = page.getByTestId(TID.sheetPanel);
  await expect(panel).toBeVisible();
  await expect(page.getByTestId(TID.sheetClose), 'exactly one close control').toHaveCount(1);
  const backs = panel.locator('[aria-label="back"], [data-testid$="-back"]');
  expect(await backs.count(), 'at most one back control per overlay').toBeLessThanOrEqual(1);
}
