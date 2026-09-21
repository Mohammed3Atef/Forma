import 'dotenv/config';
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAs, openClientMessagesFromList, sendAndVerify, bubbleCount } from './helpers';

/**
 * Targeted coverage for the final Messenger pass: stable-id reconciliation,
 * the hold-before-send attachment composer, edit/delete, and reactions.
 *
 * NOT run automatically as part of this change — see the Pass report. Local
 * dev (`playwright.local.config.ts`) runs the real `api/trpc` handler against
 * whichever `MONGODB_URI` is configured in `.env`, which may be the same
 * database production e2e uses. New `edit`/`delete` endpoints can mutate real
 * message rows, so these were written but deliberately not executed against
 * an unconfirmed database target — run manually with `npx playwright test
 * --config=playwright.local.config.ts e2e/messages/messenger-v3.spec.ts`
 * once you've confirmed what `MONGODB_URI` points to.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PNG = path.join(__dirname, 'fixtures', 'attachment.png');
const TEST_PDF = path.join(__dirname, 'fixtures', 'attachment.pdf');

test.describe.serial('Messenger v3 — coach A <-> client@forma.test', () => {
  test('text send shows a pending bubble then reconciles to a confirmed one', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const text = `pending-check ${Date.now()}`;
    await page.getByTestId('message-input').fill(text);
    await page.getByTestId('message-send').click();

    // The pending bubble renders immediately (before the poll confirms it).
    await expect(page.getByTestId('message-bubble-pending').filter({ hasText: text })).toBeVisible({ timeout: 2_000 });
    // It resolves into a real confirmed bubble without ever disappearing.
    await expect(page.getByTestId('message-bubble').filter({ hasText: text })).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test('sending identical text twice produces two distinct bubbles, not one', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const text = `dup-check ${Date.now()}`;
    const before = await bubbleCount(page);
    await sendAndVerify(page, text);
    await sendAndVerify(page, text);
    const after = await bubbleCount(page);
    expect(after).toBe(before + 2);
    await expect(page.getByTestId('message-bubble').filter({ hasText: text })).toHaveCount(2);

    await context.close();
  });

  test('image select -> preview -> remove-before-send discards it, without sending anything', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const attachBtn = page.getByTestId('message-attach');
    test.skip(!(await attachBtn.count()), 'Attachment button not present (Bunny not configured in this build).');

    const fileInput = page.locator('[data-testid="message-thread"] input[type="file"]');
    await fileInput.setInputFiles(TEST_PNG);
    await expect(page.getByTestId('composer-attachment-preview')).toBeVisible({ timeout: 5_000 });

    // Remove-before-send: the preview disappears and nothing gets sent.
    const beforeRemove = await bubbleCount(page);
    await page.getByTestId('composer-attachment-remove').click();
    await expect(page.getByTestId('composer-attachment-preview')).not.toBeVisible();
    expect(await bubbleCount(page)).toBe(beforeRemove);

    await context.close();
  });

  test('an image sent by itself (no caption typed) is exactly one message', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const attachBtn = page.getByTestId('message-attach');
    test.skip(!(await attachBtn.count()), 'Attachment button not present (Bunny not configured in this build).');

    const fileInput = page.locator('[data-testid="message-thread"] input[type="file"]');
    await fileInput.setInputFiles(TEST_PNG);
    await expect(page.getByTestId('composer-attachment-preview')).toBeVisible({ timeout: 5_000 });

    const before = await bubbleCount(page);
    await page.getByTestId('message-send').click();
    await expect(page.getByTestId('composer-attachment-preview')).not.toBeVisible();
    await expect(page.locator('[data-testid="message-thread"] img').last()).toBeVisible({ timeout: 20_000 });
    expect(await bubbleCount(page)).toBe(before + 1);

    await context.close();
  });

  test('edit a just-sent message (within the 2-minute window) and see the Edited label', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const original = `edit-me ${Date.now()}`;
    await sendAndVerify(page, original);
    const bubble = page.getByTestId('message-bubble').filter({ hasText: original }).last();
    await bubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });

    await expect(page.getByTestId('action-edit')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('action-edit').click();
    const edited = `${original}-edited`;
    await page.locator('textarea').last().fill(edited);
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.getByTestId('message-bubble').filter({ hasText: edited })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('message-bubble').filter({ hasText: edited })).toContainText(/edited/i);

    await context.close();
  });

  test('delete a just-sent message leaves a tombstone, not a body-less gap', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const text = `delete-me ${Date.now()}`;
    await sendAndVerify(page, text);
    const bubble = page.getByTestId('message-bubble').filter({ hasText: text }).last();
    await bubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('action-delete').click();
    // `confirmDelete` opens a confirm dialog — accept it.
    await page.getByTestId('confirm-accept').click();

    await expect(page.getByTestId('message-bubble').filter({ hasText: text })).not.toBeVisible();
    await expect(page.getByTestId('message-bubble-deleted').last()).toBeVisible({ timeout: 5_000 });

    await context.close();
  });

  test('react to a message, change the reaction, then remove it', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const text = `react-me ${Date.now()}`;
    await sendAndVerify(page, text);
    const bubble = page.getByTestId('message-bubble').filter({ hasText: text }).last();
    await bubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });

    await page.getByTestId('reaction-pick').first().click(); // 👍
    await expect(bubble.locator('..').getByTestId('reaction-chip')).toBeVisible({ timeout: 5_000 });

    await bubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('reaction-pick').nth(1).click(); // ❤️ — replaces
    await expect(bubble.locator('..').getByTestId('reaction-chip')).toHaveCount(1);

    await bubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('reaction-pick').nth(1).click(); // tap the same one again — removes it
    await expect(bubble.locator('..').getByTestId('reaction-chip')).toHaveCount(0);

    await context.close();
  });

  test('clicking the conversation identity in the header opens the client workspace', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    await page.getByTestId('thread-header-identity').click();
    await expect(page).toHaveURL(/\/coach\/client\/[^/]+$/);

    await context.close();
  });

  // Regression coverage for the visual-grouping bug: an image sent alone, then
  // "test" sent separately, then "12" sent separately, must render as THREE
  // fully independent messages — each with its own reaction/edit/delete
  // ownership — never as one merged block just because they're consecutive
  // same-sender sends close together in time.
  test('three separate sends (image, "test", "12") stay three independent messages; react/edit/delete on one never touches the others', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const attachBtn = page.getByTestId('message-attach');
    test.skip(!(await attachBtn.count()), 'Attachment button not present (Bunny not configured in this build).');

    const stamp = Date.now();
    const textA = `test-${stamp}`;
    const textB = `12-${stamp}`;

    // 1. Send an image by itself.
    const fileInput = page.locator('[data-testid="message-thread"] input[type="file"]');
    await fileInput.setInputFiles(TEST_PNG);
    await expect(page.getByTestId('composer-attachment-preview')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('message-send').click();
    const imageBubble = page.getByTestId('message-bubble').filter({ has: page.locator('img') }).last();
    await expect(imageBubble).toBeVisible({ timeout: 20_000 });

    // 2 & 3. Send "test" and "12" as two SEPARATE sends (not one composed message).
    await sendAndVerify(page, textA);
    await sendAndVerify(page, textB);

    const bubbleA = page.getByTestId('message-bubble').filter({ hasText: textA }).last();
    const bubbleB = page.getByTestId('message-bubble').filter({ hasText: textB }).last();
    // The image bubble must carry no text of its own — confirms it never
    // absorbed "test"/"12" into a shared container.
    await expect(imageBubble).not.toContainText(textA);
    await expect(imageBubble).not.toContainText(textB);

    // React only to the image.
    await imageBubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('reaction-pick').first().click();
    await expect(imageBubble.getByTestId('reaction-chip')).toBeVisible({ timeout: 5_000 });
    // Neither text message picked up a reaction.
    await expect(bubbleA.getByTestId('reaction-chip')).toHaveCount(0);
    await expect(bubbleB.getByTestId('reaction-chip')).toHaveCount(0);

    // Edit only "test".
    await bubbleA.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('action-edit').click();
    const editedA = `${textA}-edited`;
    await page.locator('textarea').last().fill(editedA);
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByTestId('message-bubble').filter({ hasText: editedA })).toBeVisible({ timeout: 5_000 });
    // "12" is untouched — no edited label, original text intact.
    await expect(bubbleB).not.toContainText(/edited/i);
    await expect(bubbleB).toContainText(textB);

    // Delete only "12".
    await bubbleB.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('action-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId('message-bubble').filter({ hasText: textB })).not.toBeVisible();

    // The image and edited "test" message are both still there, untouched by the delete.
    await expect(imageBubble).toBeVisible();
    await expect(page.getByTestId('message-bubble').filter({ hasText: editedA })).toBeVisible();

    await context.close();
  });

  // Product decision (superseding the earlier "one combined message" rule):
  // composing an image WITH a typed caption and pressing Send ONCE must
  // produce TWO fully independent messages — the attachment first, the text
  // second — each with its own id/reactions/edit/delete eligibility. Verifies
  // the full matrix from the spec: react image only, edit text only, delete
  // image only, and confirm the text is completely untouched by any of it.
  test('image + typed caption, sent once, produces TWO independent messages (not one)', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const attachBtn = page.getByTestId('message-attach');
    test.skip(!(await attachBtn.count()), 'Attachment button not present (Bunny not configured in this build).');

    const caption = `test-${Date.now()}`;
    const fileInput = page.locator('[data-testid="message-thread"] input[type="file"]');
    await fileInput.setInputFiles(TEST_PNG);
    await expect(page.getByTestId('composer-attachment-preview')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('message-input').fill(caption);

    const before = await bubbleCount(page);
    await page.getByTestId('message-send').click();
    await expect(page.getByTestId('composer-attachment-preview')).not.toBeVisible();

    const imageBubble = page.getByTestId('message-bubble').filter({ has: page.locator('img') }).last();
    const textBubble = page.getByTestId('message-bubble').filter({ hasText: caption }).last();
    await expect(imageBubble).toBeVisible({ timeout: 20_000 });
    await expect(textBubble).toBeVisible({ timeout: 10_000 });
    // Exactly two new bubbles for one press of Send, and they're not the same one.
    expect(await bubbleCount(page)).toBe(before + 2);
    await expect(imageBubble).not.toContainText(caption);

    // React to the image only.
    await imageBubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('reaction-pick').first().click();
    await expect(imageBubble.getByTestId('reaction-chip')).toBeVisible({ timeout: 5_000 });
    await expect(textBubble.getByTestId('reaction-chip')).toHaveCount(0);

    // Edit the text only.
    await textBubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('action-edit').click();
    const editedCaption = `${caption}-edited`;
    await page.locator('textarea').last().fill(editedCaption);
    await page.getByRole('button', { name: /save/i }).click();
    const editedTextBubble = page.getByTestId('message-bubble').filter({ hasText: editedCaption });
    await expect(editedTextBubble).toBeVisible({ timeout: 5_000 });

    // Delete the image only — the (now edited) text message is untouched.
    await imageBubble.locator('[data-testid="message-actions-trigger"]').click({ force: true });
    await page.getByTestId('action-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(imageBubble).not.toBeVisible();
    await expect(editedTextBubble).toBeVisible();
    await expect(editedTextBubble).toContainText(/edited/i);

    await context.close();
  });

  // Same rule for a generic file attachment (not just images) + a caption —
  // the composer's split-send logic doesn't branch on attachment kind, so
  // this exercises the same code path with a non-image, non-preview-able file.
  test('a generic file + typed caption, sent once, produces TWO independent messages', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'coach');
    await openClientMessagesFromList(page, 'client@forma.test');

    const attachBtn = page.getByTestId('message-attach');
    test.skip(!(await attachBtn.count()), 'Attachment button not present (Bunny not configured in this build).');

    const caption = `file-caption-${Date.now()}`;
    const fileInput = page.locator('[data-testid="message-thread"] input[type="file"]');
    await fileInput.setInputFiles(TEST_PDF);
    await expect(page.getByTestId('composer-attachment-preview')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('message-input').fill(caption);

    const before = await bubbleCount(page);
    await page.getByTestId('message-send').click();
    await expect(page.getByTestId('composer-attachment-preview')).not.toBeVisible();

    const fileBubble = page.getByTestId('message-bubble').filter({ has: page.locator('a[href$=".pdf"]') }).last();
    const textBubble = page.getByTestId('message-bubble').filter({ hasText: caption }).last();
    await expect(fileBubble).toBeVisible({ timeout: 20_000 });
    await expect(textBubble).toBeVisible({ timeout: 10_000 });
    expect(await bubbleCount(page)).toBe(before + 2);
    await expect(fileBubble).not.toContainText(caption);

    await context.close();
  });
});
