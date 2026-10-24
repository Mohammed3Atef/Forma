# 03 — Coach mobile audit (390 px)

## Bottom line

- **Four P0s, all browser-verified on the isolated stack:**
  - A single failed plan read makes the editor show an empty plan, and Save then **replaces the client's real 4-day plan** with no version to restore (CO-01, BV-11).
  - Text the coach types as "Notes for yourself" is shown to the client as "Coach feedback" (CO-02, BV-12).
  - Any coach can search *other coaches'* clients by one letter and receive their email, phone and internal fields (CO-03, BV-13).
  - The thread composer sits under the bottom nav whenever the plan banner is shown (CO-04, BV-14).
- **The app opens on a list that cannot be triaged.** 9 of 10 clients say "Needs attention" in red, and the status chip is the admin *account* state ("ACTIVE" for frozen, expired, cancelled, trial and pending clients) (CO-05, CO-07, BV-20). The real queue (check-ins, assessments, messages, requests, renewals) is spread over 8+ screens.
- **One client = ~21 URLs:**
  - an 11-tab workspace, shown at 390 as 4 tabs + "More", with "More" off-screen (BV-32);
  - a separate 6-chip "view as client" layout;
  - a version page.

  The Overview tab leads with a wrong number: "10 workouts (7d)" for a client who trains 4×/week (CO-08, CO-09, BV-22).
- **Planning is slow and unsafe:**
  - 10 taps to add one exercise, with 3 stacked back buttons (BV-09);
  - a 4.3-screen nutrition editor with 62/91 undersized controls (BV-40);
  - plain Save never creates a version, so version history is empty for real clients (CO-10–CO-12).
- **Commerce crowds the coaching loop:**
  - Revenue is a bottom tab with 17 cards and no name for the expired client (BV-23);
  - the subscription tab offers 7 competing actions (BV-35);
  - renewing a client overwrites the previous term — subscription history is never written (CO-14–CO-16).
- **Direction for Phase B:**
  - Bottom bar: **Today** (one triage queue) · **Clients** (urgency-sorted) · **Messages** · **Library**.
  - A client is **one place with 4 sections**: Summary · Plan · Progress · Profile.
  - Editors become full-screen flows with autosave and automatic versions.
  - Business and the Forma subscription move behind the avatar.

Scope:
- The authenticated coach app at 390×844 (iPhone-class), English and `ar-eg`.
- Desktop is in `04_DESKTOP_AUDIT.md`.
- Semantic navigation (NAV-K) and IA are assembled into `05_INFORMATION_ARCHITECTURE.md` / `16_TARGET_INFORMATION_ARCHITECTURE.md`.

Context:
- Audit date 2026-10-04, repo HEAD `e7663ab` (`development`); production runs RC2 `cf3a5d9` (per project notes, not re-verified).
- Browser evidence comes from the isolated stack only (in-memory Mongo, local Bunny stand-in), seeded with coach "Karim Mansour" and 10 clients in mixed states.
- Production media uploads currently fail (Bunny 401), so any coach flow that uploads (exercise videos, message attachments/voice) is broken in prod independently of the findings here.

---

## 1. The coach app on a phone, measured

**Per-route probe at 390×844**

Columns:
- Interactive = interactive elements on the page.
- Small = targets <44 px.
- Severe = targets <24 px.
- Tiny = text nodes under 12 px.

Source: `shots/coach-390/results.json`.

| Route | Screens tall | Interactive | Small | Severe | Tiny | Note |
|---|---|---|---|---|---|---|
| `/coach` → Clients (landing) | 1.4 | 25 | 7 | 1 | 17 | Lands on Clients, not Dashboard |
| Dashboard | **2.8** | 38 | 13 | 1 | 13 | Tab row overflows (492 px in 358) |
| Client › Overview | 1.7 | 23 | 10 | 2 | 21 | Tab rail 393 px in 350 → "More" off-screen |
| Client › Assessment | **2.9** | 23 | 9 | 1 | 13 | |
| Client › Check-ins | 1.0 | 21 | 9 | 1 | 15 | |
| Client › Workout | 1.3 | 29 | 14 | 1 | 14 | |
| Client › Nutrition | **4.3** | 91 | **62** | **14** | 47 | Planned-vs-target table scrolls sideways (460 px in 348) |
| Client › Cardio | 1.1 | 28 | 17 | 3 | 14 | |
| Client › Subscription | 1.2 | 24 | 13 | 2 | 18 | |
| View as client | 1.3 | 17 | 11 | 1 | 12 | 6-chip row 602 px in 350 |
| Thread | 1.0 | 15 | 6 | 2 | **52** | |
| Revenue | 2.6 | 8 | 3 | 1 | 29 | 17 cards (BV-23) |
| My Plan | 1.9 | 10 | 3 | 1 | 12 | |

The "Severe = 1" on almost every route is the WhatsApp support button's **20×20 px dismiss "×"**, rendered on every coach page except messages.

**Journeys at 390** (`shots/journey-coach*/notes.txt`)

| Journey | Taps | What happened |
|---|---|---|
| J1 Find the client with a pending check-in and review it | 6 + typing | Possible only because the tester knew it was Omar: the landing list flags 9/10 clients. Path: row → More → Check-ins → expand row → feedback → Mark reviewed (BV-31) |
| J2 Add one exercise to a client's program and save | **10** | Client → Workout → day → section → Add exercise → search → select → Add selected → Save plan. Back then lands on the Clients list (BV-09) |
| J3 Find an exercise in the library | 4 (after a one-time "Load starter library") | A new coach's library is empty (BV-10) |
| J4 Message a client and come back | OK | Back from the thread returns to the client when opened from the header button, the Overview card, or a tab via the header button (BV-34) |
| J5 Renew from a dashboard renewal row | 4 to the Set-term sheet | The sheet's price field is **empty**, although the client pays 1000 EGP (screenshot `journey-coach2/j5-07-action-sheet.png`) |

---

## 2. Screen by screen

### 2.0 Global chrome (every coach screen)

Purpose: identity, global navigation, alerts.

| Element | What it is | Action | Why |
|---|---|---|---|
| BrandBar: logo · 🔔 · ☰ | Sticky 60 px header (`BrandBar.tsx:27-57`) | REDESIGN | Every page then adds its own eyebrow + 30 px H1, so ~150 px of chrome sits above content. Use a contextual title bar (page/client name) + avatar |
| ☰ "Menu" sheet | 13 destinations in 5 groups; 4 repeat the bottom bar (`nav.ts:103-142`; `evidence/coach-navigate-menu-390.png`) | REMOVE as the main path | It is the only route to Check-ins, Assessments, Templates, Library, Reports, Client Plans, My Plan and Account |
| Bottom nav: Dashboard · Clients · Messages · Revenue | `nav.ts:87-92` | REDESIGN | Revenue takes a daily slot. **No tab is active inside a client** (see NAV-K11) |
| Eyebrows "COACH PORTAL" / "BUSINESS" / "CONTENT" / "FORMA" | e.g. `CoachClients.tsx:227` | REMOVE | Restate the obvious; inconsistent |
| `CoachPlanBanner` | Rendered inside every page (`CoachApp.tsx:64-69`) | REDESIGN | App-wide only when blocking (lapsed/suspended). It pushes the composer under the nav (CO-04) |
| `BannerHost` (admin marketing banners) | Mounted at the app root, above the shell (`App.tsx:122`) | MOVE | Meant for the dashboard but shows on every coach route (CO-30) |
| WhatsApp support FAB | Fixed `bottom-24 end-3`, with a 20 px dismiss (`WhatsAppFab.tsx:28,46`) | MOVE (Me › Help) | Covers row chevrons and cards (BV-20, CO-28) |
| Offline banner | "Showing saved data. Changes sync when you reconnect." | REDESIGN (coach copy) | False for coach screens, which are online-only |

### 2.1 Dashboard (`/coach/dashboard`)

Purpose: tell the coach who needs them today.

The page answers this only on desktop and only partially. On a phone it is 2.8 screens (`evidence/coach-dashboard-390-full.png`).

| Element | What it is | Action | Why |
|---|---|---|---|
| Greeting "Good evening, Karim" + orange "+" | Icon-only button with no accessible name (probe `noName`) | REMOVE greeting; MOVE add-client | Decoration; unlabeled control |
| Hero pills: 10 Active clients · 1 Renewals (7d) · 5200 EGP Revenue | `CoachDashboard.tsx:67-75` | REMOVE | "Active" counts accounts; "Renewals" means *ending*; revenue mixes collected and projected |
| Tabs: Overview · Clients · Engagement · Content | Scroll; "Content" off-screen at 390 (probe: 492 px in 358) | REMOVE | Clients/Content duplicate other destinations; Engagement is fleet vanity |
| "Get started 1/3 done" checklist | Shown to a coach with 10 clients (BV-24) | MOVE (new-coach state of Today) | Stale. "Complete your coach profile" cannot be completed: Account has no bio/specialty fields |
| Headline "10 clients need you today. 4 missed sessions · 2 check-ins overdue · 1 renewal…" | `OverviewPanel.tsx:36-52` | REDESIGN | "Overdue" are check-ins *awaiting the coach's review*; "missed sessions" is a count of clients |
| Featured "AT RISK" hero (Laila) | `OverviewPanel.tsx:31-34, 55-78` | REMOVE | Her only issue is an assessment awaiting review (BV-24). It duplicates the first list row |
| Needs attention (6 rows: reason + CTA) | `parts.tsx:19-57` | KEEP → MOVE into Today | The only actionable block. 5/6 rows are "Assessment awaiting your review" |
| "Quick actions" heading + "+" | On phones the grid is hidden (`QuickActions.tsx:38`). **The five KPI cards below read as if they were the quick actions** (screenshot) | REMOVE | Empty, misleading section |
| 5 KPI cards (Total, Avg adherence 60%, Pending assessments 9, Check-ins to review 2, Unread 3) | `OverviewPanel.tsx:106-112` | REMOVE | Repeats the header and hero; the check-ins card is not tappable |
| Upcoming renewals (4 rows, tappable) | `OverviewPanel.tsx:115-132` | MOVE → Today "Renewals due" | Actionable, but belongs to the renewal flow |
| Clients / Engagement / Content panels | 14 more cards and lists (`dashboard/*Panel.tsx`) | REMOVE | Duplicates of Clients, Assessments, Reports, Library; Engagement contains a section whose only content is "ranking moved to Reports" |
| `checkTrialExpiry()` on mount | No-op (`notify()` is empty) | REMOVE | Dead side-effect |

- **Mobile issues:**
  - Attention list starts ~1.1 screens down.
  - The WhatsApp FAB covers the featured card.
  - The tab row is clipped.
  - Mono uppercase micro-labels everywhere (13 tiny text nodes).
- **States:**
  - The skeleton shows **forever if the aggregate fails** (`!d` branch, `CoachDashboard.tsx:83-84`).
  - No offline state.

### 2.2 Clients (`/coach/clients`, the phone landing)

Purpose: find a client and see who needs action.

| Element | What it is | Action | Why |
|---|---|---|---|
| Title "Clients" + eyebrow + [+] + [👤] | `CoachClients.tsx:225-238` | REDESIGN | The account icon duplicates the menu; the eyebrow is noise |
| "10 / 25 clients used" strip | Always shown (`:240-249`) | REDESIGN (show near/at limit only) | Commerce on the daily roster |
| Incoming transfer requests | Shown above search; "Approve" (gives your client away) is the filled primary button | MOVE → Today | A decision item; destructive styled as primary |
| Search | | KEEP | |
| Chips All / Active / Frozen / Trashed | **Account** states, which only an admin can change (`:54`) | REPLACE | Coaching filters instead: Needs you · Check-in due · Expiring · No plan · Frozen (subscription) · All |
| Row: avatar · name · red "Needs attention" · "ACTIVE" chip · › | 9/10 red; the chip is the account state for every client (BV-20) | REDESIGN | No triage signal; no reason, days left or last workout. "Last active" shows a raw ISO date (`:294`) |
| WhatsApp FAB over row chevrons | BV-20 | MOVE | |
| Add-client sheet | Chooser (Create New / Add Existing) → Invite panel or Search | MERGE (CO-37) | The coach rarely knows whether the client already has an account |

- **States:**
  - Loading is the button label "Working…" (`:279-280`).
  - An offline-paused query shows "No clients yet — add your first client" (React Query v5: paused ⇒ `isLoading=false`).
  - One of only 4 coach screens with an ErrorState.

### 2.3 Client workspace: header, tab rail and Overview (`/coach/client/:id`)

Purpose: everything about one client. `evidence/coach-client-overview-390-full.png`.

| Element | What it is | Action | Why |
|---|---|---|---|
| ‹ back · avatar · name · "ACTIVE" (subscription) · ▾ switcher | `CoachClientWorkspaceLayout.tsx:110-126` | KEEP (compact, sticky) | The switcher is good. The header is **not sticky** despite being called "pinned" |
| 💬 Message · ✎ Edit plan | Wrap onto a second row at 390; icon-only with **no accessible name** (probe `noName`) | KEEP 💬 (labelled); REMOVE Edit plan | Edit plan = Workout tab |
| Tab rail: OVERVIEW · WORKOUT · NUTRITION · PROGRESS · MORE | 393 px in 350 px. **"More" is off-screen; scrolling clips "OVERVIEW"** (BV-32; `evidence/coach-client-checkins-390.png` shows "VIEW") | REBUILD → 4 segments | The gateway to 7 tabs is hidden |
| More sheet (7): Cardio · Assessments · Check-ins · Messages · Notes · Subscription · History | `shots/journey-coach2/j1-03-more-sheet.png` | REMOVE with the rebuild | Check-ins (the weekly loop) sits behind More; Progress (an exit) is primary |
| Overview: phone number (20 px tall link, "info" icon) | `CoachClientDetail.tsx:120-128` | MOVE (header overflow "Call") | |
| Stat tiles: **10 WORKOUTS (7D)** · 74.6 kg · 1 NOTES · 2 PLANS | "Workouts (7d)" counts finished workouts among the **last 10 logs, any date** (BV-22) | REPLACE | Wrong headline metric; the others are vanity counts of the coach's own artifacts |
| VIEW ACTIVITY (primary) · MANAGE PLAN | "Manage plan" re-lists Workout/Nutrition/Cardio + Add note + **Release client** | REMOVE | Duplicate navigation; destructive action hidden under a mislabelled sheet |
| Cards: Messages · Client assessment (SUBMITTED) · Weekly Check-In | | REMOVE (surface status in Summary) | Third copy of the tab navigation |
| Targets 1900 kcal · 150 g · 3000 ml | From the meal plan | MOVE (Plan › Nutrition) | |
| Notes (last 3) | Client-visible (CO-21) | MOVE (Profile) | |

### 2.4 Client navigation (summary; full repro steps in NAV-K findings, assembled into doc 05)

| ID | Finding | P |
|---|---|---|
| NAV-K01 | The "Messages" and "Progress" entries in the tab rail / More sheet **replace** the history entry, so Back leaves the client. The header 💬 button and the Overview card work correctly (BV-34) | P1 |
| NAV-K02 | Up to 3 stacked back buttons in editors (BV-09). "Leave" via the workspace back, tabs or bottom nav keeps the draft, so discarded edits come back | P1 |
| NAV-K03 | The freeze-request notification lands on Overview; the request card only exists under More › Subscription | P1 |
| NAV-K11 | Inside a client no bottom-nav (or sidebar) item is active | P2 |

Others: NAV-K04 (template Back-after-Save loop), NAV-K05 (unguarded navigations), NAV-K06 (hardware back and sheets), NAV-K07 (thread ↔ client ping-pong), NAV-K08 (Back from a sub-tab returns to Clients, BV-09), NAV-K09 (Back after release/delete), NAV-K10 (versions fallback).

### 2.5 Workout planning (Workout tab → PlanBuilder → picker → exercise form)

Purpose: change a client's program quickly and safely.

| Element | What it is | Action | Why |
|---|---|---|---|
| Editor top bar: ‹ (second back) · "Workout plan" · SAVE PLAN | `CoachWorkoutEditor.tsx:146-156` | REDESIGN | Duplicate back; Save is top-only and scrolls away |
| Client context strip (collapsible) | Goal, weight, injuries, allergies | KEEP | Right idea, and reused by the check-in review queue |
| Plan name · Save as template · saveHint paragraph · Save as new version · History | `:108-142`; hint: "no history is kept unless you use Save as new version" | REBUILD | Exposes versioning mechanics; three save concepts |
| Day list "Upper — Push · Chest · Shoulders · Triceps · 0 sections · 5 exercises" | Seeded legacy plan | REDESIGN | "0 sections" is meaningless to a coach (CO-25) |
| Day view: "‹ WORKOUT PLAN" (third back) · title · focus · Duplicate/↑/↓/Remove · section "Workout · 5 exercises" · ADD SECTION | `PlanBuilder.tsx:338-383`; `evidence/coach-day-builder-390.png` | REBUILD | Mandatory section level before any exercise |
| Section view: title · kind chips · exercises (↑ ↓ ⋯) · ADD EXERCISE | `:241-334` | REBUILD | 3 drill levels; hardware back exits the editor |
| Exercise picker: search · **QUICK CREATE** (primary) · "same sets/reps for all" · results (no thumbnails) · "ADD 0 EXERCISES" footer | `evidence/coach-exercise-picker-390.png` (BV-08) | REDESIGN | Creating is more prominent than picking; no media/preview; alphabetical order puts a no-media variant first |
| Exercise sheet = 12-field form (name, muscle, category, equipment, presets, warm-up, working sets, reps, rest, video, notes, progression, tags) | `ExerciseForm.tsx:96-160` | REBUILD | Programming fields should lead. Editing metadata silently detaches the exercise from the library. Notes are written into both `en` and `ar` (CO-26) |

### 2.6 Nutrition planning (Nutrition tab)

Purpose: set targets and meals. `evidence/coach-client-nutrition-editor-390-full.png` (BV-40). 3,630 px tall, 62/91 controls under 44 px.

| Element | What it is | Action | Why |
|---|---|---|---|
| Same chrome stack (back, Save, context, hint, name, version buttons) | `CoachNutritionEditor.tsx:286-318` | REDESIGN | |
| "Planned vs target" table **before** the target inputs | `min-w-[420px]`; Carbs/Fats hidden behind horizontal scroll (probe 460 px in 348) | REPLACE (TB-03) | Compares before the targets are set; sideways scroll |
| Targets kcal / P / C / F + water | `inputMode=decimal` ✓ | KEEP, MOVE above | |
| Substitutions: 3 toggle chips | "Flag custom swaps for review": **no review action exists anywhere** (CO-19) | REDESIGN / REMOVE | Dead-end promise |
| Each meal: name field + **5 slot chips** + food rows with tiny red "−" + ADD FOOD | All meals fully expanded (`:224-260`) | REBUILD | Repetition is the main cause of 4.3 screens. "−" is ~18 px |
| Food sheet: library list + food-database search + manual fields + swap-group chips + "allow custom" + Save | `:467-539` | REDESIGN | 3 input modes stacked; Save only applies locally; `name.ar` is overwritten with English |
| Supplements | `:418-465` | KEEP | |

### 2.7 Cardio planning (More › Cardio)

| Element | What it is | Action | Why |
|---|---|---|---|
| Chrome stack + hint "Daily minute/step targets are set under Targets" | `CoachCardioEditor.tsx:187-220`; `shots/coach-390/390-client-cardio.png` | REMOVE hint | **No coach screen sets step/cardio targets**, yet the client app shows "9000 STEPS · 150 min CARDIO" targets (`evidence/client-your-coach-390-full.png`) (CO-19) |
| Sessions (type · minutes · frequency · notes) + red "−" | | MERGE into Plan as a small section | A cardio "plan" is 2–3 rows; a whole tab is too much |

### 2.8 Progress — "view as client" (`/view/:tab`, reached from "VIEW ACTIVITY" or the Progress tab)

Purpose: see what the client actually did. `shots/coach-390/390-client-view.full.png`.

| Element | What it is | Action | Why |
|---|---|---|---|
| Separate page: ‹ · "VIEWING AS CLIENT" · name | Leaves the workspace (header, switcher and tabs gone) | REBUILD into Progress | Context loss |
| Chips: Activity · Nutrition · Cardio · Measurements · Photos · Progress | 602 px in 350; names collide with the editor tabs | REBUILD | "Nutrition" here = food log; in the rail = plan editor |
| Day stepper defaulting to **TODAY** | For a client who trains 4×/week the default view says "No workout logged this day / No meals logged this day / 0 steps / 0 min / 0 ml / —" | REBUILD (week/timeline) | Finding last Tuesday's session = N taps; each tab resets the date |
| "Add note" under every entity | `EntityNotes.tsx:115-124` | REDESIGN | 20+ links per day; notes are client-visible but not labelled so |
| Measurements entry form for the coach | | KEEP (inside Body) | |

### 2.9 Assessments (Client › Assessments, `/coach/assessments`)

| Element | What it is | Action | Why |
|---|---|---|---|
| Per-client page, 2.9 screens: answers by section, insight badges | `shots/coach-390/390-client-assessment.full.png` | KEEP (Profile) | Long answers wrap one character per line ("8 / 1 0"; BV-27 shared component) |
| "Coach review notes" textarea, placeholder "Notes for yourself…", separate SAVE | **Shown to the client** (CO-02, BV-12) | REDESIGN | Trust breach |
| MARK REVIEWED | | KEEP (as a Today queue action) | |
| "Build plan from assessment" (3 links) | Pushes to editors | REMOVE | 4th entry point into the editors |
| `/coach/assessments` list | A roster sorted by status; no search; errors render as "No clients" | REMOVE (Today + a Clients filter) | |

### 2.10 Check-ins (Client › Check-ins, `/coach/checkins`)

| Element | What it is | Action | Why |
|---|---|---|---|
| Per-client: primary **REQUEST WEEKLY CHECK-IN** above a SUBMITTED row | BV-31 | REDESIGN | The waiting review should be the primary action; the row is collapsed |
| Expanded row: 6 stats · notes · "Coach Feedback" · MARK REVIEWED | Feedback is optional, then read-only forever | REDESIGN | |
| `/coach/checkins` overview | Title **truncated to "Ch…"** next to REVIEW (1) and SEND REMINDERS (7) (`shots/coach-390/390-checkins.full.png`); names truncated ("K…") next to OVERDUE + REQUESTED | MERGE into Today | Cramped header |
| Review queue sheet (context strip, summary, vs last week, feedback, Skip / Mark reviewed & next) | `CoachCheckInsOverview.tsx:199-234` | KEEP (make it the Today primitive) | The best flow in the coach app, buried in the ☰ menu |
| "Send reminders (7)" | Computed from summaries; if those failed, every client looks "not requested" | REDESIGN | Bulk action on a possibly false state |

### 2.11 Notes (More › Notes)

| Element | What it is | Action | Why |
|---|---|---|---|
| Notes list + Add note | **Client-visible**: the Overview note "Focus on sleep this week…" appears on the client's "Your coach" page (`evidence/client-your-coach-390-full.png`) | REDESIGN (CO-21) | The coach UI never says so; code comments call them "internal" |
| Notes anchored from "view as client" | Listed without their context ("on: Squat · 3 Oct") | REDESIGN | |
| No loading state | "No notes yet" flashes while loading; errors render as empty | REDESIGN | |

### 2.12 Messaging (short — detail in `09` messenger doc)

| Element | What it is | Action | Why |
|---|---|---|---|
| Inbox lists **every client** including 7 × "No messages yet"; names truncated ("Karim Tar…") | `shots/coach-390/390-messages.png` | REDESIGN | A directory, not an inbox |
| ⚡ Broadcast (same icon as the Revenue tab) | Recipients "All" = the *currently filtered* inbox list; body labelled "Notes" | REDESIGN (CO-27) | Silent audience narrowing |
| Thread | Fixed `100dvh-8.5rem` height; composer under the nav with the plan banner (CO-04) | REDESIGN | |
| Back from the thread | Works from the header 💬 and the Overview card (BV-34); not from the rail/More entry (NAV-K01) | — | |

### 2.13 Library and templates (short — detail in `07`/`08`)

| Element | What it is | Action | Why |
|---|---|---|---|
| Empty library for a new coach; "LOAD STARTER LIBRARY" text button beside a search field squeezed to "Searc" | BV-10; `evidence/coach-library-empty-390.png` | REDESIGN (CO-23) | Seeding copies 909 exercises + 84 foods + 10 groups + 10 supplements + 9 templates |
| Tab chips Exercises · Foods · Food groups · Supple… | **Clipped at 390** (non-scrolling row) | REDESIGN | |
| Rows with a checkbox and a ✕ delete each | | REDESIGN | Desktop bulk pattern on a phone |
| Templates: grid with corner checkboxes; "preview" page shows day titles + counts only | | REDESIGN (CO-39) | A preview that doesn't preview |
| No "start from template" inside a client; nutrition templates have API but no UI | | REBUILD (CO-19) | Reuse is impossible where the work happens |

### 2.14 Business: revenue, reports, client plans, subscriptions, renewals

**Revenue (bottom tab).** `evidence/coach-revenue-390-full.png` (BV-23), 2.6 screens.

| Element | What it is | Action | Why |
|---|---|---|---|
| Hero "THIS MONTH 5200 EGP" | | KEEP one | |
| "Revenue (tracked)" 4 cards (5200 again · 2000 collected · 3200 due · 900 lost) | The first card repeats the hero | REDESIGN | |
| Renewals this month (4 rows) + "1 / 5" chip | Rows not tappable (TB-02) | REDESIGN | |
| Subscriptions donut + legend + **6 tiles repeating the legend** | | REMOVE tiles | |
| Growth: 8 new (30d) · 80% retention · 20% churn | Retention = 100 − churn over all relationships ever | REMOVE | Miscomputed |
| The expired client (Youssef) | Appears only as "1 EXPIRED"; no name, no action, also absent from the dashboard | REDESIGN | The one actionable revenue item is invisible |

**Reports** (`shots/coach-390/390-reports.full.png`): 4 KPIs ("Pending check-ins" = the dashboard's "check-ins to review"/"overdue"), 3 CSV exports of aggregate numbers, the same ranking as Adherence. → MOVE exports to desktop Business; REMOVE the rest (CO-35).

**Client Plans** (`shots/coach-390/390-subscription-plans.png`): reusable packages (duration + price). It is called "Client Plans" while "plan" also means the workout plan, "My Plan" and the plan banner. → RENAME to "Packages", MOVE under Business (CO-36).

**Client › Subscription.** `evidence/coach-client-subscription-390.png` (BV-35).

| Element | What it is | Action | Why |
|---|---|---|---|
| Status + days left + start/renews/price/months | ISO dates; dates written as local midnight and formatted in UTC (`CoachSubscriptionPanel.tsx:48-50`) | KEEP (fix dates) | One day early in UTC+2/+3 (inferred, needs a device check) |
| SET TERM (primary) · Set price · Freeze · Extend +30d · END SUBSCRIPTION · CANCEL · history | 7 actions | MERGE | One "Renew / change term" + Freeze + overflow "End". "Cancel" reads like dismiss |
| Set-term sheet | Start date prefilled with the *current* start; **price empty** although the client pays 1000 EGP (`journey-coach2/j5-07`) | REDESIGN | A renewal reads as "free" unless retyped |
| History "Renewed · 1 months" | **Never written by the backend**: renewals overwrite the term in place (CO-15) | REBUILD | |
| Errors | A failed read shows "No subscription" + the primary SET TERM | REDESIGN | Invites overwriting a real term |

### 2.15 Adherence (`/coach/adherence`)

`shots/coach-390/390-adherence.png`: "Nour Hassan 4 wk", where "wk" means **workouts**. Initial-letter serif avatars unlike every other list. Rows are not tappable on mobile (`CoachAdherence.tsx:86-97`). It duplicates the Reports ranking. → REMOVE (sortable column on Clients) (CO-34).

### 2.16 Profile / settings (`/coach/settings`, "Account")

`shots/coach-390/390-settings.full.png`.

| Element | What it is | Action | Why |
|---|---|---|---|
| Capacity card "FORMA SUBSCRIPTION · 10 OF 25 CLIENTS" + MY PLAN | 5th place capacity is shown; counts disabled clients too (`RoleAccount.tsx:37`) | MOVE (Me › Forma subscription) | |
| Avatar, name, phone, timezone (empty; placeholder "Africa/Cairo"), currency, email, role chip | Saved **on blur, silently** (`:47-49`) | REDESIGN | No feedback; errors swallowed; IANA ids exposed |
| Language chips (English · العربية · مصري) | Crowd the label | KEEP | |
| Change password · Sign out | | KEEP | |
| Missing: bio/specialty | The checklist's "Complete your coach profile" has nowhere to go | ADD (product decision) | |

### 2.17 My Plan (`/coach/plan`)

`shots/coach-390/390-plan.full.png`, 1.9 screens.
- Four KPI cards. One value is **clipped: "Forma Subscripti"**.
- Explanation + manual-payment note + RENEW SUBSCRIPTION.
- Capacity "10 / 25 · 15 slots free".
- Active add-ons (none).
- Offer "+20 clients · 199 EGP/month".
- Requests (none).

→ REDESIGN as one status card + capacity line + offers + collapsed history; MOVE under Me (CO-32).

### 2.18 Notifications (`/coach/notifications`)

`shots/coach-390/390-notifications.png`: rows "Omar Khaled · CHECK-IN SUBMITTED", "Karim Tarek +1 · NEW MESSAGE…".
- Message rows duplicate the inbox.
- The bell shows 6 while Messages shows 3: the same messages are counted twice.

→ MERGE coach events into Today; stop badging messages on the bell (CO-33; detail in the NT doc).

---

## 3. Findings (coach mobile)

### CO-01 — A failed plan read lets the coach wipe a client's plan
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/client/:id/workout` (same code in `/nutrition`, `/cardio`) · all viewports
- **Evidence:** BV-11; `evidence/coach-editor-empty-after-failed-load.png`; `CoachWorkoutEditor.tsx:48-55`, `CoachNutritionEditor.tsx:95-107`, `CoachCardioEditor.tsx:58-70` (`base = query.data ?? emptyPlan()` once `isLoading` is false); `queryClient.ts:16` (`retry: 1`). The save request body in `shots/verify-p0/notes.txt` shows the 1-day plan replacing the 4-day plan.
- **Steps / scenario:**
  1. `workoutPlan.get` fails once (or the device is offline with no cache: a paused query also reports `isLoading=false`).
  2. The editor shows "Add your first workout day" for a client with a 4-day / 20-exercise plan.
  3. The coach types a name, adds a day, taps Save.
- **Expected vs actual:** Expected: an error state with Retry, and editing blocked. Actual: an empty editor whose Save replaces the real plan; `planVersions` = 0, unrecoverable.
- **Why it matters:** Silent loss of a client's program on a flaky phone connection.
- **Direction:**
  - Render editors only on a successful read.
  - Distinguish "no plan yet" from "couldn't load".
  - Every save creates a restorable version.
- **Verified:** BROWSER-VERIFIED

### CO-02 — "Notes for yourself" are shown to the client
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach → client · Client › Assessments → client `/assessment` · all
- **Evidence:** BV-12; `evidence/client-sees-coach-private-note.png`; placeholder `assessment.coachNotesPlaceholder` "Notes for yourself about this client's assessment…"; the client renders `a.coachNotes` as "Coach feedback" (`src/pages/MyAssessment.tsx:106-110`).
- **Steps / scenario:** The coach types an observation into "Coach review notes" and taps Save. The client opens My assessment and sees it verbatim.
- **Expected vs actual:** Expected: private notes stay private, or the field says "visible to client". Actual: the private-labelled text is published.
- **Why it matters:** Trust and privacy breach between coach and client; could expose candid health/behaviour remarks.
- **Direction:**
  - Separate *private notes* (never shown) from *feedback to client*.
  - Label visibility on every coach text field.
  - Audit existing `coachNotes` values before shipping the fix.
- **Verified:** BROWSER-VERIFIED

### CO-03 — Any coach can look up other coaches' clients and their contact data
- **Priority:** P0      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · Clients › + › Add Existing Client · all
- **Evidence:** BV-13; `api/_trpc/routers/adminUsers.ts:151-176` (name-prefix match, `toPublicUser` of the full document); `api/_lib/types.ts:69-72`; UI `AddExistingClient.tsx:302-316` shows email, phone, current coach, account status and joined date.
- **Steps / scenario:** As a coach with no relationship to them, type "c" → other coaches' clients are returned with email, phone, `assignedCoachId`, permissions, `featureFlags`, `createdBy`.
- **Expected vs actual:** Expected: only an exact email/phone match, minimal fields, rate-limited. Actual: enumeration of platform-wide client PII.
- **Why it matters:** Cross-tenant personal-data exposure; competitive poaching risk.
- **Direction:**
  - Exact-identifier lookup only.
  - Return "exists / has a coach" rather than the record.
  - Rate-limit and audit.
  - Consider removing the "Add existing" branch from the coach UI (CO-37).
- **Verified:** BROWSER-VERIFIED

### CO-04 — The message composer is hidden under the bottom nav when the plan banner shows
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/messages/:clientId` · ≤767
- **Evidence:** BV-14; `evidence/coach-thread-composer-under-nav.png` (composer top 842 px vs nav top 772 px at 390×844; 662 vs 592 at 390×664); fixed `h-[calc(100dvh-8.5rem)]` in `CoachMessageThread.tsx:30`; banner rendered inside every page (`CoachApp.tsx:64-69`); `BannerHost` above the shell (`App.tsx:122`). The client fix (cf3a5d9, `useFillToBottomNav`) was not applied here.
- **Steps / scenario:** The coach's Forma term ends in ≤5 days, so the "Your Forma term ends in 3 day(s)" banner shows. The coach opens any thread.
- **Expected vs actual:** Expected: the composer sits above the nav. Actual: it is under the fixed nav and cannot be tapped.
- **Why it matters:** Messaging is the core daily action; the banner persists for days.
- **Direction:**
  - One shared "fill to bottom nav" layout for every thread.
  - Banners never inside full-height task screens.
- **Verified:** BROWSER-VERIFIED

### CO-05 — No triage surface: the landing list can't tell the coach who needs them
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REBUILD
- **Who / where:** coach · `/coach` → `/coach/clients` (phone landing), Dashboard · ≤767
- **Evidence:** BV-20 (9/10 rows "Needs attention"); BV-24; BV-31 (J1 worked only because the tester knew the client); `CoachApp.tsx:53-56`.

  Triage items live on 8+ screens:
  - the attention list, Dashboard › Overview 1.1 screens down;
  - `/coach/checkins` and `/coach/assessments`, both ☰-only;
  - freeze requests (More › Subscription);
  - transfer requests (Clients header);
  - renewals (Revenue/Dashboard);
  - flagged food swaps (view-as-client, day by day);
  - unread messages, badged twice.
- **Steps / scenario:** Open the app at 08:00 and try to answer "what do I need to do today?".
- **Expected vs actual:** Expected: one list of pending decisions, each with its action. Actual: a red roster plus several menus.
- **Why it matters:** This is the coach's main job. Everything else is secondary.
- **Direction:**
  - A **Today** queue as the landing on every breakpoint: check-ins to review (reuse the review queue), new assessments, unread conversations, freeze/transfer requests, renewals ≤7 days, clients with a plan and an active subscription but no workout in N days, flagged swaps.
  - Clients sorted by the same urgency.
- **Verified:** BROWSER-VERIFIED

### CO-06 — "Needs attention" and "At risk" are too noisy to trust
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · Clients, Dashboard, client switcher · all
- **Evidence:** BV-24 ("AT RISK" on a client whose only issue is a pending assessment; 9 pending assessments dominate); `coachDashboardApi.ts:108`: `needsAttention = assessment submitted/updated || workouts7d === 0 || toReview`; `OverviewPanel.tsx:31-34` picks the hero by oldest activity, so a never-active new client is featured.
- **Steps / scenario:** Seed 10 clients across frozen / expired / trial / no-plan states; 9 are flagged.
- **Expected vs actual:**
  - Expected: flags only for actionable states.
  - Actual: frozen, expired, plan-less and brand-new clients count as "inactive".
  - Unread messages, freeze requests, renewals and flagged swaps are ignored.
- **Why it matters:** When almost everyone is red, red means nothing.
- **Direction:**
  - Each flag carries a specific reason and one action.
  - Exclude states where inactivity is expected.
  - "At risk" only for a real, explainable risk.
- **Verified:** BROWSER-VERIFIED

### CO-07 — The client list shows and filters the admin account state
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/clients` (mobile rows; desktop column, see TB-01) · all
- **Evidence:** BV-20; `CoachClients.tsx:38-54, 304`; the account section is admin-only (`CoachSubscriptionPanel.tsx:62-67, 234`), so coaches can't change it. en: `subscription.acct.suspended` = "Frozen" (the same word as the coach's *subscription* freeze).
- **Steps / scenario:** Freeze a client's subscription, then tap the "Frozen" chip.
- **Expected vs actual:** Expected: the frozen-subscription client appears. Actual: the chip filters *account* suspension; every row says "ACTIVE".
- **Why it matters:** A wrong status on every row trains the coach to ignore the list.
- **Direction:**
  - Show the subscription/coaching state (Active · Trial · Frozen · Expiring · Expired · No plan).
  - Only surface the account state when it blocks the client (suspended), as a warning.
- **Verified:** BROWSER-VERIFIED

### CO-08 — A client is spread over an 11-tab rail, a More sheet and a separate "view as client" layout
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id/*`, `/view/:tab`, `/versions/:kind` · all
- **Evidence:** BV-32 (rail 393 px in 350; "More" off-screen; scrolling clips "OVERVIEW"); `CoachClientWorkspaceLayout.tsx:20-59`; `CoachViewLayout.tsx:20`; More sheet `journey-coach2/j1-03-more-sheet.png`; ~21 per-client URLs (`CoachApp.tsx:91-109`).
- **Steps / scenario:** From a client, find the latest check-in, then the food log for last Tuesday, then the subscription.
- **Expected vs actual:**
  - Expected: one place with a few stable sections.
  - Actual: Check-ins and Subscription sit behind a hidden "More".
  - The "Progress" tab exits to another layout whose "Nutrition" means the food log, not the plan.
- **Why it matters:** The coach can't form a model of "the client"; context and Back break (NAV-K01).
- **Direction:**
  - 4 segments: **Summary** (week vs plan, open items, latest check-in) · **Plan** (workout/nutrition/cardio, templates, versions) · **Progress** (log timeline, body, check-in history) · **Profile** (assessment, private notes, subscription, coaching history).
  - Sticky compact header.
- **Verified:** BROWSER-VERIFIED

### CO-09 — The Overview tab's headline metric is wrong and the rest is navigation
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id` · all
- **Evidence:** BV-22 ("10 WORKOUTS (7D)" for a client logging ~4/week); `CoachClientDetail.tsx:75-76, 112-114` (finished among the last 10 logs, no date window); "Plans" excludes cardio (`:111`). VIEW ACTIVITY / MANAGE PLAN + 3 link cards duplicate the tabs (`:151-230`).
- **Steps / scenario:** Open any active client.
- **Expected vs actual:** Expected: this week's sessions done vs planned, last workout, weight trend, open items. Actual: false 7-day count, counts of notes/plans, and a second menu.
- **Why it matters:** The most visited client screen misinforms the coach's main judgement (adherence).
- **Direction:** Replace with the Summary segment (CO-08). Every number must state its window and source.
- **Verified:** BROWSER-VERIFIED

### CO-10 — Editing a program on a phone takes 10 taps and three back buttons
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · Workout editor (PlanBuilder) · ≤767
- **Evidence:** BV-09 (J2 = 10 taps; 3 stacked backs; mandatory Section level; Back after Save lands on Clients); `evidence/coach-day-builder-390.png`; `PlanBuilder.tsx:241-418`; `CoachWorkoutEditor.tsx:108-157`.
- **Steps / scenario:** Client → Workout → day → section → Add exercise → search → select → Add selected → Save plan → Back.
- **Expected vs actual:**
  - Expected: day screen → "+ exercise" → pick → done, with autosave.
  - Actual:
    - 3 drill levels;
    - a section to create before the first exercise;
    - a top-only, non-sticky Save;
    - "Save" inside sheets that applies only locally;
    - three save concepts (Save, Save as new version, Save as template) explained by a paragraph.
- **Why it matters:** Program edits are the coach's second most frequent task.
- **Direction:**
  - A mobile-native day editor: exercises listed directly, with sets/reps/rest inline and grouping (superset) as an attribute.
  - One back (up a level).
  - A sticky bottom action bar, autosave, and automatic versions (CO-11).
- **Verified:** BROWSER-VERIFIED

### CO-11 — Plain Save keeps no version, so "Version history" is empty for real clients
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · plan editors, `/versions/:kind` · all
- **Evidence:** `shots/coach-390/390-client-versions.png` ("No saved versions yet" for a 4-day / 20-exercise plan); BV-11 (`planVersions` = 0 after the wipe); en `coachEditor.saveHint` ("no history is kept unless you use Save as new version").
- **Steps / scenario:** Edit and save a plan several times; open History.
- **Expected vs actual:** Expected: each save is restorable. Actual: only manual "Save as new version" snapshots exist.
- **Why it matters:** There is no safety net for CO-01 or for ordinary mistakes; versioning is a concept the coach has to manage.
- **Direction:** Auto-version on every save (keep N), show "Restore previous" inside the editor, and remove the manual version button.
- **Verified:** BROWSER-VERIFIED

### CO-12 — The nutrition editor is a 4.3-screen form of repeated controls
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id/nutrition` · ≤767
- **Evidence:** BV-40 (3,630 px; 62/91 controls under 44 px; every meal repeats a name field and 5 slot chips); probe: planned-vs-target table 460 px in 348 (TB-03); `CoachNutritionEditor.tsx:224-260, 321-385`.
- **Steps / scenario:** Open a client's 4-meal plan and change one food quantity.
- **Expected vs actual:** Expected: targets summary → meals as collapsed rows → edit one food in a sheet → autosave. Actual: scroll past a sideways table, targets, swap chips and four fully expanded meal editors.
- **Why it matters:** Meal plans are reused and tweaked weekly; this makes small changes expensive and error-prone.
- **Direction:**
  - Targets first with a live planned-vs-target bar.
  - Meals collapsed (name + kcal); slot is a property, not 5 chips.
  - One food sheet with a single search over library + database.
  - "Start from template".
- **Verified:** BROWSER-VERIFIED

### CO-13 — Check-ins put "Request" first and hide the review queue in the menu
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · Client › Check-ins, `/coach/checkins` · ≤767
- **Evidence:**
  - BV-31: primary "REQUEST WEEKLY CHECK-IN" above a SUBMITTED row; `evidence/coach-client-checkins-390.png`.
  - The `/coach/checkins` header is truncated to "Ch…" beside REVIEW (1) and SEND REMINDERS (7) (`shots/coach-390/390-checkins.full.png`).
  - The sequential review queue (`CoachCheckInsOverview.tsx:199-234`) is reachable only via ☰.
- **Steps / scenario:** J1: 6 taps + typing, and only if you already know which client.
- **Expected vs actual:** Expected: "1 check-in to review" leads straight into the review queue. Actual: a request-first screen per client and an overview behind the menu.
- **Why it matters:** The weekly check-in is the core coaching ritual.
- **Direction:**
  - Today item "Check-ins to review (n)" opens the queue.
  - Per client: the latest check-in expanded at the top of Summary.
  - "Request" is secondary.
  - Warn before marking reviewed with empty feedback; keep feedback editable.
- **Verified:** BROWSER-VERIFIED

### CO-14 — The subscription tab offers 7 competing actions and pre-fills a "free" renewal
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/client/:id/subscription` · all
- **Evidence:**
  - BV-35; `evidence/coach-client-subscription-390.png`.
  - Set-term sheet with an empty price for a 1000 EGP client (`journey-coach2/j5-07-action-sheet.png`; `SetTermSheet` `useState('')`, `CoachSubscriptionPanel.tsx:394`).
  - Sheet state is initialized once (`:391-395, 343-344`).
  - A failed read renders "No subscription" + the primary Set term (`:168-202`).
  - Local-midnight parsing vs UTC formatting (`:48-50`).
  - Free-text currency (`:355`).
- **Steps / scenario:** J5: Dashboard renewal row → More → Subscription → SET TERM (4 taps). The price field is empty.
- **Expected vs actual:** Expected: one "Renew" pre-filled with the current package/price and an explicit new end date. Actual: Set term / Set price / Freeze / Extend +30d / End / Cancel; the price is blank.
- **Why it matters:** Wrong or forgotten prices corrupt revenue; overlapping terminal actions ("End" vs "Cancel") invite mistakes.
- **Direction:**
  - One primary "Renew / change term" (package preset, price prefilled, end-date preview).
  - Freeze secondary; End in an overflow with consequences spelled out.
  - Error state instead of "No subscription".
  - Dates handled in the coach's timezone.
- **Verified:** BROWSER-VERIFIED

### CO-15 — Renewing overwrites the previous term: subscription and payment history are never recorded
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach and client · Subscription tab, Revenue, the client's subscription card · all
- **Evidence:** `api/coach-clients/_service.ts:53-73`: `setTerm` replaces `startAt/endAt/price` in place. No code anywhere writes `subscriptionHistory` (grep: only type definitions and readers in `SubscriptionHistory.tsx`, `coachDashboardApi.ts:166`, `useSubscription.ts:25`). The seeded "Renewed · 1 months" rows come from seed data.
- **Steps / scenario:** Renew a client (Set term) → open the history → the previous term is gone; Revenue's "collected" loses the previous payment.
- **Expected vs actual:** Expected: each paid term archived, with totals per client and per month. Actual: only the current term exists.
- **Why it matters:** Coaches lose their own billing record; "Total paid" and revenue history under-report.
- **Direction:** The backend archives the outgoing term on every term change, and Revenue reads from that ledger. Decide whether a "term" is a payment record (it currently is not).
- **Verified:** CODE-CONFIRMED

### CO-16 — Revenue is a primary tab of 17 cards that never names the client to act on
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** MOVE
- **Who / where:** coach · `/coach/revenue` (bottom tab #4) · all
- **Evidence:** BV-23; `evidence/coach-revenue-390-full.png`; `nav.ts:91`; `AnalyticsPanel.tsx:26-105`.
- **Steps / scenario:** Find which client lapsed this month.
- **Expected vs actual:** Expected: "Youssef — expired 5 days ago — Renew / Message". Actual: "1 EXPIRED" in a tile; renewal rows are not tappable.
- **Why it matters:** A weekly concern takes a daily slot while the weekly ritual (check-ins) is menu-only.
- **Direction:**
  - Business behind the avatar: This month (booked · due · lost), Renewals due (tappable, inline renew), Lapsed clients (named, with actions).
  - Renewals ≤7 days and fresh lapses also appear in Today.
- **Verified:** BROWSER-VERIFIED

### CO-17 — The dashboard is 2.8 screens of stale and repeated content
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/dashboard` · ≤767
- **Evidence:** BV-24; `evidence/coach-dashboard-390-full.png`:
  - "Get started 1/3" for a 10-client coach;
  - the tab row overflows;
  - an "AT RISK" hero for an assessment review;
  - a "Quick actions" heading with no content whose KPI cards read as its content;
  - 22 cards across 4 tabs;
  - a skeleton forever on error (`CoachDashboard.tsx:83-84`).
- **Steps / scenario:** Tap Dashboard (bottom tab #1) on a phone.
- **Expected vs actual:** Expected: the day's queue. Actual: greeting, 3 hero pills, checklist, headline, hero, list, empty section, 5 KPI cards, renewals.
- **Why it matters:** Tab #1 on the bar is not the landing and doesn't answer "what now".
- **Direction:** Replace the Dashboard with Today (CO-05). Business KPIs move to Business. Delete the Engagement/Content/Clients panels.
- **Verified:** BROWSER-VERIFIED

### CO-18 — States lie: errors look empty, offline looks empty, some loads never end
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · ~20 screens · all
- **Evidence:** Detail in §6:
  - React Query v5 paused-offline ⇒ `isLoading=false` ⇒ empty branches render;
  - `OfflineState`/`PermissionState` are never used in the coach app;
  - `ErrorState` is used on 4 screens;
  - "Working…" (a button label) is the loader in 19 files;
  - errors become "No check-ins", "not completed", "No subscription", "No templates yet", "No saved versions yet";
  - Dashboard/Reports skeleton forever on error.

  CO-01 is the worst case.
- **Steps / scenario:** Airplane mode with a cold cache → open Clients ("No clients yet — add your first client"), a check-in tab ("No check-ins"), a subscription ("No subscription").
- **Expected vs actual:** Expected: "You're offline / couldn't load — Retry". Actual: a confident false empty state, sometimes with a destructive CTA.
- **Why it matters:** Coaches act on what they see; false empties cause duplicate or destructive actions.
- **Direction:** One shared query-state boundary (loading / success-empty / error / offline-paused). Editors and destructive surfaces render only on success.
- **Verified:** CODE-CONFIRMED

### CO-19 — Features that promise something and lead nowhere
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REMOVE
- **Who / where:** coach · nutrition/cardio editors, templates, dashboard · all
- **Evidence:**
  1. "Flag custom swaps for review": swaps show "Needs review" in view-as-client, but there is **no approve/decline action anywhere** (`CoachNutritionEditor.tsx:378-385`; `CoachViewNutrition.tsx:189-199`).
  2. Cardio says "Daily minute/step targets are set under Targets" (`shots/coach-390/390-client-cardio.png`). **No coach UI sets them** (`setCoachTargets` has no caller, `coachApi.ts:309-315`), yet the client sees "9000 STEPS · 150 min CARDIO" targets (`evidence/client-your-coach-390-full.png`).
  3. Nutrition templates exist in the API (`coachAssetsApi.ts:271-284`) with no UI.
  4. No "start from template" inside a client (`AssignTemplate` is only imported by the template preview).
  5. "Send broadcast" (dashboard, ⌘K) just opens the inbox.
- **Steps / scenario:** Enable "Flag custom swaps for review", then try to review a flagged swap.
- **Expected vs actual:** Expected: each promise has a working action. Actual: dead ends; client targets the coach can neither see nor change.
- **Why it matters:** Broken promises erode trust in every other control.
- **Direction:** For each, either build the action into Today/Plan or remove the control and its copy. Step/cardio targets must be visible and editable by the coach or hidden from the client.
- **Verified:** BROWSER-VERIFIED

### CO-20 — "View as client" shows one empty day at a time
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id/view/*` · all
- **Evidence:** `shots/coach-390/390-client-view.full.png`: the default "TODAY" for a 4×/week client reads "No workout logged this day", "No meals logged this day", 0 steps, 0 min, 0 ml, "—". `ClientActivityView.tsx:30` (day stepper only); each tab keeps its own date (`CoachViewNutrition.tsx:17` etc.); a separate layout (`CoachApp.tsx:107-108`).
- **Steps / scenario:** Find what the client lifted on last Tuesday's push day.
- **Expected vs actual:** Expected: a week/timeline of logged sessions with tap-through. Actual: tap ‹ N times on a single-day page; switching tabs resets the date.
- **Why it matters:** Reviewing actual training is how a coach adjusts the plan.
- **Direction:** Progress segment: a log timeline (sessions, nutrition adherence, cardio) with week navigation, a body section (weight, measurements, photos), and check-in history. One date context across sub-views.
- **Verified:** BROWSER-VERIFIED

### CO-21 — Workspace notes are published to the client without saying so
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach → client · More › Notes, Overview notes, view-as-client "Add note" · all
- **Evidence:** The coach's note "Focus on sleep this week — aim for 7h+…" appears under "Notes & announcements" on the client's Your coach page (`evidence/client-your-coach-390-full.png`). Inline anchored notes render on client screens (`EntityNotes.tsx:33-53`). The coach UI has no visibility label; `CoachClientNotes.tsx:14-18` calls them "internal".
- **Steps / scenario:** Add a note on the Notes tab; open the client app → Your coach.
- **Expected vs actual:** Expected: an explicit "visible to client" or a private option. Actual: silently published.
- **Why it matters:** The same trust issue as CO-02, across the main notes feature.
- **Direction:** Two explicit kinds: "Note to client" (eye icon, shows on client) and "Private note". Rename "Add note" links in view-as-client accordingly.
- **Verified:** BROWSER-VERIFIED

### CO-22 — Labels contradict the numbers they show
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Dashboard, Reports, Adherence, Overview · all
- **Evidence:**
  - One value (`checkinsToReview`) is labelled "2 check-ins overdue" (headline), "Check-ins to review" (card) and "Pending check-ins" (Reports) (`OverviewPanel.tsx:38,110`; `ReportsPanel.tsx:66`).
  - "Avg adherence 60%" = % of clients with ≥1 workout (`coachDashboardApi.ts:133`).
  - "Active clients" = account status (`:129`).
  - "4 missed sessions" = clients with 0 workouts.
  - "4 wk" = 4 workouts (`shots/coach-390/390-adherence.png`).
  - "Renewals (7d)" = ending.
  - Pluralization: "1 sections", "1 months", "1 months total".
- **Steps / scenario:** Compare Dashboard, Reports and Adherence for the same coach.
- **Expected vs actual:** Expected: one label per metric, matching its formula. Actual: three names for one number; misleading formulas.
- **Why it matters:** Numbers the coach can't trust are noise.
- **Direction:** Keep only metrics that drive an action. Name each by what it counts and its window. Fix plurals via i18n count forms.
- **Verified:** BROWSER-VERIFIED

### CO-23 — A new coach's library is empty, and its chrome is clipped
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/library` · ≤767
- **Evidence:** BV-10; `evidence/coach-library-empty-390.png`: the tab chips are clipped ("Supple…"); search is squeezed to "Searc" beside the "LOAD STARTER LIBRARY" text button; the empty state "Create your first exercise" offers no starter action (`CoachExerciseLibrary.tsx:66-72, 182-226`).
- **Steps / scenario:** A new coach opens Library.
- **Expected vs actual:** Expected: the starter library available by default (or a one-tap prominent import in the empty state). Actual: a hidden text button; clipped navigation.
- **Why it matters:** First-run impression; coaches can't build plans without exercises.
- **Direction:** Ship the starter library as a read-only base that coaches extend/override; scrollable segments; full-width search (detail in docs 07/08).
- **Verified:** BROWSER-VERIFIED

### CO-24 — The exercise picker shows no media and favours "Quick create"
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Add exercise sheet · ≤767
- **Evidence:** BV-08; `evidence/coach-exercise-picker-390.png` (the first alphabetical result has no media; no thumbnail or preview; QUICK CREATE is a full-width primary above the results; nested 45vh scroller, `ExercisePickerSheet.tsx:131-203`).
- **Steps / scenario:** Search "front squat".
- **Expected vs actual:** Expected: thumbnails/media badges, sorted by relevance, preview before adding, muscle/equipment filters. Actual: plain alphabetical text rows.
- **Why it matters:** The coach picks the wrong variant and the client gets an exercise with no demo.
- **Direction:** Relevance + media-first ranking, inline preview, filters; "Create new" as a secondary row at the end of the results (detail in EX doc).
- **Verified:** BROWSER-VERIFIED

### CO-25 — Opening the workout editor marks legacy plans "Unsaved" before any edit
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Workout tab · all
- **Evidence:**
  - `shots/journey-coach/j2-02-workout-tab.png` shows "Unsaved changes" and "1 sections · 5 exercises" immediately after opening the tab.
  - The tour capture of the same plan shows "0 sections · 5 exercises" (`evidence/coach-client-workout-390-full.png`).
  - `PlanBuilder.tsx:65-82`: a one-time migration rewrites section-less days on mount, arming the unsaved guard and autosaving a draft.
  - `syncDay` (`:30`) rebuilds `exerciseIds` from sections on any edit. INFERRED: a day stored with `sections: []` but non-empty `exerciseIds` would drop its exercises on the first edit.
- **Steps / scenario:** Open a plan created without sections; tap Back without touching anything → "Discard changes?".
- **Expected vs actual:** Expected: a clean open. Actual: a dirty state on open; "0 sections" shown to coaches.
- **Why it matters:** False prompts teach coaches to click through real warnings; possible silent exercise loss.
- **Direction:** Migrate plan data once server-side; never mutate on view; drop the "sections" vocabulary from the UI.
- **Verified:** BROWSER-VERIFIED

### CO-26 — The exercise form is 12 fields, metadata-first, and overwrites Arabic text
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach · exercise sheet (plan + library), food and supplement forms · all
- **Evidence:** `ExerciseForm.tsx:90, 96-160` (`notes: { en, ar }` both set to the English field); `CoachNutritionEditor.tsx:183, 213-214`; `CoachExerciseLibrary.tsx:326, 577-578`; meal labels edit `.en` only (`CoachNutritionEditor.tsx:227`).
- **Steps / scenario:** Edit sets on a bilingual starter exercise in an Arabic client's plan → the Arabic instructions are replaced by the English text.
- **Expected vs actual:** Expected: programming fields first; language fields preserved. Actual: name/muscle/category/equipment lead; any save flattens `ar` to `en`.
- **Why it matters:** Arabic is a primary market (`ar-eg`); clients lose localized instructions after routine edits.
- **Direction:**
  - The plan-exercise sheet = sets, reps, rest, notes, video.
  - Library metadata edited only in the library.
  - Store per-language text explicitly.
- **Verified:** CODE-CONFIRMED

### CO-27 — The inbox is a client directory, and broadcast narrows its audience silently
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/messages` · ≤767
- **Evidence:** `shots/coach-390/390-messages.png` (7 rows "No messages yet"; names truncated to "Karim Tar…"); `CoachMessages.tsx:70-83`; broadcast `clients={list}` = the filtered list (`:180, 294-295`), body labelled "Notes" (`:333`), "All" via `admin.allRoles`; N parallel client-side sends (`messagesApi.ts:291-293`).
- **Steps / scenario:** Search "ahmed" in the inbox → ⚡ → send "to all" → only Ahmed receives it.
- **Expected vs actual:** Expected: conversations only; broadcast chooses its audience explicitly. Actual: a directory; the audience follows the search.
- **Why it matters:** Missed or wrongly-targeted announcements (detail in the MS doc).
- **Direction:** Conversations list; "New message" picker; broadcast with an explicit audience (All / segment) and a server-side fan-out.
- **Verified:** BROWSER-VERIFIED

### CO-28 — The WhatsApp support button covers content on every coach page
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MOVE
- **Who / where:** coach · all routes except messages · all
- **Evidence:** BV-20 (covers row chevrons); probes: a "Close" 20×20 target on 28 of 32 coach routes at 390; `WhatsAppFab.tsx:28,46`; screenshots show it over the Dashboard hero, Overview cards and the Library.
- **Steps / scenario:** Scroll any list.
- **Expected vs actual:** Expected: support in Me › Help. Actual: a floating green button with a 20 px dismiss that returns every session.
- **Why it matters:** Visual noise; tap collisions; looks unprofessional in a pro tool.
- **Direction:** Move it into Me › Help; never float over task content.
- **Verified:** BROWSER-VERIFIED

### CO-29 — Workspace header actions wrap and have no accessible names
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · client header; Dashboard "+" · ≤639
- **Evidence:** Probe `noName` for both header buttons on every client route and for the Dashboard "+"; screenshots show 💬/✎ on a second row; `CoachClientWorkspaceLayout.tsx:110-134` (`flex-wrap`, labels `hidden sm:inline`).
- **Steps / scenario:** Screen reader on a client page.
- **Expected vs actual:** Expected: a one-row, labelled header. Actual: a 2-row header (~115 px) with unnamed buttons.
- **Why it matters:** Wasted height on every client screen; accessibility failure (see AX doc).
- **Direction:** A compact sticky header: name + status, 💬 with label, overflow menu.
- **Verified:** BROWSER-VERIFIED

### CO-30 — Banners render everywhere, including full-height task screens
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MOVE
- **Who / where:** coach · all routes · all
- **Evidence:** `CoachPlanBanner` is in every page (`CoachApp.tsx:64-69`; `evidence/coach-thread-composer-under-nav.png`); `BannerHost` (admin marketing) is mounted above the whole app (`App.tsx:122`) although documented as dashboard-only (`BannerHost.tsx:33-40`).
- **Steps / scenario:** A Forma request is awaiting payment, so a banner shows on every screen for days.
- **Expected vs actual:** Expected: blocking states app-wide; informational ones on Me/My plan only; marketing on Today only. Actual: everywhere.
- **Why it matters:** Persistent nagging; breaks fixed-height layouts (CO-04).
- **Direction:** Banner policy: blocking only, never inside task flows.
- **Verified:** BROWSER-VERIFIED

### CO-31 — Account settings save silently and expose raw values
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/settings` · all
- **Evidence:** `shots/coach-390/390-settings.full.png`; `RoleAccount.tsx:42-49, 109-120` (blur-save, `void updateSelf`, no feedback); timezone free text with the placeholder "Africa/Cairo"; capacity card counts disabled clients (`:37`); no bio/specialty although the checklist asks for a "coach profile".
- **Steps / scenario:** Edit the phone number, leave the page → no confirmation; a failure is invisible.
- **Expected vs actual:** Expected: visible saved/failed state; a timezone picker or auto-detect. Actual: silent writes; IANA ids.
- **Why it matters:** Settings errors surface later as wrong reminder times or contact details.
- **Direction:** Explicit autosave status per field; a detected timezone; profile fields if the coach profile matters (product decision).
- **Verified:** BROWSER-VERIFIED

### CO-32 — My Plan is heavy for a single-plan product, and capacity is counted 3 ways in 5 places
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/plan`, Clients strip, Account card, banners · all
- **Evidence:**
  - `shots/coach-390/390-plan.full.png`: 1.9 screens; the card value is clipped to "Forma Subscripti"; a "Product = Forma" card adds nothing.
  - Used counts: `CoachClients.tsx:115-117` (non-disabled roster), `RoleAccount.tsx:37` (all clients), `coachPlanApi.ts:68-72` (server counter), `CoachDashboard.tsx:78` (dashboard rows).
  - Legacy tier remnants: `CoachTrialBanner.tsx:12` reads `plan.plan`; dead `coachPlan.*` tier copy; "Forma subscription (legacy)" request labels.
- **Steps / scenario:** Compare "10 / 25" across Clients, Account and My Plan after a client is disabled.
- **Expected vs actual:** Expected: one status card and one capacity number. Actual: four cards, three counting rules.
- **Why it matters:** Commercial clarity; fewer support questions.
- **Direction:** Me › Forma subscription: status/ends/price/Renew; capacity used/limit; offers; collapsed history. One server-computed count everywhere. Remove the tier remnants.
- **Verified:** BROWSER-VERIFIED

### CO-33 — Notifications duplicate the inbox and double-badge messages
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** coach · bell, `/coach/notifications` · all
- **Evidence:** `shots/coach-390/390-notifications.png` (NEW MESSAGE rows next to check-in rows; the bell shows 6 while Messages shows 3); `useNotifications.ts:73-74`; the message notification is marked read only when the thread opens (`MessageThread.tsx:351-353`).
- **Steps / scenario:** A client sends a message → two badges increase.
- **Expected vs actual:** Expected: messages badge Messages only; coach events land in Today. Actual: duplicated counts and feeds.
- **Why it matters:** Badge inflation hides what matters (detail in the NT doc).
- **Direction:** Coach events → Today items; the bell is removed or becomes "Today (n)"; no message notifications in the feed.
- **Verified:** BROWSER-VERIFIED

### CO-34 — The Adherence page duplicates Reports, its rows are dead on mobile, and "wk" means workouts
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** coach · `/coach/adherence` · ≤1023
- **Evidence:** `shots/coach-390/390-adherence.png` ("4 wk"); non-clickable `<div className="row">` on mobile (`CoachAdherence.tsx:86-97`); the same ranking appears on Reports (`ReportsPanel.tsx:77-105`).
- **Steps / scenario:** Tap a low-adherence client in the list.
- **Expected vs actual:** Expected: open the client. Actual: nothing happens.
- **Why it matters:** A whole destination for a sort order.
- **Direction:** A "Workouts (7d)" sortable column/filter on Clients; delete the page.
- **Verified:** BROWSER-VERIFIED

### CO-35 — Reports on a phone are aggregate exports and a duplicate ranking
- **Priority:** P2      **Effort:** S      **Impact:** LOW
- **Action:** MOVE
- **Who / where:** coach · `/coach/reports` · ≤767
- **Evidence:** `shots/coach-390/390-reports.full.png`; "Subscriptions CSV" = status counts; "Revenue CSV" = 4 numbers (`ReportsPanel.tsx:20-42`).
- **Steps / scenario:** Export on an iPhone PWA.
- **Expected vs actual:** Expected: useful exports on desktop. Actual: aggregate CSVs on mobile, where blob downloads are unreliable.
- **Why it matters:** Clutter in navigation.
- **Direction:** Exports live in desktop Business with real rows and a date range; remove the mobile entry.
- **Verified:** BROWSER-VERIFIED

### CO-36 — "Plan" means four different things
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · nav, editors, Client Plans, My Plan, banners · all
- **Evidence:** "Workout plan" / "Edit plan" / "Manage plan" (training); "My Plan" (Forma subscription); "Client Plans" (packages, `shots/coach-390/390-subscription-plans.png`); `CoachPlanGate`/`CoachPlanBanner` (Forma state); the package form exposes an "Order" number (`CoachSubscriptionPlans.tsx:123`).
- **Steps / scenario:** Read the ☰ menu: "Client Plans" and "My Plan" sit next to the workout "Plan" tabs.
- **Expected vs actual:** Expected: one word per concept. Actual: a homonym for the product's core noun.
- **Why it matters:** Misnavigation and support load.
- **Direction:** "Plan" = training/nutrition only; "Packages" for client pricing; "Forma subscription" for the coach's own plan; hide sort-order numbers.
- **Verified:** BROWSER-VERIFIED

### CO-37 — Adding a client forces a "new vs existing" choice and silently revokes invites
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** coach · Clients › + · ≤767
- **Evidence:** `CoachClients.tsx:317-372` (chooser); InvitePanel revokes generated-but-not-copied codes on close (`:381-391`); the existing-client branch carries CO-03.
- **Steps / scenario:** Generate an invite, read the code aloud, close the sheet → the code is revoked.
- **Expected vs actual:** Expected: one field (email/phone) → the system finds or invites; links never revoked without an explicit action. Actual: a two-path chooser; silent revocation.
- **Why it matters:** Onboarding new clients is the growth path.
- **Direction:** A single add flow with a server-side lookup (no enumeration); explicit "Revoke".
- **Verified:** CODE-CONFIRMED

### CO-38 — The assessment review page is 2.9 screens with a separately saved note
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Client › Assessments · ≤767
- **Evidence:** `shots/coach-390/390-client-assessment.full.png` (an extra "Client assessment" title under the workspace header; "8/10" wrapped one character per line; SAVE notes separate from MARK REVIEWED; 3 "Build … plan" links); errors render as "not completed" (`CoachClientAssessment.tsx:75-80`).
- **Steps / scenario:** Review a submitted assessment and leave a note.
- **Expected vs actual:** Expected: highlights (goal, injuries, constraints) first, one "Mark reviewed" with optional feedback. Actual: a long form-like page with two save actions.
- **Why it matters:** Every new client starts here.
- **Direction:** A Today "Review assessment" sheet with flagged answers on top; the full answers in Profile.
- **Verified:** BROWSER-VERIFIED

### CO-39 — Template flows: a preview without exercises, checkbox noise, and a Back loop
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/templates*` · all
- **Evidence:** `CoachTemplatePreview.tsx:76-87` (counts only); corner `RowCheckbox` on every card (`CoachTemplates.tsx:93`); Save/exit push to the preview → Back returns to the editor (NAV-K04); the template editor registers no unsaved guard.
- **Steps / scenario:** Templates → card → "preview" (no exercises) → Edit → Save → Back → editor again.
- **Expected vs actual:** Expected: open the template directly with its content; Back returns to the list. Actual: an intermediate page with no content; a history loop.
- **Why it matters:** Templates are how coaches scale.
- **Direction:** Open templates in the shared editor (read mode first); "Assign to client" there and inside the client's Plan (detail in docs 07/08).
- **Verified:** CODE-CONFIRMED

### CO-40 — "Release client" is hidden, styled as a primary action and fails silently
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MOVE
- **Who / where:** coach · Overview › Manage plan › Release client · all
- **Evidence:** `CoachClientDetail.tsx:52-61` (no `onError`), `:310` (`btn-primary bg-danger` renders brand orange because the gradient image paints over the colour), `:59` (`navigate('/coach')` push → Back returns to the released client).
- **Steps / scenario:** Manage plan → Release client → confirm while offline.
- **Expected vs actual:** Expected: a red destructive confirm in the client overflow, with an error message on failure. Actual: hidden under "Manage plan", orange, silent.
- **Why it matters:** An irreversible relationship change.
- **Direction:** Header overflow → "Release / transfer client" with a consequence summary and an error state.
- **Verified:** CODE-CONFIRMED

### CO-41 — Editors are full of undersized and bare icon controls
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · nutrition, cardio, subscription, library · ≤767
- **Evidence:** BV-40 (62/91 small, 14 under 24 px on nutrition); probes: cardio 17/28, subscription 13/24, workout 14/29; bare red "−"/✕ icons with no hit-area extension (`CoachNutritionEditor.tsx:250, 427`; `CoachCardioEditor.tsx:148`; `CoachExerciseLibrary.tsx:235, 382, 487, 612`).
- **Steps / scenario:** Delete a food item one-handed.
- **Expected vs actual:** Expected: ≥44 px targets; delete via swipe/overflow with undo. Actual: ~18 px red icons next to tap targets.
- **Why it matters:** Mis-taps on destructive controls (see AX doc).
- **Direction:** Row overflow or swipe-to-delete with undo; one control size scale.
- **Verified:** BROWSER-VERIFIED

### CO-42 — Polish: eyebrows, date formats, RTL chevrons, hard-coded units
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach · many routes · all
- **Evidence:**
  - "COACH PORTAL" eyebrow on ~10 pages.
  - Notes dated "10/4/2026" (US format, `CoachClientDetail.tsx:261`).
  - ISO dates on subscription.
  - Raw ISO in "Last active" (`CoachClients.tsx:294`, `ClientSwitcherSheet.tsx:69`).
  - Chevrons without RTL rotation (`CoachClients.tsx:305`, `ClientSwitcherSheet.tsx:79`, `CoachAssessments.tsx:73`, `CoachMessages.tsx:283`).
  - "kcal/P/C/F/A/B/Δ/(copy)/🎬/✅🔄⬜" literals (`CoachViewNutrition.tsx:111-148`, `CoachViewMeasurements.tsx:66-68`, `PlanBuilder.tsx:110,136,267`).
- **Steps / scenario:** Switch to `ar-eg`.
- **Expected vs actual:** Expected: localized dates/units, mirrored icons. Actual: mixed formats and literals.
- **Why it matters:** Premium feel; Arabic market (see RTL doc).
- **Direction:** One date/number formatter; i18n units; drop eyebrows.
- **Verified:** BROWSER-VERIFIED

---

## 4. Desktop concepts that must not survive unchanged on mobile

| Concept (where today) | Why it fails on a phone | Mobile direction |
|---|---|---|
| Admin account-status filters and pills (Clients) | Coach can't act on them; wrong signal on every row (BV-20) | Coaching-state filters; account state only as a blocking warning |
| Row checkboxes + floating bulk bar (Library, Templates) | Noise on every row; the bulk bar covers content | "Select" mode on long-press; delete via overflow/swipe + undo |
| Numbered pagination (Adherence, Library, Templates, Notifications) | Small chips, extra taps | Progressive "load more" / continuous lists |
| KPI card walls (Dashboard 22, Revenue 17) | 2.6–2.8 screens of numbers that don't drive actions | One count per Today group; Business is desktop-first |
| CSV exports (Reports) | Blob downloads unreliable in an iOS PWA; aggregates only | Desktop-only exports with real rows |
| Planned-vs-target table (`min-w-[420px]`) | Sideways scroll hides Carbs/Fats | Macro progress rows under the targets |
| 11-tab rail / More sheet | "More" off-screen (BV-32) | 4 segments |
| Command palette (⌘K only) | No trigger on phones | Search field in the Clients/Today header |
| Split panes and preview panels (Clients, Messages) | Not rendered <1024 (keep it that way) | List → full-screen detail |
| 3-level PlanBuilder drill-down with a mandatory section level | 10 taps, 3 backs (BV-09) | Day = exercise list with inline sets/reps; grouping as an attribute |
| 12-field exercise form | Metadata before programming | Programming-first sheet; library metadata in the library |
| "Save as new version" as a user concept | Versioning is the system's job | Auto-version on save; "Restore previous" |

---

## 5. Forms (coach)

| Form | Keyboard / numeric | Units | Validation and errors | Primary action placement | Unsaved / back | Offline and loading | Verdict |
|---|---|---|---|---|---|---|---|
| Workout editor + exercise form | Sets numeric ✓, rest decimal ✓, reps free text (ranges) ✓ | Rest in seconds (decimal); no load/RIR targets | No inline errors; 0 sets allowed; Save never explains why it's disabled | Save in a non-sticky top bar; sheet "Save" applies locally | Guarded except bell/⌘K/History chip/OS back; 3 backs; draft resurrects after "Leave" (NAV-K02) | Failed/paused read → empty editor (CO-01); offline Save = endless "Saving…" | REBUILD |
| Nutrition editor + food sheet | Decimal macros ✓ | kcal/g/ml literals | Name-required only; "incomplete macros" hint ✓ | Same; food sheet Save at the end of a very long sheet | Same | Same CO-01 | REBUILD |
| Cardio editor | Duration decimal; frequency free text | min | None | Same | Same | Same CO-01 | MERGE into Plan |
| Template editor | as workout | | Save disabled with no message when the name is empty | Top bar | **No global guard**; exit/save push (NAV-K04) | Error → blank template with a new id (duplicate on save) | REDESIGN |
| Add client: invite | email/tel inputModes ✓ | currency from account | Errors via modal `alertDialog` | End of sheet | Sheet ‹ steps ✓ | Add disabled offline ✓ | MERGE (CO-37) |
| Add existing client | Search submits on button/Enter | | Transfer reason required (helper) ✓ | End of sheet | ✓ | "Searching…" | REDESIGN + CO-03 |
| Subscription: Set term / Price / Freeze | Native date ✓; duration numeric; price decimal; **currency free text** | | `savedFailed` line ✓; stale init; empty price prefill (CO-14) | End of sheet (not the `footer` slot) | n/a | Destructive actions offline-gated ✓, others not | REDESIGN |
| Packages ("Client Plans") | numeric/decimal ✓ | currency in label ✓ | Save disabled until name + duration ✓; exposed "Order" field | End of sheet | n/a | Offline-gated ✓ | REDESIGN |
| Notes (Overview / Notes tab / entity) | Textarea | | Overview & entity sheets: no error handling; Notes tab alert ✓ | End of sheet | Typed text lost on close | | REDESIGN (one composer + visibility) |
| Check-in feedback (tab + queue) | Textarea | | Empty feedback allowed, then read-only forever | Queue buttons at the end | Typed text lost on tab switch | | REDESIGN |
| Assessment coach notes | Textarea + separate Save | | Save disabled if unchanged ✓ | Below the field | Typed text lost on tab switch | | REDESIGN (CO-02) |
| Broadcast | Textarea labelled "Notes" | | Disabled until body | End | none | "Working…" | REDESIGN (CO-27) |
| Account | Blur-save, silent | | None | n/a | n/a | n/a | REDESIGN (CO-31) |

Cross-cutting:
- `Field` supports `error`/`aria-invalid` (`Field.tsx:44-47, 75`) but no coach form uses inline field errors.
- `Sheet` has a pinned `footer` slot (`Sheet.tsx:24-25, 129`), used only by the exercise picker. Every other sheet scrolls its primary button off-screen.
- Several labels aren't linked to inputs (`ExerciseForm.tsx:117-132`; `CoachNutritionEditor.tsx:366-374`; `CoachCardioEditor.tsx:169-176`; `CoachSubscriptionPanel.tsx:319-325, 349-356, 420-436`).

---

## 6. Loading, error, empty and offline (coach)

React Query v5 with `retry: 1`. With the default `networkMode:'online'`, an **offline query with no cache is `pending` + `paused`, so `isLoading === false`**, and screens that branch on `isLoading` fall through to their empty state.

| Screen | Loading | Empty | Error | Offline, no cache | Risk |
|---|---|---|---|---|---|
| Dashboard | Skeleton | n/a | **Skeleton forever** | Forever | P1 (CO-17/18) |
| Clients | "Working…" text | EmptyState ✓ | ErrorState ✓ | "No clients yet — add your first" | False empty |
| Client header | "Client" + "No subscription" pill flash | n/a | Stays "No subscription" | Same | P3 |
| Overview | Tiles show 0/— | "No notes yet" | Zeros | Zeros | Silent |
| Assessment | "Working…" | "Not completed" | **"Not completed"** | Same | False empty |
| Check-ins | Skeleton ✓ | EmptyState ✓ | "No check-ins" | Same | False empty |
| Workout/Nutrition/Cardio editors | Skeleton ✓ | Empty plan (legit when none) | **Empty plan; Save overwrites** | **Same** | **P0 (CO-01)** |
| Notes | None ("No notes yet" flashes) | EmptyState ✓ | Empty | Empty | Flash of false empty |
| Subscription | None ("No subscription") | "No subscription" | **"No subscription" + Set term** | Same | P1 (CO-14) |
| View as client | "Working…"/"Loading…" | Per-section empties | Empties ("No workout", "No data") | Same | False empties |
| Version history | "Working…" | "No saved versions yet" | Same | Same | |
| Check-ins overview | Skeleton ✓ | EmptyState ✓ | Everyone "Not requested" → "Send reminders (all)" | Same | P2 wrong bulk action |
| Assessments / Adherence | "Working…" | "No clients" | "No clients" / zeros | Same | |
| Messages inbox | Skeleton ✓; per-row "···" ✓ | EmptyState ✓ | ErrorState ✓ | False "No clients" | Best-handled |
| Revenue | Skeleton ✓ | Per-section ✓ | ErrorState ✓ | Skeleton forever | |
| Reports | Skeleton | n/a | **Skeleton forever** | Forever | P2 |
| My Plan | Skeleton ✓ | Per-section ✓ | ErrorState ✓ | Skeleton | |
| Templates / preview / Library | Skeleton or "Working…" | EmptyState + starter ✓ | Empty ("No templates yet" also for a deleted template) | Empty | |

Feedback after actions:
- Saves in editors show an inline status + toast ✓.
- Many failures use modal `alertDialog` (blocking).
- Silent in four places: Overview note sheet, entity notes, Release client, Account blur-saves.
- The offline banner copy ("changes sync when you reconnect") is wrong for coach screens.

---

## 7. One-hand review (coach, 390×844, right thumb)

| Action | Where the control is | Thumb zone | Verdict |
|---|---|---|---|
| Add client | "+" top-right of Clients / Dashboard | Hard | MOVE (header search + contextual add in list) |
| Open a client | List rows | Easy | KEEP |
| Switch client | Name ▾ top-left | Hard | KEEP, plus swipe between clients |
| Save a plan | Top-right "SAVE PLAN", not sticky | Hard; scrolls away | Sticky bottom bar / autosave |
| Add exercise | Full-width button at the end of the section list | Easy | KEEP |
| Review check-in | Inline "MARK REVIEWED" after scrolling the summary | Medium | Queue with sticky actions |
| Message from a client | 💬 top-left row 2 | Hard | Sticky header action + Today reply |
| Set term / renew | Mid-screen primary | Medium | One renew sheet with a sticky footer |
| Broadcast | ⚡ top-right | Hard | Messages overflow |
| Tabs More / Check-ins | Off-screen right of the rail (BV-32) | Hidden | 4 segments |
| Delete a food/session | ~18 px "−" at the row end | Easy to reach, easy to mis-tap | Swipe/overflow + undo |
| Navigate menu | ☰ top-right | Hard | Remove the need (4 tabs + avatar) |

Primary actions cluster at the top on almost every coach screen. The thumb zone holds only the bottom nav and the WhatsApp FAB.

---

## 8. Top 10 coach problems

| # | ID | Problem | P | Effort | Impact | Action |
|---|---|---|---|---|---|---|
| 1 | CO-01 | A failed plan read lets the coach wipe the client's plan; no version to restore | P0 | S | HIGH | REDESIGN |
| 2 | CO-02 | "Notes for yourself" are shown to the client (and workspace notes, CO-21) | P0 | S | HIGH | REDESIGN |
| 3 | CO-03 | Cross-coach search exposes other coaches' clients' email/phone/internal fields | P0 | M | HIGH | REDESIGN |
| 4 | CO-04 | The thread composer is hidden under the bottom nav when the plan banner shows | P0 | S | HIGH | REDESIGN |
| 5 | CO-05 | No triage surface: the landing list flags 9/10 clients; the real queue is spread over 8+ screens | P1 | L | TRANSFORMATIVE | REBUILD |
| 6 | CO-08 | One client = 11 tabs + More + a separate 6-chip view; "More" off-screen | P1 | L | TRANSFORMATIVE | REBUILD |
| 7 | CO-10 / CO-11 | 10 taps to add one exercise, 3 backs; saves keep no version | P1 | L | HIGH | REBUILD |
| 8 | CO-14 / CO-15 | Subscription: 7 competing actions, a "free" renewal prefill, renewals overwrite history | P1 | M | HIGH | REDESIGN |
| 9 | CO-18 | States lie: errors and offline look empty, some loads never end | P1 | M | HIGH | REDESIGN |
| 10 | CO-09 / CO-17 | Overview and Dashboard lead with wrong or vanity numbers (BV-22, BV-24) | P1 | M | HIGH | REBUILD |
