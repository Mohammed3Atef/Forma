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

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - img "Forma" [ref=e5]
    - button "Menu" [ref=e6] [cursor=pointer]:
      - img [ref=e7]
  - main [ref=e9]:
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e13]:
          - generic [ref=e14]: Athlete
          - heading "Profile" [level=1] [ref=e15]
        - generic [ref=e16]:
          - img [ref=e17]
          - text: Syncing…
      - generic [ref=e19]:
        - generic [ref=e20]: QU
        - generic [ref=e21]:
          - heading "QA UI 1781707487149" [level=2] [ref=e22]
          - paragraph [ref=e23]: Member since Jun 2026 · kg
      - generic [ref=e24]:
        - generic [ref=e25]:
          - img [ref=e27]
          - generic [ref=e29]: "0"
          - generic [ref=e30]: Total workouts
        - generic [ref=e31]:
          - img [ref=e33]
          - generic [ref=e35]: "0"
          - generic [ref=e36]: Day streak
        - generic [ref=e37]:
          - img [ref=e39]
          - generic [ref=e41]: 0t
          - generic [ref=e42]: Lifetime volume
        - generic [ref=e43]:
          - img [ref=e45]
          - generic [ref=e47]: "0"
          - generic [ref=e48]: Personal records
      - heading "Training" [level=2] [ref=e50]
      - generic [ref=e51]:
        - button "Routines 0" [ref=e52] [cursor=pointer]:
          - img [ref=e54]
          - generic [ref=e56]: Routines
          - generic [ref=e57]: "0"
          - img [ref=e58]
        - button "Exercise library 0" [ref=e60] [cursor=pointer]:
          - img [ref=e62]
          - generic [ref=e64]: Exercise library
          - generic [ref=e65]: "0"
          - img [ref=e66]
        - button "Measurements" [ref=e68] [cursor=pointer]:
          - img [ref=e70]
          - generic [ref=e72]: Measurements
          - img [ref=e73]
      - heading "Settings" [level=2] [ref=e76]
      - generic [ref=e77]:
        - heading "Profile" [level=2] [ref=e78]
        - generic [ref=e79]:
          - generic [ref=e80]: Name
          - textbox [ref=e81]: QA UI 1781707487149
        - generic [ref=e82]:
          - generic [ref=e83]:
            - generic [ref=e84]: Age
            - textbox [ref=e85]: "30"
          - generic [ref=e86]:
            - generic [ref=e87]: Weight
            - textbox [ref=e88]: "80"
          - generic [ref=e89]:
            - generic [ref=e90]: Height
            - textbox [ref=e91]: "178"
        - generic [ref=e92]:
          - generic [ref=e93]: Goal
          - combobox [ref=e94]:
            - option "Muscle gain"
            - option "Fat loss"
            - option "Recomposition" [selected]
            - option "Maintenance"
            - option "Strength"
        - generic [ref=e95]:
          - generic [ref=e96]: Activity level
          - combobox [ref=e97]:
            - option "Sedentary"
            - option "Light"
            - option "Moderate" [selected]
            - option "Active"
            - option "Very active"
      - generic [ref=e98]:
        - heading "Preferences" [level=2] [ref=e99]
        - generic [ref=e100]:
          - generic [ref=e101]: Language
          - generic [ref=e102]:
            - button "English" [ref=e103] [cursor=pointer]
            - button "العربية" [ref=e104] [cursor=pointer]
        - generic [ref=e105]:
          - generic [ref=e106]: Default rest (sec)
          - textbox [ref=e107]: "90"
        - generic [ref=e108]:
          - generic [ref=e109]: Weekly workout goal
          - textbox [ref=e110]: "5"
        - generic [ref=e111]:
          - generic [ref=e112]: Keep screen awake during workout
          - switch [checked] [ref=e113] [cursor=pointer]
        - generic [ref=e115]:
          - generic [ref=e116]: Vibration
          - switch [checked] [ref=e117] [cursor=pointer]
        - generic [ref=e119]:
          - generic [ref=e120]: Notifications
          - switch [ref=e121] [cursor=pointer]
      - generic [ref=e123]:
        - heading "Daily targets" [level=2] [ref=e124]
        - generic [ref=e125]:
          - generic [ref=e126]:
            - generic [ref=e127]: Calories
            - textbox [ref=e128]: "0"
          - generic [ref=e129]:
            - generic [ref=e130]: Protein
            - textbox [ref=e131]: "0"
          - generic [ref=e132]:
            - generic [ref=e133]: Carbs
            - textbox [ref=e134]: "0"
          - generic [ref=e135]:
            - generic [ref=e136]: Fats
            - textbox [ref=e137]: "0"
          - generic [ref=e138]:
            - generic [ref=e139]: Water
            - textbox [ref=e140]: "0"
          - generic [ref=e141]:
            - generic [ref=e142]: Steps
            - textbox [ref=e143]: "0"
          - generic [ref=e144]:
            - generic [ref=e145]: Cardio
            - textbox [ref=e146]: "0"
      - generic [ref=e147]:
        - heading "Reminders" [level=2] [ref=e148]
        - generic [ref=e149]:
          - textbox [ref=e150]: 09:00
          - combobox [ref=e151]:
            - option "Meal" [selected]
            - option "Supplements"
            - option "Creatine"
            - option "Water"
            - option "Workout"
            - option "Cardio / walk"
          - button "Add" [ref=e152] [cursor=pointer]:
            - img [ref=e153]
            - text: Add
        - paragraph [ref=e155]: Enable notifications ↑
      - generic [ref=e156]:
        - button "Video manager" [ref=e157] [cursor=pointer]:
          - generic [ref=e158]:
            - img [ref=e159]
            - text: Video manager
          - img [ref=e161]
        - button "Import data" [ref=e163] [cursor=pointer]:
          - generic [ref=e164]:
            - img [ref=e165]
            - text: Import data
          - img [ref=e167]
        - button "Update the app" [ref=e169] [cursor=pointer]:
          - generic [ref=e170]:
            - img [ref=e171]
            - text: Update the app
          - img [ref=e173]
      - generic [ref=e175]:
        - generic [ref=e176]:
          - heading "Cloud backup & sync" [level=2] [ref=e177]
          - generic [ref=e178]:
            - img [ref=e179]
            - text: Syncing…
        - generic [ref=e181]:
          - paragraph [ref=e182]:
            - img [ref=e183]
            - text: Syncing…
          - paragraph [ref=e185]: qa-ui+1781707487149816@forma-e2e.test
          - generic [ref=e186]:
            - button "…" [disabled] [ref=e187]
            - button "Sign out" [ref=e188] [cursor=pointer]
      - generic [ref=e189]:
        - heading "Data" [level=2] [ref=e190]
        - paragraph [ref=e191]:
          - img [ref=e192]
          - text: Install the app (Add to Home Screen) so your data isn't cleared when closed.
        - button "Clear this day's data Wed 17 Jun" [ref=e194] [cursor=pointer]:
          - generic [ref=e195]:
            - img [ref=e196]
            - text: Clear this day's data
          - generic [ref=e198]: Wed 17 Jun
        - button "Reset all data (start fresh)" [ref=e199] [cursor=pointer]
  - navigation [ref=e200]:
    - list [ref=e201]:
      - listitem [ref=e202]:
        - link "Home" [ref=e203] [cursor=pointer]:
          - /url: /
          - img [ref=e205]
          - generic [ref=e207]: Home
      - listitem [ref=e208]:
        - link "Nutrition" [ref=e209] [cursor=pointer]:
          - /url: /nutrition
          - img [ref=e211]
          - generic [ref=e213]: Nutrition
      - listitem [ref=e214]:
        - link "Workout" [ref=e215] [cursor=pointer]:
          - /url: /workout
          - img [ref=e216]
      - listitem [ref=e218]:
        - link "Progress" [ref=e219] [cursor=pointer]:
          - /url: /progress
          - img [ref=e221]
          - generic [ref=e223]: Progress
      - listitem [ref=e224]:
        - link "Profile" [ref=e225] [cursor=pointer]:
          - /url: /settings
          - img [ref=e227]
          - generic [ref=e229]: Profile
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
      |                                                                                  ^ Error: client-settings: page crashed / rendered empty
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