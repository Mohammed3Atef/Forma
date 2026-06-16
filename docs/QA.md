# Forma — Automated QA System

End-to-end QA for the Forma coach-driven platform, built on Playwright. It logs
in as each real role (super_admin / admin / coach / client) against a **live
Firebase project**, drives the mobile UI, and asserts the Firestore security
rules and data schema directly. The goal is not happy-path coverage — it is to
**break the app and surface everything incomplete before release.**

---

## 1. Quick start

```bash
# 1. Install Playwright's browser (first time only)
npm run test:e2e:install

# 2. Make sure .env has the Firebase + E2E account vars (see §3)

# 3. Run the whole suite (builds the prod app, serves it, runs on mobile)
npm run test:e2e

# 4. Turn the results into docs/QA_REPORT.md and open the HTML report
npm run test:e2e:report
```

### Scripts

| Script | What it does |
|---|---|
| `npm run test:e2e` | Build → serve preview → run the full suite on a mobile viewport |
| `npm run test:e2e:ui` | Open Playwright's interactive UI runner |
| `npm run test:e2e:headed` | Run with a visible browser window |
| `npm run test:e2e:report` | Generate `docs/QA_REPORT.md` and open the HTML report |
| `npm run test:e2e:install` | Install the Chromium browser Playwright needs |

Run a single suite: `npx playwright test e2e/coach.spec.ts`.
Run one test: `npx playwright test -g "creates a client"`.

---

## 2. How it works

- **Production build under test.** `webServer` runs `npm run build && npm run preview`
  so the service worker / PWA / offline behaviour is exactly what ships.
- **Mobile-first.** The default device is `Pixel 7` (see `playwright.config.ts`).
- **Failure artifacts.** Screenshots, video, traces and console logs are captured
  **on failure** into `test-results/`. Open a trace with
  `npx playwright show-trace test-results/artifacts/.../trace.zip`.
- **Two assertion layers:**
  1. **UI** via Playwright + stable `data-testid` selectors (see §6).
  2. **Firestore rules + schema** via the Firebase JS SDK in the test process
     (`e2e/fixtures/firestore.ts`). This exercises the real security boundary —
     a *denied* write is the expected result for "forbidden" tests.

---

## 3. Environment

All vars live in `.env` (already present in this repo). The suite fails fast in
`e2e/global-setup.ts` naming any missing variable.

```
# Firebase web config (also used by the app at build time)
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=…
VITE_FIREBASE_PROJECT_ID=…
VITE_FIREBASE_STORAGE_BUCKET=…
VITE_FIREBASE_MESSAGING_SENDER_ID=…
VITE_FIREBASE_APP_ID=…

# Pre-provisioned E2E accounts (must already exist with the right roles)
E2E_SUPER_EMAIL / E2E_SUPER_PASSWORD     → role super_admin, active
E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD     → role admin, active
E2E_COACH_EMAIL / E2E_COACH_PASSWORD     → role coach, active
E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD   → role client, active
```

Optional: `E2E_PORT` (default `4390`).

> The four E2E accounts must already exist in the Firebase project with the
> correct `role` and `accountStatus: active` in their `users/{uid}` doc. The
> `preflight` suite verifies this and stops the run if anything is off.

---

## 4. What is covered

| Suite | File | Focus |
|---|---|---|
| Preflight | `e2e/preflight.spec.ts` | Env, Firebase init, every role logs in + correct role, rules allow/deny smoke |
| Super admin | `e2e/super-admin.spec.ts` | Create admin/coach/client, suspend/reactivate, roles, assign + transfer, audit, analytics, governance |
| Admin | `e2e/admin.spec.ts` | Read-only oversight, cannot edit super_admin, cannot self-promote, cannot edit client plans |
| Coach | `e2e/coach.spec.ts` | Create client (active + auto-assigned), author workout/nutrition/cardio plans, targets, notes, activity; isolation |
| Client empty-state | `e2e/client-empty.spec.ts` | Waiting-for-coach, no seed/Mohamed data, blank dynamic profile, no stale plans/targets |
| Client assigned | `e2e/client-assigned.spec.ts` | Exact coach-set plans render (warm-up-only / working-only, rest, video, instructions), logging flows |
| Security | `e2e/security.spec.ts` | Cross-tenant access, plan-edit denial, role escalation, suspended/pending/unauthenticated blocks |
| UI coverage | `e2e/ui-coverage.spec.ts` | Every major route: render, console errors, missing i18n, horizontal scroll, bottom nav |
| Arabic / RTL | `e2e/rtl.spec.ts` | `dir=rtl`, navigation, no layout break, switch back to English |
| Offline | `e2e/offline.spec.ts` | Log offline → reload offline persists → reconnect syncs → no seed data returns |
| Data integrity | `e2e/data-integrity.spec.ts` | `users`, `coachClients`, `clientData/{id}/plan/*`, logs location, no legacy `users/{uid}/workoutPlans` |
| Workout templates | `e2e/workout-templates.spec.ts` | Template snapshot on assign, `isCustomized` flips on plan edit, template/plan independence both directions |
| Coach library | `e2e/coach-library.spec.ts` | Exercise library CRUD via the Library tab, search filter, persistence under `coachAssets` |
| Library → plan | `e2e/coach-library-plan.spec.ts` | Adding a library exercise deep-copies into the plan; editing the library never changes the copy |
| Assessment | `e2e/assessment.spec.ts` | Client save-draft (`in_progress`) → submit; coach marks reviewed; admin read-only; client locked after review until coach reset |
| Plan versions | `e2e/plan-versions.spec.ts` | Save V1→V2 (active mirrors `plan/workout`), client sees active, coach restores V1, client reverts |
| Food alternatives | `e2e/food-alternatives.spec.ts` | Coach food + group CRUD, client swaps to an approved alternative (plan untouched), coach activity shows the tagged substitution |

The previous single-user, no-login suite is archived (and skipped) under
`e2e/legacy/` for reference.

---

## 5. Reading the report

`npm run test:e2e:report` parses `test-results/results.json` and writes
`docs/QA_REPORT.md` with:

- Pass / fail / skip summary.
- Failures bucketed into: Permission/Security, Broken pages, Static/hardcoded
  data, Firestore schema, Missing/broken features, Console errors, UI/UX.
- A **fix-priority** rollup: 🔴 Critical, 🟠 High, 🟡 Medium, ⚪ Low.

The HTML report (`test-results/html`) has the per-test detail, screenshots and
trace links.

---

## 6. Test IDs

Selectors live in `e2e/fixtures/selectors.ts` and map to `data-testid`
attributes in `src/`. Prefer these over text selectors so tests survive copy and
i18n changes. When you add UI, add a `data-testid` and register it here.

---

## 7. Notes & housekeeping

- **Test data accumulates.** Suites that exercise real creation flows (super
  admin, coach, client setup) create accounts with unique
  `…@forma-e2e.test`-style emails each run. Periodically prune `users` +
  `clientData` for those, or point the suite at a disposable Firebase project.
- **Serial by design.** Workers are pinned to 1 and RBAC suites run serially so
  shared assignment/transfer state stays deterministic.
- **Sandbox vs. machine.** The suite must run on a machine that can reach your
  Firebase project (auth + Firestore) and download the Playwright browser. CI or
  a developer workstation is the right place; an offline/locked-down sandbox is
  not.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing required environment variable(s)` | Add the named var to `.env`. |
| `Firebase is not configured` | Set `VITE_FIREBASE_API_KEY` + `VITE_FIREBASE_PROJECT_ID`. |
| `service worker never took control` | The preview build's PWA didn't register — check `vite-plugin-pwa` and that you ran the built preview, not `dev`. |
| Login times out | Confirm the E2E account exists, is `active`, and the password is correct. |
| `browserType.launch … Executable doesn't exist` | Run `npm run test:e2e:install`. |
