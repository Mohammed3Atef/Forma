# Forma — Clean Launch / Fresh Start Plan

> **Owner direction (2026-10-17):** every user, coach, client, subscription, message, workout and progress record that exists today is **disposable test data**. The goal is a clean production launch, not preserving the testing dataset. The release starts with **clean user data** but keeps all required system configuration, approved exercise / food content, product settings and administrative setup.
> **Status: PLAN ONLY.** Nothing here has been executed. No production reset, database drop, storage deletion or destructive migration runs without the owner's explicit approval **and** verified environment targeting (§3). Development keeps using the isolated e2e3 fixtures; the current testing data is **not** deleted before the release phase.
> Executed in the **Release hardening** phase, after B3–B5 and after the release blockers (MD-01 / 02 / 03, real-device checks, REL-02 security review) are closed.

## 1. Principles for every milestone until launch

1. Prefer a clean, production-grade schema, architecture and UX over compatibility with disposable test records.
2. No one-off migrations, compensation scripts or back-fills written only for the current test data (for example: no `coachId` back-fill for legacy messages, no freeze compensation for legacy freezes).
3. Never weaken correctness, security, authorization, auditability, idempotency, offline sync or data integrity for future real users because today's data is disposable.
4. Compatibility branches kept only for old test records may be **proposed** for removal (§8) — dependencies verified and owner approval obtained first.
5. Development and certification use isolated, reproducible fixtures (`e2e3/`, in-memory Mongo); never production.

## 2. What survives the reset and what does not

### 2.1 Keep (system configuration and content)

| Item | Where today | Action at launch |
|---|---|---|
| Forma product configuration (single plan: price, trial, capacity, marketing copy) | `coachPlanTiers/forma` | Re-create from the approved values (review prices / copy first); no legacy tier docs |
| Capacity add-on catalogue | `coachCapacityPackages` | Re-create the approved packages only |
| Feature flags | `featureFlags` | Re-create with launch values (review each) |
| Product banners / announcements | `banners` | Start empty; add launch banners deliberately |
| Approved exercise library and starter templates | bundled in code (`api/coach-assets/_lib/starterLibraryData.ts`, seeded per coach on demand) + B4 curated library | Ships with the build; B4 decides the curated set, media and licences (EX-19) |
| Approved food content | bundled starter foods (B4: FD-*) | Ships with the build |
| Initial super-admin | `scripts/seed-mongo-admin.mjs` (bootstrap only path) | Run once against the new database with the owner's real admin identity |
| Indexes | `scripts/mongo-init-indexes.mjs` (43) + indexes self-ensured at runtime | Run on the new database; coverage audit in §5 |

### 2.2 Remove (user data — all disposable)

All of: `users` (except the new super-admin), `coachClients`, `coachPlans`, `coachPlanRequests`, `coachCapacityEntitlements`, `coachBillingPlans`, `clientProfiles`, `clientWorkoutPlans`, `clientNutritionPlans`, `clientCardioPlans`, `coachTargets`, `coachNotes`, `checkIns`, `measurementLogs`, `planVersions`, `archivedClientData`, `messages`, `notifications`, `signupInvites`, `transferRequests`, `subscriptionRequests`, `syncRecords`, `syncDeletions`, `syncSingletons`, coach libraries (`coachExercises`, `coachFoods`, `coachFoodGroups`, `coachSupplements`, `coachWorkoutTemplates`, `coachNutritionTemplates`), sessions and tokens (`refreshTokens`, `passwordResets`), operational counters (`rateLimits`, `usageStats`, `activeDays`, `ping`), upload staging (`mediaUploads`, `mediaUploadChunks`), and the test-era `adminAuditLogs` (the new database starts its own audit trail with a "launch reset" entry).

Media: every object under the current Bunny storage zone (`Forma/<uid>/…`: avatars, progress / assessment / check-in photos, message attachments, coach exercise uploads) is test data.

## 3. Recommended mechanism: a NEW database and NEW storage, not deletion in place

| Step | Why |
|---|---|
| Create a **new** Atlas database (e.g. `forma_live`) and point `MONGODB_DB` at it | Reversible: the old database stays untouched as a backup until the launch is verified; no risk of a half-finished delete |
| Create a **new private** Bunny storage zone for personal media (MD-02: signed, expiring URLs) and a public zone for library media | MD-02 needs this anyway; old public URLs of test media die with the old zone |
| Rotate secrets (§4) | Invalidates every test session and token |
| Keep the old database and zone read-only for an agreed period (e.g. 30 days), then delete them **only with a second explicit approval** | Rollback window |

**Environment-targeting guard (mandatory for every step that writes):** each script prints the Mongo host, database name and Bunny zone it will touch, runs as a dry run first, and refuses to write unless `--db` equals `MONGODB_DB` exactly plus an `--i-understand` flag (the pattern of `scripts/migrate-forma-single-plan.mjs`). The owner runs or approves each destructive step; Claude never does it unasked.

## 4. Configuration and secrets checklist

| Variable | Notes |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | New database; least-privilege Atlas user; IP / network access reviewed |
| `JWT_ACCESS_SECRET` | **Rotate** (invalidates all test sessions) |
| `CRON_SECRET` | Rotate; Vercel cron `0 3 * * *` → `/api/cron/daily-maintenance` |
| `BUNNY_API_KEY`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_REGION`, `BUNNY_STORAGE_ENDPOINT`, `BUNNY_CDN_URL` | New zones; key rotation owed by the owner (MD-01) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CONTACT_EMAIL` | Verified sending domain; deliverability check |
| `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` | Production OAuth client and authorized origins |
| `APP_BASE_URL` | Canonical production origin (invite and email links) |
| `VITE_ANALYTICS_SRC`, `VITE_ANALYTICS_DATA` | Analytics decision (privacy policy must match) |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | Production value |
| Not in production | `E2E_*`, `DEMO_*`, `ADMIN_PASSWORD` (bootstrap only, never stored) |

Parity check: Vercel Production vs Preview env lists match except for intentional differences; no test keys in Production (REL-03).

## 5. Database preparation

1. Run `scripts/mongo-init-indexes.mjs` on the new database.
2. **Index coverage audit** before launch: list every collection the API uses (§2) against the index script and the runtime self-ensured indexes; add missing indexes for hot paths (e.g. `coachClients` by `clientId` / `coachId` + `status`, `notifications` by `clientId` + `forRole` + `coachId`, `messages` by `clientId` + `coachId` + `createdAt`).
3. TTL indexes for `rateLimits` / `passwordResets` / upload staging verified.
4. Seed the Forma configuration, capacity packages and flags (reviewed values).
5. Create the super-admin with `scripts/seed-mongo-admin.mjs`; verify login; enable whatever second-factor / recovery process the owner chooses for admin accounts.

## 6. Security, privacy and media (must be closed before launch)

- MD-01 uploads work in production; MD-02 private zone + signed expiring URLs for personal media; MD-03 deleting media deletes the object.
- REL-02 security / privacy review (personal data, PDPL, permissions, media), including the B3.0.1 accepted limitations (B301-R1…R3) and the rate-limit settings.
- PWA-06 cross-device writes: accept as mitigated or fund the merge.
- Physical-device checklist R-01…R26 signed on the release build.
- Remove production-pointing tooling: the old `e2e/` suite + `playwright.config.ts` (RM-14) and the demo seed scripts that call the production API (OPS-01).

## 7. Monitoring, backups and operations

- **Errors:** no error-monitoring service is wired today — choose one (or Vercel log drains) and alert on 5xx rates and unhandled client errors.
- **Uptime:** external check on `/api/trpc/health.ping` and the home page.
- **Cron:** alert when the daily maintenance run fails or does not run.
- **Database:** Atlas backups enabled (snapshot / point-in-time per tier), retention agreed, **one restore rehearsed** into a scratch database before launch; Atlas alerts (connections, disk, slow queries).
- **Media:** Bunny usage / error alerts.
- **Email:** bounce / complaint monitoring.

## 8. Compatibility branches that become removable after the reset (proposals — approval needed)

Each exists only because of records written before a phase; after a clean reset no such record can exist. Removal = less code, fewer edge cases. Each needs its dependencies verified and the owner's OK.

| Branch | Introduced for | Where |
|---|---|---|
| Legacy freezes without `freezeCredit` (immediate, uncompensated) | pre-B3.0.1 records | `effectiveSubscriptionStatus` (client + server), `applyUnfreeze` |
| Notes without `authorId` (stint attribution) | pre-B0 / Firestore-era notes | `clientCoachNotes.ts` |
| Assessment single note (`privateNotes.assessment`, inline `assessment.coachNotes`) | pre-B3.0.1 / pre-B0 | `clientProfile.ts` |
| Messages without `coachId` (coach sees own legacy lines; client history) | pre-Mongo messages | `messages/_data.ts`, `MessageThread` history grouping still needed for real transfers |
| Notifications without `coachId` (stint cut-off) | pre-B3.0.1 rows | `feedFilter` |
| Sync records without `rev` / `sv`, `migratedFromLegacy` transition | pre-B0 / pre-B1 devices | `sync.ts`, `SyncEngine` |
| Legacy coach plan tiers (`plan.plan`, tier docs) | pre-Forma single plan | RM-52 / RM-53 / RM-54 |
| Firestore-era stubs and one-off scripts (`migrate-forma-single-plan.mjs`, reconcile counts) | migration tooling | `scripts/` |

## 9. Launch-day sequence (owner-run, each step confirmed)

1. Freeze deploys; announce maintenance to the test users (the owner).
2. Final backup / export of the old database (kept, not deleted).
3. Create the new database + new storage zones; set and verify every variable (§4) in Vercel Production.
4. Indexes, configuration seed, super-admin (§5).
5. Deploy the release build; verify `/api/trpc/health.ping`, headers, service worker, manifest.
6. **End-to-end smoke test on production** with dedicated smoke accounts, then remove them: coach sign-up → trial → invite → client claim → assessment → plan assigned → workout logged offline and synced → message with attachment (private media URL) → check-in with photo → renewal / freeze → admin views. Verify emails, uploads, signed URLs, deletion of media, cron run.
7. Monitoring green for 24 h; rollback plan ready (switch `MONGODB_DB` back, redeploy previous build).
8. After the agreed window and a second approval: delete the old database and old storage zone.

## 10. Rollback

Until step 9.8, rollback = restore the previous environment variables (old database / zone) and redeploy the previous build. Nothing destructive happens before the new environment is proven.
