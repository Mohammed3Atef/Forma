# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> UI coverage — admin >> admin routes
- Location: e2e\ui-coverage.spec.ts:115:3

# Error details

```
Error: admin-analytics: console errors
Failed to load resource: the server responded with a status of 429 ()
Failed to load resource: the server responded with a status of 429 ()
Failed to load resource: the server responded with a status of 429 ()
Failed to load resource: the server responded with a status of 429 ()
Failed to load resource: the server responded with a status of 429 ()

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 7

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 429 ()",
+   "Failed to load resource: the server responded with a status of 429 ()",
+   "Failed to load resource: the server responded with a status of 429 ()",
+   "Failed to load resource: the server responded with a status of 429 ()",
+   "Failed to load resource: the server responded with a status of 429 ()",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e6]:
    - img "Forma" [ref=e7]
  - main [ref=e8]:
    - generic [ref=e10]:
      - button "Back" [ref=e11] [cursor=pointer]:
        - img [ref=e12]
      - generic [ref=e14]:
        - generic [ref=e15]: Client details
        - heading "QA UI 1782054666575" [level=1] [ref=e16]
    - heading "Plans" [level=2] [ref=e17]
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]: Workout
        - generic [ref=e21]: No plan assigned — tap to create
      - generic [ref=e22]:
        - generic [ref=e23]: Nutrition
        - generic [ref=e24]: No plan assigned — tap to create
      - generic [ref=e25]:
        - generic [ref=e26]: Cardio
        - generic [ref=e27]: No plan assigned — tap to create
    - generic [ref=e28]:
      - generic [ref=e29]:
        - generic [ref=e30]: —
        - generic [ref=e31]: Calories
      - generic [ref=e32]:
        - generic [ref=e33]: —
        - generic [ref=e34]: Protein
      - generic [ref=e35]:
        - generic [ref=e36]: —
        - generic [ref=e37]: Water
    - heading "Client assessment" [level=2] [ref=e38]
    - generic [ref=e40]:
      - generic [ref=e41]:
        - heading "Basic information" [level=2] [ref=e42]
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]: Full name
            - generic [ref=e46]: QA UI 1782054666575
          - generic [ref=e47]:
            - generic [ref=e48]: Date of birth
            - generic [ref=e49]: 1995-01-01
          - generic [ref=e50]:
            - generic [ref=e51]: Gender
            - generic [ref=e52]: Male
          - generic [ref=e53]:
            - generic [ref=e54]: Height
            - generic [ref=e55]: 178 cm
          - generic [ref=e56]:
            - generic [ref=e57]: Weight
            - generic [ref=e58]: 80 kg
      - generic [ref=e59]:
        - heading "Your goals" [level=2] [ref=e60]
        - generic [ref=e62]:
          - generic [ref=e63]: What is your primary goal?
          - generic [ref=e64]: Body recomposition
      - generic [ref=e65]:
        - heading "Lifestyle" [level=2] [ref=e66]
        - generic [ref=e67]:
          - generic [ref=e68]:
            - generic [ref=e69]: Occupation type
            - generic [ref=e70]: Desk job
          - generic [ref=e71]:
            - generic [ref=e72]: Average sleep
            - generic [ref=e73]: 8 h
          - generic [ref=e74]:
            - generic [ref=e75]: Daily activity level
            - generic [ref=e76]: assessment.activities.moderate
          - generic [ref=e77]:
            - generic [ref=e78]: Training days per week
            - generic [ref=e79]: "4"
      - generic [ref=e80]:
        - heading "Training experience" [level=2] [ref=e81]
        - generic [ref=e82]:
          - generic [ref=e83]:
            - generic [ref=e84]: Training level
            - generic [ref=e85]: Intermediate
          - generic [ref=e86]:
            - generic [ref=e87]: Training location
            - generic [ref=e88]: Commercial gym
      - generic [ref=e89]:
        - heading "Health" [level=2] [ref=e90]
        - generic [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]: Do you have any injuries?
            - generic [ref=e94]: None
          - generic [ref=e95]:
            - generic [ref=e96]: Do you have any medical conditions?
            - generic [ref=e97]: "No"
      - generic [ref=e98]:
        - heading "Nutrition" [level=2] [ref=e99]
        - generic [ref=e100]:
          - generic [ref=e101]:
            - generic [ref=e102]: Foods you like
            - generic [ref=e103]: —
          - generic [ref=e104]:
            - generic [ref=e105]: Foods you dislike
            - generic [ref=e106]: —
          - generic [ref=e107]:
            - generic [ref=e108]: Food allergies
            - generic [ref=e109]: —
          - generic [ref=e110]:
            - generic [ref=e111]: Foods you don't want to give up
            - generic [ref=e112]: —
          - generic [ref=e113]:
            - generic [ref=e114]: Food budget
            - generic [ref=e115]: Medium budget
          - generic [ref=e116]:
            - generic [ref=e117]: Preferred meals per day
            - generic [ref=e118]: "3"
      - generic [ref=e119]:
        - heading "Motivation" [level=2] [ref=e120]
        - generic [ref=e121]:
          - generic [ref=e122]:
            - generic [ref=e123]: Your biggest challenge
            - generic [ref=e124]: Consistency
          - generic [ref=e125]:
            - generic [ref=e126]: How committed are you to reaching your goal?
            - generic [ref=e127]: 8/10
    - heading "Client activity" [level=2] [ref=e128]
    - generic [ref=e129]:
      - button "Previous day" [ref=e130] [cursor=pointer]:
        - img [ref=e131]
      - generic [ref=e134]: Today
      - button "Next day" [disabled] [ref=e135]:
        - img [ref=e136]
    - generic [ref=e138]:
      - generic [ref=e139]:
        - heading "Workout" [level=2] [ref=e140]
        - generic [ref=e141]: No workout logged this day
      - generic [ref=e142]:
        - heading "Nutrition" [level=2] [ref=e143]
        - generic [ref=e144]: No meals logged this day
      - generic [ref=e145]:
        - heading "Activity & body" [level=2] [ref=e146]
        - generic [ref=e147]:
          - generic [ref=e148]:
            - img [ref=e150]
            - generic [ref=e152]: "0"
            - generic [ref=e153]: Steps
          - generic [ref=e154]:
            - img [ref=e156]
            - generic [ref=e158]: 0min
            - generic [ref=e159]: Cardio
          - generic [ref=e160]:
            - img [ref=e162]
            - generic [ref=e164]: 0ml
            - generic [ref=e165]: Water
          - generic [ref=e166]:
            - img [ref=e168]
            - generic [ref=e170]: —
            - generic [ref=e171]: Last weight
  - navigation [ref=e172]:
    - list [ref=e173]:
      - listitem [ref=e174]:
        - link "Overview" [ref=e175] [cursor=pointer]:
          - /url: /admin
          - img [ref=e177]
          - generic [ref=e179]: Overview
      - listitem [ref=e180]:
        - link "Accounts" [ref=e181] [cursor=pointer]:
          - /url: /admin/accounts
          - img [ref=e183]
          - generic [ref=e185]: Accounts
      - listitem [ref=e186]:
        - link "Assign" [ref=e187] [cursor=pointer]:
          - /url: /admin/assignments
          - img [ref=e189]
          - generic [ref=e191]: Assign
      - listitem [ref=e192]:
        - link "Settings" [ref=e193] [cursor=pointer]:
          - /url: /admin/governance
          - img [ref=e195]
          - generic [ref=e197]: Settings
      - listitem [ref=e198]:
        - link "Analytics" [ref=e199] [cursor=pointer]:
          - /url: /admin/analytics
          - img [ref=e201]
          - generic [ref=e203]: Analytics
      - listitem [ref=e204]:
        - link "Images" [ref=e205] [cursor=pointer]:
          - /url: /admin/media
          - img [ref=e207]
          - generic [ref=e209]: Images
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
> 43  |   expect.soft(findings.consoleErrors, `${spec.label}: console errors\n${findings.consoleErrors.join('\n')}`).toEqual([]);
      |                                                                                                              ^ Error: admin-analytics: console errors
  44  |   expect.soft(findings.missingTranslations, `${spec.label}: raw i18n keys leaked\n${findings.missingTranslations.join(', ')}`).toEqual([]);
  45  |   expect.soft(findings.horizontalOverflowPx, `${spec.label}: horizontal scroll ${findings.horizontalOverflowPx}px`).toBeLessThanOrEqual(2);
  46  |   if (spec.expectNav) {
  47  |     expect.soft(await page.getByTestId(TID.bottomNav).isVisible(), `${spec.label}: bottom nav missing`).toBe(true);
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