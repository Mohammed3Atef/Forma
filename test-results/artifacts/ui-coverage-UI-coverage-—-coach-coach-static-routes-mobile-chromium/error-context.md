# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> UI coverage — coach >> coach static routes
- Location: e2e\ui-coverage.spec.ts:86:3

# Error details

```
Error: coach-clients: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-clients: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-library: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-library: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-templates: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-templates: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-adherence: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-adherence: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-messages: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-messages: bottom nav missing

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-settings: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: coach-settings: bottom nav missing

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
    - generic [ref=e9]:
      - generic [ref=e10]: Forma
      - heading "Account" [level=1] [ref=e11]
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: C
        - generic [ref=e15]:
          - generic [ref=e16]: coach
          - generic [ref=e17]: coach@forma.test
      - generic [ref=e18]:
        - generic [ref=e19]: Role
        - generic [ref=e20]: Coach
    - button "Sign out" [ref=e21] [cursor=pointer]
  - navigation [ref=e22]:
    - list [ref=e23]:
      - listitem [ref=e24]:
        - link "Clients" [ref=e25] [cursor=pointer]:
          - /url: /coach
          - img [ref=e27]
          - generic [ref=e29]: Clients
      - listitem [ref=e30]:
        - link "Library" [ref=e31] [cursor=pointer]:
          - /url: /coach/library
          - img [ref=e33]
          - generic [ref=e35]: Library
      - listitem [ref=e36]:
        - link "Templates" [ref=e37] [cursor=pointer]:
          - /url: /coach/templates
          - img [ref=e39]
          - generic [ref=e41]: Templates
      - listitem [ref=e42]:
        - link "Adherence" [ref=e43] [cursor=pointer]:
          - /url: /coach/adherence
          - img [ref=e45]
          - generic [ref=e47]: Adherence
      - listitem [ref=e48]:
        - link "Messages" [ref=e49] [cursor=pointer]:
          - /url: /coach/messages
          - img [ref=e51]
          - generic [ref=e53]: Messages
      - listitem [ref=e54]:
        - link "Account" [ref=e55] [cursor=pointer]:
          - /url: /coach/settings
          - img [ref=e57]
          - generic [ref=e59]: Account
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
      |                                                                                                         ^ Error: coach-settings: bottom nav missing
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