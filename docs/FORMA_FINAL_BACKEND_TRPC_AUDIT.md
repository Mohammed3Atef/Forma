# Forma — Final Backend / tRPC Contract Certification (Phase 1)

Date: 2026-09-24 · Scope: **backend / tRPC only** (no UI, navigation, responsive or feature work).
Method: programmatic router inventory → repo-wide caller tracing → guard/ownership/N+1/pagination/index audits → targeted certification tests on `mongodb-memory-server` (one-member replica set where transactions are involved) → P0/P1 fixes → static verification.

Static verification, run after **all** changes below:

| Command | Result |
|---|---|
| `npx tsc -b --noEmit` | clean |
| `npm run build` | OK (Vite + PWA, 153 precache entries) |
| `npm run test -- --run` | **14 files, 196 tests, 196 passed — deterministic** (was 12 files / 157 tests / 1 always-failing) |

No production database was written to by this audit. Every destructive/integration test ran against a throw-away in-memory Mongo.

---

## A–F. Inventory

| | Count |
|---|---|
| **A. Mounted routers** (`appRouter`, `api/_trpc/router.ts`) | **39** |
| **B. Leaf procedures** (enumerated from `appRouter._def.procedures`, not from memory) | **171** |
| **C. Procedures with at least one automated test after this audit** | **171 / 171** (every leaf has ≥1 success or negative assertion; see §36) |
| **D. Queries vs mutations** | 75 queries · 96 mutations |
| **E. Guard distribution** | `publicProcedure` 11 · `authedProcedure` 90 · `protectedProcedure` 13 · `roleProcedure(coach)` 25 · `roleProcedure(super_admin)` 8 · `roleProcedureNoActive(coach)` 2 · `permissionProcedure(...)` 22 |
| **F. Procedures with no caller at all** | 15 (§2) |
| **G. Frontend wrappers with no valid backend target** | **0** — every `trpc.<router>.<proc>` reference in `src/` resolves, and every one uses `.query`/`.mutate` matching the procedure type |
| **H. Dead legacy REST references (live code)** | **0** — all `apiFetch/apiGet/…` and `/api/<old-route>` hits are comments; the only non-tRPC network calls are Bunny CDN (browser → CDN), `/data/exercise-library.json`, and video `sourceUrl`s |

Previous known count: none was recorded programmatically; earlier passes worked from the router file list. The 171 figure is authoritative (dumped from the live router object).

---

## 1–2. Callers (repo-wide, `trpc.<router>.<proc>` + `createCaller` in tests)

- **150** procedures have an active frontend caller (all through `src/services/**` wrappers, except `invites.claim` called directly from `AcceptInvite.tsx` and `auth.refresh` via a raw `fetch('/api/trpc/auth.refresh')` in `platformApi.ts`).
- **6** are test-only: `coachAssets.exercises.update`, `coachAssets.billingPlans.get`, `coachNotes.update`, `coachNotes.delete`, `measurements.delete`, `auth.refresh` (raw fetch counted as a caller).
- **15** have no caller anywhere: `health.ping`, `coachAssets.workoutTemplates.update`, `coachAssets.nutritionTemplates.{get,update}`, `coachAssets.foods.{get,update}`, `coachAssets.foodGroups.{get,update}`, `coachAssets.supplements.{get,update}`, `coachAssets.billingPlans.update`, `logsCardio.get`, `logsChecklist.list`, `checkIns.delete`, `measurements.get`.
  - Classification: `health.ping` = intentional health check; the coachAssets `get/update` set = intentional CRUD completeness of the shared factory; the rest = orphaned after the dashboard-summary/N+1 consolidation. **None removed** (harmless, tested, and cheap); flagged DEAD/UNUSED in §36.
- **7** procedures are reachable only through a wrapper that nothing calls (`accountsApi.setPermissions`, `coachApi.saveClientProfile`, `coachApi.setCoachTargets`, `coachAssetsApi.saveNutritionTemplate/deleteNutritionTemplate`, `coachPlanApi.createTrialPlan`) — frontend dead code, P3, left for Phase 2.

## 3. Frontend wrappers

- No stale wrapper, no wrong method, no wrapper pointing at a removed procedure.
- Blind `as` casts exist on ~30 wrapper results (`accountsApi`, `coachApi.withId`, `clientCoachApi.withId`, `checkInApi.toCheckIn`, `planVersionsApi.toVersion`, `messagesApi`, `mongoAuth`, …). They hide nothing today (backend shapes were compared field-by-field, §25) but they are the reason a future backend rename would not fail `tsc`. P3, documented.
- Inconsistent React Query keys for the same procedure (P3, frontend): `['coachPlan',id]` vs `['coachPlanAdmin',id]`; `['user',id]`/`['coachUser',id]`/`['myCoach',id]`; `['myClients',id]` vs `['adminCoachClients',id]`; `['assessment',uid]` vs `['clientAssessment',id]`; `['coachPlanTiers']` vs `['coachPlanTiers','all']`; and one key shared by two different argument sets (`['coachPlans', coachId]` for `listCoachPlans(id)` and `listCoachPlans(id, true)`). Left for the Phase 2 UI pass.
- Intentional stubs that do nothing: `inviteApi.claimInvite` (throws, superseded), `inviteApi.unclaimInvite`, `coachClientsApi.archiveAndClearCoachData`, `notificationsApi.notify` — see finding T-4.

---

## I. Authorization findings

Guards (`api/_trpc/trpc.ts`): `authedProcedure` = resolved user, any status; `protectedProcedure` = + `accountStatus === 'active'`; `roleProcedure` = protected + role; `roleProcedureNoActive` = authed + role (only `coachPlans.me/createTrial`); `permissionProcedure` = protected + `hasPermission` (which itself returns false for any non-active account and true for every permission for `super_admin`).

The account-status semantics are consistent with the product: pending/suspended accounts can still **read their own data and flush their offline queue** (`authedProcedure` on the client-data, sync, messages, notifications, coachPlans.me, coachAssets reads) and are refused on every write via `protectedProcedure` / `isActiveSelf`. Verified in `certification.test.ts` (authorization matrix) and the pre-existing per-router suites. The historical regression (blanket `protectedProcedure` on reads) is not present.

| ID | Sev | Finding | Status |
|---|---|---|---|
| **AUTH-1** | **P0** | `ROLE_PERMISSIONS.coach = ['users.read']`. Every coach therefore passed every `users.read` gate: `adminUsers.list/byRole/searchClients` (every account's email+phone, searchable), `adminMembers.get` (all users + subscriptions), `adminGrowth.get` (MRR), `adminStats.get`, `usage.fetch`, **plus** the "self or users.read" checks in `coachClients.list/listMyClientUsers/dashboardSummaries/get`, `checkIns.listForCoachClients` and `coachAssets.*.list/get` — i.e. any coach could read any other coach's roster, clients' contact details, weekly check-ins (weights, notes, photo URLs) and full asset library. | **FIXED.** `coach: []` in `api/_lib/rbac.ts` (mirrored in `src/services/auth/roles.ts`). The single legitimate coach use ("Add Existing Client" lookup) is now granted explicitly in `adminUsers.searchClients` (coach OR `users.read`; clients refused). No frontend UI gated on `users.read` for coaches (grep-verified). Tests: `certification.test.ts` "permissionProcedure: a COACH holds no platform-wide permission…", "coach B cannot read coach A…"; `coachClients.test.ts` and `coachAssets.test.ts` cross-coach tests inverted to assert FORBIDDEN and admin OK. |
| **AUTH-2** | P2 | `adminUsers.get` (`protectedProcedure`) returned the full `PublicUser` (email, phone, socials, permissions, feature flags, onboarding) of **any** id to **any** active user. | **FIXED.** Full profile only to self, `users.read` holders, or a user with a coaching relationship to the target (either direction, any status — a client's timeline still resolves a former coach). Everyone else gets the same shape with contact/control fields blanked (`email:''`, no phone/socials/permissions/flags). All 12 frontend call sites only need `displayName` in the unrelated case (transfer-request counterparty, timeline). Test: "adminUsers.get returns contact details only to…". |
| AUTH-3 | P3 | `checkIns.request` stored a client-supplied `coachId` on the check-in doc. | **FIXED** — a coach's own id is always taken from the session; only an admin acting on a client's behalf may name a coach. |
| AUTH-4 | P3 | `messages.markRead` uses `fromRole: {$ne: ctx.user.role}` — a super_admin reading a thread marks both sides seen. | Documented; super_admin thread reads are an oversight path. |
| AUTH-5 | P3 | `invites.getByCode` (public) returns the whole invite doc (invitee email/phone, subscription price) to anyone holding the code. The code is the capability (no enumeration endpoint), so this matches the design. | Documented. |

Admin vs super_admin boundary verified: plain `admin` has `clients.readAll` but not `clients.writeAll` → reads client data, cannot write it, cannot enter message threads, cannot use super_admin procedures (`adminCoaches.*`, `coachPlans.adminUpdate`, `coachPlanTiers.save/saveCoreFeatures`, `coachPlanRequests.listPending/confirm/reject`, `adminUsers.delete`). Tested.

## J. Tenant-isolation findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| **TEN-1** | **P0** | **Transfer hijack.** `transfers.create` trusted the client-supplied `fromCoachId`; `transfers.resolve('accept')` then called `transferClientWithMode`, which ended the (possibly non-existent) `from` relationship with `.catch(() => undefined)` and created the new one. Coach A could file a request naming a colluding coach B as "from" for a client actually coached by C; B accepts; A gets an active relationship and `assignedCoachId` on the client. | **FIXED** at three layers: `create` asserts `fromCoachId` has an **active** relationship with the client (CONFLICT otherwise); `accept` re-asserts at approval time (relationship may have ended in between); `transferClientWithMode` refuses a named `fromCoachId` whose relationship is missing/inactive. Tests: "create refuses a fromCoachId that does not currently coach the client", "accept re-checks the relationship at approval time and rolls the request back…". |
| TEN-2 | P0 | Cross-coach reads via `users.read` — see AUTH-1. | **FIXED** (AUTH-1). |
| TEN-3 | — | Client data: every `clientId`-taking procedure (5 client routers, 60 procedures) resolves the target with `resolveClientId` then one of `canReadClientData` / `canWriteCoachOwned` / `isActiveSelf` / `canWriteClientOrCoach` (`api/client/_lib/access.ts`). A client naming another clientId, and a coach without an active relationship, get FORBIDDEN on every one. | **VERIFIED** (existing `client.test.ts` + certification "an unassigned coach cannot read or write…", "a client cannot reach another client…"). |
| TEN-4 | — | Messages: all six thread procedures call `authorizeThreadAccess` (self / assigned coach / `clients.writeAll`); edit/delete add sender + 2-minute window checks. | **VERIFIED** (`messages.test.ts`). |
| TEN-5 | — | Sync: no owner field in any input; every write keys `_id = ${ctx.user.id}__…` and sets `clientId: ctx.user.id`; every read/wipe filters by `ctx.user.id`. | **VERIFIED** ("sync: every write lands under the caller id…"). |
| TEN-6 | — | Coach assets: all 7 collections keyed `{coachId, id}` with a unique compound index; writes hard-scope to `ctx.user.id`; reads self-or-`users.read`. Same logical `id` across two coaches verified as two independent rows (`coachAssets.test.ts`). | **VERIFIED**. |
| TEN-7 | P3 | `coachClients.list({clientId})` lets a coach who **ever** had a relationship (including ended) read that client's full coaching history. Intended for the timeline. | Documented. |

## K. Validation findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| VAL-1 | P2 | `messages.send` accepted an empty message (`text: ''`, no attachment). | **FIXED** — zod refine: text or attachment required. Tested. |
| VAL-2 | P2 | `logs*.list` / `photos.list` `limit` was `z.number().optional()`: `-1` reached Mongo's `.limit(-1)`, `1.5` passed through. | **FIXED** — `int().positive()`. Tested. |
| VAL-3 | P3 | Plan `save` bodies (`workoutPlan/nutritionPlan/cardioPlan`) use `.passthrough()` — unknown fields are persisted verbatim. By design (coach-authored free-form plan), but it is a mass-assignment surface for plan docs only. | Documented. |
| VAL-4 | — | Verified rejections: zero/negative subscription terms, invalid enums, negative `ttlMs`, negative `since`, malformed relationship ids, invalid reaction, food query < 2 chars, empty core-features list; garbage pagination cursors on `adminUsers.list`/`adminAudit.list` are tolerated (first page), documented in §12. | **VERIFIED**. |

## L. Idempotency findings

| Operation | Mechanism | Status |
|---|---|---|
| `messages.send` retry (`clientMsgId`) | Was find-then-insert only. **FIXED**: partial unique index `{clientId, fromUserId, clientMsgId}` (self-ensured in `messagesCol()` + init script) and E11000 → return the winner. | **VERIFIED**: 6 concurrent retries → 1 row. |
| `coachPlanRequests.submit` | App-level cancel-then-insert + partial unique index `{coachId}` on actionable status. | **VERIFIED** (`coachPlans.test.ts`). |
| `coachPlanRequests.confirm` | CAS `{_id, status:'awaiting'}` inside a Mongo transaction with the plan apply + account un-pend. | **VERIFIED**: 2 concurrent confirms → 1 confirmed / 1 CONFLICT, one history entry. |
| Trial assignment (`ensureTrialPlan`) | `updateOne` + `$setOnInsert` + upsert. | **VERIFIED** (`coachPlans.test.ts`, `auth.test.ts`). |
| `coachAssets.seedStarterLibrary` | existing-ids diff + unique index; loser of a race returns per-step error, no duplicate rows. | **VERIFIED**: 2 concurrent seeds + 1 more → `count == distinct ids`, third run inserts 0. |
| `sync.push` / `deletionsPush` | upsert by deterministic id; replay-safe. | **VERIFIED** (`sync.test.ts`). |
| `invites.claim` | CAS on invite status + `users.emailLower` unique index + rollback of user/invite on join failure. | **VERIFIED**: 2 concurrent claims → 1 account, 1 relationship, counter = 1. |
| `transfers.resolve` | Was read-then-write. **FIXED**: CAS on `status:'pending'` for cancel/accept/reject; a failed move (cap, relationship changed) rolls the request back to `pending`. | **VERIFIED**: 2 concurrent accepts → exactly one active coach. |
| `checkIns.request`, `usage.recordActiveDay` | deterministic `_id`, upsert. | **VERIFIED**. |
| Uploads | No backend upload endpoint exists (browser → Bunny); nothing to certify here — see Z-1. | n/a |

## M. Concurrency findings

Tested with real concurrent `createCaller` invocations (not code inspection): message retry, starter seed, invite claim, payment confirm, transfer accept, plan-request submit (pre-existing test). Remaining known race, **not fixed**:

| ID | Sev | Finding |
|---|---|---|
| CON-1 | P2 | Client-cap enforcement (`coachCapStatus`) is a read of `activeClientCount` followed later by `$inc` — two simultaneous joins (invite claims / assigns) for a coach with one free slot can both pass and land the coach one over cap. Fix = atomic slot reservation (`findOneAndUpdate` with `$expr: {$lt:['$activeClientCount','$maxClients']}`) with release on failure across `assignExistingClient`, `claim`, `transferClientWithMode`. Deferred: bounded (over-by-one), three code paths, and `activeClientCount` is itself a best-effort counter (see O-3). |

## N. Transaction / atomicity findings

| Operation | Class | Notes |
|---|---|---|
| `auth.signup` (user + trial plan) | **ATOMIC** (Mongo transaction, session threaded) | verified |
| `coachPlanRequests.confirm` (request CAS + plan apply + account un-pend) | **ATOMIC** (transaction) | verified |
| `invites.claim` (invite CAS → user → relationship → counter) | **IDEMPOTENT/REPAIRABLE** — CAS + explicit rollback of user + un-claim on failure; counter bump is best-effort | verified |
| `transfers.resolve(accept)` | **IDEMPOTENT/REPAIRABLE** — CAS + rollback to `pending` on failed move (fixed this audit) | verified |
| `transferClientWithMode` (end old rel → archive → new rel → user.assignedCoachId → counters) | **REPAIRABLE, not atomic** — sequential writes; a crash mid-way leaves an ended old rel with no new rel (client unassigned, re-assignable). Documented as the pre-existing design ("one request, sequential awaited writes"). | P2, deferred |
| `assignExistingClient` / `endRelationship` | sequential (rel → user → counter); each step idempotent on retry | P3 |
| `adminUsers.setStatus/setRole` + `ensureTrialPlan` | sequential, idempotent | P3 |
| `coachPlanTiers.save` + `updateMany` propagation | sequential, idempotent (re-save re-propagates) | P3 |
| Audit / email / notifications | **best-effort side effects**, always after core state, `.catch`ed — a delivery failure never rolls back core state (verified by tests running with no `RESEND_API_KEY`) | — |

## O. Database / index findings

Indexes are declared in `scripts/mongo-init-indexes.mjs` and, for the ones the app cannot function safely without, self-ensured at runtime (`coachAssets` unique compound, `coachPlanRequests` partial unique, and now `messages` partial unique).

| ID | Sev | Finding | Status |
|---|---|---|---|
| O-1 | P2 | No index backing `messages.send`'s idempotency key. | **FIXED** (`uniq_clientMsgId`, partial). |
| O-2 | P3 | `coachPlans` had only `_id`; the daily cron scans `{plan:'trial', endsAt:{$lte}}`. | **FIXED** in init script (`plan_endsAt`); `coachPlanRequests` indexes also added to the script (were runtime-only). **Run `npm run mongo:init-indexes` against production once.** |
| O-3 | P2 | `activeClientCount` is a maintained counter (`bumpActiveClientCount` swallows errors) rather than a count — drift is possible; `coachCapStatus` treats a missing counter as "no plan" (safe direction). | Documented; a reconciliation script (count active rels per coach) is recommended before launch. |
| O-4 | P3 | Collections with only `_id`: `coachPlanTiers`, `platformSettings`, `banners`, `featureFlags`, `activeDays`, `usageStats`, `clientProfiles/Settings/WorkoutPlans/NutritionPlans/CardioPlans`, `coachTargets`, `subscriptionRequests`. All are keyed by `_id` for every hot read except `activeDays.ts` (usage.fetch, 30-day scan) — fine at current scale. | Documented. |
| O-5 | P3 | `coachClients.dashboardSummaries` aggregates `syncRecords` on `data.finished` (not indexed; the `{clientId, collection, syncedAt}` index narrows by clientId/collection first). | Documented. |

## P. N+1 / scaling findings

The earlier performance fixes are **still in place**: `coachClients.listMyClientUsers` (2 queries), `dashboardSummaries` (rels + 3 parallel bounded queries), `checkIns.listForCoachClients` (2 queries), `messages.coachThreadsSummary` (rels + 1 aggregation), `adminCoaches.detail` (bounded), `adminStats.get` (7 counts), `adminUsers.list` (cursor). No per-item DB loop was found in any list procedure. Remaining scaling notes (P3 unless stated):

- `adminCoaches.list`, `adminMembers.get`, `adminGrowth.get`: full-collection scans joined in memory (intentional admin dashboards; fine to low thousands of users).
- `coachPlanRequests.listPending`: one conditional write per **expired** row (`withDefensiveExpiry`), not per row.
- `coachThreadsSummary`: sorts every message of every active client on each call (no date window) — P2 at scale; add a `createdAt` window later.
- `sync.push`/`deletionsPush`: sequential `updateOne` per record, no max array length (P3 — bounded by device queue in practice).

## Q. Pagination findings

| Class | Procedures |
|---|---|
| cursor-paginated | `adminUsers.list`, `adminAudit.list` (`createdAt:_id`, 1–100/page; garbage cursor → first page, no throw) |
| timestamp-paginated | `messages.list` (`before` = load-older, 200/page, `hasMore`; `since` = forward poll, **unbounded** — P3; no `_id` tiebreak for same-ms boundary — P3) |
| watermark | `sync.pull`, `sync.deletionsPull` (`since`, **no page limit** — full dataset at `since:0`; P2 for very large offline histories) |
| limit-bounded | `logs*.list` (30–120 default, 200–500 max, now validated), `photos.list`, `notifications.list` (50 + `since`), `adminUsers.byRole/searchClients` |
| fixed, no paging | `coachNotes.list` (50; older notes unreachable — P3) |
| full dataset (bounded by ownership) | `coachClients.*`, `invites.list`, `transfers.list` (incoming/outgoing), `checkIns.list`, `measurements.list`, `planVersions.list`, `coachAssets.*.list` (grows with library — P3), `coachPlanRequests.listPending` (≤1 actionable per coach) |
| full dataset (platform-wide) | `adminCoaches.list`, `adminMembers.get`, `adminGrowth.get`, `transfers.list('pending')`, `banners`, `flags`, `coachPlanTiers.list` |

Boundary behaviour verified: empty page, invalid cursor, `limit` validation, messenger `before` paging (`messages.test.ts`).

## R. Auth / session findings

- Access token: HS256, 15 min, algorithm pinned on verify, held in memory only. Refresh: 48-byte random, **hashed** at rest, 30 days, **rotated on every refresh**, revoked on logout / password change / password reset. Cookie: `HttpOnly; SameSite=Strict; Path=/; Max-Age=…; Secure` (production). Verified in `auth.test.ts` (rotation, revoked-token reuse rejected, logout).
- `createContext` re-reads the user doc on **every** request and uses the DB `role`/`accountStatus`, not the token claims → suspending/pending an account takes effect immediately, not at token expiry. Invalid/expired tokens yield `user: null` (UNAUTHORIZED downstream), never a 500.
- Refresh loop: `platformApi.tryRefresh` is a raw fetch, deliberately outside the tRPC client whose 401 handler calls it — no recursion. `refreshAccount({silent})` clears the in-memory token on failure.
- Rate limits (Mongo fixed-window + TTL): signup 5/h per IP; login 10/15 min per (IP, email); change-password 5/h per account; reset request 5/h per email; Google sign-in 10/15 min per IP. Keyed via `x-forwarded-for` first hop. **Verified**: 11th login attempt → `TOO_MANY_REQUESTS` before any password work; a different email is a separate bucket. No `Retry-After` header (tRPC error envelope) — P3.
- `auth.me` is `authedProcedure` (pending/suspended can read themselves) — correct; `updateProfile`/`changePassword` are `protectedProcedure`.
- Google sign-in never auto-creates an account (NOT_FOUND) — verified with the verifier mocked.

## S. Messaging findings

All verified (`messages.test.ts` + certification): stable ids, `clientMsgId` idempotency (now DB-enforced), 2-minute edit/delete window on server `createdAt`, sender-only edit/delete, either-party reactions from a fixed allow-list, soft-delete redaction at the read boundary (`toPublicMessage`), attachment + text as two independent records, legacy attachments without `mimeType`, `markRead` semantics, cross-thread/cross-coach FORBIDDEN, plain admin excluded from threads. New: empty-message rejection (VAL-1).

## T. Plan / commercial findings

The single-plan model (Trial 2 clients/15 days → Pro 499 EGP/25 clients via Super Admin payment confirmation) is verified end-to-end:

| Case | Test |
|---|---|
| Signup always → active Trial, no request (no plan picker) | `auth.test.ts` |
| Admin-created coach / role-promoted coach get a Trial (`ensureTrialPlan`) | `admin.test.ts` + `adminUsers.ts` wiring (idempotent upsert) |
| Coach submit → super_admin sees pending → confirm applies the **request's snapshot**, not the live tier | `coachPlans.test.ts` |
| Snapshot immutability across a later tier edit; admin UI warns | `coachPlans.test.ts` (`snapshotStale` path) |
| One awaiting request per coach (DB partial unique) + concurrent submit | `coachPlans.test.ts` |
| Cancel / reject never touch `CoachPlanDoc`; expire only touches the request | `coachPlans.test.ts`, cron test |
| Concurrent confirm → single application | certification |
| Unconfirmed request never changes entitlements read by the cap check | certification "an unconfirmed paid request never changes…" |
| Trial expiry → cron raises one `trial_expired` request, pends the account only after `TRIAL_GRACE_DAYS`, idempotent, confirm un-pends in the same transaction | certification (cron block) |
| Tier `maxClients` edit propagates to tier-derived coaches only, never to manual overrides | `coachPlans.test.ts` |
| Backfill helper (`scripts/backfillCoachTrialPlans.mjs`) | dry-run by default, `$setOnInsert` — not executed against production by this audit |

Findings:

| ID | Sev | Finding | Status |
|---|---|---|---|
| T-1 | P2 | `coachCapStatus` ignores plan `status`/`endsAt` — an expired-trial coach can still add clients up to the cap during/after grace (the account-level `pending` after grace is the hard stop). Consistent with the "keep working during grace" decision. | Documented. |
| T-2 | P2 | Error semantics: a coach with **no** plan doc was told "at their client limit". | **FIXED** — `coachCapStatus()` distinguishes `no_plan` ("This coach has no active plan yet") from `at_cap` at all three call sites. Tested. |
| T-3 | P3 | `coachPlans.adminUpdate` re-sending a tier sets `status:'active'` even if the term has genuinely ended (pre-existing "renew" semantics). | Documented. |
| T-4 | P2 | Trial 7/5/3/1-day **reminder notifications are never delivered**: `notificationsApi.notify()` is a no-op and nothing server-side creates `trial_expiring`; `markTrialNotified` is also a no-op. Coaches only learn at expiry (cron email + banner). | Not fixed (needs a server-side reminder job — new feature). |
| T-5 | P3 | Before-production data: existing coaches carry `maxClients` from the old 10-client trial until the tier is re-saved (propagation) — either re-save the Trial tier in Admin Plans once, or accept. Plan docs missing `activeClientCount` are treated as "no plan" (blocks assigning) — run a one-off reconciliation (count active relationships). | Documented backfill. |

## U. Coach asset / library findings

- All 7 collections: `{coachId, id}` identity, unique compound index self-ensured; same logical id across coaches = independent rows (verified). Cross-coach save/update/delete → NOT_FOUND (scoped filter), cross-coach list/get → FORBIDDEN (after AUTH-1).
- Library → template sync (`propagateExerciseToTemplates`, `libraryExerciseId`, `librarySyncEnabled`, detach/reconnect, identity/media-only fields) verified in `coachAssets.test.ts`; manual client-plan refresh (`workoutPlan.updateExerciseFromLibrary`) verified in `client.test.ts`. Deleted source → NOT_FOUND on refresh (verified). Cross-coach source lookup is deliberately **not** supported (lookup is `coachId: ctx.user.id`) — after a keep-plans transfer the new coach's "update from library" reports NOT_FOUND for the previous coach's exercise ids (P3, documented; a super_admin caller always gets NOT_FOUND for the same reason).
- Starter seed: idempotent, concurrent-safe (verified), per-step error isolation.
- Factory kinds previously untested (nutritionTemplates, foods/foodGroups/supplements get/update/delete, billingPlans/workoutTemplates update/delete) now covered in `coverage.test.ts`.

## V. Client-data findings

Every client-domain procedure resolves ownership through `api/client/_lib/access.ts`; no leak found. Suspended/pending clients read their own data and cannot write (verified). `subscriptionRequest.get` positive path is exercised through `submit/decide/cancel` in `client.test.ts` (same helper); newly covered: `assessment.get`, `nutritionPlan/cardioPlan get+save` (full replace, not merge), all `logs*` get/list, `checkIns.get/delete`, `measurements.get`.

## W. Admin findings

- Every destructive action is server-enforced (`roleProcedure('super_admin')` for delete/tier/plan-request resolution; `permissionProcedure` for status/role/permission changes; self-modification and admin-on-admin blocked). Verified in `admin.test.ts`.
- After AUTH-1, oversight reads (`adminUsers.list/byRole`, `adminMembers/Growth/Stats`, `usage.fetch`, `flags`, `audit`, `transfers.list('pending')`) are admin/super_admin only (verified).
- `adminAudit.create` is `protectedProcedure` with internal restrictions for non-admins; its relationship check ignores status (ended relationship still passes) — P3.

## X. Sync findings

`sync.test.ts` + certification: push/pull cursor, deletion tombstones (live record removed), multi-device last-write-wins singletons with stale rejection, wipe scoped to caller, pending/suspended can flush, cross-user isolation with no owner field to forge. Known limitation: no page limit on `pull` (Q).

## Y. Cron / non-tRPC endpoint findings

Only two Vercel functions exist: `api/trpc/[trpc].ts` and `api/cron/daily-maintenance.ts` (`vercel.json` cron `0 3 * * *`, path verified). No upload handler, webhook or catch-all remains under `api/`.

| ID | Sev | Finding | Status |
|---|---|---|---|
| **Y-1** | **P1** | The cron handler was **fail-open**: with `CRON_SECRET` unset the bearer check was skipped and the endpoint (which expires requests, raises Pro requests and pends accounts) was callable by anyone. | **FIXED** — fail-closed: missing secret → 503 and no work; wrong/missing bearer → 401. Tested (no writes in either case). |
| Y-2 | P3 | The handler accepts any HTTP method. | Documented (Vercel cron uses GET; the secret is the real gate). |

## Z. Security findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| Z-1 | **P1 — outside the backend surface** | `VITE_BUNNY_API_KEY` ships in the browser bundle (`bunnyUploadApi.ts`): anyone can upload to / list / delete from the CDN storage zone (exercise videos, progress photos). Not a tRPC defect — the backend never touches Bunny — but it is a real production blocker for the product. Fix = server-side signed-upload/token endpoint (new backend function) + key rotation. | **Not fixed (out of Phase 1 scope); must be resolved before launch.** |
| Z-2 | P0 | Cross-tenant reads via coach `users.read` (AUTH-1) | **FIXED** |
| Z-3 | P0 | Transfer hijack (TEN-1) | **FIXED** |
| Z-4 | P2 | Profile over-exposure via `adminUsers.get` (AUTH-2) | **FIXED** |
| Z-5 | — | Mass assignment: no procedure takes `role`/`permissions`/`accountStatus`/`coachId` from a non-admin input path; `adminUsers.create/setRole/setPermissions` are permission-gated with admin-on-admin guards; sync/coach-asset writes derive the owner from the session. Plan `save` bodies are `passthrough` (VAL-3). | verified |
| Z-6 | — | Secrets in API output: `toPublicUser` strips `passwordHash`/`emailLower`; refresh tokens stored hashed; audit metadata carries ids/statuses only. | verified |
| Z-7 | P3 | Stale docs: `README.md` and `docs/FORMA.md` still document `POST /api/invites*` and link `api/_lib/withAuth.ts`; two hook comments still say "live via Firestore onSnapshot" (notifications are 25 s tRPC polling). | Documented. |

## 26. Legacy-data compatibility

Reads tolerate absent optional fields: messages without `mimeType`/`clientMsgId`/`reactions`, plans without `maxClientsOverride` (treated as tier-derived), tiers without marketing fields (`toPublicPlanTier` defaults), users without `displayNameLower`, invites with `expiresAt: null`. Verified where practical (certification "legacy data…"). **Backfills required before production**: index script (O-2); `activeClientCount` reconciliation (O-3); optional Trial tier re-save for cap propagation (T-5).

## 27–28. Rate limits & error-message quality

Rate limits: see R. Misleading-error table:

| Procedure | Before | After |
|---|---|---|
| `coachClients.assign` / `invites.claim` / transfer to a coach with **no plan** | "Coach is at their client limit" | "This coach has no active plan yet" (**fixed**) |
| `coachPlanRequests.confirm/reject` on a resolved or unknown id | CONFLICT "already resolved" for both | unchanged — CONFLICT for a resolved request is correct; an **unknown** id also reports CONFLICT (P3, acceptable: the CAS cannot distinguish without a second read) |
| `transfers.resolve` double-resolution | NOT_FOUND-ish via status read | CONFLICT via CAS (**fixed**) |
| `messages.edit/delete` past window | FORBIDDEN "The 2-minute edit/delete window has passed." | unchanged (accurate) |

## 31–32. Test quality & the flaky test

- The always-failing `coachClients.test.ts` "claimed display name…" case was **not a flake and not a product bug**: the file's `userDoc()` fixture defaults every user to `a@example.com`, the test inserted the coach with that default and then invited/claimed `a@example.com` — `invites.claim` correctly refused an email that already has an account. **Fixed** by giving the coach its own address. Deterministic ever since.
- Root cause of the earlier "whole suite fails in parallel" runs on this machine: 13 concurrent `mongod` processes exhausted local sockets/ports (ECONNREFUSED / "instance closed unexpectedly"). **Fixed** with `fileParallelism: false` in `vitest.config.ts` so `npm run test -- --run` is deterministic; per-file test isolation is unchanged.
- Weak tests strengthened/replaced: cross-coach read assertions (3 tests) now assert isolation + admin oversight; `end releases…` and other `resolves.toBeTruthy()`-only cases are backed by the new state-asserting suites.
- Remaining weak spots (P3): `auth.confirmPasswordReset` happy path + session revocation not directly asserted; several `expect(x).toBeTruthy()` reads in `messages.test.ts` (super_admin thread read, invalid reaction).

## 36. Procedure certification table

Legend — Guard: **pub** `publicProcedure`, **auth** `authedProcedure`, **prot** `protectedProcedure`, **role(x)**, **roleNA(x)** `roleProcedureNoActive`, **perm(x)**. Callers: **F** frontend, **T** test, **S** script, **—** none. Tests: **S** success, **N** negative, **X** cross-tenant, **I** idempotency/concurrency. Status: **V** VERIFIED · **VL** VERIFIED WITH KNOWN LIMITATION · **DU** DEAD/UNUSED (kept, tested) · no procedure is BROKEN or BLOCKED.

| Router.procedure | Q/M | Guard | Roles | Callers | Collections | Tests | Status / notes |
|---|---|---|---|---|---|---|---|
| health.ping | Q | pub | any | — | — | S | DU (health check, kept) |
| banners.list | Q | prot | active | F,T | banners | S,N | V |
| banners.forViewer | Q | prot | active | F,T | banners | S | V |
| banners.create / update / delete | M | perm(flags.manage) | admin+ | F,T | banners, adminAuditLogs | S,N | V |
| flags.list / save | Q/M | perm(flags.manage) | admin+ | F,T | featureFlags, adminAuditLogs | S,N | V |
| usage.recordActiveDay | M | prot | active | F | activeDays | S,N | V |
| usage.bump | M | prot | active | F | usageStats | S,N | V |
| usage.fetch | Q | perm(users.read) | admin+ | F | activeDays, usageStats | S,N | V (coach now FORBIDDEN) |
| messages.list | Q | auth + thread | self/coach/writeAll | F,T | messages, coachClients | S,N,X | V (`since` unbounded — Q) |
| messages.send | M | auth + thread | " | F,T | messages, notifications | S,N,X,I | V (fixed: DB-enforced idempotency, empty-message refine) |
| messages.edit / delete | M | auth + thread + sender + window | sender | F,T | messages | S,N,X | V |
| messages.react | M | auth + thread | either party | F,T | messages | S,N,X | V |
| messages.markRead | M | auth + thread | " | F,T | messages, notifications | S,N | VL (super_admin marks both sides — AUTH-4) |
| messages.coachThreadsSummary | Q | auth (self or writeAll) | coach/super | F,T | coachClients, messages | S,N,X | VL (no date window — P) |
| notifications.list / markRead | Q/M | auth | self feed | F,T | notifications, coachClients | S,N | V |
| coachAssets.exercises.list / get | Q | auth (self or users.read) | coach/admin | F,T | coachExercises | S,N,X | V |
| coachAssets.exercises.save / update / delete | M | role(coach) | coach | F,T | coachExercises, coachWorkoutTemplates (sync) | S,N,X,I | V |
| coachAssets.workoutTemplates.list / get / save / delete | Q/M | auth / role(coach) | " | F,T | coachWorkoutTemplates | S,N,X | V |
| coachAssets.workoutTemplates.update | M | role(coach) | coach | — | coachWorkoutTemplates | S,N,X | DU |
| coachAssets.nutritionTemplates.list / save / delete | Q/M | auth / role(coach) | " | F(dead wrapper for save/delete) | coachNutritionTemplates | S,N,X | V |
| coachAssets.nutritionTemplates.get / update | Q/M | " | " | — | " | S,N,X | DU |
| coachAssets.foods.list / save / delete | Q/M | " | " | F | coachFoods | S,N,X | V |
| coachAssets.foods.get / update | Q/M | " | " | — | " | S,N,X | DU |
| coachAssets.foodGroups.list / save / delete | Q/M | " | " | F | coachFoodGroups | S,N,X | V |
| coachAssets.foodGroups.get / update | Q/M | " | " | — | " | S,N,X | DU |
| coachAssets.supplements.list / save / delete | Q/M | " | " | F | coachSupplements | S,N,X | V |
| coachAssets.supplements.get / update | Q/M | " | " | — | " | S,N,X | DU |
| coachAssets.billingPlans.list / get / save / delete | Q/M | " | " | F(list,save,delete) T(get) | coachBillingPlans | S,N | V |
| coachAssets.billingPlans.update | M | role(coach) | coach | — | " | S,N | DU |
| coachAssets.seedStarterLibrary | M | role(coach) | coach | F | 5 asset collections | S,N,I | V |
| coachPlans.me | Q | roleNA(coach) | coach any status | F | coachPlans | S,N | V |
| coachPlans.createTrial | M | roleNA(coach) | " | F(dead wrapper),S | coachPlans, coachPlanTiers | S,I | V (legacy path; signup does this itself) |
| coachPlans.adminUpdate | M | role(super_admin) | super | F,S | coachPlans | S,N | V |
| coachPlanRequests.get | Q | role(coach) | coach | F | coachPlanRequests | S,N | V |
| coachPlanRequests.submit / cancel | M | role(coach) | coach | F | coachPlanRequests, coachPlans | S,N,I | V |
| coachPlanRequests.listPending | Q | role(super_admin) | super | F | coachPlanRequests | S,N | V |
| coachPlanRequests.confirm | M | role(super_admin) | super | F | coachPlanRequests, coachPlans, users (txn) | S,N,I | V |
| coachPlanRequests.reject | M | role(super_admin) | super | F | coachPlanRequests | S,N | V |
| coachPlanTiers.list | Q | auth | any | F | coachPlanTiers | S | V |
| coachPlanTiers.public / coreFeatures | Q | pub | any | F | coachPlanTiers, platformSettings | S | V |
| coachPlanTiers.save | M | role(super_admin) | super | F | coachPlanTiers, coachPlans (propagation) | S,N | V |
| coachPlanTiers.saveCoreFeatures | M | role(super_admin) | super | F | platformSettings | S,N | V |
| coachClients.list | Q | auth (self/related/users.read) | coach/client/admin | F,T | coachClients | S,N,X | V (TEN-7) |
| coachClients.listMyClientUsers / dashboardSummaries | Q | auth (self or users.read) | coach/admin | F,T | coachClients, users / syncRecords, clientProfiles, checkIns | S,N,X | V |
| coachClients.get | Q | auth (party or users.read) | " | F | coachClients | S,X | V |
| coachClients.assign | M | prot (coach self or coaches.assign) | coach/admin | F,T | users, coachClients, coachPlans | S,N | VL (CON-1) |
| coachClients.end | M | prot (owning coach or coaches.assign) | " | F,T | coachClients, users, coachPlans | S,N | V |
| coachClients.updateSubscription | M | prot (owning coach or writeAll) | " | F,T,S | coachClients | S,N | V |
| coachClients.transfer | M | prot (coaches.assign, +writeAll for fresh_start) | admin/super | F,T | coachClients, users, archivedClientData, plans, notes, targets | S,N | VL (sequential, N) |
| invites.list | Q | auth (coach self or coaches.assign) | coach/admin | F,T | signupInvites | S,N,X | V |
| invites.create | M | prot | coach/admin | F,T,S | signupInvites, users | S,N | V |
| invites.getByCode | Q | pub | any (code = capability) | F,T | signupInvites | S,N | VL (AUTH-5) |
| invites.revoke | M | prot (owner or coaches.assign) | " | F,T | signupInvites | S,N | V |
| invites.claim | M | pub | any | F,T,S | signupInvites, users, coachClients, coachPlans, refreshTokens | S,N,I | V |
| transfers.list | Q | auth (+coaches.assign for pending) | coach/admin | F,T | transferRequests | S,N | V |
| transfers.create | M | prot (coach) | coach | F,T | transferRequests, coachClients | S,N,X | V (fixed TEN-1) |
| transfers.resolve | M | prot (to-coach / from-coach / coaches.assign) | " | F,T | transferRequests, coachClients, users, coachPlans, archives | S,N,X,I | V (fixed: CAS + rollback) |
| profile.get / save | Q/M | auth + access.ts | client/coach/admin | F,T | clientProfiles | S,N,X | V |
| assessment.get / saveDraft / submit | Q/M | auth + access.ts | client self (+coach/admin read) | F,T | clientProfiles | S,N,X | V |
| assessment.setCoachNotes / review / reset | M | auth + canWriteCoachOwned | coach/super | F,T | clientProfiles | S,N | V |
| workoutPlan.get / save | Q/M | auth + access.ts | " | F,T | clientWorkoutPlans | S,N,X | V (VAL-3) |
| workoutPlan.updateExerciseFromLibrary | M | auth + canWriteCoachOwned | coach | F,T | clientWorkoutPlans, coachExercises | S,N | V (own-library only, U) |
| nutritionPlan.get / save · cardioPlan.get / save | Q/M | auth + access.ts | " | F,T | clientNutritionPlans / clientCardioPlans | S,N,X | V |
| planVersions.list / save / restore | Q/M | auth + access.ts | " | F,T | planVersions, plan collections | S,N | V |
| logsWorkout.get / list · logsNutrition.get / list · logsWeight.get / list · logsChecklist.get | Q | auth + canReadClientData | " | F,T | syncRecords | S,N,X | V |
| logsChecklist.list · logsCardio.get | Q | " | " | — | syncRecords | S,N | DU |
| logsCardio.list | Q | " | " | F | syncRecords | S,N | V |
| photos.list | Q | " | " | F,T | syncRecords | S,X | V |
| coachNotes.list / create | Q/M | auth + access.ts | " | F,T | coachNotes | S,N,X | V (fixed 50, Q) |
| coachNotes.update / delete | M | auth + canWriteCoachOwned | coach/super | T | coachNotes | S,N | V (test-only callers) |
| coachTargets.get / set | Q/M | auth + access.ts | " | F(get) F-dead(set) | coachTargets | S,N,X | V |
| checkIns.get / list / request / submit / review | Q/M | auth + access.ts (+ inline for submit) | " | F,T | checkIns, notifications | S,N,X | V (AUTH-3 fixed) |
| checkIns.listForCoachClients | Q | auth (self or users.read) | coach/admin | F,T | coachClients, checkIns | S,N,X | V (was cross-coach leak) |
| checkIns.delete | M | auth + canWriteCoachOwned | coach/super | — | checkIns | S,N | DU |
| measurements.list / save / delete | Q/M | auth + access.ts | client/coach | F,T | measurementLogs | S,N,X | V |
| measurements.get | Q | auth + canReadClientData | " | — | measurementLogs | S,N,X | DU |
| subscriptionRequest.get / submit / cancel / decide | Q/M | auth + access.ts | client self / coach | F,T | subscriptionRequests, coachClients | S,N,X | V (`get` positive path via submit/decide tests) |
| adminStats.get · adminMembers.get · adminGrowth.get | Q | perm(users.read) | admin+ | F,T | users, coachClients, coachPlans | S,N | V (full scans — P) |
| adminCoaches.list / detail | Q | role(super_admin) | super | F,T | users, coachPlans, coachClients, coachPlanTiers | S,N | V |
| adminAudit.list | Q | perm(audit.read) | admin+ | F,T | adminAuditLogs | S,N | V |
| adminAudit.create | M | prot (+internal role rules) | any active | F,T | adminAuditLogs, coachClients | S,N | VL (ended rel passes — W) |
| adminUsers.list / byRole | Q | perm(users.read) | admin+ | F,T | users | S,N | V |
| adminUsers.searchClients | Q | prot (coach or users.read) | coach/admin | F | users | S,N | V (explicit coach grant) |
| adminUsers.get | Q | prot (+redaction) | any active | F,T | users, coachClients | S,N,X | V (fixed AUTH-2) |
| adminUsers.create | M | perm(users.create) (+super for admin roles) | admin+ | F,T | users, coachPlans, adminAuditLogs | S,N | V |
| adminUsers.bulkSetStatus / setStatus / setRole / setPermissions | M | perm(users.manageStatus / manageRoles) | admin+ (no admin-on-admin) | F,T (setPermissions: dead wrapper) | users, coachPlans, adminAuditLogs | S,N | V |
| adminUsers.delete | M | role(super_admin) | super | F,T | users, adminAuditLogs | S,N | V |
| auth.signup | M | pub + rate limit | anon | F,T,S | users, coachPlans (txn), refreshTokens | S,N | V |
| auth.login / googleSignIn | M | pub + rate limit | anon | F,T | users, refreshTokens | S,N | V (login rate-limit tested) |
| auth.refresh / logout | M | pub (cookie) | session holder | F(raw fetch),T | refreshTokens, users | S,N | V |
| auth.me | Q | auth | any status | F,T | — | S,N | V |
| auth.updateProfile / changePassword | M | prot (+rate limit) | active self | F,T | users, refreshTokens | S,N | V |
| auth.requestPasswordReset | M | pub + rate limit | anon | F,T | passwordResets, users | S | VL (constant response by design) |
| auth.confirmPasswordReset | M | pub | token holder | F,T | passwordResets, users, refreshTokens | N | VL (happy path not directly asserted — §31) |
| sync.push / pull / deletionsPush / deletionsPull / singletonGet / singletonSet / wipe | Q/M | auth | any status, self only | F,T,S(push) | syncRecords, syncDeletions, syncSingletons | S,N,X,I | V (pull unbounded — Q) |
| foodSearch.search | Q | auth | any status | F | (external wger.de, in-memory cache) | S,N | V (external call stubbed; NaN guard fixed) |

Every one of the 171 leaf procedures appears above; none is BROKEN and none is BLOCKED FROM SAFE TESTING.

---

## ISSUES FIXED

| ID | Sev | Root cause | Files | Test |
|---|---|---|---|---|
| AUTH-1 / TEN-2 / Z-2 | P0 | Coach role carried `users.read`, a platform-wide oversight permission | `api/_lib/rbac.ts`, `src/services/auth/roles.ts`, `api/_trpc/routers/adminUsers.ts` (searchClients explicit grant), tests | certification auth matrix + tenant block; coachClients/coachAssets tests inverted |
| TEN-1 / Z-3 | P0 | `transfers.create`/`accept` trusted `fromCoachId`; service ended a phantom relationship | `api/_trpc/routers/transfers.ts`, `api/coach-clients/_service.ts` | certification transfer block (3 tests) |
| Y-1 | P1 | Cron bearer check skipped when `CRON_SECRET` unset | `api/cron/daily-maintenance.ts` | certification cron block |
| AUTH-2 / Z-4 | P2 | `adminUsers.get` exposed full contact profile to any active user | `api/_trpc/routers/adminUsers.ts` | "adminUsers.get returns contact details only to…" |
| L (messages) / O-1 | P2 | Retry guard was find-then-insert without a unique index | `api/messages/_data.ts`, `api/_trpc/routers/messages.ts`, `scripts/mongo-init-indexes.mjs` | 6 concurrent retries → 1 row |
| L (transfers) | P2 | `transfers.resolve` read-then-write; failed move left request `accepted` | `api/_trpc/routers/transfers.ts` | concurrent accept + rollback tests |
| T-2 | P2 | "at client limit" returned for a coach with no plan | `api/coach-clients/_data.ts` (`coachCapStatus`, `CAP_MESSAGES`), `_service.ts`, `invites.ts` | "error semantics…" |
| VAL-1 | P2 | Empty message accepted | `messages.ts` | certification |
| VAL-2 | P2 | Negative/fractional `limit` reached Mongo | `api/_trpc/routers/clientLogs.ts` | certification validation |
| AUTH-3 | P3 | `checkIns.request` trusted input `coachId` | `clientCheckIns.ts` | coverage (`coachId` asserted) |
| food NaN | P3 | Malformed upstream macro strings → NaN | `foodSearch.ts` | coverage (fetch stubbed) |
| O-2 | P3 | Missing `coachPlans` / `coachPlanRequests` indexes in the init script | `scripts/mongo-init-indexes.mjs` | — (script) |
| §32 | — | Deterministic test failure (fixture email collision) + parallel-mongod resource exhaustion | `coachClients.test.ts`, `vitest.config.ts` | full suite green |

## ISSUES NOT FIXED (with reason)

| ID | Sev | Reason |
|---|---|---|
| Z-1 Bunny key in bundle | P1 (product, not backend) | Requires a new signed-upload backend endpoint + key rotation — a feature, outside the tRPC contract audited here. **Must be done before launch.** |
| T-4 trial reminders never delivered | P2 | Needs a server-side reminder job; existing `notify()` stub is frontend-only. |
| CON-1 cap over-by-one race | P2 | Atomic slot reservation across 3 code paths; bounded impact; counter is already best-effort (O-3). |
| N transferClientWithMode non-atomic | P2 | Pre-existing sequential design; repairable (client ends unassigned, not lost); wrapping in a transaction touches 6 collections and the archive path — deferred to a dedicated pass. |
| Q sync.pull / messages `since` unbounded; coachNotes fixed 50; admin full scans; coachThreadsSummary no window | P2/P3 | Scale-dependent; documented with the concrete change each needs. |
| P3 items: frontend dead wrappers, inconsistent query keys, blind casts, stale README/docs, `getByCode` payload, `passthrough` plan bodies, markRead admin nuance, `adminAudit.create` ended-rel, missing `Retry-After`, `confirmPasswordReset` happy-path test | P3 | Documented for Phase 2 / cleanup. |

## TESTS ADDED

- `api/_trpc/routers/certification.test.ts` — 29 tests: authorization matrix, tenant isolation, transfer ownership + concurrency, message/seed/claim/confirm idempotency & races, cron auth + behaviour, rate limit, validation, error semantics, legacy data.
- `api/_trpc/routers/coverage.test.ts` — 10 tests: usage, the 20 factory-generated coachAssets procedures previously untested, core features, nutrition/cardio plans, assessment.get, all `logs*` get/list, checkIns.get/delete, measurements.get, foodSearch (upstream stubbed).
- 3 existing tests rewritten (cross-coach isolation), 1 fixture fixed.

**FINAL TEST COUNT:** 14 files · **196 tests · 196 passed** (`npm run test -- --run`).

**FLAKY TEST RESULT:** not a flake — deterministic fixture collision, fixed; suite is deterministic on this machine with `fileParallelism: false`.

---

## 39. BACKEND RELEASE VERDICT

**BACKEND CERTIFIED WITH NON-BLOCKING LIMITATIONS**

Every P0/P1 found **inside the backend/tRPC surface** (two cross-tenant/auth issues, one fail-open cron) is fixed and covered by tests; no cross-tenant path, auth bypass, money/plan corruption path or unexplained flaky test remains. The limitations above are P2/P3 and documented with concrete follow-ups.

Two items sit outside this phase's surface but **block the overall production launch** and are recorded here so Phase 2 cannot miss them: **Z-1** (CDN API key shipped to the browser) and the pre-launch data steps (**O-2** run `npm run mongo:init-indexes`; **O-3** reconcile `activeClientCount`; **T-5** optional Trial tier re-save).
