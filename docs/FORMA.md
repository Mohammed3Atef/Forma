# Forma — Setup & Operations

Forma is a mobile-first, multi-role fitness coaching platform (PWA + Capacitor) on
React + TypeScript + Vite + Zustand + Tailwind, backed by MongoDB Atlas + Vercel
serverless functions (custom JWT auth), with React Query for admin/coach online reads.

## Roles

| Role | Lands on | Can |
| --- | --- | --- |
| `super_admin` | `/admin` | Everything: accounts, roles/permissions, assignments, feature flags, audit logs, analytics |
| `admin` | `/admin` | Manage clients/coaches (client/coach roles only), suspend/reactivate, view analytics & audit |
| `coach` | `/coach` | Their assigned clients: view logs, assign plans/targets, notes, templates, announcements |
| `client` | `/` | The tracker app + coach notes/plans/targets |

Role → permission baselines live in [src/services/auth/roles.ts](../src/services/auth/roles.ts)
and are mirrored in [api/_lib/rbac.ts](../api/_lib/rbac.ts) — the API is the real
enforcement boundary (`requireUser()`/`requireRole()`/`requireActive()`/`requirePermission()`
in [api/_lib/withAuth.ts](../api/_lib/withAuth.ts) re-check the live Mongo user doc on every
request), the frontend copy only gates the UI. **Keep the two in sync.**

## 1. Backend configuration

Set env vars in `.env` (see [`.env.example`](../.env.example)):

```
MONGODB_URI=…
MONGODB_DB=…
JWT_ACCESS_SECRET=…
```

These are read server-side only, inside `api/**/*.ts` — never exposed to the client.
The app always needs a real Mongo connection now; run `vercel dev` (which wraps the Vite
dev server and serves `/api/*` routes) rather than plain `vite`/`npm run dev`, which only
serves the frontend and will 404 any `/api/*` call.

## 2. Auth & RBAC enforcement

There are no Firestore-style security rules anymore. Auth is custom JWT-based:
a short-lived (15 min) access token is kept in-memory on the client (never localStorage),
and a rotating refresh token (30 days) is stored hashed (SHA-256) in Mongo, delivered via
an httpOnly/SameSite=Strict cookie scoped to `/api/auth`. It's implemented in
`api/auth/*.ts` (signup, login, refresh, logout, me, update-profile, change-password,
request-password-reset, confirm-password-reset) and `api/_lib/tokens.ts`. On the frontend,
[src/services/auth/mongoAuth.ts](../src/services/auth/mongoAuth.ts) and
[src/services/auth/sessionStore.ts](../src/services/auth/sessionStore.ts) sit on top of the
shared [src/services/platformApi.ts](../src/services/platformApi.ts) client, which holds the
in-memory access token and does fetch + automatic refresh-on-401 retry.

RBAC is enforced server-side: `api/_lib/rbac.ts` defines `ALL_PERMISSIONS`/`ROLE_PERMISSIONS`
(ported from `roles.ts`), and `requireUser()` re-reads the live user doc from Mongo on every
authenticated request rather than trusting JWT claims for role/status — so a suspend or role
change takes effect on the very next request.

## 3. Bootstrap the first super admin (one-time)

Run the seed script instead of signing up and hand-editing the database:

```
node scripts/seed-mongo-admin.mjs
```

It reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` env vars (or pass `--dry-run`) —
see the header comment in [scripts/seed-mongo-admin.mjs](../scripts/seed-mongo-admin.mjs).
It creates (or promotes) the user directly in Mongo with `role: super_admin` and
`accountStatus: active`. Reload the app → it routes to the Super Admin dashboard. From
there, create and manage all other accounts in-app.

## 4. Account lifecycle

- **Self sign-up** defaults to `accountStatus: 'pending'` (see `SELF_SIGNUP_STATUS` in
  [roles.ts](../src/services/auth/roles.ts)). Pending/suspended users see a status
  screen and cannot read/write cloud data. Activate them from Admin → Accounts.
- **Admin-created accounts** go through [api/invites/*](../api/invites/): `POST /api/invites`
  creates the invite, and `POST /api/invites/claim` (fully public, no auth required)
  atomically creates the Mongo user doc and the `coachClients` relationship in one
  transaction-like flow. The backend creates the user and issues its own session token
  directly, so there's no need for a throwaway secondary auth-client workaround. Give the
  new user the temporary password to sign in (and change).

## 5. Data model

MongoDB collections are flat and keyed by `clientId`/`coachId`, rather than Firestore's old
recursive `clientData/{uid}/{subcollection}` path layout:

```
users                     identity: role, accountStatus, permissions, featureFlags, createdBy, assignedCoachId?
coachClients              coach⇄client relationship (status)
clientProfiles            client fitness profile (keyed by clientId); includes onboarding assessment +
                           status (not_started|in_progress|submitted|reviewed) + coach review fields
clientSettings            app settings (targets mirrored here), keyed by clientId
workoutLogs, nutritionLogs, cardioLogs, weightLogs, measurementLogs, checkIns   keyed by clientId
planVersions              coach-authored WorkoutPlan/MealPlan/CardioPlan version history
                           (days/sections/exercises/sets/reps/rest/video; meals/foods/macros/water +
                           substitutionPolicy; cardio sessions) — active version per kind is what the client reads
coachNotes, coachTargets  coach notes / targets, keyed by clientId
coachExercises, coachWorkoutTemplates, coachNutritionTemplates, coachFoods, coachFoodGroups   coach-owned reusable assets
adminAuditLogs            admin action trail
flags                     global / per-coach / per-client feature flag toggles
syncRecords, syncDeletions, syncSingletons   generic sync layer (replaces the old Firestore
                           clientData/{uid}/{collection} mirror) that SyncEngine talks to via api/sync/*
```

**Assessment review loop.** The onboarding assessment (part of `clientProfiles`) carries an
explicit `status`: the client may create/edit it until the coach marks it `reviewed`
(server-enforced in the API), the coach adds review notes / marks reviewed / resets it, and
admins are read-only. Submitting unlocks the client dashboard; a coach `reset` re-gates it.

**Plan versioning.** Coaches "Save as new version" from any plan editor → a numbered
snapshot in `planVersions` (the active one per kind is what the client reads). Restoring
an older version swaps the client's active plan. Clients never write versions.

**Food alternatives.** Coaches keep a food library + interchangeable `coachFoodGroups`.
Attaching a group to a planned meal item **snapshots** its foods onto the item
(`allowedAlternatives`), so the client swaps among coach-approved options without
touching the plan — the swap lives only in that day's `nutritionLogs` entry
(`itemOverrides` + a `substitutions` adherence tag: `approved_substitution` /
`client_custom_substitution`). The per-plan `substitutionPolicy` governs whether swaps /
custom foods are allowed and whether custom swaps are flagged for coach review.

**Coach-driven content.** Forma is not a personal tracker: a platform client starts
completely empty (no plan, meals, targets, videos, or demo data — there's no seeding on
the real platform). The coach is the source of truth and authors the real `WorkoutPlan` /
`MealPlan` / targets, which the client consumes read-only through the tracker UI
([planApi.ts](../src/services/platform/planApi.ts),
[clientSync.ts](../src/services/platform/clientSync.ts)). Until a plan is assigned the
client sees "Waiting for your coach to assign your plan."

**Coach onboarding.** A coach creates clients directly (name + email + temporary
password) from the Clients tab; the account is created `active` and auto-assigned to
that coach. The client logs in with those credentials. Admins/super-admins can also
assign and transfer clients between coaches.

The client's own LOGS are local-first (IndexedDB) and synced through the generic
`syncRecords`/`syncDeletions`/`syncSingletons` layer by the SyncEngine via `api/sync/*`;
coach-authored plans live in `planVersions` and are read directly
([SyncEngine.ts](../src/data/sync/SyncEngine.ts)).

## 6. Android build (Capacitor)

The native project is scaffolded under `android/`. To build:

```
npm run cap:sync        # build web + copy into native projects
npm run cap:android     # build + sync android + open Android Studio
```

Then build/run the APK from Android Studio (requires the Android SDK + JDK). Config is
in [capacitor.config.ts](../capacitor.config.ts); native status bar/splash are set up in
[src/lib/native.ts](../src/lib/native.ts).

## Known limitations

Acceptable trade-offs today:

- **Suspend/role-change takes effect immediately**, not eventually: unlike the old
  Firestore-rules approach (where a suspended user could keep acting for up to ~1h until
  their ID token expired), `requireUser()` re-reads the live Mongo user doc on every
  authenticated request, so a suspend or role change is enforced on the very next request.
- **Audit logs are best-effort**: create-only and immutable, but written by the same
  privileged API routes that perform the action rather than independently verified.
- **Invites**: admin-created accounts use a temp password rather than an emailed invite
  link.
- **Coach viewing progress-photo images**: photo *metadata* syncs, but the JPEG bytes
  are device-local unless uploaded to Bunny CDN.
