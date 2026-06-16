# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> UI coverage — admin >> admin routes
- Location: e2e\ui-coverage.spec.ts:115:3

# Error details

```
Error: admin-assignments: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: admin-assignments: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: admin-governance: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: admin-client-detail: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - img "Forma" [ref=e5]
  - main [ref=e6]:
    - generic [ref=e8]:
      - button "Back" [ref=e9] [cursor=pointer]:
        - img [ref=e10]
      - generic [ref=e12]:
        - generic [ref=e13]: Client details
        - heading "QA UI 1781620579073" [level=1] [ref=e14]
    - heading "Plans" [level=2] [ref=e15]
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]: Workout
        - generic [ref=e19]: No plan assigned — tap to create
      - generic [ref=e20]:
        - generic [ref=e21]: Nutrition
        - generic [ref=e22]: No plan assigned — tap to create
      - generic [ref=e23]:
        - generic [ref=e24]: Cardio
        - generic [ref=e25]: No plan assigned — tap to create
    - generic [ref=e26]:
      - generic [ref=e27]:
        - generic [ref=e28]: —
        - generic [ref=e29]: Water
      - generic [ref=e30]:
        - generic [ref=e31]: —
        - generic [ref=e32]: Steps
      - generic [ref=e33]:
        - generic [ref=e34]: —
        - generic [ref=e35]: Cardio
    - heading "Client assessment" [level=2] [ref=e36]
    - generic [ref=e38]:
      - generic [ref=e39]:
        - heading "Basic information" [level=2] [ref=e40]
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]: Full name
            - generic [ref=e44]: QA UI 1781620579073
          - generic [ref=e45]:
            - generic [ref=e46]: Date of birth
            - generic [ref=e47]: 1995-01-01
          - generic [ref=e48]:
            - generic [ref=e49]: Gender
            - generic [ref=e50]: Male
          - generic [ref=e51]:
            - generic [ref=e52]: Height
            - generic [ref=e53]: 178 cm
          - generic [ref=e54]:
            - generic [ref=e55]: Weight
            - generic [ref=e56]: 80 kg
      - generic [ref=e57]:
        - heading "Your goals" [level=2] [ref=e58]
        - generic [ref=e60]:
          - generic [ref=e61]: What is your primary goal?
          - generic [ref=e62]: Body recomposition
      - generic [ref=e63]:
        - heading "Lifestyle" [level=2] [ref=e64]
        - generic [ref=e65]:
          - generic [ref=e66]:
            - generic [ref=e67]: Occupation type
            - generic [ref=e68]: Desk job
          - generic [ref=e69]:
            - generic [ref=e70]: Average sleep
            - generic [ref=e71]: 8 h
          - generic [ref=e72]:
            - generic [ref=e73]: Daily activity level
            - generic [ref=e74]: assessment.activities.moderate
          - generic [ref=e75]:
            - generic [ref=e76]: Training days per week
            - generic [ref=e77]: "4"
      - generic [ref=e78]:
        - heading "Training experience" [level=2] [ref=e79]
        - generic [ref=e80]:
          - generic [ref=e81]:
            - generic [ref=e82]: Training level
            - generic [ref=e83]: Intermediate
          - generic [ref=e84]:
            - generic [ref=e85]: Training location
            - generic [ref=e86]: Commercial gym
      - generic [ref=e87]:
        - heading "Health" [level=2] [ref=e88]
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]: Do you have any injuries?
            - generic [ref=e92]: None
          - generic [ref=e93]:
            - generic [ref=e94]: Do you have any medical conditions?
            - generic [ref=e95]: "No"
      - generic [ref=e96]:
        - heading "Nutrition" [level=2] [ref=e97]
        - generic [ref=e98]:
          - generic [ref=e99]:
            - generic [ref=e100]: Foods you like
            - generic [ref=e101]: —
          - generic [ref=e102]:
            - generic [ref=e103]: Foods you dislike
            - generic [ref=e104]: —
          - generic [ref=e105]:
            - generic [ref=e106]: Food allergies
            - generic [ref=e107]: —
          - generic [ref=e108]:
            - generic [ref=e109]: Foods you don't want to give up
            - generic [ref=e110]: —
          - generic [ref=e111]:
            - generic [ref=e112]: Food budget
            - generic [ref=e113]: Medium budget
          - generic [ref=e114]:
            - generic [ref=e115]: Preferred meals per day
            - generic [ref=e116]: "3"
      - generic [ref=e117]:
        - heading "Motivation" [level=2] [ref=e118]
        - generic [ref=e119]:
          - generic [ref=e120]:
            - generic [ref=e121]: Your biggest challenge
            - generic [ref=e122]: Consistency
          - generic [ref=e123]:
            - generic [ref=e124]: How committed are you to reaching your goal?
            - generic [ref=e125]: 8/10
    - heading "Client activity" [level=2] [ref=e126]
    - generic [ref=e127]:
      - button "Previous day" [ref=e128] [cursor=pointer]:
        - img [ref=e129]
      - generic [ref=e132]: Today
      - button "Next day" [disabled] [ref=e133]:
        - img [ref=e134]
    - generic [ref=e136]:
      - generic [ref=e137]:
        - heading "Workout" [level=2] [ref=e138]
        - generic [ref=e139]: No workout logged this day
      - generic [ref=e140]:
        - heading "Nutrition" [level=2] [ref=e141]
        - generic [ref=e142]: No meals logged this day
      - generic [ref=e143]:
        - heading "Activity & body" [level=2] [ref=e144]
        - generic [ref=e145]:
          - generic [ref=e146]:
            - img [ref=e148]
            - generic [ref=e150]: "0"
            - generic [ref=e151]: Steps
          - generic [ref=e152]:
            - img [ref=e154]
            - generic [ref=e156]: 0min
            - generic [ref=e157]: Cardio
          - generic [ref=e158]:
            - img [ref=e160]
            - generic [ref=e162]: 0ml
            - generic [ref=e163]: Water
          - generic [ref=e164]:
            - img [ref=e166]
            - generic [ref=e168]: —
            - generic [ref=e169]: Last weight
  - navigation [ref=e170]:
    - list [ref=e171]:
      - listitem [ref=e172]:
        - link "Overview" [ref=e173] [cursor=pointer]:
          - /url: /admin
          - img [ref=e175]
          - generic [ref=e177]: Overview
      - listitem [ref=e178]:
        - link "Accounts" [ref=e179] [cursor=pointer]:
          - /url: /admin/accounts
          - img [ref=e181]
          - generic [ref=e183]: Accounts
      - listitem [ref=e184]:
        - link "Assign" [ref=e185] [cursor=pointer]:
          - /url: /admin/assignments
          - img [ref=e187]
          - generic [ref=e189]: Assign
      - listitem [ref=e190]:
        - link "Settings" [ref=e191] [cursor=pointer]:
          - /url: /admin/governance
          - img [ref=e193]
          - generic [ref=e195]: Settings
      - listitem [ref=e196]:
        - link "Analytics" [ref=e197] [cursor=pointer]:
          - /url: /admin/analytics
          - img [ref=e199]
          - generic [ref=e201]: Analytics
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
> 42  |   expect.soft(findings.rendered, `${spec.label}: page crashed / rendered empty`).toBe(true);
      |                                                                                  ^ Error: admin-client-detail: page crashed / rendered empty
  43  |   expect.soft(findings.consoleErrors, `${spec.label}: console errors\n${findings.consoleErrors.join('\n')}`).toEqual([]);
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