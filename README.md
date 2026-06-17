# Forma — Train. Track. Transform.

A **mobile-first, multi-role fitness coaching platform** (PWA + Capacitor-ready). Coaches build and assign training, nutrition and cardio plans; clients follow and log them; admins and super-admins govern the platform. Every permission is enforced in **Firestore security rules**, not just the UI.

- **Roles:** `super_admin` · `admin` · `coach` · `client` — each routed to its own mobile experience after login.
- **Coach-driven:** a client starts empty and only ever sees what their coach assigned or what they themselves logged. No demo/seed data on the platform.
- **Frontend:** React 18 + TypeScript (strict) + Vite
- **Styling:** Tailwind CSS (dark, mobile-first, RTL-ready)
- **State:** Zustand (client local-first data) + React Query (admin/coach online reads)
- **i18n:** react-i18next (EN/AR with RTL) · **Charts:** lightweight in-house SVG
- **Backend:** Firebase Auth + Firestore (rules-enforced RBAC). **Images:** Bunny CDN (progress / assessment / check-in photos).
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

Role→permission baselines live in [`src/services/auth/roles.ts`](src/services/auth/roles.ts) and are mirrored in [`firestore.rules`](firestore.rules) — keep the two in sync.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

- **Without Firebase env vars** → runs **local-only** as a standalone single-user tracker (the original offline app, seeded with demo data). Great for UI work.
- **With Firebase configured** → the full coach-driven platform: login is required and you're routed by role.

```bash
npm run build        # type-check + production build + PWA service worker
npm run preview      # serve the production build
```

Configure Firebase by copying your web-app config into `.env` (see [`.env.example`](.env.example)); the keys are read in [`src/data/adapters/firebase/config.ts`](src/data/adapters/firebase/config.ts). The same `.env` holds the optional `VITE_BUNNY_*` keys for image uploads — without them, photo upload is disabled and the UI degrades gracefully.

---

## What the coach controls (and the client consumes)

Everything the client sees is **coach-authored** or **client-logged** — nothing is hardcoded:

- **Onboarding assessment** — the client completes a step-by-step assessment (save-draft + submit); the coach reviews it, adds notes, marks it **reviewed** (which locks client edits) or **resets** it, then builds plans from it.
- **Reusable library** — coach-owned **exercises**, **workout templates**, **foods**, and **food-alternative groups** under `coachAssets`. Templates/library items **snapshot** into the client's plan (never live-linked).
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
- **Permission-gated UI** — `can()` / `useCan()` ([`src/services/auth/permissions.ts`](src/services/auth/permissions.ts)) hide controls; the backend rules are the real boundary.
- **Client data = local-first** — Zustand stores + `getDataSource()` (IndexedDB) + a last-write-wins [`SyncEngine`](src/data/sync/SyncEngine.ts) mirroring to `clientData/{uid}`.
- **Platform reads = online** — admin/coach read other users via React Query over thin Firestore services in [`src/services/platform/`](src/services/platform/) (`accountsApi`, `coachApi`, `clientCoachApi`, `planApi`, `coachClientsApi`, `checkInApi`, `notificationsApi`, `bunnyUploadApi`, `auditApi`, `flagsApi`, `analyticsApi`).
- **Per-account isolation** — switching accounts on one device wipes the previous user's local data (`scopeLocalToUser`) so nothing leaks between accounts.
- **Account creation without Cloud Functions** — admins/coaches create accounts via a throwaway secondary Firebase app ([`createUserSecondary.ts`](src/services/accounts/createUserSecondary.ts)) so the actor's own session is preserved.

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
    auth/                sessionStore, roles, permissions, firebaseAuth, cloudStore
    accounts/            accountService, createUserSecondary
    platform/            accounts/coach/plan/audit/flags/analytics APIs + queryClient + clientSync
    habits/ reminders/ video/
  stores/                Zustand: settings, workout, nutrition, cardio, habit, photo, …
  data/
    repositories.ts, dataSource.ts, bootstrap.ts
    adapters/local/      localForage implementations
    adapters/firebase/   firebase init + config
    sync/SyncEngine.ts   last-write-wins sync (→ clientData/{uid})
  components/            AppShell, BrandBar, BottomNav, TopBar, Sheet, charts, …
  config/nav.ts          per-role bottom-nav tabs
  types/index.ts         all domain + RBAC types
firestore.rules          full RBAC enforcement
capacitor.config.ts      native shell config (android/ scaffolded)
docs/FORMA.md            setup & operations
```

---

## Data model (Firestore)

```
users/{uid}                              identity: role, accountStatus, permissions, featureFlags, createdBy, assignedCoachId?, phone?
coachClients/{coachId__clientId}         coach⇄client relationship (status) + subscription term/price/freeze + subscriptionHistory
clientData/{clientId}/profile/main       client fitness profile
clientData/{clientId}/profile/assessment onboarding assessment + status + coach review fields
clientData/{clientId}/settings/app       app settings
clientData/{clientId}/{workoutLogs|nutritionLogs|cardioLogs|weightLogs|measurementLogs|dailyChecklists|progressPhotos|reminders}
clientData/{clientId}/plan/workout       coach-authored WorkoutPlan (active version)
clientData/{clientId}/plan/nutrition     coach-authored MealPlan (+ substitutionPolicy)
clientData/{clientId}/plan/cardio        coach-authored CardioPlan
clientData/{clientId}/planVersions/{id}  plan version history (coach-write, client-read)
clientData/{clientId}/coachNotes|coachTargets        coach notes (entity-anchored) / targets
clientData/{clientId}/subscriptionRequest/current    client freeze request → coach decision
clientData/{clientId}/notifications/{id}             in-app notifications (forRole: client | coach, seenAt)
clientData/{clientId}/checkIns/{weekStart}           weekly check-ins (requested → submitted → reviewed)
coachAssets/{coachId}/{exercises|workoutTemplates|nutritionTemplates|foods|foodGroups}  coach-owned reusable assets
planTemplates/{id}                       legacy coach-owned templates (superseded by coachAssets)
adminAuditLogs/{id}                      admin action trail
featureFlags/{id}                        global / per-coach / per-client toggles
```

Progress / assessment / check-in photo **bytes** live on Bunny CDN (the Firestore record stores the public `cdnUrl`); the original blob is also kept in the client's IndexedDB for offline/instant display.

---

## Deploying

### Security rules + indexes (required)
The rules are the real access boundary. Deploy them (and the composite index) whenever they change:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### First super admin (one-time, no Cloud Functions)
1. Sign up in the app → this creates `users/{uid}` as a `client` with status `pending`.
2. In the Firebase console → Firestore → that `users/{uid}` doc, set `role: super_admin` and `accountStatus: active`.
3. Reload → you land on the Super Admin dashboard and can create/manage everyone in-app.

### Web hosting (Vercel or Firebase Hosting)
Vite build → `dist`. On Vercel, add every `VITE_FIREBASE_*` env var (Production + Preview); [`vercel.json`](vercel.json) handles SPA fallback + service-worker cache headers. Firestore rules/data still live in Firebase regardless of host.

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

## Known limitations (rules-only architecture, no Cloud Functions)

Acceptable trade-offs today; add Firebase Cloud Functions later to close them:

- **Forced sign-out on suspend** — a suspended user is blocked by rules immediately but keeps a valid ID token (~1h) until it expires. The client re-reads its account status on app **foreground**, so a suspend/reactivate takes effect on next focus rather than instantly.
- **Audit logs are best-effort** — client-written, create-only and immutable, but a privileged client could omit one. Server-written logs would be tamper-proof.
- **Invites** — admin/coach-created accounts use a temporary password rather than an emailed invite link.
- **Phone is a field, not an auth method** — the `phone` collected at sign-up / account creation is stored on the profile; sign-in is still email + password (phone-OTP would need the Firebase phone provider).
- **Bunny CDN image keys are public** — the storage key ships in the client bundle and CDN URLs aren't access-controlled (unguessable, but public). A dedicated zone or an upload proxy would harden this.
- **Hard account delete is record-only** — a client SPA can't remove the Firebase Auth user or a client's `clientData`; super-admin delete removes the identity record (prefer `disabled` for reversible deactivation).

---

## Notes

- **Privacy:** a client's logs/photos never leave their device unless cloud sync is active for their (active) account.
- **Local-only mode** (no Firebase) keeps the original standalone tracker working for development and offline-only use.
