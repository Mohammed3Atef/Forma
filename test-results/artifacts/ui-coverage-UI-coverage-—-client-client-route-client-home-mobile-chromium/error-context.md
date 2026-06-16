# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> UI coverage — client >> client route: client-home
- Location: e2e\ui-coverage.spec.ts:74:5

# Error details

```
Error: client-home: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: client-home: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - img "Forma" [ref=e5]
    - heading "Welcome" [level=1] [ref=e6]
    - paragraph [ref=e7]: Set up your profile to get started, or sign in to restore your data.
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]: Name
        - textbox "Name" [ref=e11]: QA UI 1781620501209
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: Weight (kg)
          - textbox "Weight (kg)" [ref=e15]
        - generic [ref=e16]:
          - generic [ref=e17]: Height (cm)
          - textbox "Height (cm)" [ref=e18]
        - generic [ref=e19]:
          - generic [ref=e20]: Age
          - textbox "Age" [ref=e21]
      - button "Get started" [disabled] [ref=e22]
  - generic [ref=e23]:
    - banner [ref=e24]:
      - img "Forma" [ref=e25]
    - main [ref=e26]:
      - generic [ref=e27]:
        - button "previous day" [ref=e28] [cursor=pointer]:
          - img [ref=e29]
        - generic [ref=e31] [cursor=pointer]:
          - generic [ref=e32]: Today
          - textbox "pick date" [ref=e33]: 2026-06-16
        - button "next day" [disabled] [ref=e34]:
          - img [ref=e35]
      - generic [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]:
            - paragraph [ref=e40]: Tuesday, June 16
            - heading "Good afternoon, QA UI 1781620501209." [level=1] [ref=e41]:
              - text: Good afternoon,
              - generic [ref=e42]: QA UI 1781620501209.
          - generic [ref=e43]:
            - button "Profile" [ref=e44] [cursor=pointer]: QU
            - generic [ref=e45]:
              - img [ref=e46]
              - text: Syncing…
        - generic [ref=e48]:
          - img [ref=e50]
          - paragraph [ref=e52]: Waiting for your coach to assign your plan.
        - button "0/5 Weekly goal 5 workouts to go this week 0" [ref=e53] [cursor=pointer]:
          - generic [ref=e54]:
            - img [ref=e55]
            - generic [ref=e59]: 0/5
          - generic [ref=e60]:
            - heading "Weekly goal" [level=2] [ref=e61]
            - paragraph [ref=e62]: 5 workouts to go this week
          - generic "Best workout streak" [ref=e63]:
            - img [ref=e64]
            - generic [ref=e66]: "0"
          - img [ref=e67]
        - heading "This week" [level=2] [ref=e70]
        - generic [ref=e71]:
          - generic [ref=e72]:
            - img [ref=e74]
            - generic [ref=e76]: "0"
            - generic [ref=e77]: Workouts
          - generic [ref=e78]:
            - img [ref=e80]
            - generic [ref=e82]: "0"
            - generic [ref=e83]: Sets logged
          - generic [ref=e84]:
            - img [ref=e86]
            - generic [ref=e88]: 0.0t
            - generic [ref=e89]: Volume
          - generic [ref=e90]:
            - img [ref=e92]
            - generic [ref=e94]: 0m
            - generic [ref=e95]: Time
        - button "Start empty workout" [ref=e96] [cursor=pointer]:
          - img [ref=e97]
          - text: Start empty workout
    - navigation [ref=e99]:
      - list [ref=e100]:
        - listitem [ref=e101]:
          - link "Home" [ref=e102] [cursor=pointer]:
            - /url: /
            - img [ref=e104]
            - generic [ref=e106]: Home
        - listitem [ref=e107]:
          - link "Workout" [ref=e108] [cursor=pointer]:
            - /url: /workout
            - img [ref=e110]
            - generic [ref=e112]: Workout
        - listitem [ref=e113]:
          - link "Nutrition" [ref=e114] [cursor=pointer]:
            - /url: /nutrition
            - img [ref=e116]
            - generic [ref=e118]: Nutrition
        - listitem [ref=e119]:
          - link "Cardio" [ref=e120] [cursor=pointer]:
            - /url: /cardio
            - img [ref=e122]
            - generic [ref=e124]: Cardio
        - listitem [ref=e125]:
          - link "Progress" [ref=e126] [cursor=pointer]:
            - /url: /progress
            - img [ref=e128]
            - generic [ref=e130]: Progress
        - listitem [ref=e131]:
          - link "Settings" [ref=e132] [cursor=pointer]:
            - /url: /settings
            - img [ref=e134]
            - generic [ref=e136]: Settings
```

# Test source

```ts
  1   | import { test, expect, type Page } from './fixtures/test';
  2   | import type { ConsoleCapture } from './fixtures/test';
  3   | import { TID } from './fixtures/selectors';
  4   | import { auditPage } from './fixtures/audit';
  5   | import { signInAs } from './fixtures/firestore';
  6   | import { createClientViaApi, uniqueEmail, type NewClient } from './fixtures/factory';
  7   | 
  8   | /**
  9   |  * UI COVERAGE — visit every major route on a mobile viewport and smoke-test it:
  10  |  * renders without crash, no console errors, no raw i18n keys, no horizontal
  11  |  * scroll, bottom nav present where expected, and at least one primary action.
  12  |  * Findings are collected (soft) so one page reports every problem it has.
  13  |  */
  14  | 
  15  | let client: NewClient;
  16  | 
  17  | test.beforeAll(async () => {
  18  |   const coach = await signInAs('coach');
  19  |   try {
  20  |     client = await createClientViaApi(coach, { email: uniqueEmail('qa-ui'), password: 'Ui123456!', displayName: `QA UI ${Date.now()}` });
  21  |   } finally {
  22  |     await coach.close();
  23  |   }
  24  | });
  25  | 
  26  | interface RouteSpec {
  27  |   route: string;
  28  |   label: string;
  29  |   expectNav?: boolean;
  30  | }
  31  | 
  32  | async function smoke(page: Page, capture: ConsoleCapture, spec: RouteSpec): Promise<void> {
  33  |   // Reset captured console between routes so attribution is per-page.
  34  |   capture.errors.length = 0;
  35  |   capture.warnings.length = 0;
  36  |   await page.goto(spec.route);
  37  |   await page.waitForTimeout(600); // let lazy data + loading states resolve
  38  | 
  39  |   const findings = await auditPage(page, spec.route, capture);
  40  |   await test.info().attach(`audit-${spec.label}`, { body: JSON.stringify(findings, null, 2), contentType: 'application/json' });
  41  | 
  42  |   expect.soft(findings.rendered, `${spec.label}: page crashed / rendered empty`).toBe(true);
  43  |   expect.soft(findings.consoleErrors, `${spec.label}: console errors\n${findings.consoleErrors.join('\n')}`).toEqual([]);
  44  |   expect.soft(findings.missingTranslations, `${spec.label}: raw i18n keys leaked\n${findings.missingTranslations.join(', ')}`).toEqual([]);
  45  |   expect.soft(findings.horizontalOverflowPx, `${spec.label}: horizontal scroll ${findings.horizontalOverflowPx}px`).toBeLessThanOrEqual(2);
  46  |   if (spec.expectNav) {
> 47  |     expect.soft(await page.getByTestId(TID.bottomNav).isVisible(), `${spec.label}: bottom nav missing`).toBe(true);
      |                                                                                                         ^ Error: client-home: bottom nav missing
  48  |   }
  49  | }
  50  | 
  51  | test.describe('UI coverage — auth', () => {
  52  |   test('login screen renders cleanly', async ({ page, consoleErrors }) => {
  53  |     await smoke(page, consoleErrors, { route: '/', label: 'login' });
  54  |     await expect(page.getByTestId(TID.loginForm)).toBeVisible();
  55  |   });
  56  | });
  57  | 
  58  | test.describe('UI coverage — client', () => {
  59  |   test.beforeEach(async ({ loginWith, page }) => {
  60  |     await loginWith(client.email, client.password);
  61  |     await page.getByTestId(TID.navItem('home')).waitFor({ timeout: 25_000 });
  62  |   });
  63  | 
  64  |   const routes: RouteSpec[] = [
  65  |     { route: '/', label: 'client-home', expectNav: true },
  66  |     { route: '/workout', label: 'client-workout', expectNav: true },
  67  |     { route: '/nutrition', label: 'client-nutrition', expectNav: true },
  68  |     { route: '/cardio', label: 'client-cardio', expectNav: true },
  69  |     { route: '/progress', label: 'client-progress', expectNav: true },
  70  |     { route: '/settings', label: 'client-settings', expectNav: true },
  71  |   ];
  72  | 
  73  |   for (const spec of routes) {
  74  |     test(`client route: ${spec.label}`, async ({ page, consoleErrors }) => {
  75  |       await smoke(page, consoleErrors, spec);
  76  |     });
  77  |   }
  78  | });
  79  | 
  80  | test.describe('UI coverage — coach', () => {
  81  |   test.beforeEach(async ({ login, page }) => {
  82  |     await login('coach');
  83  |     await page.getByTestId(TID.coachClients).waitFor({ timeout: 25_000 });
  84  |   });
  85  | 
  86  |   test('coach static routes', async ({ page, consoleErrors }) => {
  87  |     const routes: RouteSpec[] = [
  88  |       { route: '/coach', label: 'coach-clients', expectNav: true },
  89  |       { route: '/coach/library', label: 'coach-library', expectNav: true },
  90  |       { route: '/coach/templates', label: 'coach-templates', expectNav: true },
  91  |       { route: '/coach/adherence', label: 'coach-adherence', expectNav: true },
  92  |       { route: '/coach/messages', label: 'coach-messages', expectNav: true },
  93  |       { route: '/coach/settings', label: 'coach-settings', expectNav: true },
  94  |     ];
  95  |     for (const spec of routes) await smoke(page, consoleErrors, spec);
  96  |   });
  97  | 
  98  |   test('coach client detail + editors', async ({ page, consoleErrors }) => {
  99  |     const routes: RouteSpec[] = [
  100 |       { route: `/coach/client/${client.uid}`, label: 'coach-client-detail' },
  101 |       { route: `/coach/client/${client.uid}/workout`, label: 'coach-workout-editor' },
  102 |       { route: `/coach/client/${client.uid}/nutrition`, label: 'coach-nutrition-editor' },
  103 |       { route: `/coach/client/${client.uid}/cardio`, label: 'coach-cardio-editor' },
  104 |     ];
  105 |     for (const spec of routes) await smoke(page, consoleErrors, spec);
  106 |   });
  107 | });
  108 | 
  109 | test.describe('UI coverage — admin', () => {
  110 |   test.beforeEach(async ({ login, page }) => {
  111 |     await login('super_admin');
  112 |     await page.getByTestId(TID.adminOverview).waitFor({ timeout: 25_000 });
  113 |   });
  114 | 
  115 |   test('admin routes', async ({ page, consoleErrors }) => {
  116 |     const routes: RouteSpec[] = [
  117 |       { route: '/admin', label: 'admin-overview', expectNav: true },
  118 |       { route: '/admin/accounts', label: 'admin-accounts', expectNav: true },
  119 |       { route: '/admin/assignments', label: 'admin-assignments', expectNav: true },
  120 |       { route: '/admin/governance', label: 'admin-governance', expectNav: true },
  121 |       { route: '/admin/analytics', label: 'admin-analytics', expectNav: true },
  122 |       { route: `/admin/clients/${client.uid}`, label: 'admin-client-detail' },
  123 |     ];
  124 |     for (const spec of routes) await smoke(page, consoleErrors, spec);
  125 |   });
  126 | });
  127 | 
```