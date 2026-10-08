# B1 — Implementation log (live)

> Phase B1: Product foundation & P1 hardening. Spec: the Phase A docs, `B1_P1_TRIAGE.md` and the B1 brief. B0 is protected regression territory.
>
> **Baseline:** 2026-10-08, B0 committed as `f1151c0` on `development`. Checks at that point: `tsc -b --noEmit` clean, `vitest run` 53 files / 413 tests.
>
> **Entry format:** ID · STATUS · ROOT CAUSE · FILES CHANGED · FIX · TEST · BROWSER VERIFICATION · DEVIATION.
>
> **Recon:** three read-only code maps (outbox send paths; Arabic/formatting surface; shell, navigation and notifications) were made before any change. Their findings are cited per entry.

---

## B1.1 — P1 triage

- **STATUS:** DONE
- **OUTPUT:** `docs/product-audit/B1_P1_TRIAGE.md`. All 92 P1s are classified:

  | Target | P1s |
  |---|---:|
  | B1 foundation | 25 |
  | B2 client | 13 |
  | B3 coach | 16 |
  | B4 content/media | 15 |
  | B5 perf/realtime | 2 |
  | Owner decision | 1 |
  | Already fixed by B0 | 20 |

- **FIX:** Each row has a reason, its dependencies and how it interacts with B0. Only the foundation rows are implemented in B1.

---

## B1.6 — Durable outbox (PWA-12, CL-34, MS-02 B1 part)

### PWA-12 — Messages, voice notes, photos and check-ins were lost on navigation or reload
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - **Messages.** `MessageThread` kept pending sends only in React state (`PendingMessage[]`). Leaving the thread or reloading lost them. A retry re-uploaded the attachment because its URL was never cached. A send whose response was lost showed both the server message and a "failed" bubble.
  - **Check-in photos.** They uploaded on pick, so a photo picked offline was lost.
  - **Check-in submit.** Not idempotent: a retry after a lost response got FORBIDDEN. `notify()` could also throw after the write had committed.
  - **Progress photos.** A failed upload retried only at the next app launch.
- **FILES CHANGED:**
  - New: `src/data/outbox/{outbox,handlers}.ts`, `src/lib/errorKind.ts`.
  - Wiring: `src/data/localScope.ts` (`outbox` store, skipped by the legacy migration), `src/data/accountRuntime.ts` (start/stop for every role), `src/stores/updateStore.ts` (an outbox send is critical work).
  - Screens: `src/components/MessageThread.tsx`, `src/pages/CheckIn.tsx`, `src/components/PosePhotoPicker.tsx`, `src/stores/photoStore.ts`, `src/services/platform/checkInApi.ts`.
  - Server: `api/_trpc/routers/clientCheckIns.ts` (`opId`, compare-and-set), `api/client/_lib/{notify,types}.ts`.
  - i18n `trust.outbox.*`, `trust.checkin.queued*`.
- **FIX:**
  - **Storage.** One per-account, IndexedDB-backed outbox.
  - **Record shape.** Each operation has `operationId`, `userId`, `type`, `scope`, `dedupeKey`, `payload`, `blobKeys`, cached `media`, `dependencyIds`, `status`, `attemptCount`, `lastAttemptAt`, `nextAttemptAt`, `lastError` and `serverAcknowledgedAt`.
  - **Status.** `queued → sending → acknowledged | failed_retryable | waiting_for_network | failed_permanent`. The status is never shown verbatim.
  - **Ordering.** FIFO per scope (thread, check-in); a caption waits for its attachment.
  - **Retries.** Exponential backoff with jitter, triggered by reconnect, by returning to the foreground and by a timer.
  - **Ownership.** An operation is never processed for another account. It stops (in-flight upload interrupted and requeued) before the database closes on account switch.
  - **Errors.** Classified once (`errorKind.ts`): network, timeout, unauthorized, rate-limited, server, permanent, unavailable, cancelled.
  - **Operation types.**
    - `message.send`: text and/or one attachment or voice note. The bytes are kept on the device and the upload result is cached; `clientMsgId` = the operation id.
    - `checkin.submit`: photos kept locally upload as part of it; `opId` makes it idempotent.
    - `progressPhoto.upload`: replaces the next-launch-only retry.
  - **Messages UI.** Pending bubbles come from the outbox:
    - sending / uploading N%;
    - waiting for a connection;
    - not sent yet, with Retry now;
    - couldn't send, with Retry and Delete;
    - Cancel puts the attachment and its caption back in the composer.

    A server message carrying the operation id replaces its bubble even when the send's own response was lost.
  - **Check-in UI.**
    - A network or server failure shows "Saved on this device", with Retry now and Edit answers.
    - A permanent refusal returns to the wizard with every answer (B0 behaviour).
    - The draft is cleared only on acknowledgement.
  - **Server.**
    - `checkIns.submit` is an atomic compare-and-set on `status:'requested'`; a replay with the same `opId` returns the stored check-in.
    - `notify()` is best-effort (a failed notification no longer fails a committed write).
  - **Not queued (online-required, by design):** subscription and commercial actions, capacity, transfers, account and security fields, coach notes (privacy; not idempotent), plan saves (guarded and versioned, with drafts already persisted), broadcasts.
- **TEST:**
  - `src/data/outbox/outbox.test.tsx` (13): survives reload and kill; mid-send replay with the same id; per-user isolation (A→B→A); refuses with no account; complete only on ack; retry and backoff; permanent failure waits for the user; reconnect; network drop is retryable; dedupe key; scope ordering and dependency; cached upload reused; discard in flight.
  - `api/_trpc/routers/outboxIdempotency.test.ts` (6): replay returns the stored submission; a different submission is still FORBIDDEN; racing submits produce one; another account can't replay; a failing notify doesn't fail the submit; three message sends with one id produce one message.
  - `src/pages/CheckIn.test.tsx` (+1, 1 updated): offline submit is "saved on this device", then delivered with the same op id. The "failed submit keeps answers" case now uses a true server refusal; a 500 is retryable and correctly queued.
  - `src/stores/photoUploadHonesty.test.tsx` (rewritten onto the outbox, +1): uploaded only on ack; failed → queued; not configured → retry later; offline → delivered on reconnect.
- **DEVIATION:**
  - Broadcast messages stay online-required with no per-recipient idempotency key (coach UI, B3).
  - Assessment save/submit stay online-required (onboarding, B2).

---

## B1.7 — Sync truth and contract validation (PWA-11, PWA-13, AR-01 part)

### PWA-13 — The sync contract was unvalidated; one bad record blocked the whole pass
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - `sync.push`/`pull` accepted any collection name and any shape.
  - One bad record failed the whole request.
  - The client imported whatever came back, including records without `data.id` (stored under an `undefined` key — seen in B0 e2e).
- **FILES CHANGED:** `api/sync/_contract.ts` (new), `api/sync/_data.ts` (`sv`), `api/_trpc/routers/sync.ts`, `src/data/sync/contract.ts` (new), `src/data/sync/SyncEngine.ts`.
- **FIX:**
  - **Server.**
    - Collection allow-list (an unknown one is BAD_REQUEST).
    - Per-record validation: id format; `data.id` = id; a finite `updatedAt`; a valid day key / `date`; a 256 KB size cap; schema version ≤ 1. Each failure is reported in `rejected[]` with a reason while the rest of the batch applies.
    - At most 500 records per push.
    - `sv` is stored and returned (pre-B1 records = 1).
    - Device clock skew is deliberately not a rejection: B0 revisions decide winners, so a skewed clock is a conflict, not a stranded record.
  - **Client.**
    - Pulled records are validated more strictly; malformed or newer-schema records are skipped and counted, never imported.
    - Pushes go in batches of 200 with `sv`.
    - Server refusals are remembered per record (`meta/syncRejected`) and cleared when later accepted.
- **TEST:**
  - `api/_trpc/routers/syncContract.test.ts` (7): unknown collection; mixed batch (6 reasons) applies only the valid record; wrong clock not rejected; batch cap; schema version stored and returned; ownership isolation; no tombstone for an unknown collection.
  - `src/data/sync/contract.test.tsx` (12): validator matrix; the engine skips malformed and newer-schema records; a refused record stays dirty and is remembered until accepted.
  - Updated fixtures: `certification.test.ts` (auth-matrix placeholder collection `x` → `weightLogs`).
- **DEVIATION:** Entity-level Sync v2 (automatic per-item merge, PWA-06) remains a later project. B1 keeps B0's revision and conflict model unchanged.

### PWA-11 — The sync status misled
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - `cloudStatus()` returned "synced" whenever the last pass finished. It ignored dirty records, deletions, conflicts, queued messages and being offline.
  - The Settings card said "Synced" whenever there was no error.
  - The coach top-bar indicator read the client engine, so it never rendered.
  - The offline banner promised sync to coaches whose actions don't queue.
- **FILES CHANGED:** `src/data/sync/syncTruth.ts`, `src/hooks/useSyncState.ts`, `src/data/localChanges.ts` and `src/components/ui/SyncStatus.tsx` (new); `src/data/adapters/local/LocalRepository.ts` (change signal), `src/services/auth/cloudStore.ts`, `src/data/accountRuntime.ts`, `src/data/sync/pending.ts` (sign-out count includes queued sends), `src/pages/{Home,Settings}.tsx`, `src/components/shell/DesktopTopBar.tsx`, `src/components/shared/OfflineBanner.tsx`. **Deleted:** `src/components/SyncStatusBadge.tsx`, `src/components/shared/SyncStatusIndicator.tsx`.
- **FIX:**
  - One pure derivation, `deriveSyncTruth()`: conflict > failed > syncing > waiting / saved-on-device > synced.
  - "Synced" only when nothing is unacknowledged (records, deletions, outbox) and the session has confirmed a pass. Never from `navigator.onLine` or a local write.
  - Coaches are judged on their outbox only.
  - A live pending count comes from a repository change signal.
  - One `SyncStatus`: inline is silent when healthy, a quiet chip otherwise, and "Sync failed" retries. The Settings detail view shows the state, pending count (real plurals) and last sync.
  - A role-aware offline banner.
- **TEST:** `src/data/sync/syncTruth.test.tsx` (13): never "synced" with pending edits, queued sends or nothing confirmed; conflict outranks; a failed pass offline is "saved on device"; the coach outbox-only rule; outbox counts; the component is silent when healthy; waiting ≠ synced; retry calls a forced sync; plural detail.

---

## B1.8 — Arabic / RTL foundation (RTL-01, RTL-03, RTL-04, EX-06, FD-01)

### RTL-03 — Mixed numeral systems; device-locale dates
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - No `Intl` anywhere. `ar-EG` dates rendered Arabic-Indic digits next to Latin weights and reps.
  - 18 date calls passed no locale, so they used the browser's locale.
  - 14 displays used the UTC day (`toISOString().slice(0,10)`), off by one away from Greenwich.
  - Locale logic was copied in four places.
- **FILES CHANGED:**
  - `src/lib/format.ts` (new formatting service).
  - Delegation: `src/lib/utils.ts` (`shortDate`, `weekdayInitials`, `formatDuration`; `dateLocale` deprecated), `src/lib/formaFormat.ts`.
  - About 35 call sites migrated (charts, CoachTimeline, CoachMessages, CoachDayNav, ClientActivityView, MessageThread, WeekStrip, History, Home, Notifications, Settings, MyAssessment, CoachClients, CoachClientDetail, CoachClientNotes, PlanVersionHistory, CoachInbox, admin audit/overview/coaches/members/governance, analytics/overview panels, RoleAccount, SubscriptionHistory, ClientSubscriptionSection, CapacityPackagesTab, PresenceTracker, Cardio, Nutrition, CoachViewCardio).
  - 26 Arabic i18n strings and `TrainingGuideSheet` converted to Latin digits.
- **FIX:**
  - One service for dates (named styles), time, date-time, relative time, numbers, percent, currency, units (bidi-isolated), bytes, durations, CLDR plural categories and weekday initials.
  - Digit policy: Latin digits in every language (`-u-nu-latn`). Arabic-Indic digits are accepted on input, never produced.
  - Day keys are local days (`dayKeyOf`, `toDate`).
  - No raw `toLocale*()` call remains in the app (website and marketing excluded).
- **TEST:** `src/lib/format.test.ts` (8): no Arabic-Indic digits from any formatter in `ar`/`ar-eg`; English day-first; local day keys around midnight; relative time; Arabic plural categories (zero / one / two / few / many / other); units, bytes and currency; timers; weekday initials. B0 `arabicNumbers.test.tsx` still passes.

### RTL-04 — One NumericField
- **STATUS:** FIXED for the brief's four areas plus progress weight; coach/admin parsing fixed. Remaining coach-editor inputs migrate with their screens in B3.
- **ROOT CAUSE:**
  - Three number-entry components (`NumberStepper`, the workout `NumericCell`, the measurement inputs) and many raw inputs.
  - `parseDecimal` didn't strip bidi marks or the Arabic thousands separator.
  - The coach/admin price, duration and grams fields used `Number()`, so an Arabic "١٠٠" became 0.
- **FILES CHANGED:** `src/components/ui/NumericField.tsx` (new); `src/lib/utils.ts` (`normalizeNumericText` handles isolates and "٬"; `parseDecimal` uses it; new `parseNumber`); `src/components/{ExerciseCard,MeasurementForm}.tsx`, `src/pages/{CheckIn,Nutrition,Progress}.tsx`; `parseNumber` in FoodSearchPicker, SubscriptionPlanPicker, CoachSubscriptionPanel, CoachSubscriptionPlans, AdminCoachDetail, FormaPlanTab and CapacityPackagesTab. **Deleted:** `src/components/NumberStepper.tsx`.
- **FIX:**
  - A text field with a numeric keypad, Latin digits shown left-to-right.
  - Local text while focused (partial "80." and "٨٠٫٥" can be typed).
  - Two modes for unreadable text: `reject` (keystroke ignored) and `flag` (kept, marked invalid, reported).
  - Integer mode, a stepper with ArrowUp/ArrowDown, clamping, a unit suffix, sizes of 44 and 56 px, a label or aria-label, and an error message.
- **TEST:** `src/components/ui/NumericField.test.tsx` (7). B0 `arabicNumbers.test.tsx` was retargeted from `NumberStepper` to `NumericField` with identical assertions.

### EX-06 / FD-01 — Editing destroyed the other language
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - The exercise form loaded `notes.en` and saved `{ en: x, ar: x }`. Because `notes` is a library-synced field, this ALSO silently detached the exercise from the library, and the edit propagated to every linked template.
  - The coach nutrition editor and the food/supplement library did the same for food names, supplement dose and timing.
  - The client's own food edit did the reverse (overwrote English with Arabic).
  - Normalised copies (trimmed names, an absent video link saved as `null`) also tripped the library-detach check.
- **FILES CHANGED:** `src/lib/localizedText.ts` and `src/components/ui/SecondLanguageField.tsx` (new); `src/components/workout/ExerciseForm.tsx`, `src/pages/coach/{CoachNutritionEditor,CoachExerciseLibrary}.tsx`, `src/pages/Nutrition.tsx`; display: `src/components/workout/ExerciseView.tsx`, `src/pages/RoutineDetail.tsx` (now `loc(notes)`, not `notes.en`); i18n `i18nField.*`.
- **FIX:**
  - `applyLocalizedEdit()`: the edited language changes. The other follows only if it was a copy or empty; a real translation is kept.
  - Forms with real Arabic content get a light "Arabic version" field. It opens when the English changed while a distinct translation exists ("check that this translation still matches").
  - The exercise form keeps every untouched field's original value exactly, so programming-only edits never detach from the library.
- **TEST:** `src/lib/localizedText.test.tsx` (8): coach keeps the Arabic; client keeps the English; copies follow; stale detection; ExerciseForm programming-only edit touches no synced field and keeps the `notes` object; an English edit keeps the Arabic and shows it; an explicit Arabic edit saves.

### RTL-01 — Arabic labels broke apart
- **STATUS:** FIXED (foundation)
- **ROOT CAUSE:**
  - 206 `font-mono`, 66 `tracking-[…]` and 97 `uppercase` utilities; component classes (`.label`, `.chip`, `.sec-link`, `.h1`/`.h2`, `.stat-*`) baked in mono, caps and tracking.
  - The RTL override covered only 6 classes.
  - The app's Arabic face (Cairo) differed from the website's (IBM Plex Sans Arabic).
- **FILES CHANGED:** `src/styles/tokens.css` (type roles with an Arabic path; global `:lang(ar)` rules for `.font-mono` / `.uppercase` / `[class*=tracking-]`), `src/index.css` (override list extended), `tailwind.config.ts` (`fontFamily.arabic` = IBM Plex Sans Arabic, Cairo fallback).
- **FIX:**
  - Arabic is never letter-spaced or upper-cased, whichever utility or component class a legacy screen uses.
  - Mono keeps Latin digits, and Arabic glyphs fall back to the Arabic face per glyph.
  - One Arabic face, shared with the website.

### RTL-08 part — Direction-aware icons
- **STATUS:** FIXED (foundation)
- **ROOT CAUSE:** Mirroring was hand-made: 23 `rtl:rotate-180`, 2 `rotate-180 rtl:rotate-0`, and 7 JS `i18n.dir()` flips. 29 chevrons never mirrored, and one open-state down-chevron was turned upside down in Arabic.
- **FILES CHANGED:** `src/components/Icon.tsx` (`MIRROR_IN_RTL`: `chevron`, `chevronLeft`; `mirror` override) and 19 call-site files (manual flips removed, "back" chevrons use `chevronLeft`).
- **FIX:** Directional glyphs mirror themselves in RTL. Media and vertical glyphs never do.

---

## B1.2 — Design tokens (VS-04, VS-19 foundation)

### VS-04 / VS-19 — No type scale; no coherent identity
- **STATUS:** FIXED (foundation). Screens adopt the tokens when they migrate in B2/B3.
- **ROOT CAUSE:**
  - Meaningful text at 8–11 px with no type scale.
  - Raw rgba values and per-screen colour maps.
  - Six ad-hoc z-index values.
  - No motion or elevation rules, and an identity that diverged from the approved website.
- **FILES CHANGED:** `src/styles/tokens.css` (new; imported first by `src/index.css`), `tailwind.config.ts` (`ui-*` namespace).
- **FIX:** One CSS-variable source, read the same way by Tailwind (`ui-*`), components and inline styles.
  - **Colour:** surfaces, text, borders, accent, status and the sync states (syncing / offline / conflict). Values are stored as RGB channels so `/alpha` works.
  - **Shape and elevation:** four radii (control, surface, surface-lg, pill) and four elevations (menu, sheet, dialog, sticky).
  - **Layers:** the z ladder sticky 20 · header 30 · nav 40 · banner 45 · task/overlay 50 · toast 55 · dialog 60 · media 70 · palette 80.
  - **Spacing:** gutter, section, stack and inset, plus hit sizes of 44 px (and 56 px in-workout).
  - **Motion:** durations and easings, with a global `prefers-reduced-motion` kill switch.
  - **Type:** roles `.t-display` … `.t-caption` / `.t-tag` / `.t-numeric` with a 12 px floor, plus an Arabic path (`:lang(ar)`).
- **TEST:** Covered visually by the foundation showcase (B1.16) at 5 widths × EN/AR.

---

## B1.13 — Performance and update foundation (PF-01, PF-02, PWA-10/JR-04, AR-02 residual)

### PF-01 — Boot waited for `auth.me` after a refresh that already returned the user
- **STATUS:** FIXED
- **ROOT CAUSE:** `refreshOnce()` threw away the `user` in the refresh response. `sessionStore.refreshAccount()` then made a second, serial `auth.me` call before the app could render.
- **FILES CHANGED:** `src/services/platformApi.ts` (keeps `refreshedUser` + `refreshedAt`; `takeRefreshedUser(maxAgeMs = 5000)`), `src/services/auth/sessionStore.ts`.
- **FIX:** A refresh that succeeded in the last 5 s supplies the user directly; there is no second round-trip. B0 session rules are unchanged: only a refresh-confirmed 401 ends a session.
- **TEST:** `sessionStore.test.tsx` +2 (fresh user used without `auth.me`; a stale one is ignored).

### PF-02 — No timeouts on the server request path
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - The Mongo driver defaults are a 30 s server selection and no socket timeout.
  - A failed `connect()` promise was cached forever, so one bad cold start poisoned the warm function.
- **FILES CHANGED:** `api/_lib/mongodb.ts`.
- **FIX:**
  - **Timeouts:** `mongoTimeouts()` gives 8 s selection, 8 s connect and 25 s socket, each overridable by env.
  - **Connection retry:** `connectClient()` drops a failed connection promise, so the next request retries.
  - Used by `getDb()` and `withDbTransaction()`.
- **TEST:** `api/_lib/mongodb.test.ts` (timeouts + env overrides).

### PWA-10 / JR-04 — Another tab's update left this tab on old code
- **STATUS:** FIXED
- **ROOT CAUSE:** B0 deferred an update to this tab's safe point, with two gaps:
  1. When tab A activated the new worker, tab B kept running old JavaScript under it and failed on its next lazy chunk.
  2. If tab B had already seen the waiting worker, workbox-window reloaded B immediately on `controlling`, even mid-workout. Tab A's safe-point check only looked at tab A.
- **FILES CHANGED:** `src/main.tsx`, `src/stores/updateStore.ts`, `src/components/UpdateAvailable.tsx`, i18n `trust.update.busyOtherTab`.
- **FIX:**
  - **Following another tab's update.** A `controllerchange` this tab didn't cause, on a page that was already controlled, makes the update "ready" here: same pill, same safe point. The first install claiming an uncontrolled page is ignored.
  - **Cross-tab critical-work beacon.** While a tab has a live workout, timer, check-in, dirty editor or upload in flight, it refreshes a `forma-busy-tab:<id>` heartbeat in localStorage (TTL 15 s; cleared on `pagehide`).
    - **Auto-install** defers while another tab is busy, and retries when that tab's beacon clears.
    - **Tapping the pill** while another tab is busy asks first, with the other-tab explanation.
- **TEST:** `UpdateAvailable.test.tsx` +3 (other-tab beacon defers; a stale heartbeat doesn't; own beacon published/cleared and never counted as another tab; tap asks with the other-tab text). Prod-build `e2e3/pwa/pwa-check.mjs`: update detected, deferred while visible, applied once hidden — same as the B0 baseline.

### AR-02 (residual) — Client-only code in the entry chunk for every role
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - `App.tsx` (day-change reload), `accountRuntime.ts` and `updateStore.ts` (`criticalWork`) statically imported the client stores.
  - `lib/native.ts` statically imported `@capacitor/core`.
  - The coach/admin `ResponsiveShell` mounted the client `ReminderBanner`.
  - So visitors, coaches and admins downloaded the tracker stores, reminders, sync, outbox, media/message APIs and Capacitor.
- **FILES CHANGED:**
  - New: `src/data/clientRuntime.ts`, `src/data/outbox/runtime.ts`, `src/lib/criticalWork.ts`, `src/lib/staleChunk.ts`.
  - Changed:
    - `src/data/accountRuntime.ts` (dynamic imports);
    - `src/stores/updateStore.ts` (registry);
    - `src/stores/{workoutStore,cardioStore,timerStore}.ts` and `src/data/outbox/outbox.ts` (register their critical work);
    - `src/App.tsx` (day reload moved into `src/apps/ClientApp.tsx`);
    - `src/lib/native.ts` (reads the shell-injected `window.Capacitor`);
    - `src/components/ErrorBoundary.tsx` (shared stale-chunk reload);
    - `src/components/shell/ResponsiveShell.tsx` (no ReminderBanner).
- **FIX:**
  - **Client runtime:** loaded on demand only for a client.
  - **Outbox:** loaded on demand for signed-in accounts.
  - **Critical-work probes:** registered by the module that owns the work.
  - **Stale chunk:** a failed chunk load reloads once, with the same guard as the error boundary.
- **Result:** the entry went from 491 KB raw / 158.6 KB gzipped to 438 KB / 141.7 KB, with the new kit included. The new chunks are in the SW precache.
- **TEST:** `accountRuntime.test.tsx` (PWA-14 isolation through the dynamic import), `UpdateAvailable.test.tsx` (registry).
- **BROWSER:** `e2e3/pwa/b1-client-offline-boot.mjs` on a local production build. Signed-in client, network off, relaunch:
  - client home renders and there is no login screen;
  - `clientRuntime-*.js` and `runtime-*.js` are served by the SW, with zero network fetches;
  - a lazy screen opens offline.
  - Result: **PASS**.

### Duplicate fetch paths and query policy
- **STATUS:** FIXED (duplicates); policy documented (spec §21)
- **ROOT CAUSE:**
  - The client's unread badge re-fetched 200 messages every 20 s while the open thread already polled every 5 s.
  - Opening a thread called `messages.markRead` twice (`markThreadSeen` + `markMessageNotificationsSeen`).
  - `CoachRevenue` redefined `['coachDashboard']` with its own staleTime, so freshness depended on which screen mounted first.
- **FILES CHANGED:** `src/services/platform/messagesApi.ts` (`subscribeOpenThread`, `skipTick`, resync), `src/components/MessageThread.tsx`, `src/pages/coach/CoachRevenue.tsx`.
- **FIX:**
  - **Badge:** while a thread is open, its badge takes the thread's data. When the thread closes, the badge poll refetches the whole window, so read receipts are not stale.
  - **Read marking:** one `markRead` call (the server also clears the thread's notifications).
  - **Coach dashboard:** one shared `coachDashboardQuery`.
- **Already shared (B0):** two bells and the closed nav sheet use one poller per key (`shareSubscription`), so they cost nothing on the network.
- **Not changed (deliberately):** the client's refresh on resume. e2e spec 43 requires a coach's edit to show on the client's next refocus, and the in-flight guard already merges `visibilitychange` + `focus`.
- **TEST:** `messagesApi.test.ts` (open thread feeds the badge; no duplicate fetch; full refresh after the thread closes).

---

## B1.12 — Cache ownership (AR-01 B1 part)

### Server reads belong to one account
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - The query cache was cleared on sign-out only. If another tab signed out and signed in as someone else, this tab's next refresh accepted the new user with the previous user's cache.
  - `['coachPlanRequests','mine']`, `['coachCommercial','mine']` and `['existingClientSearch', term]` had no owner in the key.
- **FILES CHANGED:** `src/services/auth/sessionStore.ts` (cache owner), `src/components/coach/CoachPlanBanner.tsx`, `src/pages/coach/{CoachPlan,AddExistingClient}.tsx`.
- **FIX:**
  - **Clear on account change:** any change of signed-in uid clears the query cache before the next account's screens mount.
  - **Owner in the key:** the uid-less per-user keys now include their owner, as defence in depth.
  - **Rules written down** in spec §20: owner in key; one query definition per key; mirrored vs cached vs online-only per entity.
- **TEST:** `sessionStore.test.tsx` +2 (another tab switched the account → cache dropped; same-account refresh keeps it).

---

## B1.9 — Notification foundation (NAV-K03)

### NAV-K03 — The pause-request notification opened a screen without the request
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - **Routing:** the server stored `route: /coach/client/:id` (Overview); the request card lives on Subscription.
  - **Followed blindly:** both tap paths (`Notifications.tsx`, the toast in `NotificationBell.tsx`) followed `n.route` without validating it.
  - **Type lists drifted:** the two server type unions disagreed (one lacked `plan_decided`, `coach_assigned` and `client_released`).
  - **Double count:** the bell counted chat messages that the Messages badge also counted.
- **FILES CHANGED:**
  - New: `src/lib/notificationTaxonomy.ts`, `src/lib/notificationTarget.ts`, `api/_lib/notificationTypes.ts`.
  - Changed: `api/messages/_handlers/notifications-data.ts`, `api/client/_lib/types.ts` (derive from the one list), `api/_trpc/routers/clientCheckIns.ts` (route → `/subscription`), `src/pages/Notifications.tsx`, `src/components/NotificationBell.tsx`, `src/hooks/useNotifications.ts`.
- **FIX:**
  - **Taxonomy.** One entry per type: audience; category (task / message / update / account); whether the server produces it; how it groups.
  - **One target resolver.** Task types land where the action is, whatever older rows stored: a pause request opens Subscription, a check-in opens Check-ins, an assessment opens Assessment, a message opens the thread. Stored routes are accepted only if they are the viewer's own in-app screens.
  - **Bell count.** Unseen feed rows after grouping, with chat messages excluded (counted once, by the Messages badge).
- **TEST:** `notificationTaxonomy.test.tsx` (8):
  - client taxonomy equals the server list;
  - task and reserved types;
  - thread grouping;
  - bell count;
  - NAV-K03 including an old row;
  - coach and client targets;
  - unsafe / foreign routes rejected.

---

## B1.10 — Navigation contract (NAV-K01)

### NAV-K01 — Messages / Progress from the client workspace; Back skipped the workspace
- **STATUS:** FIXED
- **ROOT CAUSE:** All 11 workspace tabs navigated with `replace`, including the two that leave the workspace shell (`/coach/messages/:id` and `/coach/client/:id/view/progress`). Back then went past the workspace. A cold deep link's Back had a different hand-picked fallback on every screen.
- **FILES CHANGED:** `src/lib/navContract.ts` (new), `src/hooks/useBack.ts`, `src/components/coach/CoachClientWorkspaceLayout.tsx`.
- **FIX:**
  - **Workspace tabs:** in-shell tabs replace; Progress and Messages push (`workspaceTabNav`).
  - **No in-app history:** `useBack` goes to a validated `?returnTo=`, then the caller's fallback, then the screen's **semantic parent** (a table per role).
  - **Path ownership:** `isRolePath` / `safeRolePath` reject absolute URLs, `//host`, backslashes, control characters, `..` and other roles' screens. The notification resolver uses the same check.
  - **B0 guard:** the unsaved-changes guard still runs first on every Back.
- **TEST:** `navContract.test.tsx` (6):
  - semantic parents for coach, client and admin;
  - role paths and rejection cases;
  - `returnTo` valid vs invalid vs self;
  - workspace push/replace;
  - `useBack` cold deep link → parent;
  - in-app navigation → previous screen.

---

## B1.11 — Media reference seam

- **STATUS:** DONE (foundation). Provider credentials (MD-01) remain the owner's.
- **ROOT CAUSE:**
  - Every screen treated a raw URL string its own way.
  - Two full-screen overlays (ImageViewer, VideoPopup) duplicated the chrome: Esc, scroll lock and close.
  - Images had no loading / failed / offline state.
  - Uploads didn't return the storage path, so stored references were tied to a CDN URL.
- **FILES CHANGED:**
  - New: `src/lib/mediaRef.ts`, `src/stores/mediaViewerStore.ts`, `src/components/media/MediaViewer.tsx`.
  - Changed:
    - `api/media/[action].ts` (responses include `path`);
    - `src/services/platform/mediaApi.ts`;
    - `src/data/outbox/handlers.ts` (local-ref prefix from the seam);
    - 7 caller files;
    - `src/App.tsx`.
  - **Deleted:** `src/components/{ImageViewer,VideoPopup}.tsx`, `src/stores/{imageViewerStore,videoPopupStore}.ts`.
- **FIX:**
  - **`MediaRef` and its resolver.** A `MediaRef` is `{ ref, kind, name?, mimeType?, path? }`, where `ref` is a URL or `local:<key>`. `resolveMedia()` returns `ready`, `not_uploaded` or `unsupported`, and only accepts https, loopback http and `blob:` URLs.
  - **One viewer.** States: loading, ready, failed with Retry, offline, "saved on this device, not uploaded yet" (local preview), "can't preview" with Open.
  - **Video:** remote video still goes through the B0-certified honest player.
  - **RTL:** keys and swipes follow reading direction, and the counter stays LTR.
  - **API unchanged:** `viewImages` and `playVideo` keep their signatures.
- **TEST:** `MediaViewer.test.tsx` (5). e2e specs using `video-popup` / `video-popup-close` are unchanged.

---

## B1.3 — Shared components (VS-20 foundation)

- **STATUS:** DONE (kit). Screens migrate in B2/B3 (see spec §8 and §24).
- **Evolved, not duplicated:**
  - `ui/Button.tsx` (new) — `Button`, `IconButton` (label REQUIRED), `LinkButton`, `CountBadge`. `SubmitButton` is now a thin `type="submit"` wrapper over `Button`; all 21 call sites unchanged.
  - `ui/Pill.tsx` — `StatusChip`: the same tones on the 12 px type floor, announced as status.
  - `ui/Tabs.tsx` — `SegmentedControl` (radio semantics) next to `Tabs`.
  - `ui/Banner.tsx` — `Banner` + `BannerRegion` (B1.4).
  - `ui/ScreenState.tsx` — states (B1.5).
  - `ConflictState`, extracted from `SyncConflictNotice`.
  - `media/MediaViewer` (B1.11).
  - `ui/Field.tsx` — `TextInput` keeps email / phone / url / password fields left-to-right in Arabic.
- **`hit-44` utility** (`src/index.css`): a guaranteed 44×44 hit area centred on a smaller visual, used by every primitive. The old `-4px` rule topped a 32 px control up to only 40 px.
- **TEST:** `Banner.test.tsx` (3), `ScreenState.test.tsx` (3), showcase browser checks.

---

## B1.4 — Shell contract and banner region (VS-11)

### VS-11 — Up to seven notices stacked above content
- **STATUS:** FIXED (shell-level notices). Page-local cards (trial checklist, check-in card) stay with their screens (B2/B3).
- **ROOT CAUSE:**
  - Each notice mounted itself with its own style: 5 treatments, two of them at the app root on every route.
  - Nothing decided which notice mattered most.
  - `BannerHost` showed "client_home" / "coach_dashboard" announcements on every route.
- **FILES CHANGED:**
  - New: `src/stores/bannerRegionStore.ts`, `src/components/ui/Banner.tsx`.
  - Migrated: `src/components/{SubscriptionBanner,ReminderBanner,SyncConflictNotice,BannerHost}.tsx`, `src/components/coach/CoachPlanBanner.tsx`.
  - Shells: `src/components/AppShell.tsx`, `src/components/shell/ResponsiveShell.tsx` (`banners` prop), `src/apps/CoachApp.tsx`, `src/App.tsx` (BannerHost no longer at root).
  - i18n: `banners.*` (Arabic plural forms).
- **FIX:**
  - **One region.** Each shell has one region. Notices register a priority:
    1. sync conflict 100
    2. plan lapsed / subscription read-only 90
    3. over capacity 70
    4. plan ending 60
    5. reminder 50
    6. open plan request 40
    7. announcement 10
  - **Collapsed by default.** Only the top notice shows; "N more notices" (`aria-expanded`) reveals the rest, so nothing is unreachable.
  - **Announcements** show only on the home screen they are named for.
  - **Overlays stay out.** The offline strip and the update pill remain global overlays, as B0 certified.
  - **Testids kept:** `subscription-banner`, `sync-conflict*`, `coach-plan-banner*`, `app-banner`.

### Safe areas, bottom clearance, keyboard
- **STATUS:** FIXED
- **ROOT CAUSE:**
  - `body` padded the top inset and the sticky BrandBar padded it again, doubling the notch gap.
  - The floating rest-timer card ignored the home-indicator inset, so it overlapped the bottom nav on iPhones.
  - Inset maths was repeated per component, and there was no keyboard signal.
- **FILES CHANGED:**
  - `src/styles/tokens.css` (`--shell-safe-top`, `--shell-safe-bottom`, `--shell-bottom-clearance`, `--shell-keyboard`).
  - `src/components/{BrandBar,AppShell,BottomNav}.tsx`, `src/components/ui/BulkActionBar.tsx`.
  - `src/lib/viewportInsets.ts` (new), started in `src/main.tsx`.
- **FIX:**
  - **Top inset:** BrandBar pulls itself up by the top inset, so the notch is covered once.
  - **Pinned elements** sit at `--shell-bottom-clearance` (nav height + home-indicator inset).
  - **Keyboard:** one visualViewport listener sets `--shell-keyboard` and `<html data-keyboard="open">`.
- **DEVIATION (B0 wins):** main-content bottom padding is unchanged. The B0-certified Messages composer cancels exactly `bottomnav-h + 2.5rem` (`-mb-28`).

---

## B1.5 — Screen states

- **STATUS:** DONE (model + components)
- **FIX:** `screenStatus()` is the one rule:
  - data on screen is never replaced by an error or a spinner; it is only marked stale;
  - no data + offline = `offline` (never a false "empty");
  - then `error`, then `loading`, then `empty`.
- **Components:**
  - `ScreenState`: composes Loading / Offline / Error / Empty and a `StaleNotice`.
  - `OfflineState` (new `cloud` glyph).
  - `ConflictState`: one conflict's decision, usable inline.
- **TEST:** `ScreenState.test.tsx` (3).

---

## B1.14 — Accessibility foundation (AX-01, AX-02, AX-03)

### AX-02 — Icon-only header actions lost their names on phones
- **STATUS:** FIXED
- **ROOT CAUSE:** Labels hidden with `hidden sm:inline` (display: none) left the buttons nameless under 640 px: the workspace's Message and Edit plan, the dashboard "+", GlobalSearch, and Pagination prev/next.
- **FILES CHANGED:** `src/components/coach/CoachClientWorkspaceLayout.tsx`, `src/pages/coach/CoachDashboard.tsx`, `src/components/ui/{GlobalSearch,Pagination}.tsx`.
- **FIX:**
  - **Existing buttons:** `sr-only sm:not-sr-only`, so the name is always present with no visual change.
  - **New icon-only buttons:** `IconButton` makes the label mandatory at compile time.

### AX-03 — Form fields without a programmatic label
- **STATUS:** FIXED for the brief's B1 set; the rest migrate with their screens.
- **FIX:** The accessible name reuses each field's existing visible text, so nothing changes visually:
  - message composer and edit box;
  - all 10 search boxes (command palette, exercise picker, client/admin lists, coach libraries, templates, TagInput);
  - the 5 invite sign-up fields;
  - check-in notes (label associated).
- **Count:** unlabelled controls 69 → 50 by static scan (`scratchpad scan_labels.py`). The remaining 50 are visually labelled fields in the Settings / Cardio / subscription / editor screens (B2/B3).

### AX-01 — Controls under 44 px
- **STATUS:** FOUNDATION DONE (`hit-44`, primitives ≥44 px). Screens inherit it as they migrate (B2/B3).
- **BROWSER:** the showcase spec measures the IconButton and the region toggle at ≥44 px at every width.

---

## B1.15 — Cleanup

- **Removed (canonical replacement in place, references migrated, tests cover):**
  - `SyncStatusBadge.tsx`, `shared/SyncStatusIndicator.tsx` → `ui/SyncStatus`.
  - `NumberStepper.tsx` → `ui/NumericField`.
  - `ImageViewer.tsx`, `VideoPopup.tsx`, `imageViewerStore.ts`, `videoPopupStore.ts` → `media/MediaViewer` + `mediaViewerStore`.
  - The local `FeedRow` grouping in `Notifications.tsx` → `notificationTaxonomy.coalesceFeed`.
  - The duplicate `markRead` call.
  - `ReminderBanner` in the coach/admin shell.
- **Dead i18n keys removed (all 3 locales, 24 entries):** `cloudState.*`, `settings.synced/syncing/lastSync`, `sync.retry`, `notifications.justNow/minutesAgo*/hoursAgo*`. Locale key parity verified (en = ar = ar-eg).

---

## B1.16 — Foundation showcase

- **STATUS:** DONE
- **FILES CHANGED:** `src/pages/dev/FoundationShowcase.tsx` (new; DEV-only at `/__foundation`, dropped from production builds — verified absent from `dist`), `src/App.tsx`, `e2e3/specs/70-b1-foundation.spec.ts` (new).
- **Contents:**
  - type roles, colour / radius tokens, the formatting service;
  - buttons (variants, sizes, pending, offline), IconButton + CountBadge, LinkButton;
  - StatusChip, Tabs, SegmentedControl;
  - fields (TextInput, SearchField, NumericField, SecondLanguageField);
  - Banner + a three-notice region;
  - screen states (loading / offline / error / empty / stale);
  - SyncStatus;
  - media viewer (image, unsupported video, file);
  - the navigation contract.
- **BROWSER:** EN and AR at 390 / 430 / 768 / 1024 / 1440 — **2/2 PASS**:
  - no horizontal overflow;
  - `dir`/`lang` correct;
  - one banner visible, the rest reachable;
  - every visible control named;
  - ≥44 px hit areas;
  - Arabic digits "٧٣٫٥" accepted;
  - media states honest;
  - Esc closes.
- Screenshots were reviewed. They found the viewer counter reversing in RTL and the email field rendering RTL; both are fixed.

---

## Regression pass — full e2e3 suite

**Run 1 (`b1-full-1`, 219 tests, 46 min):** 209 passed, 1 skipped (Google sign-in, as in B0), 9 failed. Both B0 specs (`60-b0-coach-composer`, `61-b0-trust`) passed. Each failure was triaged:

| Spec | Cause | Class | Fix |
|---|---|---|---|
| `40-media` › SVG / >5 MB attachment → friendly error | After the outbox migration a permanent upload failure showed its reason only inside the bubble; B0 showed a dialog at once | **Product regression (B0 parity)** | `MessageThread.reportFirstUploadFailure`: when the FIRST attempt of an attachment fails while online, a permanent failure (type / size) shows the reason and returns the file to the composer; a transient one says so and stays queued (auto-retry + Retry now). Offline sends stay silent; a user cancel is silent |
| `40-media` › network failure → error shown → retry succeeds | Same: the transient failure became a quiet "Not sent yet" | **Product regression (B0 parity)** | As above. The retrying label is now "Couldn't send yet — trying again" (all 3 locales) |
| `30-client` › measurements save / clear | The spec located the input as the direct child (`> input`) of the label's `div`; `NumericField` wraps its input | Spec selector (DOM shape) | The spec now uses `getByLabel(label, { exact: true })` (the label is associated since B1.8). Every value and persistence assertion is unchanged |
| `44/45-layout` › Arabic chart oldest→newest (×6 widths) | The spec took the first number followed by a space from "`<date>: <value> kg`". Before B1, Arabic dates used Arabic-Indic digits, so ASCII `\d` skipped them; B1's Latin-digit policy (RTL-03) made the date the first match. The chart order itself was correct (24 Sep → 1 Oct → 7 Oct) | Spec parsing (mixed-numeral assumption) | The spec reads the value after the colon. Same assertion: 68 → 69 → 69 |

- **DEVIATION (documented):** two specs changed. Only their element lookup / text parsing moved; no assertion was removed or weakened.

**Run 2 (`b1-full-2`, after the fixes above, 219 tests, 58.7 min):** 196 passed, 1 skipped, 11 failed.
- **Timing.** Every failure started between 18:38:38 and 18:54:05. Windows' NetworkProfile log shows the machine's Wi-Fi (a phone hotspot) **disconnected at 18:39:35 and reconnected at 18:55:46**.
- **Mechanism.** While the OS had no network, Chromium reported `navigator.onLine = false` to every page, including localhost. The app then behaved as designed:
  - online-only actions disabled with "You're offline — reconnect to do this" (capacity, packages, add client);
  - messages queued in the outbox instead of sending;
  - the offline banner shown.
- **Verdict.** Every test that ran after the reconnection passed. Every spec that failed in this window passed in run 1, apart from the four issues fixed above. These are **environmental, not product failures**. The affected spec files were re-run with the network up (run 3, below).

**Run 3 (`b1-rerun-3`, network up):** re-ran every spec file hit by the outage, across all of their projects: `50-capacity`, `61-b0-trust`, `33-composer-banner.responsive`, `45-layout.responsive`, `60-b0-coach-composer.responsive`. Result: **78 / 78 passed (15.4 min)**.

**Final state of the suite on the final code.** All 219 tests pass, except the 1 skip (Google sign-in, unchanged since B0):
- run 2's 196 passes;
- run 3 covering the 11 that ran during the outage;
- targeted re-runs `b1-rerun-1` / `b1-rerun-2` for the four fixed issues: 31/32 + 45/45; the one remaining selector was then fixed and re-passed in run 2.
