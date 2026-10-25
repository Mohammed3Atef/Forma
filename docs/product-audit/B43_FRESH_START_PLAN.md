# Forma — B4.3 fresh-start reset plan

> **Status: PLAN + TOOL. Nothing here has been run on any shared database.** The reset script
> (`scripts/fresh-start-reset.mjs`) is a dry run by default and **refuses production** in this phase.
> The production launch itself follows `FORMA_CLEAN_LAUNCH_PLAN.md` §3 (a new database and new
> storage zones, not deletion in place). This plan adds the collection classes, the order, the tool,
> the checks and the limits.

## 1. Why a reset is possible

All current coach and client data is disposable test data (owner direction, 2026-10-17). B4.3 also
removes the reasons to keep old rows:

- The starter library is retired. A coach no longer needs copied exercises, foods or templates.
  Every coach reads Forma's catalog (1,343 exercises, 190 foods) directly.
- Coach-owned rows are now only the coach's own items: custom ones, customised catalog items
  (`cat-<catalogId>`), uploads and favourites (`coachFavorites`, references only).
- Nutrition templates had no screen and were removed. `coachNutritionTemplates` is dead.
- Catalog `legacyIds` (links to the retired starter rows) were removed from the datasets.

## 2. Collection classes

| Class | What | Collections | Reset action |
|---|---|---|---|
| **A** | System configuration | `coachPlanTiers`, `coachCapacityPackages`, `featureFlags`, `banners` | **Keep.** Never touched. Re-create from reviewed values on a new database. |
| **B** | Identity and access | `users`, `refreshTokens`, `passwordResets` | Delete every user **except** `admin` / `super_admin`. Delete all sessions and reset tokens (admins sign in again). |
| **C** | Coach and client data | `syncRecords`, `syncDeletions`, `syncSingletons`, `measurementLogs`, `checkIns`, `planVersions`, `clientWorkoutPlans`, `clientNutritionPlans`, `clientCardioPlans`, `coachTargets`, `coachNotes`, `messages`, `notifications`, `signupInvites`, `transferRequests`, `archivedClientData`, `clientProfiles`, `coachFavorites`, `coachExercises`, `coachFoods`, `coachFoodGroups`, `coachSupplements`, `coachWorkoutTemplates`, `coachBillingPlans`, `coachClients` | Delete every document. |
| **D** | Audit and financial records | `clientPaymentTermLocks`, `clientPayments`, `subscriptionRequests`, `coachPlanRequests`, `coachCapacityEntitlements`, `coachPlans`, `adminAuditLogs` | **Kept by default.** Cleared only with `--include-audit-financial`, and never on production. |
| **E** | Ephemeral and retired | `mediaUploadChunks`, `mediaUploads`, `rateLimits`, `usageStats`, `activeDays`, `ping`, `coachNutritionTemplates` | Dropped. |

The script reports any collection that is not in a class ("unclassified") and leaves it alone.

**Media** in Bunny storage is not touched by the script. Personal media follows
`FORMA_CLEAN_LAUNCH_PLAN.md` §3: a new private zone (MD-02), with the old zone kept read-only for the
rollback window. Library pictures for foods are served from Wikimedia (or the catalog CDN) and are
not user data.

## 3. Dependency order

The script runs E → C → D → B:

1. **E first.** Upload staging and counters, so no half-finished upload or rate-limit window
   survives.
2. **C, children before parents.** Logs and sync records, check-ins, plan versions, plans, notes,
   messages and notifications first. Then profiles, libraries and favourites. `coachClients` last.
   No row is ever left pointing at a relationship that is already gone.
3. **D** (only with the flag). Payments, requests and entitlements, then `coachPlans`, then the
   audit log.
4. **B last.** Sessions and reset tokens, then non-admin users. Until the very end, every remaining
   row still has its owner.

The reset itself is recorded as one `adminAuditLogs` entry (`system.fresh_start_reset`, with the
per-collection results). When class D was cleared, that entry starts the new trail.

## 4. Backups (before any execute)

- **Atlas:** take an on-demand snapshot, or confirm point-in-time recovery is enabled, and note the
  snapshot id.
- **Or `mongodump`** (the script prints the exact command):
  `mongodump --uri "<MONGODB_URI>" --db <db> --out backups/<db>-<yyyymmdd-hhmm>`
- **Restore rehearsal:** restore into a scratch database (`mongorestore --nsFrom '<db>.*'
  --nsTo 'scratch.*'`) and run the verification queries (§6) against it once.
- The script will not execute without `--backup-taken`. It cannot check the backup; the person
  running it confirms it.

## 5. The tool

```
# 1. Dry run (default): target, every collection, its class, count and action.
node scripts/fresh-start-reset.mjs --env preview
node scripts/fresh-start-reset.mjs --env preview --json        # machine-readable

# 2. Execute (non-production only), after the backup:
node scripts/fresh-start-reset.mjs --env preview --execute \
  --confirm-db <MONGODB_DB> --backup-taken --i-understand-this-deletes-data
#    add --include-audit-financial to clear class D as well
```

**Guards.** Every one must pass, or the script exits with code 2 and changes nothing:

- `--env` must be one of `local | e2e | preview | staging`.
- **`production` is refused** in this phase. So is any run with `VERCEL_ENV=production` in the
  shell, or with a database listed in `FORMA_PRODUCTION_DBS` (a comma-separated list). Set
  `FORMA_PRODUCTION_DBS` on any machine that holds production credentials.
- `--execute` also requires `--confirm-db` equal to `MONGODB_DB`, plus `--backup-taken` and
  `--i-understand-this-deletes-data`.
- The target is printed first: host without credentials, database and env.

**Tests:** `scripts/fresh-start-reset.test.ts` (7, in-memory MongoDB) cover:

- a dry run changes nothing;
- a refused execute changes nothing;
- production is refused however it is named;
- execute empties classes B (non-admin), C and E, keeps A, the admins and D, and writes the audit
  entry;
- `--include-audit-financial` clears D;
- every collection is in exactly one class.

> **Note:** Preview and Production currently share one `MONGODB_URI` (B4-R1, re-checked
> 2026-10-25). Until they are separated, a "preview" reset would hit production data. **Do not run
> the tool against the Vercel Preview environment** until B4-R1 is fixed. Use a local or dedicated
> staging database.

## 6. Verification queries (after a run)

The script runs these itself and prints `Verification: OK` or the problems it found. To check by
hand in `mongosh`:

```js
// C empty
['coachClients','clientProfiles','clientWorkoutPlans','clientNutritionPlans','messages','checkIns','syncRecords','coachExercises','coachFoods','coachFavorites']
  .map(c => [c, db[c].countDocuments()])                                   // all 0
// B: only admins remain; no sessions
db.users.countDocuments({ role: { $nin: ['admin','super_admin'] } })     // 0
db.users.countDocuments({ role: { $in: ['admin','super_admin'] } })      // ≥ 1
db.refreshTokens.countDocuments()                                         // 0
// A intact
db.coachPlanTiers.findOne({ _id: 'forma' })                               // present
db.coachCapacityPackages.countDocuments(); db.featureFlags.countDocuments()
// E gone
db.getCollectionNames().filter(n => ['coachNutritionTemplates','mediaUploads','rateLimits'].includes(n))   // []
// The reset is audited
db.adminAuditLogs.find({ action: 'system.fresh_start_reset' }).sort({ createdAt: -1 }).limit(1)
// D kept (default): orphans are expected and reported, not repaired
db.coachPlans.countDocuments()
```

## 7. After the reset

1. `node scripts/mongo-init-indexes.mjs` (with the target confirmed). This is idempotent. It adds
   the B4.3 index `coachFavorites.uniq_coachId_id`, and the runtime also ensures it.
2. If class A was empty (a new database): seed the Forma configuration, the capacity packages and the
   flags from the reviewed values. Then create the super-admin with `scripts/seed-mongo-admin.mjs`.
3. Read-only check: `node scripts/index-preflight.mjs`.
4. **Smoke checklist** (on the reset environment):
   - [ ] Super-admin signs in. Admin › Accounts lists only the admins.
   - [ ] A new coach signs up and starts the trial. Library › Exercises shows 1,343 items and Foods
     shows 190, with pictures. There is no import button.
   - [ ] The coach favourites an exercise, customises a food, and resets it.
   - [ ] The coach invites a client, and the client claims the invite and completes the assessment.
   - [ ] The coach adds a Forma exercise and a Forma food to the client's plans, from the Library
     ("Use in a client plan") and from the editors.
   - [ ] The client sees the exercise (demonstration, steps, credits) and the food with its
     picture, in EN and AR.
   - [ ] The client logs a workout offline, then syncs.
   - [ ] A message with an attachment works, and so does a check-in with a photo.
   - [ ] A renewal or freeze works. Admin views work.

## 8. Rollback limits

- **Execute is not reversible by the script.** Rollback means restoring the backup (§4): Atlas
  snapshot restore, or `mongorestore --drop` of the dump. This replaces everything written since
  the backup.
- Sessions do not come back from a restore unless the dump included `refreshTokens` (it does). Users
  may still need to sign in again if `JWT_ACCESS_SECRET` was rotated.
- Media is outside the database. Files referenced by restored rows still exist, because the script
  never deletes media.
- With `--include-audit-financial`, the audit trail and payment ledger exist only in the backup.
  Keep that backup for the agreed retention period. This is one reason the flag is off by default and
  refused on production.
- For production launch, use the new-database approach (`FORMA_CLEAN_LAUNCH_PLAN.md` §3). Rollback
  is then switching `MONGODB_DB` back, which is instant and loses nothing.
