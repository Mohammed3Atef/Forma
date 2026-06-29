import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, findUserByEmail, findCoachClientRel, attempt, isPermissionDenied, doc, setDoc, getDocs, collection, query, where } from './fixtures/firestore';
import { firebaseEnvConfig } from './fixtures/env';
import { uniqueEmail } from './fixtures/factory';

/**
 * EXISTING-CLIENT FLOW — search an existing Forma client and assign / release /
 * request transfer WITHOUT ever creating a duplicate account or Auth user.
 *
 * The Create-New (invite) flow is unchanged and covered by coach.spec.ts.
 */

const PW = 'Existing123456!';
const clientEmail = uniqueEmail('qa-existing');
const clientName = `QA Existing ${Date.now()}`;
let clientUid = '';

/** Create a self-signed-up, UNASSIGNED client (no coach) — the CASE-1 subject. */
async function createUnassignedClient(): Promise<string> {
  const app = initializeApp(firebaseEnvConfig(), `unassigned-${Date.now()}-${Math.random()}`);
  try {
    const auth = getAuth(app);
    const cred = await createUserWithEmailAndPassword(auth, clientEmail, PW);
    const uid = cred.user.uid;
    const now = Date.now();
    const { getFirestore } = await import('firebase/firestore');
    const db = getFirestore(app);
    // Self-provision defaults (no assignedCoachId) — exactly what the rules permit.
    await setDoc(doc(db, 'users', uid), {
      id: uid,
      email: clientEmail,
      displayName: clientName,
      displayNameLower: clientName.toLowerCase(),
      phone: '+10000000001',
      role: 'client',
      accountStatus: 'active',
      permissions: [],
      featureFlags: {},
      createdBy: 'self',
      createdAt: now,
      updatedAt: now,
    });
    await signOut(auth).catch(() => undefined);
    return uid;
  } finally {
    await deleteApp(app).catch(() => undefined);
  }
}

async function openAddExisting(page: Page): Promise<void> {
  await page.goto('/coach');
  await page.getByTestId(TID.coachAddClient).click();
  await expect(page.getByTestId(TID.addClientChooser)).toBeVisible();
  await page.getByTestId(TID.addChooseExisting).click();
  await expect(page.getByTestId(TID.addExistingPanel)).toBeVisible();
}

test.describe.serial('Existing-client flow', () => {
  test.beforeAll(async () => {
    clientUid = await createUnassignedClient();
  });

  test('Add Client dialog offers both Create New and Add Existing', async ({ login, page }) => {
    await login('coach');
    await page.getByTestId(TID.coachClients).waitFor({ timeout: 25_000 });
    await page.getByTestId(TID.coachAddClient).click();
    await expect(page.getByTestId(TID.addClientChooser)).toBeVisible();
    await expect(page.getByTestId(TID.addChooseCreate)).toBeVisible();
    await expect(page.getByTestId(TID.addChooseExisting)).toBeVisible();
    // Create-New still routes to the unchanged invite panel.
    await page.getByTestId(TID.addChooseCreate).click();
    await expect(page.getByTestId(TID.coachInvitePanel)).toBeVisible();
  });

  test('unknown search shows "No Forma account found" with a Create-New escape hatch', async ({ login, page }) => {
    await login('coach');
    await openAddExisting(page);
    await page.getByTestId(TID.existingSearch).fill(`nobody-${Date.now()}@nowhere.test`);
    await page.getByTestId(TID.existingSearchBtn).click();
    await expect(page.getByTestId(TID.existingNoAccount)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(TID.existingCreateNew)).toBeVisible();
  });

  test('finds an existing client by email and assigns them (CASE 1) with a subscription', async ({ login, page }) => {
    await login('coach');
    await openAddExisting(page);
    await page.getByTestId(TID.existingSearch).fill(clientEmail);
    await page.getByTestId(TID.existingSearchBtn).click();

    // Single match → the result detail opens; it's unassigned → assign panel.
    await expect(page.getByTestId(TID.existingDetail)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(TID.existingAssignPanel)).toBeVisible();
    await page.getByTestId(TID.existingAssignSub).selectOption('custom');
    await page.getByTestId(TID.existingAssign).click();

    // Wait for the assign to COMPLETE before navigating — the sheet closes on
    // success (navigating sooner would abort the in-flight Firestore writes).
    await expect(page.getByTestId(TID.existingDetail)).toBeHidden({ timeout: 20_000 });

    // The client now appears in the coach's roster.
    await page.goto(`/coach?q=${encodeURIComponent(clientName)}`);
    await expect(page.locator(`[data-testid="coach-client-row"]`, { hasText: clientName }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('assignment wrote one relationship + set the coach — and created NO duplicate account', async () => {
    const s = await signInAs('coach');
    const rel = await findCoachClientRel(s.db, s.uid, clientUid);
    expect(rel, 'active relationship written').toBeTruthy();
    expect(rel!.status).toBe('active');
    expect((rel!.subscription as { status?: string } | undefined)?.status, 'subscription set on assign').toBeTruthy();

    const me = await findUserByEmail(s.db, clientEmail);
    expect(me?.assignedCoachId).toBe(s.uid);

    // Exactly ONE identity doc for this email → no duplicate Auth user / account.
    const dupes = await getDocs(query(collection(s.db, 'users'), where('email', '==', clientEmail)));
    expect(dupes.size, 'no duplicate account').toBe(1);
  });

  test('security: a coach cannot self-author a transfer request or claim a foreign client', async () => {
    const s = await signInAs('coach');
    // create with fromCoachId == self is forbidden (request must be ABOUT another coach's client).
    const selfReq = await attempt(() =>
      setDoc(doc(s.db, 'transferRequests', `${s.uid}__${clientUid}`), {
        id: `${s.uid}__${clientUid}`,
        clientId: clientUid,
        fromCoachId: s.uid,
        toCoachId: s.uid,
        reason: 'should fail',
        status: 'pending',
        requestedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    expect(isPermissionDenied(selfReq), 'self-targeted transfer request denied').toBe(true);

    // A coach may only point assignedCoachId at THEMSELVES — never another coach.
    const steal = await attempt(() => setDoc(doc(s.db, 'users', clientUid), { assignedCoachId: 'some-other-coach', updatedAt: Date.now() }, { merge: true }));
    expect(isPermissionDenied(steal), 'cannot assign client to a foreign coach').toBe(true);
  });

  test('the coaching timeline shows the current coach on the client detail', async ({ login, page }) => {
    await login('coach');
    await page.goto(`/coach?q=${encodeURIComponent(clientName)}`);
    await page.locator(`[data-testid="coach-client-row"]`, { hasText: clientName }).first().click();
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible();
    await expect(page.getByTestId(TID.coachTimeline)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(TID.timelineCurrent)).toBeVisible();
  });

  test('releasing the client keeps the account but frees them to be re-assigned', async ({ login, page }) => {
    await login('coach');
    await page.goto(`/coach?q=${encodeURIComponent(clientName)}`);
    await page.locator(`[data-testid="coach-client-row"]`, { hasText: clientName }).first().click();
    await expect(page.getByTestId(TID.coachClientDetail)).toBeVisible();
    await page.getByTestId(TID.coachManage).click();
    await page.getByTestId(TID.coachReleaseClient).click();
    await page.getByTestId(TID.releaseConfirm).click();

    // Back on the roster — the released client is gone from it.
    await page.getByTestId(TID.coachClients).waitFor({ timeout: 20_000 });

    const s = await signInAs('coach');
    const rel = await findCoachClientRel(s.db, s.uid, clientUid);
    expect(rel!.status, 'relationship ended on release').toBe('ended');
    expect((rel as { endReason?: string }).endReason).toBe('released');
    // Account + identity doc intact; assignment cleared so another coach can pick them up.
    const me = await findUserByEmail(s.db, clientEmail);
    expect(me, 'account preserved after release').toBeTruthy();
    expect(me?.assignedCoachId ?? '').toBe('');
  });
});
