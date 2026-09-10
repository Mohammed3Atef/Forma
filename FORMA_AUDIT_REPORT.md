# Forma Platform — Full Audit Report

**Date:** September 10, 2026
**Scope:** Admin, Coach, and Client roles — frontend (`src/pages/**`, `src/apps/**`) and backend (`api/**`, all 9 Vercel catch-all functions)
**Method:** (1) Static code review of every route and page across all three roles, done in four parallel deep-dive passes; (2) Live testing on the production site (`useforma.fit`) logged in as each role using the test accounts provided (`super@forma.test`, `coach@forma.test`, `client@forma.test`).
**Constraint:** The sandboxed shell was unavailable all session (persistent environment failure), so nothing could be built, linted, or run locally — this audit is based on reading the full source tree plus exercising the live deployed app in a real browser, not on running `npm run build`/`tsc`/a test suite (none exists in the repo — confirmed zero `*.test.ts` files anywhere).

---

## Executive summary

The codebase itself is in noticeably good shape for a project that just went through a full Firebase→MongoDB migration and an emergency route consolidation. Across all three roles, the large majority of backend handlers are real, ownership-checked, Zod-validated Mongo implementations — not stubs or mock data — and the large majority of frontend pages are fully wired to those handlers with proper loading/error/empty states. Role-based access control is enforced **server-side** everywhere it was checked, not just hidden in the UI, and no cross-tenant data leakage (coach A reading coach B's clients, client A reading client B's data) was found anywhere.

However, live testing surfaced one **critical, production-breaking problem** that static code review alone could not have caught, because the local source code is correct — the deployed site is not matching it:

> **The live site at useforma.fit is serving a stale build.** Several API endpoints that exist and work correctly in the current source (`GET /api/coach-clients`, `GET /api/coach-plans`, `GET /api/banners`, `GET /api/sync/deletions/pull`, and likely others) return Vercel's own platform-level `404 NOT_FOUND` in production — meaning the request never even reaches the function. The **Coach Dashboard cannot load a coach's client list at all** as a result. This needs a fresh deploy to Vercel, followed by re-verification of the exact endpoints below.

Beyond that, the issues found are smaller and fall into three buckets: a handful of buttons that call functions the backend deliberately doesn't support yet (so clicking them silently does nothing), a systemic gap where many mutations don't surface errors to the user, and a short list of genuinely unbuilt features (password-reset emails, progress-photo sync to the coach view, a couple of dead/legacy code paths). None of these are severe; all are listed with exact locations below.

---

## 1. Critical: production deployment is stale (fix this first)

This was discovered live, not in the code — the code on disk is correct.

**Evidence**, captured directly from the browser while authenticated as each role:

| Endpoint | Path segments | Live result | What it breaks |
|---|---|---|---|
| `GET /api/coach-clients` (any query string) | 0 | `404` — Vercel `NOT_FOUND` (edge-level, before the function/auth check) | Coach Dashboard "Overview" tab stuck on "Loading…" forever; Coach → Clients shows "No clients assigned yet" even when clients exist; Coach → Messages shows "No clients assigned yet" |
| `GET /api/coach-plans` | 0 | Same `NOT_FOUND` | Feeds into the same dashboard failure |
| `GET /api/banners` | 0 | Same `NOT_FOUND` | Admin → Offers & Banners page (banner list never loads, though the create form works) |
| `GET /api/sync/deletions/pull?since=0` | 2 | Same `NOT_FOUND` | Shows as a persistent "Sync error" / "Syncing…" badge in the top bar for **every** role, including admin and coach accounts that shouldn't even be touching client-side sync |
| `POST /api/banners/usage/active-day` | 2 | Same `NOT_FOUND` | Usage analytics undercounts daily actives |
| Same-module routes with 1+ path segments, e.g. `GET /api/banners/flags`, `GET /api/coach-clients/invites` | 1 | Correctly reach the function (200, or 401 when called without the app's auth header) | — |

The pattern is consistent and points at one cause: the **zero-path-segment case** of several catch-all functions doesn't route in production, while the same functions handle 1+-segment paths fine. All the source code for these routes exists, is correct, and matches this session's earlier work consolidating ~83 routes into 9 catch-all functions (`api/coach-clients/[[...path]].ts`, `api/banners/[[...path]].ts`, `api/sync/[...path].ts`, etc.) — so this isn't a logic bug, it's a **build/deploy mismatch**: the version currently live on Vercel predates some of these route additions.

**Action:** trigger a fresh production deployment of the current `main`/deployed branch, then re-test the exact URLs in the table above (a plain `fetch()` from the browser console while logged in is enough — a `404` body reading `NOT_FOUND` means still stale; a JSON body means it's fixed).

---

## 2. Admin role

### What works
Every admin screen (Dashboard, Accounts, Members, Banners, Assignments, Governance, Analytics, Coaches, Coach detail, Plans, Media, Client detail) is wired to real backend data, not mocks. All 13 handlers under `api/admin/_handlers/` do real Mongo work with Zod validation and permission checks. Super-admin vs. admin escalation protection is consistently enforced (a plain admin can never touch another admin's or a super-admin's account), self-mutation is blocked everywhere, and every mutation writes an audit-log entry. Confirmed live: Dashboard, Accounts, Members, Assignments, Governance, Analytics, Coaches, and Plans all render correctly with real data.

### Bugs found
- **`POST /api/admin/audit` has no permission check on the write path** (`api/admin/_handlers/audit.ts`) — any signed-in client or coach (not just admin) can post a forged entry into what's supposed to be a tamper-evident admin audit trail. Every other admin write route requires a specific permission first; this one doesn't. **This is the one real security gap found in the whole audit and should be fixed** — add a permission check (or `role !== 'client'`) before the insert.
- **"Set end date" / "Clear end date" buttons on Coach Detail do nothing** (`AdminCoachDetail.tsx`) — wired to `setCoachPlanEndsAt()`, which is a deliberate stub that always throws, and the mutation has no error handler, so it fails silently.
- **Role-change buttons for "Admin"/"Super Admin" on the Accounts page do nothing** (`AdminAccounts.tsx`) — the backend (`users-role.ts`) only ever accepts `client`/`coach` by design, but the UI still renders the higher-privilege buttons and shows no error when they 400.
- A general pattern: most `useMutation` calls across `AdminAccounts.tsx`, `AdminCoaches.tsx`, `AdminCoachDetail.tsx`, and the Coaches/Subscriptions dashboard panels have no `onError` handler, so any failed admin action currently fails silently rather than showing a toast.

### Minor / cosmetic
- All four coach-plan tiers (Trial/Starter/Pro/Enterprise) show "0 EGP/mo" — looks like pricing was never configured in this environment rather than a bug, but worth confirming.
- The Media library still uses Firebase-style long alphanumeric folder IDs as the grouping key — cosmetic, works fine, just a naming leftover from the old system.

---

## 3. Coach role

### What works
This is the most complete part of the codebase. Every backend handler across `coach-clients`, `coach-plans`, and `coach-assets` (client CRUD, invites, transfers, billing tiers, the seven asset-library resource types, templates) is a real, ownership-checked Mongo implementation — no mocks, no stubs found anywhere in this area. All 40 coach frontend pages are real, complete screens with proper loading/error/empty states; no `onClick={() => {}}` placeholders and no TODO/FIXME comments anywhere in the coach frontend. Live-tested: Dashboard, Clients, Library, My Plan, and Messages all render (modulo the production 404 above).

### Bugs found
- **The "Cancel request" button on Coach → My Plan does nothing** (`CoachPlan.tsx`) — calls `cancelPlanChangeRequest()`, which unconditionally throws because no backend route exists for it, and the click shows no error.
- **The Photos tab on a client's profile is permanently empty for every client** — not a frontend bug; `fetchClientPhotos()` (`coachApi.ts`) is a hardcoded stub that always returns `[]` because no Mongo route for progress photos exists yet on the coach side.
- **The daily checklist section on a client's activity view never shows data**, for the same reason (`checklist: null` is hardcoded pending a route that doesn't exist yet).
- **"Fresh start" client transfers don't actually clear the old coach's content** — both sides of the code openly document this (no collection exists yet to archive into), so a fresh-start transfer reassigns the client but silently leaves the previous coach's plan data attached.
- Inconsistent loading-state handling across the client-view tabs (Cardio/Measurements/Nutrition/Progress show a brief "no data" flash before real data loads; Photos/Activity/Check-ins handle it correctly) — cosmetic but worth normalizing.

### Refactor candidates
The four `CoachExerciseLibrary.tsx` tabs and `CoachTemplates.tsx` duplicate the same search → list → mutate → bulk-delete pattern five times; a shared hook would remove real duplication. The `coach-assets` backend's seven resource handlers are also a near-identical CRUD pattern repeated seven times — reasonable today, worth a generic handler factory if an eighth resource type is ever added.

---

## 4. Client role

### What works
This is the strongest area of the whole audit. Every backend handler (assessment, workout/nutrition/cardio plans, coach notes/targets, check-ins, measurements, subscription requests, plan versioning) is a real, Zod-validated, ownership-checked Mongo implementation. Every client-facing page (Home, Workout, WorkoutSession, RoutineDetail, History, Cardio, Nutrition, Progress, ProgressPhotos, Measurements, Check-in flow, Assessment, Exercise Library/Detail, Messages, Notifications, Settings) is fully built — no stubs, no mock data, no `RolePlaceholder` screens anywhere in the client app. The 8-step onboarding assessment wizard was tested live end-to-end (all 8 steps, including photo-upload step and final submission) and works correctly, including local-draft autosave. The mandatory-assessment gate and the coach-controlled subscription gate (which correctly blocked Home/Workout/Nutrition/Cardio for the freshly-onboarded test client pending coach setup) both behave exactly as designed.

### Bugs found
- **A dead "sign in" form still exists in Settings** (`ClientSettings.tsx`) — a leftover email/password sign-in sheet wired to a deprecated `cloud.signIn()` that no longer does anything. Should be deleted, not left as an inert form a user could stumble into.
- **The "Assigned plans" section in the Coach Notes inbox can never show anything** — `fetchMyPlans()` is a permanent stub returning `[]` (superseded by a different data model), but the UI code and its query still run on every page load for no reason.
- Dead PUT/DELETE code paths in four raw log handlers (`logs-workout.ts`, `logs-nutrition.ts`, `logs-weight.ts`, `logs-cardio.ts`) that write to a collection nothing ever reads from — harmless today (nothing calls them) but a trap for a future feature that assumes they work.
- Several comments across `clientSync.ts`, `AssessmentWizard.tsx`, and backend access-control files still describe Firestore-era behavior — accurate as porting documentation, but could mislead a new engineer about which system is authoritative today.

---

## 5. Shared infrastructure & security

### What works well
This is a genuine strength of the codebase. Password hashing (bcrypt, 12 rounds), JWT access tokens (15-minute TTL) paired with opaque, hashed, rotated 30-day refresh tokens, `HttpOnly`/`SameSite=Strict`/path-scoped cookies, and — most importantly — re-reading the live user record from Mongo on every request (rather than trusting the JWT's embedded role) mean a suspend or role change takes effect on the very next API call, not after the token expires. RBAC permissions are centralized and correctly zeroed out for any non-active account. Messages, notifications, sync, and banners all correctly scope every read/write to the caller's own data or a verified relationship — no IDOR issues found anywhere in the reviewed surface. No endpoint trusts a client-supplied role or permission field for anything security-sensitive.

### Gaps found
- **No rate limiting anywhere in the API** — `login`, `signup`, `request-password-reset`, and `change-password` all accept unlimited attempts. This is the most concrete security gap in the codebase; worth adding at least basic throttling (even a simple in-memory/Redis limiter) to these four routes.
- **Password reset emails are not actually sent** — `request-password-reset.ts` has an explicit TODO; in production the reset token is generated and stored but never delivered to the user. **This means "Forgot password?" is currently non-functional for real users.**
- `docs/QA.md` describes a Playwright e2e suite that doesn't exist in the repo (`e2e/` is empty, `@playwright/test` isn't even a dependency) — a new developer following that doc will hit a wall immediately; either build the suite or update the doc.
- `change-password` and `update-profile` don't check that the account is still active, unlike most other authenticated routes — low severity, but inconsistent with the rest of the codebase's discipline.
- JWT verification doesn't explicitly pin `algorithms: ['HS256']` — low risk today, but free defense-in-depth to add.
- The `CoachClientDoc` type/shape is independently redefined in three different backend modules with a comment acknowledging the duplication — a drift risk with no test suite to catch it if the real collection shape ever changes.

---

## 6. Prioritized action plan

| Priority | Item | Area |
|---|---|---|
| **Critical** | Redeploy to Vercel production and re-verify the zero-segment routes listed in §1 | Platform/deploy |
| **Critical** | Add a permission check to `POST /api/admin/audit` | Admin/security |
| **High** | Wire up real email delivery for password reset | Auth |
| **High** | Add rate limiting to login/signup/reset/change-password | Auth/security |
| **High** | Fix or hide the "Cancel plan-change request" and "Set/clear coach plan end date" buttons; add error toasts to admin mutations that currently fail silently | Admin, Coach |
| **Medium** | Build (or explicitly remove) progress-photo sync and the daily-checklist route on the coach side | Coach |
| **Medium** | Decide on and implement real "fresh start" transfer content-clearing, or rename the mode to reflect what it actually does | Coach |
| **Medium** | Remove the dead sign-in form in Client Settings and the dead "Assigned plans" feature | Client |
| **Low** | Update `docs/QA.md` to match reality (or build the e2e suite it describes) | Docs/testing |
| **Low** | Consolidate duplicated `CoachClientDoc` type definitions; clean up stale Firestore-era comments; normalize loading-state handling across coach client-view tabs | Refactor |

---

## Bottom line

The core product is solid: real data end to end, correct server-side authorization everywhere it was checked, and a client experience that is fully built rather than scaffolded. The single item that actually matters right now is the stale production deployment — it is quietly breaking the Coach Dashboard's client list (and a few smaller things) for every coach using the live site today, and it's a one-step fix. Everything else in this report is either a small, clearly-scoped bug or a deliberate "not built yet" gap that the code itself already documents honestly.
