# B0 — Implementation log (live)

> Phase B0 — Safety, Trust & Cleanup. Spec: docs/product-audit/00–18 + ../FORMA_PRODUCT_REMOVAL_CANDIDATES.md.
> Baseline before any change (2026-10-05, HEAD `e7663ab`): `npx tsc -b --noEmit` clean · `vitest run` 31 files / 298 tests passing.
> Each entry: ID · STATUS · ROOT CAUSE · FILES CHANGED · FIX · TEST · BROWSER VERIFICATION · DEVIATION.

> Harness note (2026-10-05): the isolated e2e3 dev server crashed with esbuild "out of memory" because Vite's dependency
> scan crawled every `.html` under the repo root, including ~16 GB of old Playwright trace resources in `e2e-out/`.
> Fixed at the root with `optimizeDeps.entries: ['index.html']` in `vite.config.ts` (dev-only; no effect on `vite build`).

---

## B0.1 — Coach data safety & privacy

### CO-01 — Coach plan editor can wipe a client's plan (failed load → editable empty plan → save)
- **STATUS:** FIXED
- **ROOT CAUSE:** The editors initialised an empty plan whenever the query was not loading — including on error/offline — and `*.save` was an unconditional replace on the server, so saving the "empty" editor overwrote the real plan. No concurrency check; versions were only written on explicit "save as version".
- **FILES CHANGED:** `api/_trpc/routers/clientPlans.ts` (guarded `savePlanGuarded`, atomic compare-and-replace on `updatedAt`, automatic versioning, legacy capture, `replaceExisting` for template assignment, `updateExerciseFromLibrary` removed), `api/client/_lib/types.ts` (`PlanVersionDoc.planUpdatedAt`), `src/hooks/usePlanEditor.ts` (new state machine), `src/components/coach/PlanEditorStates.tsx` (new: loading/offline/error/empty gate + conflict banner), `src/components/coach/VersionActions.tsx`, `src/pages/coach/Coach{Workout,Nutrition,Cardio}Editor.tsx`, `src/components/workout/PlanBuilder.tsx`, `src/services/platform/{planApi,planVersionsApi,coachAssetsApi}.ts`, i18n `trust.planEditor.*`.
- **FIX:** Editing is impossible until the plan is loaded; error/offline show an explicit state with Retry; "no plan yet" is a distinct state with a deliberate Create. Every save carries `baseUpdatedAt` (null = create); the server refuses a missing base (BAD_REQUEST), a create over an existing plan, and any stale base (CONFLICT) via an atomic `replaceOne({_id, updatedAt})`. Every save writes a version (a legacy plan with no history is captured first). Conflict UI: "Load latest" / "Keep mine" (re-reads the base, then overwrites — the previous version stays restorable). No raw server text is shown.
- **TEST:** `api/_trpc/routers/planSafety.test.ts` (9), `api/_trpc/routers/client.test.ts` (plan contract), `api/_trpc/routers/coverage.test.ts` (updated to guarded saves), `src/pages/coach/CoachWorkoutEditor.test.tsx` (3).
- **BROWSER VERIFICATION:** see B0 browser run below.
- **DEVIATION:** `updateExerciseFromLibrary` (an unguarded server-side plan rewrite) was removed instead of guarded; the library refresh now merges locally and goes through the guarded save.

### CO-02 / CO-21 — Private coach notes and assessment review notes reached the client
- **STATUS:** FIXED
- **ROOT CAUSE:** `coachNotes.list` returned every note to anyone who can read the client (including the client); `create` always notified the client with a 140-char excerpt; assessment review notes lived inside the client-owned `assessment` object and every `assessment.*` read returned them; `MyAssessment` rendered them as "Coach feedback".
- **FILES CHANGED:** `api/client/_lib/{types,notify}.ts`, `api/messages/_handlers/notifications-data.ts`, `api/_trpc/routers/{clientCoachNotes,notifications,clientProfile}.ts`, `src/types/index.ts` (`NoteVisibility`), `src/services/platform/coachApi.ts`, `src/components/coach/NoteVisibility.tsx` (new), `src/pages/coach/{CoachClientNotes,CoachClientDetail,CoachViewLayout,CoachClientAssessment,CoachCheckIns,CoachCheckInsOverview}.tsx`, `src/components/EntityNotes.tsx`, `src/pages/MyAssessment.tsx`, i18n `trust.notes.*`, `trust.assessment.*`, `trust.checkin.feedbackVisible`.
- **FIX:** Notes carry `visibility: 'private' | 'client'`, **private by default**. The client role's `list` filters server-side to `visibility: 'client'` (legacy notes without the field are private). Only shared notes notify the client; `notifications.list` strips the body of any `coach_note` notification without the shared marker (old rows). Assessment review notes moved to `privateNotes.assessment`, outside `assessment`; every client-bound assessment response strips `coachNotes` (legacy docs too); coaches still read them; a client resubmit moves a legacy note into the private field. Coach UI: "Share with client" toggle (off by default) in every composer, Private / Visible-to-client badge on every listed note, "Private review notes — only you can see these" on the assessment, "The client will see this feedback" under check-in feedback. Client "Coach feedback" block removed. The notes tab shows an error with Retry instead of "No notes" on a failed load.
- **TEST:** `api/_trpc/routers/notePrivacy.test.ts` (11), `src/pages/coach/CoachClientNotes.test.tsx` (3).
- **BROWSER VERIFICATION:** see B0 browser run below.
- **DEVIATION:** None.

### CO-03 — Any coach could enumerate other coaches' clients with contact data
- **STATUS:** FIXED
- **ROOT CAUSE:** `adminUsers.searchClients` matched a name prefix (one letter returned everyone) and returned the full user document (email, phone, `assignedCoachId`, permissions, flags, createdBy); the UI then resolved and showed the other coach's name.
- **FILES CHANGED:** `api/_trpc/routers/{adminUsers,transfers}.ts`, `src/services/platform/{accountsApi,transferApi}.ts`, `src/pages/coach/AddExistingClient.tsx`, `src/pages/coach/CoachClients.tsx` (chooser copy), i18n `trust.existing.*`, `e2e3/specs/21-transfer.spec.ts` (now asserts the other coach is NOT named).
- **FIX:** Coaches: exact email (case-insensitive) or exact phone only; ≤ 5 results; only `{ id, displayName, coaching: 'you'|'another'|'none', accountStatus? }` (status only when the coach could act on it); rate-limited (30 / 10 min per coach) and audited (`client.lookup`, without the identifier). Admins (`users.read`) keep name-prefix matching with the same minimal shape. `transfers.create` derives `fromCoachId` server-side. UI shows the name, the identifier the coach typed, and "Already has a coach" / "You" / "No coach"; failures and rate limits show an error with Retry (never "no account").
- **TEST:** `api/_trpc/routers/clientLookup.test.ts` (6). Existing `certification`, `coachClients`, `phase2` suites still pass.
- **BROWSER VERIFICATION:** see B0 browser run below.
- **DEVIATION:** The audit also floated removing the coach "Add existing" branch (CO-37) — a product decision, not done in B0.

### CO-04 / MS-01 — Coach thread composer hidden under the bottom nav when a banner shows
- **STATUS:** FIXED
- **ROOT CAUSE:** `CoachMessageThread` used a fixed `h-[calc(100dvh-8.5rem)]` that assumed nothing renders above it; the coach plan banner pushed the composer under the fixed bottom nav. The client fix (cf3a5d9) was never applied here.
- **FILES CHANGED:** `src/hooks/useFillToBottomNav.ts` (new, shared; extracted from `Messages.tsx`, with an md+ variant for the sidebar shell), `src/pages/Messages.tsx`, `src/pages/coach/CoachMessageThread.tsx`, `e2e3/specs/60-b0-coach-composer.responsive.spec.ts` (new).
- **FIX:** One shared "fill to bottom nav" layout: the thread column sizes from its measured top edge to the top of the bottom nav (+ safe-area inset), re-measured when banners mount/resize; at ≥ md it leaves the shell's bottom padding instead. Keyboard behaviour unchanged (MessageThread already re-pins on `visualViewport` resize).
- **TEST:** e2e (layout).
- **BROWSER VERIFICATION:** PASS — isolated e2e3 `60-b0-coach-composer.responsive.spec.ts` at 390 / 430 / 768 / 1280, **EN and AR (RTL)**, with an active Forma term ending in 3 days (the audit's banner): Send is the element under its own centre, a message sends, no page scroll needed — 8/8. Client regression `33-composer-banner.responsive.spec.ts` 4/4.
- **DEVIATION:** None (no messenger redesign).

---

## B0.2 — Client offline, session & account isolation

### PWA-01 — Any network failure ended the session; offline cold start crashed / showed an unusable login
- **STATUS:** FIXED (browser verification: see B0 browser run)
- **ROOT CAUSE:** `refreshAccount` turned ANY error (offline, timeout, 5xx, lost refresh race) into `anonymous` + token/cache wipe and ran on every foreground; boot treated a failed refresh as "no session"; no request timeouts (a dead connection hung the splash); the login form lives in the `SitePages` chunk, excluded from the precache; the ErrorBoundary didn't recognise "Unable to preload CSS".
- **FILES CHANGED:** `src/services/platformApi.ts` (classified, single-flight refresh, 10 s deadline; `unauthorized` retried once in case another tab rotated the cookie), `src/services/trpc.ts` (30 s deadline per request), `src/services/auth/{sessionStore,mongoAuth}.ts`, `src/App.tsx`, `vite.config.ts` (precache `SitePages`), `src/components/ErrorBoundary.tsx`.
- **FIX:** The session ends only on a server-confirmed 401/403 from the refresh endpoint or an explicit sign-out. The last verified identity is kept on the device; an offline / timed-out / 5xx boot or resume keeps the user signed in on it (`verified: false`) with local data usable, and re-verifies on `online` / foreground. A boot that fails with no cached identity retries on reconnect. Foreground calls `reverify()` (never a raw account refresh). Login chunk precached; CSS-preload failures get the stale-chunk recovery.
- **TEST:** `src/services/auth/sessionStore.test.tsx` (8).
- **DEVIATION:** Coaches/admins restored offline from the cached identity see their online-only screens with offline/error states instead of a login form — the audit's "session survives everything except 401" applied to every role.

### PWA-02 / PWA-03 / PWA-05 — One shared local database: account switch wiped unsynced data, replayed the previous user's deletions, kept stale cursors
- **STATUS:** FIXED
- **ROOT CAUSE:** All roles shared one IndexedDB (`gym-tracker`); `scopeLocalToUser` wiped 11 stores when a different uid signed in (pending work destroyed), never cleared `deletions` (A's date-keyed tombstones were flushed under B), and removed only a legacy cursor key (`pullCursorV2`) while the engine used `pullCursorV3`.
- **FILES CHANGED:** `src/data/localScope.ts` (new), `src/data/accountRuntime.ts` (new), `src/data/adapters/local/LocalRepository.ts`, `src/data/blobStore.ts`, `src/data/sync/{tombstones,SyncEngine,pending}.ts`, `src/data/bootstrap.ts`, `src/data/reset.ts`, `src/services/platform/clientSync.ts` (`scopeLocalToUser` removed; coach-content mirror guarded by owner), `src/apps/ClientApp.tsx`, `src/App.tsx`, `src/i18n/index.ts` (device-level language), `src/pages/Settings.tsx`, `src/components/DialogHost.tsx`.
- **FIX:** Every account gets its own database `forma-u-<uid>` (logs, plans, settings, blobs, tombstones, conflicts, cursors). Nothing is deleted on sign-out or switch; an account's pending work stays in its own database and syncs at its next sign-in on the device. The legacy shared database is migrated once (copy → verify → clear) into its recorded owner only; unknown-owner legacy data is left untouched. Leaving an account flushes pending writes and waits for any in-flight sync; the engine aborts if the open account changes mid-pass. The sign-out confirm states how many changes haven't synced and that they stay on the device. Language is a device-level preference so the login screen and new account databases keep it.
- **TEST:** `src/data/localScope.test.tsx` (4).
- **DEVIATION:** None — the wipe-on-switch model is gone, so "never delete a database with pending ops" holds trivially.

### PWA-04 — Coach/admin sessions ran the client sync engine
- **STATUS:** FIXED
- **ROOT CAUSE:** `useCloud.init()` followed every signed-in account; App loaded all client stores and reminders before knowing the role.
- **FILES CHANGED:** `src/services/auth/cloudStore.ts` (explicit `start(uid)` / `stop()`), `src/data/accountRuntime.ts`, `src/App.tsx`.
- **FIX:** Only the client role opens the local-first runtime (stores, reminders, timers, cloud sync). Coaches/admins load only their own database's settings (language). With per-account databases a coach session can no longer capture a client's records.
- **TEST:** engine scope guard in `localScope.test.tsx`; coach-boot network check in the browser run.
- **DEVIATION:** None.

### PWA-06 — Cross-device writes silently overwrote each other
- **STATUS:** MITIGATED (no silent loss: conflicts are detected and the user chooses; automatic per-item merge deferred)
- **ROOT CAUSE:** Pull applied last-write-wins on the editing device's clock; the server upserted and deleted unconditionally.
- **FILES CHANGED:** `api/sync/_data.ts` (`rev`), `api/_trpc/routers/sync.ts`, `src/data/sync/{SyncEngine,conflicts,tombstones}.ts`, `src/data/adapters/local/LocalRepository.ts`, `src/components/SyncConflictNotice.tsx` (new), `src/components/AppShell.tsx`, `src/services/auth/cloudStore.ts`, `src/stores/{cardioStore,measurementStore}.ts` (keep `_rev` on re-save), `src/types/index.ts`, i18n `trust.sync.*`.
- **FIX:** Server-managed revision per record (+1 per accepted write). Pushes and deletes are conditional on the revision the device last saw (`baseRev`; `null` = never saw one) via atomic compare-and-set; anything else returns the server copy as a conflict. Pre-revision clients can no longer replace a newer copy with an older edit. The client never overwrites unsynced local edits on pull: they become a parked conflict (not pushed) and a notice asks "Keep this device's / Use the other device's"; identical content is not a conflict; screens reload after a choice. A refused delete brings the edited copy back; remote deletes never drop unsynced local edits. Cursor version bumped (V4) so every device re-pulls once to learn revisions; only edits migrated from the legacy shared DB get a one-time "newer than server" transition.
- **TEST:** `api/_trpc/routers/syncConflicts.test.ts` (8), `src/data/sync/SyncEngine.conflict.test.tsx` (4, two devices end-to-end through the real engine).
- **DEVIATION:** Entity-level records so edits to different meals on two devices MERGE automatically (audit §26.3) is a data-model rebuild → deferred to B1+.

### PWA-07 — Live cardio timer, rest timer and recent edits lost on reload / OS kill
- **STATUS:** FIXED
- **ROOT CAUSE:** `liveStart` and the rest timer were memory-only; the workout's 300 ms debounced write had no flush on hide; nutrition showed a tap before an un-awaited, un-caught IndexedDB write.
- **FILES CHANGED:** `src/lib/liveState.ts` (new), `src/stores/{cardioStore,timerStore,workoutStore,nutritionStore}.ts`, `src/pages/WorkoutSession.tsx`, `src/data/accountRuntime.ts`, i18n `trust.local.saveFailed`.
- **FIX:** Cardio start + params, rest-timer end/paused state and the session's current exercise are persisted synchronously (localStorage, per account) and restored after a reload; a rest timer that finished while closed is dropped silently; a cardio timer older than 12 h isn't resumed. Pending workout edits flush on `visibilitychange: hidden` / `pagehide` and before an account switch. Nutrition writes revert the screen and say so if the device save fails.
- **TEST:** `src/stores/liveActivity.test.tsx` (6).
- **DEVIATION:** Midnight-rollover re-selection relies on the existing unfinished-session recovery in WorkoutSession (unchanged).

### PWA-08 — Signing out offline didn't sign out
- **STATUS:** FIXED
- **ROOT CAUSE:** `auth.logout` failure was swallowed (the httpOnly refresh cookie survived) and the foreground account refresh ran even when anonymous, silently restoring the session.
- **FILES CHANGED:** `src/services/auth/{sessionStore,mongoAuth}.ts`, `src/App.tsx`.
- **FIX:** `signOutUser()` reports whether the server revoked the cookie; if not, a local "signed out" marker blocks every automatic restore (boot, foreground, reconnect) until the server logout succeeds (retried on `online` / launch) or someone signs in explicitly. Foreground/reconnect never restore from a real anonymous state.
- **TEST:** `sessionStore.test.tsx` (3 of 8).
- **DEVIATION:** None.

> Checkpoint after B0.2: `tsc -b --noEmit` clean · `vitest run` 40 files / 357 tests passing.

---

## B0.3 — Logging correctness

### CL-17 / JR-01 — Ticking a set that shows last time's numbers saved an empty "logged" set
- **STATUS:** FIXED
- **ROOT CAUSE:** The row's grey placeholders are the previous session's values, but ✓ only flipped `done`, storing `weightKg: null, actualReps: null` as a completed set (0 volume, "– × –" for the coach, summary "Logged").
- **FILES CHANGED:** `src/stores/workoutStore.ts` (`toggleSetDone` returns boolean), `src/components/ExerciseCard.tsx`, `src/pages/WorkoutSession.tsx`, i18n `trust.workout.enterReps`.
- **FIX:** ✓ commits what the row displays: typed values win; empty fields take last session's values; a plain-number rep target counts as displayed. If no reps value can be determined (no history + a range target), the tick is refused — nothing changes, the reps cell is highlighted and "Enter the reps for this set first." is shown. Weight may stay empty (bodyweight) or be 0. Unticking keeps the numbers. No rest timer / haptic on a refused tick.
- **TEST:** `src/stores/loggingCorrectness.test.tsx` (5 of 7).
- **BROWSER VERIFICATION:** see B0 browser run (set logging at 390).
- **DEVIATION:** None.

### CL-04 / NT-02 — Hidden selected day dated new logs; notifications moved it without a tap
- **STATUS:** FIXED (B0 scope) — the full per-screen date model (CL-04 REBUILD) stays for B1+
- **ROOT CAUSE:** `clientNoteRoute()` set the app-wide selected day as a side effect, and NotificationBell called it while BUILDING each toast (live and on every backlog replay); `startSession` took its date from that selected day; nothing returned the app to today.
- **FILES CHANGED:** `src/lib/noteTarget.ts` (pure `clientNoteRoute` + explicit `openClientNote`), `src/components/NotificationBell.tsx`, `src/pages/{Notifications,CoachInbox}.tsx`, `src/stores/workoutStore.ts`, `src/components/BottomNav.tsx`, `src/stores/dayStore.ts`.
- **FIX:** Resolving a notification's route has no side effects; only a TAP arms the focus and shows the note's day (DayNav then shows that date with its "Today" button). A new workout session is always created on today. Leaving through the bottom-nav tabs, or returning to the app after ≥ 30 min, resets the day to today. Audit of the other writers: Nutrition, Cardio and Measurements write to the selected day only on screens that show DayNav (date visible + "Today"); Progress logs weight on today explicitly; Home shows DayNav.
- **TEST:** `src/stores/loggingCorrectness.test.tsx` (2 of 7: session on today with a past day selected; pure route vs explicit open). Cold open with dated notifications → see B0.4 bell test.
- **BROWSER VERIFICATION:** see B0 browser run (dated notification cold open).
- **DEVIATION:** "Editing Mon 29 Sep" banner wording is not added — DayNav already shows the date + "Today" on every day-scoped screen; the per-screen local date model is a B1+ rebuild.

---

## B0.4 — Notification trust

### NT-01 — Old notifications replayed as stacked toasts on every app open
- **STATUS:** FIXED
- **ROOT CAUSE:** The bell's "new" baseline was an in-memory ref set from the first populated render — reset on every launch, reload and update reload; with an empty first render, the whole unread backlog counted as new.
- **FILES CHANGED:** `src/lib/notificationBaseline.ts` (new), `src/components/NotificationBell.tsx`.
- **FIX:** "New" is judged against a per-user high-water mark stored on the device, advanced after every successful poll; the first poll ever on a device only sets the baseline; nothing is evaluated while the feed is still loading; only rows created in the last 10 minutes and still unread/unresolved can toast; a message for the thread already on screen is never toasted. Applies to client, coach and super-admin.
- **TEST:** `src/components/NotificationBell.test.tsx` (4: cold open with backlog incl. dated notes → no toasts, day untouched; relaunch → no replay; a new item toasts once and only the tap moves the day; loading feed / stale items never toast).
- **BROWSER VERIFICATION:** see B0 browser run (dated-notification cold open).
- **DEVIATION:** None.

### NT-03 — Unread never cleared: no mark-all, finished tasks stayed unread
- **STATUS:** FIXED (seen/read/resolved clarified; Web Push / digest NOT in scope)
- **ROOT CAUSE:** Only three UI paths ever set `seenAt`; the server mark-all existed but was unused; no handler resolved the notification for the task it completed.
- **FILES CHANGED:** `api/messages/_handlers/notifications-data.ts` (`resolvedAt`, `resolveNotifications`), `api/client/_lib/types.ts`, `api/_trpc/routers/{clientCheckIns,messages,clientProfile}.ts`, `src/types/index.ts`, `src/services/platform/notificationsApi.ts` (`markAllNotificationsSeen`, poll error reporting), `src/hooks/useNotifications.ts` (`error`, `retry`), `src/pages/Notifications.tsx`, i18n `trust.notifications.*`.
- **FIX:** One meaning per state — **read** (`seenAt`: the user saw it; drives the badge) and **done** (`resolvedAt`: the task it asked for was completed; resolving also marks it read). Resolution on the server: `checkin_requested` on submit, `checkin_submitted` on review, `freeze_requested` on decision or client cancel, `message_received` when that thread is read, `assessment_submitted` on review. "Mark all read" on the notifications page (all roles but super-admin, whose items are pending requests). Resolved rows show a "Done" chip. A feed that never loaded shows "Couldn't load notifications" + Retry instead of an endless "Working…".
- **TEST:** `api/_trpc/routers/notificationLifecycle.test.ts` (5: check-in request/submission resolution; freeze decide + cancel; thread read; mark-all clears the badge without marking tasks done; no cross-client resolution).
- **BROWSER VERIFICATION:** see B0 browser run.
- **DEVIATION:** "Mark everything visible as seen when the feed opens" (audit direction) is not automatic — an explicit "Mark all read" was chosen so opening the feed doesn't hide what's new. Per-thread message coalescing (NT-05) and feed redesign (NT-06) stay B1+; Web Push / email digests (NT-04) excluded by the B0 brief.

---

## B0.5 — Check-in task flow

### CL-42 / JR-05 — The weekly check-in hid its Continue button and lost answers
- **STATUS:** FIXED (B0 scope: flow mechanics; slider/default redesign stays B1+)
- **ROOT CAUSE:** The wizard rendered inside the normal page with an inert `sticky` footer, so at 360–430 px the action bar sat below the fixed bottom nav; answers lived only in component state, so ✕, a tab, the bell or a reload discarded them; submit relied only on a disabled state that lands after the next render.
- **FILES CHANGED:** `src/pages/CheckIn.tsx`, i18n `trust.checkin.{leaveTitle,leaveBody,leave,keepGoing,submitFailed}`.
- **FIX:** The wizard is a full-screen task layer (`fixed inset-0`, above the nav and banners) with a scrolling body and a pinned action bar padded for the safe area — Continue / Submit is always on screen. Every answer and the current step are saved on the device per user + check-in and the flow resumes there (after close, reload, OS kill or update reload); the draft is cleared only after a confirmed submit. Leaving mid-flow (✕, back, bottom nav) asks "Leave the check-in? Your answers are saved on this device". Submit is single-flight (ref guard + disabled while pending/after success); a failed submit says the check-in wasn't sent and keeps every answer (no raw server text).
- **TEST:** `src/pages/CheckIn.test.tsx` (5: full-screen layer with the action outside the scrolling body; answers + step resume after unmount; leave guard armed once answered; triple tap → one submit, draft cleared after success; failed submit keeps answers and shows a safe message).
- **BROWSER VERIFICATION:** see B0 browser run (check-in at 390 / 430 / RTL).
- **DEVIATION:** CL-42's other items (unset sliders with anchor labels instead of 80% / 5 defaults, prefill weight from logs, writing the weight into the weight log, removing the invented "~4 min left") are content/UX redesign → B1+.

---

## B0.6 — Video honesty (+ upload honesty)

### CL-20 (+ MD-07 player part, MD-09) — Video / info buttons with nothing behind them; dead 0:00 players; any string accepted as a video link
- **STATUS:** FIXED (no transcoding — MD-05 stays deferred)
- **ROOT CAUSE:** The video button was always rendered (863/909 exercises have no video; platform clients never get local assets); Drive/Vimeo/Instagram links were handed to `<video>` and sat at 0:00 with no message; `<video>` had no loading/failed state except a single re-resolve in the local-asset sheet; ⓘ opened an empty panel; `videoUrl` accepted any string (incl. `javascript:` rendered as `<a href>`).
- **FILES CHANGED:** `src/lib/videoSource.ts` (new classifier), `src/components/video/VideoPlayer.tsx` (new `VideoFilePlayer` / `VideoSourcePlayer`), `src/components/{VideoPopup,ExerciseCard,VideoPlayerSheet}.tsx`, `src/components/workout/{ExerciseView,ExerciseForm}.tsx`, `src/pages/{WorkoutSession,ExerciseDetail}.tsx`, `api/coach-assets/_lib/schemas.ts`, i18n `trust.video.*`.
- **FIX:** One classifier decides what can play: YouTube (privacy-enhanced `youtube-nocookie` embed; YouTube kept), https video files (Forma uploads), everything else unsupported. Video buttons (session card, exercise detail) exist only when a playable coach link or a local asset exists; ⓘ only when there are notes/tempo. Players show a loading overlay until the first frame, and on error or a 20 s stall a failed state with Retry and "Open video"; a device that can't decode the file says so, with an explicit HEVC (iPhone .mov) explanation; offline says it needs a connection; unsupported links are explained, never shown as a player. Coach form: an unsupported link shows "Use a YouTube link, a direct https video file, or upload a video…" and blocks Save. Server: video links must be `https://` (no `javascript:` / `data:` / `http:`).
- **TEST:** `src/components/video/VideoHonesty.test.tsx` (8: classification; loading until first frame; HEVC failure with Retry/Open; stall → failed; unsupported link explained; no video/ⓘ button without content; button with a video; coach form blocks Drive, accepts YouTube), `api/_trpc/routers/coachAssets.test.ts` (+1: scheme validation).
- **BROWSER VERIFICATION:** see B0 browser run (video / no-video).
- **DEVIATION:** Server-side validation is scheme-only (https), not host-level, so an old saved link can't make an unrelated template save fail; host-level "can it play" is enforced where links are authored and where they're offered.

### Upload honesty (owner rule for the deferred Bunny work) — progress photos
- **STATUS:** FIXED (the rule); MD-01 DEFERRED BY OWNER; MD-02 / MD-03 DEFERRED (see report)
- **ROOT CAUSE:** Adding a progress photo always toasted "Saved" even when the CDN upload failed and the coach could not see it.
- **FILES CHANGED:** `src/stores/photoStore.ts` (`add()` resolves `{ uploaded }` only after the server returns the URL), `src/pages/ProgressPhotos.tsx`, i18n `trust.upload.*`.
- **FIX:** "Saved" only after an acknowledged upload; otherwise "Saved on this device only — your coach can't see this photo yet; it will retry", and every photo still waiting for upload carries a "Not uploaded" marker. `cdnUrl` is (and was) set only from the server's response. Other upload surfaces audited: chat attachments already have pending/failed/retry; avatar, check-in and assessment photo pickers only set the URL from the server response and show an inline error on failure; the exercise video upload alerts on failure.
- **TEST:** covered by type-level contract + browser run; no dedicated unit test.
- **DEVIATION:** None.

---

## B0.7 — Update-ready behaviour

### PWA-09 (B0 scope) — No update UI; the update reload fired whenever the app was backgrounded, even mid-workout
- **STATUS:** FIXED (B0 scope)
- **ROOT CAUSE:** `onNeedRefresh` reloaded on the next `visibilitychange: hidden` regardless of what was running (BV-06c: the rest timer was lost), and nothing told the user a new version existed.
- **FILES CHANGED:** `src/stores/updateStore.ts` (new), `src/components/UpdateAvailable.tsx` (new), `src/main.tsx`, `src/App.tsx`, i18n `trust.update.*`.
- **FIX:** A ready update shows a small "Update available · Tap to update" pill. It installs on its own only at a safe point — the app is hidden AND no live workout, live cardio, running rest timer, check-in in progress or unsaved editor (nav guard) is active. A tap during critical work asks first ("its saved progress resumes after the update… or update later"). The reload itself is vite-plugin-pwa's skip-waiting + controller-change reload.
- **TEST:** `src/components/UpdateAvailable.test.tsx` (3: hidden until ready, tap applies; tap during critical work asks and "Later" doesn't reload; safe point = hidden AND no critical work).
- **BROWSER VERIFICATION:** see B0 browser run (update available — prod-build two-version simulation).
- **DEVIATION:** None.

---

## B0.8 — Commercial correctness

### CO-14 — Renewal pre-filled as free; stale sheet values; failed read shown as "No subscription"; dates off by a day
- **STATUS:** FIXED (B0 scope; the 7-action panel redesign stays B1+)
- **ROOT CAUSE:** `SetTermSheet` initialised `price` to `''` and kept whatever state it was first mounted with; a failed relationship read rendered "No subscription" with the primary Set term; `toDate` formatted local-midnight timestamps with `toISOString()` (UTC), showing the previous day east of UTC; raw server messages were shown in alerts.
- **FILES CHANGED:** `src/pages/coach/CoachSubscriptionPanel.tsx`, i18n `trust.subscription.*`.
- **FIX:** The term sheet remounts on every open and is prefilled with the current term's price and currency (with a "prefilled from the current term" hint) — a renewal is never pre-filled as free; renewals start today; an end-date preview ("Ends 2026-12-05") is shown before saving. A failed read shows "Couldn't load this client's subscription" + Retry and the primary action stays disabled until the relationship loads. Dates are parsed and formatted in the coach's local timezone. Error alerts use the friendly commercial-error mapper.
- **TEST:** browser (renewal/history); server behaviour in `subscriptionHistory.test.ts`.
- **DEVIATION:** Currency stays a free-text field (not a picker) — copy/UX redesign.

### CO-15 — Renewing overwrote the previous term (no history)
- **STATUS:** FIXED
- **ROOT CAUSE:** `updateSubscription('setTerm')` replaced `startAt/endAt/price` in place; nothing ever wrote `subscriptionHistory`.
- **FILES CHANGED:** `api/coach-clients/_service.ts`.
- **FIX:** A term change archives the outgoing term (start, end — clipped to now for an early renewal — months, price, currency, the state it ended in: `expired` if it had lapsed, `ended` if replaced early) onto `subscriptionHistory`, atomically in the same update. Price edits, freezes and extensions change the current term and are not archived. Revenue/history readers (`coachDashboardApi`, `SubscriptionHistory`, `useSubscription`) already read that ledger.
- **TEST:** `api/_trpc/routers/subscriptionHistory.test.ts` (3: renewal archives the paid term; two renewals → two entries, early renewal = ended; price/extend/freeze don't archive).
- **DEVIATION:** Whether a term is a *payment record* (audit open question) is still a product decision; the ledger records terms with their price.

### CO-07 — The client list showed and filtered the admin account state
- **STATUS:** FIXED
- **ROOT CAUSE:** Rows, the desktop column and the filter chips used `accountStatus` (admin-only, "ACTIVE" on every row) instead of the coaching subscription.
- **FILES CHANGED:** `src/pages/coach/CoachClients.tsx`, i18n `trust.clients.*`.
- **FIX:** Rows (mobile + desktop column + preview) show the coaching state from the relationship's subscription — Active · Trial · Paused · Expiring ("Ends in N d", ≤ 7 days) · Expired · Pending · No plan — and the filter chips filter on it. The account state appears only as a warning when it blocks the client (pending / suspended / disabled). If the dashboard data hasn't loaded, no state is guessed.
- **TEST:** browser (statuses).
- **DEVIATION:** The subscription "frozen" label is shown as "Paused" so it no longer collides with the account "Frozen" wording.

---

## B0.9 — Arabic correctness

### RTL-02 — Egyptian-Arabic users got English dates and weekdays
- **STATUS:** FIXED (the cited surfaces)
- **ROOT CAUSE:** `i18n.language === 'ar'` checks fell back to English for `ar-eg` (Home eyebrow + recent rows, WeekStrip, History month + rows); History used hard-coded `['S','S','M','T','W','T','F']` and `.slice(0,3)` on localized weekday names; the assessment wizard stored `locale: 'en'` for ar-eg.
- **FILES CHANGED:** `src/lib/utils.ts` (`dateLocale`, `weekdayInitials`), `src/components/WeekStrip.tsx`, `src/pages/{History,Home}.tsx`, `src/pages/onboarding/AssessmentWizard.tsx`.
- **FIX:** One resolver — `ar` and `ar-eg` → `ar-EG` formats — used by every cited formatter; Saturday-first weekday initials generated with Intl `weekday: 'narrow'` in the app language; no slicing of localized names.
- **TEST:** `src/lib/arabicNumbers.test.tsx` (2 of 6: resolver; localized initials).
- **BROWSER VERIFICATION:** see B0 browser run (ar-eg Today / History).
- **DEVIATION:** Other surfaces already used `startsWith('ar')` and were left as is.

### RTL-04 — Arabic-Indic digits rejected or silently dropped in number entry
- **STATUS:** FIXED (workout, measurements, nutrition, check-in weight, progress weight, session duration, settings age / weekly goal, assessment deadline)
- **ROOT CAUSE:** Set cells validated with `/^\d*\.?\d*$/` before normalising; NumberStepper (check-in weight) and Progress weight were `type="number"` (Chrome rejects ٠-٩) parsed with `Number()`; the session duration and weekly goal stripped non-ASCII digits; MeasurementForm used `Number()` and silently skipped NaN; nutrition macros used `Number()`.
- **FILES CHANGED:** `src/lib/utils.ts` (`normalizeNumericText`, `parseDecimalOrNull`), `src/components/{ExerciseCard,NumberStepper,MeasurementForm}.tsx`, `src/pages/{Nutrition,Progress,WorkoutSession,Settings}.tsx`, `src/pages/onboarding/AssessmentWizard.tsx`, i18n `trust.numbers.invalid`.
- **FIX:** Every cited number entry normalises Arabic-Indic / Persian digits, `٫ , ،` and direction marks before validating/parsing. NumberStepper is a text field with a decimal keypad and local text state (so "80." and "٨٠٫٥" type correctly). A measurement value that can't be read is flagged next to the field and the save is blocked — never silently dropped.
- **TEST:** `src/lib/arabicNumbers.test.tsx` (4 of 6: normaliser; stepper "٨٠٫٥" and "80."; set reps "١٢"; measurements save "٩٥٫٥" and flag "9x").
- **BROWSER VERIFICATION:** see B0 browser run (Arabic numeric input at 390).
- **DEVIATION:** A single shared `NumericInput` kit component (audit direction) is B1 design-system work; B0 routes the existing inputs through one normaliser.

---

## B0.10 — Destructive client controls

### CL-44 / RM-56 — "Reset all data" (and "Clear this day's data") erased the coach-visible history
- **STATUS:** FIXED (removed)
- **ROOT CAUSE:** Settings › Data › "Reset all data" called `cloudStore.wipeCloud()` → `trpc.sync.wipe`, deleting ALL of the client's synced records, deletions and singletons — exactly what the coach reviews — behind copy that promised "local data"; "Clear this day's data" deleted the hidden selected day's logs and photos (and tombstoned them to the server).
- **FILES CHANGED:** `src/pages/Settings.tsx` (both buttons + handlers removed; the "Data" section keeps the storage-persistence status), `src/data/reset.ts` (deleted), `src/services/auth/cloudStore.ts` (`wipeCloud` removed), `src/data/sync/SyncEngine.ts` (`wipeCloud` removed), `api/_trpc/routers/sync.ts` (`sync.wipe` procedure deleted), i18n `settings.{clearDay,clearDayConfirm,resetAll,resetConfirm,resetOffline,resetCloudFailed}` removed (en/ar/ar-eg), tests `api/_trpc/routers/{sync,certification}.test.ts` updated.
- **FIX:** Neither destructive control exists any more, and there is no client-callable wipe on the server (a direct API call returns NOT_FOUND). No repair action was needed for B0: per-account local databases (PWA-02) remove the "start fresh on a shared device" reason; the existing "Update the app" action (service-worker + cache refresh) is the only local repair and touches no data. Account/data deletion is support-mediated.
- **TEST:** `api/_trpc/routers/sync.test.ts` (replaced: a client cannot wipe; `sync.wipe` → NOT_FOUND; history intact).
- **BROWSER VERIFICATION:** see B0 browser run (Settings has no reset / clear-day).
- **DEVIATION:** `sync.wipe` was deleted rather than kept for admin/support — it had no caller, and a support-only data deletion should be a separately audited admin action.

---

## B0.11 — The 24 "SAFE TO REMOVE" candidates

Only candidates classified **SAFE TO REMOVE** in `docs/FORMA_PRODUCT_REMOVAL_CANDIDATES.md` were processed; every name was verified with `git grep --untracked` (tracked + new files) before deletion, then `tsc -b`, `vitest`, the boundary script and `vite build` were re-run. None of the 54 product-decision items (History, marketing landing, Capacitor, the old `e2e/` suite, …) were touched.

| ID | STATUS | What was removed / changed | Verification |
|---|---|---|---|
| RM-01 | DONE | 14 unreachable modules (`components/ui/{DashboardCard,OfflineState,PermissionState,Page,ResponsiveGrid}`, `lib/starterLibrary.ts`, `pages/RolePlaceholder.tsx`, `theme/{index,breakpoints,elevation,motion,radius,spacing,typography}`), unused `.btn-light` CSS rule and `spacing.touch` token; boundary script + `DESIGN_SYSTEM.md`/`ARCHITECTURE.md` updated. Colour tokens kept (used via `theme/colors.ts` and the website). | zero importers |
| RM-02 | DONE | `cloudAvailable()` (always true) and all 24 call sites; every `'local-user'` check; dead local-only branches: Settings age/weight/height/goal/activity editors + "Add Firebase keys" branch, Onboarding sign-in mode, deprecated `cloudStore.signIn/signOut`, the bootstrap seed branch. | tsc + vitest |
| RM-03 | DONE | ~35 dead service functions: `coachApi` (assignPlan/createTemplate/listAssignedPlans/…/get/setCoachTargets/broadcastAnnouncement/saveClientProfile/fetchClientCardioLogs/assignTemplate), `coachAssetsApi` nutrition-template CRUD, `coachClientsApi` (incl. no-op `archiveAndClearCoachData`), `coachPlanApi` (createTrialPlan, bumpActiveClientCount, markTrialNotified), `inviteApi` (claimInvite throws, unclaimInvite no-op, client copies of generateInviteCode/buildClaimSubscription), `notificationsApi` (no-op `notify`, listNotifications, listCoachNotifications), `messagesApi.threadMeta`, `checkInApi.checkInTrends`, `starterLibraryApi.fetchStarterExercises`, `planVersionsApi.saveAsNewVersion`; types `AssignedPlan`, `PlanTemplate`, `PlanKind`. | refs incl. untracked |
| RM-04 | DONE | The no-op trial-expiry chain: `coachTrialApi.ts` (deleted), its `CoachDashboard` mount effect, `markTrialNotified`, the client `CoachPlan.trialNotified` type. | — |
| RM-05 | PARTIAL | Removed dead exports `dowOf`, `parseRestInput`, `passwordValid`, `useFlag`, `homeFor`, `SELF_SIGNUP_STATUS`, `ResponsiveDialog`, `coachPlanTiersCol`, `clientSettingsCol`, `resolveCoachId`, `getEffectiveCoachClientLimit`; 8 declaration-only types (`MessageReaction`, `ChecklistKey`, `TimerLog`, `ClientSettingsDoc`, `WorkoutLogDoc`, `NutritionLogDoc`, `CardioLogDoc`, `WeightLogDoc`). Not done: dropping the `export` keyword from ~60 locally-used helpers (churn, no behaviour). | refs incl. untracked |
| RM-06 | PARTIAL | Dead store actions `nutritionStore.setCreatine`, `cardioStore.addSteps`, `settingsStore.add/removeMeasurementPart`, `habitStore.toggle`. Not done: narrowing streak computation to the workout streak (a CPU optimisation, not a removal). | — |
| RM-07 | DONE | Class names that generate no CSS: `h3`, `bd`, `bd-s`, `num`, `thin`, `tbl-wrap`, `hdr`, `ring-1.5` (21 tokens in 11 files). The History "today" highlight was already implemented by an inline `boxShadow`; the dead ring is gone. | no visual change |
| RM-08 | DONE | `src/data/seed/videoLinks.json`, `public/data/exercise-taxonomy-ar.json`. | zero refs |
| RM-09 | DONE | 292 unused i18n keys per locale (876 entries) incl. RM-51's, keys orphaned by B0 removals (`video.*`, `import.*`, old `existing.*`), and `settings.localOnly` ("Add Firebase keys") / `video.missingFile`; en/ar/ar-eg parity kept (2,018 each). `landing.features.secure.desc` ("Built on Firebase") is on the hidden `/landing-v1` (product decision RM-62) — left. | conservative audit (literal + dynamic-prefix usage) |
| RM-10 | DONE | Rewrote the misleading comments: permissions ("Firestore rules enforce…" → server rbac), `useCoachMessageUnread` / `useNotifications` ("live via onSnapshot" → shared polling), `api/_lib/rbac.ts`, `api/client/_lib/access.ts`, `api/coach-clients/_data.ts`, `types/index.ts` (no `firestore.rules` exists). Other historical Firestore mentions trimmed only where touched. | — |
| RM-12 | DONE | Deleted `scripts/{importSheet.ts,extractFromXlsx.mjs,extractVideoLinks.gs,smoke.mjs,makeIcons.mjs}` + npm scripts `import:sheet`, `test:smoke`; `fflate` devDependency uninstalled (still present transitively via `@types/three`); `check-boundaries.mjs` wired as `npm run lint:boundaries` (it immediately caught a B0 boundary slip — fixed by moving `NoteVisibility` to shared components). The demo seeders (`seed-demo-*.mjs`, which call the **production** API) are flagged in the report, not deleted (owner tooling). `.claude/settings.local.json` still references two deleted scripts — not edited (standing rule). | boundary script ✓ |
| RM-13 | DONE (non-destructive) | `CLEANUP_COMMAND*.ps1` deleted (destructive one-shots). `AUDIT_REPORT.md`, `FIXES.md`, `FORMA_AUDIT_REPORT.md`, `docs/phase1-coach-onboarding.patch` → `docs/archive/`. `gym tracker (1)/` (110 files, 7.8 MB with competitor docs) and `competitor-analysis/` **untracked + gitignored, local copies kept**. `*.tsbuildinfo` untracked + gitignored. `.claude/settings.local.json` skipped. | `git status` |
| RM-15 | DONE | `docs/QA.md`, `BETA_READINESS_PLAN.md`, `PHASE1_SUMMARY.md`, `features/design-system.md` → `docs/archive/`; `ARCHITECTURE.md` firebase bundle table + theme/state notes and `DESIGN_SYSTEM.md` primitive references corrected. README "Capacitor-ready" left (RM-71 is an owner decision). | — |
| RM-40 | DONE | `/settings/app` route + `ClientSettings.tsx`; `/progress/photos` route + standalone wrapper (notes now deep-link to `/progress?tab=photos`; e2e3 specs 30/40 updated). | tsc |
| RM-51 | DONE | Multi-tier plan copy pruned with RM-09; `SubscriptionPlanPicker` doc no longer promises the removed presets. | — |
| RM-57 | DONE | Legacy local video library: `VideoManager` / `ImportData` pages + routes + Settings rows, `stores/videoStore.ts`, `services/video/{CacheVideoStore,VideoStore}.ts`, `components/VideoPlayerSheet.tsx`, `services/sheetParser.ts`, `data/seed/videoAssets.seed.ts`, the `videoAssets` repo + `VideoAsset` types, session/detail fallback branches, the `exercise-videos` runtime cache and `/exercise_videos` header, and **`public/exercise_videos/` (30 mp4, 137,290,037 bytes)**. | build ✓ |
| RM-60 | DONE | Demo seed plan / meals / reminders / 1815-kcal default targets / SEED_VERSION logic (`workoutPlan.seed.ts`, `nutritionPlan.seed.ts`, `SEED_REMINDERS`). | — |
| RM-61 | DONE | Orphan route `/coach/client/:id/activity` + `CoachClientActivity.tsx` (`ClientActivityView` kept). | — |
| RM-69 | DONE | `CoachChecklist` reads only real data; the never-written `onboarding` flags and the frontend `CoachOnboarding` type removed. | — |
| RM-72 | DONE | `/experience` images + `Experience-*.css` excluded from the install precache. | precache 159 → 154 entries, 2.43 MB → 1.95 MiB (now incl. the login chunk) |
| RM-73 | DONE | Dead runtime-cache rules `exercise-videos` and `app-data` (`/data/*`; the server still reads the JSON from disk). `landing-images` kept — `/landing-v1` still exists (RM-62 is a product decision). | — |
| RM-81 | DONE | Client runtime gated to the client role (PWA-04) **and** `sync.*` is now client-only on the server (`roleProcedureNoActive('client')`; pending/suspended clients can still flush). | `certification.test.ts` (coach → FORBIDDEN) |
| RM-82 | DONE | One shared, ref-counted poller per key (`lib/sharedSubscription.ts`) for the notification feed, the client thread-meta badge and the coach unread badge — two mounted bells / badges no longer start two loops; `refreshNotifications()` forces an immediate poll. | `sharedSubscription.test.tsx` |
| RM-84 | PARTIAL | One query definition each for `coachPlan` and `coachDashboard` (`coachPlanQuery`, `coachDashboardQuery`, one staleTime); one key for the client's coach notes; `CoachChecklist` counts templates from the dashboard instead of downloading every template. Not done: coach-targets mirror vs `myCoachTargets`, roster fetched twice on Clients. | tsc + vitest |

> Checkpoint after B0.11: `tsc -b --noEmit` clean · `vitest run` 49 files / 400 tests · `npm run lint:boundaries` ✓ · `npm run build` ✓ (precache 154 entries / 1,953.4 KiB).

---

## B0.12–B0.16 — Verification pass: what the browser found, and the fixes

Bugs found while verifying B0 in a real browser (isolated stack, production-build service-worker simulation, and the full e2e3 regression suite). Each one was fixed at the root and given a regression test.

### V-01 — Offline deep link stuck on the splash forever (found in the B0 offline deep-link check)
- **STATUS:** FIXED
- **ROOT CAUSE:** `ClientGate` held the app on the splash while `useAssessmentStatus().isLoading`. In React Query v5, a query with no data goes back to `pending` on every refetch. Offline, the first read failed; then any screen sharing the `['assessment', uid]` key (Settings, Progress) triggered a refetch, the gate re-showed the splash, unmounted the screen, which remounted and refetched, and so on forever.
- **FILES CHANGED:** `src/hooks/useAssessmentStatus.ts`.
- **FIX:** Only the first read may hold the splash (`isLoading && !isFetched`). After a failed read the cached app renders, and the gate never re-traps a client who has already submitted (`blocked` needs a definitive success).
- **TEST:** `src/hooks/useAssessmentStatus.test.tsx` (fails without the fix).
- **BROWSER VERIFICATION:** prod-sim: offline deep links `/settings?tab=account` and `/progress` both render.
- **DEVIATION:** None.

### V-02 — "Update" installed the new service worker but the page never reloaded
- **STATUS:** FIXED
- **ROOT CAUSE:** vite-plugin-pwa reloads on `controlling` only when workbox-window reports `isUpdate`. That flag is false for a tab that wasn't controlled at registration (PWA-10 b, BV-06d). The page kept running old JS under the new worker.
- **FILES CHANGED:** `src/main.tsx`.
- **FIX:** `applyUpdate()` registers its own one-time `controllerchange → location.reload()` before asking the waiting worker to skip waiting. A guard ensures it runs only once.
- **TEST:** `src/components/UpdateAvailable.test.tsx` (safe-point logic); the reload itself is browser-only.
- **BROWSER VERIFICATION:** prod-sim: "idle + background: the update installs (reload at a safe point)" passes. During critical work there is no reload, and tapping asks first.
- **DEVIATION:** One sequence did not activate in automated Chrome. On a single tab, check-in → reload → live cardio → stop → Today, the waiting worker stayed `installed` after the background event, even when `SKIP_WAITING` was posted to it by hand. The same idle flow on a fresh tab installs and reloads. The root cause was not established and looks like an automation/lifecycle artefact rather than app logic (the app's call is the same in both). It is recorded as real-device check **R-13**, not claimed as verified.

### V-03 — Check-in: a failed load showed "not found"
- **STATUS:** FIXED (B0.16 rule: never turn an error into an empty state)
- **FILES CHANGED:** `src/pages/CheckIn.tsx`.
- **FIX:** A failed read with no cached check-in shows `ErrorState` with Retry (`checkin-load-error`). "Not found" now appears only after a successful read.
- **TEST:** `src/pages/CheckIn.test.tsx` (+1: error with Retry, then Retry loads the flow).

### V-04 — Settings › Account no longer showed the signed-in email (regression from the B0 cloud-store rewrite)
- **STATUS:** FIXED
- **ROOT CAUSE:** The B0 `cloudStore.start(uid)` set `user: { uid, email: null }`, and Settings displayed `cloudState.user.email`. Caught by e2e3 `10-auth` (client logout → next client).
- **FILES CHANGED:** `src/pages/Settings.tsx` (reads `account.email` from the session, the source of truth), `src/services/auth/cloudStore.ts` (the always-null `email` field removed).
- **TEST:** e2e3 `10-auth.spec.ts` "client logout … shows no previous-user data".

### V-05 — PWA-14: the previous account's progress photos stayed loaded in memory after an account switch
- **STATUS:** FIXED (the memory part; see PWA-14 in the report for the on-disk part)
- **ROOT CAUSE:** Every other client store is reloaded from the new account's database in `accountRuntime.enter()`. The photo store loads on demand (`ProgressPhotos`: `if (!loaded) load()`), so after A → B it still held A's photo list with `loaded: true`: dates, poses, weights, notes and CDN URLs, which `url()` falls back to. Until B's first sync refreshed the stores, B could open Progress › Photos and see A's uploaded photos.
- **FILES CHANGED:** `src/data/accountRuntime.ts`.
- **FIX:** Leaving a client account resets the photo store (`photos: []`, `loaded: false`). The next account reads only its own database.
- **TEST:** `src/data/accountRuntime.test.tsx` (fails without the fix).

### V-06 — Local reminders still notified as "Gym Tracker" (CL-45, legacy part)
- **STATUS:** FIXED
- **FILES CHANGED:** `src/services/reminders/reminderStore.ts` (notification title → "Forma").
- **DEVIATION:** Whether reminders stay at all (NT-09) is a product decision for B1+. Only the stale name was fixed.

### V-07 — Upload honesty had no unit test
- **STATUS:** FIXED
- **TEST:** `src/stores/photoUploadHonesty.test.tsx` (3): `add()` reports `uploaded: true` only once the server returns the URL. A rejected upload, or uploads being unavailable, reports `uploaded: false` and keeps the photo locally with no URL. The "it will retry" copy is backed by `load()`'s retry pass for photos without a `cdnUrl`.

### V-08 — Every edit after a sync was parked as "Changed on two devices" on a single phone (regression in the B0 PWA-06 work)
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - The base revision of an edit (`_rev`) came from the copy each screen holds in memory.
  - The engine stamps the acknowledged revision only into IndexedDB after a push. Stores are refreshed only after a pull that brought changes.
  - So the next edit of a just-pushed record carried no `_rev` (or an older one). The server correctly refused it as a conflict.
  - Different content → a parked conflict and a "Changed on two devices" notice. The edit never synced.
  - Found by e2e3 `30-client` (clearing a measurement never reached the server). The engine tests had always re-read from IndexedDB before editing, so they could not see it.
- **FILES CHANGED:** `src/data/adapters/local/LocalRepository.ts` (`withBaseRevision`, `putFromSync`), `src/data/repositories.ts`, `src/data/sync/{SyncEngine,conflicts}.ts`.
- **FIX:** The base revision is owned by the storage layer.
  - **App writes (`put`):**
    - an edit with no `_rev` keeps the stored one;
    - an edit with an older `_rev` keeps the stored one only if every revision since was this device's own push;
    - every engine write that brings in another device's content records `_remoteRev`;
    - if another device's content has landed since the edit's copy, the stale base is kept and the server reports a real conflict (PWA-06 intact).
  - **Engine and conflict-resolution writes** use `putFromSync`, which stores the revision fields exactly as given.
  - `_remoteRev` is stripped from pushes and ignored by `sameContent`.
- **TEST:** `src/data/sync/SyncEngine.conflict.test.tsx` (+4):
  - a copy created before its own push syncs without a conflict;
  - a copy several of its own pushes behind syncs;
  - a copy older than another device's change still conflicts;
  - the marker never reaches the server.

  The first two fail without the fix.
- **RESIDUAL:** One narrow race stays. If a screen edits a copy that has no revision at all, in the moment between a pull of another device's content and the store refresh that follows it, the edit is accepted rather than flagged. The engine's pull-time check still catches every case where this device had unsynced edits.

### V-09 — A change made just before signing out stayed on the device
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - Sync runs on start, on an interval, on focus and on reconnect, not on each change.
  - Before B0, any session change also forced a sync. The B0 runtime starts sync only when the account opens.
  - Signing out therefore left a fresh change (e.g. switching the language back to English) unsynced. The next sign-in on another device got the old value. e2e3 `30-client` → `31-messenger` ran the client in Arabic.
- **FILES CHANGED:** `src/pages/Settings.tsx`.
- **FIX:**
  - Sign-out first pushes what it can: a forced sync, bounded to 5 s, which returns at once offline.
  - It then counts what is still unsynced for the confirmation ("N changes haven't synced yet and stay on this device").
  - The button is disabled while this runs.
- **TEST:** e2e3 `30-client` (settings → Arabic → English → sign out) followed by `31-messenger` (fresh context, English).

### V-10 — "Update from library" could show raw server text
- **STATUS:** FIXED (B0.16)
- **FILES CHANGED:** `src/components/workout/PlanBuilder.tsx`.
- **FIX:** A missing source says "Source exercise is no longer available in your library"; any other failure shows the generic message, never `e.message`.

### V-11 — "Discard changes? → Leave" brought the discarded edit back on the next open (NAV-K02, exposed by CO-01)
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - Only the editors' own back button cleared the autosaved draft. Leaving through the sidebar, avatar or tab rail ("Leave") kept it.
  - Before B0 this was hidden by accident: the editor's plan timestamp never matched the server's after a save, so the leftover draft looked stale and was dropped.
  - CO-01's guarded save keeps the server's exact `updatedAt` as the base. The draft became "fresh", so a discarded edit reappeared. Found by e2e3 `23-nav-unsaved`.
- **FILES CHANGED:** `src/hooks/useUnsavedGuard.ts` (optional `onLeave`, run only when the user confirms Leave), `src/pages/coach/Coach{Workout,Nutrition,Cardio}Editor.tsx` (pass `discardDraft`).
- **TEST:** `src/hooks/useUnsavedGuard.test.tsx` (2: Leave discards; Cancel keeps). e2e3 `23-nav-unsaved`.
- **DEVIATION:** Browser / hardware Back is still not interceptable (E-B-5, known). The draft survives that path and is restored. The "three back controls" part of NAV-K02 is B1 IA work.

### V-12 — An uploaded exercise video couldn't be saved on the local/test stack
- **STATUS:** FIXED
- **ROOT CAUSE:** B0.6 accepts only `https` video links, client and server. The isolated stack's stub CDN (and any local dev CDN) serves `http://127.0.0.1…`, so a successful upload was classified "unsupported" and Save stayed disabled. Found by e2e3 `40-media`. Production Bunny URLs are https and were never affected.
- **FILES CHANGED:** `src/lib/videoSource.ts`, `api/coach-assets/_lib/schemas.ts`.
- **FIX:** Plain `http` is accepted **only** for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`). Real hosts must still be https; `javascript:` and `data:` are still refused.
- **TEST:** `VideoHonesty.test.tsx` (loopback accepted; the lookalike `127.0.0.1.evil.com` refused) and `coachAssets.test.ts` (loopback stored; `localhost@evil.com` and `127.0.0.1.evil.com` refused).

### V-13 — A new device showed "Changed on two devices" for today's checklist, which nobody edited
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - The daily checklist is rebuilt from the day's logs on every load. Its only manual input (`habitStore.toggle`) was dead code, removed in RM-06.
  - A device builds today's checklist before its first pull, with no base revision. Its first sync then met the copy another device had already pushed.
  - Under the B0 conflict rules (PWA-06) that is a two-device conflict, so the user was asked to choose between two machine-built checklists. Found by e2e3 `61-b0-trust`.
- **FILES CHANGED:** `src/data/sync/SyncEngine.ts` (`DERIVED` collections).
- **FIX:**
  - For derived collections (`dailyChecklists`), a conflict at pull or push adopts the server copy instead of asking. It counts as pulled, so the stores reload and the checklist is recomputed from the logs. The logs themselves sync and conflict-check as before.
  - A recomputed checklist then pushes on top of the adopted revision.
- **TEST:** `SyncEngine.conflict.test.tsx` (+1: a fresh device's auto-built checklist adopts the server copy with no conflict and the server untouched; the recomputed edit then syncs as rev 2). It fails without the fix.

### e2e3 hygiene: language restored on the server, not only in the UI
- `_d-layout.ts` (specs `44`, `45`) switched the client to Arabic / Egyptian Arabic and back to English through the UI, right before the browser context closed. The final English change never synced.
- Before B0 this didn't matter, because a fresh device's seed settings carried a current timestamp and overwrote the synced settings. That was a silent overwrite of the user's real preferences.
- Since B0 the seed is `updatedAt: 0` and the synced language wins (correct), so later specs started in Arabic.
- The helpers now also restore the server copy (`restoreClientLocale`). The app-side fix for a change made just before sign-out is V-09.

### e2e3 specs updated for intended B0 behaviour (not regressions)
| Spec | Old assertion | Why it changed | Update |
|---|---|---|---|
| `20-coach-core` (workout / nutrition / cardio "saves and survives reload", E-B-1 probe) | The editor for a client with no plan opens straight into an editable empty builder | CO-01: "no plan yet" is its own state, and creating one is a deliberate step | New helper `openPlanBuilder()` in `_b-helpers.ts` clicks **Create plan** when shown |
| `23-nav-unsaved` (3 entry points) | Same | Same | Same helper |
| `30-client` workout | An exercise without a video has a "Watch video" button that does nothing | EX-01: no dead video button | Asserts the button is absent |
| `22-library` step 6 | "Update from library" is persisted server-side at once | CO-01: the unguarded server-side rewrite (`updateExerciseFromLibrary`) was removed. The refresh is an editor change persisted by the guarded Save | Asserts it is unsaved until Save, then persisted |
| `61-b0-trust` 390-ar check-in | Arabic set on the device only | A signed-in client gets the **account's** language (device language = login screen / brand-new account) | Sets and restores the account's language |
| `21-transfer`, `30-client`, `40-media` | (updated earlier in B0) Notes deep-link to `/progress/photos`; old transfer and notes contract | RM-40 route removal; CO-02 note visibility | Updated in B0.1 / B0.11 |

---

## B0.13 — Browser verification

All runs used the **isolated** e2e3 stack (local MongoDB + stubbed Bunny/CDN, `e2e3/env/server.mjs`). Nothing touched production. The old `e2e/` suite and `playwright.config.ts`, which point at production, were not used.

### B0 journeys (new specs)
| Spec / script | Viewports | Result |
|---|---|---|
| `e2e3/specs/61-b0-trust.spec.ts` | client 390 (+430 for check-in), coach desktop | **13 / 13** |
| `e2e3/specs/60-b0-coach-composer.responsive.spec.ts` (CO-04, en + ar) | 1280, 1024, 768, 430, 390 | **8 / 8** |
| `e2e3/specs/33-composer-banner.responsive.spec.ts`: client composer regression (`cf3a5d9`) | responsive | **4 / 4** |
| Prod-sim `scratchpad/b0/b0-prodsim.mjs`: production build + real service worker, two builds swapped live, `/api` proxied to the isolated stack | Pixel 7, 390 × 844, real Chrome | **13 / 13** |

Coverage against the B0.13 brief:
- **Client 390:**
  - online launch (61);
  - offline cold launch and offline login screen (prod-sim);
  - online → offline → foreground (61 + prod-sim);
  - account A → B → A with an offline sign-out (prod-sim);
  - set logging (61);
  - dated notification cold open (61);
  - check-in at 390 and 430 (61);
  - video / no-video (61);
  - update available, idle and critical (prod-sim);
  - Arabic digits (61);
  - no reset / clear-day (61).
- **Coach:**
  - plan fetch failure (61);
  - private note → client (61);
  - add-existing privacy (61);
  - thread with banner, en and ar (60);
  - renewal and history (61);
  - statuses (61);
  - no client sync calls in a coach session (61).
- **Desktop:** the full e2e3 regression run below (chromium-1440 plus the responsive projects).

### Full e2e3 regression suite
All 217 tests in all projects (chromium-1440, chromium-1280, chromium-1024, tablet-768, mobile-430, mobile-390, webkit-iphone), one worker, on a fresh isolated stack per run.

| Run | Result | What it found |
|---|---|---|
| #1 (`b0-full1`) | Stopped at 70 / 217 | 17 failures. **Real bugs:** V-04 (Settings email), V-08 (false two-device conflicts), V-09 (change before sign-out not synced → the client stayed in Arabic for every later spec). **Specs asserting old behaviour:** CO-01 "Create plan" step, `22-library` "Update from library", the `30-client` no-video button. **Stale spec copy:** `23-nav-unsaved`. Stopped because every client spec after `30-client` ran in Arabic. |
| Re-run of the 6 failing files (chromium-1440) | 54 passed, 1 failed, 1 skipped | The failure was V-11 (Leave kept the draft), fixed before the re-run of that file: 9 / 9. |
| #2 (`b0-full2`) | 199 passed, 6 failed, 1 skipped, 11 did not run | **Real bugs:** V-12 (uploaded video unsaveable on the loopback CDN), V-13 (false conflict on a new device's derived checklist). **Run artefacts:** a hot module reload mid-test (I edited `SyncEngine.ts` while the dev server was serving the run) left the chromium-1024 Arabic layout test on the splash; the layout specs left clientA in Arabic on the server (spec hygiene, fixed in `_d-layout.ts`), so the touch long-press assertions looked for the English dialog name (the sheet itself opened). The 11 "did not run" are serial follow-ons of the touch spec. |
| **#3 (`b0-full3`) — final, no edits during the run** | **208 passed**, 1 failed, 1 skipped (pre-existing), 7 did not run | The failure was a test-setup problem in `61-b0-trust` 390-ar: it set only the device language, but a signed-in client gets the account's language (intended B0 precedence). Fixed by setting and restoring the account's language. The 7 "did not run" are the serial tests after it in the same file. **Re-run of the whole `61-b0-trust` file: 13 / 13.** The chromium-1024 Arabic layout test that hung in run #2 passed: it was the hot-reload artefact, not an app bug. `60-b0-coach-composer` (EN + AR, 390–1280) and `33-composer-banner` passed in this run. |

---

## B0.14 — Real-device checklist

`docs/product-audit/B0_REAL_DEVICE_CHECKLIST.md`: 26 checks (R-01 … R-26) for an installed PWA on iPhone and Android. **Every row is PENDING REAL DEVICE.** No real-device verification is claimed.

---

> **Final checkpoint (2026-10-06):**
> - `tsc -b --noEmit` clean.
> - `vitest run` 53 files / 413 tests.
> - `npm run lint:boundaries` ✓.
> - `npm run build` ✓: precache 152 entries / 1,953.58 KiB; entry chunk 479,105 B (154,835 B gzip).
> - e2e3 final full run 208 passed / 1 failed (test setup, fixed) / 1 skipped / 7 serial follow-ons; `61-b0-trust` re-run 13 / 13.
> - Prod-sim on the final build 13 / 13.
> - Real-device checklist: all PENDING REAL DEVICE.
> - Nothing committed.
