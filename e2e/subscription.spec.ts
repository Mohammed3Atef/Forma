import { test, expect } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, signInWith, readDoc, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * SUBSCRIPTIONS + ACCOUNT LIFECYCLE — a coach manages their client's coaching
 * subscription (term / freeze / end) and account status (freeze/pending/trash);
 * a client can request a freeze which the coach accepts. Security: a coach may
 * only touch their OWN client's account status (never role/permissions, never
 * unassigned accounts); the client can't write the relationship.
 */

const PW = 'Subs123456!';
let client: NewClient;
let coachUid = '';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
interface Rel { subscription?: { status: string; months?: number } }
interface Req { status: string }
interface U { accountStatus: string }

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    coachUid = coach.uid;
    client = await createClientViaApi(coach, { email: uniqueEmail('qa-subs'), password: PW, displayName: `QA Subs ${Date.now()}` });
  } finally {
    await coach.close();
  }
});

async function readRel(): Promise<Rel | null> {
  const s = await signInAs('coach');
  try {
    return await readDoc<Rel>(s.db, ['coachClients', `${coachUid}__${client.uid}`]);
  } finally {
    await s.close();
  }
}

test.describe.serial('Subscriptions & account lifecycle', () => {
  test('coach sets a term, freezes/unfreezes, and changes account status', async ({ page, login }) => {
    await login('coach');
    await page.goto(`/coach/client/${client.uid}`);
    await expect(page.getByTestId(TID.coachSubscription)).toBeVisible({ timeout: 20_000 });

    // Set a 3-month term.
    await page.getByTestId(TID.subSetTerm).click();
    await page.getByTestId(TID.termStart).fill(day(0));
    await page.getByTestId(TID.termMonths).fill('3');
    await page.getByTestId(TID.termSave).click();
    await expect(page.getByTestId(TID.subStatus)).toHaveText(/active/i, { timeout: 10_000 });
    await expect.poll(async () => (await readRel())?.subscription?.status, { timeout: 15_000 }).toBe('active');

    // Freeze for two weeks, then lift it.
    await page.getByTestId(TID.subFreeze).click();
    await page.getByTestId(TID.freezeFrom).fill(day(0));
    await page.getByTestId(TID.freezeUntil).fill(day(14));
    await page.getByTestId(TID.freezeSave).click();
    await expect(page.getByTestId(TID.subStatus)).toHaveText(/frozen/i, { timeout: 10_000 });
    await page.getByTestId(TID.subUnfreeze).click();
    await expect(page.getByTestId(TID.subStatus)).toHaveText(/active/i, { timeout: 10_000 });

    // Freeze the account (danger → confirm), verify, then unfreeze.
    await page.getByTestId(TID.acctAction('freeze')).click();
    await page.getByTestId(TID.confirmAccept).click();
    await expect.poll(async () => {
      const s = await signInAs('coach');
      try { return (await readDoc<U>(s.db, ['users', client.uid]))?.accountStatus; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe('suspended');
    await page.getByTestId(TID.acctAction('unfreeze')).click();
    await expect(page.getByTestId(TID.acctStatus)).toHaveText(/active/i, { timeout: 10_000 });
  });

  test('client requests a freeze; coach accepts it', async ({ page, login, loginWith }) => {
    // Client submits a freeze request from the coach inbox.
    await loginWith(client.email, client.password);
    await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
    await page.goto('/coach-notes');
    await expect(page.getByTestId(TID.clientSubscription)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(TID.freezeFrom).fill(day(0));
    await page.getByTestId(TID.freezeUntil).fill(day(14));
    await page.getByTestId(TID.freezeReason).fill('Travelling for two weeks');
    await page.getByTestId(TID.freezeSubmit).click();
    await expect(page.getByText(/pending/i).first()).toBeVisible({ timeout: 10_000 });

    const reqAfterSubmit = await (async () => {
      const s = await signInWith(client.email, client.password);
      try { return await readDoc<Req>(s.db, ['clientData', client.uid, 'subscriptionRequest', 'current']); } finally { await s.close(); }
    })();
    expect(reqAfterSubmit?.status).toBe('pending');

    // Coach sees the request and accepts it → request accepted + subscription frozen.
    await login('coach');
    await page.goto(`/coach/client/${client.uid}`);
    await expect(page.getByTestId(TID.freezeRequest)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(TID.freezeReqNote).fill('Approved — enjoy your trip.');
    await page.getByTestId(TID.freezeAccept).click();

    await expect.poll(async () => {
      const s = await signInAs('coach');
      try { return (await readDoc<Req>(s.db, ['clientData', client.uid, 'subscriptionRequest', 'current']))?.status; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe('accepted');
    expect((await readRel())?.subscription?.status).toBe('frozen');
  });

  test('security: coach is limited to their own client; client cannot write the relationship', async () => {
    const coach = await signInAs('coach');
    try {
      // Cannot change the client's ROLE (only status).
      const roleChange = await attempt(() => setDoc(doc(coach.db, 'users', client.uid), { role: 'coach' }, { merge: true }));
      expect(isPermissionDenied(roleChange), 'coach changing client role must be denied').toBe(true);
      // Cannot touch an account they are NOT assigned to.
      const notMine = await attempt(() => setDoc(doc(coach.db, 'users', 'not-my-client-uid'), { accountStatus: 'suspended' }, { merge: true }));
      expect(isPermissionDenied(notMine), 'coach editing an unassigned account must be denied').toBe(true);
    } finally {
      await coach.close();
    }

    const c = await signInWith(client.email, client.password);
    try {
      // Client may READ but never WRITE the relationship/subscription.
      const writeRel = await attempt(() => setDoc(doc(c.db, 'coachClients', `${coachUid}__${client.uid}`), { status: 'ended' }, { merge: true }));
      expect(isPermissionDenied(writeRel), 'client writing the relationship must be denied').toBe(true);
    } finally {
      await c.close();
    }
  });
});
