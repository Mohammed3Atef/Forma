# Forma — Pre-Phase-2 Production Blocker Pass

Date: 2026-09-24 · Follows `FORMA_FINAL_BACKEND_TRPC_AUDIT.md` (Phase 1). Scope: only the production blockers and pre-launch data-integrity items Phase 1 surfaced. No UI audit, no new product features.

Verification after **all** changes: `npx tsc -b --noEmit` clean · `npm run build` OK · `npm run test -- --run` → **16 files, 217 tests, 217 passed** (was 14 / 196), deterministic (sequential mongod, replica set where transactions are used). No production database was written to.

---

## 1. Bunny API key — media architecture

### Before

| | |
|---|---|
| Credential | `VITE_BUNNY_API_KEY` (the storage-zone password) inlined into the public JS bundle |
| Upload | browser `PUT https://storage.bunnycdn.com/{zone}/{path}` with `AccessKey: <password>` — the browser chose the path |
| List | super-admin gallery walked the whole zone **from the browser** with the same password |
| Delete | no delete code existed — but the shipped password allowed it against the whole zone |
| Blast radius | anyone with the bundle could upload/list/delete every file of every user |

Also found during this pass: `SiteAnalytics.tsx` referenced `import.meta.env` as a bare object, which makes Vite inline **every** `VITE_*` variable present in the build environment — the key would have kept shipping even after the upload code stopped reading it. Verified on the built bundle before/after.

### Decision (evidence-based)

- Bunny's native Storage API authenticates only with the zone password — no per-path or time-limited upload tokens.
- Bunny's S3-compatible endpoint does support presigned PUTs, but **only on storage zones created with S3 compatibility enabled** (public preview; "cannot be enabled on an existing storage zone"). The current zone is an existing one, and this cannot be verified or changed from the repo.
- Vercel Functions reject request bodies over **4.5 MB** on every plan (413 `FUNCTION_PAYLOAD_TOO_LARGE`), so a plain proxy would silently break 50 MB messenger videos, 10 MB voice notes and 25 MB documents.

→ **Authenticated backend proxy with chunking.** Smallest secure design that works on the existing zone and keeps every current size limit.

### After

| | |
|---|---|
| Credential | `BUNNY_STORAGE_ZONE` / `BUNNY_API_KEY` / `BUNNY_CDN_URL` / `BUNNY_STORAGE_REGION` — server-only env, read in `api/media/_lib/bunny.ts` only |
| Endpoint | `api/media/[action].ts` (one Vercel function): `upload` (≤ 4 MiB, one request) · `init` / `chunk` / `finalize` (4 MiB chunks staged in Mongo with a 1 h TTL, assembled server-side, ONE `PUT` to Bunny) |
| Identity | same bearer access token as tRPC; context built by the very same `createContext` → suspended/pending accounts refused (403) exactly as everywhere else |
| Path | derived by `api/media/_lib/policy.ts` from the **session** + a category; the client never names a path. Every id used as a path segment is pinned to `[A-Za-z0-9_-]{1,64}` |
| Listing | tRPC `media.listImages` (`roleProcedure('super_admin')`), server-side walk |
| "Enabled?" | tRPC `media.status` (authed) → the UI's `useUploadConfigured()` replaces the old env check |
| Browser | `src/services/platform/mediaApi.ts` (replaces `bunnyUploadApi.ts`, deleted); no credential, XHR progress preserved, aggregated across chunks |

Category policy (folder layout is byte-for-byte the old one, so existing URLs, the gallery's `Forma/{clientId}/…` parsing and archives keep working):

| Category | Who | Path | Kinds | Limit |
|---|---|---|---|---|
| `avatar` | any active user (self) | `Forma/{uid}/avatar/` | jpeg/png/webp/gif | 2 MB |
| `progress` | self | `Forma/{uid}/` | still image | 5 MB |
| `assessment` | self | `Forma/{uid}/assessment/` | still image | 5 MB |
| `checkin` | self + validated `checkInId` | `Forma/{uid}/checkin/{checkInId}/` | still image | 5 MB |
| `exercise` | coach / admin / super_admin (never client) | `Forma/{uid}/exercises/` | image, video | 5 / 50 MB |
| `message` | `authorizeThreadAccess(user, clientId)`: the client, their **assigned** coach, `clients.writeAll` — not another coach, not a plain admin | `Forma/{clientId}/messages/` | image / video / audio / file | 5 / 50 / 10 / 25 MB |

Refused everywhere regardless of category: `text/html`, `image/svg+xml`, JavaScript, `xhtml`, executables (by MIME and by extension). Body reads are capped at the resolved limit before buffering. Errors keep the existing i18n codes (`tooLarge*`, `badType`, `notConfigured`).

### Media operations migrated

| Call site | Old | New |
|---|---|---|
| `photoStore.ts` progress photos | `uploadImageToBunny(blob, {folder:'Forma/{uid}'})` | `uploadImage(blob, {category:'progress'})` |
| `AvatarPicker` (Settings, RoleAccount) | `folder` prop → browser PUT | `{category:'avatar'}`; `folder` prop removed |
| `PosePhotoPicker` / `CheckIn` | `folder='Forma/{uid}/checkin/{id}'` | `target={{category:'checkin', checkInId}}` |
| `AssessmentWizard` | `Forma/{uid}/assessment` | `{category:'assessment'}` (no `uid` prop needed) |
| `ExerciseForm` video | `uploadFileToBunny(file, {folder:'Forma/{coachId}/exercises'})` | `uploadFile(file, {category:'exercise'})` — chunked over 4 MiB |
| `MessageThread` attachments / voice | `Forma/{clientId}/messages` | `uploadFile(blob, {category:'message', clientId}, {onProgress, signal})` |
| `AdminMedia` gallery | browser zone walk | `trpc.media.listImages` |
| every `isBunnyConfigured()` | env check | `useUploadConfigured()` hook / `ensureUploadConfig()` |

### Authorization tests — `api/media/_media.test.ts` (11) 
Gate (405 / 401 / garbage token / pending account / unknown action / 503 without config and no Bunny call) · self-namespace path uses the session id even when the request forges a `clientId` · check-in id traversal (`../`, `/`, empty, 65 chars) refused · exercise: coach OK under own id, client 403 · message: client, assigned coach, super_admin OK; other coach, plain admin 403; missing clientId 400 · type policy (wrong kind, svg, html by MIME and by extension, unknown category, empty body) · 2 MB+1 avatar → 413 `tooLarge`, no PUT · chunked: out-of-order chunks, wrong-size chunk 400, premature finalize 409, idempotent re-send, assembled length/content-type asserted on the single PUT, staging rows deleted, second finalize 404 · session ownership (other user 404 on chunk/finalize; malformed id 400) · init applies the same policy · `listImages` FORBIDDEN for coach/admin, super_admin gets classified rows; the key never appears in any response.

Bundle check after the change (`grep` over `dist/`): real key value **0**, zone name **0**, `VITE_BUNNY` **0**, `bunnycdn` **0**, `AccessKey` **0**, `MONGODB_URI`/`JWT_ACCESS`/`RESEND_API`/`CRON_SECRET` **0**. The only `VITE_*` values that can reach the bundle now are the three declared in `src/vite-env.d.ts` (Google client id, analytics src/data — public by design). Before the fix the same scan found the whole env object, real key included.

### Exposed key — rotation is REQUIRED (manual)

The password was in every deployed bundle to date; rotating is mandatory whatever else is done:

1. Bunny dashboard → **Storage** → zone → **FTP & API Access** → regenerate the password (and the read-only password if one exists).
2. Vercel → Project → Environment Variables: **delete** `VITE_BUNNY_STORAGE_ZONE`, `VITE_BUNNY_API_KEY`, `VITE_BUNNY_CDN_URL`, `VITE_BUNNY_STORAGE_REGION` (Production **and** Preview); add `BUNNY_STORAGE_ZONE`, `BUNNY_API_KEY` (= the NEW password), `BUNNY_CDN_URL`, `BUNNY_STORAGE_REGION`.
3. Redeploy (a redeploy is what removes the old bundle from the edge).
4. Local: `.env` already carries `BUNNY_*`; the four `VITE_BUNNY_*` lines were removed from it in this pass (backup in the session scratchpad). Put the new password into `BUNNY_API_KEY`.

Note: pull-zone URLs stay public-but-unguessable, as before (Token Authentication on the pull zone would be a separate, later hardening).

---

## 2. `activeClientCount` reconciliation — `scripts/reconcile-active-client-counts.mjs`

`npm run mongo:reconcile-counts` (dry run) prints, per `coachPlans` doc: coach, email, plan, stored count, real count (active `coachClients`), difference (`MISSING` when the counter is absent/non-numeric), maxClients, OVER CAP flag; plus coaches that have active clients but no plan doc (those need `backfillCoachTrialPlans.mjs` first — this script never creates a plan).

Writes only with `--write --db=<name>` where `<name>` must equal the resolved `MONGODB_DB` (second confirmation of the environment). Each fix is compare-and-set on the value that was read; a counter that moved in between is skipped and reported. Not run against any shared environment by this pass.

---

## 3. Client-cap race (CON-1) — FIXED

`api/coach-clients/_data.ts`:
- `reserveClientSlot(coachId, session?)` — ONE conditional `findOneAndUpdate`: `{ _id, maxClients: {$gt:0}, activeClientCount: {$gte:0}, $expr: {$lt: ['$activeClientCount','$maxClients']} }` + `$inc: 1`. The numeric range filters are essential: in aggregation order `null < 25` is true, so a bare `$expr` on a legacy doc without a counter would grant unlimited slots — such docs are refused as `no_plan`.
- `releaseClientSlot(coachId, session?)` — `$inc: -1` floored at 0.
- `bumpActiveClientCount` removed (no remaining callers).

Applied once, the same way, to all three join paths:

| Path | Order |
|---|---|
| `assignExistingClient` | pre-checks → **reserve** → relationship upsert + `assignedCoachId` → on failure **release** |
| `invites.claim` | advisory pre-check (fast, correct message) → invite CAS → **reserve** (before any account exists; loser un-claims the invite) → user + relationship → on failure release + delete user + un-claim |
| `transferClientWithMode` | inside one transaction: **reserve** destination → end old rel → archive → new rel → client → release source; an abort returns the slot automatically |

`endRelationship` releases (best-effort, as before).

Tests — `api/coach-clients/_capReservation.test.ts` (10): 12 concurrent reservations for one slot → exactly 1 `ok`, counter = max · legacy/zero/missing docs → `no_plan` · release floors at 0 · **one slot + two simultaneous `coachClients.assign` → exactly one succeeds** (other `CONFLICT` "at their client limit"), one relationship, one `assignedCoachId` · **two simultaneous `invites.claim` → one account, losing invite back to `pending`** · **two simultaneous transfers into one free slot → one moves** · a failed relationship write after reservation releases the slot and the retry succeeds · full transfer rollback (below) · transfer into a full coach changes nothing.

---

## 4. Mongo index init — `scripts/mongo-init-indexes.mjs`

Verified to contain every index the app relies on, including the ones added by Phase 1 and this pass. **Not run against production by this pass.** Run deliberately, once, after confirming `MONGODB_URI`/`MONGODB_DB` point at the intended cluster:

```
npm run mongo:init-indexes
```

Expected indexes (idempotent; re-running is a no-op):

| Collection | Index | Notes |
|---|---|---|
| users | `uniq_emailLower` (unique), `role`, `displayNameLower` | |
| refreshTokens | `userId`, `ttl_expiresAt` (TTL) | |
| passwordResets | `userId`, `ttl_expiresAt` (TTL) | |
| rateLimits | `ttl_expiresAt` (TTL) | |
| syncRecords / syncDeletions | `clientId_collection_syncedAt` | |
| syncSingletons | `clientId_name` | |
| notifications | `clientId_forRole_createdAt` | |
| messages | `clientId_createdAt`; **`uniq_clientMsgId`** (unique, partial `clientMsgId exists`) | send idempotency (also self-ensured) |
| coachPlans | **`plan_endsAt`** | daily cron sweep |
| coachPlanRequests | **`uniq_coachId_actionable`** (unique, partial awaiting/processing), `status_confirmationDeadline` | also self-ensured |
| mediaUploads | **`ttl_expiresAt`** (TTL) | new — chunked upload staging |
| mediaUploadChunks | **`ttl_expiresAt`** (TTL), **`uploadId_index`** | new (also self-ensured) |
| coachClients | `coachId_status`, `clientId` | |
| coachExercises, coachWorkoutTemplates, coachNutritionTemplates, coachFoods, coachFoodGroups, coachSupplements, coachBillingPlans | `uniq_coachId_id` (unique) | also self-ensured |
| measurementLogs | `clientId_date` | |
| checkIns | `clientId_weekStart`, `coachId` | |
| coachNotes | `clientId_createdAt` | |
| planVersions | `clientId_kind_versionNumber` | |
| archivedClientData | `clientId_archivedAt`, `previousCoachId` | |
| adminAuditLogs | `createdAt`, `targetUserId` | |
| signupInvites | `coachId_status` | |
| transferRequests | `toCoachId_status`, `clientId` | |

---

## 5. Trial tier / existing data — `scripts/report-plan-data.mjs`

`npm run mongo:report-plans` — **read-only, no write flag exists.** Reports (1) coaches with no `coachPlans` doc, (2) plans with a missing/non-numeric `activeClientCount` and counters that drift from the real active-relationship count, (3) Trial plans whose cap differs from the configured Trial tier's (e.g. the obsolete 10-client limit), (4) tier-derived plans (`maxClientsOverride !== true`) whose cap differs from their tier, and plans on a tier that no longer exists — then prints the recommended one-time actions in order:

1. `node scripts/backfillCoachTrialPlans.mjs --apply` — for coaches with no plan.
2. `npm run mongo:reconcile-counts` (dry run) → `--write --db=<name>` — counters.
3. Admin → Plans: open and re-save the Trial (and any mismatched) tier unchanged — `coachPlanTiers.save` propagates `maxClients` to every non-overridden coach on that tier.
4. Any coach on a non-existent tier: Admin → Coach → plan (`coachPlans.adminUpdate`).

Not run against shared data by this pass (the spec's read-only-unless-approved rule). Run it, then apply the printed actions before launch.

---

## 6. Transfer atomicity — IMPLEMENTED

`transferClientWithMode` now runs entirely inside `withDbTransaction` (already proven against this project's Atlas cluster by signup/confirm). The session is threaded through every read and write, including `archiveAndClearCoachOwnedData` (reads, `insertMany`, five deletes — made sequential, since one session must not run operations concurrently). The former `.catch(() => undefined)` on ending the old relationship is gone: a failure anywhere aborts everything. Archival behaviour is unchanged in content, only made all-or-nothing.

Rollback test (fault injected on the last write, the client's `assignedCoachId`): old relationship still `active`, no new relationship, zero `archivedClientData` rows, the workout plan and coach note still live, both counters unchanged, client still assigned to the previous coach — and the identical transfer completes fully once the fault is removed (2 archive rows, plan cleared, counters moved). `transfers.resolve('accept')` keeps its request-level CAS + rollback to `pending` on top.

Test files that exercise transfers now boot `MongoMemoryReplSet` (`coachClients.test.ts`, `_capReservation.test.ts`; `certification.test.ts` already did).

---

## 7. Trial reminders (T-4) — DECISION: leave documented

Checked every user-visible string (en/ar/ar-eg) and the marketing/login/pricing copy: nothing promises 7/5/3/1-day reminders. The only related strings are the notification-type label "Trial ending soon" (`notifications.type.trial_expiring`) and the admin list heading "No trials expiring in the next 7 days"; the pricing card says "{{n}}-day free trial, no card required" and "after your trial ends". The client-side `coachTrialApi.checkTrialExpiry` remains dead (its `notify()` is a no-op) — internal only, no UI claim to adjust. Coaches learn at expiry via the cron email + in-app plan banner. T-4 stays a documented P2 for a later server-side reminder job.

---

## Final test count

`npm run test -- --run` → **16 files · 217 tests · 217 passed**, deterministic. New: `api/media/_media.test.ts` (11), `api/coach-clients/_capReservation.test.ts` (10). (Test files under `api/` must be `_`-prefixed or live under a `_` directory — anything else in `api/` is deployed by Vercel as a function.)

## Exact manual production steps still required

1. **Rotate the Bunny storage password** (dashboard → Storage → zone → FTP & API Access). The old one has been public in every deployed bundle.
2. **Vercel env**: delete `VITE_BUNNY_*` (Production + Preview); add server-only `BUNNY_STORAGE_ZONE`, `BUNNY_API_KEY` (new password), `BUNNY_CDN_URL`, `BUNNY_STORAGE_REGION`; ensure `CRON_SECRET` is set (the cron is fail-closed without it). Redeploy.
3. `npm run mongo:init-indexes` against the confirmed production cluster.
4. `npm run mongo:report-plans` (read-only) → apply its printed actions: `backfillCoachTrialPlans.mjs --apply` if any coach lacks a plan; `mongo:reconcile-counts` dry run then `--write --db=<name>`; re-save the Trial tier in Admin → Plans if caps are stale.
5. Local dev: put the new password into `.env` `BUNNY_API_KEY`.

STOP — Phase 2 (frontend interaction audit) not started.
