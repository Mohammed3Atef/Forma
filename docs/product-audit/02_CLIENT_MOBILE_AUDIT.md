# 02 — Client mobile audit (390×844 primary)

> Phase A · Discovery only · 2026-10-04 · HEAD `e7663ab` (`development`); production runs RC2 `cf3a5d9` (per project notes, not re-verified). Browser evidence comes from the isolated stack (client "Nour Hassan" and frozen client "Salma Adel" of coach "Karim Mansour"). IDs: **CL-##** = client findings (this doc) · **NAV-C##** = client semantic navigation (input to 05/16). Related docs: 09_MESSENGER, 10_NOTIFICATIONS (NT-##), 11_PWA_CACHE_OFFLINE (PWA-##), 13_PERFORMANCE (PF-##), 15_PRODUCT_JOURNEYS, 16_TARGET_INFORMATION_ARCHITECTURE.

## Bottom line

- The client app has every feature a coached client needs, but it is laid out as **three overlapping navigation systems** with duplicated screens. It reads as a pile of features, not one daily loop (CL-01, CL-09).
- **P0:** Settings › Account › "Reset all data" deletes the client's synced history on the server, which is the record the coach reviews. The confirm text says it erases "local data" (CL-44).
- A hidden app-wide **"selected day"** decides the date of new workouts, food, cardio and measurements. Notifications, the week strip and History change it silently (CL-04, BV-02).
- The two most important task flows are fragile. The weekly check-in renders its CONTINUE button under the bottom nav (CL-42, BV-15). Ticking a set row that shows last time's numbers saves an **empty** set (CL-17).
- Coach intent doesn't reach the gym floor. Exercise notes, images and sections never appear in Train or the session. The one screen that shows notes is an orphan route (CL-13, CL-14, BV-17).
- Today is 2.8 screens tall at 390 and shows the date 4 times. After you train it still says "Start workout", and the finished row says "Resume session" (CL-09, CL-10, BV-16).
- Paying clients still see the old single-user tracker: Video manager, Import data, Update the app, sync widgets, and reminders titled "Gym Tracker" (CL-45, BV-18).
- Direction: 5 destinations (Today · Train · Nutrition · Progress · Coach) plus "You" behind the avatar. Remove the menu sheet, the bell, the separate Cardio/History/Library/Measurements/Photos destinations and every legacy tool. "Today" becomes the default tense everywhere (see 16).
- **Counts:** 50 CL findings (P0 1 · P1 12 · P2 25 · P3 12) + 7 NAV-C findings (P2 5 · P3 2).

## Method and evidence

| Source | What it covers |
|---|---|
| Code read | `src/apps/ClientApp.tsx`, shell (`AppShell`, `BrandBar`, `BottomNav`, `NavMenuSheet`, `DayNav`, `WeekStrip`, banners), all client pages and stores, `src/i18n/en.json`, and the server notification and sync routes the client depends on |
| Browser probes (390/360/375/430/1440, EN + ar-eg) | Page height in screens, targets under 44px (visual box; `.icon-btn/.chip/.seg/.sec-link/.btn-sm` get +8px of hit area via `::before`, `index.css:195-210`), text under 11px, overflow, nested cards, fixed/sticky positions |
| Screenshots | `evidence/client-*.png` (listed per screen) |
| Journeys | Cold open → workout → offline finish (`journey-client`), update mid-workout (BV-06) |
| CSS replica | Sticky behaviour inside `<main class="overflow-x-hidden">`, run in Chromium |

Verification tags follow DOC_SPEC: **BROWSER-VERIFIED** (seen in the browser), **CODE-CONFIRMED** (traced in code end to end), **INFERRED** (needs a device or production check).

---

## 1. App shell and global chrome

**Purpose:** get the client to today's action and any other destination with one hand. **The user should:** see where they are, switch area, notice coach activity.

| Element | What it is | Action | Why |
|---|---|---|---|
| BrandBar logo | Image, not a link (`BrandBar.tsx:34-38`) | REDESIGN | 60px on every screen, no function |
| Bell + badge | → `/notifications`, top-right | MERGE → Coach | Second inbox; one message = bell + Inbox badge + toast (NT-05) |
| ≡ Menu sheet | 13 rows in 4 groups, repeats all 5 tabs (`nav.ts:44-78`) | REMOVE | Third nav system; has to scroll |
| Tabs Today/Fuel/Progress/Inbox | 9.5px mono uppercase labels (`BottomNav.tsx:80`) | REDESIGN | Unreadable; breaks Arabic joining (BV-26) |
| Center FAB "Train" | No label; active = opacity 100 vs 90 (`BottomNav.tsx:35-51`) | REMOVE as nav | Looks like the main action, is a link |
| DayNav pill | Global day control on Today/Fuel/Cardio/Measurements (`AppShell.tsx:29`) | REMOVE as chrome | Mutates the app-wide day (CL-04) |
| SubscriptionBanner | Read-only notice on every page | REDESIGN | Can't be tapped |
| ReminderBanner / admin promos | Sticky over BrandBar; promos on every route (`App.tsx:124`) | REMOVE / MOVE → Today | NT-09, NT-10 |
| Toasts | Top-center stack | REDESIGN | Old items replay on cold open, covering ~400px (BV-01, NT-01) |
| Global rest-timer card | Floats above the nav (`AppShell.tsx:33-37`) | REDESIGN | Can't tap back to the workout |
| Page header | Mono eyebrow + 30px H1 | REDESIGN | ~90px; eyebrows "FORMA", "ATHLETE" |
| "Synced" chip | Today + 2× Settings | REMOVE | Wrong while data is pending (BV-05, PWA-11) |

**Mobile issues:**
- Reach: bell, menu, DayNav and every Back sit in the hard top zone.
- Space: content starts ~210px down on day-scoped pages.
- See CL-07 (safe areas), CL-05 (sticky), CL-08 (targets and text).

**States:**
- Boot: Splash → assessment gate.
- Cold open: replayed toasts (BV-01) and a moved day (BV-02).
- Offline: amber banner (OK).
- Pending sync: never shown (PWA-11).

### CL-01 — Three overlapping navigation systems; most screens light no tab
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REBUILD
- **Who / where:** client · all routes · 390
- **Evidence:** `nav.ts:29-78`; hidden doors `Home.tsx:173` (avatar → Settings) and `Progress.tsx:235-244` (calendar → History); no tab lit on History, Notifications, Settings (`evidence/client-history-390.png`, `client-notifications-390-full.png`, `client-settings-390-full.png`)
- **Expected vs actual:** Every screen belongs to one tab. / Tabs + unlabeled center link + a menu repeating the tabs + bell + hidden doors; 8 destinations light no tab.
- **Why it matters:** No mental model: "where is X?" has 2–3 answers, or none for Cardio, Assessment, Check-ins.
- **Direction:** 5 equal tabs + avatar → You; no menu sheet, no FAB as navigation (16).
- **Verified:** BROWSER-VERIFIED

### CL-02 — One destination, two or three names
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Fuel, Train, Inbox, Your coach, Settings, Assessment
- **Evidence:** Fuel → "Nutrition" (`Nutrition.tsx:187`, BV-39); Train → "Routines" (`Workout.tsx:54-56`), "Workout" on Today (`Home.tsx:275`); Inbox → coach name, "Messages" on the Coach page; menu "Coach" → "Your coach"; "Client assessment" on the client's own page (`evidence/client-assessment-390-full.png`)
- **Expected vs actual:** One name per destination. / Two or three each.
- **Why it matters:** Inconsistent names read as unfinished.
- **Direction:** Today, Train, Nutrition, Progress, Coach, You; drop decorative eyebrows.
- **Verified:** BROWSER-VERIFIED

### CL-03 — Chrome eats the first screen
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Today, Fuel, Cardio, Measurements, all titled pages · 390
- **Evidence:** Probe: BrandBar 60px, nav 72px; DayNav + `TopBar.tsx:33-63`; Measurements stacks DayNav AND a Back header (BV-38)
- **Expected vs actual:** Content within ~120px of the top. / ~210px of chrome; ~33% of an 844px screen.
- **Why it matters:** Premium apps lead with content.
- **Direction:** One compact header; date control inside content, only where needed.
- **Verified:** BROWSER-VERIFIED

### CL-04 — A hidden app-wide "selected day" silently dates new logs
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client · Today, Fuel, Cardio, Measurements, Train, Session · all widths
- **Evidence:** global `dayStore.ts:16-21`. Written by DayNav, week strip (`Home.tsx:145-148,179`), Recent (`:378`), History (`History.tsx:66-69`), toast building (`NotificationBell.tsx:76` → `noteTarget.ts:34`, NT-02). Read by `workoutStore.ts:150` (log id = date), `cardioStore.ts:65`, `Measurements.tsx:20`, nutrition (`App.tsx:52-58`). BV-02: DayNav "FRI 25 SEPT" under a "Sunday, October 4" header (`evidence/client-selected-day-hijacked.png`)
- **Steps / scenario:** Today → tap a past done day in the week strip → Done → Train → Start → log → Finish (or cold-open with an unread dated coach note, BV-02).
- **Expected vs actual:** New logs go to today unless I edit a past day on purpose. / Saved under the past date; Train and session never show it; an existing finished log reopens read-only.
- **Why it matters:** Silent wrong-day data corrupts adherence, streaks and coach review.
- **Direction:** Today is the default tense; past-day editing is local, visible ("Editing Mon 29 Sep") and resets; navigation never changes it.
- **Verified:** BROWSER-VERIFIED (BV-02); the logging consequence is CODE-CONFIRMED

### CL-05 — Sticky headers and footers inside `<main>` don't stick
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/workout/session`, `/check-in/:id` · all widths
- **Evidence:** `AppShell.tsx:27` (`overflow-x-hidden` on `<main>`, afeca13) makes `<main>` the sticky container. Affects `WorkoutSession.tsx:270,334` and `CheckIn.tsx:120,209`. Probe: check-in footer top 827 vs nav 772. CSS replica: header at −90 after a 150px scroll.
- **Expected vs actual:** Timer, Finish and Continue stay reachable. / They scroll away; Continue starts off-screen.
- **Why it matters:** Both focused flows lose their primary controls.
- **Direction:** Shell owns one scroll container (clip, not hidden); focused flows sit outside the tab shell with a pinned action bar.
- **Verified:** BROWSER-VERIFIED

### CL-06 — Loading a lazy route removes the whole shell
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · first visit to any lazy route
- **Evidence:** `ClientApp.tsx:149-179`: a single `<Suspense>` wraps `<Routes>`, and each route element renders its own `AppShell`.
- **Expected vs actual:** Tabs and header stay steady. / They are replaced by a skeleton until the chunk loads, so the nav blinks out.
- **Why it matters:** Perceived quality. The blink is brief when chunks are precached.
- **Direction:** Move the shell outside the suspense boundary.
- **Verified:** CODE-CONFIRMED

### CL-07 — Safe-area handling gaps on notched iPhones
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · iOS standalone PWA
- **Evidence:** top inset twice (`index.css:30` + `BrandBar.tsx:31`); RestTimerBar ignores the bottom inset (`AppShell.tsx:34`); RoutineDetail CTA `pb-[75px]` clears the nav by 3px with no inset (`RoutineDetail.tsx:133`); sheets have no bottom inset (`Sheet.tsx:126`)
- **Expected vs actual:** Insets applied once, by the shell. / Double top gap; timer and CTA overlap the taller iPhone nav.
- **Why it matters:** First impression on iPhone; overlaps workout controls.
- **Direction:** One inset strategy owned by the shell.
- **Verified:** INFERRED (emulated runs have no insets)

### CL-08 — Sub-44px targets and sub-11px text on daily screens
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Fuel, Cardio, Today, Session, Subscription, Check-in, History · 390
- **Evidence:** probe at 390 (visual boxes): Fuel "+ Add food" 67×16 and ✕ 32×32; Cardio delete 16×16 (×16); "VIEW ALL" 56×17; "Hide history" 77×20; phone link 94×18; slider track 308×8; session ‹ › and card icons 32px; History days 41×41. Text: nav labels 9.5px, week strip 9px, macro and weekday labels 8.5px.
- **Expected vs actual:** ≥44px targets, ≥12px text. / See evidence.
- **Why it matters:** Gym use is one-handed and wet-thumbed; the worst targets delete things.
- **Direction:** 44px target floor; ~12px type floor; no mono uppercase nav labels.
- **Verified:** BROWSER-VERIFIED

---

## 2. Today — `/` (`Home.tsx`)

**Purpose:** answer "what do I do now?". **The user should:** start or resume today's workout, see what's left (meals, steps), act on a coach request.

**Primary CTA:** START WORKOUT inside the hero. At 390 it sits ~20px above the bottom nav; at 360 it is below the first screen (`evidence/client-today-390.png`). It competes with the center FAB, 3 task rows, 2 coach cards, the weekly card, VIEW ALL and "Start empty workout".

**Density:** 2,388px tall (2.8 screens) at 390; 3.2 at 360, 3.1 at 375, 2.5 at 430. 18 cards, 8 of them nested. 49 text nodes under 11px (probe).

| Element | What it is | Action | Why |
|---|---|---|---|
| DayNav "TODAY" | Global date pill | REMOVE | Third date control; mutates the global day (CL-04) |
| Date eyebrow + 2-line greeting | `Home.tsx:159-171` | REDESIGN | ~100px; real date even when DayNav differs (BV-02) |
| Avatar → Settings | `:173` | MOVE | Only visible Settings door; becomes "You" |
| "Synced" chip | `:174` | REMOVE | Jargon; wrong while pending; "الزامن" in ar-eg |
| Week strip Sat→Fri | `WeekStrip.tsx` | REDESIGN (only date control) | Never shows the selected day; taps jump into sessions; clips Friday at 360/375 |
| Weekly check-in card | `:182-198` | KEEP, move to top | The one truly actionable item |
| Hero: ring + "Day n of N" + routine + START | `:208-252` | REBUILD | Ring duplicates task rows; wrong after training (CL-10) |
| "Today's plan" + "N LEFT" | 3 TaskRows (`:255-292`) | MERGE into hero | Same 3 pillars; dots look like checkboxes |
| "Your coach" + "From your coach" cards | `:295-296` | MERGE → Coach | Two coach cards; ⓘ icon for chat |
| Weekly goal 0/5 + streak | `:299-334` | MOVE → Progress | Goal from the assessment, not the plan (CL-11) |
| "This week" 4 tiles + volume chart | `:337-363` | REMOVE | One number per card; chart duplicates Progress |
| Recent ×3 + VIEW ALL | `:366-396` | MOVE → Train history | Duplicates History |
| "Start empty workout" | `:399-401` | REMOVE | Opens a list (CL-12) |

**Mobile issues:**
- 4 dates and 4 week summaries surround the CTA.
- Top-zone controls: greeting, avatar, DayNav.
- At 360, START drops below the fold.

**States:**
- No plan: WaitingForCoach, also during the first sync (CL-48).
- Load failed: Retry (good).
- Pending subscription: full-page gate under a DayNav.
- Read-only: banner + dimmed START, no reason given.
- Completed: no "done for today" state (CL-10).
- Cold open: replayed toasts (BV-01).

### CL-09 — Today is a 2.8-screen report that repeats itself
- **Priority:** P1      **Effort:** M      **Impact:** TRANSFORMATIVE
- **Action:** REBUILD
- **Who / where:** client · `/` · 390 (3.2 screens at 360, 2.5 at 430)
- **Evidence:** BV-16 (`evidence/client-today-390-full.png`): date ×4 (DayNav, `Home.tsx:161`, week strip, `:211`); pillars ×3 (`:215-221`, `:255-292`); week ×4 (`:299-363`); two coach cards
- **Expected vs actual:** One screen saying what to do now. / Repeated summaries; CTA ~20px above the nav.
- **Why it matters:** The daily entry point sets the product's feel.
- **Direction:** Adaptive hero + compact checklist + ≤1 coach item; trends → Progress, sessions → Train (16).
- **Verified:** BROWSER-VERIFIED

### CL-10 — After you train, Today still says "Start workout"
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · `/` · after finishing the day's workout
- **Evidence:** routine = `finished.length % days` (`Home.tsx:62-65`); no done state (`:244-247`); tap → `startSession` reopens today's finished log read-only (`workoutStore.ts:150-157`); done row subtitle "Resume session" (`Home.tsx:276`); rest day never shown. Browser, ar-eg Today after the journey's Oct 4 workout: ring 33%, row struck through with "كمل الجلسة", hero still "ابدأ التمرين" (`evidence/client-today-390-ar.png`; full page `shots/client-390-ar/390-today.full.png`)
- **Steps / scenario:** Finish today's workout → Done → Today.
- **Expected vs actual:** "Done for today" + what's next. / START WORKOUT again; it opens the finished session; done row says "Resume session".
- **Why it matters:** The main CTA contradicts what the client just did, every training day.
- **Direction:** Hero states: start · resume · done · rest day · waiting for coach; schedule-aware next session.
- **Verified:** BROWSER-VERIFIED (Start offered after finishing; "Resume session" on the done row); the destination is CODE-CONFIRMED

### CL-11 — The weekly numbers mislead
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/` (weekly card, This week, Volume trend)
- **Evidence:** BV-16: goal 0/5 vs a 4-day plan (seeded from the assessment, `AssessmentWizard.tsx:205`); "Down 20.3t" on day 2 compares a partial week (`Home.tsx:96-98,354-357`); tonnage tile (`:343`)
- **Expected vs actual:** Plan-matched goal; no trend for an unfinished week. / 0/5 and "Down 20.3t" on Sunday.
- **Why it matters:** False, demotivating signals on the home screen.
- **Direction:** Goal = plan sessions per week; compare complete weeks; tonnage out of headlines.
- **Verified:** BROWSER-VERIFIED

### CL-12 — "Start empty workout" opens the Routines list
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REMOVE
- **Who / where:** client · end of `/`
- **Evidence:** `Home.tsx:399-401` (`navigate('/workout')`); label from `en.json` `gt.startEmpty`. No ad-hoc workout feature exists.
- **Expected vs actual:** An empty session starts. / The Routines list opens.
- **Why it matters:** A button that does something other than what it says.
- **Direction:** Remove it, or build ad-hoc sessions deliberately inside Train.
- **Verified:** CODE-CONFIRMED

---

## 3. Train — `/workout` (`Workout.tsx`) and the orphan day view `/workout/routine/:dayId` (`RoutineDetail.tsx`)

**Purpose:** see the plan and start a routine. **The user should:** check the next day, review its exercises (video, cues), start.

**Primary CTA:** START THIS WORKOUT inside the open "Up next" accordion. **Density:** 1.3 screens. Only 13 interactive elements, because the exercise rows are not interactive (probe).

| Element | What it is | Action | Why |
|---|---|---|---|
| "WEEKLY PLAN / Routines" + ⓘ guide | `Workout.tsx:54-63` | REDESIGN; guide REMOVE | Third name for the tab; hard-coded method (CL-15) |
| Top "Resume / EDIT · day" button | `:65-70` | REDESIGN | EDIT becomes primary after finishing (CL-16) |
| Day accordion cards | Day · focus · title · "17 SETS" | KEEP (simplify) | Good overview; sections ignored |
| Exercise rows with ▷ tile | `:107-131` | REBUILD as links | Look playable, do nothing (CL-13) |
| START THIS WORKOUT | `:133-136` | KEEP + fix date | Uses the hidden day (CL-04) |
| RoutineDetail (orphan) | Sections, rest, notes, links (`RoutineDetail.tsx:102-138`) | MERGE as the day screen | Best plan view; deep-link only |
| RoutineDetail stat tiles | `:106-109` | REMOVE | One number per card |

**Mobile issues:**
- ⓘ and EDIT sit at the top.
- Exercise rows look tappable but give no feedback.

**States:**
- No plan / failed load: "hasn't assigned" (CL-48).
- Read-only: Start disabled; RoutineDetail labels the button with the status word (`RoutineDetail.tsx:135`).

### CL-13 — The plan's exercises lead nowhere; the real day view is an orphan route
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** client · `/workout`, `/workout/routine/:dayId` · 390
- **Evidence:** ▷ rows are plain `<li>` (`Workout.tsx:107-131`, `evidence/client-train-390-full.png`); RoutineDetail linked only from `clientNoteRoute` (`noteTarget.ts:26-33`, `evidence/client-routine-390-full.png`); exercise detail only via Library, PR rows or the orphan
- **Expected vs actual:** Tap an exercise → how-to, video, coach note. / Nothing happens; no path to exercise detail.
- **Why it matters:** Clients prepare by reading the plan; the app hides what it has.
- **Direction:** Train → day → exercise; delete the orphan route.
- **Verified:** BROWSER-VERIFIED

### CL-14 — Coach guidance never reaches the workout
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · Train, Session, Exercise detail
- **Evidence:** notes render only on the orphan, undated (`RoutineDetail.tsx:97,129`, `EntityNotes.tsx:70-78`); none in the session; `progressionNotes` and `equipment` never rendered; sections flattened (`workoutStore.ts:77-84`); images never shown though 273/909 have one (BV-17)
- **Expected vs actual:** Coach cue, image and note on the exercise while I lift. / On a page I can't reach.
- **Why it matters:** Coaching value is the coach's intent at the moment of execution.
- **Direction:** Exercise card with image, coach note, progression cue, sections; notes dated and scoped.
- **Verified:** BROWSER-VERIFIED (BV-17) + CODE-CONFIRMED

### CL-15 — "Training guide" is one coach's spreadsheet, shown to everyone
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REMOVE
- **Who / where:** client · `/workout` ⓘ
- **Evidence:** `TrainingGuideSheet.tsx:6-59` ("Coach's reference info from the sheet": "increase after ~5 extra reps", an RPE/RIR table, Egyptian-Arabic copy used for both ar and ar-eg).
- **Expected vs actual:** Guidance from the client's own coach, or a neutral RIR/RPE glossary where those terms appear. / A fixed methodology for every coach's clients.
- **Why it matters:** It contradicts coaches whose method differs.
- **Direction:** Remove it; explain RIR/RPE inline; coach-authored notes carry methodology.
- **Verified:** CODE-CONFIRMED

### CL-16 — After finishing, Train's top primary button is "EDIT · <day>"
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · `/workout`
- **Evidence:** `Workout.tsx:65-70` renders a gradient full-width button whenever the active log's day isn't the open accordion day.
- **Expected vs actual:** The next session is the primary action. / Editing a finished session is.
- **Why it matters:** Wrong emphasis; also driven by the hidden day (CL-04).
- **Direction:** A finished session is a secondary row in history.
- **Verified:** CODE-CONFIRMED

---

## 4. Workout session — `/workout/session` (`WorkoutSession.tsx`, `ExerciseCard.tsx`)

**Purpose:** log sets fast with rest timing. **The user should:** do the set, type or confirm weight×reps, tick, rest, move on, finish.

**Primary CTA:** ✓ per set (40px, right edge, mid-screen: good). FINISH sits top-right. Full-screen: no BrandBar, no tabs.

Evidence screenshots: `scratchpad/shots/journey-client/c1-04-sets-logged.png`, `c4-02-finish-sheet.png`; `evidence/client-session-direct-390.png`.

| Element | What it is | Action | Why |
|---|---|---|---|
| Header: ⌄ minimize · title + timer / "Not started — press Start" · START/FINISH | `:334-355` | REDESIGN | Second Start (CL-18); Finish in the hardest corner; header scrolls away (CL-05) |
| Progress bar "3/17 sets · 1.5t" | `:358-366` | REDESIGN | Tonnage is noise here |
| "EXERCISE 1 OF 5" + ‹ › (32px) | Single-exercise stepper (`:396-418`) | REDESIGN | No swipe, no auto-advance; resets to 1 on reload (CL-19) |
| Card icons ⓘ · video · ✕ (32px, 4px apart) | `ExerciseCard.tsx:69-96` | REDESIGN | ⓘ and video are often empty (CL-20); destructive ✕ next to them |
| Set grid Set/Prev/Kg/Reps/✓ | Ghost placeholders = last session (`:113-188`) | REDESIGN | ✓ on a ghost row saves nothing (CL-17); kg×reps for every exercise (CL-23) |
| ADD SET / − (removes the LAST set) | `:190-210` | KEEP | — |
| "UP NEXT" list | `:431-466` | KEEP | Useful; the only large target to change exercise |
| Rest card −15/+15/SKIP, pause = tap the readout | `RestTimerBar.tsx` | REDESIGN | Hidden pause; 36px buttons; covers Up next at 390; lost on reload (PWA-07) |
| Add exercise / Restore plan exercises | `:471-480` | KEEP | — |
| Finish sheet: duration (min) + SAVE / KEEP GOING / DISCARD | `:491-515` | REDESIGN | Duration prompt is friction; the discard confirm is titled "Finish workout?" |
| Summary "Strong session. Logged." + 4 tiles | `:240-261` | REDESIGN | CL-22 |
| Read-only finished view + EDIT | `:266-329` | KEEP | Good default |
| Read-only subscription block | `:134-143` | REDESIGN | CL-21 |

**Mobile issues:**
- Reach: FINISH and the stepper are at the top. The ✓ column is right-hand (good for right-handed, poor in RTL where it flips left).
- Keyboard: kg and reps both use `inputMode="decimal"`; no Enter/next behaviour.
- Wake lock while running (good).
- No persistent "workout in progress" bar after minimizing (NAV-C03).

**States:**
- Not started vs running: shown.
- Resuming after reload: spinner + "Working…".
- No session (deep link or reload): blank screen with "No active workout" and one WORKOUT button (CL-50).
- Offline: works locally (BV-05).
- Background → foreground offline: crash (BV-04, PWA-01).
- Completed: summary, then read-only view.

### CL-17 — Ticking a set that shows last time's numbers saves an empty set
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · `/workout/session` · all widths
- **Evidence:**
  - Placeholders are the previous session's values (`ExerciseCard.tsx:153-172`). They look close to typed values: sets 3–4 show grey "65 / 8" in `c1-04-sets-logged.png`.
  - ✓ only flips `done` (`workoutStore.ts:229-250`), so the set is stored with `weightKg:null, actualReps:null`.
  - Volume and PRs skip it; the coach and read-only views show "– × –" (`WorkoutSession.tsx:312`).
- **Steps / scenario:** Session → a row showing grey "65 / 8" → tap ✓ without typing.
- **Expected vs actual:** ✓ records what the row shows (or asks). / It records nothing, turns green and counts as done.
- **Why it matters:** Silent data loss in the core loop. PRs, progress and the coach's review go wrong.
- **Direction:** ✓ commits the displayed target or previous values. An empty row can't be ticked silently.
- **Verified:** BROWSER-VERIFIED — probe on the isolated stack: the row showed last session's "52.5 × 10" as placeholders; ticking ✓ without typing stored `weightKg:null, actualReps:null, done:true`, and the summary read "Strong session. Logged." with 0.0 t volume (see 15 JR-01)

### CL-18 — You start the workout twice
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Today/Train → session
- **Evidence:**
  - Journey C1: tap 1 START WORKOUT (Today), tap 2 "Start" in the session header.
  - Header shows "Not started — press Start" (`WorkoutSession.tsx:340-354`). Ticking a set also starts it (`workoutStore.ts:241-245`).
- **Expected vs actual:** One start. / Two. The timer isn't running until the second one.
- **Why it matters:** Friction on the most frequent flow; the duration is wrong if the user forgets.
- **Direction:** The session starts on entry (or on the first tick).
- **Verified:** BROWSER-VERIFIED

### CL-19 — Session controls fight one-handed use
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · `/workout/session` · 390
- **Evidence:**
  - START/FINISH top-right (`:346-354`).
  - 32px ‹ › with no swipe or auto-advance; the index resets on reload (`:98-101,396-418`).
  - Three 32px card icons, with the destructive ✕ 4px from video (`ExerciseCard.tsx:69-96`).
  - Rest pause only by tapping the readout; buttons 36px (`RestTimerBar.tsx:22-49`). The rest card covers "Up next" at 390 (`c1-04-sets-logged.png`).
  - The finish sheet asks for duration (`:491-503`).
  - The header doesn't stick (CL-05).
- **Expected vs actual:** Mid-workout controls in the bottom half, big targets, auto-advance. / Corner controls and tiny steppers.
- **Why it matters:** Used with one sweaty hand between sets.
- **Direction:** Bottom action bar (next / finish), swipe between exercises, auto-advance, big rest controls with a visible pause, a resume bar outside the session.
- **Verified:** BROWSER-VERIFIED (layout) + CODE-CONFIRMED (behaviour)

### CL-20 — Video and info buttons that do nothing
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · session, exercise detail
- **Evidence:** BV-07:
  - 863/909 exercises have no `videoUrl`, so the video button opens nothing. The local-asset fallback returns null (`VideoPlayerSheet.tsx:70`) because assets are never seeded for platform clients (`bootstrap.ts:66-69`, `clientSync.ts:41`).
  - Drive/Vimeo/Instagram links give a dead player at 0:00 with no message (`evidence/client-video-drive-link-dead-player.png`).
  - ⓘ opens an empty panel when there are no notes or tempo (`ExerciseCard.tsx:99-109`).
  - Same video button on exercise detail (`ExerciseDetail.tsx:84-88`).
- **Expected vs actual:** A control appears only when something is behind it. / Always shown; silent no-op.
- **Why it matters:** Dead buttons in the gym erode trust fast.
- **Direction:** Show media affordances only when playable; validate links when the coach authors them (07_EXERCISE_LIBRARY).
- **Verified:** BROWSER-VERIFIED

### CL-21 — A read-only subscription blocks viewing past workouts and mislabels the state
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · frozen/expired/cancelled/ended · History, Recent, RoutineDetail
- **Evidence:**
  - `WorkoutSession.tsx:134-143` blocks the whole route, so finished sessions can't be opened from History or Recent.
  - The message only distinguishes `ended` from everything else, so expired and cancelled clients read "Your subscription is paused".
  - RoutineDetail's button label becomes the status word (`RoutineDetail.tsx:135`).
  - Today's START is merely dimmed (BV-02 screenshot).
- **Expected vs actual:** History stays viewable; the reason and next step are explicit. / History is blocked and the state is named wrongly.
- **Why it matters:** Frozen and expired clients are exactly the ones a coach wants to win back.
- **Direction:** Read-only means view everything, explained once with one "Message coach" action.
- **Verified:** CODE-CONFIRMED (dimmed START BROWSER-VERIFIED)

### CL-22 — The finish summary celebrates tonnage and asks nothing
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · session summary
- **Evidence:** `WorkoutSession.tsx:240-261`:
  - "Strong session. Logged." with duration / volume t / sets / exercises tiles.
  - Shown again after editing an old session.
  - No PRs, no "vs last time", no effort rating or note for the coach.
- **Expected vs actual:** What improved, plus an optional "how did it feel / note for coach". / Four tiles of totals.
- **Why it matters:** The moment of highest motivation and the best moment to collect feedback for the coach.
- **Direction:** PR and comparison highlights; optional one-tap effort + note that lands in the coach view.
- **Verified:** CODE-CONFIRMED

### CL-23 — Every exercise is logged as kg × reps
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · session, Progress, Library
- **Evidence:** Fixed Kg/Reps grid (`ExerciseCard.tsx:21-22,113-127`); e1RM computed for everything (`prByExercise`); BV-36 shows "Plank 38kg" and "Pull-ups 109kg" (`evidence/client-exercise-library-390-full.png`).
- **Expected vs actual:** Holds, bodyweight and assisted movements log the right fields. / Kg columns and fake 1RMs.
- **Why it matters:** Wrong data and nonsense records for common movements.
- **Direction:** Each exercise has a logging type (weight×reps, reps, time, distance) set in the library.
- **Verified:** BROWSER-VERIFIED

---

## 5. Exercise detail and "Exercise library" — `/workout/exercise/:id`, `/workout/library`

**Purpose:** how to do an exercise and how I'm doing on it. **The user should:** watch or read before or during training; see last time and PR.

**Primary CTA:** none (video top-right). Height: 1.3–1.8 screens; the Library is 1.9.

| Element | What it is | Action | Why |
|---|---|---|---|
| Video button (top-right) | Coach URL or local asset (`ExerciseDetail.tsx:84-88`) | REDESIGN | Silent no-op for most exercises (CL-20) |
| Chips: muscle · 4×6-8 · "RIR 2" | `:92-107` | KEEP + explain RIR | Jargon with no explanation |
| LAST TIME rows | Values drawn in input-like boxes (`:110-139`) | REDESIGN | Looks editable; it isn't (CL-25) |
| PERSONAL RECORD card + 1RM trend | `:142-185` | KEEP | Good, but shown for planks too (CL-23) |
| HOW TO PERFORM | Notes split on "." and ";" (`:62-65,188-203`) | REDESIGN | Fragile parsing; no image (BV-17); no coach note |
| Library list (20 plan exercises, e1RM) + All/Upper/Lower chips | `ExerciseLibrary.tsx:24-46` | REMOVE destination | CL-24 |

**States:** Not found: TopBar + EmptyState + Back (good). No plan: WaitingForCoach. Library empty search: EmptyState with "Clear filters" (good).

### CL-24 — "Exercise library" is just the client's 20 plan exercises
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** client · `/workout/library` (menu only, `nav.ts:52`)
- **Evidence:** BV-36. It lists `plan.exercises` only (`ExerciseLibrary.tsx:39-46`). Categories are the first word of each day title (`:24-37`). The e1RM per row duplicates Progress › Strength.
- **Expected vs actual:** A real library, or nothing. / A duplicate list under a misleading name.
- **Why it matters:** One more destination to learn, with no new value.
- **Direction:** Remove the destination; reach exercise detail from Train, the session and PR rows.
- **Verified:** BROWSER-VERIFIED

### CL-25 — Exercise detail: read-only values look like inputs; empty affordances
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · `/workout/exercise/:id`
- **Evidence:**
  - "Last time" values sit in input-styled boxes (`ExerciseDetail.tsx:127-133`, `evidence/client-exercise-detail-390-full.png`).
  - The video button shows regardless (CL-20). No image (BV-17).
  - Cue splitting breaks "2.5 kg" into two cues (`:62-65`).
  - The RIR chip has no explanation.
- **Expected vs actual:** Read-only data looks read-only, and cues follow the author's structure. / It looks editable, and the parsing is fragile.
- **Why it matters:** Polish and trust.
- **Direction:** Typographic read-only rows, structured cues, inline RIR explainer.
- **Verified:** BROWSER-VERIFIED

---

## 6. Fuel / Nutrition — `/nutrition` (`Nutrition.tsx`)

**Purpose:** follow the coach's meal plan today. **The user should:** tick meals eaten, add water, take supplements, swap foods if allowed, add a snack.

**Primary CTA:** the per-meal ✓ (44px, right edge: good). **Density:** 2.6 screens; 21/35 targets under 44px; 4 severe (probe; `evidence/client-fuel-390-full.png`).

| Element | What it is | Action | Why |
|---|---|---|---|
| DayNav above "NUTRITION / Nutrition" | `AppShell.tsx:29`, `Nutrition.tsx:187` | REDESIGN | Date pill sits above the title; title repeats the eyebrow; the tab says "Fuel" (CL-02) |
| Remaining-kcal card + ring + 3 nested macro cards | `:190-225` | REDESIGN | Cards inside a card; 8.5px labels (CL-27) |
| Water card +250/+500/+1000/− | `:228-271` | KEEP | Two taps; clear |
| Meal cards: kcal/P/C/F line, ✓, items | `:274-549` | KEEP structure | Core of the page |
| Red ✕ on every planned food (32px) | Shown whenever substitutions are allowed (`:434-459`) | REDESIGN | Destructive control on every row (CL-26) |
| Swap / edit / reset (rotated chevron) icons | `:395-432` | REDESIGN | Unclear symbols, 32px |
| Per-meal "+ Add food" text link (16px tall) + global "ADD FOOD" button | `:529-539`, `:606-614` | MERGE | Two add paths that total differently (CL-26) |
| Custom-food card titled "Add food" | `:552-605` | MERGE | The heading is an action label |
| Supplements ✓ (36px) | `:617-661` | KEEP | — |
| Coach notes / beverages | `:664-689` | KEEP (collapse) | — |
| Inline coach notes under every food, meal, water, supplement | `EntityNotes` (`:265,463,540,650`) | REDESIGN | Noise when present; better as one "coach says" line per meal |
| Food editor sheet (wger search + name/qty/P/C/F) | `:691-748` | REDESIGN | CL-28 |

**Mobile issues:** ✕ next to ✓ on the right edge invites mis-taps. The 16px "+ Add food" link. The keyboard numeric pad blocks decimals in the macro fields. The page is long with 4–5 meals.

**States:**
- No plan: WaitingForCoach, also when loading failed (CL-48).
- Loading: TopBar + skeleton (good).
- Read-only: all actions hidden or disabled; no explanation beyond the banner.
- Offline: works locally.
- Sync: invisible.

### CL-26 — Fuel actions: a red ✕ on every planned food, and two "Add food" meanings
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/nutrition` · 390
- **Evidence:**
  - BV-39: every planned food row has a red ✕.
  - The per-meal "+ Add food" link is 67×16 (`:529-539`); a separate global button also exists (`:606-614`).
  - Extras added to a meal only count once the meal is ticked, while global custom foods always count (`nutritionStore.ts:49-63`).
  - The custom-food card is headed "Add food".
- **Expected vs actual:** Tick what I ate, swap if allowed, add a snack — one clear way each. / A destructive ✕ everywhere, and two add paths that total differently.
- **Why it matters:** Daily logging that produces wrong totals.
- **Direction:** Row tap = eaten; swap/remove behind a row menu; one add-food flow that asks "which meal".
- **Verified:** BROWSER-VERIFIED (UI) + CODE-CONFIRMED (totals)

### CL-27 — Fuel hierarchy: date above the title, cards inside cards
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · `/nutrition`
- **Evidence:** BV-39; `Nutrition.tsx:187,209-222` (8.5px macro labels).
- **Expected vs actual:** Title, then today's numbers. / Date pill, duplicate eyebrow, nested cards.
- **Why it matters:** Density and hierarchy on a daily screen.
- **Direction:** A flat macro row; a local date switcher inside the page.
- **Verified:** BROWSER-VERIFIED

### CL-28 — The food editor accepts anything
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · Fuel › Add food sheet
- **Evidence:** `Nutrition.tsx:133-148,718-739`:
  - Macros use `inputMode="numeric"` (no decimals).
  - No validation; an all-zero food saves; a blank name saves as "Custom food".
  - kcal is recomputed from macros even after picking a database food.
- **Expected vs actual:** Sensible validation, and the picked food's kcal kept. / Garbage in.
- **Why it matters:** The coach relies on these numbers.
- **Direction:** Validate inputs; keep the source kcal.
- **Verified:** CODE-CONFIRMED

---

## 7. Cardio — `/cardio` (`Cardio.tsx`), menu-only

**Purpose:** steps and cardio against the coach's target. **The user should:** log steps or a session, or run a live timer. **Density:** 2.7 screens, 19 cards, 16 severe targets (probe).

| Element | What it is | Action | Why |
|---|---|---|---|
| Destination | Menu › Daily › Cardio, or Today's row when a target exists | MERGE → Train + Today | Hidden; coaches prescribe cardio as training (CL-29) |
| "Daily activity goal" card | Steps or minutes; "Set by your coach" when NO goal exists (`:129-182`) | MOVE → Today | Misleading copy when unset |
| "Your cardio plan" (coach) | `:185-201` | MOVE → Train | Training content |
| Live timer + type chips; speed/incline sheet before Start | `:204-235,303-336` | MOVE → Train | Lost on reload or background (PWA-07); a sheet interrupts Start |
| "Log activity" sheet | Steps/min/km/kcal, no validation (`:268-300`) | REDESIGN | CL-30 |
| History (all dates, last 30), 16×16 delete | `:242-266` | MOVE → Progress | Not day-scoped under a DayNav; tiny destructive target |

**States:**
- Empty: "No cardio logged yet — log your first session above" (OK).
- Coach-plan error: silent.
- Raw enum key for unknown types (BV-28, `cardio.types.incline_treadmill`; root cause is the demo seeder plus unvalidated sync, PWA-13).
- Read-only: still writable (CL-31).

### CL-29 — Cardio is a hidden destination with mixed meanings
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** client · `/cardio`
- **Evidence:**
  - Reachable from the menu only (`nav.ts:51`), or from Today's row when a target exists (`Home.tsx:280-289`).
  - A DayNav sits on top while the history lists all dates (`Cardio.tsx:242-266`).
  - The coach plan lives here, not in Train.
  - `cardio.goalUnset` ("Set by your coach") shows when there is no goal.
- **Expected vs actual:** The cardio plan sits with training, and steps go on Today. / A separate menu page.
- **Why it matters:** Coaches prescribe cardio as training; clients log steps daily.
- **Direction:** Plan + live timer → Train; steps/minutes quick-log → Today; history → Progress.
- **Verified:** BROWSER-VERIFIED

### CL-30 — Cardio log saves empty entries; delete is a 16px icon
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/cardio`
- **Evidence:** `Cardio.tsx:90-109` (an empty form saves a 0-min entry and toasts "Saved"); delete at `:258` is a bare 16×16 icon (probe: 16 severe targets).
- **Expected vs actual:** You can't save nothing; delete is 44px with undo. / Junk entries and easy mis-taps.
- **Why it matters:** Junk ends up in the coach's view.
- **Direction:** Validate; swipe-to-delete with undo.
- **Verified:** BROWSER-VERIFIED (targets) + CODE-CONFIRMED (empty save)

### CL-31 — Cardio stays writable when the subscription is read-only
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · `/cardio` · frozen/expired
- **Evidence:** `cardioStore.addCardio` has no `isSubscriptionReadOnly()` check, while meals and workouts do (`nutritionStore.ts:124`, `workoutStore.ts:145`). The page has no read-only UI.
- **Expected vs actual:** One consistent rule. / Meals blocked, cardio allowed.
- **Why it matters:** Policy inconsistency the client notices.
- **Direction:** Decide whether "read-only" allows logging your own data, then apply it everywhere.
- **Verified:** CODE-CONFIRMED

---

## 8. Progress — `/progress` (`Progress.tsx`) · Photos · Measurements · History

**Purpose:** "is it working?". **The user should:** log weight; see trends, PRs, measurements, photos.

| Element | What it is | Action | Why |
|---|---|---|---|
| Header + calendar icon → History (top-right) | `:232-245` | MERGE | Hidden door; History belongs inside Progress or Train |
| WEIGHT/STRENGTH/MEASURE/PHOTOS segments | URL-synced (good) (`:247-258`) | REDESIGN | Measurements and Photos also exist as separate routes (CL-32) |
| Weight hero: 74.6kg, 7D…ALL chips, chart, + ADD WEIGHT | `:262-307` | KEEP | Core; the chips overflow ("Al…") |
| "Current" and "To goal" tiles | `:309-334` | REMOVE "Current" | Repeats the hero number; ↓2kg shown in red for a fat-loss client (CL-32) |
| Strength: top-lift 1RM chart + PR list | `:338-418` | KEEP | — |
| Weekly volume chart + 4 all-time tiles | `:421-466` | REMOVE | Duplicates Today; tonnage |
| Muscle split | `:467-497` | KEEP (optional) | Low decision value |
| Measure tab: header-in-card + "+ Log" → another route | `:501-560` | MERGE | Card-in-card; logging bounces to a page with its own DayNav (CL-36) |
| Photos tab | `ProgressPhotosBody` | KEEP + MERGE silos | CL-33, CL-34 |
| History calendar + month list | `History.tsx` | MOVE → Progress › Consistency / Train | CL-37 |

**States:**
- Empty: "Not enough data yet", "No records yet — finish a workout…", "No measurements yet…", photos EmptyState (good).
- The weight sheet silently ignores invalid input (`:214-216`).
- Assessment query error hides "to goal" silently.

### CL-32 — Progress repeats itself and colours weight loss red
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/progress` · 390
- **Evidence:** BV-37 (`evidence/client-progress-390.png`):
  - Measure and Photos segments duplicate their separate routes.
  - "Current 74.6kg" repeats the header number (`:265-270,309-334`).
  - The range chips overflow (scroller 346/316px).
  - "↓ 2kg this month" is red for a fat-loss client, because `StatTile.tsx:16` colours by direction, not by goal.
  - Strength repeats Today's volume chart and adds 4 tiles.
- **Expected vs actual:** Deltas coloured by the client's goal, and each number shown once. / Red for success, and duplicates.
- **Why it matters:** The motivation screen sends the wrong emotional signal.
- **Direction:** Goal-aware deltas; one Body area; Strength trimmed to PRs and trends.
- **Verified:** BROWSER-VERIFIED

### CL-33 — Body data lives in four silos
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** client · assessment, check-in, Progress, Measurements
- **Evidence:**
  - Weight is entered in the assessment (`AssessmentWizard.tsx:392-396`), the Progress sheet (`Progress.tsx:214-228` → weight logs) and the check-in (`CheckIn.tsx:147`, stored only on the check-in, `clientCheckIns.ts:126`).
  - The check-in weight starts at 0, not the last 74.6 kg (BV-15).
  - Check-in and assessment photos go to their own upload categories and never appear in Progress › Photos.
  - Measurements live on a separate route with their own date (CL-36).
- **Expected vs actual:** One body timeline fed by every entry point. / Four unconnected stores and double entry.
- **Why it matters:** The coach's view of progress depends on where the client happened to type.
- **Direction:** One body log (weight, measurements, photos) used by onboarding, check-ins and Progress.
- **Verified:** CODE-CONFIRMED (+ BV-15)

### CL-34 — Progress photos can silently never reach the coach
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · Progress › Photos · production
- **Evidence:**
  - `photoStore.ts:67-91` saves a local blob, then swallows CDN upload errors (`:85-90`).
  - The page toasts "Saved" (`ProgressPhotos.tsx:104-106`). No per-photo "not uploaded" state.
  - With production uploads failing (Bunny 401, 2026-10-03 report), every photo stays local-only.
- **Steps / scenario:** Progress › Photos › Gallery → pick → "Saved".
- **Expected vs actual:** "Saved — uploading…" or "Not sent — retry". / "Saved", and the coach sees nothing.
- **Why it matters:** Photos are a core coaching artifact; silent failure breaks trust on both sides.
- **Direction:** Explicit delivery state + retry; one upload outbox (PWA-12, MD doc).
- **Verified:** CODE-CONFIRMED

### CL-35 — Photo dates and the delete target
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · Photos
- **Evidence:** Raw ISO dates in the compare selects and gallery headers (`ProgressPhotos.tsx:158,184`); a ~22px ✕ overlaid on each image (`:190`).
- **Expected vs actual:** Localized dates; a safe delete. / ISO strings; a tiny ✕ on the photo.
- **Why it matters:** Polish; accidental deletes.
- **Direction:** Locale dates; delete from a photo viewer menu.
- **Verified:** CODE-CONFIRMED

### CL-36 — Measurements: 14 "0"s, a stacked header and silent data drops
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/progress/measurements` · 390
- **Evidence:** BV-38 (`evidence/client-measurements-390-full.png`):
  - DayNav + Back header stacked.
  - 14 fields whose placeholder "0" reads as a value (`MeasurementForm.tsx:101-110`).
  - `Number()` parsing drops "93,5" and Arabic-Indic digits yet still toasts "Saved" (`:80-82,88`).
  - An empty save creates an empty log.
  - Δ colours ignore "smaller is better" (Waist −3 in warning orange, `Measurements.tsx:91`; Progress uses `GOOD_WHEN_DOWN`).
  - "A / B / Δ" jargon.
- **Expected vs actual:** Enter only what I measured; numbers parsed in any locale; good changes look good. / The list above.
- **Why it matters:** Bad data and wrong signals on progress the client paid to track.
- **Direction:** Coach-chosen fields only, locale-aware parsing, goal-aware deltas, logged inside one Body flow.
- **Verified:** BROWSER-VERIFIED

### CL-37 — History: "1 workouts", tonnage headline, English weekday header
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · `/history`
- **Evidence:** BV-30 (`evidence/client-history-390.png`):
  - Weekday header hard-coded as `['S','S','M','T','W','T','F']` for every locale (`History.tsx:13`).
  - `gt.workoutsN` has no plural (`:134`).
  - Tonnage is the headline (`:135,158`).
  - Opening a day changes the global day (`:66-69`, CL-04).
- **Expected vs actual:** Localized, pluralized, with a meaningful metric. / The list above.
- **Why it matters:** Polish; context leak.
- **Direction:** Fold into Progress › Consistency or Train history.
- **Verified:** BROWSER-VERIFIED

---

## 9. Coach surfaces: Inbox, Notifications, "Your coach"

### 9.1 Inbox + thread — `/messages` (short; detail in 09_MESSENGER)

**Purpose:** talk to the coach. **The user should:** read and reply. **CTA:** composer + send (bottom-right: good). Evidence: `evidence/client-inbox-390.png`.

| Element | What it is | Action | Why |
|---|---|---|---|
| Header "← KM Karim Mansour" | Back button on a tab root (`Messages.tsx:66-71`) | REMOVE Back | Tabs don't go back (NAV-C01) |
| Thread (pending/failed/retry, load error vs empty, reactions) | `MessageThread.tsx` | KEEP | The most mature client surface |
| Composer image · mic · text · send | 44px controls | KEEP | Attachments and voice fail in prod (MS-02) |
| Measured-height layout + `-mb-28` | `Messages.tsx:20-50` | REBUILD (shell) | Symptom of the shell not owning the viewport (MS-03) |

**States:** loading = the text "Working…"; load error with Retry (good); empty "No messages yet."; no coach = EmptyState (good); no saved draft (MS-07).

### 9.2 Notifications — `/notifications` (short; detail in 10_NOTIFICATIONS)

BV-33 (`evidence/client-notifications-390-full.png`):
- 12 unread, and every row is titled "Karim Mansour".
- Three stale "Weekly check-in requested" rows stay unread after the check-ins were submitted.
- Dates in US M/D/YYYY.
- Eyebrow "FORMA"; pagination 15 per page; loader "Working…".

Covered by NT-01 (cold-open replay, BV-01), NT-02 (day change, BV-02), NT-03 (unread never clears), NT-05 (one notification per message), NT-06 (titles/dates) and NT-07 (wrong landings). The client-side direction is to fold the feed into the Coach tab (CL-38).

### 9.3 "Your coach" — `/coach-notes` (`CoachInbox.tsx`)

**Purpose (as built):** a catch-all. Evidence: `evidence/client-your-coach-390-full.png`, 1.7 screens.

| Element | What it is | Action | Why |
|---|---|---|---|
| "FORMA / Your coach" header | `:18` | REDESIGN | Meaningless eyebrow; the menu calls it "Coach" |
| "Messages" row with ⓘ icon | Link to the Inbox tab (`:25-29`) | REMOVE | Navigates to a tab from a page |
| Subscription card + pause form + history | Full `ClientSubscriptionSection` (`:32`) | REMOVE (duplicate) | Identical to `/settings/subscription` (BV-19); "CURRENT" pill clipped; "1 months total" |
| Targets grid (water/steps/cardio/kcal/protein) | `:35-46` | MOVE → Today/Nutrition context | Empty cells render blank; no context |
| Notes & announcements | `:49-76` | MERGE → Coach tab feed | Un-anchored notes are disabled rows; US date format |

### CL-38 — The coach relationship is spread over seven surfaces
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** client · Inbox, bell, `/coach-notes`, Today, Check-ins, Assessment, inline notes
- **Evidence:**
  - Surfaces: chat (Inbox tab), bell feed, the "Your coach" page, Today's `CoachInfoCard` + `CoachCard` (`Home.tsx:295-296`), Check-ins (menu only), Assessment (Settings › Account), inline notes.
  - One coach message produces a red bell badge + an Inbox badge + a toast (NT-05).
  - `assessment_reviewed` opens `/coach-notes`, which doesn't show the review (`clientProfile.ts:184`, NT-07).
  - Same theme as NT-12.
- **Expected vs actual:** One Coach place: the conversation, what my coach needs from me, and their notes. / Seven places with overlapping badges.
- **Why it matters:** Coaching is the product; it should feel like one relationship.
- **Direction:** A Coach tab: chat first, pinned to-dos (check-in due, assessment reviewed), notes feed; the bell folds in (16).
- **Verified:** BROWSER-VERIFIED

### CL-39 — "Your coach" is a catch-all page that duplicates Subscription
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** client · `/coach-notes`
- **Evidence:** BV-19 (`evidence/client-your-coach-390-full.png` vs `client-subscription-390-full.png`); `CoachInbox.tsx:25-76`.
- **Expected vs actual:** Each thing in one place. / Messages link + full subscription and pause form + targets + notes on one page.
- **Why it matters:** Two copies of billing; a junk-drawer page.
- **Direction:** Delete the page. Notes go to the Coach tab, subscription to You, targets into Today/Nutrition.
- **Verified:** BROWSER-VERIFIED

---

## 10. Assessment and first run — `/assessment` (`MyAssessment.tsx`), onboarding gates

**Purpose:** onboard once; later, review your answers and the coach's feedback. Evidence: `evidence/client-assessment-390-full.png` (2.4 screens).

| Element | What it is | Action | Why |
|---|---|---|---|
| "PROFILE / Client asses…" + SUBMITTED pill | Title truncated by the pill (`:62-71`) | REDESIGN | Coach wording on the client's page |
| Last updated / reviewed mini-cards | `:83-105` | REDESIGN | A card per date; US date format |
| Coach feedback | `:106-111` | MOVE → Coach | Only reachable via Settings › Account. Privacy: BV-12 shows the coach's PRIVATE note here (tracked in 03_COACH) |
| "Your coach" card (3rd copy) | `:113` | REMOVE | Duplicate |
| EDIT ASSESSMENT → 8-step wizard | `:115-122` | KEEP | A living document is right |
| Answers (`AssessmentView`) | Raw key `assessment.activities.moderate`; "8/10" wraps one character per line | REDESIGN | BV-27 (CL-40) |

**First-run sequence:**
1. Phone gate (`App.tsx:109`).
2. Password prompt sheet (`App.tsx:126`).
3. Assessment wizard (`ClientApp.tsx:138-144`).
4. Optional legacy profile overlay (`Onboarding.tsx`).
5. Today: "Waiting…" or "Subscription pending" (CL-41).

### CL-40 — The assessment page shows raw keys, broken wrapping and coach wording
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/assessment` · 390
- **Evidence:** BV-27:
  - "assessment.activities.moderate" appears raw: `lib/assessment.ts:35` defaults to 'moderate', but the wizard's list (`AssessmentWizard.tsx:40`) doesn't contain it.
  - "8/10" wraps one character per line.
  - The title is truncated by the status pill.
  - A third copy of the coach card.
- **Expected vs actual:** Clean, translated answers under "My assessment". / Raw keys and a broken layout.
- **Why it matters:** The client's first document with the coach looks broken.
- **Direction:** One taxonomy; answers as readable sentences; feedback first; move the page into Coach.
- **Verified:** BROWSER-VERIFIED

### CL-41 — First run is four gates and then a dashboard of zeros
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · first sign-in → Today
- **Evidence:**
  - `CompleteAccount` has no sign-out, and failures are silent: `try/finally` without `catch` (`CompleteAccount.tsx:20-28`).
  - `MustChangePasswordPrompt` re-appears on every reload until the password is changed, and stacks over the wizard.
  - Assessment wizard:
    - Fixed overlay with only logo + language; no exit or sign-out (`AssessmentWizard.tsx:253-263`).
    - 10+ answers pre-selected (`:57-72`), so tapping Next 6 times submits the defaults as the client's answers.
    - Next is disabled without saying why (`:80-99,308`).
    - Raw `e.message` errors.
    - The done screen doesn't say what happens next (`:226-247`).
  - Then Today shows WaitingForCoach without an action, a 0/5 goal, four 0 tiles and "Start empty workout" (`Home.tsx:200-205,298-345,399`), or "Subscription pending" under a date navigator.
- **Expected vs actual:** A short onboarding with an exit, then "your coach is building your plan — message them". / Gates, fabricated defaults and zeros.
- **Why it matters:** The first ten minutes decide whether a client trusts the app.
- **Direction:** Minimal required profile; deferrable sections; explicit choices; one real waiting state with one action (15_PRODUCT_JOURNEYS).
- **Verified:** CODE-CONFIRMED

---

## 11. Check-ins — `/check-in/:id` (`CheckIn.tsx`), `/check-ins` (`CheckInHistory.tsx`)

**Purpose:** the weekly report the coach uses to adjust the plan. **The user should:** answer 4 short steps and submit.

**Primary CTA:** CONTINUE / SUBMIT, rendered under the bottom nav (BV-15).

| Element | What it is | Action | Why |
|---|---|---|---|
| BrandBar + bottom nav around the wizard | Normal tab shell (`ClientApp.tsx:154`) | REMOVE (full-screen flow) | Four chrome layers in a focused task |
| Wizard header ‹ · title · ✕ + progress + "~4 MIN LEFT" | `:120-136` | REDESIGN | "min left" is really steps left; ✕ discards everything |
| Body: weight stepper (starts at 0), energy and sleep sliders at 5 | `:140-159` | REDESIGN | Not prefilled from the last weight (74.6); unlabeled 1–10 scales; 8px slider track |
| Training/Nutrition adherence sliders at 80% | `:50,161-187` | REDESIGN | Untouched sliders submit plausible fake answers |
| Notes + 3 pose photo pickers | `:189-205` | MERGE | The photos never reach Progress › Photos (CL-33) |
| Footer CONTINUE/SUBMIT | `sticky bottom-0` (inert) (`:209-218`) | REBUILD | Hidden under the nav (CL-42) |
| Read-only summary + coach feedback | `:99-115` | KEEP | Good |
| History list | `CheckInHistory.tsx:34-53` | MOVE → Coach | Menu-only; empty state doesn't explain (CL-43) |

### CL-42 — The weekly check-in hides its Continue button and loses answers
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · `/check-in/:id` · 360 / 375 / 390 / 430
- **Evidence:**
  - BV-15 (`evidence/client-checkin-step1-390.png`).
  - Probe: footer top 827 vs nav top 772 at 390; 763 vs 708 at 360; 795 vs 740 at 375; 915 vs 860 at 430.
  - Sticky is inert (CL-05). Weight starts at 0. Defaults are 80%/5. "~4 MIN LEFT" is invented.
  - ✕, a tab, the bell or the menu discard all answers with no guard (NAV-C04, PWA-12). Weight isn't written to the weight log.
- **Steps / scenario:** Today › Weekly check-in card → step 1.
- **Expected vs actual:** A full-screen task with a pinned Continue, prefilled from my data, with a safe exit. / Continue invisible until you scroll; defaults that look like answers.
- **Why it matters:** Check-ins drive plan changes. A bad flow means late or fabricated check-ins.
- **Direction:** Full-screen flow (no tab bar), pinned action bar, prefill, unset sliders with anchor labels, autosave/confirm on exit.
- **Verified:** BROWSER-VERIFIED

### CL-43 — Check-ins are hard to find and their states mislead
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** MOVE
- **Who / where:** client · `/check-ins`, `/check-in/:id`
- **Evidence:**
  - Reachable only via the Today card (while requested) or Menu › Coach › Check-Ins (`nav.ts:67`).
  - "No check-ins yet." never says the coach starts them (`CheckInHistory.tsx:36-39`).
  - A failed or offline fetch shows "No check-ins yet" / "Check-in not found." (`CheckIn.tsx:89-96`).
- **Expected vs actual:** Check-ins live in Coach; empty and error states are honest. / Buried, and errors read as facts.
- **Why it matters:** The weekly ritual should be obvious.
- **Direction:** Check-ins inside the Coach tab; "Your coach will send a check-in each week" empty state.
- **Verified:** CODE-CONFIRMED

---

## 12. Profile / Settings — `/settings` (`Settings.tsx`)

**Purpose:** account and preferences. **The user should:** change name, photo, phone, password, language; sign out.

Reached only from the menu or Today's avatar. 1 identity card + 3 tabs for ~20 controls. Evidence: `evidence/client-settings-390-full.png` (Preferences tab, 1.8 screens).

| Element | What it is | Action | Why |
|---|---|---|---|
| "ATHLETE / Settings" + "Synced" chip | `:279-283` | REDESIGN / REMOVE chip | Eyebrow is noise; chip is jargon |
| Identity card: photo picker, name, member since | `:286-294` | KEEP | — |
| PROFILE / PREFERENCES / ACCOUNT tabs | `:296-302` | REDESIGN | Too much structure for this few controls |
| Name (debounced autosave), phone (save on blur) | `:304-318` | KEEP | Good saved/failed feedback |
| Change password | Under Profile (`:354-358`) | MOVE → account/security | — |
| Language EN / ع / مصري | `:370-378` | KEEP | — |
| Default rest (sec) · Weekly workout goal | `:379-384` | REMOVE (coach-owned) | The plan defines both; the goal input snaps to 1, so typing "3" becomes "13" |
| Keep screen awake · Vibration | `:385-390` | KEEP (session settings) | — |
| Notifications switch | Controls local reminders only (`:391-397`) | REDESIGN | Implies coach notifications; there is no push (NT-04) |
| Reminders editor | Time + kind + add; fires only while open; "Gym Tracker" title (`:401-426`) | REMOVE | Legacy (NT-09) |
| Tools: Video manager · Import data · Update the app | `:428-447` | REMOVE | BV-18 (CL-45) |
| Account: coach card · Assessment link | `:453-465` | MOVE → Coach | Coach content in settings |
| Account: Subscription row | `:467-471` | KEEP (single home) | Also duplicated in the menu and the Coach page |
| "Cloud backup & sync" card + Sign out inside it | `:473-514` | REMOVE card; Sign out → own row | Sign out is hidden in a sync widget |
| Data: storage notice · Clear this day's data · Reset all data | `:516-527` | REMOVE | CL-44 (P0), CL-45 |

### CL-44 — "Reset all data" deletes the client's coaching history from the server
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REMOVE
- **Who / where:** client · `/settings?tab=account` · all
- **Evidence:**
  - Client: `Settings.tsx:257-275` calls `wipeCloud()` then `clearAllLocalData()` (`cloudStore.ts:153-168`, `SyncEngine.ts:173-179`).
  - Server: `trpc.sync.wipe` deletes all of the caller's sync records, singletons and tombstones (`api/_trpc/routers/sync.ts:114-122`).
  - The coach's views read exactly those records (`api/_trpc/routers/clientLogs.ts:24-72`, `coachClients.ts:155`).
  - The confirm text says "This erases ALL local data and restores the default plan. This cannot be undone." (`en.json` `settings.resetConfirm`), under a card titled "Cloud backup & sync".
- **Steps / scenario:** Menu › Settings › Account › "Reset all data (start fresh)" → confirm.
- **Expected vs actual:** No such control for coached clients, or an explicit, coach-aware account deletion. / Every synced workout, meal, weight, measurement and photo record disappears for the client and the coach.
- **Why it matters:** Irreversible loss of the coaching record from a mislabelled troubleshooting button.
- **Direction:** Remove for clients. Any deletion becomes a support- or coach-mediated account action with explicit copy.
- **Verified:** CODE-CONFIRMED (client and server path read end to end; not executed)

### CL-45 — Legacy tracker tools and sync internals in a paying client's Settings
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REMOVE
- **Who / where:** client · `/settings` (Preferences, Account), `/settings/videos`, `/settings/import`
- **Evidence:** BV-18 (`evidence/client-video-manager-390.png`, `client-import-data-390.png`, `client-settings-390-full.png`):
  - Video manager is always empty: assets are never seeded for platform clients.
  - Import data takes pasted sheet rows or JSON and can never match anything.
  - "Update the app" unregisters the service worker (`:241-255`).
  - The "Cloud backup & sync" widget shows status, email, last sync time and "Sync now".
  - "Offline storage is protected" notice.
  - "Clear this day's data" acts on the hidden selected day (`:221-239`, CL-04).
  - Reminders are titled "Gym Tracker" (`reminderStore.ts:72,89,96`) and include a "Creatine" kind.
- **Expected vs actual:** Settings a client understands. / Developer and single-user tools.
- **Why it matters:** It makes the product feel unfinished, and the destructive ones are dangerous.
- **Direction:** Delete the tools. Keep sync silent unless something is pending. Sign out gets its own row.
- **Verified:** BROWSER-VERIFIED

### CL-46 — Settings structure: three tabs, coach-owned values, buried Sign out
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/settings`
- **Evidence:**
  - 3-tab segmented control (`Settings.tsx:296-302`).
  - Sign out is a ghost button inside the sync card (`:494-511`).
  - Client-editable rest default and weekly goal; the goal input clamps on every keystroke (`:379-384`).
  - The "Notifications" switch only governs local reminders (`:391-397`).
- **Expected vs actual:** One grouped list: profile, subscription, preferences, help, sign out. / Tabs, misplaced controls and a hidden exit.
- **Why it matters:** Basic account tasks take hunting.
- **Direction:** A single "You" screen behind the avatar.
- **Verified:** BROWSER-VERIFIED (layout) + CODE-CONFIRMED (behaviour)

---

## 13. Subscription states (`lib/subscription.ts:10-36`, `useSubscription.ts:14-56`, `SubscriptionGate.tsx`, `SubscriptionBanner.tsx`, `ClientSubscriptionSection.tsx`)

| State | Access | Today / Train / Session | Fuel / Cardio | Banner | Subscription page | Verified |
|---|---|---|---|---|---|---|
| No coach | full | WaitingForCoach + zero dashboard; "hasn't assigned" | "hasn't assigned" | none | "You don't have a coach yet…" | CODE |
| Waiting for coach (coach set, no plan) | full | WaitingForCoach (also during first sync; CL-48) | same | none | per subscription | CODE |
| Coach + no subscription / pending | limited | "Subscription pending" + Message coach, **under a date navigator** | gated | none | "No subscription yet…" | CODE |
| Trial | full | nothing says trial or when it ends | — | none | "TRIAL" pill with no tone, dates | CODE |
| Active, renewal due | full | nothing (Nour: term ends 2026-10-13, 9 days) | — | none | ACTIVE, ISO dates, price, pause form, history | BROWSER |
| Frozen | readonly | amber banner; START dimmed with no reason; session route blocked, including past sessions | Fuel actions hidden; **cardio still writable** | "paused · read-only — contact your coach" (not tappable) | pause form still offered | BROWSER (BV-02) |
| Expired / cancelled | readonly | red banner; the session block says "paused" | same | expired/cancelled copy | same | CODE |
| Ended | readonly | red banner; "ended" copy | same | "ended… renew" | same | CODE |
| Read failed | full (fails open) | normal | normal | none | "No subscription yet" (error shown as empty) | CODE |

### CL-47 — Subscription state is invisible until it bites
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · Today, `/settings/subscription`, read-only states
- **Evidence:**
  - No trial, days-left or renewal message for the client; only coach screens use `subscriptionDaysLeft`. Nour's page shows a term ending in 9 days with no warning (`evidence/client-subscription-390-full.png`).
  - Dates use `toISOString().slice(0,10)` (`ClientSubscriptionSection.tsx:19-21`, `SubscriptionHistory.tsx:7`), which shows the previous day for local-midnight timestamps in UTC+2/+3. Native date inputs display US mm/dd/yyyy.
  - The pause form is offered when already frozen or ended. The pill has no tone for trial/pending/expired/cancelled (`:13-18`).
  - The banner can't be tapped (BV-02). The pending gate sits under a DayNav.
  - "No subscription yet" renders while loading (`:50-59`).
- **Expected vs actual:** Status, days left and the one next step, visible before it matters. / Silence, then a block.
- **Why it matters:** Renewals and reactivations are revenue; surprises cause churn.
- **Direction:** One subscription status line on You and Today when due (≤7 days), localized dates, actions that fit the state, one "Message coach" action.
- **Verified:** BROWSER-VERIFIED (screens) + CODE-CONFIRMED (date math, loading)

---

## 14. Offline states (short; detail in 11_PWA_CACHE_OFFLINE)

| Scenario | What the client sees | Evidence |
|---|---|---|
| Installed PWA reopened offline (HEAD) | "Something went wrong" crash (CSS preload of the non-precached `SitePages` chunk) | BV-03 `evidence/client-offline-reopen-crash.png`, PWA-01 |
| Same path in RC2 | Login screen; unusable offline | BV-03, PWA-01 |
| Offline mid-workout, background → foreground | Crash on `/workout/session` | BV-04, PWA-01 |
| Workout finished offline | Kept locally, synced ~1.4s after the next online boot; "Synced" chip unchanged; no pending UI | BV-05, PWA-11 |
| Offline while the app is open | Amber banner; local logging works; coach screens show errors as empty states (CL-49) | OfflineBanner |
| Phone sleeps or the app updates mid-activity | Rest timer, live cardio timer, exercise index and check-in answers are lost | BV-06c, PWA-07, PWA-10 |

---

## 15. Loading / empty / error experience

| Screen | Loading | Empty | Error / offline | Notes |
|---|---|---|---|---|
| Today / Train / Fuel | none / none / skeleton | WaitingForCoach (no action) | Today has Retry; Train and Fuel show "hasn't assigned" | CL-48 |
| Session | spinner + "Working…" | "No active workout" dead end | works offline locally | CL-50 |
| Inbox / thread | "Working…" text | "No messages yet." | load error + Retry (good) | 09 |
| Notifications | "Working…" | "No notifications yet." | none | NT-06 |
| Check-in / Check-ins | skeleton | "No check-ins yet." | **"Check-in not found." / "No check-ins yet."** | CL-49 |
| Assessment | "Working…" | "Assessment not started yet." | **same text when the fetch failed** | CL-49 |
| Subscription | **"No subscription yet" while loading** | EmptyState (good copy) | same as empty | CL-47 |
| Your coach | sections pop in | "No notes from your coach yet" | errors = empty | CL-49 |
| Photos | per-image skeleton | EmptyState with instruction (good) | upload failure invisible | CL-34 |
| Measurements / Cardio / Weight | — | instructive empty copy (good) | save errors inline (Measurements) / silent (weight sheet) | CL-36 |

### CL-48 — "Waiting for your coach" when the plan simply hasn't loaded
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Today, Train, Fuel · fresh device / failed load
- **Evidence:** Today treats `contentSync.status === 'idle'` as empty (`Home.tsx:201-205`). Train and Fuel ignore `failed` (`Workout.tsx:31-38`, `Nutrition.tsx:64-71`). WaitingForCoach has no action (`WaitingForCoach.tsx`).
- **Expected vs actual:** "Loading your plan…" / "Couldn't load — retry", and a real waiting state with "Message coach". / "Your coach hasn't assigned a plan yet".
- **Why it matters:** It tells a paying client their coach did nothing.
- **Direction:** Separate loading, error and waiting states; waiting gets one action.
- **Verified:** CODE-CONFIRMED

### CL-49 — Online-only screens show errors as facts
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Check-in(s), Assessment, Subscription, Your coach, Notifications
- **Evidence:**
  - React Query defaults (`networkMode` online, `retry:1`, no persisted cache) (`services/platform/queryClient.ts`).
  - Failed or paused reads render "Check-in not found." (`CheckIn.tsx:89-96`), "No check-ins yet." (`CheckInHistory.tsx:36-39`), "Assessment not started yet." (`MyAssessment.tsx:77-80`), "No subscription yet" (`ClientSubscriptionSection.tsx:50-59`).
  - Loaders are the text "Working…".
  - Offline mirroring of coach data is missing (PWA-15).
- **Expected vs actual:** "You're offline — showing what we have" / "Couldn't load — retry". / A false fact.
- **Why it matters:** Clients act on false statements, e.g. redoing an assessment.
- **Direction:** A distinct error state everywhere, plus cached copies of coach data.
- **Verified:** CODE-CONFIRMED

### CL-50 — `/workout/session` without a session is a dead end
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client · `/workout/session` reload or deep link
- **Evidence:** `evidence/client-session-direct-390.png`: black screen, "No active workout", one WORKOUT button, no header or tabs (`WorkoutSession.tsx:145-154`).
- **Expected vs actual:** Back to where I was, or straight to the plan. / An empty screen.
- **Why it matters:** Happens after evictions or reloads mid-gym.
- **Direction:** Redirect to Train (or resume the persisted session).
- **Verified:** BROWSER-VERIFIED

---

## 16. Forms (client)

| Form | Fields and input types | Validation / error placement | Primary action | Exit / guard | Offline | Findings |
|---|---|---|---|---|---|---|
| Weekly check-in | Weight stepper (`type=number`, starts at 0); 5 sliders (8px track, preset 80/5); notes; 3 photo pickers | None per field; submit error above footer | Under the bottom nav | ✕, tabs and bell discard silently | Submit fails; answers lost on navigation | CL-42, NAV-C04 |
| Assessment wizard (8 steps) | Text, date, chips, decimal (Arabic digits OK), sliders, tags, photos | Only 2 steps validated; Next disabled without a reason; raw `e.message` | Footer inside the card (works) | Local draft autosave (good); no exit | Raw error; draft kept | CL-41 |
| Measurements | 14 decimal text fields, placeholder "0" | None; invalid values silently dropped | Save at the end of the form (keyboard covers it) | None | Local-first | CL-36 |
| Weight sheet | `type=number`, step 0.1 | Invalid → nothing happens, no message | In sheet | Sheet | Local-first | CL-32 |
| Food editor | wger search + name/qty text + P/C/F numeric | None; zeros allowed | In sheet | Android Back changes the page underneath (NAV-C05) | Local | CL-28 |
| Cardio log | Type chips + 4 decimal fields | None; empty form saves | In sheet | Sheet | Local | CL-30 |
| Set logging | kg/reps decimal cells + ✓ | Ghost values not applied | ✓ per row; FINISH top-right | Persisted (good) | Local | CL-17, CL-19 |
| Pause request | 2 native dates (US format) + reason | Disabled until valid, no reason given; generic error | In card | None | Generic error | CL-47 |
| Profile name / phone | Debounced text; `type=tel` (no autocomplete) | Saving / Saved / Couldn't save (good) | Autosave | — | Network-bound | CL-46 |
| Change password | 3 password fields, placeholder-only labels | Every error (incl. "wrong current password") shows under *new* password; raw text | In sheet | Sheet | Raw error | — |
| Phone gate | `tel` + autocomplete | None; failure silent | Button | No sign-out | Silent | CL-41 |
| Chat composer | Textarea + attach + voice | Send disabled when empty | Bottom (good) | Draft lost | Pending / failed / retry (good) | 09 |

**Cross-form issues:**
- Only the phone gate uses a `<form>`, so Enter/Go submits nothing anywhere else. No `enterKeyHint`.
- `type=number` and text+`inputMode` are mixed: "93,5" works in some fields and is dropped in others.
- No client screen uses the existing unsaved-changes guard (NAV-C04).

## 17. One-hand review — client journeys at 390×844

Thumb-easy zone is the bottom third. The hard zone is the top ~200px: bell and menu (y≈30), DayNav (y≈92), Back and titles (y≈110), session FINISH (y≈40).

| Journey | Path (taps) | Hard-zone taps | Blockers | Findings |
|---|---|---|---|---|
| Start today's workout, log 4 sets, finish | START → Start → ✓×4 → FINISH → SAVE = 8 (journey C1 measured 10 incl. a video) | 2 | Double start; ghost tick; 32px stepper | CL-17, CL-18, CL-19 |
| Tick a meal | Fuel → scroll → ✓ = 2 | 0 | Red ✕ beside ✓ | CL-26 |
| Add water | Fuel → +250 = 2 | 0 | — | — |
| Log today's steps | Today › Cardio row → Log activity → steps → Save = 4 (5 via ≡ when no target is set) | 0–1 | Menu-only destination | CL-29 |
| Log weight | Progress → + ADD WEIGHT → type → Save = 3 | 0 | Invalid input is silent | CL-32 |
| Log measurements | Progress → MEASURE → + Log → fields → Save = 4 + up to 14 fields | 1 | Hidden date; "0" placeholders | CL-36 |
| Add a progress photo | Progress → PHOTOS → Gallery → pick = 3 | 1 | Upload failure invisible | CL-34 |
| Weekly check-in | Today card → [scroll to CONTINUE] ×3 → SUBMIT = 5 taps + 4 scrolls | ✕ top | CTA under the nav | CL-42 |
| Message coach | Inbox → type → send = 2 | 0 | — | — |
| Read the coach's assessment feedback | ≡ → Settings → ACCOUNT → Assessment → scroll = 4 | 3 | Hidden in Settings | CL-38, CL-40 |
| When does my subscription end? | ≡ → Subscription = 2 | 1 | No days-left shown | CL-47 |
| Watch an exercise video before training | Train rows inert → ≡ → Exercise library → exercise → video = 4; 863/909 open nothing | 2 | No path from the plan | CL-13, CL-20 |
| Resume a minimized workout from Fuel | Today → RESUME = 2 | 0 | No resume bar | NAV-C03 |
| Sign out | ≡ → Settings → ACCOUNT → scroll → Sign out → confirm = 5 | 3 | Buried in the sync card | CL-46 |

## 18. Width and locale notes

- **360×780:** Today is 3.2 screens. The week strip scrolls sideways and clips Friday. The hero wraps, so START sits below the first screen. Check-in footer under the nav (763 vs 708). Fuel is 2.8 screens.
- **375×812:** Today 3.1 screens; the week strip scrolls; check-in footer under the nav (795 vs 740).
- **430×932:** Today 2.5 screens; the week strip fits; check-in footer still under the nav (915 vs 860).
- **1440:** The client app is a 448px column with a full-width bottom nav. Inbox shows hover controls on every message (19 targets under 24px). Desktop is not a client target.
- **ar-eg (BV-26):**
  - English dates on Today and the week strip (`i18n.language === 'ar'` checks miss `ar-eg`).
  - Mono letter-spacing breaks Arabic letter joining in the DayNav and nav labels.
  - Units are untranslated, and bidi reorders "g 60".
  - The read-only session shows "60 8 × كجم" and "Handed Kettlebell Swing 2".
  - The ✓ column flips to the left edge.
  - Detail is in the RTL/visual doc.

## 19. Semantic navigation (summary — full findings in 05_INFORMATION_ARCHITECTURE)

| ID | Finding | P |
|---|---|---|
| NAV-C01 | Back means different things on similar screens; the Inbox tab has a Back button; some menu pages have Back, others don't | P2 |
| NAV-C02 | Reload or a cold deep link falls back to parents the user never visited (session → Train, exercise → Library, assessment → Settings); the session position resets | P2 |
| NAV-C03 | Workout session exits are inconsistent; a running session is invisible from other tabs | P2 |
| NAV-C04 | No exit protection in any client flow (check-in, measurements, food editor) | P2 |
| NAV-C05 | Hardware/browser Back doesn't match on-screen Back in sheets and wizard steps | P2 |
| NAV-C06 | Back restores the URL but not the scroll position | P3 |
| NAV-C07 | Orphan, duplicate and legacy routes (`/workout/routine/:dayId`, `/progress/photos`, `/settings/app`, `/settings/videos`, `/settings/import`, `/coach-notes`) | P3 |

Notification deep links (wrong screens, day change) are NT-07 and NT-02.

## 20. Top 10 client problems

| # | ID | Problem | P | Effort | Impact | Action | Verified |
|---|---|---|---|---|---|---|---|
| 1 | CL-44 | "Reset all data" wipes the coach-visible server history behind "local data" copy | P0 | S | HIGH | REMOVE | CODE-CONFIRMED |
| 2 | CL-04 | Hidden global day silently dates workouts, food and cardio (notifications, week strip, History change it) | P1 | M | HIGH | REBUILD | BROWSER-VERIFIED |
| 3 | CL-42 | Check-in CONTINUE is hidden under the nav; answers lost; fake defaults | P1 | S | HIGH | REDESIGN | BROWSER-VERIFIED |
| 4 | CL-17 | ✓ on a ghost row saves an empty set | P1 | S | HIGH | REDESIGN | BROWSER-VERIFIED |
| 5 | CL-09 + CL-10 | Today: 2.8 screens of duplicates; still "Start workout" after training | P1 | M | TRANSFORMATIVE | REBUILD | BROWSER-VERIFIED |
| 6 | CL-13 + CL-14 | Plan rows lead nowhere; coach notes, images and sections never reach the session | P1 | M | HIGH | MERGE | BROWSER-VERIFIED |
| 7 | CL-01 | Three navigation systems; most screens light no tab | P1 | L | TRANSFORMATIVE | REBUILD | BROWSER-VERIFIED |
| 8 | CL-38 | The coach relationship is spread over seven surfaces | P1 | M | HIGH | MERGE | BROWSER-VERIFIED |
| 9 | CL-41 | First run: four gates, fabricated defaults, then a dashboard of zeros | P1 | M | HIGH | REDESIGN | CODE-CONFIRMED |
| 10 | CL-45 | Legacy tracker tools and sync internals in Settings | P1 | S | HIGH | REMOVE | BROWSER-VERIFIED |

Next in line: CL-34 (progress photos can silently never reach the coach) and PWA-07 (live timers lost on reload/background).
