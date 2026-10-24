# B2 — Client experience implementation log

> One entry per milestone: what changed, why (the audit finding or blueprint decision), and how it was checked.
> Specs: `B2_CLIENT_BLUEPRINT.md` (IA, decisions D1–D12, visual rules) and `B2_ROUTE_MIGRATION.md` (route-by-route table).
> Scope: client screens only. Coach, Super Admin, the website, public auth and legal pages are untouched.
> Every test change is in §T at the end, with the guarantee it still checks.

## Milestone summary (the brief's required fields)

No milestone changed a server API, a database schema or a sync contract: B2 is a client UI rebuild on the B0 / B1 engines. "Data/API" below therefore lists only which existing stores and endpoints each screen uses.

| Milestone | Scope | Audit findings addressed | Data / API | Accessibility | RTL | Offline / sync | Tests added or changed | Browser verification | Remaining |
|---|---|---|---|---|---|---|---|---|---|
| B2.0 | Blueprint, route map | — (spec) | — | Rules in blueprint §5 | Rules in blueprint §5 | Contracts listed (blueprint §7) | — | — | — |
| B2.1 | Shell, tabs, rail, header, resume bar, icons | CL-01, CL-02, CL-03, CL-06, NAV-C01, NAV-C03, NAV-C07, VS-19 (client) | `useClientMessageUnread`, shared notification poll | Labelled nav (`aria-current`), 44 px items, single `<main>` | Mirrored chevrons, rail on the start side | Shell stays up while a screen loads; resume bar reads persisted live state | `navContract.test` (parents), `_d-layout` (nav keys, rail) | 44 / 45 layout specs; `b2.1-shell` shots | Coach / admin keep their own shell until B3 |
| B2.2 | Today | CL-09, CL-10, CL-11, CL-41 (zeros), CL-48, CD-01, CD-04 | Workout / nutrition / cardio stores, `planSeen`, check-in + coach queries | One heading order, status roles on states | Number runs isolated | Today always today (B0 rule kept) | e2e 80 (Journey B, IA) | 30, 42, 43, 61, 80; `b2.2-today` | — |
| B2.3 | Train, Day, Exercise, Session, Cardio, History | CL-12, CL-13, CL-14, CL-16, CL-18, CL-19, CL-22, CL-24, CL-25, CL-29, CL-30, CL-31, CL-37, CL-50, VS-08 | `workoutStore` (B0 rules), cardio store, cardio plan query | 56 px session controls, pressed ticks, labelled inputs | Arabic digits accepted (B0); session header mirrored | Live state persists; set tick commits shown values (B0) | e2e 30 (selectors, §T), 80 (Journey B, Arabic) | `b2.3-train`, `b2.3-session` | CL-23 (kg × reps model) |
| B2.4 | Nutrition, DaySwitcher | CL-04, CL-26, CL-27, CL-28, VS-08 | `nutritionStore` (unchanged API; edit = upsert by id) | Tick buttons `aria-pressed`, row menus | Number runs isolated (VS-QA #8) | Logs to the shown day only, which is announced | e2e 30 (§T), 80 (Journey C, G, Arabic) | `b2.4-nutrition` | No food database / images (brief) |
| B2.5 | Progress (Body, Strength, Consistency), Measurements, Photos | CL-32, CL-33 (partly), CL-35, CL-36 (partly), CD-01 | Cardio (weights), measurements, photos stores, assessment query | Radiogroups for views and periods | Week grid flows right to left | Photo upload honesty unchanged (B0); no "deleted" claim (MD-03) | e2e 80 (Journey D), `_d-layout` Arabic chart | 30, 40, 44; `b2.5-progress` | D12 (check-in data not merged); MD-01/02/03 |
| B2.6 | Coach (Chat, Updates, Check-ins, My assessment) | CL-38, CL-39, CL-40 (partly), CL-43, CL-49 | `MessageThread` engine, notifications poll, coach notes, check-ins, assessment | Sections as links with `aria-current`; error states with Retry | Composer and bubbles unchanged (B1) | Outbox untouched; offline queue verified (Journey E) | unit `coachUpdates.test`; e2e 61 (unchanged, now passes on the merged feed), 80 | 31, 32, 33, 40, 42, 47, 61, 80; `b2.6-coach` | — |
| B2.7 | You, remove device data, first run | CL-41 (copy), CL-45, CL-46, CL-47 (row), PWA-14 | Settings / reminders stores, `countPendingChanges`, per-account IndexedDB | Labelled fields, reminder row menus | E-mail and phone isolated | Sign-out flow (B0) unchanged; removal refuses anything unsynced | unit `deviceData.test`; e2e 80 (remove data, Journey G) | 10, 30, 40, 61, 80; `b2.7-you` | Auth screens (CompleteAccount) untouched by brief |
| B2.8 | QA matrix, axe, cleanup, certification | AX-01, AX-03, VS-04 (client screens) | — | axe 76 scans → 0 violations | 114 Arabic shots, all RTL | PWA + offline boot on the prod build | e2e 80 (10), §T changes | Full suite; `b2.8-matrix`; `axe` | Chart text size (P2) |

## B2.0 — Blueprint and route map

- `B2_CLIENT_BLUEPRINT.md`: five tabs (Today · Train · Nutrition · Progress · Coach) with You behind the avatar; a home for every feature; decisions D1–D12; visual rules; the B1 primitives reused; contracts kept.
- `B2_ROUTE_MIGRATION.md`: every old client route → its new home, with redirect, permission and test columns.
- Recon notes (code inventory, test dependencies) were kept outside the repo; their conclusions are in the two docs.

## B2.1 — Shell

| Change | Files | Why |
|---|---|---|
| One route map for the client (tab membership, tab roots, task flows, titles) | `src/config/clientNav.ts` | Tabs, rail, header and Back all read one source (NAV-C01) |
| `ClientShell`: 56 px header (Back on sub-screens, wordmark on Today, quiet sync status, avatar → You), banner region, content column, resume bar, bottom TabBar < 1024 px, side rail ≥ 1024 px; task flows (session, check-in) render without chrome | `src/components/client/ClientShell.tsx`, `ui/AppHeader.tsx`, `ui/TabBar.tsx` | Replaces AppShell + hamburger for the client (doc 16). The hamburger is gone for the client; coach / admin keep theirs until B3 |
| Coach badge = unread chat + unread updates | `ClientShell`, `hooks/useNotificationToasts.ts` (extracted from the bell) | No bell in the client header; the count lives on the tab |
| Resume bar on every client screen while a workout runs (rest countdown when resting); hidden in task flows and in chat | `client/ResumeBar.tsx` | CL-18 / WK journey: a running workout is always one tap away |
| Website icon set on client screens through a context (stroke 1.75); coach / admin keep the app icons | `Icon.tsx` (`IconGlyphContext`), `client/siteIcons.tsx` | D9: one visual language with the website, no forked components |
| Real Forma wordmark (232×72 WebP, 5 KB, precached) | `public/brand/forma-wordmark.webp`, `vite.config.ts` | Brief: real logo assets only |
| Redirects: `/workout/library` → `/workout`, `/notifications` → `/coach-notes` | `apps/ClientApp.tsx` | D5 (library retired), Coach › Updates owns the feed |
| Back parents for the new IA | `lib/navContract.ts` (+ test) | `/cardio`, `/history`, exercise → Train; check-ins, updates, assessment → Coach |

## B2.2 — Today

- `src/pages/Home.tsx` rebuilt around one hero, in priority order: load error · loading · no coach · waiting for the plan · in progress · done today · week done · planned. No invented rest day (D4): plan days have no weekday schedule, so "week done" means finished sessions this week ≥ plan days.
- Start = `startSession` + `beginTimer` (CL-18: no second Start inside the session).
- One coach item, highest priority first: check-in requested › unread message › plan updated (grounded in `plan.updatedAt` vs the last time the client opened Train — `lib/planSeen.ts`) › coach note.
- Essentials as rows (meals, water with +250, steps or cardio, supplements) — counts only from recorded values; "This week" (session dots, weight trend).
- Today always shows today: the day resets on mount (B0 rule kept).
- New: `ui/ListRow.tsx` (`IconTile`, `Section`, `ListGroup`, `ListRow`), `hooks/useMyCoach.ts`.

## B2.3 — Train

| Screen | File | What changed |
|---|---|---|
| Train landing | `pages/Workout.tsx` | "Up next" hero (day n of N, exercises with last session's weight × reps, Start this workout), the whole plan as rows (each opens its day), cardio, history and the training guide. Marks the plan as seen |
| Day | `pages/RoutineDetail.tsx` | Sections and exercises as rows, coach notes inline, video indicator only when playable, sticky Start (hidden while a workout runs — the resume bar covers it) |
| Exercise | `pages/ExerciseDetail.tsx` | Prescription, RIR explained in words, coach notes, last time, PR, trend |
| Session | `pages/WorkoutSession.tsx`, `ExerciseCard.tsx`, `RestTimerBar.tsx` | Full-screen task: sticky header (minimise, timer, menu: add / restore / discard), progress, one exercise card with 56 px set inputs and tick, fixed bottom stack (rest timer, Previous, Next exercise / Finish). Remove-exercise moved into a row menu (VS-08). Summary shows PRs against real history only |
| Cardio | `pages/Cardio.tsx` | Goals only when the coach set targets, live timer, one "Log activity" sheet with validation (`cardio.needSomething`), coach plan, history with a per-row menu |
| History | `pages/History.tsx` | Calendar marks finished days (not tonnage, RM-45); month list. Opening a session does not move the app-wide day permanently (B0 dayStore rules) |

B0 rules kept and re-checked: a set tick commits the shown values and refuses an empty row; Start uses today; live state persists across reload; exactly one Finish control at a time.

## B2.4 — Nutrition

- `src/components/client/DaySwitcher.tsx` replaces the old `DayNav` on Nutrition, Cardio and Measurements (rendered by the page, not the route). On any day but today it says, in words, which day is shown **and that changes are saved to that day**, with "Back to today" (CL-04: view date and logging date are never silently different).
- `src/pages/Nutrition.tsx` rebuilt:
  - Hero = remaining kcal and macros **only when the coach set targets**; with no targets it shows "Eaten so far" and no bars (no invented targets).
  - Water card only when a water target exists: +250 / +500 / −250.
  - Meals are sections (`meal-<id>`, `data-eaten`): a 44 px tick marks the meal eaten; each food's swap / edit / reset / skip lives in its row menu (VS-08 — no red × per row). Coach swap rules unchanged (`substitutionPolicy`: approved alternatives, custom only when allowed, pending-approval flag).
  - **One Add-food flow** (CL-26): every entry point opens the same sheet — food search or manual entry — with an "Add to" selector (each meal or Other). From a meal it is preselected; from the page button it is Other.
  - Empty food guard: a food with no name and no macros is refused with a reason (CL-28).
  - Supplements as rows with a tick; coach notes and beverage notes as an inline note block.
  - No new food database; no food images (brief).
- Arabic: number runs (kcal, macros, quantities) are isolated (`<span dir="ltr">` / `<bdi>`) inside lines that follow the page direction, so they sit on the reading side in RTL.
- `≥ 1280 px`: meals in two columns.

## B2.5 — Progress

- `src/pages/Progress.tsx` rebuilt as three views on one screen (`?tab=body|strength|consistency`; a segmented control switches them in place). Old links keep working: `?tab=weight|measure|photos` open Body (`photos` scrolls to the photos), `?tab=strength` opens Strength.
- **Body**
  - Weight hero: current weight, the change over the chosen period (one number — the old screen showed a 30-day figure and a period figure that disagreed), distance to the goal weight only when the client set one in the assessment, period chips (`weight-range-*` kept), the chart, and **one log flow** ("Log weight" sheet, saved for today, with "Log measurements" one tap further).
  - Measurements: latest value per part with the change since the previous entry (improvement in green only where the direction is known); empty state is a row into the entry page.
  - Photos (`pages/ProgressPhotos.tsx`): pose as a segmented control, Gallery / Camera, compare two dates, dated gallery. The red × on every photo is replaced by a per-photo menu (VS-08). The remove confirmation says the photo leaves the gallery and the coach's view — it does **not** claim the stored file is erased (MD-03 open). Upload honesty from B0 unchanged (`photo-not-uploaded`, "Saved" only on server acknowledgement).
- **Strength**: top lift (estimated 1RM, trend, change), personal records as rows into the exercise screen (first 8, then "Show all"), weekly volume (last 8 weeks) and muscle split. The four all-time tiles are retired (doc 02 verdict); the all-time volume survives as one sentence. Muscle bars use one neutral data colour (distribution, not progress — orange is reserved).
- **Consistency** (CL-11, D8): this week's sessions against the plan's days; a week-by-week grid (finished days filled, future days dashed, today ringed, `n/N` per week) from the client's first session — weeks before they started are not shown as missed; a sentence counts completed weeks; a row into Train › History. No streaks, no invented goal.
- `src/pages/Measurements.tsx`: the page's own top bar is gone (the shell header has Back + title); in-page DaySwitcher; compare as a table with real dates in the header; history as rows. The shared `MeasurementForm` (also used by the coach) is unchanged.
- Desktop (≥ 1024 px): each view is two columns, which also keeps the shared SVG charts at a readable scale (they scale with width).
- Segmented controls on client screens use a neutral selected fill (`.seg.seg-quiet`), so the orange gradient stays with the one primary action per view.

## B2.6 — Coach

- **Header:** on the Coach sections the shell header shows who the coach is (avatar, name, "Your coach") — `CoachIdentity`, from the cached `['myCoach', id]` query.
- **Sections:** `client/CoachNav.tsx` — Chat · Updates · Check-ins as links drawn as a segmented control (`coach-nav-*`; each keeps its URL, `replace` navigation so Back leaves the tab). Counts reuse what the shell already polls (chat unread from thread meta, updates from the shared notification poll) — no new requests. The three sections are peers: no Back button on any of them (`COACH_SECTIONS` in `config/clientNav.ts`).
- **Chat** (`pages/Messages.tsx`): the B0/B1 `MessageThread` engine is unchanged (outbox, retry, cancel, edit / delete, reactions, voice, receipts, load older, immediate attachment failures). The column ends at the tab bar below 1024 px and near the window edge with the side rail (`useFillToBottomNav` gained an optional breakpoint; coach / admin keep 768 px). Desktop thread column capped at 768 px.
- **Updates** (`pages/CoachUpdates.tsx`, replaces `CoachInbox` on `/coach-notes`; `/notifications` redirects here):
  - "Latest": the notification feed with the same lifecycle as the old page — unread dot, "Done" for resolved tasks, mark all read (`notifications-mark-all`), deep links through `openNotification`, pagination. Chat-message rows are not repeated (Chat and its count own them — the same rule as the badge, `bellCount`).
  - "Notes & announcements": the coach's shared notes; anchored notes open their target (`openClientNote`). Private notes never reach the client (server-enforced, unchanged).
  - Retired from this page: the subscription block (moves to You, RM-22) and the targets grid (the same numbers are on Nutrition and Cardio).
- **Check-ins** (`pages/CheckInHistory.tsx`): "Waiting for you" (requested) first, then past check-ins with a status chip; rows keep `checkin-history-row` and open `/check-in/:id`. Load failure is an error with Retry. "My assessment" is a row here (its Back now returns to Check-ins).
- **My assessment** (`pages/MyAssessment.tsx`): status, dates, Edit (`assessment-edit` → the full-screen wizard), answers. The page's own top bar and the duplicate coach card are gone.
- Shared fix (all roles): `AssessmentView` rows let a long question wrap instead of squeezing the answer to one character per line.

## B2.7 — You and first run

**You** (`pages/Settings.tsx`, `/settings`, reached from the avatar — not a tab). The three sections stay deep-linkable (`?tab=profile|preferences|account`, `settings-tab-*`).
- Identity: photo, name (the page heading), member since.
- Profile: photo (`AvatarPicker`, unchanged), name (`#settings-name`, autosave with a visible Saving / Saved / Couldn't save status), phone, change password.
- Preferences: language (EN · ع · مصري, unchanged buttons), default rest (seconds, with what it is for), keep screen awake, vibration, notifications; reminders as rows (time, on/off, a row menu to delete — no red × per row, VS-08) with one add row. When notifications are off, the reminders say why they can't fire.
- Account:
  - Coaching: your coach (opens Chat; call button when the coach shared a phone), My assessment with its status, Subscription.
  - Account and sync: email, the B1 sync status (never "Synced" while anything is unacknowledged), Sync now.
  - Help: the training guide and a support e-mail link.
  - **Privacy on this device → "Remove my data from this device"** (`src/data/deviceData.ts`, unit-tested):
    - refused while a workout is running, and refused while anything exists only on this device — unsynced edits, sync conflicts, or queued messages / check-ins / uploads (`countPendingChanges`; a count that can't be verified also refuses). It tries a sync first and says how many changes are waiting;
    - unfinished check-in / assessment drafts are named in the confirmation, never removed silently;
    - on confirm: sign out (B0 flow), wait for the account's local runtime to close, then delete that account's IndexedDB database (`forma-u-<uid>`), its per-account local keys and its assessment draft. Other accounts on the device and device-level settings are untouched. **Nothing on the server is deleted**; the client's coaching history returns at the next sign-in.
  - Sign out: the B0 flow unchanged (bounded sync first, then a confirmation that says what is still only on this device).
- Retired (blueprint D7 / D8): "Update the app" (updates apply themselves at a safe point since B1), the weekly-goal input (the goal is the plan's days), and the storage-persistence notice. Never reintroduced: Reset all data, Import JSON, debug sync tools, the legacy video manager.

**First run** (`pages/onboarding/AssessmentWizard.tsx`, the mandatory assessment gate):
- The real Forma wordmark replaces the old logo file.
- First run only: a welcome line before the first question — what the answers are for, roughly how long it takes, and, truthfully, that answers are kept on this device as you go and "Save progress" stores them on the account.
- A failed "Save progress" now says so in words (answers are still on the device) instead of showing the raw server message.
- The other first-run states were rebuilt earlier: no coach yet (Today, Chat), waiting for the plan (Today, Train, Nutrition), and a failed coach-content load with Retry.

## B2.8 — Polish, accessibility, cleanup, certification

- **Visual QA matrix:** 19 screens × 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR = 228 full-page screenshots; 0 px horizontal overflow everywhere; every Arabic shot right-to-left. Details and every correction: `B2_VISUAL_QA.md`.
- **Accessibility:** axe (WCAG 2.0 / 2.1 A + AA) over the same 19 screens × EN / AR × 390 / 1440 = 76 scans. Two findings fixed — chart label contrast (shared chart text raised to ≥ 4.5:1; ticks, values and empty text only) and the subscription freeze inputs' labels. Re-run: 0 violations.
- **Orange discipline:** the exercise placeholder tile (Day) and the steps / cardio tile (Today) were orange decoration — now neutral / info.
- **Food editing** says "Edit" / "Save" instead of "Add food" / "Add" when changing an existing food.
- **Dead code removed** (no references left — verified by search and typecheck): `pages/CoachInbox.tsx`, `pages/ExerciseLibrary.tsx`, `components/AppShell.tsx`, `components/DayNav.tsx`, `components/WeekStrip.tsx`, `components/CoachCard.tsx`, `components/TaskRow.tsx`, `components/ProgressRing.tsx`, `components/CoachInfoCard.tsx` (all client-only, made dead by the rebuild). Stale comments updated. `BottomNav`, `BrandBar`, `NavMenuSheet`, `Notifications`, `TopBar` stay — the coach / admin shells use them.
- **Regression tests added for every replaced behaviour** — `e2e3/specs/80-b2-client.spec.ts` (10 tests): IA (five tabs, You via avatar, no hamburger, rail ≥ 1024, retired routes redirect); Journey A (no coach → honest state; waiting → plan arrives → Start); Journey B (Start is already running, resume bar, Today "done"); Journey C (one Add-food flow with "Add to", edit quantity, the day switcher announces another day); Journey D (one log flow, old `?tab=` links); Coach sections as peers + cold deep links Back to their semantic parent (Journey H); Journey E (offline-queued message delivered and acknowledged); Journey G (account isolation with a pending change); remove-device-data (refused while pending, removes only this account's local database, server copy intact); Journey I (workout, nutrition, messaging in Arabic). Unit: `lib/coachUpdates.test.ts` (5), `data/deviceData.test.tsx` (4).
- **Tooling** (kept, under `e2e3/visual/`): `seed-client.mjs`, `shots.mjs` (now retries a failed navigation and writes results as it goes — a laptop sleep killed the first matrix run), `session-shots.mjs`, `axe-client.mjs`.

## §T — Test changes (selectors only; every guarantee kept)

| Spec | Before | After | Guarantee still checked | Why it changed |
|---|---|---|---|---|
| `e2e3/specs/30-client.spec.ts` `setRows` | `section.card li` filtered by a Done button | `getByTestId('set-row')` | Two working sets → exactly two rows; values survive reload | B2.3 card markup |
| 30-client workout | clicks a second `Start` inside the session | asserts **no** `Start` button exists, then `Finish` is visible | The session is running before the first set | CL-18: Start on Train / Today begins the timer |
| 30-client nutrition | `section.card` + `toHaveClass(/border-success/)` | `getByTestId('meal-c-meal-1')` + `toHaveAttribute('data-eaten','true')` (before and after reload) | Mark eaten persists locally and on the server | Eaten state is now an attribute, not a class name |
| 30-client nutrition | button `+ Add food` in the meal | button `Add food` in the meal (accessible name "Add food to C Breakfast") | Adding from a meal puts the food in that meal (`extraItems['c-meal-1']`) | One Add-food flow; the visible "+" is an icon |
| 30-client cardio | `getByRole('button', { name: 'Running' })` | `getByRole('radio', { name: 'Running' })` | The chosen type is saved (`type: 'running'`) | The type picker is a radiogroup (B1.14 accessibility) |
| 30-client cardio | `li.card` containing `25min` | `getByTestId('cardio-entry')` containing `25 min` | The entry renders and survives reload; server copy `durationSec: 1500` | Row markup; spaced unit (`formatNumber` + unit) |
| `e2e3/specs/_d-layout.ts` `NAV_KEYS.client` | `today, fuel, train, progress, inbox` | `today, train, nutrition, progress, coach` | Every client nav label is translated in Arabic and none is clipped | B2 IA (D1) |
| `_d-layout.ts` `navCheck` (client) | bottom nav visible at every width | bottom nav < 1024 px, side rail (`client-rail`) ≥ 1024 px, never both | The client always has exactly one primary navigation | B2.1 desktop rail (D10) |
| `_d-layout.ts` `navLabels` / `clippedNav` | read `nav-*` / `sidebar-*` | also read `rail-*` (first line, without the badge) and check rail labels for clipping | Same leak and clipping checks on the rail | B2.1 desktop rail |
| `e2e3/specs/61-b0-trust.spec.ts` (cold open) | `getByText(/^today$/i).first()` | `getByTestId('day-switcher-label')` has text `Today` | A coach-note notification does not move the day on cold open | **Strengthened**: the unscoped match hit the nav's "Today" label, so it could pass even if the day moved |
| 61-b0 (tap opens the day) | `getByText(/25/).first()` | `getByTestId('day-switcher-label')` contains `25` | Tapping the notification opens that day | **Strengthened** the same way |
| `src/lib/navContract.test.tsx` | `/assessment` → `/messages` | `/assessment` → `/check-ins` | Every client sub-screen has a semantic parent for a cold Back | My assessment moved under Check-ins (B2.6) |
| `e2e3/specs/43-cache-freshness.spec.ts` | `getByRole('heading', { name: 'Push Day' })` before and `'Pull Day E2E'` after the coach's edit | the plan row `train-day-d1` contains `Push Day`, then `Pull Day E2E` | A coach's plan edit reaches an open client tab on refocus, without a reload, within 10 s | B2 Train lists plan days as rows; only the up-next day is a heading — and in a full run an earlier spec has already trained today, so Train shows its "done" card instead of the up-next heading |
