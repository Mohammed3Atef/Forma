# 00 — Executive summary · Forma Product Experience Rebuild · Phase A

> **Discovery only.** No product code, data, service worker, cache, notification or navigation behaviour was changed.
>
> | | |
> |---|---|
> | **Dates** | 2026-10-04 / 05 |
> | **Repo** | HEAD `e7663ab` (`development`). Production runs RC2 `cf3a5d9` (per the release notes, not re-verified). |
> | **Scope** | The authenticated **Client** and **Coach** apps. The approved public website, login, contact and legal pages were not audited. |
> | **Documents** | 19 audit documents in this folder, `../FORMA_PRODUCT_REMOVAL_CANDIDATES.md`, and 46 evidence screenshots in `evidence/`. |
> | **Master index** | `18_PRIORITIZED_FINDINGS.md`. The decision map is at the end of this document. |

## Bottom line

1. **Forma is feature-rich and structurally unfinished.** Functionality ≈ 7/10; premium feel ≈ **4/10**.
   - The gap isn't polish. It is information architecture, trustworthy states, mobile ergonomics and a missing visual identity.
   - Fixing it means **removing and merging** far more than adding.
2. **16 P0 issues** (after de-duplication) must be dealt with before a public launch. About two-thirds are small fixes.
   - The worst: the installed client app **signs out or crashes when the network drops** (the gym use case).
   - A coach can **wipe a client's plan** after one failed load.
   - **"Private" coach notes are shown to clients.**
   - **Any coach can look up other coaches' clients' contact details.**
   - **Body photos sit on public, permanent URLs**, and deleted media is never deleted.
   - **Production uploads currently fail.**
3. **The client app needs one navigation system and a Today that is an action surface, not a report.**
   - Today there are three navigation systems, a 2.8-screen home that shows the date four times, and a hidden "selected day" that notifications can silently change.
4. **The coach app needs a triage home and a single client model.**
   - Today 9/10 clients read "Needs attention", every status chip says "ACTIVE", and one client spans ~21 URLs across 3 layouts.
5. **Exercise videos "don't play" for four reasons.**
   - 95% of exercises have no video but show a video button.
   - 76% of the real videos are HEVC that many browsers can't decode.
   - The player has no error state.
   - Coaches can paste links (Drive/Vimeo/Instagram) that can never play.
6. **Notification replay is a bell-baseline bug plus a missing lifecycle.**
   - Every app open toasts the newest 4 unread items.
   - Nothing ever resolves them.
7. **The PWA serves the old build for a whole session after every deploy.**
   - The new build arrives later, by a silent reload when the app is backgrounded.
   - Nothing tells the user an update exists.
8. **Offline data mostly survives on the device, but the identity layer and account switching undo it.**
   - Silent loss is possible on shared devices, across devices, and for live timers.

## How this audit was done

- **Code.** Eight parallel code audits:
  - client app
  - coach app
  - PWA/cache/offline/sync
  - notifications/toasts/messenger
  - exercise/food libraries and media
  - dead code and removal
  - visual system/accessibility/RTL
  - performance/network

  Every finding carries `file:line` evidence.
- **Browser.** Real browser runs against an **isolated stack**: in-memory MongoDB, a local Bunny stand-in, email off.
  - Seeded with a realistic coach ("Karim Mansour") and 10 clients in every subscription state: active, renewal due, frozen, expired, trial, cancelled, pending, no assessment.
  - Plans built from real wger exercises, including `.MOV` videos, a Bunny-hosted mp4 and a YouTube link.
  - 8 weeks of synced history, messages, check-ins and 26 notifications.
- **Route tours.** Every client and coach route at 360/375/390/430/1440 in EN and ar-eg: 150+ screens with touch-target, tiny-text, overflow and nesting probes.
- **Journeys.** The 10 human journeys in 15.
- **PWA, offline and update tests.** Run on a **production build** with a working service worker, `vercel.json` headers, and a simulated deploy.
- **Video.** Playback tested in real Google Chrome 153, plus Edge 154 and Firefox, for codec coverage.
- **Performance.** Measured with CDP throttling (Slow 4G, 3G). Server timings are local; production adds Vercel cold starts and Atlas latency.
- **External contact.** Only wger.de, for read-only media checks. **Nothing touched production.**

**Finding labels.** 173 findings are BROWSER-VERIFIED and 151 CODE-CONFIRMED. 9 are INFERRED and need a real iPhone or Android device, or production:
- iOS standalone update timing;
- Android hardware back;
- HEVC playback on phones;
- the Bunny 401;
- a two-device sync conflict;
- the token-refresh race.

---

## The 25 questions

### 1. Why Forma does not feel premium

1. **No single map.** The client has tabs + a menu that repeats them + a bell + hidden doors. The coach has 4 tabs + 13 menu items + a sidebar + ⌘K. Most destinations have 2–3 names (05).
2. **Screens are reports, not tools.** Client Today is 2.8 screens showing the date 4 times (BV-16). The coach dashboard has 22 cards; Revenue has 17. Neither says "do this next" (JR-02, CD-01).
3. **States don't tell the truth.**
   - "Synced" while changes are pending.
   - "Logged" for an empty set.
   - "Waiting for your coach" during a slow load.
   - Errors rendered as "nothing here".
   - Four stale toasts at every open (BV-01).
4. **Everything is a box, and orange means everything.** 10–19 bordered, shadowed surfaces per screen; 13 radii; 21 font sizes; text down to 8 px. Client and coach look like two products, and neither speaks the approved website's language (06, VS-19/20).
5. **Mobile is desktop folded.** The coach editors are desktop forms (a 4.3-screen nutrition editor). Primary and destructive actions sit in the top corners. About 40% of phone controls are under 44 px (AX-01, JR-08).
6. **Arabic is a translation, not a design.** English dates for ar-eg users, broken Arabic letter-joining in mono labels, Arabic digits rejected, and English food and exercise names (14).
7. **Media is thin and fragile.** Almost no exercise media, no food images, broken video for many browsers (07, 08, 12).

### 2. The 10 biggest client problems

| # | ID | Problem | P | Action |
|---|---|---|---|---|
| 1 | PWA-01 | Offline or any network failure signs the client out; the installed app crashes on an offline reopen (HEAD) or shows a login (RC2) | P0 | REDESIGN (identity layer) |
| 2 | CL-44 | "Reset all data" wipes the coach-visible server history with one confirm | P0 | REMOVE |
| 3 | CL-04 / NT-02 | A hidden global "selected day" silently dates new logs; a notification moved it to Sept 25 on app open (BV-02) | P1 | REBUILD |
| 4 | CL-17 / JR-01 | ✓ on a row showing last time's numbers saves an **empty** set, then "Strong session. Logged." (browser-verified) | P1 | REDESIGN |
| 5 | CL-42 / JR-05 | Check-in: Continue is below the fold; answers are lost on exit; defaults are fabricated; weight is pre-filled 0 | P1 | REDESIGN |
| 6 | CL-09 / CL-10 | Today: 2.8 screens of duplicates; it still says "Start workout" after training | P1 | REBUILD |
| 7 | CL-13 / CL-14 | Plan rows lead nowhere. The real day view is an orphan, so coach notes, images and sections never reach the session | P1 | MERGE |
| 8 | CL-01 | Three navigation systems; most screens light no tab | P1 | REBUILD |
| 9 | CL-38 / NT-01 | The coach relationship is spread over 7 surfaces; one message = badge + bell + toast; old notifications replay at every open | P1 | MERGE / REBUILD |
| 10 | EX-01 / EX-03 | The video button is dead for 95% of exercises; the player fails silently | P1 | REDESIGN |

Next in line: CL-41 (first run is four gates, then zeros), CL-45 (legacy tools in Settings), CL-34 (progress photos silently never reach the coach).

### 3. The 10 biggest coach problems

| # | ID | Problem | P | Action |
|---|---|---|---|---|
| 1 | CO-01 | A failed plan read → empty editor → Save **replaces the client's real plan**; 0 versions (BV-11) | P0 | REDESIGN |
| 2 | CO-02 / CO-21 | "Notes for yourself" and workspace notes are shown to the client (BV-12) | P0 | REDESIGN |
| 3 | CO-03 | One-letter search returns other coaches' clients with email, phone and internal fields (BV-13) | P0 | REDESIGN |
| 4 | CO-04 / MS-01 | The composer is hidden under the bottom nav whenever a plan banner shows (BV-14) | P0 | REDESIGN |
| 5 | CO-05 / JR-02 | No triage surface: 9/10 "Needs attention", the wrong status chip, the review queue two levels deep | P1 | REBUILD |
| 6 | CO-08 | One client = 11 tabs + More (off-screen) + a 6-chip "view as client" layout + versions page (~21 URLs) | P1 | REBUILD |
| 7 | CO-10 / CO-11 / JR-07 | 10 taps and 3 back buttons to add one exercise; plain Save keeps no version | P1 | REBUILD |
| 8 | CO-14 / CO-15 / JR-03 | 7 competing subscription actions; a "free" renewal pre-fill; renewals overwrite history; lapsed clients never named | P1 | REDESIGN |
| 9 | EX-07 / EX-14 / JR-06 | Frozen per-coach library copies (835 KB); no media or preview while picking; empty until "Load starter library" | P1 | REBUILD |
| 10 | CO-18 / CO-09 | States lie (errors look empty, loads never end); the Overview's headline metric is wrong (BV-22) | P1 | REDESIGN / REBUILD |

### 4. The biggest mobile problems

| Problem | Evidence | Findings |
|---|---|---|
| Primary actions hidden by chrome: the check-in CTA is under the nav; the coach composer is under the nav | BV-15, BV-14 | — |
| Chrome stack eats the first screen: brand bar + day navigator + banners + date rows before content | — | CL-03, VS-11 |
| Thumb-zone inversion: Finish, Save plan, Back and the bell in top corners; the WhatsApp FAB in the thumb zone covering content | — | JR-08 |
| ~40% of controls under 44 px; gym-critical controls are the smallest (32 px exercise stepper, 36 px rest timer); 9.5 px nav labels | — | AX-01 |
| Desktop editors on phones: 4.3-screen nutrition editor, 3 back buttons, mandatory sections | — | CO-10, CO-12 |
| Horizontal tab rails overflow ("More" off-screen; Library chips clipped); tables scroll sideways | — | VS-14, TB-03 |
| Wizards and threads keep the global tab bar; the thread leaves ~490 px for messages | — | MS-03 |

### 5. What should be removed

The full map is in `../FORMA_PRODUCT_REMOVAL_CANDIDATES.md`: 88 candidates — 24 safe, 54 product decisions, 4 keep, 6 unknown.

- **Client:**
  - "Reset all data" / "Clear this day" (RM-56).
  - Video manager, Import data, the local video store and **131 MB of mp4s** shipped on every deploy (RM-57).
  - "Update the app".
  - Sync cards and badges.
  - Local reminders titled "Gym Tracker".
  - The "Exercise library" destination (RM-23).
  - The static training guide.
  - Home stat tiles and tonnage headlines (RM-44).
  - "Start empty workout".
  - The ☰ menu and the center FAB-as-link (RM-34).
- **Coach:**
  - Dashboard and its 4 tabs (RM-17/41).
  - The Adherence page (RM-18).
  - The Assessments list and Check-ins overview as pages (RM-19).
  - Reports as a destination.
  - The `/coach/client/:id/activity` orphan.
  - The template preview step.
  - The "Get started" checklist once complete.
  - Vanity counters on Overview.
  - The client sync engine and tracker stores running for coach/admin (RM-81).
  - Features that promise what doesn't exist: swap review, step/cardio targets, nutrition templates, broadcast shortcuts (CO-19, RM-67).
- **Platform:**
  - Local-only-mode branches (`cloudAvailable()` is always true).
  - ~35 Firestore-era stubs.
  - The no-op trial reminder chain.
  - Unused primitives and classes.
  - Dead runtime-cache rules.
  - 614 KB of marketing images in every install precache (RM-72).
  - The old `/landing-v1` and three.js experience (product decision).
  - The old production-targeting `e2e/` suite (RM-14).

### 6. What should be merged

| Merge | Into |
|---|---|
| Inbox + Notifications + Coach-notes page + Home coach cards + Check-ins + Assessment (client) | **Coach** |
| Progress + History + Measurements + Photos + check-in body data | **Progress** (Body / Strength / Consistency) |
| Settings + Subscription (×3) | **You** |
| Workspace + view-as-client + versions + legacy route (coach) | **one client with 4 sections** |
| Dashboard + Check-ins overview + Assessments + Adherence + coach notifications | **Today** |
| Templates + Library | **Library › Programs** |
| 4 KPI tiles, 4 headers, 4 tab systems, 4 status chips | one each |
| Messages + broadcast; Notes | **Messages (to the client)** and **Private notes** |

### 7. What should be moved

| What | Moves to |
|---|---|
| Cardio | Train (plan + timer) and Today (quick-log) |
| Assessment | Coach |
| Revenue, Reports, Client Plans ("Packages"), My Plan ("Forma subscription"), Account | Behind the coach avatar (Me) |
| Renewals that need action | Today |
| Help / WhatsApp | Me › Help |
| Check-in review | Today queue + Client › Summary |
| Release / Transfer | Client header overflow |
| Login form | Out of the website chunk into the precached app (PF-03) |

### 8. What needs complete rebuilding

| Area | What changes | Findings |
|---|---|---|
| Identity/session layer + client sync contract | Offline identity, per-user storage, outbox with operation IDs, versioned writes | PWA-01..06, PWA-12/13 |
| Client navigation + Today | — | CL-01, CL-09 |
| Coach home (triage) + client model (4 sections) | — | CO-05, CO-08 |
| Coach plan editors | Never edit an unloaded plan, automatic versions, full-screen mobile flows | CO-01, CO-10..12 |
| Notification lifecycle | — | NT-01..04 |
| Exercise catalog | Global curated catalog, quality tiers, re-encoded self-hosted media | EX-02, EX-07 |
| Media pipeline | Private zone + signed URLs, deletion, transcoding/posters | MD-02/03/05 |
| Visual system | One shell, one set of primitives, website brand anchors | 06, 17 |

### 9. Visually weak but functionally sound (keep the engine, redesign the surface)

| Area | What works underneath |
|---|---|
| Workout session engine | Persisted sessions survive reloads (BV-06c), set logging, rest timer with haptics, wake lock |
| Local-first logging | Workouts, meals, water, cardio, measurements; an offline workout synced 1.4 s after reconnecting (BV-05) |
| Messenger send engine | Idempotent `clientMsgId`, retry, edit/delete window, reactions, voice, load-older |
| Coach check-in review queue | `CoachCheckInsOverview`'s sequential review is the best mechanic in the coach app; it's only buried |
| Shared primitives | Sheet and dialog primitives with real accessibility |
| Nutrition | Coach-controlled food-substitution policy, meal ticking, water quick-add |
| Settings | Autosave with honest Saving / Saved / Couldn't-save states |
| Subscription gate | Fails open on read errors |
| Coach thread navigation | Back from the header 💬 / Overview card / tab entry returns to the client (BV-34) |
| Charts | Screen-reader lists |

### 10. Functionally dangerous

The 16 P0 issues (full table in 18 §3):

1. Network failure = signed out / crash (PWA-01).
2. Plan wipe after a failed load (CO-01).
3. Private notes published to clients (CO-02).
4. Cross-coach client search with contact data (CO-03).
5. Personal media on public permanent URLs (MD-02).
6. Deletes that don't delete (MD-03).
7. Production uploads failing while the UI says "Saved" (MD-01, TS-03).
8. "Reset all data" erasing coach-visible history (CL-44).
9. Account switch destroying unsynced data (PWA-02).
10. A previous user's deletions applied to the next user (PWA-03).
11. Sync cursors leaking across accounts, leading to overwrites (PWA-05).
12. Coach sessions running the client sync engine (PWA-04).
13. Cross-device last-write-wins overwrites (PWA-06).
14. Live cardio/rest timers lost on reload (PWA-07).
15. Offline sign-out that doesn't sign out (PWA-08).
16. The coach composer hidden under the nav (CO-04).

Also dangerous though rated P1: empty sets saved as "Logged" (JR-01), wrong-day logging (NT-02/CL-04), renewals overwriting subscription history (CO-15), and the token-refresh race that can sign users out after more than 15 minutes in the background (PF-10, needs a device check).

### 11. Why exercise videos are not displaying

The data path is intact: the library `videoUrl` reaches the client's plan unchanged (07 §12). Videos fail for these reasons, ranked:

1. **There is usually nothing to play** (EX-01, CL-20).
   - 863 of 909 starter exercises (95%) have no video, but every exercise shows a video button.
   - On those, the button falls back to a legacy local video store that is never filled for platform users, so the tap does **nothing** (BV-07).
   - Coaches who loaded the starter library before 2026-09-21 have the old 91-exercise set with **0 videos** (EX-07).
2. **The codec** (EX-02).
   - 35 of the 46 real videos are **HEVC QuickTime `.MOV`** files hotlinked from wger.de: ~22 Mbps, 13–88 MB, index at the end of the file.
   - Edge and Chromium without hardware HEVC show a black frame with no error; Firefox throws a decode error. Chrome with hardware HEVC plays them; this audit's PC did.
   - Even the H.264 ones are heavy: Romanian Deadlift is 38 MB at 1080p.
3. **No failure state** (EX-03). The client player is a bare `<video>` with no error, poster or fallback, so every failure looks like a frozen 0:00.
4. **Unplayable links accepted** (EX-04, BV-07). The coach's video field is free text and only YouTube is embedded. Google Drive, Vimeo and Instagram links give a dead player with `MEDIA_ELEMENT_ERROR: Format error`.
5. **Fixes can't propagate** (EX-05, EX-06, EX-07).
   - Each coach has a frozen copy of the starter library.
   - Assigned plans are snapshots.
   - The exercise form silently unlinks exercises from the library.
6. **Coach uploads** (MD-01, MD-05). They fail in production today (Bunny 401). When they work, iPhone HEVC files are stored as recorded, with no transcoding, which recreates cause 2.

### 12. What should happen to exercises without useful media

Don't delete them. Gate them (07 §13, computed per record):

| Tier | Rule | Count | Treatment |
|---|---|---:|---|
| **PUBLISHED** | Good name, muscle, instructions ≥ 40 chars, usable media, consistent category, not a duplicate | **244** | The default coach view; full media for clients |
| **LIMITED** | Good name + muscle + (instructions OR media) | **625** | Searchable, usable in plans, with a quiet "no demo yet" marker. **No video button unless playable media exists.** |
| **HIDDEN-INCOMPLETE** | Duplicate, bad/foreign name, or neither instructions nor media | **40** | Hidden from search by default; a coach can open, complete or unhide. About 8 need only a rename |

Under a strict "video that plays everywhere" policy, only **9** exercises qualify today.

**Phase B direction:**
- A **shared, curated catalog**, replacing per-coach copies, starting with the ~150 most-used movements.
- Owned instructions, Arabic names and text.
- **H.264 720p faststart** demos with posters, self-hosted on Bunny, with per-item attribution (wger media licences vary).
- Clients see the same images and videos the coach sees.

### 13. How Food Library images should work

Every food always has an image (08 §11). Resolve in this order:

| Order | Source | What it covers | Licence |
|---|---|---|---|
| 1 | **Self-hosted** | Curated catalog foods and coach photos, on Bunny as square WebP at 128/256/512, immutable caching | Owned, CC0 or public-domain images; CC BY/BY-SA only with a stored credit |
| 2 | **Cached** | Branded barcode products that a coach saves | Open Food Facts photos (CC BY-SA, per-image author), re-hosted with attribution, used only for that product |
| 3 | **Source hotlink** | Search previews only | Never stored on a plan item |
| 4 | **Fallback** | 100% coverage on day one, offline, zero network | Bundled category illustrations in Forma's style + a monogram from the localised (Arabic-aware) name |

- **Ship the fallback first.**
- USDA FoodData Central (public domain, no images) is the right base for generic foods. It replaces the current wger/Open Food Facts proxy, which returns 14 identical "chicken" rows (FD-02).
- **No scraping.** Commercial API images generally can't be re-hosted.

### 14. Why notification replay happens

The root cause is confirmed in code and was reproduced in the browser (BV-01; 10 §2):

1. **The baseline is taken from an empty list.** The bell records its "already seen" baseline on the first render, before any data has loaded (`NotificationBell.tsx:64-69`, `useNotifications.ts:56`). The first poll therefore treats every unread item in the newest 50 as new and toasts it.
2. **"Already toasted" lives only in memory** (`toastStore.ts:45-66`). Every launch, PWA reopen, iOS eviction and deploy reload replays the newest **4** unread items as a stack covering the top ~400 px for 5 seconds.
3. **The unread set never shrinks.**
   - Items are marked seen only by tapping that exact toast or row.
   - Auto-dismiss, ✕ and opening the feed don't mark anything.
   - No UI calls mark-all.
   - **Completing the task never resolves its notification:** a submitted check-in leaves "check-in requested" unread forever (BV-33).
4. **Creating the toast has side effects.** Building it runs the deep link, which **changes the client's selected day** (`NotificationBell.tsx:76`, `noteTarget.ts:36`), so later logs go to the wrong date (BV-02).

There is **no browser/PWA push at all** (no PushManager, VAPID or push handler), so this is not push re-delivery. Unread state alone generates the replay.

**Proposed lifecycle:**
- created, deduplicated per subject (thread, check-in week) →
- delivered, recorded per channel (in-app, push, email) with `deliveredAt`; toast only items newer than a persisted per-user high-water mark, created in the last ~10 minutes, with no side effects until tapped →
- seen (feed opened) →
- read (item opened) →
- **resolved by the server when the task is done** →
- expired (TTL, e.g. 90 days).

### 15. Why stale cache and update behaviour happens

Browser-verified on a production build (BV-06; 11 §25):

1. **The first open after a deploy shows the old build.** The service worker answers every navigation from its precached `index.html`. The `no-store` header on HTML no longer matters once the SW controls the page.
2. **The update is found late.** It is found only *after* the page loads (an update check on launch/visible and every 60 s). It downloads and then **waits** (`skipWaiting:false`).
3. **Activation waits until the app is hidden** (`main.tsx:17-34`). The check runs on "visible" and activation on "hidden", so **users run the old build for the whole session** (tested 73 s, including the 60 s poll) and get the new one by a silent reload after the next backgrounding.
4. **Refreshing doesn't help.** A waiting SW never activates while the page is open.
5. **There is no "update available" message.** The only manual path is the client-only Settings → "Update the app", which deletes every cache.
6. **A first-visit tab can run mixed versions.** A tab that wasn't SW-controlled when it loaded gets the new SW **without a reload**, because vite-plugin-pwa reloads only when `isUpdate` (BV-06d). Old JS then runs under the new SW, and the next lazy route would 404 after a real deploy.
7. **No client/API version contract** (PWA-17). Old JS keeps calling the new API for as long as it stays open.

**What works:** hashed `/assets/*` are immutable; HTML is no-store; a reload mid-workout preserved the session (BV-06c).

### 16. Current offline capability

The full matrix is in 11 §22.

- **Works while the session survives:**
  - viewing today's workout and plans;
  - logging sets, meals, water, cardio, weight and measurements;
  - finishing a workout (synced ~1.4 s after the next online boot, BV-05);
  - progress photos (stored locally, uploaded later).
- **But the session doesn't survive.** The first offline resume or cold start ends it: a crash in HEAD, a login screen in RC2 (BV-03/04). For a gym product, offline is therefore **effectively unusable today.**
- **Fails while offline:**
  - check-ins ("not found");
  - sending, reading or attaching messages and voice notes;
  - exercise video (black player);
  - the coach editors, which **fail destructively** (CO-01).
- **Online-only by design (correct):** subscription, payment and admin actions.

### 17. Where offline data can currently be lost

- **Account switch on a device.**
  - The previous user's unsynced logs are wiped (PWA-02).
  - Their pending deletions run against the next user (PWA-03).
  - Stale cursors make new writes overwrite server history (PWA-05).
  - A coach or admin signing in captures a client's queued data (PWA-04).
- **Live timers.** The cardio timer, the rest timer and the last ~300 ms of edits are lost on reload, OS kill or the update reload (PWA-07).
- **Two devices logging the same day** overwrite each other silently: whole-day documents with device-clock last-write-wins (PWA-06).
- **Messages, voice notes and check-in answers** have no outbox or draft and are lost on navigation or reload (PWA-12, MS-07, NAV-C04).
- **Signing out offline** leaves the refresh cookie valid; the previous user is silently restored on the next online moment (PWA-08, a shared-device privacy issue).
- **"Reset all data"** deletes the server copy that the coach reads (CL-44).
- **Media.** Progress photos and attachments currently never reach the server in production (Bunny 401), behind a "Saved" toast (MD-01, TS-03).

### 18. What the future offline architecture should support

**Identity**
- Keep the last verified identity on the device.
- End the session only on an explicit 401 or revocation, never on a network error or 5xx.
- Single-flight token refresh with a server grace window.
- Request timeouts.
- Boot from local data before any network call.

**Storage**
- One IndexedDB per user (`forma-<uid>`) plus a device registry.
- Never delete a database with pending changes.
- Sign-out runs a final sync, or warns.
- The client sync engine never runs for coach/admin.

**Outbox**
- Every write and its operation (with a client-generated op ID) commit in one IndexedDB transaction.
- The server applies operations idempotently with version checks and per-operation acknowledgements.
- Finer-grained records instead of whole-day documents.
- Paginated pulls with backoff.
- Messages, voice notes, photos and check-ins all go through the same outbox.

**Reads**
- The active plan, coach notes, the cardio plan and the last N messages are available offline.
- The coach's query cache is persisted per user, with "as of" times.
- Authoritative data (subscription, capacity, payments) is shown with freshness, and actions stay disabled until it is fresh.

**Sync status** (one quiet global indicator, never toasts)
- Saved · Saved on device · Waiting to sync · Syncing · Sync failed (with a fix path) · Synced.

**Updates**
- Detect → download → wait for a safe point → activate → reload.
- Safe points: app start (activate on the splash), an idle route change, or a "Restart to update" pill.
- Never reload a visible tab that has unsynced work.
- Coordinate tabs.
- A minimum-supported-version contract between client and API.

### 19. Proposed Client IA

**Today · Train · Nutrition · Progress · Coach**, with **You** behind the avatar. No ☰, no center FAB, no bell. Details in 16.

| Destination | What it holds |
|---|---|
| **Today** | One adaptive hero (start / resume / done / rest day / waiting for coach), a compact checklist with quick actions, and at most one actionable coach item. Always "today". |
| **Train** | Plan → day detail (coach notes, video) → exercise; a full-screen session with a resume bar; cardio plan and timer; workout history. |
| **Nutrition** | One name, one "Add food" flow, a local day switcher. |
| **Progress** | Body (weight, measurements, photos, check-in data) · Strength · Consistency. |
| **Coach** | Chat first, pinned to-dos (check-in due, assessment reviewed), a notes/announcements feed, check-in history, My assessment. |
| **You** | Profile, subscription (its only home), preferences, help, sign out. |

**Disappears:** the Exercise Library, History, Cardio, Measurements and Photos as separate routes; the Coach-notes page; the notifications page and the bell; Video manager, Import, Update the app, Reset, reminders and sync UI.

### 20. Proposed Coach mobile IA

**Today · Clients · Messages · Library**, with **Me** behind the avatar. Details in 16.

| Destination | What it holds |
|---|---|
| **Today** (the landing everywhere) | A ranked queue: check-ins to review, assessments, unread conversations, freeze/transfer requests, renewals due and lapsed, trials ending, payments pending, inactive clients with a plan, new clients without a plan, flagged swaps — each with an inline action. |
| **Clients** | Urgency-sorted list showing the **subscription** state + reason + days left + last workout. One unified "Add client" flow. |
| **Client** | A sticky compact header + **Summary · Plan · Progress · Profile**. Editors are full-screen flows with a sticky action bar, autosave and automatic versions. The thread pushes and returns to the client. Private notes are explicit. |
| **Messages** | Conversations only; broadcast with an explicit audience. |
| **Library** | Programs · Exercises · Foods · Supplements. |
| **Me** | Business (revenue, renewals, packages), Forma subscription, account, help (WhatsApp moves here). |

### 21. Proposed Coach desktop IA

The **same 4 destinations + Business** in a sidebar. Density instead of new destinations:
- **Today:** two-pane triage (queue | context + inline action, J/K keyboard).
- **Clients:** a sortable 5-column table (Client · Next action · Last workout · Adherence 7d · Subscription days left).
- **Client:** the same 4 sections as tabs, with **split-view plan editors** and **chat docked inside the client**.
- **Messages:** a URL-backed split view.
- **Library:** tables.
- **Business:** tables + exports.

Tablet (768–1023) uses the desktop tier with a collapsed sidebar. Every desktop surface maps 1:1 to a mobile one (16).

### 22. What the premium design system needs

Details in 17; findings in 06 and 14.

**Foundations**
- One type scale (no text under 12 px for meaning; Arabic-capable fonts for every style, including labels).
- One surface/border/radius hierarchy taken from the website: hairline translucent borders, no shadow on ordinary content, tinted borderless pills.
- **Semantic colour.** Orange = primary action only, plus defined success/warning/danger/info.
- 44 px minimum targets.
- The website's icon set.
- Intl-based number, date and unit formatting with plural rules.
- RTL-first logical properties.

**About 50 components, collapsed from 2–7 competing versions each into one with variants**
- AppShell (one responsive shell for both roles), MobileHeader/DesktopHeader/EntityHeader, BottomNav/Sidebar, SegmentedControl/Tabs.
- ListRow (the default building block instead of Card), Metric (one), Table + MobileDataList (column priorities, row actions), StatusChip (one tone map).
- One **Banner region**, Toast (bottom-anchored, single, never for errors), NotificationItem, Sheet/Dialog (keep), ActionMenu (new).
- Search/Filter, EmptyState/ErrorState/Skeleton/OfflineState, SyncStatus (one, honest).
- ExerciseCard/FoodCard (media-first), MediaViewer (images + video with error and poster states), MessageBubble/Composer, ProgressChart.
- Button and IconButton with working size variants (`btn-sm` is dead CSS today).

**Keep and evolve:** Sheet, DialogHost, Field, SearchField, Pill, Skeleton, DataTable, SidebarNav, ResponsiveShell, the charts. **Replace:** the button size system, the icon set, the KPI tiles, the banners, the headers.

### 23. What must be fixed BEFORE launch

The ten blockers (18 §4):

| # | Blocker | Findings |
|---|---|---|
| 1 | Offline / network failure signs clients out and crashes the app | PWA-01, PWA-08, PF-03, PF-10 |
| 2 | Plan wipe after a failed load | CO-01 (+ server-side versions) |
| 3 | Private coach notes shown to clients | CO-02, CO-21 |
| 4 | Cross-coach client lookup with contact data | CO-03 |
| 5 | Personal media on public permanent URLs; deletes that don't delete | MD-02, MD-03; at minimum a private zone + signed URLs for body photos, and real deletion |
| 6 | Production uploads failing | MD-01: fix the Bunny key; make the upload health check real; stop "Saved" on failure, TS-03 |
| 7 | Account-isolation data loss | PWA-02, PWA-03, PWA-05; client-only sync engine PWA-04 / RM-81 |
| 8 | Remove "Reset all data" | CL-44 |
| 9 | Coach composer hidden under the nav | CO-04 |
| 10 | Silent wrong data | Empty sets "Logged" (JR-01); wrong-day logs (NT-02 / CL-04); live timers lost (PWA-07) |

**Strongly recommended before launch (mostly effort S):**
- Notification baseline, resolve and mark-all (NT-01, NT-03).
- Dead video button, player error state, link validation (EX-01, EX-03, EX-04).
- Check-in full-screen with a visible CTA (CL-42).
- A visible "Update ready" (PWA-09).
- Subscription renewal pre-fill and history (CO-14, CO-15).
- ar-eg dates and Arabic digits (RTL-02, RTL-04).
- The correct status on the client list (CO-07).
- Removing the 24 SAFE removal candidates, including 131 MB of unused video and 614 KB of precache.

### 24. What can wait until after launch

- The **full IA rebuild** and the **design system**: Phases B1–B3. Launch with the safety fixes on the current structure.
- Desktop and tablet polish (DT-*), the table transformations other than TB-01, and the command palette.
- Realtime (a change feed or push to replace polling), Web Push and digest email. In-app notifications must be correct first.
- The global curated exercise catalog beyond the first ~150 movements; food images beyond fallback + curated starter foods; a USDA-based search.
- Performance P2/P3: precache trim, persisted coach cache, render hotspots, a single-function cold start.
- Accessibility and RTL P2/P3, plural rules, unused i18n keys.
- Removal of the old landing and the three.js experience (a product decision); repo clutter.

### 25. Realistic implementation phases after this audit

**Assumptions:** 2 engineers + 1 product designer. Durations are ranges and will shift with decisions on the open questions in 16.

| Phase | Goal | Contents | Duration |
|---|---|---|---|
| **B0 — Safety & trust** (pre-launch) | No data loss, no privacy leak, offline doesn't sign out | The 16 P0s + the 10 blockers + the "strongly recommended" list. Delete the 24 SAFE removal candidates. Add device QA (iPhone + Android) for offline, update and HEVC. | 2–3 weeks |
| **B1 — Foundations** | The rails everything else runs on | **Design tokens + core primitives** (17) and one responsive shell. **Banner region and state components**, toast policy. **i18n formatting:** Intl, plurals, Arabic font. **Outbox + per-user storage + sync contract v2:** validation, versions, finer records. **Notification lifecycle** server-side. **Media pipeline:** private zone, signed URLs, deletion, transcoding/posters. | 4–6 weeks (UI and data tracks in parallel) |
| **B2 — Client experience** | The client feels like one simple app | 5-tab IA. Today as an action surface. Train (day detail, session ergonomics, resume bar, persisted timers). Nutrition. Progress (Body / Strength / Consistency). Coach tab (chat + to-dos + feed). You. Full-screen check-in. First run. | 4–5 weeks |
| **B3 — Coach experience** | The coach knows what to do next and edits safely on a phone | Today triage queue. Clients (urgency). Client (4 sections). Full-screen mobile / split desktop editors with autosave + versions. Messages. Me (Business, Forma subscription). Removal of the Dashboard, Adherence, Reports and view-as-client. | 5–6 weeks |
| **B4 — Content & media** (parallel with B2/B3) | Libraries look and work premium | Shared curated exercise catalog (core ~150, H.264 demos, Arabic, attribution, quality tiers). Media-first picker. Food images (fallback → curated → cached branded). USDA search. Bilingual data model (no more English overwrites). | 4–6 weeks (mostly content work) |
| **B5 — Realtime, performance, polish** | Fast and alive without polling storms | Change feed (or SSE) replacing 5–7 pollers. Web Push + digest email. Boot from local. Persisted coach cache. Precache trim. Remaining a11y/RTL P2s. Desktop density. Product-decision removals. | 3–4 weeks |

**Total:** about 4–5 months for the full rebuild. B0 alone makes a launch safe. B1 + B2 alone would change how the client app feels.

---

## Premium experience score (brief §36)

Scale 1–10, where 10 = best-in-class premium consumer app (Whoop, Strava, Linear-level polish) and 5 = works but feels generic or assembled. Scores are deliberately not inflated. The **Premium** column is the gut-level "would a paying client or coach call this premium?". It is not an average of the other columns.

| Area | Visual | Clarity | Mobile UX | Navigation | Performance | Reliability | Consistency | **Premium** |
|---|---|---|---|---|---|---|---|---|
| Client shell | 6 | 4 | 5 | 3 | 6 | 3 | 4 | **4** |
| Client home (Today) | 6 | 3 | 4 | 4 | 7 | 4 | 5 | **4** |
| Workout (plan + session) | 6 | 5 | 5 | 4 | 7 | 4 | 6 | **5** |
| Nutrition | 6 | 5 | 5 | 5 | 7 | 5 | 5 | **5** |
| Progress | 6 | 4 | 5 | 4 | 7 | 6 | 5 | **5** |
| Check-ins | 6 | 5 | 3 | 4 | 6 | 4 | 5 | **4** |
| Messenger | 6 | 6 | 4 | 6 | 4 | 5 | 6 | **5** |
| Coach shell | 6 | 4 | 4 | 4 | 5 | 5 | 4 | **4** |
| Coach dashboard | 6 | 3 | 3 | 4 | 5 | 4 | 4 | **3** |
| Clients | 6 | 3 | 5 | 5 | 6 | 5 | 5 | **4** |
| Client detail (workspace) | 6 | 4 | 3 | 3 | 6 | 2 | 4 | **3** |
| Programming (editors) | 5 | 4 | 2 | 3 | 5 | 2 | 5 | **3** |
| Library (exercise + food) | 4 | 4 | 4 | 5 | 3 | 4 | 5 | **3** |
| Business (revenue, plans) | 5 | 3 | 4 | 5 | 6 | 5 | 4 | **4** |
| Notifications | 5 | 3 | 3 | 4 | 5 | 2 | 4 | **3** |
| PWA / offline | 5 | 3 | 4 | 4 | 6 | 2 | 4 | **3** |

**Why these scores** (one line each; evidence IDs in brackets):

- **Client shell 4.**
  - Pleasant dark palette and gradient accents.
  - Three navigation systems, hidden doors, 9.5 px nav labels.
  - The app signs the user out on any network failure (PWA-01, BV-03/04).
- **Today 4.**
  - Looks rich, but reads as a report: 2.8 screens, the date shown 4 times.
  - Opens under four stale toasts (BV-01), and a notification can silently move its day (BV-02).
- **Workout 5.**
  - The session screen is the most finished screen in the app.
  - Undermined by empty sets saved as "Logged" (JR-01), a dead video button on 95% of exercises (BV-07), double start, and Finish in the hardest corner.
- **Nutrition 5.**
  - Functional meal ticking and water quick-add.
  - Two names, a red ✕ on every planned food, English food names for Arabic clients, wrong-day risk.
- **Progress 5.**
  - Good charts.
  - The same question is answered in four places, red is used for good news, and photo upload failures are silent.
- **Check-ins 4.**
  - Short, but the primary button is below the fold on step 1, the wizard keeps the tab bar, and answers can be discarded silently (BV-15).
- **Messenger 5.**
  - Robust send engine (idempotent, retry, reactions).
  - Generic chat squeezed between permanent chrome, 18–25 polls/min, uploads failing in production.
- **Coach shell 4.**
  - 4 tabs + 13-item menu + sidebar + ⌘K, Revenue in a daily slot.
  - The WhatsApp button covers content, and banners push the composer off-screen (BV-14).
- **Coach dashboard 3.**
  - 22 cards, conflicting labels, "AT RISK" for an unreviewed assessment, skeleton forever on error.
  - No answer to "who needs me" (JR-02).
- **Clients 4.**
  - Searchable, but every client reads "ACTIVE" and 9/10 read "Needs attention" (BV-20).
  - The desktop table overflows (BV-21).
- **Client detail 3.**
  - ~21 URLs across 3 layouts, 11 tabs, wrong metrics (BV-22).
  - Private notes leak to the client (BV-12), and an empty-editor save wipes plans (BV-11).
- **Programming 3.**
  - A desktop editor folded onto a phone: 4.3 screens, 3 back buttons, 10 taps per exercise.
  - The P0 wipe path.
- **Library 3.**
  - Text-only.
  - Empty until manually loaded, 835 KB per open, 95% of exercises without video, HEVC videos, unidentifiable food search.
- **Business 4.**
  - 17 cards of mostly duplicated counts.
  - The clients who need business action (expired, pending, trial) are never named.
- **Notifications 3.**
  - Replays forever, never clears, wrong deep links, changes data context, no push.
- **PWA/offline 3.**
  - The data layer is sound.
  - The identity layer, account switching, the update UX and the sync status undo it (PWA-01..11).

**Overall product (both roles): 4/10 on premium feel.** The functionality is roughly 7/10. The gap is structural (IA, states, trust), not cosmetic.

---

## Final product decision table (brief §46)

ACTION ∈ KEEP / REDESIGN / MERGE / MOVE / REMOVE / REBUILD. PRIORITY = the highest-priority open finding in that area. MOBILE IMPACT = how much the change matters at 390 px.

| Area | Current purpose | Actual user value | Current problem | Action | Priority | Effort | Mobile impact | Dependencies | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| **Identity / session layer** | Keep the user signed in; refresh tokens | Critical | Any network failure = signed out; offline cold start crashes (HEAD) or shows login (RC2); refresh race; offline sign-out doesn't sign out | REBUILD | P0 | M | Critical | — (blocks every offline goal) | Keep the last verified identity on device; end the session only on an explicit 401/revocation; single-flight refresh; precache the login |
| **Client sync engine (local-first)** | Mirror IndexedDB ↔ server | High: offline logging works | Account switch destroys unsynced data; deletions and cursors leak across accounts; whole-day last-write-wins; unvalidated contract; runs for coaches/admins | REBUILD (contract + scoping), KEEP (local-first idea) | P0 | L | High | Identity layer | Per-user DB, outbox with op IDs, server version checks, validated collections, client-only engine |
| **PWA update lifecycle** | Ship new builds safely | High | Old build for a whole session after deploy; no update UI; mixed versions on first-visit tabs; silent background reload loses in-memory work | REDESIGN | P1 | M | High | Outbox (never drop unsynced work) | Detect → download → safe point → activate → reload; visible "Update ready"; version contract |
| **Client shell & navigation** | Get around the client app | High | 3 nav systems (tabs + 13-row menu + bell) + hidden doors; 8+ screens light no tab; names differ per screen | REBUILD | P1 | M | Critical | Target IA (16) | 5 tabs (Today · Train · Nutrition · Progress · Coach) + avatar → You; no ☰, no FAB, no bell |
| **Today (client home)** | Daily overview | High | 2.8 screens; date ×4; duplicate summaries; replayed toasts on open; selected day hijacked by notifications; contradicting states | REBUILD | P1 | M | Critical | Notifications lifecycle; IA | One adaptive hero + compact checklist + ≤1 coach item; always "today" |
| **Train (plan + day detail)** | Show the coach's plan | High | Day detail (RoutineDetail) is an orphan, so coach notes/videos never reach the client; generic icons, no exercise images | REDESIGN | P1 | M | High | Exercise media pipeline | Plan → day detail → exercise; images/video in rows; coach notes inline |
| **Workout session** | Log sets live | Critical | ✓ without typing saves null but says "Logged"; double Start; Finish top-right; 32 px stepper; dead video button for 95% of exercises; in-memory timers lost on reload | REDESIGN | P1 | M | Critical | Outbox; media | Commit displayed values; one start; bottom action bar; swipe between exercises; persisted timers |
| **Client exercise library** | Browse exercises | Low: it's a list of plan exercises with best weights | Duplicates Progress › Strength; misleading name | REMOVE (destination) | P3 | S | Low | — | Fold into Progress › Strength + exercise detail |
| **Nutrition (Fuel)** | Follow the meal plan; log food | High | Two names; red ✕ on every planned food; wrong-day logging risk; Arabic digits rejected; English food names for AR clients | REDESIGN | P1 | M | High | Day semantics; i18n of library data | One name; quiet item actions; local day switcher; bilingual food data |
| **Cardio** | Coach cardio plan + live timer + log | Medium | Hidden in the menu; live timer is memory-only (lost on reload); raw keys for unknown types | MOVE (→ Train/Today) | P1 | S | Medium | Timer persistence | Plan + timer in Train; steps/minutes quick-log on Today |
| **Progress / History / Measurements / Photos** | Show results | High | Same metrics in 4 places + 2 extra routes; red for good news; 14 measurement fields of "0"; photo upload failures silent; tonnage headline | MERGE | P1 | M | High | Media pipeline (photos) | Progress = Body / Strength / Consistency; one "log body update" flow |
| **Check-ins (client)** | Weekly report to the coach | High | CTA below the fold under the nav; tabs/✕ discard answers; fake defaults; weight prefilled 0; photos fail in prod | REDESIGN | P1 | S | Critical | Media pipeline; outbox | Full-screen wizard, sticky CTA, prefill, guarded exit |
| **Assessment (wizard + view)** | Onboarding questionnaire | High (coach needs it) | No exit; pre-selected answers; raw i18n key; buried under Settings; "Client assessment" title shown to client | REDESIGN + MOVE | P2 | M | Medium | — | Coach › My assessment; honest defaults |
| **Client messaging** | Talk to the coach | Critical | Generic chat squeezed between chrome; triple signal per message (badge + bell + toast); uploads fail in prod | MERGE (into Coach tab) | P1 | M | High | Media; notifications | Coach tab = chat + pinned to-dos + notes feed |
| **"Your coach" page (`/coach-notes`)** | Notes, targets, subscription | Low (duplicates) | Mixes subscription pause form, payment history, targets and notes | REMOVE (merge) | P2 | S | Medium | Coach tab, You | Notes feed → Coach tab; subscription → You |
| **Notifications (client + coach)** | Tell users what changed | High in principle | Replays on every open; never clears; moves the selected day; wrong deep links; no push or coaching email | REBUILD | P1 | M | High | Push infra (later) | Lifecycle created → delivered (per channel) → seen → read → resolved; feed inside Coach (client) / Today (coach) |
| **Toasts** | Transient feedback | Medium | 68 call sites; stack covers the top 400 px; success toasts duplicate visible state; errors use blocking modals with raw text | REDESIGN | P2 | S | Medium | — | Toasts for confirmations only; inline errors; bottom-anchored, single |
| **Settings / You** | Account and preferences | Medium | Sync card, Reset all data (wipes coach-visible history server-side), Clear day, reminders, Video manager, Import, Update the app | REDESIGN + REMOVE | P0 (Reset) | S | Medium | — | Profile · Subscription · Preferences · Help · Sign out only |
| **Client subscription UI** | See and pause the subscription | Medium | Shown 3 times; dates a day early in Egypt; expired/cancelled shown as "paused" in the session | MERGE | P2 | S | Medium | — | One home under You, with days left |
| **Legacy local-tracker tools** | Old standalone app | None for platform clients | Video manager (always empty), Import data, local reminders titled "Gym Tracker", demo seed data in the entry chunk | REMOVE | P2 | S | Low | — | Delete (see the removal candidates) |
| **Coach shell & navigation** | Get around the coach app | High | 4 tabs + 13-item ☰ + sidebar + ⌘K; Revenue in a daily slot; WhatsApp FAB covers content; banners stack | REBUILD | P1 | M | Critical | Target IA (16) | Today · Clients · Messages · Library + avatar → Me |
| **Coach dashboard** | Overview of the business | Low–medium | 4 tabs, 22 cards, conflicting labels, wrong "at risk", infinite skeleton on error | REMOVE (→ Today) | P1 | M | High | Today queue | Replace with the Today triage queue |
| **Clients list** | Roster | High | Status chip = account status (all "ACTIVE"); 9/10 "Needs attention"; chips = admin states; desktop table overflows | REDESIGN | P1 | M | High | Coaching-state model | Urgency-sorted list; subscription state + reason per row |
| **Client workspace (coach)** | One client's world | Critical | ~21 URLs across 3 layouts; 11 tabs; More off-screen at 390; misleading Overview metrics; Back leaves the client via More/Messages | REBUILD | P0 (see editors) | L | Critical | IA; editors | One client, 4 sections: Summary · Plan · Progress · Profile |
| **View as client** | See the client's logs | Medium | Second layout with 6 chips whose names collide with the workspace's | MERGE (→ Client › Progress) | P2 | M | Medium | Client rebuild | Fold into Progress |
| **Workout plan builder** | Program training | Critical | **Failed load → empty editor → Save overwrites the real plan (P0)**; 3 back buttons; mandatory sections; 10 taps for one exercise; Save scrolls away | REBUILD | P0 | L | Critical | Versioning on the server | Never edit an unloaded plan; full-screen editor with sticky bar; autosave + automatic versions |
| **Nutrition plan editor** | Program nutrition | Critical | Same P0 empty-editor wipe; 4.3 screens at 390; Arabic text overwritten with English | REBUILD | P0 | L | Critical | Bilingual data model | Same editor rules; compact meal rows |
| **Cardio plan editor** | Program cardio | Medium | Same P0 pattern; step/cardio targets "set under Targets" but no screen sets them | REDESIGN | P0 | M | Medium | Editor rules | Merge into Plan |
| **Check-ins (coach)** | Review weekly check-ins | Critical (the weekly loop) | Hidden under More; "Request" is the primary CTA while a submitted one waits; the overview queue (good) is buried in the menu | MOVE (→ Today) | P1 | S | High | Today queue | Sequential review queue in Today |
| **Assessments (coach list)** | Review onboarding | Medium | A separate page that filters the roster; "private" notes are shown to the client (P0) | MERGE + REDESIGN | P0 (privacy) | S | Medium | Notes model | Review items in Today; explicit private vs client-visible notes |
| **Coach notes** | Coach memo | Medium | Client-visible but described as internal; scattered "Add note" everywhere | REDESIGN | P0 (privacy) | M | Medium | Notes model | Two concepts: Messages (to the client) and Private notes |
| **Coach messaging + broadcast** | Talk to clients | Critical | Composer hidden under the nav when a banner shows (P0); inbox lists every client; broadcast "All" = current filter; no client context | REDESIGN | P0 | M | Critical | Banner region | Conversations only; docked in the client on desktop; explicit broadcast audience |
| **Exercise library (coach)** | Find/manage exercises | High | Empty until "Load starter library"; per-coach copies of 909 records (835 KB, never updated); text-only rows; no preview in the picker; 95% without video; 76% of videos are HEVC; 10 non-English names | REBUILD | P1 | L | High | Media pipeline; quality gate | Global curated catalog + coach additions; media-first rows; PUBLISHED / LIMITED / HIDDEN tiers |
| **Food library** | Find/manage foods | High | No images; external search returns identical "chicken" rows; Arabic names lost on save; Arabic digits → 0 macros | REDESIGN | P1 | M | High | Image strategy; bilingual data | Curated foods with self-hosted images + category fallback; identifiable search |
| **Templates** | Reuse programs | Medium | Separate page; preview step; Back-after-save loop; no "start from template" inside a client; nutrition templates have no UI | MERGE (→ Library › Programs) | P2 | M | Medium | Library rebuild | Programs inside Library; apply from the client's Plan |
| **Revenue / Reports / Client Plans** | Business view | Medium (weekly) | Bottom-tab slot; 17 cards with duplicates; expired/pending/trial clients only as counts | MOVE (→ Me › Business) + REDESIGN | P1 | M | Medium | Today queue (renewals) | A report behind the avatar; renewals needing action surface in Today |
| **My Plan (Forma subscription) + banners** | The coach's own plan | Medium | "Plan" homonym; capacity in 5 places; banners push the composer off-screen | MOVE (→ Me) | P1 | S | High | Banner region | "Forma subscription" behind the avatar; blocking banner only when it blocks work |
| **Adherence** | Rank clients by workouts | Low | Duplicates the client list; mobile rows not tappable | REMOVE (→ Clients sort) | P3 | S | Low | Clients redesign | Sort/filter on Clients |
| **Client search / add existing** | Find a Forma account | Medium | Any coach can list other coaches' clients with email/phone from one letter (P0 privacy) | REBUILD | P0 | M | Medium | Owner decision on search rules | Exact email/phone match only; unified "Add client" flow |
| **Media pipeline** | Store/serve uploads | Critical | Uploads fail in prod (Bunny 401); public permanent URLs for body photos; nothing ever deleted; no transcoding/posters | REBUILD | P0 (privacy) / P1 | L | High | Bunny config, token auth | Private zone + signed URLs for personal media; transcoding; deletion lifecycle |
| **Design system** | Visual consistency | — | 2 products in one; 13 radii, 21 font sizes, 35 border colours; `btn-sm` does nothing; 22 card-in-card nestings; orange means everything | REBUILD | P1 | L | High | Website brand anchors | One shell, one metric, one list row, one banner region (17) |
| **Arabic / RTL** | Egyptian market | Critical (target market) | English dates for ar-eg; mono tracking breaks Arabic joining; no plurals; Arabic digits rejected in logging; Arabic content overwritten by English | REDESIGN | P1 | M | High | Design system | RTL-first type, Intl formatting, plural rules, bilingual data |
| **Performance / polling** | Freshness without push | — | 13.5–25 req/min per open app; duplicate pollers; boot waits on 3 sequential calls; 835 KB library | REDESIGN | P1 | M | Medium | Change feed (later) | One poller per source → change feed; boot from local data |

---

## Counts

| Measure | Value |
|---|---|
| Findings (docs 01–15) | **333** = P0 17 · P1 92 · P2 167 · P3 57 |
| Unique P0 issues after cross-document de-duplication | **16** (18 §3) |
| Removal candidates | **88** = 24 safe · 54 product decisions · 4 keep (technical) · 6 unknown. These carry 2 P0 and 12 P1 |
| Findings by action | REDESIGN 197 · REBUILD 77 · MERGE 21 · REMOVE 20 · MOVE 11 · KEEP 7 |
| Removal candidates by action | REMOVE 56 · MERGE 22 · REDESIGN 4 · MOVE 3 · KEEP 3 |
| REMOVE, all entries | **76** |
| MERGE, all entries | **43** |
| REBUILD, all entries | **77** |
| Verification | 173 browser-verified · 151 code-confirmed · 9 inferred (device or production needed) |
| Browser evidence | 41 BV items · 46 screenshots in `evidence/` · 150+ route screenshots · 10 journeys · measured startup, polling and resume traffic |

## Document map

| Doc | Covers (brief §) | IDs |
|---|---|---|
| `01_CURRENT_ARCHITECTURE.md` | §4 architecture map | AR |
| `02_CLIENT_MOBILE_AUDIT.md` | §8, §26–29, §31 (client) | CL |
| `03_COACH_MOBILE_AUDIT.md` | §9, §26–29, §31 (coach) | CO |
| `04_DESKTOP_AUDIT.md` | Desktop/tablet, §12 table audit | DT, TB |
| `05_INFORMATION_ARCHITECTURE.md` | §6 IA, §7 semantic navigation | IA-C, IA-K, NAV-C, NAV-K |
| `06_VISUAL_SYSTEM_AUDIT.md` | §10 visual system, §11 card audit | VS, CD |
| `07_EXERCISE_LIBRARY_AUDIT.md` | §13 exercise library, §14 quality gate | EX |
| `08_FOOD_LIBRARY_AUDIT.md` | §15 food library + image strategy | FD |
| `09_MESSENGER_AUDIT.md` | §17 messenger | MS |
| `10_NOTIFICATIONS_AUDIT.md` | §18 notifications, §19 toasts | NT, TS |
| `11_PWA_CACHE_OFFLINE_AUDIT.md` | §20–25 cache, PWA, offline matrix, write safety, sync UX, update lifecycle | PWA |
| `12_MEDIA_AUDIT.md` | §16 media architecture | MD |
| `13_PERFORMANCE_NETWORK_AUDIT.md` | §32 performance, §33 network | PF |
| `14_ACCESSIBILITY_RTL_AUDIT.md` | §34 accessibility, §35 Arabic/RTL | AX, RTL |
| `15_PRODUCT_JOURNEYS.md` | §30 journeys, §31 one-hand review | JR |
| `16_TARGET_INFORMATION_ARCHITECTURE.md` | §39 target IA | — |
| `17_TARGET_DESIGN_SYSTEM.md` | §40 component inventory | — |
| `18_PRIORITIZED_FINDINGS.md` | §37 priority model, master index, blockers | all |
| `../FORMA_PRODUCT_REMOVAL_CANDIDATES.md` | §5 and §38 deletion map (nothing deleted) | RM |
| `evidence/` | 46 screenshots referenced by the docs | — |

**Not done in Phase A (by instruction or by necessity):**
- No code, data, service-worker, cache, notification or navigation changes.
- No food images downloaded.
- No production access.
- Not tested on a real iPhone or Android device. Those checks are listed as INFERRED items in 11, 07, 09 and 05.
- The isolated test data and harness scripts live in this session's scratchpad and are not committed.

