# Gym Tracker — Full Audit Report

**Date:** 2026-06-10
**Scope:** All source (`src/`), data/sync layer, Firebase security, build/PWA config, i18n, e2e tests, scripts.
**Method:** Full static review of every file by four parallel auditors, with top findings independently re-verified. Build, type-check, and Playwright could **not** be run — the sandbox failed to start due to insufficient disk space on this machine. Free up disk space and run `npm run lint` and `npm run test:e2e` after applying fixes.

---

## Critical

### C1. Fresh install overwrites cloud profile & settings with seed defaults
`src/data/bootstrap.ts:31-39` + `src/data/sync/SyncEngine.ts:117`
`bootstrapData()` runs before sign-in and seeds a missing profile/settings with `updatedAt: Date.now()`. `syncSingleton` uses last-write-wins favoring local on ties (`local.updatedAt >= remote.updatedAt`). On any new device or after a local reset, the freshly seeded singletons carry a current timestamp — always newer than the real cloud copy — so the first sync **replaces the user's cloud profile and settings with seed defaults**, which then propagate to all devices.
**Fix:** seed singletons with `updatedAt: 0` (the workout-plan seed pattern), or pull before seeding.

### C2. Debounced persist race corrupts finished/discarded sessions
`src/stores/workoutStore.ts:89-91`, `finishSession` (348+), `discardActive` (184+)
Set edits schedule a 300 ms-debounced `put` of a pre-finish snapshot. If the user finishes the workout within 300 ms of the last edit (typing the final weight then tapping Finish is the common case), the pending debounce fires **after** `finishSession`'s write and overwrites it with `finished: false`. On next reload the session shows in-progress; streak/history lose the day; the unfinished version syncs to the cloud. The same race resurrects logs deleted by `discardActive`/`discardDraft`.
**Fix:** give `persist` `flush()`/`cancel()`; `flush()` at the start of `finishSession`, `cancel()` in discard paths.

---

## High

### H1. Failed cloud deletions are silently dropped — deleted records resurrect
`src/data/sync/SyncEngine.ts:128-135`
`clearTombstone` runs unconditionally after `deleteDoc`, even when it throws (the catch comment says "will retry next sync" but it never does). One transient failure → the deletion is lost forever and the record re-downloads on every device.
**Fix:** move `clearTombstone` inside the `try`.

### H2. Deletions never propagate to other devices at all
`src/data/sync/SyncEngine.ts:89-106`
Tombstones delete the Firestore doc, but pulls only upsert — a second device never learns a doc was deleted, keeps it locally, and if it ever edits it, **pushes it back and resurrects it in the cloud**.
**Fix:** write tombstones to Firestore (e.g. `deletions` subcollection with `deletedAt`), pull and apply them.

### H3. Pull watermark misses records uploaded late by offline devices
`src/data/sync/SyncEngine.ts:89-95, 156-172`
Incremental pulls query `updatedAt > since`, but `updatedAt` is the editing device's clock at *edit* time, not upload time. A device that edits offline at 10:00 and uploads at 13:00 is invisible to a device whose cursor passed 10:00 — permanently. The 10-minute margin covers clock skew only; delayed upload is the *normal* case for an offline-first PWA.
**Fix:** set a server-side `syncedAt: serverTimestamp()` on push and cursor on that; keep `updatedAt` for conflict resolution only.

### H4. Pulled data is overwritten by stale in-memory state
`src/services/auth/cloudStore.ts:91-108` + `src/stores/nutritionStore.ts:64-78`
`syncNow()` writes pulled records to IndexedDB but never refreshes any Zustand store. If a page created an in-memory empty log before sync finished, the user's next tap persists that empty log with a newer timestamp — locally **and then to the cloud**, wiping the other device's data.
**Fix:** after a pull with `pulled > 0`, re-run store `load()`s (or emit a refresh event).

### H5. "Remove exercise" button is permanently hidden
`src/components/ExerciseCard.tsx:90` — `className="icon-btn h-8 w-8 hidden"`
The `hidden` class is `display:none`, so remove-exercise, the undo banner, and "Restore plan exercises" in WorkoutSession are all unreachable dead features.
**Fix:** remove `hidden` (or gate behind an edit mode).

### H6. Bodyweight can never be logged — Progress "Body" chart permanently empty
`src/stores/cardioStore.ts:91-96` defines `logWeight`, but **no UI calls it** anywhere. The Progress body tab renders `weightLogs` and shows "Not enough data yet" forever.
**Fix:** add a log-weight control (Progress body tab or Home quick action).

### H7. Daily checklist sync is "last-opened-device-wins"
`src/services/habits/habitLogic.ts:85-86` + `src/stores/habitStore.ts:58`
`buildChecklist` always returns `updatedAt: Date.now(), dirty: true` and is re-put on every load/day-nav/change, so local is always "newer": remote manual toggles can never land, and every device overwrites the other's checklist in the cloud on every sync.
**Fix:** only bump `updatedAt`/`dirty` when the computed checklist actually changed; merge remote `manual` items.

### H8. Three e2e tests assert UI that no longer exists — suite cannot pass
`e2e/app.spec.ts:25,37,48,56`
`getByText(/Hey/)` (Home now shows "Good morning/afternoon/evening"), and `Add Weight` / `Rest Timer` buttons that exist nowhere in src.
**Fix:** assert `/Good (morning|afternoon|evening)/`; remove or rewrite the two quick-action tests. All other selectors were verified to exist.

---

## Medium

### M1. `pushCollection` clobbers concurrent local edits
`src/data/sync/SyncEngine.ts:82-86` — after the network `setDoc`, `repo.put({...rec, dirty: false})` rewrites the whole record from a pre-push snapshot. An edit made during the push is overwritten **and** its dirty flag cleared, so it never syncs. **Fix:** re-read after push; only clear `dirty` if `updatedAt` unchanged.

### M2. `toggleSetDone` leaves the `logs` array stale
`src/stores/workoutStore.ts:221-229` — the started-session branch updates `active` but not `logs`, unlike every other mutator. Day-switch + return reverts done-flags in the UI and the next edit persists the stale object. **Fix:** mirror `next` into `logs` in the else branch too.

### M3. `clearDayData` records no tombstone for the daily checklist
`src/data/reset.ts:49-54` — `dailyChecklists` is synced but gets no `recordDeletion`, so the cloud doc survives and resurrects. **Fix:** add `recordDeletion('dailyChecklists', date)`.

### M4. Minimizing a not-yet-started session deletes entered data
`src/pages/WorkoutSession.tsx:120-123` + `workoutStore.ts:174-182` — `minimize()` calls `discardDraft()`, which removes drafts even when the user has already typed weights/reps (typing doesn't set `startedAt`). **Fix:** require the same `isEmpty()` check used by the load-time sweep.

### M5. Dialog options leak between dialogs; orphaned promises
`src/stores/dialogStore.ts:31-41` — omitted `message`/`confirmLabel`/`cancelLabel`/`danger` keep the previous dialog's values (e.g. a non-destructive confirm renders with a red danger button). A second dialog also overwrites `resolve` without settling the first (caller hangs). **Fix:** reset defaults before spreading `opts`; resolve the prior promise with `false`.

### M6. Sign-in sheet closes on failed login, hiding the error
`src/pages/Settings.tsx:424-425` — `cloudStore.signIn` catches errors and resolves normally, so `.then(() => setAuthOpen(false))` closes the sheet on wrong-password too. **Fix:** return success boolean; close only on success.

### M7. Saving measurements wipes custom measurement keys
`src/pages/Measurements.tsx:56-63` + `measurementStore.ts:23-32` — save rebuilds `values` from the fixed `KEYS` list and replaces the whole record, deleting any custom/synced keys. Custom-parts settings actions exist but have no UI, and unknown keys render as raw i18n paths. **Fix:** merge `existing?.values`; add `defaultValue` to `labelOf`.

### M8. Live cardio timer lost on navigation
`src/pages/Cardio.tsx:25` — running state is component-local `useState`; any tab switch unmounts it with no warning. **Fix:** persist the start timestamp in a store.

### M9. Crash when a plan day references a missing exercise
`src/stores/workoutStore.ts:71-73, 339-340` — `plan.exercises[exId]` is dereferenced without a guard (render-side call sites all guard; the store doesn't). A corrupt/partially-synced plan breaks "Start workout". **Fix:** filter unknown ids.

### M10. `cloudStore.init()` is not idempotent; nothing is cleaned up
`src/services/auth/cloudStore.ts:43-65` — registers window/document listeners, a 120 s interval, and an auth subscription with no guard and no teardown; under StrictMode it double-registers and double-syncs. **Fix:** `if (initialized) return;` + store unsubscribe/interval ids. Related: `wipeCloud()` (110-115) doesn't take the `syncing` mutex, so a background sync can push dirty docs after the wipe.

### M11. Habit/nutrition load races (no stale-response guards)
`src/stores/habitStore.ts:35-61` — concurrent `refresh()` calls can persist a checklist built from a pre-toggle snapshot, erasing manual toggles; an older in-flight refresh can land after a newer day's. `src/stores/nutritionStore.ts:97-104` — rapid day-nav can leave `log` holding a different date than selected, so toggles persist to the wrong day. **Fix:** monotonic request token checked before `set`/`put`.

### M12. Reminders are unreliable by design
`src/services/reminders/reminderStore.ts:29-36, 148-172` — the Notification Triggers API check is dead (Chrome removed it in 2021), so everything depends on the in-app poller, which requires an exact `r.time === hm` minute match. Throttled background timers routinely skip the minute → reminder silently missed for the day. **Fix:** fire when due-or-overdue (`r.time <= hm && lastFiredDate !== day`).

### M13. Firestore: open sign-up with zero content validation
`firestore.rules` per-user scoping is correct, but anyone can self-register and write unbounded docs of any shape under their own uid (billing abuse). **Fix:** Firebase App Check + basic shape/size validation in rules; or disable public sign-up if single-user.

### M14. No security headers on either host
`vercel.json` / `firebase.json` set only Cache-Control. **Fix:** add `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`/`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

### M15. Progress-photo bytes never sync (metadata does)
`src/stores/photoStore.ts:32-36` — photo records sync via Firestore but blobs stay device-local; a second device gets records whose `localKey` resolves to nothing → broken photos. **Fix:** upload blobs (Storage) or exclude photo records from push and handle missing blobs in UI.

---

## Low

| # | Issue | Location | Fix |
|---|---|---|---|
| L1 | Offline sync reports success; throttle then suppresses the real post-reconnect sync | `SyncEngine.ts:154`, `cloudStore.ts:101` | Return an `offline` flag; don't set `lastSync` |
| L2 | `videoAssets` in sync list but type has no `dirty` — push always empty, dead sync | `types/index.ts:255`, `SyncEngine.ts:52` | Add `dirty` or drop from `COLLECTIONS` |
| L3 | Seed-version bump replaces user-pasted (not-downloaded) video URLs | `bootstrap.ts:58-67` | Keep assets whose `sourceUrl` differs from prior seed |
| L4 | `useDay.selected` frozen at module load — past-midnight logs go to yesterday; `reset()` never called | `dayStore.ts:17` | Reset on `visibilitychange` day rollover |
| L5 | Pause→resume resets rest-timer `totalSec` (ring jumps to 100%) | `timerStore.ts:100-104` | Preserve original total |
| L6 | Zero supplements ⇒ `fullyComplete` unreachable, overall streak stuck at 0 | `habitLogic.ts:56-59` | Omit/auto-complete when list empty |
| L7 | `normalize` doesn't backfill `waterMl`/`creatineTaken` → NaN poisoning of water total & streaks | `nutritionStore.ts:81-90` | `?? 0` / `?? false` backfill |
| L8 | `width: NaN%` when water target is 0; `ProgressRing` doesn't guard NaN | `Nutrition.tsx:80`, `ProgressRing.tsx:24` | `|| 1` guard like Cardio |
| L9 | Per-exercise `restSec` ignored — global default always used | `WorkoutSession.tsx:131` | `startRest(ex.restSec ?? restDefault)` |
| L10 | Blob-URL leaks/races in photo & video error paths | `ProgressPhotos.tsx:15-24`, `VideoPlayerSheet.tsx:54-64` | Cancelled flag + track URLs for revoke |
| L11 | DayNav shows the selected date twice when not today | `DayNav.tsx:29-32` | Drop duplicate sub-span |
| L12 | Sheets/dialogs: no Escape, no focus trap, background scrolls | `Sheet.tsx`, `DialogHost.tsx` | Standard modal a11y |
| L13 | Hardcoded English "Rest"/"Skip" in RestTimerBar; cardio history dates ignore Arabic locale | `RestTimerBar.tsx:29,46`, `Cardio.tsx:146` | Use `t()` + pass locale |
| L14 | `user-scalable=no` blocks pinch zoom (WCAG 1.4.4) | `index.html:8` | Remove `maximum-scale`/`user-scalable` |
| L15 | Auto-update SW can force reload mid-workout | `main.tsx:17-19` | Defer update until idle |
| L16 | `.gitignore` misses `.env.production`/`.env.development` | `.gitignore:5-6` | Use `.env*` + `!.env.example` |
| L17 | Google Sheet ID hardcoded in script and `.claude/settings.local.json` | `scripts/extractFromXlsx.mjs:8` | Move to env or accept as public |
| L18 | `scripts/smoke.mjs` unwired: wrong port (4317), no npm script, imports transitive `playwright` | `smoke.mjs` | Add `test:smoke` script, fix port/dep |
| L19 | `waitForSW` swallows failure → confusing offline-test failures | `e2e/app.spec.ts:16-20` | Fail loudly |
| L20 | 7 dead i18n keys in both languages (`home.greeting`, `home.quick.*`, `home.logWeightTitle`, `workout.restTimer`) | `en.json`/`ar.json` | Remove |
| L21 | Misleading comment: `FirebaseDataSource.ts` doesn't exist; `setDataSource` never called | `dataSource.ts:17,30` | Fix comment, drop dead export |
| L22 | Seed nutrition item macros (~1934 kcal) don't match declared targets (1815 kcal) | `nutritionPlan.seed.ts` | Reconcile numbers |
| L23 | `recordTimerLog`/`saveTimerLog` are no-op stubs still called from timer tick | `timerStore.ts:119-133` | Implement or remove |
| L24 | No download-dedup guard; `progress` map never cleaned | `videoStore.ts:51-64` | Guard + cleanup |
| L25 | `clearAllLocalData` doesn't clear Firestore SDK's own IndexedDB cache | `reset.ts:30-36` | Call `clearIndexedDbPersistence` (signed out) |

---

## Verified clean

- **Firestore rules scoping** — per-user `request.auth.uid == userId` incl. recursive wildcard; default-deny outside `/users`. No hardcoded secrets anywhere (`AIza` grep clean); `VITE_FIREBASE_*` env handling correct.
- **i18n parity** — `en.json` and `ar.json` have **100% key parity** (383 lines each); every `t()` call (incl. all dynamic template keys) resolves. RTL `dir`/`lang` switching correct, with RTL CSS.
- **Routing** — every `navigate()`/`NavLink` target matches a defined route; no broken links.
- **calc.ts** — Epley e1RM, volume/set math correct, null-guarded, no div-by-zero.
- **PWA/workbox** — `navigateFallback` matches SPA rewrites on both hosts; mp4s correctly excluded from precache with CacheFirst + range requests; `maxEntries: 40` covers 35 videos; sw.js no-cache headers present; all manifest icons exist.
- **Timer/hooks cleanup** — `timerStore` countdown, `useElapsed`, `useWakeLock` all clean up correctly.
- **Date math** — `diffDays` UTC math DST-safe; `streakFromDays` logic correct; CSV parser quoting correct.

## Known architectural limits (not bugs per se)

- `id == date` for daily logs ⇒ two devices logging the same day is whole-document last-write-wins; one device's session silently wins. Fine single-device; needs merge logic for true multi-device.
- `dirty: true` is uploaded into Firestore docs (schema noise only).
- Draft exclusion from sync depends on the `!startedAt && !finished` invariant — fragile if future code sets `startedAt` early.

---

## Recommended fix order

1. **C1** seed `updatedAt: 0` (one-line, prevents cloud data loss)
2. **H1** move `clearTombstone` into `try` (one-line)
3. **C2** debounce `flush`/`cancel` in workoutStore
4. **M3** checklist tombstone (one-line) + **M2** `logs` sync in `toggleSetDone`
5. **H5/H6** unhide remove-exercise; add a log-weight UI
6. **H4** store refresh after pull, then **H3/H2** server-timestamp cursor + cloud tombstones (the real sync redesign)
7. **H8** fix e2e tests, then run the suite
8. Mediums, then lows opportunistically

After fixes: free disk space, then `npm run lint` (type-check) and `npm run test:e2e`.
