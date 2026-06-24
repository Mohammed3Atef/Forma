import { test, expect, type Page } from './fixtures/test';
import { TID } from './fixtures/selectors';
import { signInAs, signInWith, readDoc, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';

/**
 * ASSESSMENT REVIEW LOOP — a fresh client (no seeded assessment) walks the
 * wizard: saves a draft (status `in_progress`), then submits (status
 * `submitted`, gate clears). The coach reviews it (`reviewed` + reviewedBy);
 * admin is read-only. Living assessment: the client may keep editing their own
 * answers even after review, and a coach `reset` re-opens it (`in_progress`).
 */

const PW = 'Assess123456!';
let client: NewClient;

const PATH = (uid: string): [string, string, string, string] => ['clientData', uid, 'profile', 'assessment'];

interface Assessment { status?: string; completed?: boolean; reviewedBy?: string | null; coachNotes?: string }

test.beforeAll(async () => {
  const coach = await signInAs('coach');
  try {
    client = await createClientViaApi(coach, {
      email: uniqueEmail('qa-assess'),
      password: PW,
      displayName: `QA Assess ${Date.now()}`,
      seedAssessment: false, // start at not_started so the wizard shows
    });
  } finally {
    await coach.close();
  }
});

async function readStatus(): Promise<Assessment | null> {
  const s = await signInWith(client.email, client.password);
  try {
    return await readDoc<Assessment>(s.db, PATH(client.uid));
  } finally {
    await s.close();
  }
}

test.describe.serial('Assessment review loop', () => {
  test('client walks the wizard, saves a draft, then submits', async ({ page, loginWith }) => {
    await loginWith(client.email, client.password);
    await expect(page.getByTestId(TID.assessmentWizard)).toBeVisible({ timeout: 30_000 });

    // Step 0 — basic info (fullName prefilled with the display name).
    await page.getByTestId('a-dob').fill('1995-06-15');
    await page.getByTestId('a-height').fill('180');
    await page.getByTestId('a-weight').fill('82');

    // Save a draft → Firestore doc becomes in_progress.
    await page.getByTestId(TID.assessmentSaveProgress).click();
    await expect.poll(async () => (await readStatus())?.status, { timeout: 15_000 }).toBe('in_progress');

    // Advance to the end. Steps 1-3 are valid by default; step 4 needs an answer.
    await page.getByTestId(TID.assessmentNext).click(); // → 1 goals
    await page.getByTestId(TID.assessmentNext).click(); // → 2 lifestyle
    await page.getByTestId(TID.assessmentNext).click(); // → 3 training
    await page.getByTestId(TID.assessmentNext).click(); // → 4 health
    await page.getByTestId('a-no-injuries').click();
    await page.getByTestId(TID.assessmentNext).click(); // → 5 nutrition
    await page.getByTestId(TID.assessmentNext).click(); // → 6 motivation
    await page.getByTestId(TID.assessmentNext).click(); // → 7 photos (last)
    await page.getByTestId(TID.assessmentSubmit).click();

    // Done screen → dashboard; gate is now cleared.
    await expect(page.getByTestId('assessment-done')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(TID.assessmentGoDashboard).click();
    await expect(page.getByTestId(TID.navItem('home'))).toBeVisible({ timeout: 25_000 });

    expect((await readStatus())?.status).toBe('submitted');
  });

  test('coach sees the submitted assessment and marks it reviewed', async ({ page, login }) => {
    await login('coach');
    await openAssessment(page);
    await expect(page.getByTestId(TID.assessmentStatusPill)).toHaveText(/submitted/i);

    // Leave a review note, then mark reviewed.
    await page.getByTestId(TID.assessmentCoachNotes).fill('Solid baseline — start hypertrophy block.');
    await page.getByTestId(TID.assessmentSaveNotes).click();
    await page.getByTestId(TID.assessmentMarkReviewed).click();

    // The mark-reviewed write is async — poll until it lands before asserting.
    await expect.poll(async () => {
      const s = await signInAs('coach');
      try { return (await readDoc<Assessment>(s.db, PATH(client.uid)))?.status; } finally { await s.close(); }
    }, { timeout: 15_000 }).toBe('reviewed');

    const s = await signInAs('coach');
    try {
      const a = await readDoc<Assessment>(s.db, PATH(client.uid));
      expect(a?.reviewedBy).toBe(s.uid);
      expect(a?.coachNotes).toContain('hypertrophy');
    } finally {
      await s.close();
    }
  });

  test('admin can read the assessment but cannot write it', async () => {
    const s = await signInAs('admin');
    try {
      const a = await readDoc<Assessment>(s.db, PATH(client.uid));
      expect(a, 'admin can read assessment').not.toBeNull();
      const r = await attempt(() => setDoc(doc(s.db, ...PATH(client.uid)), { coachNotes: 'x' }, { merge: true }));
      expect(isPermissionDenied(r), `admin assessment write should be denied (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('client may edit a reviewed assessment (living assessment)', async () => {
    // Living assessment: the client can always edit their own answers, even
    // after the coach reviewed it (the app flips a reviewed doc to
    // 'updated_after_review'). A raw merge that leaves status untouched is
    // allowed by the rules; control fields stay locked.
    const s = await signInWith(client.email, client.password);
    try {
      const r = await attempt(() => setDoc(doc(s.db, ...PATH(client.uid)), { completionPercentage: 50 }, { merge: true }));
      expect(r.ok, `client editing their own assessment should be allowed (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });

  test('coach reset re-opens the assessment for the client', async ({ page, login }) => {
    await login('coach');
    await openAssessment(page);
    await expect(page.getByTestId(TID.assessmentStatusPill)).toHaveText(/reviewed/i);
    await page.getByTestId(TID.assessmentReset).click();
    await page.getByTestId(TID.confirmAccept).click();

    await expect.poll(async () => (await readStatus())?.status, { timeout: 15_000 }).toBe('in_progress');

    // The client may now edit again (status != reviewed).
    const s = await signInWith(client.email, client.password);
    try {
      const r = await attempt(() => setDoc(doc(s.db, ...PATH(client.uid)), { status: 'in_progress', completionPercentage: 60, updatedAt: 1 }, { merge: true }));
      expect(r.ok, `client edit after reset should be allowed (got ${r.code ?? 'ok'})`).toBe(true);
    } finally {
      await s.close();
    }
  });
});

async function openAssessment(page: Page): Promise<void> {
  await page.goto(`/coach/client/${client.uid}/assessment`);
  await expect(page.getByTestId(TID.coachClientAssessment)).toBeVisible({ timeout: 20_000 });
}
