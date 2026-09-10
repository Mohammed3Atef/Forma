# Forma — Train. Track. Transform.

A **mobile-first, multi-role fitness coaching platform** (PWA + Capacitor-ready). Coaches build and assign training, nutrition and cardio plans; clients follow and log them; admins and super-admins govern the platform. Every permission is enforced **server-side in Vercel serverless functions**, not just the UI.

- **Roles:** `super_admin` · `admin` · `coach` · `client` — each routed to its own mobile experience after login.
- **Coach-driven:** a client starts empty and only ever sees what their coach assigned or what they themselves logged. No demo/seed data on the platform.
- **Frontend:** React 18 + TypeScript (strict) + Vite
- **Styling:** Tailwind CSS (dark, mobile-first, RTL-ready)
- **State:** Zustand (client local-first data) + React Query (admin/coach online reads)
- **i18n:** react-i18next (EN/AR with RTL) · **Charts:** lightweight in-house SVG
- **Backend:** MongoDB Atlas + Vercel serverless functions, with custom JWT auth (server-enforced RBAC). **Images:** Bunny CDN (progress / assessment / check-in photos).
- **Client storage:** localForage (IndexedDB) + Cache API — offline-capable, last-write-wins sync
- **PWA:** vite-plugin-pwa (Workbox), installable. **Native:** Capacitor (Android project scaffolded).

> Full setup & operations runbook: [`docs/FORMA.md`](docs/FORMA.md).

---

## Roles at a glance

| Role | Lands on | Can |
| --- | --- | --- |
| **super_admin** | `/admin` | Everything: accounts, roles & permissions, coach⇄client assignment/transfer, feature flags, audit logs, analytics, read any client. |
| **admin** | `/admin` | Manage clients/coaches (client & coach roles only), suspend/reactivate, assign/transfer, **view-only** client details, analytics, audit. |
| **coach** | `/coach` | Their assigned clients only: author workout / nutrition / cardio plans, set targets, notes & announcements; **view their client's app read-only** (nutrition, measurements, photos, progress) and enter measurements; manage **subscription + account lifecycle** (term/price/freeze/end, freeze-request decisions); run **weekly check-ins**; create clients. |
| **client** | `/` | Follow the assigned plan, track workouts / nutrition / cardio / water / steps / weight, daily checklist & streaks, progress photos; see coach notes **inline next to each item**, in-app **notifications**, subscription status, and **weekly check-ins**. |

Role→permission baselines live in [`src/services/auth/roles.ts`](src/services/auth/roles.ts) and are mirrored in [`api/_lib/rbac.ts`](api/_lib/rbac.ts) — the API is the real enforcement boundary (it's what actually blocks a request), the frontend copy only gates the UI, so keep the two in sync.

---

## Quick start

```bash
npm install
vercel dev            # http://localhost:5173 (wraps Vite + serves /api/* as serverless functions)
```

The app always needs a real backend now: a MongoDB Atlas connection plus the Vercel dev server. Running plain `vite`/`npm run dev` only serves the frontend on port 5173 and any `/api/*` call (login, sync, etc.) will 404 — use `vercel dev` for real end-to-end work.

```bash
npm run build        # type-check + production build + PWA service worker
npm run preview      # serve the production build
```

Configure the backend by copying [`.env.example`](.env.example) to `.env` and filling in `MONGODB_URI`, `MONGODB_DB`, and `JWT_ACCESS_SECRET` (all read server-side only, inside `api/**/*.ts` — never exposed to the client). The same `.env` holds the optional `VITE_BUNNY_*` keys for image uploads — without them, photo upload is disabled and the UI degrades gracefully.

---

## What the coach controls (and the client consumes)

Everything the client sees is **coach-authored** or **client-logged** — nothing is hardcoded:

- **Onboarding assessment** — the client completes a step-by-step assessment (save-draft + submit); the coach reviews it, adds notes, marks it **reviewed** (which locks client edits) or **resets** it, then builds plans from it.
- **Reusable library** — coach-owned **exercises**, **workout templates**, **foods**, and **food-alternative groups** (the `coachExercises`, `coachWorkoutTemplates`, `coachNutritionTemplates`, `coachFoods`, `coachFoodGroups` collections). Templates/library items **snapshot** into the client's plan (never live-linked).
- **Workout plan** — days → sections → exercises with independent **warm-up** and **working** set counts (warm-up-only / working-only supported), reps, rest, video URL, instructions.
- **Nutrition plan** — meals → foods with macros, daily macro targets, water target, supplements, and a **substitution policy** with coach-approved **alternatives** per food (client swaps among them without changing the plan; swaps are tagged for adherence).
- **Cardio plan** — prescribed sessions (type, duration, frequency, notes) + numeric cardio/step/water targets.
- **Plan versioning** — every plan editor can **save a new version**; the active version is what the client sees, and the coach can **restore** any earlier one from the history.
- **Targets, coach notes & announcements**, and an optional starting **profile** (otherwise the client is required to complete name + body stats on first login).

### Coaching workflows

- **View-as-client (read-only)** — the coach can browse a client's Nutrition, Measurements, Photos and Progress the way the client sees them, and **enter a measurement** on the client's behalf (it syncs back to the client's app).
- **Entity-anchored notes** — the coach attaches a note to a specific item (a meal, food, exercise, workout day, cardio session, measurement, photo) by `entityType`+`entityId`; it renders **inline next to that item** for both coach and client, surviving any layout/device change.
- **In-app notifications** — every coach action (note, plan, targets, subscription, measurement, check-in…) raises a client notification, and client-initiated events (freeze request, assessment submit, check-in submit) raise a coach one. A **bell + unread badge** opens the feed; tapping an item **deep-links** to the exact screen/day/entity.
- **Subscription & account lifecycle** — the coach sets a subscription **term + price**, **freezes/ends** it, decides client **freeze requests** (with a note), keeps a **history** of past terms, and changes the client's **account status** (active / pending / suspended / trashed). Frozen/ended subscriptions put the client's plans into **read-only** mode.
- **Weekly check-ins** — the coach **requests** a weekly check-in; the client submits weight, training/nutrition adherence, hunger/energy/sleep, notes and optional photos; the coach **reviews** with feedback. Both keep a browsable history; the data is structured for future trend charts.

The client's **logs** (sets performed, food eaten, water, weight, measurements, photos, check-ins) are the only client-owned data; they sync to the cloud and feed the coach's **day-by-day activity view** (per-set weight × reps), the **view-as-client** screens, and the admin's read-only client view. Progress / assessment / check-in **photos upload to Bunny CDN** so the coach (and the client's other devices) can see them.

---

## Architecture

- **Role-based routing** — after auth, [`src/App.tsx`](src/App.tsx) mounts one of `ClientApp` / `CoachApp` / `AdminApp` ([`src/apps/`](src/apps/)) by role + account status; [`useSession`](src/services/auth/sessionStore.ts) is the identity source of truth.
- **Permission-gated UI** — `can()` / `useCan()` ([`src/services/auth/permissions.ts`](src/services/auth/permissions.ts)) hide controls; the real boundary is server-side in [`api/_lib/rbac.ts`](api/_lib/rbac.ts) + [`api/_lib/withAuth.ts`](api/_lib/withAuth.ts), which re-checks the live user doc in Mongo on every request.
- **Client data = local-first** — Zustand stores + `getDataSource()` (IndexedDB) + a last-write-wins [`SyncEngine`](src/data/sync/SyncEngine.ts) that pushes/pulls against the generic `syncRecords`/`syncDeletions`/`syncSingletons` sync layer via [`api/sync/*`](api/sync/).
- **Platform reads = online** — admin/coach read other users via React Query over [`src/services/platformApi.ts`](src/services/platformApi.ts) (a shared client holding the in-memory access token, with fetch + automatic refresh-on-401 retry) and thin services in [`src/services/platform/`](src/services/platform/) (`accountsApi`, `coachApi`, `clientCoachApi`, `planApi`, `coachClientsApi`, `checkInApi`, `notificationsApi`, `bunnyUploadApi`, `auditApi`, `flagsApi`, `analyticsApi`).
- **Per-account isolation** — switching accounts on one device wipes the previous user's local data (`scopeLocalToUser`) so nothing leaks between accounts.
- **Account creation** — admins/coaches create accounts directly through [`api/invites/*`](api/invites/) (`POST /api/invites` to create, `POST /api/invites/claim` — public, no auth required — to claim), which atomically creates the Mongo user doc and the `coachClients` relationship; no client-side workaround is needed since the backend can issue its own session token.

### Project structure

```
src/
  apps/                  ClientApp, CoachApp, AdminApp (role shells + routes)
  pages/
    auth/                Login, AccountPending, AccountSuspended
    coach/               clients, client detail, view-as-client, activity, check-ins, subscription panel, workout/nutrition/cardio editors, templates…
    admin/               overview, accounts (filter/delete), client detail, assignments, governance, analytics
    (client tracker)     Home, Workout, WorkoutSession, Nutrition, Cardio, Progress, CoachInbox, Notifications, CheckIn…
  services/
    auth/                sessionStore, roles, permissions, mongoAuth, cloudStore
    accounts/            accountService
    platform/            accounts/coach/plan/audit/flags/analytics APIs + queryClient + clientSync
    platformApi.ts       shared API client: in-memory access token, fetch + refresh-on-401 retry
    habits/ reminders/ video/
  stores/                Zustand: settings, workout, nutrition, cardio, habit, photo, …
  data/
    repositories.ts, dataSource.ts, bootstrap.ts
    adapters/local/      localForage implementations
    sync/SyncEngine.ts   last-write-wins local-first sync (→ api/sync/* → syncRecords/syncDeletions/syncSingletons)
  components/            AppShell, BrandBar, BottomNav, TopBar, Sheet, charts, …
  config/nav.ts          per-role bottom-nav tabs
  types/index.ts         all domain + RBAC types
api/                     Vercel serverless functions: auth/*, sync/*, invites/*, platform routes, _lib/{rbac,withAuth,tokens}.ts
capacitor.config.ts      native shell config (android/ scaffolded)
docs/FORMA.md            setup & operations
```

---

## Data model (MongoDB)

Collections are flat and keyed by `clientId`/`coachId` (no Firestore-style recursive subcollection paths):

```
users                     identity: role, accountStatus, permissions, featureFlags, createdBy, assignedCoachId?, phone?
refreshTokens             hashed (SHA-256) rotating refresh tokens for the JWT auth flow
passwordResets            password-reset request/confirm tokens
coachClients              coach⇄client relationship (status) + subscription term/price/freeze + subscriptionHistory
signupInvites             admin/coach-created invites, claimed via POST /api/invites/claim
transferRequests          client transfer requests between coaches
clientProfiles            client fitness profile (keyed by clientId)
clientSettings            app settings (keyed by clientId)
workoutLogs, nutritionLogs, cardioLogs, weightLogs, measurementLogs, checkIns   client logs (keyed by clientId)
planVersions              coach-authored WorkoutPlan/MealPlan/CardioPlan version history (active version is what the client sees; coach can restore any earlier one)
coachNotes, coachTargets  coach notes (entity-anchored) / targets (keyed by clientId)
notifications             in-app notifications (forRole: client | coach, seenAt)
subscriptionRequests      client freeze request → coach decision
coachExercises, coachWorkoutTemplates, coachNutritionTemplates, coachFoods, coachFoodGroups, coachSupplements, coachBillingPlans   coach-owned reusable assets
messages                  coach⇄client chat
adminAuditLogs            admin action trail
flags                     global / per-coach / per-client feature flag toggles
banners                   admin-managed announcement banners + usage tracking
syncRecords, syncDeletions, syncSingletons   generic sync layer the client's local-first SyncEngine pushes/pulls against via api/sync/*
```

Progress / assessment / check-in photo **bytes** live on Bunny CDN (the Mongo record stores the public `cdnUrl`); the original blob is also kept in the client's IndexedDB for offline/instant display.

---

## Deploying

### First super admin (one-time)
Run the seed script instead of hand-editing the database:

```bash
node scripts/seed-mongo-admin.mjs
```

It reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` env vars (or pass `--dry-run`) — see the header comment in [`scripts/seed-mongo-admin.mjs`](scripts/seed-mongo-admin.mjs) for details. This creates (or promotes) the user directly in Mongo with `role: super_admin` and `accountStatus: active`; no manual document editing required.

### Web hosting (Vercel)
Vite build → `dist`. On Vercel, add `MONGODB_URI`, `MONGODB_DB`, `JWT_ACCESS_SECRET` and the `VITE_BUNNY_*` vars (Production + Preview) — see [`.env.example`](.env.example); [`vercel.json`](vercel.json) handles SPA fallback + service-worker cache headers, and Vercel's file-based routing serves everything under `api/` automatically as serverless functions. There is no separate rules/indexes deploy step — RBAC is enforced in the API code itself.

### Android (Capacitor)
The native project is scaffolded under `android/`.

```bash
npm run cap:sync       # build web + copy into native
npm run cap:android    # build + sync + open Android Studio
```

Build/run the APK from Android Studio (needs the Android SDK + JDK).

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Type-check + production build + PWA service worker. |
| `npm run preview` | Serve the production build. |
| `npm run lint` | TypeScript type-check only. |
| `npm run cap:sync` | Build web + `cap sync` to native projects. |
| `npm run cap:android` | Build + sync Android + open Android Studio. |

---

## Known limitations

Acceptable trade-offs today:

- **Audit logs are best-effort** — create-only and immutable, but written by privileged API routes rather than independently verified. Fully tamper-proof logging would need a separate write path.
- **Invites** — admin/coach-created accounts use a temporary password rather than an emailed invite link.
- **Phone is a field, not an auth method** — the `phone` collected at sign-up / account creation is stored on the profile; sign-in is still email + password.
- **Bunny CDN image keys are public** — the storage key ships in the client bundle and CDN URLs aren't access-controlled (unguessable, but public). A dedicated zone or an upload proxy would harden this.
- **Hard account delete is record-only** — a client SPA can't hard-delete the Mongo user document; super-admin delete removes the identity record (prefer `disabled` for reversible deactivation).

---

## Notes

- **Privacy:** a client's logs/photos never leave their device unless cloud sync is active for their (active) account.
- **Local-first, not local-only.** The client's IndexedDB copy is always the source of truth while offline, and `SyncEngine` syncs opportunistically when a connection is available — but the app itself always requires a real Mongo-backed API (`vercel dev` or a deployed Vercel backend) to sign in and sync; there is no longer a standalone offline-only mode with the backend disabled.
