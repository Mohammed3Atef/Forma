# B2 — Client certification report

> Phase B2, Premium Client Experience Rebuild. Branch `development`, uncommitted on top of `595e0af` (B1).
> Evidence lives in `e2e-out/` (runs, screenshots, traces) and in the companion docs: `B2_CLIENT_BLUEPRINT.md`, `B2_ROUTE_MIGRATION.md`, `B2_IMPLEMENTATION_LOG.md`, `B2_VISUAL_QA.md`.
> Everything below was run on isolated stacks (in-memory Mongo, local Bunny stand-in, e-mail disabled) or on a local production build. Nothing was pushed, deployed or run against production. **No physical device was used** — browser emulation is not device evidence.

## 1. Verdict

**B2 is complete** against the brief's exit criteria (§2), with the open items in §6 and §7 carried forward explicitly. The five-destination client is built, every old client route has a home or a documented retirement, B0 / B1 guarantees still hold in their own tests, and the client journeys pass in the browser.

## 2. Exit criteria (brief §29)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Five-destination client IA | MET | `config/clientNav.ts`, `ClientShell`; e2e 80 IA test; `_d-layout` nav checks at 6 widths |
| 2 | Today has correct adaptive states | MET | 8 hero states (load error · loading · no coach · waiting · in progress · done · week done · planned); e2e 30, 42, 43, 80 (Journey B ends on "done") |
| 3 | Train is a coherent workout journey | MET | Train → Day → Exercise → Session → Summary → History; e2e 30, 61, 80 |
| 4 | Nutrition supports daily execution without wrong-date logging | MET | Day switcher announces any other day and that changes go there; Today always today; e2e 80 Journey C |
| 5 | Progress is one understandable experience | MET | Body · Strength · Consistency, one log flow; e2e 80 Journey D, 30, 40, 44 |
| 6 | Coach: messaging and check-ins without duplicated navigation | MET | One Coach tab (Chat · Updates · Check-ins); bell, menu and inbox page retired; e2e 31–33, 61, 80 |
| 7 | You holds account / settings | MET | Profile · Preferences · Account (coach, assessment, subscription, sync, help, privacy, sign out); e2e 10, 30, 80 |
| 8 | First-run states are useful | MET (gates unchanged) | No coach / waiting / load-error states; first-run wizard copy; auth gates are out of B2 scope (brief) |
| 9 | Old functionality preserved or intentionally retired | MET | `B2_ROUTE_MIGRATION.md` §1–3 (retirements are blueprint decisions D5, D7, D8 and audit removals) |
| 10 | B1 components used consistently | MET | Button / IconButton / NumericField / Banner / ScreenState / Sheet / SyncStatus / outbox / nav contract on every client screen; new pieces are composites (`ListRow`, `ActionMenu`, `TabBar`, `AppHeader`, `DaySwitcher`, `CoachNav`) |
| 11 | Mobile layouts visually reviewed | MET | 228-shot matrix incl. 360 / 390 / 430; per-milestone review sets |
| 12 | Arabic and English verified | MET | 114 Arabic shots (all RTL), e2e 80 Arabic journey, 61 Arabic check-in, 44 / 45 Arabic layout + chart chronology |
| 13 | Offline / session / account isolation intact | MET | Prod-build offline boot PASS; e2e 80 Journeys E and G; 61 offline / background; unit `localScope`, `accountRuntime`, `outbox` |
| 14 | Sync and upload states truthful | MET | B1 `SyncStatus` unchanged; sign-out and remove-data say what is only on this device; photo upload honesty (B0) kept; Updates never says "deleted" for media |
| 15 | B0 / B1 regression tests pass | SEE §3 | 61-b0, 60-b0, 70-b1, unit suite |
| 16 | Production build passes | MET | `npm run build` |
| 17 | Browser journeys pass | SEE §3 / §4 | Full e2e3 suite + journeys table |
| 18 | Physical-device and media blockers documented | MET | §7 |

## 3. Quality

| Check | Result |
|---|---|
| **Typecheck** `npx tsc -b --noEmit` | PASS (clean) |
| **Build** `npm run build` | PASS — precache 172 entries (2 093.6 KiB); entry 458.5 KB (148.7 KB gz) |
| **Unit / API** `npm run test -- --run` | PASS — 69 files, 531 tests (new: `lib/coachUpdates.test.ts` 5, `data/deviceData.test.tsx` 4; updated: `navContract.test` 1 expectation) |
| **Boundaries** `npm run lint:boundaries` | PASS — no forbidden cross-role imports |
| **Browser — full e2e3 suite** (all projects: chromium 1440 / 1280 / 1024, tablet 768, mobile 430 / 390, webkit-iphone) | **PASS — 227 passed + 1 skipped (pre-existing) of 228.** Final run on final code: 225 passed, 1 skipped, 2 timed out while the machine was suspended (the run's wall clock reads 1.1 days); both (`45-layout` @1280: super-admin Arabic, ar-eg client + coach) pass on re-run. The earlier full run (226 + 1 skipped) had one real failure — `43-cache-freshness` looked for the plan day as a heading — fixed in the test (§T) and re-verified in suite order (30 → 43 → 80: 20 / 20). B1 baseline: 218 + 1 skipped of 219 |
| **Browser — B2 spec** `80-b2-client.spec.ts` | PASS — 10 / 10 (9 inside the full run; Journey A added afterwards and run on its own) |
| **Browser — prod-build PWA** `e2e3/pwa/pwa-check.mjs` | PASS, same as the B0 / B1 baseline — SW controls the page; offline reload renders from precache; offline banner shows and clears; update detected, reload deferred while visible, applied once hidden. The page error "Unexpected token '<'" is the known baseline (analytics path answered with `index.html` by the local static server) |
| **Browser — prod-build signed-in offline boot** `e2e3/pwa/b1-client-offline-boot.mjs` | PASS — offline relaunch renders the signed-in client, lazy runtime chunks served by the SW (none from the network), offline navigation to a lazy screen works |
| **Visual QA** | 228-shot matrix (19 screens × 6 widths × EN / AR): 0 px horizontal overflow, all Arabic shots RTL; 21 issues found and corrected (`B2_VISUAL_QA.md` §3) |
| **Arabic / RTL** | Matrix (114 Arabic shots), e2e 80 Arabic journey, 61 Arabic check-in, 44 / 45 Arabic layout + chart chronology, 30 language switch — PASS |
| **Accessibility** | axe WCAG 2.0 / 2.1 A + AA: 76 scans (19 screens × EN / AR × 390 / 1440) → 2 findings fixed → **0 violations** on re-run; 46-a11y spec PASS |
| **B0 / B1 regression** | 60-b0, 61-b0 (13), 70-b1 (2), offline boot, PWA check, unit suite (outbox, localScope, accountRuntime, syncTruth, CheckIn, VideoHonesty, arabicNumbers…) — PASS |

**Test changes** (selectors and expectations only; every guarantee kept) are listed in `B2_IMPLEMENTATION_LOG.md` §T: `30-client` (set rows, CL-18 start, meal / cardio markup, radio type picker), `_d-layout` (B2 nav keys, side rail), `61-b0` (two assertions strengthened — the unscoped "Today" match could pass even if the day moved), `43-cache-freshness` (plan day as a row), `navContract.test` (assessment parent).

## 4. Client journeys (brief §24)

| Journey | What was exercised | Where | Result |
|---|---|---|---|
| A — New client | No coach yet → Today "not connected" + Chat "no coach"; assigned coach, no plan → "waiting" on Today / Train / Nutrition; plan arrives → Today's first action is Start | e2e 80 Journey A (clientFree: no coach on Today and Chat; clientA: waiting → plan arrives → Start), 42 (load error ≠ waiting), 43 (check-in on refocus) | PASS |
| B — Morning workout | Today → Start (already running) → set → rest → resume bar on another tab → Finish → Today "done"; server copy | e2e 80 Journey B; 30 workout journey; 61 set-tick rules | PASS |
| C — Nutrition | View plan → log food into a chosen meal → edit quantity → view another day (announced) → back to today; server copy | e2e 80 Journey C; 30 (food search, failure path) | PASS |
| D — Progress | Log weight → measurements (same flow) → trend views → photo upload (stub CDN) | e2e 80 Journey D; 30 + 40 (photo upload, server record, fresh context) | PASS |
| E — Coach relationship | Message arrives → open Coach → reply; offline send queued → reconnect → server acknowledgement | e2e 31 (both directions, receipts), 80 Journey E | PASS |
| F — Check-in | Requested check-in → steps → reload mid-flow → resume → one submit → status | e2e 61 (×3 incl. Arabic), 30 (coach sees it), 80 (opens from Coach › Check-ins; cold close → Check-ins) | PASS |
| G — Account isolation | A's unsynced change → sign out (told it is pending) → B sees nothing of A → back to A → change still there → syncs | e2e 80 Journey G; 10 (logout / next user); unit `localScope`, `accountRuntime` | PASS |
| H — Deep links | Cold `/workout/exercise/:id`, `/history`, `/assessment`, `/progress/measurements`, `/check-in/:id` → Back / Close → semantic parent; Coach sections have no Back | e2e 80; unit `navContract` | PASS |
| I — Arabic | Workout (Arabic-Indic digits), nutrition, messaging in Arabic; check-in in Arabic | e2e 80 Journey I; 61 check-in 390-ar; 30 settings language | PASS |
| J — Recovery | Network failure → error states with Retry, never "waiting for coach"; API timeout / 5xx on refresh keeps the session and the server's own DB timeout recovers; offline reopen (signed-in, prod build) and offline + background → foreground; upload failure → immediate honest error, retry after the network returns; sync conflict → conflict kept and reported, status never "Synced" while pending; app update → deferred while visible, applied once hidden | e2e 42 (screens + client home), 61 (offline / background); unit `sessionStore.test` (5xx / timeout), api `mongodb.test` (timeout); prod-build offline boot; e2e 40 (network failure on upload, bad type / size), unit `photoUploadHonesty`; unit `SyncEngine.conflict`, `syncTruth`; prod-build PWA check | PASS (sync conflict and timeouts at unit level; the rest in the browser) |

## 5. Audit status

### 5.1 P1 findings classed B2 by the B1 triage (13 rows: 10 P1 + 3 P2 residuals)

| ID | Finding | Status | How |
|---|---|---|---|
| CL-01 | Three overlapping client navigation systems | **FIXED** | One tab bar (phone / tablet) or side rail (desktop); hamburger and bell retired for the client |
| CL-09 | Today is a 2.8-screen report | **FIXED** | One hero, at most one coach item, essentials rows, a two-tile week |
| CL-10 | After training, Today still says "Start workout" | **FIXED** | "Done today" and "week done" states (e2e 80 Journey B) |
| CL-13 | Plan exercises lead nowhere; day view orphaned | **FIXED** | Train rows → Day → Exercise |
| CL-14 | Coach guidance never reaches the workout | **FIXED** | Coach notes inline on Day, exercise screen and session card |
| CL-38 | Coach relationship over seven surfaces | **FIXED** | One Coach tab; Today shows at most one coach item |
| CL-41 | First run: four gates, then zeros | **MITIGATED** | Zeros replaced by honest states and first-run copy; the auth / complete-account gates are untouched (brief: no public-auth redesign) |
| CD-01 | Everything is a box | **FIXED (client)** | Sections + row groups; coach screens in B3 |
| CD-04 | Equal weight for unequal importance | **FIXED (client)** | One hero and one primary action per view; coach in B3 |
| VS-08 | Seven destructive styles; red × on every food row | **FIXED (client)** | Row menus (`ActionMenu`) for foods, cardio entries, photos, reminders; one danger style |
| CL-04 | Hidden app-wide day dates new logs (residual) | **FIXED** | Day-scoped screens show the day in words and that changes go there; Today always today; B0 resets kept |
| CL-45 | Legacy tools and sync internals in Settings (residual) | **FIXED** | You: sync is one quiet status row; sign-out row; no tools |
| PWA-14 | Previous user's data on a shared device (residual) | **FIXED** | "Remove my data from this device" (refuses anything unsynced; unit + e2e) |

**Totals: 11 fixed · 1 mitigated (CL-41) · 0 blocked** — plus CD-01 / CD-04 / VS-08 whose coach halves belong to B3.

### 5.2 B1-mitigated foundation P1s whose client screens migrated in B2

| ID | Status after B2 |
|---|---|
| AX-01 (targets < 44 px) | **FIXED on client screens** (44 px; 56 px in the session) — coach in B3 |
| AX-03 (unlabelled fields) | **FIXED on client screens** (axe: 0 `label` violations in 76 scans) — coach in B3 |
| VS-04 (type scale, 8–11 px text) | **MITIGATED** — client text ≥ 12 px except shared chart ticks (9–9.5 px, P2) |
| VS-19 (no coherent identity) | **FIXED on client screens** (website icons, real wordmark, tokens) |
| VS-20 (client and coach are two products) | **MITIGATED** — stays open until B3 rebuilds the coach |

### 5.3 Outstanding client P2 / P3 (known, carried forward)

Phase A recorded 37 client P2 / P3 findings (CL) and 7 client-navigation ones (NAV-C). B2's rebuild resolves most of them as a side effect (e.g. CL-02, CL-03, CL-06, CL-08, CL-11, CL-12, CL-16, CL-18, CL-19, CL-22, CL-24–CL-30, CL-32, CL-35, CL-37, CL-39, CL-43, CL-46, CL-48–CL-50, NAV-C01–C03, NAV-C07); they were not individually re-audited. Known open:

| Item | Priority | Note |
|---|---|---|
| CL-42 check-in content (sliders, prefill) | P2 | B0 made the wizard safe; its content redesign was not done in B2 |
| CL-33 check-in weight / photos not merged into Progress | P2 | D12 — needs a server data-model change |
| CL-36 measurement form shows 14 "0" placeholders | P2 | Shared with the coach's form; B3 |
| CL-23 every exercise logged as kg × reps | P2 | Data model |
| CL-15 training guide content is one coach's sheet | P2 | Content, not layout |
| CL-21 read-only subscription and past workouts | — | Not re-verified in B2 |
| NAV-C05 hardware Back vs sheets / wizard steps; NAV-C06 scroll restoration | P2 | Not addressed in B2 |
| Chart tick text 9–9.5 px | P2 | Shared chart component (VS-04 remainder) |
| All three locales ship in the entry bundle | P2 | Entry grew 141.8 → 148.7 KB gz, all from B2's new strings (+61 KB raw over 3 locales); lazy-loading non-active locales would recover it |
| Terms / Privacy not reachable while signed in | P3 | Website routes live in the anonymous app; brief forbids touching legal pages |
| No food database, no Web Push / e-mail digests | — | Out of scope by the brief |

## 6. Engineering notes

- **Backend:** none. No API, schema, migration or sync-contract change. Permissions stay server-enforced (private notes never reach the client; thread and check-in access unchanged).
- **Offline / sync:** stores, outbox (`message.send`, `checkin.submit`, `progressPhoto.upload`), per-account IndexedDB and the sync runtime are unchanged. New: `data/deviceData.ts` (remove this account's local data — never the server's, never anything unsynced) and `localScope.forgetAccountInstances`.
- **Performance:** client screen chunks 1.6–23.5 KB (gz 0.9–7.2 KB); `ClientApp` 44.9 KB (13.9 KB gz). Entry 148.7 KB gz (B1: 141.8) — the difference is translation strings (§5.3). Precache 172 entries. Polling budget unchanged (e2e 47 passes; the Coach section badges reuse the shell's existing polls).

## 7. Release status

| Item | Status |
|---|---|
| Real-device checks | **NOT DONE.** The seven B0 real-device P0 checks (R-01, R-02, R-03, R-04, R-06, R-08, R-17) remain a release gate; nothing in B2 replaces them. B2 adds screens that should be included in that pass (tab bar safe areas, session bottom stack, day switcher date picker, remove-device-data on iOS Safari / installed PWA). |
| MD-01 (production uploads fail, Bunny 401) | **OPEN — owner-held** (key rotation + Vercel env). B2 keeps upload honesty: nothing says "Saved" without a server acknowledgement. |
| MD-02 (personal media on public, permanent URLs) | **OPEN.** B2 makes no privacy claim about photos. |
| MD-03 (deleting media never deletes the file) | **OPEN.** Photo removal copy says it leaves the gallery and the coach's view — not that the file is erased. |
| PWA-06 | **MITIGATED only** (cross-device conflict notice; no entity-level merge). |
| Known release blockers | The four rows above plus owner review of B0, B1 and B2 (all uncommitted on `development`). |

## 8. Next

**B3 Coach Rebuild Ready: YES** — no B2 blocker prevents starting B3. The release blockers in §7 gate launch, not B3. B3 inherits: the client-only composites (`ListRow`, `ActionMenu`, `TabBar` / `SideRail`, `AppHeader`) which are role-agnostic; the shared components B2 deliberately left in their B1 look (`MeasurementForm`, `AvatarPicker`, `AssessmentView`, charts); and VS-20 / CD-01 / CD-04 / VS-08 on coach screens.
