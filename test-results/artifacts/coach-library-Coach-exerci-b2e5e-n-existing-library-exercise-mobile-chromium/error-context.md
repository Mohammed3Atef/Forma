# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coach-library.spec.ts >> Coach exercise library >> edits an existing library exercise
- Location: e2e\coach-library.spec.ts:65:3

# Error details

```
Test timeout of 120000ms exceeded while running "beforeEach" hook.
```

```
Error: login(coach) failed — email=coach@forma.test url=http://localhost:4390/ loginForm=true shell=none loginError=Failed to get document because the client is offline. :: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByTestId('coach-clients') to be visible

```

```
Tearing down "context" exceeded the test timeout of 120000ms.
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
    - paragraph [ref=e11]: Working…
    - button "Sign in" [disabled] [ref=e12]
  - button "Create a new account" [ref=e13] [cursor=pointer]
```