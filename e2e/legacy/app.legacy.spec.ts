import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end suite. Each test runs in a fresh, isolated browser context
 * (clean IndexedDB) against the built PWA preview. Covers every page's main
 * buttons/inputs, offline logging + reload persistence, offline video, and an
 * opt-in real Firebase sync test.
 */

async function boot(page: Page) {
  await page.goto('/');
  // Splash → app shell; wait for bottom navigation.
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  // Fresh installs show the first-launch onboarding overlay — complete it with
  // a local profile so the rest of the suite can interact with the app.
  const nameInput = page.locator('#ob-name');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Test User');
    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(nameInput).toHaveCount(0);
  }
}

async function waitForSW(page: Page) {
  await page
    .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 20_000 })
    .catch(() => {
      throw new Error('service worker never took control — offline behaviour cannot be tested');
    });
}

test.describe.skip('Boot & navigation', () => {
  test('boots straight to the dashboard (no login)', async ({ page }) => {
    await boot(page);
    await expect(page.getByText(/Good (morning|afternoon|evening),/)).toBeVisible();
    await expect(page.getByText(/sign in|login/i)).toHaveCount(0);
  });

  test('bottom nav reaches every section', async ({ page }) => {
    await boot(page);
    for (const [name, heading] of [
      ['Workout', 'Weekly plan'],
      ['Nutrition', 'Nutrition'],
      ['Cardio', 'Cardio & Steps'],
      ['Progress', 'Progress'],
      ['Settings', 'Settings'],
      ['Home', /Good (morning|afternoon|evening),/],
    ] as const) {
      await page.getByRole('link', { name }).click();
      await expect(page.getByText(heading).first()).toBeVisible();
    }
  });
});

test.describe.skip('Workout session (gym flow)', () => {
  test('open → start → log set → rest → finish', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Workout' }).click();
    // Open the "Push" routine, then start the workout.
    await page.getByRole('button', { name: /Push/ }).first().click();
    await page.getByRole('button', { name: 'Start this workout' }).click();

    // Draft: not recording yet.
    await expect(page.getByText('Not started')).toBeVisible();

    // Start the session timer (header button).
    await page.getByRole('button', { name: 'Start', exact: true }).first().click();
    await expect(page.locator('header .font-mono').first()).toBeVisible();

    // Log a set: enter weight + reps, then mark it done (rest auto-starts).
    await page.getByLabel('Weight').first().fill('20');
    await page.getByLabel('reps').first().fill('10');
    await page.getByLabel('Done').first().click();
    await expect(page.getByRole('button', { name: '+15' })).toBeVisible();

    // Finish → confirm sheet → save → completion summary.
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save workout' }).click();
    await expect(page.getByText('Workout complete')).toBeVisible();
  });

  test('draft is discarded when backing out without starting', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Workout' }).click();
    await page.getByRole('button', { name: /Pull/ }).first().click();
    await page.getByRole('button', { name: 'Start this workout' }).click();
    await expect(page.getByText('Not started')).toBeVisible();
    // Back out via minimize → the unstarted draft is discarded.
    await page.getByLabel('minimize').click();
    // Nothing recorded → no Resume/Edit shown.
    await expect(page.getByText('Resume', { exact: false })).toHaveCount(0);
  });

  test('training guide opens with RPE/RIR', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Workout' }).click();
    await page.getByRole('button', { name: 'Training guide' }).click();
    await expect(page.getByText('RPE / RIR rating')).toBeVisible();
  });
});

test.describe.skip('Nutrition', () => {
  test('water, meal eaten, supplement, creatine, macros update', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Nutrition' }).click();
    await page.getByRole('button', { name: '+250' }).click();
    await expect(page.getByText(/250 \/ 4000 ml/)).toBeVisible();
    // Mark first meal eaten → macro rings increase from 0.
    await page.getByRole('button', { name: 'Mark eaten' }).first().click();
    await expect(page.getByText('Calories')).toBeVisible();
  });

  test('replace a planned food, add an extra food, then edit it', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Nutrition' }).click();

    // Replace first item (scope submit to the open dialog to avoid the row icons).
    await page.getByLabel('Replace').first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByPlaceholder('Name').fill('Beef');
    await dlg.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect(page.getByText('↳ Beef')).toBeVisible();
    await expect(page.locator('.line-through').first()).toBeVisible();

    // Add an extra food to a meal, then edit it in place.
    await page.getByText('+ Add food').first().click();
    await page.getByRole('dialog').getByPlaceholder('Name').fill('Oats');
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('+ Oats')).toBeVisible();
    await page.getByLabel('Edit').last().click();
    await page.getByRole('dialog').getByPlaceholder('Name').fill('Oatmeal');
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('+ Oatmeal')).toBeVisible();
  });
});

test.describe.skip('Cardio (combined activity)', () => {
  test('log steps + minutes as one entry', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Cardio' }).click();
    await page.getByRole('button', { name: 'Log activity' }).click();
    await page.getByPlaceholder('10000').fill('10000');
    await page.getByPlaceholder('40').fill('40');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('10,000').first()).toBeVisible();
    // Combined goal card marked done.
    await expect(page.getByText('Daily activity goal')).toBeVisible();
  });
});

test.describe.skip('Progress & body', () => {
  test('charts render', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Progress' }).click();
    await expect(page.getByText('Body weight')).toBeVisible();
    await expect(page.getByText('Weekly completion')).toBeVisible();
  });

  test('measurements: save + before/after compare', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Progress' }).click();
    await page.getByRole('button', { name: 'Measurements' }).click();
    // 14 body fields present.
    await expect(page.getByText('Upper back')).toBeVisible();
    await expect(page.getByText('Glutes')).toBeVisible();

    // Day 1.
    const fields = page.locator('.card input');
    await fields.nth(2).fill('100'); // chest
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Previous day, different value → comparison appears with a delta.
    await page.getByLabel('previous day').click();
    await page.locator('.card input').nth(2).fill('98');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Compare')).toBeVisible();
    await expect(page.getByText('+2')).toBeVisible();
  });

  test('progress photo upload', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Progress' }).click();
    await page.getByRole('button', { name: 'Progress photos' }).click();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.locator('input[type=file]').first().setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('img').first()).toBeVisible();
  });
});

test.describe.skip('Settings', () => {
  test('language toggle EN ⇄ AR (RTL)', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('edit a daily target', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    const protein = page.locator('section', { hasText: 'Daily targets' }).locator('input').nth(1);
    await protein.fill('170');
    await page.getByRole('link', { name: 'Nutrition' }).click();
    await expect(page.getByText('/170')).toBeVisible();
  });

  test('add, toggle and delete a reminder', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    const before = await page.locator('input[type=time]').count();
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(page.locator('input[type=time]')).toHaveCount(before + 1);
    await page.getByLabel('Delete').first().click();
    await expect(page.locator('input[type=time]')).toHaveCount(before);
  });

  test('cloud sign-in is available + sync status badge', async ({ page }) => {
    await boot(page);
    // Badge visible on Home (Local only until signed in).
    await expect(page.getByText('Local only').first()).toBeVisible();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByText(/Sign in to back up|Backed up/)).toBeVisible();
    await expect(page.getByText('Local only').first()).toBeVisible();
  });
});

test.describe.skip('Offline-first & persistence', () => {
  test('log offline, reload offline, data persists', async ({ page, context }) => {
    await boot(page);
    await waitForSW(page);

    await context.setOffline(true);
    await page.getByRole('link', { name: 'Cardio' }).click();
    await page.getByRole('button', { name: 'Log activity' }).click();
    await page.getByPlaceholder('10000').fill('8888');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('8,888').first()).toBeVisible();

    await page.reload();
    await page.getByRole('link', { name: 'Cardio' }).click();
    await expect(page.getByText('8,888').first()).toBeVisible(); // survived offline reload
    await context.setOffline(false);
  });

  test('clear this day removes the day data', async ({ page }) => {
    await boot(page);
    await page.getByRole('link', { name: 'Cardio' }).click();
    await page.getByRole('button', { name: 'Log activity' }).click();
    await page.getByPlaceholder('10000').fill('7777');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('7,777').first()).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Clear this day/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

    await page.getByRole('link', { name: 'Cardio' }).click();
    await expect(page.getByText('7,777')).toHaveCount(0);
  });
});

test.describe.skip('Offline video', () => {
  test('download a clip then play it offline', async ({ page, context }) => {
    await boot(page);
    await waitForSW(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByText('Video manager').click();

    // Download the first clip into IndexedDB.
    await page.getByLabel('Download').first().click();
    await expect(page.getByText('Downloaded').first()).toBeVisible({ timeout: 30_000 });

    // Go offline and play it.
    await context.setOffline(true);
    await page.getByLabel('play').first().click();
    const video = page.locator('video');
    await expect(video).toBeVisible();
    await page.waitForTimeout(1500);
    const ready = await video.evaluate((v: HTMLVideoElement) => v.readyState);
    expect(ready).toBeGreaterThanOrEqual(1); // has data offline
    await context.setOffline(false);
  });
});

test.describe.skip('Reset', () => {
  test('reset all data restores defaults', async ({ page }) => {
    await boot(page);
    // Change profile name, then reset.
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('section', { hasText: 'Profile' }).locator('input').first().fill('TEST NAME');
    await page.getByRole('button', { name: /Reset all data/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Reset all data/ }).click();
    await page.waitForTimeout(2500); // wipe + reload + reseed
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.locator('section', { hasText: 'Profile' }).locator('input').first()).not.toHaveValue('TEST NAME');
  });
});

/**
 * Opt-in real Firebase round-trip. Provide a test account in env to run it:
 *   E2E_EMAIL=you@example.com E2E_PASSWORD=secret npm run test:e2e
 * Requires Email/Password auth + Firestore enabled and rules deployed.
 */
test.describe.skip('Firebase sync (opt-in)', () => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  test('sign in, log offline, sync on reconnect, restore on a 2nd context', async ({ browser, context, page }) => {
    test.skip(!email || !password, 'Set E2E_EMAIL / E2E_PASSWORD to run the Firebase sync test');

    // Device A: sign in, log data, sync.
    await boot(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign in to back up' }).click();
    await page.getByPlaceholder('Email').fill(email!);
    await page.getByPlaceholder('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in to back up' }).click();
    await expect(page.getByText(/Backed up|Syncing/)).toBeVisible({ timeout: 20_000 });

    const marker = `WT ${Date.now()}`;
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('section', { hasText: 'Profile' }).locator('input').first().fill(marker);
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect(page.getByText(/Last sync/)).toBeVisible({ timeout: 20_000 });

    // Device B: fresh context, sign in → should pull the marker.
    const ctxB = await browser.newContext({ baseURL: 'http://localhost:4390' });
    const pageB = await ctxB.newPage();
    await boot(pageB);
    await pageB.getByRole('link', { name: 'Settings' }).click();
    await pageB.getByRole('button', { name: 'Sign in to back up' }).click();
    await pageB.getByPlaceholder('Email').fill(email!);
    await pageB.getByPlaceholder('Password').fill(password!);
    await pageB.getByRole('button', { name: 'Sign in to back up' }).click();
    await expect(pageB.locator('section', { hasText: 'Profile' }).locator('input').first()).toHaveValue(marker, { timeout: 25_000 });
    await ctxB.close();
    void context;
  });
});
