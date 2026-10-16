import { devices, type Page } from '@playwright/test';
import { test, expect, ready, shot } from '../fixtures';
import { allowDevModuleStorm, pollDb } from './_c-helpers';
import { confirmYes, expectToast } from './_b-helpers';

/**
 * B3.0.1 — security & ownership checkpoint, the parts with a screen:
 *  - B3-S14 (owner R-4, Option C): a coach sees only their own conversation;
 *    the client keeps an earlier coach's conversation apart, read-only, and
 *    new messages go to the current coach;
 *  - B3-S07 (owner: F-C): a scheduled freeze leaves the client active until
 *    it starts, pushes the end date by the frozen days, and can be cancelled
 *    (the resulting end date shown before confirming); a renewal back-dated
 *    over a lapse is confirmed explicitly and flagged in the audit trail.
 * Everything else in B3.0.1 is server-only and covered by the api suites
 * (b301Messaging / b301Ownership / b301Subscription, _subscriptionRules).
 *
 * Uses clientFree + coachPro (both empty after spec 20's restore) and puts
 * everything back in afterAll.
 */
const PRO = 'e2e-coach-pro';
const FREE = 'e2e-client-free';
const OLD_COACH = 'e2e-coach-a';
const REL = `${PRO}__${FREE}`;
const DAY = 86_400_000;
const mobile = () => ({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });
/** A date as the Cairo-time date picker shows it. */
const cairoDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const bubble = (page: Page, text: string) => page.getByTestId('message-bubble').filter({ hasText: text });

test.describe('B3.0.1 security & ownership (browser)', () => {
  /** Spec 20 leaves an ENDED coachPro ⇄ clientFree relationship behind — kept aside and put back. */
  let prior: Record<string, unknown> | null = null;

  test.beforeAll(async ({ db }) => {
    const now = Date.now();
    const existing = await db.findOne<Record<string, unknown>>('coachClients', { _id: REL });
    if (existing && existing.status !== 'active') prior = existing;
    await db.deleteMany('coachClients', { _id: REL });
    await db.deleteMany('messages', { clientId: FREE });
    await db.insertOne('coachClients', {
      _id: REL,
      coachId: PRO,
      clientId: FREE,
      status: 'active',
      createdBy: PRO,
      createdAt: now - DAY,
      updatedAt: now,
      subscription: { status: 'active', startAt: now - DAY, endAt: now + 29 * DAY, months: 1, price: 900, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now },
    });
    await db.updateOne('users', { _id: FREE }, { $set: { assignedCoachId: PRO } });
    const msg = (id: string, body: string, fromRole: 'client' | 'coach', coachId: string, at: number) => ({
      _id: `b301-${id}`,
      clientId: FREE,
      coachId,
      fromUserId: fromRole === 'client' ? FREE : coachId,
      fromRole,
      body,
      seenAt: at + 1000,
      createdAt: at,
      updatedAt: at,
    });
    for (const m of [
      msg('1', 'B301 old coach: rest your knee', 'coach', OLD_COACH, now - 3 * DAY),
      msg('2', 'B301 me to the old coach', 'client', OLD_COACH, now - 3 * DAY + 60_000),
      msg('3', 'B301 welcome from Pro', 'coach', PRO, now - 3_600_000),
    ]) {
      await db.insertOne('messages', m);
    }
  });

  test.afterAll(async ({ db }) => {
    await db.deleteMany('messages', { clientId: FREE });
    await db.deleteMany('notifications', { clientId: FREE });
    await db.deleteMany('coachClients', { _id: REL });
    if (prior) await db.insertOne('coachClients', prior);
    await db.updateOne('users', { _id: FREE }, { $unset: { assignedCoachId: '' } });
  });

  test('the current coach sees only their own conversation — no earlier coach line, no history section', async ({ as, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('coachPro');
    await page.goto(`/coach/messages/${FREE}`);
    await ready(page);
    await expect(bubble(page, 'B301 welcome from Pro')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('message-bubble').filter({ hasText: 'B301 old coach' })).toHaveCount(0);
    await expect(page.getByTestId('message-bubble').filter({ hasText: 'B301 me to the old coach' })).toHaveCount(0);
    await expect(page.getByTestId('message-history-toggle')).toHaveCount(0);
    await shot(page, testInfo, '01-coach-own-conversation');
  });

  test('the client sees the earlier coach apart and read-only; a new message goes to the current coach', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const { page } = await as('clientFree', mobile());
    await page.goto('/messages');
    await ready(page);
    await expect(bubble(page, 'B301 welcome from Pro')).toBeVisible({ timeout: 20_000 });
    const toggle = page.getByTestId('message-history-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(bubble(page, 'B301 old coach: rest your knee')).toHaveCount(0);
    await toggle.click();
    await expect(bubble(page, 'B301 old coach: rest your knee')).toBeVisible();
    await shot(page, testInfo, '02-client-history-open');
    // Read-only: the earlier coach's message offers no reactions.
    await bubble(page, 'B301 old coach: rest your knee').click({ button: 'right' });
    await expect(page.getByTestId('reaction-picker')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByTestId('message-input').fill('B301 hi Pro');
    await page.getByTestId('message-send').click();
    const sent = await pollDb(() => db.findOne<{ coachId?: string }>('messages', { clientId: FREE, body: 'B301 hi Pro' }), (m) => !!m);
    expect(sent?.coachId).toBe(PRO);
  });

  test('a scheduled freeze: the client stays active until it starts, the end moves by the frozen days, cancelling gives them back', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const before = (await db.findOne<{ subscription: { endAt: number } }>('coachClients', { _id: REL }))!.subscription.endAt;
    const { page } = await as('coachPro');
    await page.goto(`/coach/client/${FREE}/subscription`);
    await ready(page);
    const status = page.getByTestId('sub-status');
    await expect(status).toHaveText('Active', { timeout: 20_000 });

    await page.getByTestId('sub-freeze').click();
    await page.getByTestId('freeze-from').fill(cairoDay(Date.now() + 3 * DAY));
    await page.getByTestId('freeze-until').fill(cairoDay(Date.now() + 6 * DAY));
    await page.getByTestId('freeze-save').click();
    await expectToast(page, 'Freeze');
    await expect(status).toHaveText('Active');
    await expect(page.getByTestId('sub-freeze-scheduled')).toBeVisible();
    await expect(page.getByTestId('sub-unfreeze')).toBeVisible();
    await shot(page, testInfo, '03-freeze-scheduled');
    const frozen = (await db.findOne<{ subscription: { status: string; endAt: number; freezeCredit: number } }>('coachClients', { _id: REL }))!.subscription;
    expect(frozen.status).toBe('frozen');
    expect(Math.abs(frozen.freezeCredit - 3 * DAY)).toBeLessThanOrEqual(3_600_000); // 3 local days (± a DST hour)
    expect(frozen.endAt - before).toBe(frozen.freezeCredit);

    await page.getByTestId('sub-unfreeze').click();
    // Owner (B3.0.1): the resulting end date is shown before the coach confirms.
    await expect(page.getByTestId('confirm-dialog')).toContainText(cairoDay(before));
    await confirmYes(page);
    await expect(page.getByTestId('sub-freeze')).toBeVisible();
    await expect(page.getByTestId('sub-freeze-scheduled')).toHaveCount(0);
    const after = (await db.findOne<{ subscription: { status: string; endAt: number } }>('coachClients', { _id: REL }))!.subscription;
    expect(after).toMatchObject({ status: 'active', endAt: before });
  });

  test('a renewal back-dated over a lapse asks first, explains the blocked logs will sync, and is flagged in the audit trail', async ({ as, db, audit }, testInfo) => {
    allowDevModuleStorm(audit);
    const now = Date.now();
    await db.updateOne('coachClients', { _id: REL }, { $set: { 'subscription.startAt': now - 40 * DAY, 'subscription.endAt': now - 10 * DAY, 'subscription.updatedAt': now } });
    const { page } = await as('coachPro');
    await page.goto(`/coach/client/${FREE}/subscription`);
    await ready(page);
    await expect(page.getByTestId('sub-status')).toHaveText('Expired', { timeout: 20_000 });
    await page.getByTestId('sub-set-term').click();
    const start = cairoDay(now - 5 * DAY);
    await page.getByTestId('term-start').fill(start);
    await page.getByTestId('term-save').click();
    const dialog = page.getByTestId('confirm-dialog');
    await expect(dialog).toContainText('Start in the past?');
    await expect(dialog).toContainText(start);
    await expect(dialog).toContainText('will sync');
    await shot(page, testInfo, '04-backdated-renewal-confirm');
    await confirmYes(page);
    const rel = await pollDb(
      () => db.findOne<{ subscriptionEvents?: { op: string; backdated?: boolean }[] }>('coachClients', { _id: REL }),
      (r) => r?.subscriptionEvents?.at(-1)?.op === 'setTerm',
    );
    expect(rel?.subscriptionEvents?.at(-1)).toMatchObject({ op: 'setTerm', backdated: true });
    await expect(page.getByTestId('sub-status')).toHaveText('Active');
  });
});
