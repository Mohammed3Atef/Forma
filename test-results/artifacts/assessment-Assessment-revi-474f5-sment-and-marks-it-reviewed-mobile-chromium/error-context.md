# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assessment.spec.ts >> Assessment review loop >> coach sees the submitted assessment and marks it reviewed
- Location: e2e\assessment.spec.ts:77:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "reviewed"
Received: "submitted"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - img "Forma" [ref=e5]
  - main [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]:
        - button "Back" [ref=e9] [cursor=pointer]:
          - img [ref=e10]
        - generic [ref=e12]:
          - generic [ref=e13]: Coach portal
          - heading "Client assessment" [level=1] [ref=e14]
      - generic [ref=e15]: Reviewed
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e19]: Low activity
        - generic [ref=e20]:
          - heading "Basic information" [level=2] [ref=e21]
          - generic [ref=e22]:
            - generic [ref=e23]:
              - generic [ref=e24]: Full name
              - generic [ref=e25]: QA Assess 1781615251322
            - generic [ref=e26]:
              - generic [ref=e27]: Date of birth
              - generic [ref=e28]: 1995-06-15
            - generic [ref=e29]:
              - generic [ref=e30]: Gender
              - generic [ref=e31]: Male
            - generic [ref=e32]:
              - generic [ref=e33]: Height
              - generic [ref=e34]: 180 cm
            - generic [ref=e35]:
              - generic [ref=e36]: Weight
              - generic [ref=e37]: 82 kg
        - generic [ref=e38]:
          - heading "Your goals" [level=2] [ref=e39]
          - generic [ref=e41]:
            - generic [ref=e42]: What is your primary goal?
            - generic [ref=e43]: Fat loss
        - generic [ref=e44]:
          - heading "Lifestyle" [level=2] [ref=e45]
          - generic [ref=e46]:
            - generic [ref=e47]:
              - generic [ref=e48]: Occupation type
              - generic [ref=e49]: Desk job
            - generic [ref=e50]:
              - generic [ref=e51]: Average sleep
              - generic [ref=e52]: 8 h
            - generic [ref=e53]:
              - generic [ref=e54]: Daily activity level
              - generic [ref=e55]: Sedentary
            - generic [ref=e56]:
              - generic [ref=e57]: Training days per week
              - generic [ref=e58]: "3"
        - generic [ref=e59]:
          - heading "Training experience" [level=2] [ref=e60]
          - generic [ref=e61]:
            - generic [ref=e62]:
              - generic [ref=e63]: Training level
              - generic [ref=e64]: Beginner
            - generic [ref=e65]:
              - generic [ref=e66]: Training location
              - generic [ref=e67]: Commercial gym
        - generic [ref=e68]:
          - heading "Health" [level=2] [ref=e69]
          - generic [ref=e70]:
            - generic [ref=e71]:
              - generic [ref=e72]: Do you have any injuries?
              - generic [ref=e73]: None
            - generic [ref=e74]:
              - generic [ref=e75]: Do you have any medical conditions?
              - generic [ref=e76]: "No"
        - generic [ref=e77]:
          - heading "Nutrition" [level=2] [ref=e78]
          - generic [ref=e79]:
            - generic [ref=e80]:
              - generic [ref=e81]: Foods you like
              - generic [ref=e82]: —
            - generic [ref=e83]:
              - generic [ref=e84]: Foods you dislike
              - generic [ref=e85]: —
            - generic [ref=e86]:
              - generic [ref=e87]: Food allergies
              - generic [ref=e88]: —
            - generic [ref=e89]:
              - generic [ref=e90]: Foods you don't want to give up
              - generic [ref=e91]: —
            - generic [ref=e92]:
              - generic [ref=e93]: Food budget
              - generic [ref=e94]: Medium budget
            - generic [ref=e95]:
              - generic [ref=e96]: Preferred meals per day
              - generic [ref=e97]: "3"
        - generic [ref=e98]:
          - heading "Motivation" [level=2] [ref=e99]
          - generic [ref=e100]:
            - generic [ref=e101]:
              - generic [ref=e102]: Your biggest challenge
              - generic [ref=e103]: Consistency
            - generic [ref=e104]:
              - generic [ref=e105]: How committed are you to reaching your goal?
              - generic [ref=e106]: 7/10
      - generic [ref=e107]:
        - heading "Coach review notes" [level=2] [ref=e108]
        - textbox "Notes for yourself about this client's assessment…" [ref=e109]: Solid baseline — start hypertrophy block.
        - button "Save" [disabled] [ref=e110]
      - generic [ref=e111]:
        - button "Reset assessment" [ref=e112] [cursor=pointer]
        - generic [ref=e113]:
          - img [ref=e114]
          - text: Reviewed
      - generic [ref=e116]:
        - heading "Build plan from assessment" [level=2] [ref=e117]
        - generic [ref=e118]:
          - button "Build workout plan" [ref=e119] [cursor=pointer]:
            - img [ref=e121]
            - generic [ref=e123]: Build workout plan
            - img [ref=e124]
          - button "Build nutrition plan" [ref=e126] [cursor=pointer]:
            - img [ref=e128]
            - generic [ref=e130]: Build nutrition plan
            - img [ref=e131]
          - button "Build cardio plan" [ref=e133] [cursor=pointer]:
            - img [ref=e135]
            - generic [ref=e137]: Build cardio plan
            - img [ref=e138]
  - navigation [ref=e140]:
    - list [ref=e141]:
      - listitem [ref=e142]:
        - link "Clients" [ref=e143] [cursor=pointer]:
          - /url: /coach
          - img [ref=e145]
          - generic [ref=e147]: Clients
      - listitem [ref=e148]:
        - link "Library" [ref=e149] [cursor=pointer]:
          - /url: /coach/library
          - img [ref=e151]
          - generic [ref=e153]: Library
      - listitem [ref=e154]:
        - link "Templates" [ref=e155] [cursor=pointer]:
          - /url: /coach/templates
          - img [ref=e157]
          - generic [ref=e159]: Templates
      - listitem [ref=e160]:
        - link "Adherence" [ref=e161] [cursor=pointer]:
          - /url: /coach/adherence
          - img [ref=e163]
          - generic [ref=e165]: Adherence
      - listitem [ref=e166]:
        - link "Messages" [ref=e167] [cursor=pointer]:
          - /url: /coach/messages
          - img [ref=e169]
          - generic [ref=e171]: Messages
      - listitem [ref=e172]:
        - link "Account" [ref=e173] [cursor=pointer]:
          - /url: /coach/settings
          - img [ref=e175]
          - generic [ref=e177]: Account
```

# Test source

```ts
  1   | import { test, expect, type Page } from './fixtures/test';
  2   | import { TID } from './fixtures/selectors';
  3   | import { signInAs, signInWith, readDoc, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
  4   | import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';
  5   | 
  6   | /**
  7   |  * ASSESSMENT REVIEW LOOP — a fresh client (no seeded assessment) walks the
  8   |  * wizard: saves a draft (status `in_progress`), then submits (status
  9   |  * `submitted`, gate clears). The coach reviews it (`reviewed` + reviewedBy);
  10  |  * admin is read-only; the client cannot edit a reviewed assessment until the
  11  |  * coach resets it (status back to `in_progress`).
  12  |  */
  13  | 
  14  | const PW = 'Assess123456!';
  15  | let client: NewClient;
  16  | 
  17  | const PATH = (uid: string): [string, string, string, string] => ['clientData', uid, 'profile', 'assessment'];
  18  | 
  19  | interface Assessment { status?: string; completed?: boolean; reviewedBy?: string | null; coachNotes?: string }
  20  | 
  21  | test.beforeAll(async () => {
  22  |   const coach = await signInAs('coach');
  23  |   try {
  24  |     client = await createClientViaApi(coach, {
  25  |       email: uniqueEmail('qa-assess'),
  26  |       password: PW,
  27  |       displayName: `QA Assess ${Date.now()}`,
  28  |       seedAssessment: false, // start at not_started so the wizard shows
  29  |     });
  30  |   } finally {
  31  |     await coach.close();
  32  |   }
  33  | });
  34  | 
  35  | async function readStatus(): Promise<Assessment | null> {
  36  |   const s = await signInWith(client.email, client.password);
  37  |   try {
  38  |     return await readDoc<Assessment>(s.db, PATH(client.uid));
  39  |   } finally {
  40  |     await s.close();
  41  |   }
  42  | }
  43  | 
  44  | test.describe.serial('Assessment review loop', () => {
  45  |   test('client walks the wizard, saves a draft, then submits', async ({ page, loginWith }) => {
  46  |     await loginWith(client.email, client.password);
  47  |     await expect(page.getByTestId(TID.assessmentWizard)).toBeVisible({ timeout: 30_000 });
  48  | 
  49  |     // Step 0 — basic info (fullName prefilled with the display name).
  50  |     await page.getByTestId('a-dob').fill('1995-06-15');
  51  |     await page.getByTestId('a-height').fill('180');
  52  |     await page.getByTestId('a-weight').fill('82');
  53  | 
  54  |     // Save a draft → Firestore doc becomes in_progress.
  55  |     await page.getByTestId(TID.assessmentSaveProgress).click();
  56  |     await expect.poll(async () => (await readStatus())?.status, { timeout: 15_000 }).toBe('in_progress');
  57  | 
  58  |     // Advance to the end. Steps 1-3 are valid by default; step 4 needs an answer.
  59  |     await page.getByTestId(TID.assessmentNext).click(); // → 1 goals
  60  |     await page.getByTestId(TID.assessmentNext).click(); // → 2 lifestyle
  61  |     await page.getByTestId(TID.assessmentNext).click(); // → 3 training
  62  |     await page.getByTestId(TID.assessmentNext).click(); // → 4 health
  63  |     await page.getByTestId('a-no-injuries').click();
  64  |     await page.getByTestId(TID.assessmentNext).click(); // → 5 nutrition
  65  |     await page.getByTestId(TID.assessmentNext).click(); // → 6 motivation
  66  |     await page.getByTestId(TID.assessmentNext).click(); // → 7 photos (last)
  67  |     await page.getByTestId(TID.assessmentSubmit).click();
  68  | 
  69  |     // Done screen → dashboard; gate is now cleared.
  70  |     await expect(page.getByTestId('assessment-done')).toBeVisible({ timeout: 20_000 });
  71  |     await page.getByTestId(TID.assessmentGoDashboard).click();
  72  |     await expect(page.getByTestId(TID.navItem('home'))).toBeVisible({ timeout: 25_000 });
  73  | 
  74  |     expect((await readStatus())?.status).toBe('submitted');
  75  |   });
  76  | 
  77  |   test('coach sees the submitted assessment and marks it reviewed', async ({ page, login }) => {
  78  |     await login('coach');
  79  |     await openAssessment(page);
  80  |     await expect(page.getByTestId(TID.assessmentStatusPill)).toHaveText(/submitted/i);
  81  | 
  82  |     // Leave a review note, then mark reviewed.
  83  |     await page.getByTestId(TID.assessmentCoachNotes).fill('Solid baseline — start hypertrophy block.');
  84  |     await page.getByTestId(TID.assessmentSaveNotes).click();
  85  |     await page.getByTestId(TID.assessmentMarkReviewed).click();
  86  | 
  87  |     const s = await signInAs('coach');
  88  |     try {
  89  |       const a = await readDoc<Assessment>(s.db, PATH(client.uid));
> 90  |       expect(a?.status).toBe('reviewed');
      |                         ^ Error: expect(received).toBe(expected) // Object.is equality
  91  |       expect(a?.reviewedBy).toBe(s.uid);
  92  |       expect(a?.coachNotes).toContain('hypertrophy');
  93  |     } finally {
  94  |       await s.close();
  95  |     }
  96  |   });
  97  | 
  98  |   test('admin can read the assessment but cannot write it', async () => {
  99  |     const s = await signInAs('admin');
  100 |     try {
  101 |       const a = await readDoc<Assessment>(s.db, PATH(client.uid));
  102 |       expect(a, 'admin can read assessment').not.toBeNull();
  103 |       const r = await attempt(() => setDoc(doc(s.db, ...PATH(client.uid)), { coachNotes: 'x' }, { merge: true }));
  104 |       expect(isPermissionDenied(r), `admin assessment write should be denied (got ${r.code ?? 'ok'})`).toBe(true);
  105 |     } finally {
  106 |       await s.close();
  107 |     }
  108 |   });
  109 | 
  110 |   test('client cannot edit a reviewed assessment', async () => {
  111 |     const s = await signInWith(client.email, client.password);
  112 |     try {
  113 |       const r = await attempt(() => setDoc(doc(s.db, ...PATH(client.uid)), { completionPercentage: 50 }, { merge: true }));
  114 |       expect(isPermissionDenied(r), `client editing a reviewed assessment should be denied (got ${r.code ?? 'ok'})`).toBe(true);
  115 |     } finally {
  116 |       await s.close();
  117 |     }
  118 |   });
  119 | 
  120 |   test('coach reset re-opens the assessment for the client', async ({ page, login }) => {
  121 |     await login('coach');
  122 |     await openAssessment(page);
  123 |     await expect(page.getByTestId(TID.assessmentStatusPill)).toHaveText(/reviewed/i);
  124 |     await page.getByTestId(TID.assessmentReset).click();
  125 |     await page.getByTestId(TID.confirmAccept).click();
  126 | 
  127 |     await expect.poll(async () => (await readStatus())?.status, { timeout: 15_000 }).toBe('in_progress');
  128 | 
  129 |     // The client may now edit again (status != reviewed).
  130 |     const s = await signInWith(client.email, client.password);
  131 |     try {
  132 |       const r = await attempt(() => setDoc(doc(s.db, ...PATH(client.uid)), { status: 'in_progress', completionPercentage: 60, updatedAt: 1 }, { merge: true }));
  133 |       expect(r.ok, `client edit after reset should be allowed (got ${r.code ?? 'ok'})`).toBe(true);
  134 |     } finally {
  135 |       await s.close();
  136 |     }
  137 |   });
  138 | });
  139 | 
  140 | async function openAssessment(page: Page): Promise<void> {
  141 |   await page.goto(`/coach/client/${client.uid}/assessment`);
  142 |   await expect(page.getByTestId(TID.coachClientAssessment)).toBeVisible({ timeout: 20_000 });
  143 | }
  144 | 
```