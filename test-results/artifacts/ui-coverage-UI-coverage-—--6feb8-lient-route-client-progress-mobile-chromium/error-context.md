# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> UI coverage — client >> client route: client-progress
- Location: e2e\ui-coverage.spec.ts:74:5

# Error details

```
Error: client-progress: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: client-progress: bottom nav missing

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
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e10]:
          - generic [ref=e11]: Your numbers
          - heading "Progress" [level=1] [ref=e12]
        - button "History" [ref=e13] [cursor=pointer]:
          - img [ref=e14]
      - generic [ref=e16]:
        - button "Overview" [ref=e17] [cursor=pointer]
        - button "Records" [ref=e18] [cursor=pointer]
        - button "Body" [ref=e19] [cursor=pointer]
      - generic [ref=e20]:
        - generic [ref=e21]:
          - generic [ref=e22]:
            - generic [ref=e23]: Weekly volume
            - generic [ref=e24]: last 8 weeks
          - generic [ref=e25]:
            - generic [ref=e28]: "-7w"
            - generic [ref=e31]: "-6w"
            - generic [ref=e34]: "-5w"
            - generic [ref=e37]: "-4w"
            - generic [ref=e40]: "-3w"
            - generic [ref=e43]: "-2w"
            - generic [ref=e46]: "-1w"
            - generic [ref=e49]: Now
        - generic [ref=e50]:
          - generic [ref=e51]:
            - img [ref=e53]
            - generic [ref=e55]: 0t
            - generic [ref=e56]: Total volume
          - generic [ref=e57]:
            - img [ref=e59]
            - generic [ref=e61]: "0"
            - generic [ref=e62]: Workouts
          - generic [ref=e63]:
            - img [ref=e65]
            - generic [ref=e67]: 0m
            - generic [ref=e68]: Avg duration
          - generic [ref=e69]:
            - img [ref=e71]
            - generic [ref=e73]: "0"
            - generic [ref=e74]: Total sets
  - navigation [ref=e75]:
    - list [ref=e76]:
      - listitem [ref=e77]:
        - link "Home" [ref=e78] [cursor=pointer]:
          - /url: /
          - img [ref=e80]
          - generic [ref=e82]: Home
      - listitem [ref=e83]:
        - link "Workout" [ref=e84] [cursor=pointer]:
          - /url: /workout
          - img [ref=e86]
          - generic [ref=e88]: Workout
      - listitem [ref=e89]:
        - link "Nutrition" [ref=e90] [cursor=pointer]:
          - /url: /nutrition
          - img [ref=e92]
          - generic [ref=e94]: Nutrition
      - listitem [ref=e95]:
        - link "Cardio" [ref=e96] [cursor=pointer]:
          - /url: /cardio
          - img [ref=e98]
          - generic [ref=e100]: Cardio
      - listitem [ref=e101]:
        - link "Progress" [ref=e102] [cursor=pointer]:
          - /url: /progress
          - img [ref=e104]
          - generic [ref=e106]: Progress
      - listitem [ref=e107]:
        - link "Settings" [ref=e108] [cursor=pointer]:
          - /url: /settings
          - img [ref=e110]
          - generic [ref=e112]: Settings
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
      |                                                                                                         ^ Error: client-progress: bottom nav missing
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