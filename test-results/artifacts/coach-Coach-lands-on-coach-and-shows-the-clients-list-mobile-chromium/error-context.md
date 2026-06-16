# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coach.spec.ts >> Coach >> lands on /coach and shows the clients list
- Location: e2e\coach.spec.ts:36:3

# Error details

```
Error: login(coach) failed — email=coach@forma.test url=http://localhost:4390/ loginForm=true shell=none loginError=Firebase: Error (auth/network-request-failed). :: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByTestId('coach-clients') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - img "Forma" [ref=e5]
  - heading "Welcome back" [level=1] [ref=e6]
  - paragraph [ref=e7]: Sign in to access your Forma dashboard.
  - generic [ref=e8]:
    - textbox "Email" [ref=e9]: coach@forma.test
    - textbox "Password" [ref=e10]: Test@123456
    - paragraph [ref=e11]: "Firebase: Error (auth/network-request-failed)."
    - button "Sign in" [ref=e12] [cursor=pointer]
  - button "Create a new account" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  48  |     if (await isVisible(page, ROLE_LANDING[role], 500)) return role;
  49  |   }
  50  |   return null;
  51  | }
  52  | 
  53  | /**
  54  |  * Sign out any persisted session. Firebase keeps auth in the `firebaseLocalStorageDb`
  55  |  * IndexedDB; clearing it + reloading returns the app to the login screen. Needed
  56  |  * because tests switch users within one browser context (e.g. a coach `beforeEach`
  57  |  * followed by a client `loginWith`).
  58  |  */
  59  | async function clearAuthState(page: Page): Promise<void> {
  60  |   await page.evaluate(
  61  |     () =>
  62  |       new Promise<void>((resolve) => {
  63  |         try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  64  |         let done = false;
  65  |         const finish = () => { if (!done) { done = true; resolve(); } };
  66  |         try {
  67  |           const req = indexedDB.deleteDatabase('firebaseLocalStorageDb');
  68  |           req.onsuccess = req.onerror = req.onblocked = finish;
  69  |         } catch { finish(); }
  70  |         setTimeout(finish, 1500);
  71  |       }),
  72  |   );
  73  | }
  74  | 
  75  | /** Ensure the login form is showing — signing out a stale session if one is active. */
  76  | async function ensureLoginForm(page: Page): Promise<void> {
  77  |   await page.goto('/');
  78  |   if (await isVisible(page, TID.loginForm, 3000)) return;
  79  |   // An authenticated shell is mounted — sign out, then return to the login screen.
  80  |   await clearAuthState(page);
  81  |   await page.goto('/');
  82  |   await page.getByTestId(TID.loginForm).waitFor({ state: 'visible', timeout: 30_000 });
  83  | }
  84  | 
  85  | const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  86  | const TRANSIENT_AUTH = /quota|too-many|network|unavailable|temporar/i;
  87  | 
  88  | /**
  89  |  * Fill + submit the login form, retrying TRANSIENT auth failures (Firebase
  90  |  * `auth/quota-exceeded` etc.) with a backoff — the suite's volume of password
  91  |  * sign-ins can briefly trip the rate limit. Returns once the form detaches or
  92  |  * the retries are spent (caller then verifies the landing).
  93  |  */
  94  | async function submitWithRetry(page: Page, email: string, password: string): Promise<void> {
  95  |   const waits = [0, 6000, 15000];
  96  |   for (let i = 0; i < waits.length; i += 1) {
  97  |     if (waits[i]) await sleep(waits[i]);
  98  |     await page.getByTestId(TID.loginEmail).fill(email);
  99  |     await page.getByTestId(TID.loginPassword).fill(password);
  100 |     await page.getByTestId(TID.loginSubmit).click();
  101 |     try {
  102 |       await page.getByTestId(TID.loginForm).waitFor({ state: 'detached', timeout: 12_000 });
  103 |       return;
  104 |     } catch {
  105 |       const err = (await page.getByTestId(TID.loginError).textContent().catch(() => '')) ?? '';
  106 |       if (!TRANSIENT_AUTH.test(err)) return; // not a rate-limit blip — let caller surface it
  107 |     }
  108 |   }
  109 | }
  110 | 
  111 | async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  112 |   await ensureLoginForm(page);
  113 |   await submitWithRetry(page, email, password);
  114 | }
  115 | 
  116 | /** Wait until the app has left the login screen (auth succeeded). */
  117 | async function waitForAuthenticated(page: Page): Promise<void> {
  118 |   await page.getByTestId(TID.loginForm).waitFor({ state: 'detached', timeout: 30_000 });
  119 | }
  120 | 
  121 | /**
  122 |  * Authenticate as a role and wait for that role's shell — not just the login
  123 |  * form detaching. Idempotent: if the target role's shell is already mounted it
  124 |  * returns immediately. Retries the submit once (a missed click leaves the form
  125 |  * up), and throws with diagnostics if the shell never appears.
  126 |  */
  127 | async function loginAs(page: Page, role: RoleKey): Promise<void> {
  128 |   await page.goto('/');
  129 |   const landing = ROLE_LANDING[role];
  130 |   // Fresh context → login form shows: skip straight to submitting.
  131 |   if (!(await isVisible(page, TID.loginForm, 3000))) {
  132 |     // No form: either already this role (idempotent no-op) or a stale session.
  133 |     if (await isVisible(page, landing, 1500)) return;
  134 |     await clearAuthState(page);
  135 |     await page.goto('/');
  136 |     await page.getByTestId(TID.loginForm).waitFor({ state: 'visible', timeout: 30_000 });
  137 |   }
  138 | 
  139 |   const { email, password } = credsFor(role);
  140 |   await submitWithRetry(page, email, password);
  141 |   try {
  142 |     await page.getByTestId(landing).waitFor({ state: 'visible', timeout: 30_000 });
  143 |   } catch (e) {
  144 |     const url = page.url();
  145 |     const formShown = await isVisible(page, TID.loginForm, 500);
  146 |     const shell = await currentShell(page);
  147 |     const err = await page.getByTestId(TID.loginError).textContent().catch(() => null);
> 148 |     throw new Error(
      |           ^ Error: login(coach) failed — email=coach@forma.test url=http://localhost:4390/ loginForm=true shell=none loginError=Firebase: Error (auth/network-request-failed). :: locator.waitFor: Timeout 30000ms exceeded.
  149 |       `login(${role}) failed — email=${email} url=${url} loginForm=${formShown} shell=${shell ?? 'none'} loginError=${err ?? 'none'} :: ${(e as Error).message}`,
  150 |     );
  151 |   }
  152 | }
  153 | 
  154 | interface Fixtures {
  155 |   consoleErrors: ConsoleCapture;
  156 |   login: (role: RoleKey) => Promise<void>;
  157 |   loginWith: (email: string, password: string) => Promise<void>;
  158 | }
  159 | 
  160 | export const test = base.extend<Fixtures>({
  161 |   consoleErrors: [
  162 |     async ({ page }, use, testInfo) => {
  163 |       const capture: ConsoleCapture = { errors: [], warnings: [] };
  164 |       page.on('console', (msg) => {
  165 |         const text = msg.text();
  166 |         if (isNoise(text)) return;
  167 |         if (msg.type() === 'error') capture.errors.push(text);
  168 |         else if (msg.type() === 'warning') capture.warnings.push(text);
  169 |       });
  170 |       page.on('pageerror', (err) => {
  171 |         const text = `${err.name}: ${err.message}`;
  172 |         if (!isNoise(text)) capture.errors.push(text);
  173 |       });
  174 |       await use(capture);
  175 |       // Attach captured logs so failures carry full context in the report.
  176 |       if (capture.errors.length || capture.warnings.length) {
  177 |         await testInfo.attach('console-logs', {
  178 |           body: JSON.stringify(capture, null, 2),
  179 |           contentType: 'application/json',
  180 |         });
  181 |       }
  182 |     },
  183 |     { auto: true },
  184 |   ],
  185 | 
  186 |   login: async ({ page }, use) => {
  187 |     await use(async (role: RoleKey) => {
  188 |       await loginAs(page, role);
  189 |     });
  190 |   },
  191 | 
  192 |   loginWith: async ({ page }, use) => {
  193 |     await use(async (email: string, password: string) => {
  194 |       await submitLogin(page, email, password);
  195 |     });
  196 |   },
  197 | });
  198 | 
  199 | export { expect };
  200 | export { waitForAuthenticated };
  201 | export type { Page, TestInfo, Locator } from '@playwright/test';
  202 | 
```