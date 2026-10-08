# 15 — Real product journeys (Client + Coach)

> Phase A · Discovery only · 2026-10-04 · HEAD `e7663ab` (production runs RC2 `cf3a5d9`)
> Method: every journey was driven in a real browser against an **isolated** stack (in-memory Mongo, local Bunny stand-in, email off) seeded with a realistic coach ("Karim Mansour") and 10 clients in every subscription state. PWA / offline / update journeys used a **production build** with a working service worker and `vercel.json`-equivalent headers. Video playback used real Google Chrome 153. Viewport 390×844 (Pixel 7 profile, touch) unless stated. Nothing touched production.

## Bottom line

- **No journey is broken end-to-end in the happy path, but almost every journey has a moment where the product works against the user.** Examples: four stale toasts cover the screen at app open; the check-in's Continue button sits below the fold; a ticked set saves nothing; adding one exercise takes 10 taps through 3 stacked back buttons.
- **The two journeys that matter most for a gym product are the least safe.** The client morning workout (C1) can record empty sets that still look "logged". The bad-network journey (C4) crashes the app the moment the phone is locked or the app is reopened without signal.
- **The coach morning (J1) has no answer to "who needs me now?"** 9 of 10 clients are flagged "Needs attention". The one with a waiting check-in is found by luck or by memory.
- **Coach programming (J2/J3) is a desktop editor folded onto a phone.** There's no media preview before adding an exercise, and food search results are unidentifiable.
- **Updates (C5) never interrupt a workout, which is good.** But the first open after a deploy always shows the old version, and nothing tells anyone an update exists.

## Scorecard

| Journey | Goal | Taps (+ typing) | Outcome | Worst moments |
|---|---|---|---|---|
| **C1** Client morning | Open → see workout → start → video → log sets → finish → progress | 9 taps + 2 fields per set (≈60 interactions for a 17-set session) | ✅ completes | Replayed toasts cover Today at open (BV-01) · "Start workout" then "Start" again · ticking ✓ without typing saves `null` weight/reps but says "Logged" · Finish is top-right |
| **C2** Client check-in | Notification → check-in → submit → home | 7 taps + typing | ✅ submits | Step-1 Continue below the fold (844–892px on an 844px screen) · weight defaults to 0 · bottom nav stays inside the wizard · ends on the check-in page, not home |
| **C3** Client messaging | Open coach chat → react → reply → image → voice → back | 9–10 taps | ⚠ mostly | Back chevron on a root tab · first voice note needs an explainer + OS prompt · in production every image/voice upload fails (Bunny 401) |
| **C4** Bad network | Workout offline → finish → close/reopen → reconnect | — | ❌ **P0** | Reopen offline → "Something went wrong" · lock/unlock offline mid-workout → same crash · the data survives locally and syncs on the next online boot |
| **C5** App update | Using app → deploy → continue → update → reopen | 0 | ⚠ | Reopen after deploy shows the **old** build for the whole session · no update UI · new build lands on the next background (silent reload; workout state survives) |
| **J1** Coach morning | Find who needs attention → open → review check-in → respond | 6 taps + typing *(only because the tester knew who)* | ⚠ | 9/10 clients "Needs attention" · status chip shows account status, not subscription · check-ins tab leads with "Request" while a submitted one waits |
| **J2** Modify program | Clients → client → workout → add exercise → preview → save → back | **10 taps** + typing | ⚠ | 3 stacked back buttons · mandatory "section" level · picker has no media or preview · Back after save lands on the Clients list |
| **J3** Library | Find exercise → preview → understand → add; find food → identify → add | Exercise 4–7 taps; food 2 taps + typing | ⚠ | New coach's library is empty until "Load starter library" · no "add to plan" from the library · 14 identical "chicken" results |
| **J4** Coach messaging | Client → messages → reply → back | 4 taps + typing | ✅ | Back correctly returns to the client (header button, overview card, tab) — keep this |
| **J5** Business / renewal | Dashboard → renewal → subscription → action → return | 4 taps to the action | ⚠ | 7 competing actions on the subscription tab · the **expired** client never appears as an actionable item anywhere |

Measured context for all journeys (BV-25): a returning client reaches Today in **1.0 s on Slow 4G / 1.5 s on 3G**, and a first visit takes **4.8 s / 9.3 s**. The returning-client time is spent waiting on three sequential network round trips, even though all the data is already on the device. Production adds Vercel cold starts and Atlas latency on top.

---

## C1 — Client morning: Today → workout → video → sets → finish → progress

**Route path:** `/` → `/workout/session` → (video popup) → summary → `/progress` · prod build · client "Nour Hassan"

| # | Action | Observed |
|---|---|---|
| 0 | Cold open of the installed app (already signed in) | Today rendered in 345 ms unthrottled. **Four stacked toasts for old notifications** ("Weekly check-in requested" ×2, an old coach note, an old check-in review) cover the top ~400 px for 5 s: header, date, greeting, week strip and the check-in card (`evidence/client-cold-open-replayed-toasts.png`, BV-01). Two are for check-ins already submitted. |
| 0 | Read Today | The date appears **4 times** before the workout (day navigator, eyebrow, week strip, card eyebrow). START WORKOUT sits at y≈727 px, just above the bottom nav (y≈770). Today is 2.8 screens long (BV-16). |
| 1 | START WORKOUT | Opens `/workout/session` in a "not started" state. |
| 2 | **Start** (session header) | Second start, the "double start" (see 02). The timer begins. |
| 3–4 | Video icon on the exercise → close | Popup plays the wger `.MOV`: for Romanian Deadlift that is a **38 MB 1920×1080** file over mobile data with no poster or loading state (BV-07). |
| 5–7 | Type kg + reps, tick ✓ (×3 sets) | Works. A rest timer card (2:30, −15/+15/Skip) slides over the "Up next" area. |
| — | Tick ✓ **without typing** (probe on another client) | The row showed last session's "52.5 kg × 10" as placeholders. The stored set is **`weightKg:null, actualReps:null, done:true`**. The summary says "Strong session. Logged." with **0.0 t volume** (BROWSER-VERIFIED). |
| 8–9 | FINISH (top-right) → confirm in sheet | Summary: duration, tonnage, sets, exercises. |
| 10 | Progress tab | Weight chart. Strength is one more tap. |

**Confusing moments**
- Replayed toasts at open.
- Two "start" buttons.
- Placeholders that look like logged values.
- "Exercise 1 of 5" stepper arrows (32 px, top-right) are the only way between exercises.
- FINISH is the most prominent control on screen during the whole workout.

**Wrong navigation / dead ends**
- Opening `/workout/session` directly (deep link, or reload with nothing active) shows a near-empty screen: "No active workout" + a "WORKOUT" button, no nav and no context (`evidence/client-session-direct-390.png`).

**Loading**
- None visible; the client's data is local.

**Visual problems**
- The rest-timer card covers content.
- Tonnage ("1.9 t") is the headline metric for a fat-loss client.

**Errors**
- None.

**Unnecessary steps**
- The second Start.
- Manual exercise stepping.
- 2 field entries per set even when repeating last time's numbers. There's no "same as last time" action; ticking appears to do it but saves nothing.

**Verdict.** It works, and it can corrupt the coach's view of adherence without anyone noticing. The empty-set save is a **P1 data-quality issue**, and it's the single most important session fix.

## C2 — Client check-in from a notification

**Route path:** bell → `/notifications` → `/check-in/2026-09-21` · dev stack · client "Karim Tarek"

| # | Action | Observed |
|---|---|---|
| 1 | Bell (top-right) | Notifications list: every row is titled "Karim Mansour" (the coach), followed by a type label. Stale check-in requests stay unread (BV-33). |
| 2 | "Weekly check-in requested" | The 4-step wizard opens on top of the normal app chrome (brand bar + **bottom nav still visible**). |
| — | Step 1 · Body | Weight is pre-filled **0**, although the client's last weight is on the device. Energy/Sleep sliders default to 5/10. **The CONTINUE button is at y=844–892 px on an 844 px viewport, so it is invisible until you scroll** (`evidence/client-checkin-step1-390.png`, BV-15). |
| 4–6 | Continue ×3 | Steps 2–3 show Continue at y≈668–716, visible. |
| 7 | Submit (step 4) | Status becomes `submitted`. **The app stays on the check-in page**: no "done → back to Today", and the next step is unclear. |

**Confusing moments**
- Invisible primary action on the first step.
- Untouched sliders submit plausible-looking fake answers.
- "~4 min left" is an invented estimate.
- The global tabs and the wizard's ✕ both leave the wizard and discard all answers (code: see 02).

**Errors**
- Progress photos in the check-in go through the same media upload, which fails in production today (Bunny 401).

**Unnecessary steps**
- Re-typing weight that the app already knows.

**Verdict.** Short and mostly linear, but it fails the first-screen test. A wizard should own the whole screen and keep its primary action under the thumb.

## C3 — Client messaging: read → react → reply → image → voice → back

**Route path:** Inbox tab `/messages` · dev stack · client "Karim Tarek"

| # | Action | Observed |
|---|---|---|
| 1 | Inbox tab | Opens the single coach thread directly (good: no list for a 1:1 relationship). A **Back chevron is shown on a root tab**. Brand bar + thread header + composer + bottom nav leave about 490 px for messages on an 844 px phone. |
| — | Long-press a coach message to react | Not reproduced with synthetic touch in this pass. Covered by `e2e3/specs/32-messenger.touch.spec.ts`; see 09. |
| 2 | Type + send | Sends, with "Sent", then "Seen" later. |
| 3–5 | Paperclip → pick image → send | Works on the isolated stack. **In production every attachment upload currently fails (Bunny 401).** |
| 6–9 | Mic → explainer dialog "Allow microphone access" → Continue → (OS prompt the first time) → stop → send | The pre-permission explainer is good practice. That makes 4–5 taps for the first voice note. |

**Confusing moments**
- Back on a root destination.
- Toasts for incoming messages also fire while the thread is open (see 10).

**Verdict.** The send engine is solid: idempotent sends, retry, edit/delete, reactions. The experience around it is generic chat squeezed between permanent app chrome. It is also disconnected from the coaching context (check-ins, plan changes, notes) that the same coach writes elsewhere. See 09.

## C4 — Bad network: start → lose signal → continue → finish → close/reopen → reconnect  **(P0)**

**Route path:** prod build with service worker · `/workout/session` · CDP offline

| # | Action | Observed |
|---|---|---|
| 1 | Online: start workout, log 3 sets | OK. |
| 2 | **Go offline** | An orange banner appears: "You're offline — showing saved data. Changes sync when you reconnect." Good copy. The "Synced" chip elsewhere doesn't change. |
| 3 | Log a 4th set, Finish, confirm | Summary: "Workout complete. Strong session. **Logged.**" The data is only on the device, and the copy doesn't distinguish "saved on device" from "synced". |
| 4 | **Close the app and reopen it, still offline** | **"Something went wrong. Reloading usually fixes this."** (`evidence/client-offline-reopen-crash.png`, BV-03). Cause: the boot path needs `auth.refresh` from the network → it fails → the session is treated as signed-out → the router lazy-loads the public website chunk (`SitePages`), which is deliberately excluded from the precache → the chunk load fails → ErrorBoundary. In RC2 (production) the same path shows the **login screen** instead, which is still unusable offline. |
| 5 | (Separate run) Offline, lock and unlock the phone mid-workout | **Same crash** on `/workout/session`. The foreground handler re-reads the account; any failure, including no network, signs the user out (BV-04). |
| 6 | Reconnect without restarting the crashed page | Nothing reached the server within 45 s. |
| 7 | Reopen online | The stranded workout synced within **1.4 s** (BV-05). **No data was lost in this path.** |

Separately measured: a workout finished **online** took **114 s** to reach the server, because sync runs on an interval. A coach looking during that window sees nothing.

**Verdict.**
- The local-first data layer did its job: the data survived.
- The **identity layer turns "no signal" into "signed out"**, and HEAD turns "signed out" into a crash.
- For a gym product this is the most damaging reliability issue in the app. Full analysis, including account-switch data loss, is in 11.

## C5 — App update while in use

**Route path:** prod build, build A → "deploy" build B (new SW precache revision + visible marker)

| Scenario | Observed |
|---|---|
| App closed, deploy happens, user opens the app | **Old build A** is served from the SW precache. The new SW installs and waits. The user stays on A for the **whole foreground session**: 73 s tested, including the 60 s update poll firing. B arrives only after the first backgrounding, through a **silent reload** (BV-06a). |
| Returning user, mid-workout, deploy happens | The update is detected on the next visible check → waiting → no UI → on backgrounding the page reloads into B within 5 s. **The workout survived:** ticked set, typed-but-unticked weight and elapsed timer were restored from IndexedDB. In-memory state does not survive: rest timer, chat drafts, check-in answers (BV-06c). |
| First-visit tab (not SW-controlled at load) receives an update | The new SW takes control, but **the page never reloads**: old JS keeps running under the new SW. After a real deploy (new chunk hashes, old caches cleaned) the next lazy route 404s → ErrorBoundary (BV-06d). |
| Any scenario | **No "update available" message anywhere.** The client's only manual path is Settings → "Update the app", which clears every cache. |

**Verdict.**
- The deferred-reload design is the right instinct: it never yanks a workout.
- What's wrong is that it's *invisible* and *slow*. The first open after a deploy is always stale.
- Nothing tells the user or the support team which version is running.
- The safe-point idea needs to become explicit (see 11 §25 proposal).

---

## J1 — Coach morning: who needs me → open → understand → review → respond

**Route path:** `/coach` → `/coach/clients` (mobile index) → `/coach/client/aud-omar` → More → Check-ins

| # | Action | Observed |
|---|---|---|
| 0 | Open the app | Mobile lands on **Clients**, not the dashboard. Bell shows 6 and Messages shows 3. |
| 0 | "Who needs me?" | **9 of 10 rows say "Needs attention" in red.** Every status chip says **ACTIVE**, because it shows the admin *account* status, not the subscription: frozen, expired, cancelled, trial and pending clients all read ACTIVE (BV-20). One row says "Check-in awaiting…". The WhatsApp support button floats over the row chevrons. |
| 1 | Omar row | The workspace header shows "Fat loss · 2 days left" (renewal due). The tab rail shows Overview / Workout / Nutrition / Progress. **"More" is off-screen** at 390 px (BV-32). |
| 2–3 | More → Check-ins | The primary CTA is **"Request weekly check-in"**. The submitted check-in waiting for review is a plain row below it (BV-31). |
| 4 | The submitted row | Expands inline with "Mark reviewed" + feedback. |
| 5–6 | Type feedback → Mark reviewed | Done. |
| 7 | Back | Returns to the Clients list. |

The alternative entry, Dashboard (one tap), says "10 clients need you today". Its first "Needs attention" items are all "assessment awaiting review" (9 pending assessments), and Laila is badged **AT RISK** only because her assessment is unreviewed (BV-24).

**Verdict.**
- 6 taps is fine *if you already know who*. The product doesn't tell you.
- Attention signals are computed but undifferentiated: everything is red, the status chip is the wrong status, and the review queue sits two levels deep.
- This is the coach's daily core loop, and it needs a dedicated triage surface (see 16).

## J2 — Modify a client's program

**Route path:** `/coach/clients` → `/coach/client/aud-nour` → Workout tab → day → section → picker → save

| # | Action | Observed |
|---|---|---|
| 1 | Nour row | Workspace overview. |
| 2 | Workout tab | Plan header + a paragraph explaining versioning ("Save updates the client's plan immediately — no history is kept unless you use 'Save as new version'"), plus "Save as template" / "Save as new version" / "History". |
| 3 | Day "Upper — Push" | **Three stacked back affordances**: workspace header ‹, editor "‹ Workout plan", breadcrumb "‹ WORKOUT PLAN" (`evidence/coach-day-builder-390.png`). |
| 4 | Section "Workout · 5 exercises" | A mandatory level that the coach never asked for. Day cards read "0 sections · 5 exercises". |
| 5 | Add exercise | The picker sheet opens. |
| — | Type "front squat" | 3 results **sorted alphabetically**: Double Kettlebell Front Squat, Dumbbell Front Squat, Front Squats. **No thumbnails, no "has video" indicator, no preview.** The first result has no media; the canonical one is third (`evidence/coach-exercise-picker-390.png`, BV-08). |
| 6–7 | Select → Add selected | Added. |
| 8 | SAVE PLAN | Saved. The client sees it on next refresh (verified). |
| 9 | Back (workspace header) | **Lands on the Clients list**, not the client: workspace tabs replace history. |

**Verdict.**
- 10 taps and 3 back buttons for "add one exercise".
- The coach cannot judge an exercise before committing it.
- Separately verified, and far more serious: if the plan failed to load, this same editor shows an **empty plan** and Save **overwrites the client's real plan** with no version kept (**P0**, BV-11, `evidence/coach-editor-empty-after-failed-load.png`).

## J3 — Library: find → preview → understand → add (exercise and food)

**Exercise** (`/coach/library`): ☰ menu → Library (2 taps).
- **For a new coach the library is empty**, with "Create your first exercise" and a "LOAD STARTER LIBRARY" text button squeezed next to a truncated search field (BV-10).
- Loading copies 909 exercises + 84 foods + 9 templates into the coach's account, taking 3 more taps: load, confirm, dismiss.
- Searching "bench press" gives 17 text-only rows. Opening "Bench Press" shows the video in a sheet, which plays in Chrome. Muscles, equipment and instructions are visible here.
- There is **no "add to plan / template" from the library**. The coach must go back through J2 and find the exercise again in a picker that shows no media.
- On Slow 4G the library takes **4.8 s** to show its first row (an 835 KB payload, re-fetched on every refocus).

**Food** (nutrition editor → Add food, 1 tap):
- A list of the coach's foods, alphabetical text rows with macros and no images.
- External search for "chicken" returns **14 rows all named "chicken"**, from 106 to 188 kcal per 100 g, with no brand, image or source to tell them apart.
- Arabic queries return nothing (see 08).

**Verdict.** Discovery is text-only on both sides. The coach can't *see* what they're giving a client until it is already in the plan.

## J4 — Coach messaging from a client and back

**Route path:** `/coach/clients` → Nour → header Message → `/coach/messages/aud-nour` → reply → Back

- 4 taps plus typing.
- **Back returns to the client overview**, whether the thread was opened from the header button, the overview's Messages card, or another tab. Browser Back returns to the tab you came from (BV-34). **KEEP this behaviour** and make it the rule everywhere.
- Caveat (BV-14): when a coach plan banner is showing (plan ending in ≤ 5 days, lapsed, over capacity, or a plan request pending), the thread's composer is pushed **under the bottom nav and can't be reached** (composer top 842 px vs nav 772 px at 390×844; `evidence/coach-thread-composer-under-nav.png`). **P0 for those coaches.**

## J5 — Business: renewal → subscription → action → return

**Route path:** `/coach/dashboard` → "Upcoming renewals" → Omar → More → Subscription → Set term

| # | Action | Observed |
|---|---|---|
| 1 | Omar in "Upcoming renewals" (dashboard, far down) | Tappable → workspace overview. |
| 2–3 | More → Subscription | **7 competing actions:** SET TERM, Set price, Freeze, Extend +30d, END SUBSCRIPTION, CANCEL, history (`evidence/coach-client-subscription-390.png`, BV-35). "Cancel" reads like "close this dialog". |
| 4 | Set term | Sheet opens. The agent's code review found the form can prefill from first render rather than the current term (see 03). |

**Blind spots found during J5 (BV-23):**
- **Youssef's subscription expired 5 days ago.** He appears on Revenue only as a count ("1 EXPIRED"), with no name, row or action, and not at all on the dashboard.
- The trial client (conversion), the pending client (payment) and the cancelled client are likewise counts only.
- Revenue on mobile is 17 cards: the first KPI repeats the hero, and 6 status tiles repeat the donut legend.

**Verdict.** The renewal *mechanics* exist. The renewal *workflow* (who is lapsing, who already lapsed, who never paid, who is in trial) does not.

---

## One-hand review (brief §31)

Thumb-reach ratings for a right-handed user holding a 6.1–6.7″ phone: **Easy** = bottom third, **Stretch** = middle, **Hard** = top corners.

| Control | Where | Size | Reach | Notes |
|---|---|---|---|---|
| Client bottom nav, incl. center Train button | bottom | 64 px center, labels 9.5 px | Easy | Good thumb zone. Labels are too small (see 14). |
| START WORKOUT (Today hero) | y≈700–750 | 48 px | Easy | Barely above the nav, and only after 4 date rows. |
| Session **FINISH** | top-right | 42 px | **Hard** | The most consequential action sits in the hardest corner and is styled as primary for the whole session. |
| Session exercise stepper ‹ › | top-right of the card | 32 px | **Hard** | The only way to move between exercises. No swipe, no auto-advance. |
| Set ✓ / kg / reps | middle | 40 px | Stretch | OK size, but ✓ without typing saves null. |
| ExerciseCard info / video / remove icons | top-right of each card | **32 px** | Hard | Small, and the video icon is dead for 95% of exercises. |
| Rest timer −15 / +15 / Skip | bottom card | 36 px | Easy | Covers "Up next" content. |
| Check-in CONTINUE (step 1) | **below the fold** | 48 px | **Not visible** | Needs a scroll before the first answer can be submitted. |
| Fuel per-food red ✕ | right edge | ~28 px | Stretch | Destructive-looking, on every planned row. |
| Every screen's Back ‹ | top-left | 44 px (36 px dense) | **Hard** | Android back works (history-based), but iOS has no gesture fallback inside some flows. |
| Bell / ☰ menu | top-right | 40 px | **Hard** | The bell holds the replayed toasts' items. ☰ holds 13 destinations. |
| Coach workspace message / edit icons | header, left | 36–40 px, icon-only | Stretch | Unlabelled on mobile. |
| Coach tab rail | top third | 11 px mono labels | Hard + overflow | "More" is off-screen. |
| Coach plan builder "SAVE PLAN" | top-right, scrolls away | 48 px | **Hard** | No sticky bottom action bar in the editors. |
| WhatsApp FAB (coach) | bottom-right | 44 px | Easy, but **in the way** | Covers list chevrons and buttons on every coach page. |
| Bottom sheets (Sheet) | bottom | — | Easy | Keep. The sheet primitive is solid. |

**Pattern:** the product puts its most important and most destructive actions in the top corners (Finish, Save plan, Back, bell), and its least important floating element (WhatsApp) in the thumb zone.

---

## Journey findings (JR-)

### JR-01 — The empty-set "Logged" session
- **Priority:** P1  **Effort:** S  **Impact:** HIGH  **Action:** REDESIGN
- **Who / where:** client · `/workout/session` · 390
- **Evidence:** BROWSER-VERIFIED (probe: placeholders "52.5 × 10", stored `null/null/done:true`, summary "0.0 t … Logged"); code `src/components/ExerciseCard.tsx:153-184`, `src/stores/workoutStore.ts:229-250`
- **Expected vs actual:** ticking a set records the shown values · ticking records nothing
- **Why it matters:** silently corrupts adherence, volume and PRs, and the coach sees "– × –"
- **Direction:** ✓ must commit the displayed values (or offer "same as last time"). A set without numbers is never shown as logged.
- **Verified:** BROWSER-VERIFIED

### JR-02 — Coach morning has no triage surface
- **Priority:** P1  **Effort:** M  **Impact:** TRANSFORMATIVE  **Action:** REBUILD
- **Who / where:** coach · `/coach` → `/coach/clients` · 390
- **Evidence:** BV-20, BV-24, BV-31; `evidence/coach-clients-390-full.png`, `coach-dashboard-390-full.png`
- **Expected vs actual:** the landing screen answers "who needs me, for what, in what order" · 9/10 clients flagged, wrong status chip, review queue two levels deep
- **Direction:** one ranked queue (check-ins to review, messages, lapsing/expired subscriptions, missed sessions) as the coach's home. See 16.
- **Verified:** BROWSER-VERIFIED

### JR-03 — Renewal workflow blind spots
- **Priority:** P1  **Effort:** M  **Impact:** HIGH  **Action:** REDESIGN
- **Who / where:** coach · `/coach/revenue`, `/coach/dashboard`
- **Evidence:** BV-23 (expired client appears only as "1 EXPIRED")
- **Expected vs actual:** expired, trial-ending and pending clients appear as named rows with one action · counts only
- **Direction:** lapsing/lapsed lists inside the triage queue. Revenue becomes a report, not a workflow.
- **Verified:** BROWSER-VERIFIED

### JR-04 — Update arrives a session late and invisibly
- **Priority:** P1  **Effort:** M  **Impact:** HIGH  **Action:** REDESIGN
- **Who / where:** all roles · installed PWA
- **Evidence:** BV-06 (a)–(d); `src/main.tsx:17-45`; `vite.config.ts` (`registerType:'prompt'`, `skipWaiting:false`)
- **Expected vs actual:** a deploy is picked up at the next safe point and is visible to the user · first open after a deploy is always stale; switch happens on a silent background reload; a first-visit tab can run mixed versions
- **Direction:** deterministic update UX (see 11 §25)
- **Verified:** BROWSER-VERIFIED

### JR-05 — Check-in wizard does not own the screen
- **Priority:** P1  **Effort:** S  **Impact:** HIGH  **Action:** REDESIGN
- **Who / where:** client · `/check-in/:id` · 390
- **Evidence:** BV-15; C2 measurements (step-1 CTA at 844–892 px)
- **Direction:** full-screen flow without tabs, sticky bottom action, prefill known values, confirm before discarding answers
- **Verified:** BROWSER-VERIFIED

### JR-06 — Text-only exercise and food discovery
- **Priority:** P1  **Effort:** M  **Impact:** HIGH  **Action:** REDESIGN
- **Who / where:** coach · picker sheets · 390
- **Evidence:** BV-08, J3 food search ("chicken" ×14)
- **Direction:** media-first rows (thumbnail, "video" badge, preview without leaving the picker), canonical/quality ranking, identifiable food results. See 07/08.
- **Verified:** BROWSER-VERIFIED

### JR-07 — Mobile plan editing depth
- **Priority:** P2  **Effort:** L  **Impact:** HIGH  **Action:** REBUILD
- **Who / where:** coach · workspace Workout tab · 390
- **Evidence:** BV-09; `evidence/coach-day-builder-390.png`
- **Direction:** one back affordance, sections optional, sticky save, edit in place. See 03.
- **Verified:** BROWSER-VERIFIED

### JR-08 — Thumb-zone inversion
- **Priority:** P2  **Effort:** M  **Impact:** MEDIUM  **Action:** REDESIGN
- **Who / where:** both apps · 390
- **Evidence:** one-hand table above
- **Direction:** primary and destructive actions in a bottom action bar. Top corners only for low-frequency actions. WhatsApp support moves out of the thumb zone and into Help.
- **Verified:** BROWSER-VERIFIED

Related verified P0s surfaced during these journeys are owned by other docs:
- BV-03/04 offline crash → 11
- BV-11 plan wipe → 03
- BV-12 private note shown to client → 03
- BV-13 cross-coach search exposure → 03
- BV-14 coach composer hidden → 09

---

## Appendix — Browser evidence index (BV-01 … BV-41)

Every document cites these IDs. All runs used the isolated stack (no production). Screenshots are in `evidence/`.

- **BV-01 Notification replay on cold open.** Prod build, client 390×844: 4 stacked toasts for OLD notifications at app open covering the top ~400px of Today (header, date, greeting, week strip, check-in card) for 5s; two are "Weekly check-in requested" for check-ins already submitted. `evidence/client-cold-open-replayed-toasts.png`.
- **BV-02 Selected day hijacked.** A dated `coach_note` notification (date 2026-09-25) on cold open set the client's day navigator to "FRI 25 SEPT" while the header and week strip still say Sunday Oct 4 — Fuel/Cardio logging would go to Sept 25. `evidence/client-selected-day-hijacked.png`.
- **BV-03 Offline cold start crashes (HEAD only).** Installed PWA (SW active) reopened offline → "Something went wrong" (ErrorBoundary: "Unable to preload CSS for /assets/SitePages-*.css"). Session init `auth.refresh` fails offline → phase anonymous → AnonymousApp lazy-loads the website chunk, which is excluded from precache. In RC2 the same path lands on the login screen (still unusable offline). `evidence/client-offline-reopen-crash.png`.
- **BV-04 Offline + background→foreground mid-workout crashes the app** the same way (`refreshAccount` on visibilitychange fails offline → anonymous). Reproduced on `/workout/session`.
- **BV-05 Offline workout not lost in the tested path.** A workout finished offline stayed in IndexedDB (`finished:true, dirty:true`); nothing was on the server while offline; it synced within ~1.4s of the next ONLINE boot. No UI told the user it was pending ("Synced" chip stays).
- **BV-06 Update lifecycle.** (a) Deploy while app closed → reopening serves the OLD build (SW precache) for the whole foreground session (tested 73s, with the 60s poll firing); the new build appears only after the first backgrounding (silent reload). (b) No "update available" UI anywhere. (c) Returning user mid-workout: deploy → visible check → SW waiting → backgrounding → reload to new build within 5s; the workout log (ticked set, typed weights, elapsed timer) survived because it is persisted; in-memory state (rest timer etc.) is not. (d) A first-visit tab (not SW-controlled at load) that receives an update: new SW took control (`controllerchange` fired) but the page did NOT reload → old JS running under the new SW (workbox-window `_isUpdate=false` → vite-plugin-pwa skips its reload) → after a real deploy the next lazy chunk would 404.
- **BV-07 Video playback (Chrome 153).** wger H.264 `.MOV` (Bench Press, 640×352, 1.1MB) plays; Romanian Deadlift `.MOV` is 38MB 1920×1080; Bunny-hosted mp4 plays; YouTube embeds play; Google Drive / Vimeo / Instagram links → dead player stuck at 0:00, `MEDIA_ELEMENT_ERROR: Format error`, no message, no fallback (`evidence/client-video-drive-link-dead-player.png`); exercises without `videoUrl` (863/909): the video button opens nothing.
- **BV-08 Coach exercise picker** search "front squat" → 3 results sorted alphabetically (Double Kettlebell Front Squat, Dumbbell Front Squat, Front Squats); no thumbnail, no media indicator, no preview before adding; the first (alphabetical) result has no media. `evidence/coach-exercise-picker-390.png`.
- **BV-09 Coach J2 (modify program) = 10 taps** to add one exercise and save at 390; 3 stacked back affordances on the day screen; mandatory Section level; Back from the workspace header after saving lands on the Clients list. `evidence/coach-day-builder-390.png`.
- **BV-10 New coach library is empty** until "Load starter library" (a text button beside a squeezed search field); loading copies 909 exercises + 84 foods + 10 food groups + 10 supplements + 9 templates into the coach's own collections (exercises with video: 46, with image: 273). `evidence/coach-library-empty-390.png`.
- **BV-11 P0 plan wipe.** `workoutPlan.get` failing once (simulated 500) → coach editor shows "Add your first workout day" for a client who has a 4-day plan; typing a plan name, adding a day and Save replaced the real 4-day / 20-exercise plan with a 1-day / 0-exercise plan; `planVersions` count 0 — unrecoverable. `evidence/coach-editor-empty-after-failed-load.png`.
- **BV-12 Private coach note shown to client.** Text typed into the coach's assessment field (placeholder "Notes for yourself about this client's assessment…") appears verbatim on the client's `/assessment` under "Coach feedback". `evidence/client-sees-coach-private-note.png`.
- **BV-13 Cross-coach client search exposure.** As a coach with zero relationship to them, searching the single letter "c" returned other coaches' clients with email, phone, assignedCoachId, permissions, featureFlags, createdBy.
- **BV-14 Coach thread composer hidden** under the bottom nav when the coach plan banner shows (composer top 842px vs nav top 772px at 390×844; 662 vs 592 at 390×664). `evidence/coach-thread-composer-under-nav.png`.
- **BV-15 Client check-in:** at 390×844 the CONTINUE button is below the fold behind the bottom nav on step 1; weight defaults to "0" instead of the last logged 74.6 kg; the wizard keeps the global bottom nav. `evidence/client-checkin-step1-390.png`.
- **BV-16 Client Today:** 2.8 screens (2,388px at 390); the date appears 4 times above the workout CTA (day nav, eyebrow, week strip, card eyebrow); "Synced" chip; weekly goal 0/5 while the coach plan is 4 days; "Volume trend: Down 20.3t" shown on day 2 of the week; START WORKOUT barely above the bottom nav. `evidence/client-today-390.png`, `-full.png`.
- **BV-17 Exercise images never shown to clients** (plan lists, routine, exercise detail all use a generic dumbbell icon) although 273/909 records have images. `evidence/client-routine-390-full.png`, `client-exercise-detail-390-full.png`.
- **BV-18 Legacy tools exposed to clients:** Settings › Tools: "Video manager" (empty page), "Import data" (paste sheet rows / video JSON), "Update the app". `evidence/client-video-manager-390.png`, `client-import-data-390.png`, `client-settings-390-full.png`.
- **BV-19 Client subscription UI duplicated** on "Your coach" (`/coach-notes`) and `/settings/subscription` (same status card + pause form + history). `evidence/client-your-coach-390-full.png`, `client-subscription-390-full.png`.
- **BV-20 Coach client list:** 9/10 rows say "Needs attention" in red; the status chip is the admin ACCOUNT status ("ACTIVE" for frozen, expired, cancelled, trial and pending clients); filter chips All/Active/Frozen/Trashed are account states; the WhatsApp FAB covers row chevrons. `evidence/coach-clients-390-full.png`.
- **BV-21 Desktop 1440 clients table** overflows horizontally (columns cut at "ADHERENC…") because an empty "Select a client" panel takes ~320px; status column = account status. `evidence/coach-clients-1440.png`.
- **BV-22 Workspace overview "10 WORKOUTS (7D)"** for a client who logs ~4/week (the metric counts finished workouts among the last 10 logs). `evidence/coach-client-overview-390-full.png`.
- **BV-23 Coach Revenue (390):** 17 cards; the first KPI repeats the hero; 6 status tiles repeat the donut legend; the expired client (Youssef, expired 5 days ago) appears only as "1 EXPIRED" — no name, no action anywhere (also absent from the dashboard). `evidence/coach-revenue-390-full.png`.
- **BV-24 Coach dashboard (390):** 2.8 screens; "Get started 1/3" checklist still shown to a coach with 10 clients; dashboard tabs overflow; "AT RISK" badge on a client whose only issue is "assessment awaiting your review"; 9 "pending assessments" dominate "Needs attention". `evidence/coach-dashboard-390-full.png`.
- **BV-25 Measured startup** (prod build, local API, Chrome, 390): client first visit 0.45s / Slow-4G 4.8s (FCP 3.5s) / 3G 9.3s (FCP 7.5s); returning client 0.35s / 1.0s / 1.5s; returning coach to first client row 0.34s / 1.0s / 1.5s. Before any content: `auth.refresh → auth.me → (banners) → assessment.get` run sequentially even though all client data is local. The COACH boot runs the client sync engine (`sync.deletionsPull`, `sync.singletonGet`, `sync.pull`). Coach library on Slow 4G: 4.8s to first row; `coachAssets.exercises.list` = 835 KB.
- **BV-26 Arabic (ar-eg):** English dates on Today and the week strip; mono letter-spacing breaks Arabic letter joining (day navigator "النهارده", bottom-nav labels); units untranslated (kcal, ml, g, P/C/F); bidi order "g 60"; the "Synced" chip reads "الزامن". `evidence/client-today-390-ar.png`, `client-fuel-390-ar.png`.
- **BV-27 Raw i18n key** `assessment.activities.moderate` on the client's assessment page (and coach view): `normalizeAssessment` defaults `activityLevel` to 'moderate' (`src/lib/assessment.ts:35`) but the wizard's list (`AssessmentWizard.tsx:40`) and the `assessment.activities` map (`en.json:1629`) have no 'moderate' — a second taxonomy (`en.json:510`, `Settings.tsx:36`) does. Long answer rows wrap one character per line ("8/10"). `evidence/client-assessment-390-full.png`.
- **BV-28 Raw cardio key** (`cardio.types.incline_treadmill`) — caused by the production demo seeder `scripts/seed-demo-history.mjs:141` pushing invalid CardioType values ('incline_treadmill', 'intervals') through `sync.push`, which accepts any collection name and any record shape; the UI has no fallback label. Production demo accounts likely show this.
- **BV-29 Idle polling (prod build, measured):** client on Today 14 req/min (messages.list ×6/min from two duplicate 20s loops, sync.pull ×4/min, notifications.list ×2.5/min, checkIns.list ×1/min); client in thread 21 req/min (messages.list ×18/min); resume (hidden→visible+focus) fires ~11 procedures (auth.me, assessment.get, coachNotes.list ×2, coachTargets.get ×2, workoutPlan.get, nutritionPlan.get, profile.get, adminUsers.get, coachClients.get, checkIns.list). Coach (measured): dashboard 13.5 req/min (notifications.list 5/min from two mounted bells, sync.pull 4/min from the client sync engine running for a coach, coachThreadsSummary 3/min); clients list 14.5/min; inside a thread 25/min (messages.list 12/min). Details in 13.
- **BV-30 History:** "1 workouts" (no plural); tonnage ("5.0t") as the headline metric. `evidence/client-history-390.png`.
- **BV-31 Coach check-ins tab:** the primary CTA is "Request weekly check-in" while a SUBMITTED check-in waits below as a plain row; review is an inline "Mark reviewed". J1 (open app → find the client with a pending check-in → review) = 6 taps + typing, but only because the tester knew which client; the landing list flags 9/10 clients. `evidence/coach-client-checkins-390.png`.
- **BV-32 Coach workspace tab rail at 390** overflows: "More" is off-screen until scrolled; scrolling clips "OVERVIEW".
- **BV-33 Client notifications page:** 12 unread; every row is titled with the coach's name; three stale "Weekly check-in requested" rows remain unread after those check-ins were submitted; dates in US M/D/YYYY. `evidence/client-notifications-390-full.png`.
- **BV-34 Coach messaging back-navigation works** when the thread is opened from the workspace header button, the overview card, or a tab (app Back → client overview; browser Back → previous tab).
- **BV-35 Coach subscription tab** offers 7 competing actions (Set term, Set price, Freeze, Extend +30d, End subscription, Cancel, history); J5 renewal from a dashboard renewal row = 4 taps to the Set-term sheet. `evidence/coach-client-subscription-390.png`.
- **BV-36 Client "Exercise library"** is not a library: it lists only the 20 exercises in the client's plan with estimated best weights — it duplicates Progress › Strength. `evidence/client-exercise-library-390-full.png`.
- **BV-37 Client Progress:** WEIGHT/STRENGTH/MEASURE/PHOTOS segments while Measurements and Photos also exist as separate routes; range chips overflow ("Al…"); "↓ 2kg this month" shown in red for a fat-loss client; the "Current 74.6kg" card repeats the header value. `evidence/client-progress-390.png`.
- **BV-38 Client Measurements:** 14 numeric fields all showing "0", with a day navigator AND a back button stacked; comparison table and text history below. `evidence/client-measurements-390-full.png`.
- **BV-39 Client Fuel:** page titled "Nutrition" under the "Fuel" tab; every planned food row has a red ✕; macro mini-cards nested inside the remaining card. `evidence/client-fuel-390-full.png`.
- **BV-40 Coach nutrition editor at 390** is 4.3 screens (3,630px) with 62/91 interactive elements under 44px; every meal repeats a name field AND 5 slot chips. `evidence/coach-client-nutrition-editor-390-full.png`.
- **BV-41 Your Back example, browser-verified.** At 390, Clients → Nour → More › Notes → More › Messages → ‹ Back landed on **`/coach/clients`**, not on Notes and not on the client. The More/tab-rail entries use `replace` navigation. The header 💬 and Overview card paths return correctly (BV-34). See NAV-K01 in 05.
