# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> Admin >> cannot edit a super_admin account (UI blocks it)
- Location: e2e\admin.spec.ts:67:3

# Error details

```
TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('[data-testid="account-row"][data-account-role="super_admin"]').first() to be visible

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - img "Forma" [ref=e5]
  - main [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e9]:
        - generic [ref=e10]: Admin
        - heading "Accounts" [level=1] [ref=e11]
      - button "Create account" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
    - generic [ref=e15]:
      - generic:
        - img
      - textbox "Search name or email" [ref=e16]
    - generic [ref=e17]:
      - button "All" [ref=e18] [cursor=pointer]
      - button "Super Admin" [ref=e19] [cursor=pointer]
      - button "Admin" [ref=e20] [cursor=pointer]
      - button "Coach" [ref=e21] [cursor=pointer]
      - button "Client" [ref=e22] [cursor=pointer]
    - generic [ref=e23]:
      - button "Q QA Tpl 1781614706022 Client Active" [ref=e24] [cursor=pointer]:
        - generic [ref=e25]: Q
        - generic [ref=e26]:
          - generic [ref=e27]: QA Tpl 1781614706022
          - generic [ref=e28]: Client
        - generic [ref=e29]: Active
      - button "Q QA UI 1781614697035 Client Active" [ref=e30] [cursor=pointer]:
        - generic [ref=e31]: Q
        - generic [ref=e32]:
          - generic [ref=e33]: QA UI 1781614697035
          - generic [ref=e34]: Client
        - generic [ref=e35]: Active
      - button "Q QA UI 1781614632595 Client Active" [ref=e36] [cursor=pointer]:
        - generic [ref=e37]: Q
        - generic [ref=e38]:
          - generic [ref=e39]: QA UI 1781614632595
          - generic [ref=e40]: Client
        - generic [ref=e41]: Active
      - button "Q QA Admin 1781614580881 Admin Active" [ref=e42] [cursor=pointer]:
        - generic [ref=e43]: Q
        - generic [ref=e44]:
          - generic [ref=e45]: QA Admin 1781614580881
          - generic [ref=e46]: Admin
        - generic [ref=e47]: Active
      - button "Q QA Client 1781614558253 Client Active" [ref=e48] [cursor=pointer]:
        - generic [ref=e49]: Q
        - generic [ref=e50]:
          - generic [ref=e51]: QA Client 1781614558253
          - generic [ref=e52]: Client
        - generic [ref=e53]: Active
      - button "Q QA CoachB 1781614558253 Coach Active" [ref=e54] [cursor=pointer]:
        - generic [ref=e55]: Q
        - generic [ref=e56]:
          - generic [ref=e57]: QA CoachB 1781614558253
          - generic [ref=e58]: Coach
        - generic [ref=e59]: Active
      - button "Q QA CoachA 1781614558253 Coach Active" [ref=e60] [cursor=pointer]:
        - generic [ref=e61]: Q
        - generic [ref=e62]:
          - generic [ref=e63]: QA CoachA 1781614558253
          - generic [ref=e64]: Coach
        - generic [ref=e65]: Active
      - button "Q qa-pending+1781614555741652 Client Pending" [ref=e66] [cursor=pointer]:
        - generic [ref=e67]: Q
        - generic [ref=e68]:
          - generic [ref=e69]: qa-pending+1781614555741652
          - generic [ref=e70]: Client
        - generic [ref=e71]: Pending
      - button "Q QA Susp 1781614551516 Client Suspended" [ref=e72] [cursor=pointer]:
        - generic [ref=e73]: Q
        - generic [ref=e74]:
          - generic [ref=e75]: QA Susp 1781614551516
          - generic [ref=e76]: Client
        - generic [ref=e77]: Suspended
      - button "Q QA UI 1781614545267 Client Active" [ref=e78] [cursor=pointer]:
        - generic [ref=e79]: Q
        - generic [ref=e80]:
          - generic [ref=e81]: QA UI 1781614545267
          - generic [ref=e82]: Client
        - generic [ref=e83]: Active
      - button "Q QA Admin 1781614509841 Admin Active" [ref=e84] [cursor=pointer]:
        - generic [ref=e85]: Q
        - generic [ref=e86]:
          - generic [ref=e87]: QA Admin 1781614509841
          - generic [ref=e88]: Admin
        - generic [ref=e89]: Active
      - button "Q QA Client 1781614487172 Client Active" [ref=e90] [cursor=pointer]:
        - generic [ref=e91]: Q
        - generic [ref=e92]:
          - generic [ref=e93]: QA Client 1781614487172
          - generic [ref=e94]: Client
        - generic [ref=e95]: Active
      - button "Q QA CoachB 1781614487172 Coach Active" [ref=e96] [cursor=pointer]:
        - generic [ref=e97]: Q
        - generic [ref=e98]:
          - generic [ref=e99]: QA CoachB 1781614487172
          - generic [ref=e100]: Coach
        - generic [ref=e101]: Active
      - button "Q QA Integrity 1781614500909 Client Active" [ref=e102] [cursor=pointer]:
        - generic [ref=e103]: Q
        - generic [ref=e104]:
          - generic [ref=e105]: QA Integrity 1781614500909
          - generic [ref=e106]: Client
        - generic [ref=e107]: Active
      - button "Q QA CoachA 1781614487172 Coach Active" [ref=e108] [cursor=pointer]:
        - generic [ref=e109]: Q
        - generic [ref=e110]:
          - generic [ref=e111]: QA CoachA 1781614487172
          - generic [ref=e112]: Coach
        - generic [ref=e113]: Active
      - button "Q qa-pending+1781614484676780 Client Pending" [ref=e114] [cursor=pointer]:
        - generic [ref=e115]: Q
        - generic [ref=e116]:
          - generic [ref=e117]: qa-pending+1781614484676780
          - generic [ref=e118]: Client
        - generic [ref=e119]: Pending
      - button "Q QA Susp 1781614480850 Client Suspended" [ref=e120] [cursor=pointer]:
        - generic [ref=e121]: Q
        - generic [ref=e122]:
          - generic [ref=e123]: QA Susp 1781614480850
          - generic [ref=e124]: Client
        - generic [ref=e125]: Suspended
      - button "Q QA CoachClient 1781614447322 Client Active" [ref=e126] [cursor=pointer]:
        - generic [ref=e127]: Q
        - generic [ref=e128]:
          - generic [ref=e129]: QA CoachClient 1781614447322
          - generic [ref=e130]: Client
        - generic [ref=e131]: Active
      - button "Q QA Ver 1781614430843 Client Active" [ref=e132] [cursor=pointer]:
        - generic [ref=e133]: Q
        - generic [ref=e134]:
          - generic [ref=e135]: QA Ver 1781614430843
          - generic [ref=e136]: Client
        - generic [ref=e137]: Active
      - button "Q QA LibPlan 1781614412306 Client Active" [ref=e138] [cursor=pointer]:
        - generic [ref=e139]: Q
        - generic [ref=e140]:
          - generic [ref=e141]: QA LibPlan 1781614412306
          - generic [ref=e142]: Client
        - generic [ref=e143]: Active
      - button "Q QA Foods 1781614406883 Client Active" [ref=e144] [cursor=pointer]:
        - generic [ref=e145]: Q
        - generic [ref=e146]:
          - generic [ref=e147]: QA Foods 1781614406883
          - generic [ref=e148]: Client
        - generic [ref=e149]: Active
      - button "Q QA Integrity 1781614397967 Client Active" [ref=e150] [cursor=pointer]:
        - generic [ref=e151]: Q
        - generic [ref=e152]:
          - generic [ref=e153]: QA Integrity 1781614397967
          - generic [ref=e154]: Client
        - generic [ref=e155]: Active
      - button "Q QA Empty 1781614389745 Client Active" [ref=e156] [cursor=pointer]:
        - generic [ref=e157]: Q
        - generic [ref=e158]:
          - generic [ref=e159]: QA Empty 1781614389745
          - generic [ref=e160]: Client
        - generic [ref=e161]: Active
      - button "Q QA Assigned 1781614356192 Client Active" [ref=e162] [cursor=pointer]:
        - generic [ref=e163]: Q
        - generic [ref=e164]:
          - generic [ref=e165]: QA Assigned 1781614356192
          - generic [ref=e166]: Client
        - generic [ref=e167]: Active
      - button "Q QA CoachClient 1781614344608 Client Active" [ref=e168] [cursor=pointer]:
        - generic [ref=e169]: Q
        - generic [ref=e170]:
          - generic [ref=e171]: QA CoachClient 1781614344608
          - generic [ref=e172]: Client
        - generic [ref=e173]: Active
  - navigation [ref=e174]:
    - list [ref=e175]:
      - listitem [ref=e176]:
        - link "Overview" [ref=e177] [cursor=pointer]:
          - /url: /admin
          - img [ref=e179]
          - generic [ref=e181]: Overview
      - listitem [ref=e182]:
        - link "Accounts" [ref=e183] [cursor=pointer]:
          - /url: /admin/accounts
          - img [ref=e185]
          - generic [ref=e187]: Accounts
      - listitem [ref=e188]:
        - link "Assign" [ref=e189] [cursor=pointer]:
          - /url: /admin/assignments
          - img [ref=e191]
          - generic [ref=e193]: Assign
      - listitem [ref=e194]:
        - link "Settings" [ref=e195] [cursor=pointer]:
          - /url: /admin/governance
          - img [ref=e197]
          - generic [ref=e199]: Settings
      - listitem [ref=e200]:
        - link "Analytics" [ref=e201] [cursor=pointer]:
          - /url: /admin/analytics
          - img [ref=e203]
          - generic [ref=e205]: Analytics
```

# Test source

```ts
  1   | import { test, expect } from './fixtures/test';
  2   | import { TID } from './fixtures/selectors';
  3   | import { signInAs, findUserByEmail, attempt, isPermissionDenied, setDoc, doc } from './fixtures/firestore';
  4   | import { credsFor } from './fixtures/env';
  5   | 
  6   | /**
  7   |  * ADMIN — manages people and reads oversight data, but does NOT author client
  8   |  * plans by default and cannot touch super_admin accounts or self-promote.
  9   |  */
  10  | 
  11  | test.describe('Admin', () => {
  12  |   test.beforeEach(async ({ login }) => {
  13  |     await login('admin');
  14  |   });
  15  | 
  16  |   test('lands on /admin', async ({ page }) => {
  17  |     await expect(page).toHaveURL(/\/admin$/);
  18  |     await expect(page.getByTestId(TID.adminOverview)).toBeVisible();
  19  |   });
  20  | 
  21  |   test('can view accounts', async ({ page }) => {
  22  |     await page.goto('/admin/accounts');
  23  |     await expect(page.getByTestId(TID.adminAccounts)).toBeVisible();
  24  |     await expect(page.getByTestId(TID.accountRow).first()).toBeVisible({ timeout: 20_000 });
  25  |   });
  26  | 
  27  |   test('can filter to coaches and clients', async ({ page }) => {
  28  |     await page.goto('/admin/accounts');
  29  |     // Role filter chips exist for each role.
  30  |     await expect(page.getByRole('button', { name: /coach/i }).first()).toBeVisible();
  31  |     await expect(page.getByRole('button', { name: /client/i }).first()).toBeVisible();
  32  |   });
  33  | 
  34  |   test('can open a client detail read-only', async ({ page }) => {
  35  |     const client = credsFor('client');
  36  |     const s = await signInAs('admin');
  37  |     let clientId = '';
  38  |     try {
  39  |       clientId = (await findUserByEmail(s.db, client.email))?.id ?? '';
  40  |     } finally {
  41  |       await s.close();
  42  |     }
  43  |     test.skip(!clientId, 'E2E client account not found');
  44  |     await page.goto(`/admin/clients/${clientId}`);
  45  |     await expect(page.locator('body')).toContainText(/[A-Za-z]/);
  46  |   });
  47  | 
  48  |   test('can view analytics if allowed', async ({ page }) => {
  49  |     await page.goto('/admin/analytics');
  50  |     await expect(page.getByTestId(TID.adminAnalytics)).toBeVisible();
  51  |   });
  52  | 
  53  |   test('can view audit logs if allowed', async ({ page }) => {
  54  |     await page.goto('/admin/governance');
  55  |     await expect(page.getByText(/audit/i).first()).toBeVisible();
  56  |   });
  57  | 
  58  |   test('create form does NOT offer admin/super_admin roles (no self-promotion)', async ({ page }) => {
  59  |     await page.goto('/admin/accounts');
  60  |     await page.getByTestId(TID.adminCreateAccount).click();
  61  |     await expect(page.getByTestId(TID.createRole('client'))).toBeVisible();
  62  |     await expect(page.getByTestId(TID.createRole('coach'))).toBeVisible();
  63  |     await expect(page.getByTestId(TID.createRole('admin'))).toHaveCount(0);
  64  |     await expect(page.getByTestId(TID.createRole('super_admin'))).toHaveCount(0);
  65  |   });
  66  | 
  67  |   test('cannot edit a super_admin account (UI blocks it)', async ({ page }) => {
  68  |     await page.goto('/admin/accounts');
  69  |     const superRow = page.locator('[data-testid="account-row"][data-account-role="super_admin"]').first();
> 70  |     await superRow.waitFor({ timeout: 20_000 });
      |                    ^ TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
  71  |     await superRow.click();
  72  |     await expect(page.getByTestId(TID.cannotEditAccount)).toBeVisible();
  73  |   });
  74  | 
  75  |   test('rules BLOCK: admin cannot promote a user to super_admin', async () => {
  76  |     const client = credsFor('client');
  77  |     const s = await signInAs('admin');
  78  |     try {
  79  |       const target = await findUserByEmail(s.db, client.email);
  80  |       test.skip(!target, 'E2E client not found');
  81  |       const r = await attempt(() =>
  82  |         setDoc(doc(s.db, 'users', target!.id), { role: 'super_admin', updatedAt: Date.now() }, { merge: true }),
  83  |       );
  84  |       expect(isPermissionDenied(r), `admin promoting to super_admin should be denied (got ${r.code ?? 'ok'})`).toBe(true);
  85  |     } finally {
  86  |       await s.close();
  87  |     }
  88  |   });
  89  | 
  90  |   test('rules BLOCK: admin cannot write a client workout plan (no clients.writeAll)', async () => {
  91  |     const client = credsFor('client');
  92  |     const s = await signInAs('admin');
  93  |     try {
  94  |       const target = await findUserByEmail(s.db, client.email);
  95  |       test.skip(!target, 'E2E client not found');
  96  |       const r = await attempt(() =>
  97  |         setDoc(doc(s.db, 'clientData', target!.id, 'plan', 'workout'), {
  98  |           id: 'x',
  99  |           name: 'admin should not write this',
  100 |           days: [],
  101 |           exercises: {},
  102 |           updatedAt: Date.now(),
  103 |         }),
  104 |       );
  105 |       expect(isPermissionDenied(r), `admin writing client plan should be denied (got ${r.code ?? 'ok'})`).toBe(true);
  106 |     } finally {
  107 |       await s.close();
  108 |     }
  109 |   });
  110 | 
  111 |   test('rules ALLOW: admin can read a client identity doc (oversight)', async () => {
  112 |     const client = credsFor('client');
  113 |     const s = await signInAs('admin');
  114 |     try {
  115 |       const r = await attempt(() => findUserByEmail(s.db, client.email));
  116 |       expect(r.ok).toBe(true);
  117 |     } finally {
  118 |       await s.close();
  119 |     }
  120 |   });
  121 | });
  122 | 
```