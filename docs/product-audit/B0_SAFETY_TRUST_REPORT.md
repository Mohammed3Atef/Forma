# B0 — Safety, trust and cleanup: report

> Phase B0 of the Forma product-experience rebuild · 2026-10-05 · branch `development` (uncommitted working tree on top of `e7663ab`)
> Spec: the Phase A audit (`docs/product-audit/00–18`, `docs/FORMA_PRODUCT_REMOVAL_CANDIDATES.md`). The product was not re-audited.
> Per-finding detail (root cause, files, fix, test, deviation) is in `B0_IMPLEMENTATION_LOG.md`. The real-device checklist is `B0_REAL_DEVICE_CHECKLIST.md`.

---

## 1. Executive verdict

B0 did what it set out to do. On this build, a client in a gym with bad signal is no longer signed out and no longer loses work. A shared phone no longer mixes or destroys accounts. A coach can no longer wipe a plan after a failed load, leak a private note, or look up another coach's clients. Screens touched in B0 no longer claim success they didn't get.

- **12 of the 16 unique P0s are FIXED. 1 is MITIGATED** (PWA-06: cross-device conflicts are detected and the user chooses; nothing is silently overwritten. Automatic per-item merging needs the B1+ data-model change).
- **The 3 media P0s (MD-01, MD-02, MD-03) are DEFERRED BY OWNER** (the Bunny provider work). The owner's interim rule is met: no upload anywhere in the client claims success without a server acknowledgement.
- **All 24 "SAFE TO REMOVE" candidates were processed** (21 complete, 3 partial by choice). No product-decision candidate was touched. 67 files (131.0 MiB) were deleted from the repo. Precache went from 159 entries / 2,341.9 KiB to 152 entries · 1,953.58 KiB, even though the login screen is now precached.
- **Verification.**
  - Typecheck: clean.
  - Unit and API tests: 53 files / 413 tests (baseline 31 files / 298).
  - Production build: ✓.
  - B0 browser journeys: 13/13 + 8/8 + 4/4, plus 13/13 on a production-build service-worker simulation.
  - Full e2e3 regression: 208 of 217 passed on the clean final run. The one failure was a test-setup issue, fixed; it and the 7 serial tests it blocked pass on re-run (`61-b0-trust` 13/13). 1 skip is pre-existing.
  - **Real-device checks have not been run.** All 26 are PENDING REAL DEVICE.
- **Still not launch-ready:** the three media P0s, and the real-device P0 rows.
- **Ready for B1 to start:** see §27.

## 2. Exact audit baseline

| Item | Value |
|---|---|
| Code baseline | `e7663ab` (HEAD, branch `development`). Production runs RC2 `cf3a5d9`. |
| Phase A spec | `docs/product-audit/00–18` + removal candidates, 2026-10-04/05 |
| Phase A totals | 333 findings: P0 17 entries / **16 unique**, P1 92, P2 167, P3 57. 88 removal candidates: 24 SAFE, 54 product decisions, 4 keep, 6 unknown. |
| Baseline checks (before any B0 change) | `tsc -b --noEmit` clean · `vitest run` 31 files / 298 tests · precache 159 entries (2,341.92 KiB) · entry chunk 475,120 B |
| Test data | The database content is test data (owner). All verification ran on the isolated e2e3 stack: local MongoDB, stubbed CDN/Bunny, no production calls. |

## 3. P0 table, before / after

| # | ID | Before (Phase A) | After (B0) | Status | Proof |
|---|---|---|---|---|---|
| 1 | PWA-01 | Any network failure signed the client out. Offline cold start crashed or showed an unusable login. | The session ends only on a server-confirmed 401/403 or an explicit sign-out. The last verified identity is kept and the app boots from local data offline. Single-flight refresh with deadlines; the login chunk is precached. | **FIXED** | sessionStore (8); prod-sim offline cold launch, foreground and deep links; 61 spec |
| 2 | CO-01 | A failed plan read gave an editable empty plan; Save wiped the real plan | No edit until loaded; error/offline/empty are explicit states. Guarded compare-and-replace save; a version on every save; conflict UI. | **FIXED** | planSafety (9), CoachWorkoutEditor (3); 61 "failed plan load" |
| 3 | CO-02 (+CO-21) | "Notes for yourself" and assessment review notes shown to the client | Notes are private by default and filtered server-side. A shared note says so. Review notes moved out of the client-readable object. | **FIXED** | notePrivacy (11), CoachClientNotes (3); 61 private vs shared note |
| 4 | CO-03 | Any coach could search other coaches' clients and get contact data | Exact email/phone only; minimal fields; rate-limited and audited; `fromCoachId` derived server-side | **FIXED** | clientLookup (6); 61 add-existing; 21-transfer |
| 5 | MD-02 | Body photos, attachments and voice notes on public, permanent CDN URLs | Unchanged. Code-side preparation is documented in §13. | **DEFERRED BY OWNER** | — |
| 6 | MD-03 | Deleting media never deletes the file | Unchanged. Code-side preparation is documented in §13. | **DEFERRED BY OWNER** | — |
| 7 | MD-01 | Production uploads fail (Bunny 401) and the UI said "Saved" | The provider is unchanged (owner). The UI never claims an upload it didn't get. | **DEFERRED BY OWNER** (UI honesty rule FIXED) | photoUploadHonesty (3) |
| 8 | CL-44 | "Reset all data" deleted the coaching history on the server | Reset and Clear-day removed; `sync.wipe` deleted (NOT_FOUND) | **FIXED** | sync.test; 61 "no reset" |
| 9 | PWA-02 | An account switch destroyed the previous user's unsynced data | Per-account databases; nothing deleted on a switch; flush before leaving | **FIXED** | localScope (4); prod-sim A→B→A |
| 10 | PWA-03 | A's pending deletions ran against B's account | Tombstones are per account; the engine aborts if the account changes mid-pass | **FIXED** | localScope (4) |
| 11 | PWA-05 | Cursors survived a switch, so history was never re-downloaded | Cursors are per account; V4 cursor; server revisions | **FIXED** | localScope; syncConflicts |
| 12 | PWA-04 | Coach/admin sessions ran the client sync engine | Client-only runtime; `sync.*` is client-only on the server | **FIXED** | certification (coach → FORBIDDEN); 61 "no client sync calls" |
| 13 | PWA-06 | Cross-device writes silently overwrote each other | Server revision per record; conditional push/delete; conflicts parked and resolved by the user | **MITIGATED** | syncConflicts (8), SyncEngine.conflict (4) |
| 14 | PWA-07 | Live cardio, rest timer and recent edits lost on reload or OS kill | Persisted per account and restored; workout writes flush on hide | **FIXED** | liveActivity (6); prod-sim cardio restored after reload |
| 15 | PWA-08 | Signing out offline didn't sign out | A local signed-out marker blocks every automatic restore until the server logout succeeds | **FIXED** | sessionStore; prod-sim offline sign-out |
| 16 | CO-04 (=MS-01) | Coach composer hidden under the nav when a banner shows | Shared "fill to bottom nav" layout | **FIXED** | 60 spec 8/8 (EN + AR, 390–1280) |

**Count:** 16 unique P0s. **12 FIXED · 1 MITIGATED · 3 DEFERRED BY OWNER · 0 BLOCKED · 0 NOT REPRODUCIBLE.**

## 4. Privacy fixes

- **Coach notes (CO-02, CO-21).**
  - `visibility: 'private' | 'client'`, private by default.
  - The client's `coachNotes.list` is filtered on the server; legacy notes without the field count as private.
  - Only shared notes notify the client. `notifications.list` strips the body of old `coach_note` rows that lack the shared marker.
  - Assessment review notes moved to `privateNotes.assessment`; every client-bound assessment response strips them.
  - Coach UI:
    - a "Share with client" toggle, off by default;
    - Private / Visible-to-client badges;
    - "The client will see this feedback" on check-in feedback.
- **Cross-coach lookup (CO-03).**
  - Coaches match only an exact email (case-insensitive) or exact phone. They get at most 5 results with `{ id, displayName, coaching: you|another|none }` and no contact data or other coach's identity.
  - Rate limit: 30 lookups per 10 minutes. Each lookup is audited without storing the identifier.
- **Shared devices (PWA-14).**
  - Per-account databases.
  - React Query cache dropped on sign-out.
  - The client runtime closes before the next account opens.
  - The photo list is reset on leave (found during B0 verification, V-05).
  - What remains on disk: the previous account's own database (kept on purpose so unsynced work isn't lost). An explicit "remove this account's data from this device" action is B1+.
- **Media privacy (MD-02):** deferred by owner. See §13.

## 5. Coach data-safety fixes

- **Plan editors (CO-01, and CO-11 as a by-product).**
  - One state machine (`usePlanEditor`): loading → (error | offline | empty | ready). Editing is impossible until the plan is loaded.
  - "No plan yet" has a deliberate **Create plan**.
  - Every save carries `baseUpdatedAt`. The server refuses a missing base, a create over an existing plan, and a stale base (atomic `replaceOne({_id, updatedAt})`).
  - Every save writes a version (legacy plans are captured first).
  - Conflict UI: "Load latest" / "Keep mine". No raw server text.
  - The unguarded server-side `updateExerciseFromLibrary` was removed. "Update from library" is now an editor change persisted by the guarded Save.
- **Coach composer (CO-04):** described in §3.
- **Subscription history (CO-15):** see §15.

## 6. Client offline / session fixes

- **Refresh outcome is classified** as `ok | unauthorized | network | error`.
  - Single-flight, with a 10 s deadline.
  - An `unauthorized` is retried once, in case another tab rotated the cookie.
  - Every tRPC request has a 30 s deadline.
- **Only `unauthorized` ends the session.** Offline, timeout and 5xx keep the cached identity (`forma.identity.v1`) with `verified: false`, and the app re-verifies on `online` or foreground.
- **Boot:**
  - With a cached identity, the app renders local data at once.
  - With no cached identity and no network, it retries on reconnect instead of showing a dead login.
  - The login chunk (`SitePages`) is precached.
  - The ErrorBoundary recovers once from stale-chunk and CSS-preload errors.
- **Offline sign-out (PWA-08):** a local signed-out marker (`forma.signedOut.v1`) blocks every automatic restore. The server logout is retried on `online` and at launch.
- **Sign-out pushes first (V-09).** Online, sign-out first runs a forced sync, bounded to 5 s. The confirmation then states how many changes are still unsynced and that they stay on this device.
- **Splash loop fixed** (found in verification, V-01): only the first assessment read can hold the splash.

## 7. Account-isolation fixes

- One IndexedDB per account (`forma-u-<uid>`) holds:
  - logs, plans, settings and blobs;
  - tombstones, conflicts and cursors.
- The legacy shared `gym-tracker` database is migrated once (copy → verify → clear), into its recorded owner only. Data with an unknown owner is left untouched.
- `accountRuntime`:
  - switches are serialized;
  - leaving an account flushes pending writes, stops timers and reminders, waits for in-flight sync, and resets the photo list;
  - only the **client** role opens stores, reminders, timers and sync.
- The sync engine aborts the moment the open account changes. On the server, `sync.*` accepts only the client role (`roleProcedureNoActive('client')`).
- The language preference is per device, so the login screen keeps it.

## 8. Sync conflict mitigation (PWA-06)

- **Server side.**
  - The server owns a `rev` per record (+1 per accepted write).
  - Pushes and deletes carry `baseRev`, the revision the device last saw (`null` = never), and apply only by atomic compare-and-set. Anything else returns the server copy as a conflict, or as a rejected delete.
  - Pre-revision clients can no longer replace a newer copy.
- **Client side.**
  - A pull never overwrites unsynced local edits. They become a parked conflict, which is not pushed.
  - A notice asks "Keep this device's / Use the other device's". Identical content is not a conflict.
  - A refused delete brings the edited copy back. Remote deletes never drop unsynced local edits.
- **Cursor V4:** every device re-pulls once to learn revisions. Only edits migrated from the legacy database get a one-time transition.
- **Who owns the base revision.** The base revision of an edit is owned by the local repository, not by the copy a screen holds in memory (V-08). A screen's copy is usually behind the revision the engine stamped after its last push. An edit is treated as stale only if another device's content (`_remoteRev`) has landed since that copy. Without this, every ordinary edit after a sync was parked as a two-device conflict; it was found and fixed in B0 verification.
- **Derived records never ask (V-13).** The daily checklist is computed on the device from the logs. A conflict on it adopts the server copy and recomputes, instead of asking the user to pick between two machine-built checklists.
- **Residual (why MITIGATED, not FIXED):** records are still whole-day documents. Two devices editing different meals on the same day produce a conflict the user resolves, rather than an automatic merge. Entity-level records are a B1+ data-model change.

## 9. Live activity persistence (PWA-07)

- Stored per account in localStorage `forma.live.v1.<uid>`, synchronously:
  - the live cardio start and parameters;
  - the rest timer's end or paused state;
  - the session's current exercise.
- **Restore rules:**
  - A rest timer that ended while the app was closed is dropped silently.
  - A cardio timer older than 12 h isn't resumed.
- **Durable writes:**
  - Workout writes flush on `visibilitychange: hidden`, on `pagehide` and before an account switch.
  - A failed nutrition write reverts the screen and says so.
- **On a real OS kill:** pending (R-08 … R-10).

## 10. Logging correctness

- **✓ commits what the row shows (CL-17 / JR-01).**
  - Typed values win; empty fields take last session's values.
  - A tick with no determinable reps is refused, with "Enter the reps for this set first".
- **The day only moves on a deliberate tap (CL-04 / NT-02, B0 scope).**
  - Resolving a notification's route has no side effects; only a tap moves the day.
  - A new workout session is always dated today.
  - Leaving through the bottom tabs, or returning after 30+ minutes, resets the day to today.
  - Day-scoped screens show DayNav with a "Today" button.
  - The full per-screen date model is B1+.

## 11. Notification lifecycle fixes

- **No replay (NT-01).**
  - "New" is judged against a per-user high-water mark on the device (`forma.notifToastMark.v1.<uid>`).
  - The first poll on a device only sets the baseline.
  - Only unread or unresolved rows from the last 10 minutes can toast.
  - A message for the thread already on screen never toasts.
- **States (NT-03).**
  - **Read** (`seenAt`) drives the badge. **Done** (`resolvedAt`) means the task was completed, and it also marks the row read.
  - The server resolves these automatically:
    - `checkin_requested` on submit;
    - `checkin_submitted` on review;
    - `freeze_requested` on decision or cancel;
    - `message_received` on thread read;
    - `assessment_submitted` on review.
  - "Mark all read" exists for every role except super-admin.
  - A feed that failed to load shows an error with Retry.
- **Pollers (RM-82):** one shared, ref-counted poller per key.
- **Out of scope by brief:** Web Push and email (NT-04).

## 12. Check-in fixes (CL-42 / JR-05, B0 scope)

- **Full-screen task layer.** It sits above the nav and banners, with a pinned, safe-area-padded action bar. Continue / Submit is always on screen.
- **Drafts.**
  - Saved per user and check-in (`forma.checkinDraft.v1.<uid>.<id>`).
  - The flow resumes after close, reload, OS kill or an update reload.
  - The draft is cleared only after a confirmed submit.
- **Leaving.** Leaving mid-flow asks first; answers stay saved.
- **Submit and errors.**
  - Submit is single-flight. A failed submit keeps every answer and shows a safe message.
  - A failed load shows an error with Retry, never "not found" (V-03).
- **B1+:** sliders and their defaults, prefilled weight, the weight-log write and the time estimate.

## 13. Video honesty fixes (+ upload honesty, + MD-02/MD-03 preparation)

**Video (CL-20, EX-01, EX-03, EX-04, MD-07 player part, MD-09).**
- **What can play.** One classifier decides:
  - YouTube, via the privacy-enhanced embed;
  - https video files;
  - everything else is "unsupported".
- **Buttons.** Video and ⓘ buttons exist only when there is something behind them.
- **Player states.**
  - Players show loading until the first frame.
  - Error or a 20 s stall shows a failed state with Retry and "Open video".
  - Undecodable files say so, with a specific HEVC explanation.
  - Offline says it needs a connection.
- **Coach form.** It blocks unplayable links (Drive, Vimeo and so on) with guidance.
- **Server.** Video links must be `https://`. Plain `http` is accepted only for loopback hosts (local dev / test CDN, V-12).
- **Not done:** transcoding (MD-05) and the HEVC re-encode of the starter videos (EX-02).

**Upload honesty (the owner's rule while MD-01 is deferred).**
- **Progress photos.** "Saved" only after the server returns the URL. Otherwise:
  - the toast says "Saved on this device only — your coach can't see this photo yet; it will retry";
  - the photo carries a "Not uploaded" marker;
  - `load()` retries every photo without a URL.
- **Other upload surfaces (audited):**
  - chat attachments already had pending / failed / retry;
  - avatar, check-in and assessment pickers set the URL only from the server's response and show an inline error otherwise;
  - the exercise-video upload alerts on failure.

**MD-02 / MD-03: smallest code-side preparation (documented, not implemented; the provider and migration work is deferred by owner).**
1. **Seam already in place.** `api/media/_lib/policy.ts` resolves every upload from a server-side *category* (`avatar | progress | assessment | checkin | exercise | message`), and the browser never names a path. Personal media is `progress`, `assessment`, `checkin` and `message`. These are the categories that move to a private storage zone. `avatar` and `exercise` can stay public.
2. **Store keys, not URLs (MD-02).**
   - Today `putObject()` returns a public CDN URL, and clients persist it (`cdnUrl`, message `url`, check-in photo URLs).
   - Prep: for personal categories, also return and persist the zone-relative `path` (already computed by the policy).
   - Add one authorised read endpoint, `media.url({ path })`. It checks the same ownership rules as upload (the owner, the assigned coach via `authorizeThreadAccess`, admins with `clients.readAll`) and returns a **signed, expiring** URL (Bunny token authentication).
   - Readers call it instead of using the stored URL.
3. **Deletion lifecycle (MD-03).**
   - Add `deleteObject(path)` next to `putObject()` in `api/media/_lib/bunny.ts` (Bunny Storage supports `DELETE`).
   - Record every upload in a `mediaObjects` ledger: `{ path, ownerId, category, createdAt, refCount | refs }`.
   - Deleting a photo, message, avatar or check-in marks its ledger row. A reaper deletes unreferenced rows after a grace period.
   - Transfers and account deletion enumerate by `ownerId`.
4. **Migration.** Existing public objects are copied to the private zone and re-keyed, the public copies are deleted, and the super-admin gallery (MD-04) reads through the same authorised endpoint.
5. **Order.** 1–3 need no data migration and can ship before the zone switch. Step 4 is the provider and migration work the owner deferred.

## 14. Update-ready behaviour (PWA-09, B0 scope; part of PWA-10 and JR-04)

- **The pill.** A ready update shows a small "Update available · Tap to update" pill.
- **Automatic install only at a safe point.** That means the app is **hidden** and none of these is active:
  - a live workout;
  - live cardio;
  - a running rest timer;
  - a check-in in progress or an unsaved editor (nav guard).
- **Tapping Update during critical work asks first.**
- **The reload is explicit:** a one-time `controllerchange → reload`. vite-plugin-pwa's own reload is skipped for first-visit tabs (V-02, PWA-10 b).
- **Browser-verified on a production build with a live two-build swap:**
  - no reload during critical work;
  - "asks first" during live cardio;
  - the idle update installs and reloads.
- **Open item:** one long single-tab sequence did not activate the waiting worker in automated Chrome. It is recorded as real-device check R-13 (see §26).
- **B1+:**
  - multi-tab coordination;
  - recovering JS preload errors beyond the stale-chunk handler;
  - a version label.

## 15. Commercial correctness

- **CO-14 (B0 scope).**
  - The term sheet remounts on every open and is prefilled with the current price and currency, with a hint. A renewal is never prefilled as free.
  - Renewals start today, with an end-date preview.
  - A failed read shows an error with Retry, and Set term stays disabled until the relationship loads.
  - Dates are computed in the coach's local timezone.
  - Errors are friendly.
- **CO-15.** A term change atomically archives the outgoing term (start, end clipped for early renewal, months, price, currency, end state `expired | ended`) onto `subscriptionHistory`. Price edits, freezes and extensions don't archive.
- **CO-07.**
  - The client list shows and filters the **coaching** state: Active · Trial · Paused · Expiring (≤ 7 d) · Expired · Pending · No plan.
  - The account state appears only when it blocks the client.
  - No state is guessed before the data loads.

## 16. Arabic correctness

- **RTL-02.** One resolver maps `ar` and `ar-eg` to `ar-EG` formatting. Weekday initials come from `Intl` in the app language. The assessment stores the right locale.
- **RTL-04.**
  - Every number entry in the client app normalises Arabic-Indic and Persian digits, `٫ , ،` and direction marks before validating:
    - set cells, NumberStepper (check-in weight), measurements and progress weight;
    - nutrition, session duration, settings and the assessment;
    - cardio and onboarding already used `parseDecimal`.
  - An unreadable measurement is flagged and blocks the save. Nothing is silently dropped.
- **Verified:** Arabic digits in the browser (61 spec); the coach composer in AR / RTL (60 spec).
- **B1+:** Arabic letterforms in the UI font (RTL-01), mixed numeral systems (RTL-03), and a shared `NumericInput` kit component.

## 17. Safe removals completed

All 24 SAFE TO REMOVE candidates were processed. Every name was verified with `git grep --untracked` before deletion; `tsc`, `vitest`, the boundary check and `vite build` were re-run afterwards. Per-ID detail is in the B0.11 table of the implementation log.

| Status | IDs |
|---|---|
| **DONE (21)** | RM-01, RM-02, RM-03, RM-04, RM-07, RM-08, RM-09, RM-10, RM-12, RM-13, RM-15, RM-40, RM-51, RM-57, RM-60, RM-61, RM-69, RM-72, RM-73, RM-81, RM-82 |
| **PARTIAL (3)** | RM-05 (dead exports removed; `export` keywords on ~60 local helpers left), RM-06 (dead store actions removed; streak narrowing not done), RM-84 (`coachPlan` / `coachDashboard` / notes queries unified; the coach-targets mirror and the double roster fetch left) |

Highlights:
- **Legacy local video library (RM-57).** Pages, stores, services and the seed are gone, along with `public/exercise_videos/`: 30 mp4 files, 137,290,037 bytes.
- **Unreachable code and copy.**
  - 14 unreachable modules (RM-01).
  - About 35 dead service functions (RM-03).
  - 292 unused i18n keys per locale; en / ar / ar-eg parity kept at 2,018 each (RM-09).
- **Dead modes and orphan routes.**
  - The always-true `cloudAvailable()` and every local-only branch (RM-02).
  - Orphan routes `/settings/app`, `/progress/photos` and `/coach/client/:id/activity` (RM-40, RM-61).
- **Tooling.** Legacy scripts and destructive one-shot PowerShell files removed. `npm run lint:boundaries` wired up (RM-12, RM-13).
- **Runtime and caching.**
  - Coach/admin sessions no longer run client sync (RM-81 = PWA-04).
  - One shared poller per key (RM-82).
  - `/experience` images were dropped from the install precache (RM-72).

## 18. Safe removals skipped and why

- **Parts deliberately not done** (no behaviour value, or churn):
  - RM-05: dropping `export` from locally used helpers;
  - RM-06: streak narrowing, a CPU optimisation rather than a removal;
  - RM-84: the coach-targets mirror and the roster fetched twice; these touch screens B1 rebuilds anyway.
- **`.claude/settings.local.json`** still references two deleted scripts. It was not edited (standing rule: never edit permission settings). **Owner action.**
- **Demo seeders** (`scripts/seed-demo-*.mjs`) call the **production** API. They are flagged, not deleted (owner tooling; not in the SAFE list).
- **Hidden `/landing-v1`.** `landing.features.secure.desc` ("Built on Firebase") and the `landing-images` runtime cache were kept because `/landing-v1` still exists (RM-62 is a product decision; the marketing site is out of scope).
- **Not touched:** all 54 product-decision candidates, the 4 keep-for-technical-reason candidates and the 6 unknown candidates. Examples: History, the marketing landing, Capacitor, the old `e2e/` suite.

## 19. Test coverage added

- **Totals:** baseline 31 files / 298 tests → **53 files / 413 tests**.
- **New:** 22 files, 109 tests.
- **Updated:** 7 files, net +6.

| Area | File (new unless marked) | Tests |
|---|---|---:|
| Plan save safety (CO-01) | `api/_trpc/routers/planSafety.test.ts` | 9 |
| Note privacy (CO-02/21) | `api/_trpc/routers/notePrivacy.test.ts` | 11 |
| Cross-coach lookup (CO-03) | `api/_trpc/routers/clientLookup.test.ts` | 6 |
| Sync conflicts (PWA-06) | `api/_trpc/routers/syncConflicts.test.ts` | 8 |
| Notification resolution (NT-03) | `api/_trpc/routers/notificationLifecycle.test.ts` | 5 |
| Subscription history (CO-15) | `api/_trpc/routers/subscriptionHistory.test.ts` | 3 |
| Video link scheme | `api/_trpc/routers/coachAssets.test.ts` (updated) | +1 |
| Client cannot wipe; sync client-only | `sync.test.ts`, `certification.test.ts`, `client.test.ts`, `coverage.test.ts` (updated) | contract updates |
| Plan editor error/empty states | `src/pages/coach/CoachWorkoutEditor.test.tsx` | 3 |
| Notes UI | `src/pages/coach/CoachClientNotes.test.tsx` | 3 |
| Session survives offline; offline sign-out | `src/services/auth/sessionStore.test.tsx` (updated) | 2 → 8 |
| Per-account storage (PWA-02/03/05) | `src/data/localScope.test.tsx` | 4 |
| Nothing of A left in memory (PWA-14) | `src/data/accountRuntime.test.tsx` | 1 |
| Two-device conflict end-to-end, incl. edits from in-memory copies and derived records | `src/data/sync/SyncEngine.conflict.test.tsx` | 9 |
| Live activity (PWA-07) | `src/stores/liveActivity.test.tsx` | 6 |
| Logging correctness (CL-17, CL-04) | `src/stores/loggingCorrectness.test.tsx` | 7 |
| Notification launch baseline (NT-01) | `src/components/NotificationBell.test.tsx` | 4 |
| Check-in flow + load error | `src/pages/CheckIn.test.tsx` | 6 |
| Video honesty | `src/components/video/VideoHonesty.test.tsx` | 8 |
| Upload honesty | `src/stores/photoUploadHonesty.test.tsx` | 3 |
| Update-ready | `src/components/UpdateAvailable.test.tsx` | 3 |
| Arabic dates / digits | `src/lib/arabicNumbers.test.tsx` | 6 |
| Shared pollers | `src/lib/sharedSubscription.test.tsx` | 1 |
| "Leave" discards the editor draft | `src/hooks/useUnsavedGuard.test.tsx` | 2 |
| Offline splash loop | `src/hooks/useAssessmentStatus.test.tsx` | 1 |

Four of these tests were proven to fail without their fix: `useAssessmentStatus`, `accountRuntime`, and two of the in-memory-copy cases in `SyncEngine.conflict`.

**Browser specs added:**
- `e2e3/specs/61-b0-trust.spec.ts` (13);
- `e2e3/specs/60-b0-coach-composer.responsive.spec.ts` (8);
- the prod-sim script (13 checks).

## 20. Browser verification

Every run used the **isolated** stack (`e2e3/env/server.mjs`: local MongoDB, stubbed Bunny/CDN). The production-pointing `e2e/` suite was never used, and no production data was read or written.

| Run | What | Result |
|---|---|---|
| `61-b0-trust` | Client at 390 (check-in also at 430): online launch, offline → foreground, set logging, video / no-video, dated notification cold open, check-in, no reset, Arabic digits. Coach: plan-load failure, private vs shared note, add-existing privacy, renewal + history + statuses, no client sync calls | **13 / 13** |
| `60-b0-coach-composer.responsive` | Coach thread with the "term ending" banner, EN + AR, at 390 / 430 / 768 / 1024 / 1280 | **8 / 8** |
| `33-composer-banner.responsive` | Client composer regression (`cf3a5d9`) | **4 / 4** |
| Prod-sim (`vite build` of the **final** B0 code + real service worker, two builds swapped live, Pixel 7 390 × 844, real Chrome) | Offline cold launch; offline foreground; offline deep links ×2; offline login screen; sign-out pending warning; offline sign-out stays out; A→B→A (B sees nothing of A; A's offline entry syncs to A); update pill with no reload during critical work; tap asks first during live cardio; live cardio restored after a reload; idle update installs | **13 / 13** |
| Full e2e3 regression | All projects (chromium-1440, chromium-1280, chromium-1024, tablet-768, mobile-430, mobile-390, webkit-iphone) | Final clean run (`b0-full3`, no code edits during the run): **208 passed**, 1 failed, 1 skipped (pre-existing), 7 did not run. The failure was a test-setup issue (Arabic set on the device, not on the account), fixed. The 7 are the serial tests after it in `61-b0-trust`, and the re-run of that file passed **13 / 13**. Earlier full runs found V-04, V-08, V-09, V-11, V-12 and V-13; the full history is in the implementation log. |

Bugs found by these runs and fixed in B0 (detail in the log, V-01 … V-13):
- an offline deep-link splash loop;
- an update that installed without reloading;
- the check-in "not found" on a load error;
- the Settings email blank (a B0 regression);
- photo metadata surviving an account switch;
- "Gym Tracker" reminder titles;
- **every edit after a sync parked as a false "Changed on two devices" conflict** (a B0 regression, V-08);
- a change made just before sign-out left unsynced (V-09);
- raw server text in "Update from library" (V-10);
- a discarded editor change coming back on the next open (V-11);
- uploaded exercise videos unsaveable on the local/test stack (V-12);
- a false conflict on a new device's auto-built daily checklist (V-13).

## 21. Real-device pending checks

**PENDING REAL DEVICE — nothing on this list has been run on a phone.** `B0_REAL_DEVICE_CHECKLIST.md` has 26 checks for an installed PWA on iPhone and Android:
- **A.** Session and offline (R-01 … R-05).
- **B.** Shared device (R-06, R-07).
- **C.** Live activity after an OS kill (R-08 … R-10).
- **D.** Update ready, including the long single-tab sequence (R-11 … R-13).
- **E.** Check-in, keyboard, RTL and Arabic digits (R-14 … R-19).
- **F.** Video, HEVC and upload honesty (R-20 … R-23).
- **G.** Notifications (R-24 … R-26).

The rows marked P0 are R-01, R-02, R-03, R-04, R-06, R-08 and R-17. They must pass before any public launch.

## 22. Files / assets removed

| What | Files | Bytes |
|---|---:|---:|
| **Deleted from the repo and the disk** | **67** | **137,382,863 (131.0 MiB)** |
| – of which `public/exercise_videos/*.mp4` | 30 | 137,290,037 |
| – source modules (`src/…`) | 29 | — |
| – scripts, destructive `.ps1` files, `public/data/exercise-taxonomy-ar.json` | 8 | — |
| **Untracked from git and gitignored; local copies kept** (`gym tracker (1)/`, `competitor-analysis/`, `*.tsbuildinfo`) | 117 | 7,796,776 (7.4 MiB) |
| **Moved to `docs/archive/`** (old audit/QA/plan docs and a patch) | 8 | — |
| npm | `fflate` devDependency uninstalled (still present transitively via `@types/three`); scripts `import:sheet` and `test:smoke` removed; `lint:boundaries` added | — |
| i18n | 292 keys per locale (876 entries) | — |

## 23. Bundle / precache impact

| Metric | Before (`e7663ab`) | After (B0) |
|---|---|---|
| Precache | 159 entries · 2,341.92 KiB (without the login chunk) | 152 entries · 1,953.58 KiB (**with** the login chunk) |
| Entry chunk `index-*.js` | 475,120 B | 479,105 B (154,835 B gzip). +3,985 B: session classification, per-account runtime, revision/conflict handling. |
| Repo media | +137.3 MB of mp4 in `public/` | 0 |
| Polling | duplicate pollers per mounted bell / badge | one shared poller per key |
| Coach/admin boot | client sync engine: 11 calls at boot + every 2 min | none |

What drove the change:
- **Smaller:**
  - the install precache no longer ships `/experience` images and CSS (RM-72);
  - the local video runtime caches are gone (RM-73);
  - 29 source modules deleted.
- **Larger:** precaching the login chunk (PWA-01), and the new session / sync / conflict logic in the entry chunk. The precache total still fell.

## 24. Known remaining P0s

| ID | Status | Why it is still open | What closes it |
|---|---|---|---|
| **MD-01** | DEFERRED BY OWNER | Production uploads fail with Bunny 401 on `BUNNY_API_KEY`. The key rotation and Vercel env swap are owner-held. | Rotate and fix the key; make upload availability a real health check. The UI is already honest about failures. |
| **MD-02** | DEFERRED BY OWNER | Personal media is on public, permanent CDN URLs | §13 steps 1–4: private zone + signed, expiring URLs |
| **MD-03** | DEFERRED BY OWNER | Deleting media never deletes the file | §13 step 3: `deleteObject` + `mediaObjects` ledger + reaper |
| **PWA-06** | MITIGATED (not open in the "silent loss" sense) | Whole-day records, so same-day edits on two devices conflict | Entity-level records with automatic merge (B1+) |

**No P0 is BLOCKED or unaddressed.** The three media P0s remain **public-launch blockers** (Phase A §4, rank 5–6).

## 25. Remaining P1s explicitly deferred to B1+

**P1s closed or advanced by B0** (32 of 92):

| Status | IDs |
|---|---|
| **Fixed** (in B0 scope) | CL-17, JR-01, CL-42, JR-05, CO-07, CO-11 (version on every save), CO-14, CO-15, CO-21, EX-01, EX-03, EX-04, NT-01, NT-02, NT-03, PF-03, PF-04, PF-10, PWA-09, RTL-02, RTL-04 |
| **Partly** | CL-04 (no silent day moves; the per-screen date model is B1+), CL-34 (honest + retry; durable outbox is PWA-12), CL-45 (legacy tools, reset and the "Gym Tracker" name gone; the sync card and reminders redesign remain), CO-18 (honest states on every B0-touched screen only), AR-02 (sync, reminders and stores are client-only; settings still load for every role), JR-04 / PWA-10 (safe-point activation, first-visit reload, stale-chunk recovery; multi-tab coordination remains), PF-02 (client deadlines; server and Mongo timeouts remain), PWA-14 (memory clean; "remove from device" remains), MS-02 (chat already honest; the provider fix is MD-01), NAV-K02 ("Leave" now discards the draft; the three back controls remain) |

**Explicitly deferred to B1+** (60 P1s, by theme):

| Theme | IDs |
|---|---|
| Navigation & IA | CL-01, CL-38, CO-08, NAV-K01, NAV-K03, CL-13 |
| Home / triage | CL-09, CL-10, CO-05, CO-06, CO-09, CO-17, JR-02 |
| Coach programming | CO-10, CO-12, CO-13, CO-19, CO-20 |
| Business | CO-16, JR-03, TB-01 |
| First run & coach relationship | CL-14, CL-41 |
| Library & media | EX-02, EX-05, EX-06, EX-07, EX-09, EX-10, EX-12, EX-13, EX-14, EX-19, EX-20, MD-04, MD-05, JR-06 |
| Food | FD-01, FD-02, FD-04 |
| Notifications | NT-04 (excluded from B0 by brief) |
| Architecture / sync / perf | AR-01, PF-01, PF-05 (excluded from B0 by brief), PF-11, PWA-11, PWA-12, PWA-13 |
| Visual & accessibility | CD-01, CD-04, VS-04, VS-08, VS-11, VS-19, VS-20, AX-01, AX-02, AX-03 |
| Arabic | RTL-01, RTL-03 |

The two highest-risk deferrals for B1 planning:
- **PWA-12:** no durable outbox for messages, voice notes and check-in photos.
- **EX-06 / FD-01:** editors overwrite Arabic text with English. Both are data-integrity issues, not cosmetic ones.

## 26. Deviations from the Phase A recommendation

| Area | Phase A direction | B0 did | Why |
|---|---|---|---|
| PWA-01 | Keep the session for clients | Applied to **every role**. Coaches and admins restored offline see offline/error states instead of a login form. | Same rule, fewer special cases |
| PWA-06 | Finer-grained records + versioned writes | Versioned writes + user-resolved conflicts; finer records deferred | Data-model rebuild is B1+ |
| CO-01 | Never edit an unloaded plan; versions; concurrency | As recommended, **plus** removed the unguarded `updateExerciseFromLibrary`. "Update from library" now needs Save. | It was a second unguarded write path. e2e3 `22-library` updated. |
| CO-03 | Exact match, minimal fields, unified add-client flow | Exact match + minimal fields; the unified flow / removing "Add existing" (CO-37) not done | Product decision |
| NT-03 | Mark visible items seen when the feed opens | An explicit **Mark all read** instead | Opening the feed shouldn't hide what's new |
| CL-04 / NT-02 | "Editing <date>" banner | Not added; DayNav already shows the date + "Today" | Per-screen date model is B1+ |
| CL-44 | Remove from the client app | Also deleted the server `sync.wipe` (no caller) | A support deletion should be a separately audited admin action |
| CO-14 | Fix prefill / errors / dates | Done; currency stays free text | UX redesign is B1+ |
| CO-07 | Show the coaching state | Done; subscription "frozen" shown as **Paused** | Avoids clashing with the account "Frozen" wording |
| EX-04 | Validate links | Client classifier + coach-form block; server checks the **scheme only** (https) | An old saved link must not make unrelated template saves fail |
| RTL-04 | Shared `NumericInput` | One shared normaliser through the existing inputs | The component kit is B1 design-system work |
| MD-02 / MD-03 | Private zone, signed URLs, deletion lifecycle | **Documented only** (§13), no code | Owner deferred the provider and migration work |
| PWA-09 | Coordinated activation | Safe-point activation + explicit reload; the long single-tab sequence in automated Chrome did not activate (root cause not established) | Recorded as R-13 rather than claimed |
| e2e3 | — | `20-coach-core`, `22-library` and `23-nav-unsaved` updated for the CO-01 behaviour; `21-transfer`, `30-client` and `40-media` for CO-03, CO-02 and RM-40 | They asserted the old, unsafe behaviour |
| Removals | 24 SAFE | 21 complete, 3 partial | §18 |

## 27. Recommended B1 entry conditions

1. **Owner review of this report.** In particular:
   - the deviations in §26;
   - the PWA-06 residual;
   - whether CO-37 ("Add existing") stays.
2. **Commit B0 as a reviewed checkpoint** on `development`. Nothing has been committed or pushed. Then deploy it to a **staging** URL backed by the test database, never production data.
3. **Run the P0 rows of the real-device checklist** (R-01, R-02, R-03, R-04, R-06, R-08, R-17) on that staging build. B1 design work can start in parallel; **shipping** anything from B1 should wait until these pass.
4. **Schedule the media P0s outside B1's critical path.**
   - MD-01 (key rotation, owner) unblocks every upload.
   - MD-02 / MD-03 (§13) must land before real clients upload body photos at scale.
5. **Treat the B0 invariants as B1 guardrails.** The B1 IA rebuild must not regress them; the B0 specs (`60`, `61`) and the unit tests above encode them:
   - the session ends only on a server 401;
   - one local database per account, and a client-only runtime;
   - no editable state before a successful load, and guarded saves;
   - notes private by default;
   - no false success (uploads, saves, sends);
   - errors are never shown as empty;
   - updates install only at safe points.
6. **Owner housekeeping:**
   - remove the two dead script references from `.claude/settings.local.json`;
   - decide what happens to the production-calling `seed-demo-*` scripts.
7. **Top B1 data-integrity items:**
   - PWA-12, the durable outbox;
   - EX-06 / FD-01, Arabic overwrite;
   - PWA-11, an honest sync status;
   - PWA-13, sync contract validation.

---

PHASE B0 SAFETY & TRUST: COMPLETE

```
P0 BEFORE: 16 unique (17 entries)
P0 FIXED: 12
P0 MITIGATED: 1 (PWA-06)
P0 DEFERRED BY OWNER: 3 (MD-01, MD-02, MD-03)
P0 BLOCKED: 0

SAFE REMOVALS COMPLETED: 24 of 24 processed (21 complete, 3 partial)
FILES REMOVED: 67 deleted (+117 untracked and kept locally, 8 archived)
ASSET SIZE REMOVED: 137,382,863 bytes (131.0 MiB) deleted; 7,796,776 bytes untracked

TYPECHECK: clean (`tsc -b --noEmit`)
BUILD: ✓ (`npm run build`; precache 152 entries / 1,953.58 KiB); `lint:boundaries` ✓
TESTS: 53 files / 413 tests
BROWSER TESTS: e2e3 final full run 208/217 passed (1 test-setup failure fixed → `61-b0-trust` re-run 13/13; 1 pre-existing skip); B0 specs 61: 13/13, 60: 8/8, 33: 4/4; prod-sim on the final production build 13/13. Real device: 0 run (26 PENDING)

B1 READY: YES. The remaining items gate public launch, not the start of B1 (see §27): owner review of this report; the real-device P0 rows (R-01, R-02, R-03, R-04, R-06, R-08, R-17) before anything from B1 ships; MD-01, MD-02 and MD-03 (deferred by owner) before real clients upload body photos
```
