# 18 — Prioritized findings (master index)

> Phase A · Discovery only · 2026-10-04/05 · HEAD `e7663ab` (production runs RC2 `cf3a5d9`)
> This is the consolidated index of every finding in docs 02–15 and the removal candidates in `../FORMA_PRODUCT_REMOVAL_CANDIDATES.md`. The detail for each finding lives in its own document; this file ranks, counts and de-duplicates them.
>
> Priority model (brief §37):
> - **P0:** data loss, security/privacy, or an unusable critical flow.
> - **P1:** a major product or reliability problem that materially damages normal use.
> - **P2:** an important UX, polish or performance problem.
> - **P3:** minor polish.
>
> Each finding also carries Effort (S/M/L/XL), Impact (LOW/MEDIUM/HIGH/TRANSFORMATIVE) and Action (KEEP/REDESIGN/MERGE/MOVE/REMOVE/REBUILD).

## Bottom line

- **333 findings + 88 removal candidates = 421 entries.**
  - 173 of the 333 findings are **browser-verified** on the isolated stack, 151 are code-confirmed, and 9 are inferred (they need a real device or production).
- **17 P0 entries. After cross-document duplicates are merged, they are 16 unique P0 issues** (§3), in four groups:
  - **Identity and sync safety, 8:** offline sign-out and crash; account-switch data loss; cross-account deletes; coach sessions capturing client data; cursor overwrite; cross-device overwrite; live activity lost on reload; offline sign-out that doesn't sign out.
  - **Coach data and privacy, 4:** plan wipe after a failed load; "private" notes shown to clients; cross-coach client search; composer hidden under the nav.
  - **Media, 3:** production uploads failing; body photos on public permanent URLs; deleted files never deleted.
  - **Client, 1:** "Reset all data" erases the coach-visible history.
- **92 P1** findings form the product-experience rebuild: navigation, Today, coach triage, client workspace, editors, library/media, notifications lifecycle, update UX, Arabic.
- **About two-thirds of the P0s are effort S.** Pre-launch safety is achievable quickly. The experience rebuild is not; it is phased in 00.

## 1. Counts

| Area (prefix) | Doc | P0 | P1 | P2 | P3 | Total |
|---|---|---:|---:|---:|---:|---:|
| Architecture (AR) | 01 | 0 | 2 | 0 | 0 | 2 |
| Client app (CL) | 02 | 1 | 12 | 25 | 12 | 50 |
| Client navigation (NAV-C) | 05 | 0 | 0 | 5 | 2 | 7 |
| Coach mobile (CO) | 03 | 4 | 17 | 20 | 1 | 42 |
| Desktop (DT) | 04 | 0 | 0 | 8 | 5 | 13 |
| Tables (TB) | 04 | 0 | 1 | 4 | 3 | 8 |
| Coach navigation (NAV-K) | 05 | 0 | 3 | 6 | 2 | 11 |
| Visual system (VS) | 06 | 0 | 5 | 15 | 0 | 20 |
| Cards (CD) | 06 | 0 | 2 | 6 | 1 | 9 |
| Exercise library (EX) | 07 | 0 | 14 | 8 | 2 | 24 |
| Food library (FD) | 08 | 0 | 3 | 6 | 2 | 11 |
| Messenger (MS) | 09 | 1 | 1 | 8 | 7 | 17 |
| Notifications (NT) | 10 | 0 | 4 | 9 | 3 | 16 |
| Toasts (TS) | 10 | 0 | 0 | 4 | 2 | 6 |
| PWA / cache / offline (PWA) | 11 | 8 | 6 | 6 | 3 | 23 |
| Media (MD) | 12 | 3 | 2 | 4 | 2 | 11 |
| Performance / network (PF) | 13 | 0 | 7 | 18 | 6 | 31 |
| Accessibility (AX) | 14 | 0 | 3 | 7 | 2 | 12 |
| Arabic / RTL (RTL) | 14 | 0 | 4 | 6 | 2 | 12 |
| Journeys (JR) | 15 | 0 | 6 | 2 | 0 | 8 |
| **Findings** | | **17** | **92** | **167** | **57** | **333** |
| Removal candidates (RM) | Removal doc | 2 | 12 | 34 | 40 | 88 |
| **All entries** | | **19** | **104** | **201** | **97** | **421** |

**Actions**

| Action | Findings (333) | Removal candidates (88) | Total |
|---|---:|---:|---:|
| REDESIGN | 197 | 4 | 201 |
| REBUILD | 77 | 0 | 77 |
| REMOVE | 20 | 56 | 76 |
| MERGE | 21 | 22 | 43 |
| MOVE | 11 | 3 | 14 |
| KEEP | 7 | 3 | 10 |

**Removal candidate certainty** (from the removal doc): 24 SAFE TO REMOVE · 54 LIKELY REMOVE — PRODUCT DECISION · 4 KEEP FOR TECHNICAL REASON · 6 UNKNOWN — INVESTIGATE.

## 2. Cross-document duplicates (read these as one issue)

Each domain doc reports the issue from its own angle. **The canonical ID is listed first**, and its priority wins if they differ.

| Canonical | Also reported as | Issue |
|---|---|---|
| PWA-01 | PF-03, PF-10, CL-49 (partly), BV-03/04 | Network failure = signed out; offline crash / login (HEAD: login chunk not precached) |
| PWA-04 | RM-81, PF-04, DT-09 | Client sync engine runs for coach/admin |
| CL-44 | RM-56 | "Reset all data" wipes coach-visible history |
| CO-01 | (11: PWA-18 context) | Plan editor opens empty after a failed load → Save overwrites |
| CO-02 | CO-21, IA-K05 | Coach notes published to the client without saying so |
| CO-04 | MS-01, VS-11/CO-30 (root cause: banners) | Coach composer under the bottom nav when a banner shows |
| MD-01 | MS-02, CL-34 (partly), TS-03 | Uploads fail in production (Bunny 401); the UI says "Saved" anyway |
| NT-01 | TS-01, AX-07 | Old notifications replay as a stacked toast wall at app open |
| NT-02 | CL-04, NAV-C03 (partly) | A notification (or past-day view) moves the global selected day → wrong-day logs |
| JR-01 | CL-17 | ✓ without typing saves an empty set but says "Logged" |
| JR-02 | CO-05, CO-06, CO-07, CO-17, DT-02 | No coach triage surface |
| JR-03 | CO-16, DT-06, TB-02 | Lapsed/expiring/pending clients never named or actionable |
| JR-04 | PWA-09, PWA-10, PWA-17 | Update arrives a session late, invisibly; mixed versions possible |
| JR-05 | CL-42, NAV-C04 | Check-in CTA below the fold; answers lost on exit |
| JR-06 | EX-14, CO-24, FD-02 | Text-only exercise/food discovery; no preview |
| JR-07 | CO-10, NAV-K02, CO-12 | Mobile plan editing depth |
| JR-08 | AX-01, VS-12, CO-28, CL-19 | Thumb-zone inversion; WhatsApp FAB in the way |
| EX-01 | CL-20 | Dead video/info buttons (EX-01's P1 is canonical; CL-20 rated P2) |
| EX-22 | CL-24, RM-23 | Client "Exercise library" = plan exercises |
| EX-06 | CO-26, FD-01 | Editors overwrite Arabic text with English |
| RTL-04 | FD-05, CL-36 (partly) | Arabic-Indic digits / comma decimals rejected or zeroed |
| PF-05 | PF-06, MS-06, NT-11, DT-12 | Polling as the only realtime channel; duplicate pollers |
| PF-11 | EX-16 | 835 KB library payload per open |
| VS-18 | PWA-11, DT-09 | Sync status lies / shown twice / wrong engine |
| CD-01 | CL-09, CO-17 (visual cause) | Everything is a box |
| CO-08 | IA-K02, DT-03, CO-20, DT-05 | Client split across ~21 URLs and 3 layouts |
| CL-01 | IA-C01, RM-34 | Client has three navigation systems |
| CL-38 | IA-C02, RM-21, NT-12 | Coach relationship spread over 7 surfaces |

## 3. The 16 unique P0 issues

| # | ID(s) | Issue | Evidence | Effort | Direction (Phase B) |
|---|---|---|---|---|---|
| 1 | **PWA-01** | **Any network failure signs the client out.** An offline cold start or an offline background→foreground **crashes the installed app** (HEAD) or shows an unusable login (RC2). | BV-03, BV-04; `sessionStore.ts:80-91,147-166`; `App.tsx:63-70` | M | Keep the last verified identity on the device; end the session only on an explicit 401/revocation; precache the login; boot from local data |
| 2 | **CO-01** | **A failed plan read lets the coach wipe a client's plan.** The editor opens empty; Save replaces the real plan; no version is kept. | BV-11 (4-day/20-exercise plan → 1 day/0) | S | Never edit an unloaded plan; server-side version on every save; optimistic-concurrency check |
| 3 | **CO-02** (+CO-21) | **"Notes for yourself" are shown to the client** as "Coach feedback"; workspace notes are client-visible without saying so | BV-12 | S | Private notes are coach-only by default; client-visible notes say so explicitly |
| 4 | **CO-03** | **Any coach can search other coaches' clients** by one letter and get email, phone, coach id, permissions | BV-13; `adminUsers.ts:151-176` | M | Exact email/phone match only, minimal fields; unified add-client flow |
| 5 | **MD-02** | **Body photos, message attachments and voice notes are on public, permanent CDN URLs** | `api/media/_lib/policy.ts`; 12 | L | Private storage zone + signed, expiring URLs for personal media |
| 6 | **MD-03** | **Deleting media never deletes the file** (photos, messages, avatars, transferred clients) | No Bunny delete call in code; 12 | M | Deletion lifecycle + a reaper job |
| 7 | **MD-01** | **Production uploads fail** (Bunny 401 on `BUNNY_API_KEY`). Every photo, attachment, voice note and exercise video upload. | Release report 2026-10-03 (INFERRED here) | S | Rotate/fix the key; make upload availability a real health check |
| 8 | **CL-44** (=RM-56) | **"Reset all data" deletes the client's coaching history on the server**, with one confirm | `Settings.tsx:257-275` → `sync.wipe` | S | Remove from the client app |
| 9 | **PWA-02** | **Switching accounts on a device destroys the previous user's unsynced data** | `clientSync.ts:26-50` | M | Per-user IndexedDB; never delete a DB with pending changes |
| 10 | **PWA-03** | **The previous user's pending deletions run against the next user's account** | `SyncEngine.ts:190`; `sync.ts:61-77` | S | Scope the deletions store per user |
| 11 | **PWA-05** | **Sync cursors survive an account switch → history never re-downloaded → new writes overwrite the server copy** | `clientSync.ts:46` vs `SyncEngine.ts:71-73` | S | Reset the correct cursor keys; server version checks |
| 12 | **PWA-04** (=RM-81, PF-04) | **Coach/admin sessions run the client sync engine** and can push a client's queued data into the coach's account | BV-25 (engine runs on coach boot); `cloudStore.ts:100-121` | S | Client-only engine |
| 13 | **PWA-06** | **Cross-device writes silently overwrite each other** (whole-day documents, device-clock last-write-wins, no server conflict check) | `sync.ts:27-41` | L | Finer-grained records + versioned writes |
| 14 | **PWA-07** | **In-progress activity isn't crash-safe:** the live cardio timer, rest timer and recent edits are lost on reload/OS kill/update reload | BV-06c; `cardioStore.ts`, `timerStore.ts` | S | Persist start timestamps; flush on hide |
| 15 | **PWA-08** | **Signing out offline doesn't sign out.** The next online moment restores the previous account. | `mongoAuth.ts:67-70` | S | Local sign-out must invalidate locally and queue the revocation |
| 16 | **CO-04** (=MS-01) | **The coach's composer is hidden under the bottom nav** whenever a coach banner shows | BV-14 | S | Layout fix (as done for clients in `cf3a5d9`) + one banner region |

## 4. Pre-launch blockers (top 10)

These must be fixed or mitigated **before a public launch**. Most are small.

| Rank | Blocker | IDs | Effort | Why it blocks launch |
|---|---|---|---|---|
| 1 | Offline / network failure signs clients out and crashes the installed app | PWA-01, PWA-08, PF-03, PF-10 | M | The core use case (logging in a gym with bad signal) fails |
| 2 | Plan wipe after a failed load | CO-01 (+CO-11 versions) | S | Unrecoverable loss of a client's program |
| 3 | Private coach notes shown to clients | CO-02, CO-21 | S | Trust/privacy breach between coach and client |
| 4 | Cross-coach client lookup with contact data | CO-03 | M | Personal-data exposure between competing coaches |
| 5 | Personal media on public permanent URLs; deletes don't delete | MD-02, MD-03 | L (mitigation M) | Body photos are the most sensitive data the product holds; legal exposure (PDPL) |
| 6 | Production uploads failing | MD-01 (+TS-03, CL-34) | S | Photos, check-ins, attachments and voice notes silently fail |
| 7 | Account-isolation data loss on shared devices | PWA-02, PWA-03, PWA-05, PWA-04/RM-81 | S–M | Silent cross-account loss/corruption (coaches often log in on a client's phone to help) |
| 8 | "Reset all data" erases coach-visible history | CL-44/RM-56 | S | One tap destroys the coaching record |
| 9 | Coach composer hidden under the nav | CO-04/MS-01 | S | Coaches can't reply while a plan banner shows |
| 10 | Silent wrong data in daily logging | JR-01/CL-17 (empty sets "Logged"), NT-02/CL-04 (wrong-day logs), PWA-07 (live cardio lost) | S | Adherence data that coaches act on becomes wrong without anyone noticing |

**Strongly recommended before launch (P1, mostly effort S):**
- **NT-01 + NT-03:** replayed toasts; unread never clears.
- **EX-01 + EX-03 + EX-04:** dead video button; silent player; unplayable links.
- **JR-05 / CL-42:** check-in CTA and lost answers.
- **PWA-09:** visible "update ready".
- **CO-14 / CO-15:** a renewal that pre-fills "free"; history never written.
- **RTL-02 / RTL-04:** English dates for ar-eg; Arabic digits rejected.
- **CO-07:** the client list shows the wrong status.

## 5. P1 themes (92 findings, grouped)

| Theme | Representative IDs | What it is |
|---|---|---|
| Navigation & IA | CL-01, CL-38, CO-08, NAV-K01/02/03, IA (05) | Three nav systems; client split over ~21 URLs; Back leaves context |
| Home screens | CL-09, CL-10, CO-05, CO-06, CO-17, JR-02 | Reports instead of action queues; wrong or contradictory states |
| Logging integrity | CL-04, CL-17, NT-02, JR-01 | Wrong day, empty sets, silent loss |
| Coach programming | CO-10, CO-11, CO-12, CO-13, JR-07 | Desktop editors on phones; no versions; check-in review buried |
| Business | CO-14, CO-15, CO-16, JR-03, TB-01 | Subscription actions confusing; history not recorded; lapsed clients invisible |
| Library & media | EX-01..07, EX-09/10/12/13/14/19/20, FD-01/02/04, MD-04/05, JR-06 | Dead video, HEVC, frozen per-coach copies, no media in discovery, Arabic loss |
| Notifications | NT-01..04, CL-34 | Replay, never clears, no push |
| Architecture, offline, update, perf | AR-01/02, PWA-09..14, PF-01/02/05/10/11, JR-04 | Update UX, outbox, boot waterfall, polling |
| Visual & accessibility | VS-04/08/11/19/20, CD-01/04, AX-01..03 | No identity; everything boxed; small targets |
| Arabic | RTL-01..04, EX-12 | Broken Arabic letterforms, English dates, digits rejected |
| First run & coach relationship | CL-41, CL-42, CL-45, CL-13, CL-14 | Four gates then zeros; coach notes never reach the session |

## 6. Full index (all 333 findings, sorted by priority then impact)

Removal candidates (RM-01…RM-88) are listed in `../FORMA_PRODUCT_REMOVAL_CANDIDATES.md` and summarised in 00.

| # | ID | Finding | P | Effort | Impact | Action | Verified | Doc |
|---:|---|---|---|---|---|---|---|---|
| 1 | PWA-01 | Any network failure ends the client's session: offline resume and cold start crash the installed app (HEAD) or show an unusable login (RC2) | P0 | M | TRANSFORMATIVE | REDESIGN | Browser | 11 |
| 2 | CL-44 | "Reset all data" deletes the client's coaching history from the server | P0 | S | HIGH | REMOVE | Code | 02 |
| 3 | CO-01 | A failed plan read lets the coach wipe a client's plan | P0 | S | HIGH | REDESIGN | Browser | 03 |
| 4 | CO-02 | "Notes for yourself" are shown to the client | P0 | S | HIGH | REDESIGN | Browser | 03 |
| 5 | CO-03 | Any coach can look up other coaches' clients and their contact data | P0 | M | HIGH | REDESIGN | Browser | 03 |
| 6 | CO-04 | Message composer hidden under the bottom nav when the plan banner shows | P0 | S | HIGH | REDESIGN | Browser | 03 |
| 7 | MD-01 | Production uploads fail (Bunny 401) | P0 | S | HIGH | KEEP | Inferred | 12 |
| 8 | MD-02 | Body photos and private messages are served from public, permanent URLs | P0 | L | HIGH | REBUILD | Code | 12 |
| 9 | MD-03 | Deleting media never deletes the file | P0 | M | HIGH | REBUILD | Code | 12 |
| 10 | MS-01 | Coach composer hidden under the bottom nav whenever a coach banner shows | P0 | S | HIGH | REDESIGN | Browser | 09 |
| 11 | PWA-02 | Switching accounts on a device destroys the previous user's unsynced data, and the switch races the first sync | P0 | M | HIGH | REDESIGN | Code | 11 |
| 12 | PWA-03 | The previous user's pending deletions are applied to the next user's account | P0 | S | HIGH | REDESIGN | Code | 11 |
| 13 | PWA-04 | Coach and admin sessions run the client sync engine and can capture a client's unsynced data | P0 | S | HIGH | REMOVE | Browser | 11 |
| 14 | PWA-05 | Sync cursors survive an account switch: history is never re-downloaded, then new writes overwrite the server copy | P0 | S | HIGH | REBUILD | Code | 11 |
| 15 | PWA-06 | Cross-device writes silently overwrite each other: whole-day documents, device-clock last-write-wins, no server conflict check | P0 | L | HIGH | REBUILD | Code | 11 |
| 16 | PWA-07 | In-progress activity isn't crash-safe: the live cardio timer, rest timer and recent edits are lost on any reload or OS kill | P0 | S | HIGH | REDESIGN | Browser | 11 |
| 17 | PWA-08 | Signing out while offline doesn't sign out: the next online moment restores the previous account | P0 | S | HIGH | REDESIGN | Code | 11 |
| 18 | CD-01 | Everything is a box: 10–19 bordered, shadowed surfaces per screen | P1 | L | TRANSFORMATIVE | REDESIGN | Browser | 06 |
| 19 | CL-01 | Three overlapping navigation systems; most screens light no tab | P1 | L | TRANSFORMATIVE | REBUILD | Browser | 02 |
| 20 | CL-09 | Today is a 2.8-screen report that repeats itself | P1 | M | TRANSFORMATIVE | REBUILD | Browser | 02 |
| 21 | CO-05 | No triage surface: the landing list can't tell the coach who needs them | P1 | L | TRANSFORMATIVE | REBUILD | Browser | 03 |
| 22 | CO-08 | A client is spread over an 11-tab rail, a More sheet and a separate "view as client" layout | P1 | L | TRANSFORMATIVE | REBUILD | Browser | 03 |
| 23 | EX-07 | The starter library is copied into every coach account and never updated | P1 | L | TRANSFORMATIVE | REBUILD | Browser | 07 |
| 24 | JR-02 | Coach morning has no triage surface (9/10 "Needs attention", wrong status chip, review queue 2 levels deep) | P1 | M | TRANSFORMATIVE | REBUILD | Browser | 15 |
| 25 | NT-04 | Nothing reaches users outside the app (no push, no coaching email) | P1 | L | TRANSFORMATIVE | REBUILD | Code | 10 |
| 26 | PWA-09 | After a deploy the old build stays visible for the whole session; there is no update UI, and refresh doesn't help | P1 | M | TRANSFORMATIVE | REDESIGN | Browser | 11 |
| 27 | VS-19 | No coherent Forma identity: the app doesn't speak the approved website's language | P1 | L | TRANSFORMATIVE | REDESIGN | Code | 06 |
| 28 | AR-01 | Client has three data paths with three freshness/offline models (IndexedDB mirror, sync engine, memory-only React Query) | P1 | L | HIGH | REBUILD | Code | 01 |
| 29 | AR-02 | Role-agnostic root boots client-only systems for every role (bootstrap, IndexedDB stores, reminders, sync engine) | P1 | M | HIGH | REBUILD | Browser | 01 |
| 30 | AX-01 | ~40% of phone controls are under 44px; the gym-critical ones are the smallest | P1 | M | HIGH | REDESIGN | Browser | 14 |
| 31 | AX-02 | Icon-only header actions lose their accessible name on phones | P1 | S | HIGH | REBUILD | Browser | 14 |
| 32 | AX-03 | ~70 form fields have no programmatic label; the client sign-up is placeholder-only | P1 | M | HIGH | REBUILD | Code | 14 |
| 33 | CD-04 | Equal visual weight for unequal importance | P1 | M | HIGH | REDESIGN | Browser | 06 |
| 34 | CL-04 | A hidden app-wide "selected day" silently dates new logs | P1 | M | HIGH | REBUILD | Browser | 02 |
| 35 | CL-10 | After you train, Today still says "Start workout" | P1 | S | HIGH | REDESIGN | Browser | 02 |
| 36 | CL-13 | The plan's exercises lead nowhere; the real day view is an orphan route | P1 | M | HIGH | MERGE | Browser | 02 |
| 37 | CL-14 | Coach guidance never reaches the workout | P1 | M | HIGH | REDESIGN | Browser | 02 |
| 38 | CL-17 | Ticking a set that shows last time's numbers saves an empty set | P1 | S | HIGH | REDESIGN | Browser | 02 |
| 39 | CL-34 | Progress photos can silently never reach the coach | P1 | S | HIGH | REDESIGN | Code | 02 |
| 40 | CL-38 | The coach relationship is spread over seven surfaces | P1 | M | HIGH | MERGE | Browser | 02 |
| 41 | CL-41 | First run is four gates and then a dashboard of zeros | P1 | M | HIGH | REDESIGN | Code | 02 |
| 42 | CL-42 | The weekly check-in hides its Continue button and loses answers | P1 | S | HIGH | REDESIGN | Browser | 02 |
| 43 | CL-45 | Legacy tracker tools and sync internals in a paying client's Settings | P1 | S | HIGH | REMOVE | Browser | 02 |
| 44 | CO-06 | "Needs attention" / "At risk" are too noisy to trust | P1 | M | HIGH | REDESIGN | Browser | 03 |
| 45 | CO-07 | Client list shows and filters the admin account state | P1 | S | HIGH | REDESIGN | Browser | 03 |
| 46 | CO-09 | Overview's headline metric is wrong and the rest is navigation | P1 | M | HIGH | REBUILD | Browser | 03 |
| 47 | CO-10 | Editing a program on a phone takes 10 taps and three back buttons | P1 | L | HIGH | REBUILD | Browser | 03 |
| 48 | CO-11 | Plain Save keeps no version; "Version history" is empty for real clients | P1 | M | HIGH | REDESIGN | Browser | 03 |
| 49 | CO-12 | Nutrition editor is a 4.3-screen form of repeated controls | P1 | L | HIGH | REBUILD | Browser | 03 |
| 50 | CO-13 | Check-ins put "Request" first and hide the review queue in the menu | P1 | M | HIGH | REDESIGN | Browser | 03 |
| 51 | CO-14 | Subscription tab offers 7 competing actions and pre-fills a "free" renewal | P1 | M | HIGH | REDESIGN | Browser | 03 |
| 52 | CO-15 | Renewing overwrites the previous term; subscription/payment history is never recorded | P1 | M | HIGH | REDESIGN | Code | 03 |
| 53 | CO-16 | Revenue is a primary tab of 17 cards that never names the client to act on | P1 | M | HIGH | MOVE | Browser | 03 |
| 54 | CO-17 | Dashboard is 2.8 screens of stale and repeated content | P1 | M | HIGH | REBUILD | Browser | 03 |
| 55 | CO-18 | States lie: errors look empty, offline looks empty, some loads never end | P1 | M | HIGH | REDESIGN | Code | 03 |
| 56 | CO-19 | Features that promise something and lead nowhere (swap review, step/cardio targets, nutrition templates, apply template, broadcast) | P1 | M | HIGH | REMOVE | Browser | 03 |
| 57 | CO-20 | "View as client" shows one empty day at a time | P1 | L | HIGH | REBUILD | Browser | 03 |
| 58 | CO-21 | Workspace notes are published to the client without saying so | P1 | S | HIGH | REDESIGN | Browser | 03 |
| 59 | EX-01 | "Watch video" is a dead tap for 95% of exercises | P1 | S | HIGH | REDESIGN | Browser | 07 |
| 60 | EX-02 | 35 of the 46 starter videos are HEVC files many browsers can't show | P1 | L | HIGH | REBUILD | Browser | 07 |
| 61 | EX-03 | The client video player fails silently | P1 | S | HIGH | REDESIGN | Browser | 07 |
| 62 | EX-04 | Coaches can save video links that can never play | P1 | S | HIGH | REDESIGN | Browser | 07 |
| 63 | EX-05 | Library edits never reach clients' assigned plans | P1 | M | HIGH | REDESIGN | Code | 07 |
| 64 | EX-06 | Any edit through the exercise form silently unlinks it from the library and overwrites Arabic notes | P1 | S | HIGH | REDESIGN | Code | 07 |
| 65 | EX-09 | Exercise metadata is unreliable (equipment, primary muscle, category) | P1 | M | HIGH | REDESIGN | Code | 07 |
| 66 | EX-10 | No quality gate: incomplete, foreign-language and mismatched records sit alongside good ones | P1 | M | HIGH | REDESIGN | Code | 07 |
| 67 | EX-12 | The exercise library has almost no Arabic | P1 | L | HIGH | REBUILD | Code | 07 |
| 68 | EX-13 | Clients never see exercise images | P1 | M | HIGH | REDESIGN | Browser | 07 |
| 69 | EX-14 | Coaches can't see or preview media while choosing an exercise | P1 | M | HIGH | REDESIGN | Browser | 07 |
| 70 | EX-19 | Licences and attribution for exercise data and media are not honoured | P1 | M | HIGH | REDESIGN | Code | 07 |
| 71 | EX-20 | Starter workout templates are filled alphabetically | P1 | M | HIGH | REBUILD | Code | 07 |
| 72 | FD-01 | Picking or editing a food in the nutrition editor erases its Arabic name | P1 | S | HIGH | REDESIGN | Code | 08 |
| 73 | FD-02 | External food search returns ambiguous, unusable results | P1 | M | HIGH | REBUILD | Browser | 08 |
| 74 | FD-04 | No portion model: servings can't be scaled | P1 | M | HIGH | REDESIGN | Code | 08 |
| 75 | JR-01 | Ticking a set without typing saves null weight/reps but the session says "Logged" | P1 | S | HIGH | REDESIGN | Browser | 15 |
| 76 | JR-03 | Renewal workflow blind spots: expired/trial/pending/cancelled clients only as counts | P1 | M | HIGH | REDESIGN | Browser | 15 |
| 77 | JR-04 | Deploys arrive a session late, invisibly; first-visit tabs can run mixed versions | P1 | M | HIGH | REDESIGN | Browser | 15 |
| 78 | JR-05 | Check-in wizard does not own the screen (CTA below fold, tabs visible, weight 0) | P1 | S | HIGH | REDESIGN | Browser | 15 |
| 79 | JR-06 | Text-only exercise and food discovery; unidentifiable food search results | P1 | M | HIGH | REDESIGN | Browser | 15 |
| 80 | MD-05 | No video transcoding: uploads are stored exactly as recorded | P1 | L | HIGH | REBUILD | Code | 12 |
| 81 | MS-02 | Attachments and voice notes are offered but fail in production (upload check sees only that keys exist) | P1 | S | HIGH | REDESIGN | Inferred | 09 |
| 82 | NAV-K01 | Workspace Messages/Progress entries replace history; Back leaves the client | P1 | S | HIGH | REDESIGN | Browser | 05 |
| 83 | NAV-K02 | Three back controls in editors; "Leave" keeps the draft | P1 | M | HIGH | REDESIGN | Browser | 05 |
| 84 | NAV-K03 | Freeze-request notification lands where the request isn't shown | P1 | S | HIGH | REDESIGN | Code | 05 |
| 85 | NT-01 | Old notifications replay as stacked toasts on every app open | P1 | S | HIGH | REBUILD | Browser | 10 |
| 86 | NT-02 | A notification toast moves the client's selected day; later logs go to the wrong date | P1 | S | HIGH | REBUILD | Browser | 10 |
| 87 | NT-03 | Unread never clears: no mark-all, opening the feed marks nothing, finishing the task leaves it unread | P1 | M | HIGH | REDESIGN | Browser | 10 |
| 88 | PF-01 | Client boot waits on three dependent API calls (auth.refresh → auth.me → assessment.get) before showing local data | P1 | M | HIGH | REBUILD | Browser | 13 |
| 89 | PF-02 | No timeouts anywhere on the request path (client fetch, Mongo 30 s default, rejected connect cached forever) | P1 | S | HIGH | REBUILD | Code | 13 |
| 90 | PF-03 | App login screen lives in the non-precached website chunk (HEAD only): 71 KB gz to log in, offline crash | P1 | S | HIGH | MOVE | Browser | 13 |
| 91 | PF-05 | Polling is the only realtime channel: 13.5–25 req/min per open app, no backoff | P1 | L | HIGH | REBUILD | Browser | 13 |
| 92 | PF-10 | Token refresh can race itself (no single-flight, rotate-on-use refresh tokens) and sign the user out | P1 | S | HIGH | REBUILD | Inferred | 13 |
| 93 | PF-11 | Exercise library = 835 KB per fetch, 4.8 s to first row on Slow-4G, refetched after every change | P1 | M | HIGH | REBUILD | Browser | 13 |
| 94 | PWA-10 | Update activation is unsafe either way: visible tabs reload mid-edit, first-visit tabs never reload, and CSS stale-chunk errors aren't recovered | P1 | M | HIGH | REDESIGN | Browser | 11 |
| 95 | PWA-11 | The sync status misleads: "Synced" with changes pending, a coach indicator for the wrong engine, and an offline banner that promises sync | P1 | M | HIGH | REDESIGN | Browser | 11 |
| 96 | PWA-12 | No durable outbox outside the sync engine: messages, voice notes, photos and check-ins are lost on navigation or reload | P1 | M | HIGH | REBUILD | Code | 11 |
| 97 | PWA-13 | The sync contract is unvalidated and brittle: the server accepts any collection and shape; one failure blocks the whole pass | P1 | M | HIGH | REBUILD | Browser | 11 |
| 98 | RTL-01 | Arabic labels break apart: mono letter-spacing and a font with no Arabic glyphs | P1 | M | HIGH | REBUILD | Browser | 14 |
| 99 | RTL-02 | Egyptian-Arabic users get English dates and weekdays | P1 | S | HIGH | REBUILD | Browser | 14 |
| 100 | RTL-03 | Mixed numeral systems and device-locale (US) dates | P1 | M | HIGH | REBUILD | Browser | 14 |
| 101 | RTL-04 | Arabic-Indic digits are rejected or silently dropped in number entry | P1 | S | HIGH | REBUILD | Code | 14 |
| 102 | TB-01 | Primary client table overflows at 1440 and shows the wrong columns | P1 | M | HIGH | REDESIGN | Browser | 04 |
| 103 | VS-04 | Typography has no scale; text that carries meaning is 8–11px | P1 | M | HIGH | REBUILD | Browser | 06 |
| 104 | VS-08 | Destructive actions: 7 styles, and red × on every planned food row | P1 | M | HIGH | REBUILD | Browser | 06 |
| 105 | VS-11 | Fifteen banner treatments, mounted globally, stacking above content | P1 | M | HIGH | REBUILD | Browser | 06 |
| 106 | VS-20 | Client and coach are two products | P1 | L | HIGH | MERGE | Code | 06 |
| 107 | MD-04 | The super-admin gallery shows every client's body photos | P1 | S | MEDIUM | REDESIGN | Code | 12 |
| 108 | PF-04 | Coach and admin sessions run the client sync engine (11 calls at boot and every 2 min) | P1 | S | MEDIUM | REMOVE | Browser | 13 |
| 109 | PWA-14 | On shared devices the previous user's data stays visible in memory and on disk after sign-out | P1 | S | MEDIUM | REDESIGN | Code | 11 |
| 110 | MS-04 | Generic chat beside three other coach channels, with no client context in the thread | P2 | L | TRANSFORMATIVE | MERGE | Code | 09 |
| 111 | AX-09 | Fixed chrome hides primary actions and focused elements | P2 | M | HIGH | REDESIGN | Browser | 14 |
| 112 | CD-02 | Four KPI-tile components and the same KPI in several places | P2 | M | HIGH | MERGE | Browser | 06 |
| 113 | CD-08 | Border and repetition overload makes long screens unscannable | P2 | M | HIGH | REDESIGN | Browser | 06 |
| 114 | CL-19 | Session controls fight one-handed use | P2 | M | HIGH | REDESIGN | Browser | 02 |
| 115 | CL-33 | Body data lives in four silos | P2 | M | HIGH | MERGE | Code | 02 |
| 116 | CL-47 | Subscription state is invisible until it bites | P2 | M | HIGH | REDESIGN | Browser | 02 |
| 117 | DT-02 | Desktop dashboard: 21 cards, actionable list below the fold | P2 | M | HIGH | REBUILD | Browser | 04 |
| 118 | DT-03 | 11-tab workspace rail only fits at 1440; two tabs leave the workspace | P2 | L | HIGH | REBUILD | Browser | 04 |
| 119 | DT-05 | "View as client" on desktop is one empty day of full-width tiles | P2 | L | HIGH | REBUILD | Browser | 04 |
| 120 | EX-18 | All exercise media is hotlinked from wger.de | P2 | L | HIGH | REBUILD | Code | 07 |
| 121 | FD-05 | Arabic digits or comma decimals silently become zero | P2 | S | HIGH | REDESIGN | Code | 08 |
| 122 | FD-06 | Foods have no images anywhere | P2 | M | HIGH | REDESIGN | Code | 08 |
| 123 | JR-07 | Mobile plan editing depth (10 taps, 3 back buttons, mandatory sections) | P2 | L | HIGH | REBUILD | Browser | 15 |
| 124 | MS-03 | Phone threads keep the full app chrome and add the bottom safe area twice; rest-timer card can cover the composer | P2 | M | HIGH | REDESIGN | Code | 09 |
| 125 | NAV-C03 | Workout session exits are inconsistent; a running session is invisible from other tabs (no resume bar) | P2 | M | HIGH | REDESIGN | Code | 05 |
| 126 | NAV-C04 | No exit protection in any client flow (check-in, measurements, food editor) — tabs/✕/bell discard answers | P2 | S | HIGH | REDESIGN | Code | 05 |
| 127 | NT-12 | Clients have four overlapping "from my coach" places; the coach bell repeats existing work queues | P2 | M | HIGH | MERGE | Code | 10 |
| 128 | PF-12 | Coach saves never update the cache (97 mutations, 0 optimistic/setQueryData, 119 invalidations) | P2 | M | HIGH | REDESIGN | Code | 13 |
| 129 | PF-14 | Server queries grow with all-time history (thread summary, unread notification count, dashboard summaries, check-in history) | P2 | M | HIGH | REBUILD | Code | 13 |
| 130 | PF-17 | First visit is heavy: 150 KB gz entry, 44% website CSS, 25 font styles, no HTML splash (FCP 3.5 s Slow-4G / 7.5 s 3G) | P2 | M | HIGH | REBUILD | Browser | 13 |
| 131 | PF-21 | Coach screens start empty on every launch (no persisted cache); error = skeleton forever; fresh device = false "waiting for coach" | P2 | M | HIGH | REBUILD | Code | 13 |
| 132 | RTL-05 | No pluralisation in either language | P2 | M | HIGH | REBUILD | Browser | 14 |
| 133 | RTL-10 | System content is English-only in the Arabic app | P2 | L | HIGH | REDESIGN | Browser | 14 |
| 134 | VS-01 | Button size modifiers are dead CSS | P2 | S | HIGH | REBUILD | Code | 06 |
| 135 | VS-05 | Orange means everything; info blue and gold are unused | P2 | M | HIGH | REDESIGN | Code | 06 |
| 136 | VS-06 | Surfaces, borders, shadows and radii have no hierarchy | P2 | M | HIGH | REDESIGN | Code | 06 |
| 137 | VS-10 | Status chips: 4 implementations and 18 copied tone maps that drift | P2 | M | HIGH | MERGE | Code | 06 |
| 138 | VS-13 | Four page-header systems; mobile headers on desktop; two h1 per workspace page | P2 | M | HIGH | MERGE | Browser | 06 |
| 139 | AX-04 | Contrast failures inside the tokens | P2 | S | MEDIUM | REDESIGN | Code | 14 |
| 140 | AX-05 | Keyboard and focus management gaps | P2 | M | MEDIUM | REBUILD | Code | 14 |
| 141 | AX-06 | Overlays and menus without dialog or menu semantics | P2 | M | MEDIUM | REBUILD | Code | 14 |
| 142 | AX-07 | Feedback disappears too fast or blocks the flow | P2 | S | MEDIUM | REDESIGN | Browser | 14 |
| 143 | AX-08 | State shown by colour only | P2 | S | MEDIUM | REDESIGN | Code | 14 |
| 144 | CD-03 | Cards inside cards, and cards inside sheets | P2 | S | MEDIUM | REDESIGN | Browser | 06 |
| 145 | CD-05 | Cards that hold one weak, zero or wrong number | P2 | S | MEDIUM | REMOVE | Browser | 06 |
| 146 | CD-07 | Navigation disguised as cards (duplicate routes) | P2 | S | MEDIUM | REMOVE | Browser | 06 |
| 147 | CD-09 | The featured (hero) card is overused and misapplied | P2 | S | MEDIUM | REDESIGN | Browser | 06 |
| 148 | CL-02 | One destination, two or three names | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 149 | CL-03 | Chrome eats the first screen | P2 | M | MEDIUM | REDESIGN | Browser | 02 |
| 150 | CL-05 | Sticky headers and footers inside <main> don't stick | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 151 | CL-07 | Safe-area handling gaps on notched iPhones | P2 | S | MEDIUM | REDESIGN | Inferred | 02 |
| 152 | CL-08 | Sub-44px targets and sub-11px text on daily screens | P2 | M | MEDIUM | REDESIGN | Browser | 02 |
| 153 | CL-11 | The weekly numbers mislead | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 154 | CL-18 | You start the workout twice | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 155 | CL-20 | Video and info buttons that do nothing | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 156 | CL-21 | A read-only subscription blocks viewing past workouts and mislabels the state | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 157 | CL-22 | The finish summary celebrates tonnage and asks nothing | P2 | M | MEDIUM | REDESIGN | Code | 02 |
| 158 | CL-23 | Every exercise is logged as kg × reps | P2 | M | MEDIUM | REDESIGN | Browser | 02 |
| 159 | CL-24 | "Exercise library" is just the client's 20 plan exercises | P2 | S | MEDIUM | REMOVE | Browser | 02 |
| 160 | CL-26 | Fuel actions: a red ✕ on every planned food, and two "Add food" meanings | P2 | M | MEDIUM | REDESIGN | Browser | 02 |
| 161 | CL-29 | Cardio is a hidden destination with mixed meanings | P2 | M | MEDIUM | MERGE | Browser | 02 |
| 162 | CL-30 | Cardio log saves empty entries; delete is a 16px icon | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 163 | CL-32 | Progress repeats itself and colours weight loss red | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 164 | CL-36 | Measurements: 14 "0"s, a stacked header and silent data drops | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 165 | CL-39 | "Your coach" is a catch-all page that duplicates Subscription | P2 | S | MEDIUM | REMOVE | Browser | 02 |
| 166 | CL-40 | The assessment page shows raw keys, broken wrapping and coach wording | P2 | S | MEDIUM | REDESIGN | Browser | 02 |
| 167 | CL-46 | Settings structure: three tabs, coach-owned values, buried Sign out | P2 | M | MEDIUM | REDESIGN | Browser | 02 |
| 168 | CL-48 | "Waiting for your coach" when the plan simply hasn't loaded | P2 | S | MEDIUM | REDESIGN | Code | 02 |
| 169 | CL-49 | Online-only screens show errors as facts | P2 | S | MEDIUM | REDESIGN | Code | 02 |
| 170 | CO-22 | Labels contradict the numbers they show | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 171 | CO-23 | A new coach's library is empty and its chrome is clipped | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 172 | CO-24 | Exercise picker shows no media and favours "Quick create" | P2 | M | MEDIUM | REDESIGN | Browser | 03 |
| 173 | CO-25 | Opening the workout editor marks legacy plans "Unsaved" before any edit | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 174 | CO-26 | Exercise form: 12 fields, metadata first, overwrites Arabic text | P2 | M | MEDIUM | REBUILD | Code | 03 |
| 175 | CO-27 | Inbox is a client directory; broadcast narrows its audience silently | P2 | M | MEDIUM | REDESIGN | Browser | 03 |
| 176 | CO-28 | WhatsApp support button covers content on every coach page | P2 | S | MEDIUM | MOVE | Browser | 03 |
| 177 | CO-29 | Workspace header actions wrap and have no accessible names | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 178 | CO-30 | Banners render everywhere, including full-height task screens | P2 | S | MEDIUM | MOVE | Browser | 03 |
| 179 | CO-31 | Account settings save silently and expose raw values | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 180 | CO-32 | My Plan is heavy for a single-plan product; capacity counted 3 ways in 5 places | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 181 | CO-33 | Notifications duplicate the inbox and double-badge messages | P2 | M | MEDIUM | MERGE | Browser | 03 |
| 182 | CO-34 | Adherence page duplicates Reports; dead mobile rows; "wk" means workouts | P2 | S | MEDIUM | REMOVE | Browser | 03 |
| 183 | CO-36 | "Plan" means four different things | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 184 | CO-37 | Adding a client forces a new-vs-existing choice and silently revokes invites | P2 | M | MEDIUM | MERGE | Code | 03 |
| 185 | CO-38 | Assessment review page is 2.9 screens with a separately saved note | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 186 | CO-39 | Template flows: preview without exercises, checkbox noise, Back loop | P2 | M | MEDIUM | REDESIGN | Code | 03 |
| 187 | CO-40 | "Release client" is hidden, styled as primary, and fails silently | P2 | S | MEDIUM | MOVE | Code | 03 |
| 188 | CO-41 | Editors are full of undersized and bare icon controls | P2 | S | MEDIUM | REDESIGN | Browser | 03 |
| 189 | DT-01 | Two different desktop messaging layouts; selected thread not in the URL | P2 | M | MEDIUM | REDESIGN | Browser | 04 |
| 190 | DT-04 | Desktop plan editor stacks all controls left and leaves the right pane empty | P2 | M | MEDIUM | REDESIGN | Browser | 04 |
| 191 | DT-06 | Revenue on desktop repeats KPIs and the renewal table can't act | P2 | M | MEDIUM | REDESIGN | Browser | 04 |
| 192 | DT-07 | Tablet (768–1023) gets desktop chrome around phone layouts | P2 | M | MEDIUM | REDESIGN | Code | 04 |
| 193 | DT-08 | Command palette searches only cached clients; commands mislead | P2 | M | MEDIUM | REDESIGN | Code | 04 |
| 194 | EX-08 | A new coach's library is empty and the starter action is easy to miss | P2 | S | MEDIUM | REDESIGN | Browser | 07 |
| 195 | EX-11 | Instructions render badly for clients | P2 | S | MEDIUM | REDESIGN | Code | 07 |
| 196 | EX-15 | Browsing doesn't scale to 909 exercises | P2 | M | MEDIUM | REDESIGN | Code | 07 |
| 197 | EX-16 | The whole library downloads on every open (835 KB) | P2 | M | MEDIUM | REDESIGN | Browser | 07 |
| 198 | EX-17 | Exercise images are unprocessed originals up to 10.6 MB, with no thumbnails | P2 | M | MEDIUM | REBUILD | Code | 07 |
| 199 | EX-21 | Legacy offline-video tools still ship to clients | P2 | S | MEDIUM | REMOVE | Browser | 07 |
| 200 | EX-22 | The client "Exercise library" is the plan's exercise list, not a library | P2 | S | MEDIUM | MERGE | Browser | 07 |
| 201 | FD-03 | Food data attribution is missing or wrong | P2 | S | MEDIUM | REDESIGN | Code | 08 |
| 202 | FD-07 | Starter foods are copied into each coach account and never updated | P2 | M | MEDIUM | MERGE | Browser | 08 |
| 203 | FD-09 | Food search relies on a third-party proxy with no rate limit and hides failures | P2 | S | MEDIUM | REDESIGN | Code | 08 |
| 204 | FD-10 | Quantities and units are English free text | P2 | M | MEDIUM | REDESIGN | Browser | 08 |
| 205 | JR-08 | Thumb-zone inversion: primary/destructive actions top corners, WhatsApp FAB in thumb zone | P2 | M | MEDIUM | REDESIGN | Browser | 15 |
| 206 | MD-06 | No thumbnails or image derivatives anywhere | P2 | M | MEDIUM | REBUILD | Code | 12 |
| 207 | MD-07 | Upload and playback failures are handled differently on every surface | P2 | M | MEDIUM | REDESIGN | Code | 12 |
| 208 | MD-08 | No offline caching for any CDN media | P2 | M | MEDIUM | REDESIGN | Code | 12 |
| 209 | MS-05 | No unread marker; opening a thread jumps to the bottom and marks everything read | P2 | S | MEDIUM | REBUILD | Code | 09 |
| 210 | MS-06 | Heavy thread polling (18 list requests/min) and mark-read sent twice on every tick | P2 | M | MEDIUM | REDESIGN | Browser | 09 |
| 211 | MS-07 | No offline outbox or saved draft; messages over 4,000 characters fail forever | P2 | M | MEDIUM | REBUILD | Code | 09 |
| 212 | MS-08 | Voice notes play in a bare native player; length and cross-device playback unreliable | P2 | M | MEDIUM | REBUILD | Inferred | 09 |
| 213 | MS-09 | Coach inbox closes the open conversation under the Unread filter and mislabels deleted messages | P2 | S | MEDIUM | REDESIGN | Code | 09 |
| 214 | MS-10 | Broadcast "All" means the filtered list; partial failures can't be recovered and retries duplicate | P2 | S | MEDIUM | REBUILD | Code | 09 |
| 215 | NAV-C01 | Back means different things on similar screens; the Inbox tab (a root) has a Back button; some menu pages have Back, others don't | P2 | S | MEDIUM | REDESIGN | Browser | 05 |
| 216 | NAV-C02 | Reload or cold deep link falls back to parents the user never visited (session → Train, exercise → Library, assessment → Settings); session position resets | P2 | S | MEDIUM | REDESIGN | Code | 05 |
| 217 | NAV-C05 | Hardware/browser Back doesn't match on-screen Back in sheets and wizard steps | P2 | M | MEDIUM | REDESIGN | Inferred | 05 |
| 218 | NAV-K04 | Template Save/exit push; Back returns into the editor | P2 | S | MEDIUM | REDESIGN | Code | 05 |
| 219 | NAV-K05 | Navigations that skip the unsaved-changes guard | P2 | S | MEDIUM | REDESIGN | Code | 05 |
| 220 | NAV-K06 | Hardware back: sheets and builder levels aren't history entries | P2 | M | MEDIUM | REDESIGN | Inferred | 05 |
| 221 | NAV-K09 | Back after release/delete returns to dead pages | P2 | S | MEDIUM | REDESIGN | Code | 05 |
| 222 | NAV-K11 | No primary nav item is active inside a client (bottom nav and sidebar) | P2 | S | MEDIUM | REDESIGN | Browser | 05 |
| 223 | NT-05 | One notification per chat message: double badges, toast bursts, toasts for the open thread | P2 | S | MEDIUM | REDESIGN | Code | 10 |
| 224 | NT-06 | Notification centre titles every client row with the coach's name; US dates; no grouping or error state | P2 | S | MEDIUM | REDESIGN | Browser | 10 |
| 225 | NT-07 | Three notification types open the wrong screen | P2 | S | MEDIUM | REBUILD | Code | 10 |
| 226 | NT-08 | Half the notification types are never sent; the rest are not coalesced | P2 | M | MEDIUM | REBUILD | Code | 10 |
| 227 | NT-09 | Local reminders fire late, all at once, as OS popups on the first open of the day | P2 | S | MEDIUM | REDESIGN | Code | 10 |
| 228 | NT-10 | Dismissed admin banners return on every relaunch and render on every screen | P2 | S | MEDIUM | MOVE | Code | 10 |
| 229 | NT-11 | Bell polling is duplicated, slow to update after reads, and silent on failure | P2 | M | MEDIUM | REDESIGN | Code | 10 |
| 230 | NT-13 | Emails are fire-and-forget on Vercel with no record or retry | P2 | S | MEDIUM | REDESIGN | Inferred | 10 |
| 231 | PF-06 | Duplicate pollers (client thread polled 2–3×, coach NotificationBell ×2) | P2 | S | MEDIUM | MERGE | Browser | 13 |
| 232 | PF-07 | Same data fetched under different cache keys (coachNotes ×2, coachTargets ×2, roster ×2, thread summary ×2) | P2 | S | MEDIUM | MERGE | Browser | 13 |
| 233 | PF-09 | Resume storm on every foreground (9–12 calls + 6 full store reloads + streak scan; unthrottled; content sync runs twice per launch) | P2 | M | MEDIUM | REBUILD | Browser | 13 |
| 234 | PF-13 | Batched requests wait for their slowest procedure (httpBatchLink, no streaming) | P2 | S | MEDIUM | REBUILD | Browser | 13 |
| 235 | PF-15 | Index self-checks (createIndex) run on hot request paths, up to 3–4 in sequence | P2 | S | MEDIUM | REMOVE | Code | 13 |
| 236 | PF-16 | Client sync pass is long, sequential and full-scan (≥11 round trips + 8 IDB scans every 2 min; unpaginated first pull) | P2 | M | MEDIUM | REBUILD | Browser | 13 |
| 237 | PF-18 | Precache bloat (≈49% marketing images/CSS, 2.34 MiB) and SW downloads it during first boot | P2 | S | MEDIUM | REMOVE | Code | 13 |
| 238 | PF-19 | Route changes flash a chrome-less skeleton; every page fades in over 450 ms | P2 | S | MEDIUM | REDESIGN | Code | 13 |
| 239 | PF-20 | Late banners and cards push content down on every launch (BannerHost above the shell on every route) | P2 | M | MEDIUM | REDESIGN | Browser | 13 |
| 240 | PF-22 | Polling fetches far more than it shows (full check-in history/min, 5 calls per 15 s, full templates for a count) | P2 | S | MEDIUM | REDESIGN | Browser | 13 |
| 241 | PF-23 | Client CPU/IndexedDB work grows with history (full streak rescan on every tap, 5–7 full scans at launch) | P2 | M | MEDIUM | REBUILD | Code | 13 |
| 242 | PF-24 | One serverless function carries the whole API (largest cold start for every call; region unpinned) | P2 | M | MEDIUM | REBUILD | Inferred | 13 |
| 243 | PF-25 | Media start streams full-resolution originals (up to 38 MB 1080p .MOV, no poster, no renditions) | P2 | M | MEDIUM | REBUILD | Browser | 13 |
| 244 | PWA-15 | Coach-authored data the client needs offline isn't mirrored: cardio plan, coach notes, check-ins, messages, exercise videos | P2 | M | MEDIUM | REDESIGN | Code | 11 |
| 245 | PWA-16 | Boot has no error handling: one IndexedDB or locale-chunk failure leaves the splash spinning forever | P2 | S | MEDIUM | REDESIGN | Code | 11 |
| 246 | PWA-17 | No client/API version contract: old JS talks to the new API for as long as it stays open | P2 | M | MEDIUM | REDESIGN | Code | 11 |
| 247 | PWA-18 | Coach/admin server state is memory-only: cold skeletons after every reload, stale authoritative data, offline saves that pause and vanish | P2 | M | MEDIUM | REDESIGN | Code | 11 |
| 248 | PWA-19 | Three sources of truth for the client profile, reconciled by last-write-wins in two places | P2 | M | MEDIUM | MERGE | Code | 11 |
| 249 | PWA-20 | The PWA and offline behaviour was certified without testing it | P2 | S | MEDIUM | REBUILD | Code | 11 |
| 250 | RTL-06 | Units and macro letters are untranslated; bidi order breaks | P2 | S | MEDIUM | REBUILD | Browser | 14 |
| 251 | RTL-07 | Raw keys, missing taxonomy labels, one-character-per-line wrapping | P2 | S | MEDIUM | REBUILD | Browser | 14 |
| 252 | RTL-08 | Direction-sensitive icons aren't mirrored | P2 | S | MEDIUM | REDESIGN | Code | 14 |
| 253 | RTL-09 | English accessible names and broken bidi punctuation in the Arabic UI | P2 | S | MEDIUM | REDESIGN | Browser | 14 |
| 254 | TB-02 | Renewal rows can't act | P2 | S | MEDIUM | REDESIGN | Browser | 04 |
| 255 | TB-03 | Nutrition planned-vs-target table scrolls sideways on phones | P2 | S | MEDIUM | REDESIGN | Browser | 04 |
| 256 | TB-04 | Library tables use placeholder copy as headers and put bulk controls on every row | P2 | M | MEDIUM | REDESIGN | Browser | 04 |
| 257 | TB-08 | Shared DataTable lacks sorting, column priority and a row-action slot | P2 | M | MEDIUM | REDESIGN | Code | 04 |
| 258 | TS-01 | The toast stack covers the top of the phone screen and blocks taps | P2 | S | MEDIUM | REDESIGN | Browser | 10 |
| 259 | TS-02 | Errors never use toasts; 44 blocking-modal error paths show raw server text | P2 | M | MEDIUM | REDESIGN | Code | 10 |
| 260 | TS-03 | Two success toasts say untrue things (photo "Saved" when the upload failed; "Reminders sent") | P2 | S | MEDIUM | REDESIGN | Code | 10 |
| 261 | TS-04 | A failed template sync is reported only by a 5-second toast with a hidden Retry | P2 | S | MEDIUM | REDESIGN | Code | 10 |
| 262 | VS-02 | Keyboard focus squares off every pill and round control | P2 | S | MEDIUM | REDESIGN | Code | 06 |
| 263 | VS-03 | Dead styling: undefined classes, unused primitives, an out-of-date DS doc | P2 | S | MEDIUM | REMOVE | Code | 06 |
| 264 | VS-07 | The icon set is too small, so icons carry the wrong meaning | P2 | M | MEDIUM | REBUILD | Code | 06 |
| 265 | VS-09 | The "Release client" confirmation renders as an orange primary button | P2 | S | MEDIUM | REBUILD | Code | 06 |
| 266 | VS-12 | Floating chrome collides with content | P2 | S | MEDIUM | MOVE | Browser | 06 |
| 267 | VS-14 | Four tab systems, and rails that overflow | P2 | M | MEDIUM | MERGE | Browser | 06 |
| 268 | VS-15 | Controls used for the wrong job | P2 | M | MEDIUM | REBUILD | Browser | 06 |
| 269 | VS-16 | Loading, empty and error states each rendered 4–6 ways | P2 | M | MEDIUM | REBUILD | Code | 06 |
| 270 | VS-17 | Charts and progress: off-token colours, tiny labels, colour that contradicts the goal | P2 | M | MEDIUM | REDESIGN | Browser | 06 |
| 271 | VS-18 | Sync status shown twice, in two colour schemes, and optimistically | P2 | S | MEDIUM | MERGE | Browser | 06 |
| 272 | AX-10 | Progress rings, bars and the donut have no accessible value | P2 | S | LOW | REDESIGN | Code | 14 |
| 273 | CO-35 | Reports on a phone: aggregate exports and a duplicate ranking | P2 | S | LOW | MOVE | Browser | 03 |
| 274 | MD-09 | Media URL fields accept any string | P2 | S | LOW | REDESIGN | Code | 12 |
| 275 | NAV-K07 | Thread ↔ client ping-pong inflates history | P2 | S | LOW | REDESIGN | Code | 05 |
| 276 | PF-08 | markRead sent twice on every poll tick while an incoming message looks unseen | P2 | S | LOW | REBUILD | Code | 13 |
| 277 | DT-11 | Desktop lists are one-line rows stretched across ~1,100 px | P3 | M | MEDIUM | REDESIGN | Browser | 04 |
| 278 | MS-13 | Attachments shift layout, open files outside the app, Android Back leaves the image viewer open | P3 | S | MEDIUM | REDESIGN | Code | 09 |
| 279 | AX-11 | Heading structure | P3 | S | LOW | REDESIGN | Browser | 14 |
| 280 | AX-12 | Reduced motion only partly honoured | P3 | S | LOW | REDESIGN | Code | 14 |
| 281 | CD-06 | Big boxes with little in them | P3 | S | LOW | REDESIGN | Browser | 06 |
| 282 | CL-06 | Loading a lazy route removes the whole shell | P3 | S | LOW | REDESIGN | Code | 02 |
| 283 | CL-12 | "Start empty workout" opens the Routines list | P3 | S | LOW | REMOVE | Code | 02 |
| 284 | CL-15 | "Training guide" is one coach's spreadsheet, shown to everyone | P3 | S | LOW | REMOVE | Code | 02 |
| 285 | CL-16 | After finishing, Train's top primary button is "EDIT · <day>" | P3 | S | LOW | REDESIGN | Code | 02 |
| 286 | CL-25 | Exercise detail: read-only values look like inputs; empty affordances | P3 | S | LOW | REDESIGN | Browser | 02 |
| 287 | CL-27 | Fuel hierarchy: date above the title, cards inside cards | P3 | S | LOW | REDESIGN | Browser | 02 |
| 288 | CL-28 | The food editor accepts anything | P3 | S | LOW | REDESIGN | Code | 02 |
| 289 | CL-31 | Cardio stays writable when the subscription is read-only | P3 | S | LOW | REDESIGN | Code | 02 |
| 290 | CL-35 | Photo dates and the delete target | P3 | S | LOW | REDESIGN | Code | 02 |
| 291 | CL-37 | History: "1 workouts", tonnage headline, English weekday header | P3 | S | LOW | REDESIGN | Browser | 02 |
| 292 | CL-43 | Check-ins are hard to find and their states mislead | P3 | S | LOW | MOVE | Code | 02 |
| 293 | CL-50 | /workout/session without a session is a dead end | P3 | S | LOW | REDESIGN | Browser | 02 |
| 294 | CO-42 | Polish: eyebrows, date formats, RTL chevrons, hard-coded units | P3 | S | LOW | REDESIGN | Browser | 03 |
| 295 | DT-09 | Coach top bar shows the client sync engine's "Synced" state | P3 | S | LOW | REMOVE | Browser | 04 |
| 296 | DT-10 | WhatsApp FAB overlaps table cells and buttons on desktop | P3 | S | LOW | MOVE | Browser | 04 |
| 297 | DT-12 | Two notification pollers run on desktop | P3 | S | LOW | REDESIGN | Browser | 04 |
| 298 | DT-13 | Client app on desktop is an undocumented phone column | P3 | S | LOW | KEEP | Browser | 04 |
| 299 | EX-23 | Copy promises "many with video" | P3 | S | LOW | REDESIGN | Code | 07 |
| 300 | EX-24 | Variants and duplicates aren't grouped | P3 | S | LOW | MERGE | Code | 07 |
| 301 | FD-08 | Starter seed hygiene: duplicates, supplements stored as foods, ungrouped foods, dead copy | P3 | S | LOW | MERGE | Code | 08 |
| 302 | FD-11 | Calories follow two different rules, and provenance is dropped | P3 | S | LOW | REDESIGN | Code | 08 |
| 303 | MD-10 | Message images can be mislabelled, and HEIC isn't handled | P3 | S | LOW | REDESIGN | Code | 12 |
| 304 | MD-11 | Uploads are staged as binary chunks in MongoDB | P3 | M | LOW | REDESIGN | Code | 12 |
| 305 | MS-11 | "Sent / Seen" repeated on every own bubble; no delivered state; seen lags up to 20s | P3 | S | LOW | REDESIGN | Browser | 09 |
| 306 | MS-12 | Desktop shows a "⋮" on every bubble; action menu lacks menu semantics | P3 | S | LOW | REDESIGN | Code | 09 |
| 307 | MS-14 | Back from a thread opened via the desktop tab rail can skip the client workspace | P3 | S | LOW | REDESIGN | Code | 09 |
| 308 | MS-15 | Small engine glitches: ordering, retry re-upload, cleanup, edit-window wording, copy feedback | P3 | S | LOW | KEEP | Code | 09 |
| 309 | MS-16 | Composer and copy details (no accessible label, chevron send icon, no "Yesterday", missing plural) | P3 | S | LOW | REDESIGN | Code | 09 |
| 310 | MS-17 | Suspended accounts can still send messages through the API | P3 | S | LOW | KEEP | Code | 09 |
| 311 | NAV-C06 | Back restores the URL but not the scroll position (ScrollToTop on every path change) | P3 | S | LOW | REDESIGN | Code | 05 |
| 312 | NAV-C07 | Orphan, duplicate and legacy routes (/workout/routine/:dayId, /progress/photos, /settings/app, /settings/videos, /settings/import, /coach-notes) | P3 | S | LOW | REMOVE | Code | 05 |
| 313 | NAV-K08 | Back from a workspace sub-tab returns to Clients, not the client | P3 | S | LOW | KEEP | Browser | 05 |
| 314 | NAV-K10 | Version history: wrong cold-start fallback, outside the workspace | P3 | S | LOW | MOVE | Code | 05 |
| 315 | NT-14 | Super-admin bell items can never be read; plain-admin bell always empty | P3 | S | LOW | REDESIGN | Code | 10 |
| 316 | NT-15 | A failed notification write fails an action that already succeeded | P3 | S | LOW | KEEP | Code | 10 |
| 317 | NT-16 | Notifications are never purged; only the newest 50 can be seen | P3 | S | LOW | REDESIGN | Code | 10 |
| 318 | PF-26 | Timer-driven re-renders (session page 1×/s, rest timer bar 4×/s, whole app on resume) | P3 | S | LOW | REDESIGN | Code | 13 |
| 319 | PF-27 | Service-worker update check every 60 s (sw.js + workbox, no-store) | P3 | S | LOW | REDESIGN | Code | 13 |
| 320 | PF-28 | Images load far larger than they display (1600 px photo thumbnails, 512 px avatars, oversized Splash logo) | P3 | S | LOW | REDESIGN | Code | 13 |
| 321 | PF-29 | Food search depends on a slow external API and can show out-of-order results | P3 | S | LOW | REDESIGN | Code | 13 |
| 322 | PF-30 | Dead weight shipped (seeds and Capacitor in entry, legacy landing, 131 MB exercise_videos, unused assets) | P3 | S | LOW | REMOVE | Code | 13 |
| 323 | PF-31 | Reconnect forces a full sync but does not refresh coach content | P3 | S | LOW | REDESIGN | Code | 13 |
| 324 | PWA-21 | Cache configuration hygiene | P3 | S | LOW | REDESIGN | Code | 11 |
| 325 | PWA-22 | Device-level keys aren't user-scoped | P3 | S | LOW | REDESIGN | Code | 11 |
| 326 | PWA-23 | Manifest polish: maskable icon is a copy of the regular icon; role-specific shortcuts shown to everyone; portrait lock; marketing screenshots | P3 | S | LOW | REDESIGN | Code | 11 |
| 327 | RTL-11 | Physical CSS leftovers | P3 | S | LOW | REDESIGN | Code | 14 |
| 328 | RTL-12 | Stale and developer-facing copy in the translations | P3 | S | LOW | REMOVE | Code | 14 |
| 329 | TB-05 | Measurement compare grid is hard-coded and defaults to the oldest entry | P3 | S | LOW | KEEP | Code | 04 |
| 330 | TB-06 | Packages list puts two text buttons on every row | P3 | S | LOW | REDESIGN | Code | 04 |
| 331 | TB-07 | Lists use four different paging patterns | P3 | S | LOW | REDESIGN | Code | 04 |
| 332 | TS-05 | Success toasts for results already on screen; three coach editors confirm twice | P3 | S | LOW | REDESIGN | Code | 10 |
| 333 | TS-06 | Toast titles are button labels; one toast asks a question | P3 | S | LOW | REDESIGN | Code | 10 |
