import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackConsoleErrors, openClientDetail, openClientMessagesFromList, sendAndVerify, loginAs, openAs, completeOnboardingIfPresent } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PNG = path.join(__dirname, 'fixtures', 'attachment.png');

// coach / client / coachB reuse the shared, already-authenticated storageState
// fixtures via `openAs` (refresh cookies are valid ~30 days) instead of logging
// in fresh — production's login endpoint is rate-limited and several agents
// share these accounts concurrently, so every avoidable `/auth/login` call
// matters. Only the two demo clients (05, 12), which have no saved fixture,
// log in fresh via `loginAs`.

/** All console/page errors seen across every test in this file, printed once at the end. */
const consoleIssues: string[] = [];

test.afterAll(() => {
  if (consoleIssues.length) {
    console.log(`\n=== Console/page errors observed during messaging E2E (${consoleIssues.length}) ===`);
    for (const line of consoleIssues) console.log(line);
  } else {
    console.log('\n=== No console/page errors observed during messaging E2E ===');
  }
});

/** Index of the first message-bubble whose text contains `needle` (-1 if none). */
async function indexOfBubble(page: Page, needle: string): Promise<number> {
  const texts = await page.getByTestId('message-bubble').allInnerTexts();
  return texts.findIndex((t) => t.includes(needle));
}

test.describe.serial('Coach A <-> client@forma.test (main QA thread)', () => {
  test('rich back-and-forth: send, receive, ordering, unread, read receipts, attachment, deep link, inbox preview', async ({ browser }) => {
    // Generous budget: this conversation has the most steps, and a stale
    // shared storageState (see `openAs`) can add one or two real logins.
    test.setTimeout(180_000);
    const { context: coachCtx, page: coachPage } = await openAs(browser, 'coach');
    const { context: clientCtx, page: clientPage } = await openAs(browser, 'client');
    trackConsoleErrors(coachPage, 'coachA', consoleIssues);
    trackConsoleErrors(clientPage, 'client@forma.test', consoleIssues);

    await test.step('deep-link: coach client-detail -> message thread', async () => {
      await openClientDetail(coachPage, 'client@forma.test');
      await expect(coachPage).toHaveURL(/\/coach\/client\/[^/]+$/);
      await coachPage.getByTestId('coach-message-client').click();
      await expect(coachPage).toHaveURL(/\/coach\/messages\/[^/]+$/);
      await expect(coachPage.getByTestId('message-thread')).toBeVisible({ timeout: 10_000 });
    });

    let preExisting = 0;
    await test.step('empty/prior state check (before sending anything this run)', async () => {
      preExisting = await coachPage.getByTestId('message-bubble').count();
      if (preExisting === 0) {
        await expect(coachPage.getByText('No messages yet.')).toBeVisible();
        console.log('[coachA<->client] thread was empty before this run — verified empty-state copy.');
      } else {
        console.log(`[coachA<->client] thread already had ${preExisting} message(s) from prior sessions — skipping empty-state assertion, proceeding with append-only checks.`);
      }
    });

    await test.step('client canonical route (/messages) loads the same thread', async () => {
      await clientPage.goto('/messages');
      await clientPage.waitForLoadState('networkidle');
      await completeOnboardingIfPresent(clientPage, { dob: '1994-05-10', heightCm: 172, weightKg: 70, gender: 'male' });
      await clientPage.goto('/messages');
      await clientPage.waitForLoadState('networkidle');
      await expect(clientPage.getByTestId('message-thread')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('coach sends opening messages', async () => {
      await sendAndVerify(coachPage, 'Hey! How did last week’s training go — did you manage all 4 sessions?');
      await sendAndVerify(coachPage, 'Also, how did the squats feel on leg day?');
    });

    await test.step('client sees them after reload/poll and replies', async () => {
      await clientPage.reload();
      await clientPage.waitForLoadState('networkidle');
      const texts = await clientPage.getByTestId('message-bubble').allInnerTexts();
      expect(texts.some((t) => t.includes('all 4 sessions'))).toBeTruthy();
      expect(texts.some((t) => t.includes('squats feel'))).toBeTruthy();

      await sendAndVerify(clientPage, 'Yeah, hit 4 out of 4! Legs day was tough though, my squat felt heavy.');
      await sendAndVerify(clientPage, 'Stayed at 60kg for 5x5, form felt solid but the last set was a grind.');
    });

    await test.step('coach unread badge + inbox preview reflect the new client messages before opening', async () => {
      await coachPage.goto('/coach/messages');
      await coachPage.waitForLoadState('networkidle');
      const targetRow = coachPage.getByTestId('thread-row').filter({ hasText: 'grind' });
      await expect(targetRow).toBeVisible({ timeout: 15_000 });
      const unreadBadge = targetRow.getByTestId('thread-unread-badge');
      await expect(unreadBadge).toBeVisible({ timeout: 10_000 });
      console.log(`[coachA<->client] unread badge visible on inbox row before opening: "${await unreadBadge.innerText()}"`);
      await targetRow.click();
    });

    await test.step('opening the thread marks it read and clears the badge', async () => {
      await expect(coachPage.getByTestId('message-bubble').last()).toContainText('grind', { timeout: 10_000 });
      await coachPage.goto('/coach/messages');
      await coachPage.waitForLoadState('networkidle');
      const targetRow = coachPage.getByTestId('thread-row').filter({ hasText: 'grind' });
      await expect(targetRow.getByTestId('thread-unread-badge')).not.toBeVisible({ timeout: 10_000 });
    });

    await test.step('coach continues the exchange; ordering is oldest -> newest', async () => {
      await coachPage.getByTestId('thread-row').filter({ hasText: 'grind' }).click();
      await sendAndVerify(coachPage, 'Good work. Let’s hold at 60kg one more week then bump to 62.5kg. How’s sleep been?');

      const iAsk = await indexOfBubble(coachPage, 'all 4 sessions');
      const iSquat = await indexOfBubble(coachPage, 'squats feel');
      const iReply1 = await indexOfBubble(coachPage, 'hit 4 out of 4');
      const iReply2 = await indexOfBubble(coachPage, '60kg for 5x5');
      const iCoach2 = await indexOfBubble(coachPage, 'hold at 60kg');
      expect(iAsk).toBeGreaterThanOrEqual(0);
      expect(iSquat).toBeGreaterThan(iAsk);
      expect(iReply1).toBeGreaterThan(iSquat);
      expect(iReply2).toBeGreaterThan(iReply1);
      expect(iCoach2).toBeGreaterThan(iReply2);
    });

    await test.step('client replies again and sees read receipt flip on the coach message once read', async () => {
      await clientPage.reload();
      await clientPage.waitForLoadState('networkidle');
      await expect(clientPage.getByTestId('message-bubble').last()).toContainText('hold at 60kg', { timeout: 10_000 });
      await sendAndVerify(clientPage, 'Better actually, averaging about 7 hours now.');

      await coachPage.reload();
      await coachPage.waitForLoadState('networkidle');
      // Coach's own last-sent bubble should now show "Seen" since the client opened the thread.
      const myBubbles = coachPage.getByTestId('message-bubble').filter({ hasText: 'hold at 60kg' });
      await expect(myBubbles.last()).toContainText(/Seen/i, { timeout: 10_000 });
    });

    await test.step('coach sends a final message + an image attachment', async () => {
      await sendAndVerify(coachPage, 'That’ll help recovery a lot. Keep it up — see you Monday for check-in.');

      const attachBtn = coachPage.getByTestId('message-attach');
      if (await attachBtn.count()) {
        const fileInput = coachPage.locator('[data-testid="message-thread"] input[type="file"]');
        await fileInput.setInputFiles(TEST_PNG);
        await expect(coachPage.locator('[data-testid="message-thread"] img').last()).toBeVisible({ timeout: 20_000 });
        console.log('[coachA<->client] image attachment sent and rendered.');
      } else {
        console.log('[coachA<->client] attachment button not present (Bunny not configured in this build) — skipped attachment test.');
      }
    });

    await test.step('client sees the full thread including attachment after reload', async () => {
      await clientPage.reload();
      await clientPage.waitForLoadState('networkidle');
      const texts = await clientPage.getByTestId('message-bubble').allInnerTexts();
      expect(texts.some((t) => t.includes('Monday for check-in'))).toBeTruthy();
    });

    await coachCtx.close();
    await clientCtx.close();
  });
});

test.describe.serial('Coach A <-> demo.client05@forma.test (Ahmed Kamal)', () => {
  test('shorter real exchange', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context: coachCtx, page: coachPage } = await openAs(browser, 'coach');
    trackConsoleErrors(coachPage, 'coachA', consoleIssues);
    const { context: clientCtx, page: clientPage } = await loginAs(browser, 'demo.client05@forma.test', 'DemoClient123!');
    trackConsoleErrors(clientPage, 'demo.client05', consoleIssues);

    await test.step('coach opens Ahmed Kamal thread via desktop list', async () => {
      await openClientMessagesFromList(coachPage, 'demo.client05@forma.test');
    });

    await test.step('client canonical route works', async () => {
      await clientPage.goto('/messages');
      await clientPage.waitForLoadState('networkidle');
      await completeOnboardingIfPresent(clientPage, { dob: '1996-03-14', heightCm: 178, weightKg: 82, gender: 'male' });
      await clientPage.goto('/messages');
      await clientPage.waitForLoadState('networkidle');
      await expect(clientPage.getByTestId('message-thread')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('exchange', async () => {
      await sendAndVerify(coachPage, 'Hi Ahmed, just checking in — how’s the new program feeling this week?');
      await clientPage.reload();
      await clientPage.waitForLoadState('networkidle');
      await sendAndVerify(clientPage, 'Going well, the cardio days are challenging but manageable.');
      await coachPage.reload();
      await coachPage.waitForLoadState('networkidle');
      await expect(coachPage.getByTestId('message-bubble').last()).toContainText('cardio days', { timeout: 10_000 });
      await sendAndVerify(coachPage, 'Great to hear — let me know if you need any adjustments.');
    });

    await test.step('inbox preview shows the latest message', async () => {
      await coachPage.goto('/coach/messages');
      await coachPage.waitForLoadState('networkidle');
      const row = coachPage.getByTestId('thread-row').filter({ hasText: 'adjustments' });
      await expect(row).toBeVisible({ timeout: 10_000 });
    });

    await coachCtx.close();
    await clientCtx.close();
  });
});

test.describe.serial('Coach B <-> demo.client12@forma.test (Rania Adel, recently transferred)', () => {
  test('welcome message + real exchange', async ({ browser }) => {
    test.setTimeout(150_000);
    const { context: coachCtx, page: coachPage } = await openAs(browser, 'coachB');
    trackConsoleErrors(coachPage, 'coachB', consoleIssues);
    const { context: clientCtx, page: clientPage } = await loginAs(browser, 'demo.client12@forma.test', 'DemoClient123!');
    trackConsoleErrors(clientPage, 'demo.client12', consoleIssues);

    await test.step('coach B opens Rania Adel thread via desktop list', async () => {
      await openClientMessagesFromList(coachPage, 'demo.client12@forma.test');
    });

    await test.step('client canonical route works', async () => {
      await clientPage.goto('/messages');
      await clientPage.waitForLoadState('networkidle');
      await completeOnboardingIfPresent(clientPage, { dob: '1998-07-22', heightCm: 165, weightKg: 60, gender: 'female' });
      await clientPage.goto('/messages');
      await clientPage.waitForLoadState('networkidle');
      await expect(clientPage.getByTestId('message-thread')).toBeVisible({ timeout: 10_000 });
    });

    await test.step('welcome message + exchange', async () => {
      await sendAndVerify(coachPage, 'Hi Rania, I’m your new coach — I’ll be taking over your coaching from here. Excited to work with you!');
      await clientPage.reload();
      await clientPage.waitForLoadState('networkidle');
      const texts = await clientPage.getByTestId('message-bubble').allInnerTexts();
      expect(texts.some((t) => t.includes('taking over your coaching'))).toBeTruthy();

      await sendAndVerify(clientPage, 'Hi! Thanks for letting me know, looking forward to it.');
      await coachPage.reload();
      await coachPage.waitForLoadState('networkidle');
      await sendAndVerify(coachPage, 'Let’s start by reviewing your current plan — anything feeling off, or a goal you want to prioritize?');

      await clientPage.reload();
      await clientPage.waitForLoadState('networkidle');
      await sendAndVerify(clientPage, 'I’d like to focus more on building strength this cycle.');

      await coachPage.reload();
      await coachPage.waitForLoadState('networkidle');
      await expect(coachPage.getByTestId('message-bubble').last()).toContainText('building strength', { timeout: 10_000 });
      await sendAndVerify(coachPage, 'Perfect — I’ll put together an updated plan around that this week.');
    });

    await coachCtx.close();
    await clientCtx.close();
  });
});
