# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-coverage.spec.ts >> UI coverage — client >> client route: client-settings
- Location: e2e\ui-coverage.spec.ts:74:5

# Error details

```
Error: client-settings: page crashed / rendered empty

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

```
Error: client-settings: bottom nav missing

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
          - generic [ref=e11]: Athlete
          - heading "Profile" [level=1] [ref=e12]
        - generic [ref=e13]:
          - img [ref=e14]
          - text: Syncing…
      - generic [ref=e16]:
        - generic [ref=e17]: QU
        - generic [ref=e18]:
          - heading "QA UI 1781620544775" [level=2] [ref=e19]
          - paragraph [ref=e20]: Member since Jun 2026 · kg
      - generic [ref=e21]:
        - generic [ref=e22]:
          - img [ref=e24]
          - generic [ref=e26]: "0"
          - generic [ref=e27]: Total workouts
        - generic [ref=e28]:
          - img [ref=e30]
          - generic [ref=e32]: "0"
          - generic [ref=e33]: Day streak
        - generic [ref=e34]:
          - img [ref=e36]
          - generic [ref=e38]: 0t
          - generic [ref=e39]: Lifetime volume
        - generic [ref=e40]:
          - img [ref=e42]
          - generic [ref=e44]: "0"
          - generic [ref=e45]: Personal records
      - heading "Training" [level=2] [ref=e47]
      - generic [ref=e48]:
        - button "Routines 0" [ref=e49] [cursor=pointer]:
          - img [ref=e51]
          - generic [ref=e53]: Routines
          - generic [ref=e54]: "0"
          - img [ref=e55]
        - button "Exercise library 0" [ref=e57] [cursor=pointer]:
          - img [ref=e59]
          - generic [ref=e61]: Exercise library
          - generic [ref=e62]: "0"
          - img [ref=e63]
        - button "Measurements" [ref=e65] [cursor=pointer]:
          - img [ref=e67]
          - generic [ref=e69]: Measurements
          - img [ref=e70]
      - heading "Settings" [level=2] [ref=e73]
      - generic [ref=e74]:
        - heading "Profile" [level=2] [ref=e75]
        - generic [ref=e76]:
          - generic [ref=e77]: Name
          - textbox [ref=e78]: QA UI 1781620544775
        - generic [ref=e79]:
          - generic [ref=e80]:
            - generic [ref=e81]: Age
            - textbox [ref=e82]: "30"
          - generic [ref=e83]:
            - generic [ref=e84]: Weight
            - textbox [ref=e85]: "80"
          - generic [ref=e86]:
            - generic [ref=e87]: Height
            - textbox [ref=e88]: "178"
        - generic [ref=e89]:
          - generic [ref=e90]: Goal
          - combobox [ref=e91]:
            - option "Muscle gain"
            - option "Fat loss"
            - option "Recomposition" [selected]
            - option "Maintenance"
            - option "Strength"
        - generic [ref=e92]:
          - generic [ref=e93]: Activity level
          - combobox [ref=e94]:
            - option "Sedentary"
            - option "Light"
            - option "Moderate" [selected]
            - option "Active"
            - option "Very active"
      - generic [ref=e95]:
        - heading "Preferences" [level=2] [ref=e96]
        - generic [ref=e97]:
          - generic [ref=e98]: Language
          - generic [ref=e99]:
            - button "English" [ref=e100] [cursor=pointer]
            - button "العربية" [ref=e101] [cursor=pointer]
        - generic [ref=e102]:
          - generic [ref=e103]: Default rest (sec)
          - textbox [ref=e104]: "90"
        - generic [ref=e105]:
          - generic [ref=e106]: Weekly workout goal
          - textbox [ref=e107]: "5"
        - generic [ref=e108]:
          - generic [ref=e109]: Keep screen awake during workout
          - switch [checked] [ref=e110] [cursor=pointer]
        - generic [ref=e112]:
          - generic [ref=e113]: Vibration
          - switch [checked] [ref=e114] [cursor=pointer]
        - generic [ref=e116]:
          - generic [ref=e117]: Notifications
          - switch [ref=e118] [cursor=pointer]
      - generic [ref=e120]:
        - heading "Daily targets" [level=2] [ref=e121]
        - generic [ref=e122]:
          - generic [ref=e123]:
            - generic [ref=e124]: Calories
            - textbox [ref=e125]: "0"
          - generic [ref=e126]:
            - generic [ref=e127]: Protein
            - textbox [ref=e128]: "0"
          - generic [ref=e129]:
            - generic [ref=e130]: Carbs
            - textbox [ref=e131]: "0"
          - generic [ref=e132]:
            - generic [ref=e133]: Fats
            - textbox [ref=e134]: "0"
          - generic [ref=e135]:
            - generic [ref=e136]: Water
            - textbox [ref=e137]: "0"
          - generic [ref=e138]:
            - generic [ref=e139]: Steps
            - textbox [ref=e140]: "0"
          - generic [ref=e141]:
            - generic [ref=e142]: Cardio
            - textbox [ref=e143]: "0"
      - generic [ref=e144]:
        - heading "Reminders" [level=2] [ref=e145]
        - generic [ref=e146]:
          - textbox [ref=e147]: 09:00
          - combobox [ref=e148]:
            - option "Meal" [selected]
            - option "Supplements"
            - option "Creatine"
            - option "Water"
            - option "Workout"
            - option "Cardio / walk"
          - button "Add" [ref=e149] [cursor=pointer]:
            - img [ref=e150]
            - text: Add
        - paragraph [ref=e152]: Enable notifications ↑
      - generic [ref=e153]:
        - button "Video manager" [ref=e154] [cursor=pointer]:
          - generic [ref=e155]:
            - img [ref=e156]
            - text: Video manager
          - img [ref=e158]
        - button "Import data" [ref=e160] [cursor=pointer]:
          - generic [ref=e161]:
            - img [ref=e162]
            - text: Import data
          - img [ref=e164]
        - button "Update the app" [ref=e166] [cursor=pointer]:
          - generic [ref=e167]:
            - img [ref=e168]
            - text: Update the app
          - img [ref=e170]
      - generic [ref=e172]:
        - generic [ref=e173]:
          - heading "Cloud backup & sync" [level=2] [ref=e174]
          - generic [ref=e175]:
            - img [ref=e176]
            - text: Syncing…
        - generic [ref=e178]:
          - paragraph [ref=e179]:
            - img [ref=e180]
            - text: Syncing…
          - paragraph [ref=e182]: qa-ui+1781620544775475@forma-e2e.test
          - generic [ref=e183]:
            - button "…" [disabled] [ref=e184]
            - button "Sign out" [ref=e185] [cursor=pointer]
      - generic [ref=e186]:
        - heading "Data" [level=2] [ref=e187]
        - paragraph [ref=e188]:
          - img [ref=e189]
          - text: Offline storage is protected — your data, videos & photos persist.
        - button "Clear this day's data Tue 16 Jun" [ref=e191] [cursor=pointer]:
          - generic [ref=e192]:
            - img [ref=e193]
            - text: Clear this day's data
          - generic [ref=e195]: Tue 16 Jun
        - button "Reset all data (start fresh)" [ref=e196] [cursor=pointer]
  - navigation [ref=e197]:
    - list [ref=e198]:
      - listitem [ref=e199]:
        - link "Home" [ref=e200] [cursor=pointer]:
          - /url: /
          - img [ref=e202]
          - generic [ref=e204]: Home
      - listitem [ref=e205]:
        - link "Workout" [ref=e206] [cursor=pointer]:
          - /url: /workout
          - img [ref=e208]
          - generic [ref=e210]: Workout
      - listitem [ref=e211]:
        - link "Nutrition" [ref=e212] [cursor=pointer]:
          - /url: /nutrition
          - img [ref=e214]
          - generic [ref=e216]: Nutrition
      - listitem [ref=e217]:
        - link "Cardio" [ref=e218] [cursor=pointer]:
          - /url: /cardio
          - img [ref=e220]
          - generic [ref=e222]: Cardio
      - listitem [ref=e223]:
        - link "Progress" [ref=e224] [cursor=pointer]:
          - /url: /progress
          - img [ref=e226]
          - generic [ref=e228]: Progress
      - listitem [ref=e229]:
        - link "Settings" [ref=e230] [cursor=pointer]:
          - /url: /settings
          - img [ref=e232]
          - generic [ref=e234]: Settings
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
      |                                                                                                         ^ Error: client-settings: bottom nav missing
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