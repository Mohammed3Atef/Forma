# Forma — Setup & Operations

Forma is a mobile-first, multi-role fitness coaching platform (PWA + Capacitor) on
React + TypeScript + Vite + Zustand + Tailwind + Firebase, with React Query for
admin/coach online reads.

## Roles

| Role | Lands on | Can |
| --- | --- | --- |
| `super_admin` | `/admin` | Everything: accounts, roles/permissions, assignments, feature flags, audit logs, analytics |
| `admin` | `/admin` | Manage clients/coaches (client/coach roles only), suspend/reactivate, view analytics & audit |
| `coach` | `/coach` | Their assigned clients: view logs, assign plans/targets, notes, templates, announcements |
| `client` | `/` | The tracker app + coach notes/plans/targets |

Role → permission baselines live in [src/services/auth/roles.ts](../src/services/auth/roles.ts)
and are mirrored in [firestore.rules](../firestore.rules). **Keep the two in sync.**

## 1. Firebase configuration

Set Vite env vars in `.env` (see `.env.example`):

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=…
VITE_FIREBASE_PROJECT_ID=…
VITE_FIREBASE_STORAGE_BUCKET=…
VITE_FIREBASE_MESSAGING_SENDER_ID=…
VITE_FIREBASE_APP_ID=…
```

When these are absent the app runs **local-only** as a single `client` (the original
offline tracker) — no login, no platform.

## 2. Deploy security rules + indexes

The rules are the real access boundary (the frontend only hides UI). Deploy them and
the composite index whenever they change:

```
firebase deploy --only firestore:rules,firestore:indexes
```

## 3. Bootstrap the first super admin (one-time)

There are no Cloud Functions, so the first super admin is promoted manually:

1. Sign up in the app with the target email/password. This creates `users/{uid}` with
   `role: client`, `accountStatus: pending`.
2. In the Firebase console → Firestore → `users/{uid}`, set:
   - `role` → `super_admin`
   - `accountStatus` → `active`
3. Reload the app → it routes to the Super Admin dashboard. From there, create and
   manage all other accounts in-app.

## 4. Account lifecycle

- **Self sign-up** defaults to `accountStatus: 'pending'` (see `SELF_SIGNUP_STATUS` in
  [roles.ts](../src/services/auth/roles.ts)). Pending/suspended users see a status
  screen and cannot read/write cloud data. Activate them from Admin → Accounts.
- **Admin-created accounts** are made via a throwaway secondary Firebase app so the
  admin's own session is preserved ([createUserSecondary.ts](../src/services/accounts/createUserSecondary.ts)).
  Give the new user the temporary password to sign in (and change).

## 5. Data model

```
users/{uid}                              identity: role, accountStatus, permissions, featureFlags, createdBy, assignedCoachId?
coachClients/{coachId__clientId}         coach⇄client relationship (status)
clientData/{clientId}/profile/main       client fitness profile
clientData/{clientId}/profile/assessment onboarding assessment + status (not_started|in_progress|submitted|reviewed) + coach review fields
clientData/{clientId}/settings/app       app settings (targets mirrored here)
clientData/{clientId}/{workoutLogs|nutritionLogs|cardioLogs|weightLogs|measurementLogs|dailyChecklists|progressPhotos|reminders}
clientData/{clientId}/plan/workout       coach-authored WorkoutPlan (days/sections/exercises/sets/reps/rest/video)
clientData/{clientId}/plan/nutrition     coach-authored MealPlan (meals/foods/macros/water + substitutionPolicy)
clientData/{clientId}/plan/cardio        coach-authored CardioPlan (sessions)
clientData/{clientId}/planVersions/{id}  plan version history (coach-write, client-read); active version mirrors plan/{kind}
clientData/{clientId}/coachNotes|coachTargets        coach notes / targets
coachAssets/{coachId}/exercises|workoutTemplates|nutritionTemplates|foods|foodGroups   coach-owned reusable assets
planTemplates/{id}                       legacy coach-owned templates (superseded by coachAssets)
adminAuditLogs/{id}                      admin action trail
featureFlags/{id}                        global / per-coach / per-client toggles
```

**Assessment review loop.** The onboarding assessment (`profile/assessment`) carries an
explicit `status`: the client may create/edit it until the coach marks it `reviewed`
(rule-enforced), the coach adds review notes / marks reviewed / resets it, and admins
are read-only. Submitting unlocks the client dashboard; a coach `reset` re-gates it.

**Plan versioning.** Coaches "Save as new version" from any plan editor → a numbered
snapshot in `planVersions` (active one mirrored into `plan/{kind}`, which is all the
client reads). Restoring an older version swaps the client's active plan. Clients never
write versions.

**Food alternatives.** Coaches keep a food library + interchangeable `foodGroups`.
Attaching a group to a planned meal item **snapshots** its foods onto the item
(`allowedAlternatives`), so the client swaps among coach-approved options without
touching the plan — the swap lives only in `nutritionLogs/{date}` (`itemOverrides` +
a `substitutions` adherence tag: `approved_substitution` / `client_custom_substitution`).
The per-plan `substitutionPolicy` governs whether swaps / custom foods are allowed and
whether custom swaps are flagged for coach review.

**Coach-driven content.** Forma is not a personal tracker: a platform client starts
completely empty (no plan, meals, targets, videos, or demo data — seeding is disabled
when Firebase is configured). The coach is the source of truth and authors the real
`WorkoutPlan` / `MealPlan` / targets, which the client consumes read-only through the
tracker UI ([planApi.ts](../src/services/platform/planApi.ts),
[clientSync.ts](../src/services/platform/clientSync.ts)). Until a plan is assigned the
client sees "Waiting for your coach to assign your plan."

**Coach onboarding.** A coach creates clients directly (name + email + temporary
password) from the Clients tab; the account is created `active` and auto-assigned to
that coach. The client logs in with those credentials. Admins/super-admins can also
assign and transfer clients between coaches.

The client's own LOGS are local-first (IndexedDB) and mirrored to `clientData/{uid}` by
the SyncEngine; coach-authored plans live in `clientData/{clientId}/plan/*` and are read
directly. The first sync after upgrade runs a one-time migration that re-pushes local
log records to the `clientData` path ([SyncEngine.ts](../src/data/sync/SyncEngine.ts)).

## 6. Android build (Capacitor)

The native project is scaffolded under `android/`. To build:

```
npm run cap:sync        # build web + copy into native projects
npm run cap:android     # build + sync android + open Android Studio
```

Then build/run the APK from Android Studio (requires the Android SDK + JDK). Config is
in [capacitor.config.ts](../capacitor.config.ts); native status bar/splash are set up in
[src/lib/native.ts](../src/lib/native.ts).

## Known limitations (no Cloud Functions)

These are acceptable trade-offs of the rules-only architecture; add Firebase Cloud
Functions later to close them:

- **Forced sign-out on suspend**: a suspended user is blocked by rules immediately but
  keeps a valid ID token until it expires (~1h). A Function calling
  `revokeRefreshTokens` would kick them instantly.
- **Audit logs are best-effort**: client-written, create-only and immutable, but a
  privileged client could omit one. Server-written audit logs would be tamper-proof.
- **Invites**: admin-created accounts use a temp password rather than an emailed invite
  link.
- **Coach viewing progress-photo images**: photo *metadata* syncs, but the JPEG bytes
  are device-local. Add Firebase Storage to let coaches view client photos.
