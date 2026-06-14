# Fixes Applied (2026-06-10)

## Round 2 — UX changes (user-requested)
- **Blank first launch**: `SEED_PROFILE` no longer ships personal data (name/weight/etc. empty). New `Onboarding` overlay on first launch: set up a local profile, or sign in / sign up inline to pull existing cloud data. Home greeting hides the name line until one exists; Progress treats an unset (0) profile weight as missing. e2e `boot()` completes onboarding automatically.
- **Finished workouts open as a summary**: `WorkoutSession` shows a read-only view (duration, volume, sets, exercises, per-set list) with an explicit Edit button instead of dropping into the live editing screen with a running-looking timer.
- **Cardio auto-calculation**: walking/treadmill/running now ask for speed (km/h) + incline (%) before starting; the live timer shows estimated distance and calories (ACSM metabolic equations + your latest logged bodyweight, fallback profile weight); finishing opens the editable log popup pre-filled with computed values. New helpers `cardioDistanceKm`/`cardioCalories` in `lib/calc.ts`; `liveParams` in cardioStore. New i18n sections `onboard.*` and `cardio.setup/speed/incline/kcal` (en + ar, parity kept at 393 lines each).


All issues from `AUDIT_REPORT.md` were fixed except the three noted at the bottom. Type-check and Playwright could not be run (no disk space for the sandbox) — run `npm run lint` and `npm run test:e2e` to confirm.

## Critical
- **C1** `bootstrap.ts` — profile/settings now seeded with `updatedAt: 0`, so a fresh install can never clobber the cloud copy.
- **C2** `utils.ts` + `workoutStore.ts` — `debounce` now has `flush()`/`cancel()`; `finishSession` cancels the pending write, discard paths cancel, direct puts flush first.

## High
- **H1** `SyncEngine.flushDeletions` — tombstone only cleared after the cloud delete succeeds; failures retry next sync.
- **H2** Deletions now write marker docs to `users/{uid}/deletions`; other devices pull and apply them (edit-wins on conflict). Rules already cover the subcollection.
- **H3** Pushes stamp a server-set `syncedAt`; incremental pulls cursor on that (new `pullCursorV2`, one full re-pull on first run) instead of the editing device's clock.
- **H4** `cloudStore.syncNow` reloads all zustand stores after a pull lands new data (and restores the selected day).
- **H5** `ExerciseCard` remove-exercise button unhidden — remove/undo/restore flow now reachable.
- **H6** Bodyweight logging UI added to Progress → Body tab (reuses `home.quick.addWeight` keys); calls `cardioStore.logWeight`.
- **H7** `habitStore.refresh` only persists when the checklist actually changed (order-insensitive compare) — remote manual toggles can now win sync; `buildChecklist` omits the supplements item when the plan has none (L6).
- **H8** e2e: greeting assertions fixed; two dead quick-action tests removed; `waitForSW` now fails loudly.

## Medium
- **M1** `pushCollection` compare-and-sets the dirty flag (no longer rewrites a stale snapshot over concurrent edits); `dirty` stripped from cloud docs.
- **M2** `toggleSetDone` mirrors into `logs` in both branches.
- **M3** `clearDayData` records a `dailyChecklists` tombstone.
- **M4** `discardDraft` keeps (and flushes) drafts with entered data; only empty drafts are deleted.
- **M5** Dialog store resets optional fields per dialog and settles any orphaned promise.
- **M6** `signIn` returns a boolean; Settings closes the auth sheet only on success.
- **M7** `measurementStore.save` merges over existing values; `labelOf` falls back to custom labels / raw key.
- **M8** Live cardio timer start moved into `cardioStore` (`liveStart`) — survives navigation.
- **M9** `buildSession`/`restoreDayExercises` tolerate plan days referencing missing exercises.
- **M10** `cloudStore.init` is idempotent; `wipeCloud` takes the sync mutex; reconnect forces a sync.
- **M11** Stale-response guards: `nutritionStore.load` (token) and `habitStore.refresh`/`toggle` (monotonic seq).
- **M12** Reminder poller fires on due-or-overdue (`time <= now`), not exact-minute match.
- **M14** Security headers (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy) added to vercel.json + firebase.json.
- **M15** Missing photo blobs render a neutral placeholder instead of a broken image.

## Low
L1 offline sync no longer reports "synced" · L2 `videoAssets` removed from sync (no dirty support; wipe still clears legacy data) · L3 `userEdited` flag protects pasted video URLs from seed upgrades · L4 day rolls forward at midnight on re-focus · L5 pause→resume keeps the timer's original total · L7 `normalize` backfills `waterMl`/`creatineTaken` (NaN guard) · L8 water % and ProgressRing NaN guards · L9 per-exercise `restSec` used for rest timer · L10 PhotoImg/VideoPlayerSheet blob-URL races and leaks fixed · L11 DayNav duplicate date removed · L12 Sheet/Dialog: Escape closes, body scroll locked, panel focused · L13 RestTimerBar i18n (`workout.rest/skip/pause`) + cardio dates localized · L14 pinch-zoom re-enabled · L15 SW update reload deferred until app is backgrounded · L16 `.gitignore` covers all `.env*` · L18 smoke script port/import fixed + `test:smoke` script · L19 `waitForSW` throws · L20 dead i18n keys removed (both languages, still line-mirrored) · L21 stale dataSource comment + dead `setDataSource` removed · L23 no-op timer-log stubs removed · L24 video download dedup + progress cleanup.

## Deliberately not changed
- **M13** Firestore rules content-validation / App Check — needs testing against live sync; current per-user scoping is correct. Recommend enabling App Check in the Firebase console.
- **L17** Google Sheet ID in `scripts/extractFromXlsx.mjs` — import-time script only; move to env if the repo goes public.
- **L22** Seed nutrition macros vs targets mismatch — domain data; adjust the numbers in `nutritionPlan.seed.ts` with your coach.
- **L25** Firestore SDK's own IndexedDB cache isn't cleared on reset — requires terminating the Firestore instance; low impact.

## Architectural notes (unchanged behavior)
- Daily logs keyed by date are whole-document last-write-wins across devices logging the same day.
- Progress-photo image bytes remain device-local by design; records sync, missing images now show a placeholder.
