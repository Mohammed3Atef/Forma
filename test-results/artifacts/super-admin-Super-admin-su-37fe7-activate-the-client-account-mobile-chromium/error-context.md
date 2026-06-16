# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: super-admin.spec.ts >> Super admin >> suspend then reactivate the client account
- Location: e2e\super-admin.spec.ts:104:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "suspended"
Received: "active"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - img "Forma" [ref=e5]
  - main [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e9]:
        - generic [ref=e10]: Super admin
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
      - button "Q QA Admin 1781620491123 Admin Active" [ref=e24] [cursor=pointer]:
        - generic [ref=e25]: Q
        - generic [ref=e26]:
          - generic [ref=e27]: QA Admin 1781620491123
          - generic [ref=e28]: Admin
        - generic [ref=e29]: Active
      - button "Q QA Client 1781620460532 Client Active" [ref=e30] [cursor=pointer]:
        - generic [ref=e31]: Q
        - generic [ref=e32]:
          - generic [ref=e33]: QA Client 1781620460532
          - generic [ref=e34]: Client
        - generic [ref=e35]: Active
      - button "Q QA CoachB 1781620460532 Coach Active" [ref=e36] [cursor=pointer]:
        - generic [ref=e37]: Q
        - generic [ref=e38]:
          - generic [ref=e39]: QA CoachB 1781620460532
          - generic [ref=e40]: Coach
        - generic [ref=e41]: Active
      - button "Q QA CoachA 1781620460532 Coach Active" [ref=e42] [cursor=pointer]:
        - generic [ref=e43]: Q
        - generic [ref=e44]:
          - generic [ref=e45]: QA CoachA 1781620460532
          - generic [ref=e46]: Coach
        - generic [ref=e47]: Active
      - button "Q qa-pending+1781620456847781 Client Pending" [ref=e48] [cursor=pointer]:
        - generic [ref=e49]: Q
        - generic [ref=e50]:
          - generic [ref=e51]: qa-pending+1781620456847781
          - generic [ref=e52]: Client
        - generic [ref=e53]: Pending
      - button "Q QA Susp 1781620450057 Client Suspended" [ref=e54] [cursor=pointer]:
        - generic [ref=e55]: Q
        - generic [ref=e56]:
          - generic [ref=e57]: QA Susp 1781620450057
          - generic [ref=e58]: Client
        - generic [ref=e59]: Suspended
      - button "Q QA LibPlan 1781615312421 Client Active" [ref=e60] [cursor=pointer]:
        - generic [ref=e61]: Q
        - generic [ref=e62]:
          - generic [ref=e63]: QA LibPlan 1781615312421
          - generic [ref=e64]: Client
        - generic [ref=e65]: Active
      - button "Q QA Empty 1781615291584 Client Active" [ref=e66] [cursor=pointer]:
        - generic [ref=e67]: Q
        - generic [ref=e68]:
          - generic [ref=e69]: QA Empty 1781615291584
          - generic [ref=e70]: Client
        - generic [ref=e71]: Active
      - button "Q QA Assigned 1781615261386 Client Active" [ref=e72] [cursor=pointer]:
        - generic [ref=e73]: Q
        - generic [ref=e74]:
          - generic [ref=e75]: QA Assigned 1781615261386
          - generic [ref=e76]: Client
        - generic [ref=e77]: Active
      - button "Q QA Assess 1781615251322 Client Active" [ref=e78] [cursor=pointer]:
        - generic [ref=e79]: Q
        - generic [ref=e80]:
          - generic [ref=e81]: QA Assess 1781615251322
          - generic [ref=e82]: Client
        - generic [ref=e83]: Active
      - button "Q QA Tpl 1781614706022 Client Active" [ref=e84] [cursor=pointer]:
        - generic [ref=e85]: Q
        - generic [ref=e86]:
          - generic [ref=e87]: QA Tpl 1781614706022
          - generic [ref=e88]: Client
        - generic [ref=e89]: Active
      - button "Q QA UI 1781614697035 Client Active" [ref=e90] [cursor=pointer]:
        - generic [ref=e91]: Q
        - generic [ref=e92]:
          - generic [ref=e93]: QA UI 1781614697035
          - generic [ref=e94]: Client
        - generic [ref=e95]: Active
      - button "Q QA UI 1781614632595 Client Active" [ref=e96] [cursor=pointer]:
        - generic [ref=e97]: Q
        - generic [ref=e98]:
          - generic [ref=e99]: QA UI 1781614632595
          - generic [ref=e100]: Client
        - generic [ref=e101]: Active
      - button "Q QA Admin 1781614580881 Admin Active" [ref=e102] [cursor=pointer]:
        - generic [ref=e103]: Q
        - generic [ref=e104]:
          - generic [ref=e105]: QA Admin 1781614580881
          - generic [ref=e106]: Admin
        - generic [ref=e107]: Active
      - button "Q QA Client 1781614558253 Client Active" [ref=e108] [cursor=pointer]:
        - generic [ref=e109]: Q
        - generic [ref=e110]:
          - generic [ref=e111]: QA Client 1781614558253
          - generic [ref=e112]: Client
        - generic [ref=e113]: Active
      - button "Q QA CoachB 1781614558253 Coach Active" [ref=e114] [cursor=pointer]:
        - generic [ref=e115]: Q
        - generic [ref=e116]:
          - generic [ref=e117]: QA CoachB 1781614558253
          - generic [ref=e118]: Coach
        - generic [ref=e119]: Active
      - button "Q QA CoachA 1781614558253 Coach Active" [ref=e120] [cursor=pointer]:
        - generic [ref=e121]: Q
        - generic [ref=e122]:
          - generic [ref=e123]: QA CoachA 1781614558253
          - generic [ref=e124]: Coach
        - generic [ref=e125]: Active
      - button "Q qa-pending+1781614555741652 Client Pending" [ref=e126] [cursor=pointer]:
        - generic [ref=e127]: Q
        - generic [ref=e128]:
          - generic [ref=e129]: qa-pending+1781614555741652
          - generic [ref=e130]: Client
        - generic [ref=e131]: Pending
      - button "Q QA Susp 1781614551516 Client Suspended" [ref=e132] [cursor=pointer]:
        - generic [ref=e133]: Q
        - generic [ref=e134]:
          - generic [ref=e135]: QA Susp 1781614551516
          - generic [ref=e136]: Client
        - generic [ref=e137]: Suspended
      - button "Q QA UI 1781614545267 Client Active" [ref=e138] [cursor=pointer]:
        - generic [ref=e139]: Q
        - generic [ref=e140]:
          - generic [ref=e141]: QA UI 1781614545267
          - generic [ref=e142]: Client
        - generic [ref=e143]: Active
      - button "Q QA Admin 1781614509841 Admin Active" [ref=e144] [cursor=pointer]:
        - generic [ref=e145]: Q
        - generic [ref=e146]:
          - generic [ref=e147]: QA Admin 1781614509841
          - generic [ref=e148]: Admin
        - generic [ref=e149]: Active
      - button "Q QA Client 1781614487172 Client Active" [ref=e150] [cursor=pointer]:
        - generic [ref=e151]: Q
        - generic [ref=e152]:
          - generic [ref=e153]: QA Client 1781614487172
          - generic [ref=e154]: Client
        - generic [ref=e155]: Active
      - button "Q QA CoachB 1781614487172 Coach Active" [ref=e156] [cursor=pointer]:
        - generic [ref=e157]: Q
        - generic [ref=e158]:
          - generic [ref=e159]: QA CoachB 1781614487172
          - generic [ref=e160]: Coach
        - generic [ref=e161]: Active
      - button "Q QA Integrity 1781614500909 Client Active" [ref=e162] [cursor=pointer]:
        - generic [ref=e163]: Q
        - generic [ref=e164]:
          - generic [ref=e165]: QA Integrity 1781614500909
          - generic [ref=e166]: Client
        - generic [ref=e167]: Active
      - button "Q QA CoachA 1781614487172 Coach Active" [ref=e168] [cursor=pointer]:
        - generic [ref=e169]: Q
        - generic [ref=e170]:
          - generic [ref=e171]: QA CoachA 1781614487172
          - generic [ref=e172]: Coach
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
  14  | const PW = 'Test123456!';
  15  | // Shared across the serial flow.
  16  | let coachAEmail: string;
  17  | let coachBEmail: string;
  18  | let clientEmail: string;
  19  | const coachAName = `QA CoachA ${Date.now()}`;
  20  | const coachBName = `QA CoachB ${Date.now()}`;
  21  | const clientName = `QA Client ${Date.now()}`;
  22  | 
  23  | async function createAccount(page: Page, role: string, email: string, name: string): Promise<void> {
  24  |   await page.goto('/admin/accounts');
  25  |   await page.getByTestId(TID.adminCreateAccount).click();
  26  |   await expect(page.getByTestId(TID.createAccountForm)).toBeVisible();
  27  |   await page.getByTestId(TID.createEmail).fill(email);
  28  |   await page.getByTestId(TID.createName).fill(name);
  29  |   await page.getByTestId(TID.createPassword).fill(PW);
  30  |   await page.getByTestId(TID.createRole(role)).click();
  31  |   await page.getByTestId(TID.createSubmit).click();
  32  |   // Sheet closes on success.
  33  |   await expect(page.getByTestId(TID.createAccountForm)).toBeHidden({ timeout: 25_000 });
  34  | }
  35  | 
  36  | test.describe.serial('Super admin', () => {
  37  |   test.beforeEach(async ({ login }) => {
  38  |     await login('super_admin');
  39  |   });
  40  | 
  41  |   test('lands on /admin with the mobile admin dashboard', async ({ page }) => {
  42  |     await expect(page).toHaveURL(/\/admin$/);
  43  |     await expect(page.getByTestId(TID.adminOverview)).toBeVisible();
  44  |     await expect(page.getByTestId(TID.bottomNav)).toBeVisible();
  45  |   });
  46  | 
  47  |   test('overview shows platform stats tiles', async ({ page }) => {
  48  |     await page.goto('/admin');
  49  |     await expect(page.getByText(/total/i).first()).toBeVisible();
  50  |     // The six stat tiles render numbers (or em-dash while loading then a number).
  51  |     await expect(page.getByTestId(TID.adminOverview)).toBeVisible();
  52  |   });
  53  | 
  54  |   test('can open Accounts and see the create control', async ({ page }) => {
  55  |     await page.goto('/admin/accounts');
  56  |     await expect(page.getByTestId(TID.adminAccounts)).toBeVisible();
  57  |     await expect(page.getByTestId(TID.adminCreateAccount)).toBeVisible();
  58  |   });
  59  | 
  60  |   test('create coach A, coach B and a client', async ({ page }) => {
  61  |     coachAEmail = uniqueEmail('qa-coachA');
  62  |     coachBEmail = uniqueEmail('qa-coachB');
  63  |     clientEmail = uniqueEmail('qa-client');
  64  |     await createAccount(page, 'coach', coachAEmail, coachAName);
  65  |     await createAccount(page, 'coach', coachBEmail, coachBName);
  66  |     await createAccount(page, 'client', clientEmail, clientName);
  67  | 
  68  |     // Verify in Firestore they exist with the right roles.
  69  |     const s = await signInAs('super_admin');
  70  |     try {
  71  |       const a = await findUserByEmail(s.db, coachAEmail);
  72  |       const b = await findUserByEmail(s.db, coachBEmail);
  73  |       const c = await findUserByEmail(s.db, clientEmail);
  74  |       expect(a?.role, 'coach A role').toBe('coach');
  75  |       expect(b?.role, 'coach B role').toBe('coach');
  76  |       expect(c?.role, 'client role').toBe('client');
  77  |       expect(c?.accountStatus, 'client active').toBe('active');
  78  |     } finally {
  79  |       await s.close();
  80  |     }
  81  |   });
  82  | 
  83  |   test('can create an admin (super-admin-only role)', async ({ page }) => {
  84  |     const adminEmail = uniqueEmail('qa-admin');
  85  |     await page.goto('/admin/accounts');
  86  |     await page.getByTestId(TID.adminCreateAccount).click();
  87  |     // The super_admin + admin role chips are only offered to a super_admin.
  88  |     await expect(page.getByTestId(TID.createRole('admin'))).toBeVisible();
  89  |     await expect(page.getByTestId(TID.createRole('super_admin'))).toBeVisible();
  90  |     await page.getByTestId(TID.createEmail).fill(adminEmail);
  91  |     await page.getByTestId(TID.createName).fill(`QA Admin ${Date.now()}`);
  92  |     await page.getByTestId(TID.createPassword).fill(PW);
  93  |     await page.getByTestId(TID.createRole('admin')).click();
  94  |     await page.getByTestId(TID.createSubmit).click();
  95  |     await expect(page.getByTestId(TID.createAccountForm)).toBeHidden({ timeout: 25_000 });
  96  |     const s = await signInAs('super_admin');
  97  |     try {
  98  |       expect((await findUserByEmail(s.db, adminEmail))?.role).toBe('admin');
  99  |     } finally {
  100 |       await s.close();
  101 |     }
  102 |   });
  103 | 
  104 |   test('suspend then reactivate the client account', async ({ page }) => {
  105 |     test.skip(!clientName, 'client must have been created');
  106 |     await page.goto('/admin/accounts');
  107 |     await page.getByText(clientName).click();
  108 |     await page.getByTestId(TID.setStatus('suspended')).click();
  109 |     await page.getByTestId(TID.confirmAccept).click();
  110 |     await expect(page.getByTestId(TID.createAccountForm)).toBeHidden();
  111 | 
  112 |     let s = await signInAs('super_admin');
  113 |     try {
> 114 |       expect((await findUserByEmail(s.db, clientEmail))?.accountStatus).toBe('suspended');
      |                                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  115 |     } finally {
  116 |       await s.close();
  117 |     }
  118 | 
  119 |     // Reactivate.
  120 |     await page.goto('/admin/accounts');
  121 |     await page.getByText(clientName).click();
  122 |     await page.getByTestId(TID.setStatus('active')).click();
  123 |     await page.getByTestId(TID.confirmAccept).click();
  124 |     s = await signInAs('super_admin');
  125 |     try {
  126 |       expect((await findUserByEmail(s.db, clientEmail))?.accountStatus).toBe('active');
  127 |     } finally {
  128 |       await s.close();
  129 |     }
  130 |   });
  131 | 
  132 |   test('can change allowed roles for an account', async ({ page }) => {
  133 |     await page.goto('/admin/accounts');
  134 |     await page.getByText(clientName).click();
  135 |     // Super admin sees the full role set, including super_admin.
  136 |     await expect(page.getByTestId(TID.setRole('super_admin'))).toBeVisible();
  137 |     await expect(page.getByTestId(TID.setRole('admin'))).toBeVisible();
  138 |     await expect(page.getByTestId(TID.setRole('coach'))).toBeVisible();
  139 |   });
  140 | 
  141 |   test('assign the client to coach A', async ({ page }) => {
  142 |     const s0 = await signInAs('super_admin');
  143 |     let coachAId = '';
  144 |     try {
  145 |       coachAId = (await findUserByEmail(s0.db, coachAEmail))!.id;
  146 |     } finally {
  147 |       await s0.close();
  148 |     }
  149 |     await page.goto('/admin/assignments');
  150 |     await page.getByTestId(TID.adminAssignments).waitFor();
  151 |     await page.locator(`[data-testid="assign-client-row"][data-client-id]`, { hasText: clientName }).first().click();
  152 |     await page.locator(`[data-testid="assign-coach-row"][data-coach-id="${coachAId}"]`).click();
  153 |     await page.getByTestId(TID.confirmAccept).click();
  154 | 
  155 |     const s = await signInAs('super_admin');
  156 |     try {
  157 |       expect((await findUserByEmail(s.db, clientEmail))?.assignedCoachId).toBe(coachAId);
  158 |     } finally {
  159 |       await s.close();
  160 |     }
  161 |   });
  162 | 
  163 |   test('transfer the client from coach A to coach B', async ({ page }) => {
  164 |     const s0 = await signInAs('super_admin');
  165 |     let coachBId = '';
  166 |     try {
  167 |       coachBId = (await findUserByEmail(s0.db, coachBEmail))!.id;
  168 |     } finally {
  169 |       await s0.close();
  170 |     }
  171 |     await page.goto('/admin/assignments');
  172 |     await page.locator(`[data-testid="assign-client-row"]`, { hasText: clientName }).first().click();
  173 |     await page.locator(`[data-testid="assign-coach-row"][data-coach-id="${coachBId}"]`).click();
  174 |     await page.getByTestId(TID.confirmAccept).click();
  175 | 
  176 |     const s = await signInAs('super_admin');
  177 |     try {
  178 |       expect((await findUserByEmail(s.db, clientEmail))?.assignedCoachId).toBe(coachBId);
  179 |     } finally {
  180 |       await s.close();
  181 |     }
  182 |   });
  183 | 
  184 |   test('can view audit logs (governance)', async ({ page }) => {
  185 |     await page.goto('/admin/governance');
  186 |     await expect(page.getByTestId(TID.adminGovernance)).toBeVisible();
  187 |     await expect(page.getByText(/audit/i).first()).toBeVisible();
  188 |   });
  189 | 
  190 |   test('can view analytics', async ({ page }) => {
  191 |     await page.goto('/admin/analytics');
  192 |     await expect(page.getByTestId(TID.adminAnalytics)).toBeVisible();
  193 |   });
  194 | 
  195 |   test('can open a client detail (read-only oversight)', async ({ page }) => {
  196 |     const s0 = await signInAs('super_admin');
  197 |     let clientId = '';
  198 |     try {
  199 |       clientId = (await findUserByEmail(s0.db, clientEmail))!.id;
  200 |     } finally {
  201 |       await s0.close();
  202 |     }
  203 |     await page.goto(`/admin/clients/${clientId}`);
  204 |     // Renders without crashing; no plan-editing affordances here.
  205 |     await expect(page.locator('body')).toContainText(/[A-Za-z]/);
  206 |   });
  207 | 
  208 |   test('sees governance / feature-flag screen (super-admin only)', async ({ page }) => {
  209 |     await page.goto('/admin/governance');
  210 |     await expect(page.getByText(/feature flag/i).first()).toBeVisible();
  211 |     await expect(page.getByTestId(TID.navItem('adminGovernance'))).toBeVisible();
  212 |   });
  213 | });
  214 | 
```