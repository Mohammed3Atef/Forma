# Forma: Firebase → MongoDB Migration Plan

**Status:** Planning only — no code has been changed. Scheduled to begin **after** the current
Firestore-based version launches and stabilizes, per project decision on 2026-09-08.

**Decision recap:** Full migration (auth + data), backend on Vercel serverless API routes,
executed as a dedicated post-launch project rather than folded into the current release.

---

## 1. Why this is a bigger move than "swap the database"

Forma today has **no backend server**. It's a Vite SPA that talks directly to Firestore from
the browser, and `firestore.rules` is the entire authorization layer — there is no Cloud
Functions code, no Express server, nothing in between the client and the database.

MongoDB has no equivalent of Firestore security rules. A MongoDB connection string can never be
shipped to a browser. So this migration is really **two projects in one**:

1. Move the data from Firestore documents/collections into MongoDB collections.
2. Build a real backend API (on Vercel serverless functions) that owns authentication, session
   management, and every authorization check the security rules currently perform — because the
   client will no longer be allowed to talk to the database directly at all.

Everything below is scoped around that reality.

---

## 2. Current architecture (audited from the live codebase)

**Auth:** Firebase Auth (email/password only, no social/OAuth). `sessionStore.ts` is the real
identity source of truth — on auth-state change it loads `users/{uid}`, self-provisions a
locked-down doc if missing (`provisionSelf` for clients, `provisionSelfCoach` for coach
self-signup, which also creates a trial `coachPlans/{uid}`). **Roles, permissions, and account
status are plain Firestore document fields — there are no Firebase custom claims anywhere.**
`SessionPhase` (`loading|anonymous|pending|suspended|ready`) derives from `accountStatus`.
A secondary Firebase App instance (`createUserSecondary.ts`) is used as a workaround so an
admin/coach can create another user's Auth account without losing their own session — a
client-side hack that goes away entirely once there's a real backend.

**Data — 16 top-level collections:**

| Collection | Purpose |
|---|---|
| `users` | Identity/RBAC doc: role, accountStatus, permissions[], featureFlags, assignedCoachId |
| `coachClients` | Coach↔client relationship + embedded Layer-B `Subscription` (client billing state) |
| `clientData/{clientId}/*` | Recursive namespace: profile, settings, plan (workout/nutrition/cardio), coachNotes, coachTargets, planVersions, checkIns, measurementLogs, notifications, messages, subscriptionRequest, deletions (sync tombstones), plus fitness logs synced from local IndexedDB |
| `coachPlans` | Layer-A: coach's own Forma subscription (tier/status/maxClients/activeClientCount) + `planChangeRequest` subcollection |
| `coachPlanTiers` | Admin-editable pricing/limit tiers |
| `transferRequests` | Cross-coach client takeover requests |
| `signupInvites` | Single-use client invite (doc id *is* the capability/code) |
| `planTemplates` | Legacy coach templates (superseded by `coachAssets`) |
| `coachAssets/{coachId}/*` | Exercises, workout/nutrition templates, foods, coach-defined billing plans |
| `adminAuditLogs` | Immutable, create-only audit trail |
| `featureFlags` | Global/coach/client-scoped flags |
| `activeDays`, `usageStats` | DAU/WAU/MAU + usage counters (new, Module 4) |
| `banners` | Targeted marketing banners (new, Module 3) |

**~25 service files** under `src/services/platform/*.ts` and `src/services/auth/*.ts` talk to
Firestore/Firebase Auth directly — every one of them needs a server-side counterpart.

**Realtime is narrow**, which is good news: only **messages** (live chat) and **notifications**
(alert feed + coach unread badge) use `onSnapshot`. Everything else — dashboards, plans,
members, growth, banners — is one-time fetches. This means the realtime problem is small and
contained, not systemic.

**Storage is already decoupled**: Firebase Storage isn't used at all. All media goes straight to
Bunny CDN (`bunnyUploadApi.ts`). Nothing changes there — it's orthogonal to this migration.

**No Cloud Functions exist today.** Everything server-side-equivalent currently lives in
`firestore.rules` only.

**Migration precedent already exists**: `scripts/` has 9 Firestore data scripts (backfills,
seeding, reconciliation), all client-SDK-based with `--dry-run` support. The new Mongo migration
script should follow the same dry-run-first discipline.

---

## 3. Target architecture

- **Database:** MongoDB Atlas (managed cluster, automated backups, encryption at rest).
- **Backend:** Vercel serverless functions in the same Vercel project as the app (`/api/*`),
  written in TypeScript, using the official `mongodb` Node driver with a cached/pooled
  connection (serverless functions must reuse connections across invocations — this is the #1
  cause of "too many connections" incidents in Mongo-on-serverless setups if done wrong).
- **Auth:** Custom auth, not Firebase Auth. Password hashing via `bcrypt`/`argon2`; sessions as
  short-lived **JWT access tokens + longer-lived refresh tokens**, access token in memory,
  refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie. A `sessions` (or
  `refreshTokens`) Mongo collection so refresh tokens can be revoked (logout-everywhere, suspend
  account takes effect immediately).
- **Authorization:** A single shared **permissions module** (already 90% written — `roles.ts` /
  `permissions.ts` are pure functions with no Firebase dependency and can move to the backend
  almost unchanged) plus per-route middleware that re-implements what the rules helpers did:
  `requireAuth`, `requireRole`, `requirePermission`, `requireActive`, `requireAssignedCoach`,
  `requireClientCapNotExceeded`. Every rule in `firestore.rules` becomes an explicit `if` in a
  route handler or middleware — nothing is implicit anymore, which is actually a maintainability
  win, but it's real work to port line-by-line.
- **Realtime (chat + notifications):** Serverless functions can't hold persistent WebSocket
  connections. Two viable options:
  - **Pusher or Ably (managed pub/sub)** — recommended for v1. Small monthly cost, near-zero
    ops burden, works cleanly from Vercel functions (publish on write, client subscribes
    directly).
  - **Polling fallback** — if avoiding a new vendor matters, notifications/unread-badge can
    tolerate a 5–15s poll; live chat degrades more noticeably but is still usable.
  - A self-hosted WebSocket server is possible but means running a second, always-on service
    outside Vercel's serverless model — not recommended given the "keep it simple" goal.
- **Storage:** unchanged — Bunny CDN stays exactly as-is.

---

## 4. Schema translation notes

MongoDB has no native subcollections, so Firestore's `clientData/{clientId}/{sub}` recursive
namespace flattens into **top-level Mongo collections with a `clientId` field** (indexed), e.g.
`clientProfiles`, `clientPlans`, `checkIns`, `measurementLogs`, `messages`, `notifications`, etc.
This is a schema *simplification*, not a like-for-like copy — it's the natural shape for Mongo
and also removes several of the more contorted parts of the current rules (the
`isCoachOwnedColl` whitelist, the status-aware `profile/assessment` special case).

`coachAssets/{coachId}/{document=**}` (also recursive) flattens the same way into
`coachExercises`, `coachTemplates`, `coachFoods`, `coachBillingPlans`, each carrying `coachId`.

Firestore's doc-id-as-capability pattern (`signupInvites/{code}`) and deterministic composite ids
(`coachClients/{coachId__clientId}`, `activeDays/{day__uid}`) both translate directly to Mongo:
either keep the composite string as `_id`, or make it a unique compound index — compound index is
the better fit for Mongo idioms and enables cleaner range queries (e.g. `activeDays` by day).

`getCountFromServer` aggregate reads (used in `analyticsApi.ts`) map to Mongo's
`countDocuments()`/aggregation pipeline `$count` — straightforward.

---

## 5. Migration phases

This is designed to run **after** the current launch, as its own tracked project, so the app
stays shippable and rollback-able at every step.

**Phase 0 — Foundations (no user-facing change)**
Stand up MongoDB Atlas cluster + Vercel API project scaffold + connection pooling. Port
`roles.ts`/`permissions.ts` to the backend unchanged (they're already Firebase-free). Write the
auth service (signup/login/refresh/logout/password-reset) end-to-end against a **new, empty**
Mongo `users` collection, fully tested, but not yet wired to the live app.

**Phase 1 — Shadow data migration + verification**
Write the Firestore→Mongo ETL script (Admin SDK read, Mongo driver write), run in `--dry-run`
first per the existing scripts/ convention, then run against a copy environment. Reconcile
document counts and spot-check every one of the 16 collections. Nothing in production reads from
Mongo yet.

**Phase 2 — Auth cutover**
Switch login/signup/session to the new backend + Mongo `users`/`sessions` collections behind a
feature flag, with Firebase Auth kept live as fallback for a defined window. This is the single
highest-risk phase (every existing account needs a path forward — likely a forced
password-reset-on-first-login-after-cutover, since Firebase password hashes can't be exported in
usable form).

**Phase 3 — Data read/write cutover, collection by collection**
Migrate collections in dependency order, each behind its own flag, easiest/lowest-risk first:
`featureFlags` → `banners` → `activeDays`/`usageStats` → `coachPlanTiers` → `coachAssets` →
`coachPlans` → `signupInvites`/`transferRequests` → `coachClients` → `clientData/*` (the big
one) → `adminAuditLogs` last (append-only, easy to backfill after the fact). Each collection's
old service file (e.g. `adminMembersApi.ts`) gets a new server-route-backed implementation with
the *same function signatures*, so the ~25 call sites in components change minimally.

**Phase 4 — Realtime cutover**
Move `messages`/`notifications` off `onSnapshot` onto the chosen pub/sub (Pusher/Ably) or polling,
last — because it's the smallest surface area but the most behaviorally different code path.

**Phase 5 — Decommission**
Once every phase is stable in production for an agreed soak period (recommend ≥2 weeks), turn off
Firestore reads/writes, remove `firebase/firestore` and `firebase/auth` deps, delete
`firestore.rules`, retire the old service files.

Every phase should be flag-gated and independently revertible — never a single big-bang cutover
of everything at once.

---

## 6. Testing & rollback

- Each ported rule from `firestore.rules` becomes an integration test on the corresponding API
  route (auth required / role required / status required / ownership required / field-level
  write restrictions) — treat the current rules file as the test *spec*, not just documentation.
- Keep the ETL script idempotent and re-runnable (matches the existing scripts/ dry-run
  convention) so a bad Mongo cutover can be re-seeded from Firestore at any point before Phase 5.
- Freeze non-migration schema changes during Phases 1–4 for any collection currently being cut
  over, to avoid writing to a Firestore doc shape the Mongo migration script no longer expects.

---

## 7. Risks to flag explicitly

- **Password migration**: Firebase Auth password hashes are not portable to a custom auth system.
  Plan on forced reset for existing users at cutover, or a "verify old Firebase password once,
  then migrate the hash" dual-check window if zero-friction migration is required.
- **Realtime UX regression**: chat/notifications will feel different post-migration unless
  Pusher/Ably is budgeted in from the start — don't let this get descoped as "just polling" without
  an explicit decision.
- **Serverless connection limits**: MongoDB + Vercel serverless is a well-known footgun
  (connection storms) if the driver isn't pooled/cached correctly — this needs to be right in
  Phase 0, not discovered in production.
- **This roughly doubles total backend code**: every one of the ~25 Firestore service files needs
  a real server-side counterpart plus route wiring plus tests. Budget accordingly — this is not a
  weekend project.

---

## 8. Immediate next step (when this project actually starts)

Re-run this same audit against whatever the codebase looks like at that time (new
collections/service files may exist by then — `banners`/`activeDays`/`usageStats` were added
mid-session and won't be the last additions), then execute Phase 0.
