# 05 — Information architecture and semantic navigation (current state)

> Phase A · Discovery only · 2026-10-04/05 · HEAD `e7663ab` (production runs RC2 `cf3a5d9`)
> Covers brief §6 (IA audit) and §7 (semantic navigation). Sources:
> - the client and coach screen audits (02, 03, 04);
> - browser runs on the isolated stack (BV-xx; `evidence/`);
> - code (`file:line`).
>
> The proposed future IA is in **16**. Finding IDs used here:
> - **IA-C##** — client IA issues;
> - **IA-K##** — coach IA issues;
> - **NAV-C##** — client semantic navigation;
> - **NAV-K##** — coach semantic navigation.
>
> NAV findings are indexed in 18.

## Bottom line

- **Both apps have more navigation systems than destinations need.**
  - **Client:** 5 tabs (one of them an unlabelled center button) + a 13-row ☰ menu that repeats all 5 tabs + a bell + hidden doors (avatar, calendar icon, cards). More than 8 screens light up no tab.
  - **Coach:** 4 tabs + a 13-item ☰ menu (also the desktop sidebar) + a bell + ⌘K.
  - Revenue holds a daily tab slot while Check-ins, the weekly core loop, is two taps deep.
- **The coach's client is fragmented** across an 11-tab workspace (4 + "More" on a phone, with More off-screen at 390 px — BV-32), a separate 6-chip "view as client" layout, a version page and a legacy route: **~21 URLs for one person**. Names collide: "Nutrition" means the plan editor in one place and the food log in another.
- **Most destinations have 2–3 names:** Fuel/Nutrition; Train/Routines/Workout; Inbox/Messages/the coach's name; Coach/Your coach; Plan = 4 meanings for coaches.
- **Back is history-based, not intent-based, wherever navigation uses `replace`.** This is browser-verified for your example in the brief: **Clients → client → Notes → Messages → Back lands on the Clients list**, not on Notes (BV-41, NAV-K01).
- **The same thread opened from the header button returns to the client correctly** (BV-34). Keep that rule and apply it everywhere.
- **Hidden global state breaks intent.** A notification can silently move the client's logging day (BV-02, NAV-C), and the workout session's exit depends on wherever it was opened from.

---

## 1. Client IA — as a human perceives it

```
Client app (390 px)
├─ Top: [Forma logo] ............................ [🔔 bell, red badge] [☰ Menu]
├─ Bottom: TODAY · FUEL · (● orange dumbbell, no label = "Train") · PROGRESS · INBOX     (9.5 px mono labels)
├─ ☰ Menu (13 rows, 4 groups — repeats all 5 tabs)
│    Daily: Today · Train · Fuel · Cardio · Exercise Library
│    Track: Progress · Measurements · History
│    Coach: Inbox · Check-Ins · Coach            ("Coach" is a group name AND an item)
│    You:   Subscription · Settings
├─ Hidden doors
│    avatar → Settings · "Weekly goal" card / "View all" → History · calendar icon on Progress → History
│    "Your coach" card → Inbox · "From your coach" card → Coach page · PR rows → Exercise detail
│    Settings › Account → Assessment, Subscription · Settings › Tools → Video manager, Import
├─ Orphan: /workout/routine/:dayId (day detail with coach notes) — reachable only from notification deep links
└─ Not in the menu at all: Notifications (bell only), Photos (tab inside Progress + a hidden route), Assessment
```

**Naming as the user meets it**

| Concept | Bottom nav | Menu | Page title / eyebrow | Elsewhere |
|---|---|---|---|---|
| Dashboard | Today | Today | greeting | — |
| Workouts | (unlabelled) | Train | "Routines" / "Weekly plan" | "Workout", "Start workout", "Start this workout" |
| Food | Fuel | Fuel | "Nutrition" / "Nutrition" (BV-39) | Today row "Nutrition" |
| Cardio | — | Cardio | "Cardio & Steps" | Today row "Cardio" |
| Chat | Inbox | Inbox | the coach's name | "Messages" card on the Coach page |
| Coach hub | — | Coach | "Your coach" / "Forma" | "From your coach" card |
| Check-ins | — | Check-Ins | "Check-In History"; wizard "Weekly Check-In" | Home card |
| Assessment | — | — | "Client assessment" (the client is told *client* assessment) | Settings › Account |
| Settings | — | Settings | "Settings" / "Athlete" | avatar |

**Count:** 23 client routes, of which 1 is an orphan, 2 are reachable only by deep link, 2 are legacy and empty for real clients, and 8+ highlight no tab.

## 2. Client IA issues

| ID | CURRENT | PROBLEM | RECOMMENDED STRUCTURE | WHY |
|---|---|---|---|---|
| IA-C01 | 5 tabs + center FAB + 13-row ☰ (repeats all tabs) + bell + hidden doors | Three navigation systems. The FAB is a link, not an action. 8+ screens light no tab (Cardio, History, Settings, Check-ins, Coach, Notifications, Subscription, Assessment) | 5 equal tabs (Today, Train, Nutrition, Progress, Coach) + avatar → You. No ☰, no FAB, no bell | One predictable map. Every screen belongs to exactly one tab |
| IA-C02 | Inbox vs Notifications vs Coach page (`/coach-notes`) vs two Home coach cards vs inline notes vs Check-ins vs Assessment | The relationship lives in 7 places. One coach message = bell badge + Inbox badge + toast | One **Coach** destination: chat first, pinned to-dos (check-in due, assessment reviewed, plan updated), notes/announcements feed. Inline notes stay in context | Coaching is the product; it should feel like one conversation |
| IA-C03 | Progress (4 segments) vs History vs Measurements vs Photos vs Home tiles vs session summary | The same metrics appear in 4 places. Body logging is spread over 3 routes + the check-in (BV-37/38) | **Progress** = Body / Strength / Consistency, with one "log body update" flow | Each question answered once |
| IA-C04 | Settings (3 tabs) vs Subscription (menu + Settings + Coach page) vs `/settings/app` redirect | Subscription UI in 3 places (BV-19). Legacy tools mixed with profile (BV-18) | **You** (avatar): profile, subscription (single home), preferences, help, sign out | Less, clearer |
| IA-C05 | Cardio hidden in the menu; steps target as a Today row | Coach-prescribed cardio isn't next to training. Steps logging is 3 taps deep | Cardio plan + timer → **Train**; steps/minutes quick-log → **Today** | Matches how coaches prescribe and how clients log |
| IA-C06 | "Exercise Library" in the menu | Not a library: it lists the plan's exercises with best weights (BV-36) | Remove the destination. Exercise detail is reachable from day detail, session and Strength | Fewer doors |
| IA-C07 | A global day navigator (Today/Fuel/Cardio/Measurements) + week strip + History + notification links all set one hidden "selected day" | Hidden state dates new logs. Train and the session never show the date (BV-02) | Logging defaults to **today** everywhere. Past-day editing is local to a screen, behind an explicit "Editing Mon 29 Sep" bar | Prevents silent backdating |
| IA-C08 | RoutineDetail is an orphan; Train rows are inert | Coach notes, sections and videos never reach the client | Train → day detail → exercise detail. The session shows the coach note per exercise | Coach intent reaches the gym floor |
| IA-C09 | Check-in = a wizard inside the tab shell, entered from a Home card or the menu | Feels like a page, not a task. The CTA is hidden (BV-15). History is buried | "Check-in due" appears on Today + Coach. The wizard is full-screen. History lives inside Coach | Task-shaped flows take over the screen |
| IA-C10 | Assessment under Settings › Account | The coach's feedback on it is hidden in settings | Coach › My assessment | It is coach content |

---

## 3. Coach IA — as a human perceives it

**Mobile (390 px)**

```
Bottom: Dashboard · Clients (← the app opens here) · Messages · Revenue        Top: logo · 🔔 · ☰ (13 items / 5 groups)
☰: Today[Dashboard, Messages] · Coaching[Clients, Check-ins, Assessments, Adherence] · Content[Templates, Library]
   · Business[Revenue, Reports, Client Plans] · You[My Plan, Account]
Dashboard: pill tabs Overview · Clients · Engagement · Content (22 cards; "Get started" checklist; "AT RISK" hero)
Clients: chips Active/Frozen/Trashed (= admin ACCOUNT states) → Add client (Create new | Add existing)
 └ Client workspace: header ‹ · avatar · name · subscription pill ▾switch · 💬 · ✎
     Tabs: Overview · Workout · Nutrition · Progress⇢ · More▸        (More off-screen at 390 — BV-32)
     More: Cardio · Assessments · Check-ins · Messages⇢ · Notes · Subscription · History ("Coaching history")
     Overview: 4 counters ("10 workouts (7d)" is wrong — BV-22) · View activity⇢ · Manage plan (… · Release) · 3 link cards · Targets · Notes
     Editors: Workout (day → section → exercise sheet) · Nutrition · Cardio; each → Versions⇢ (/versions/:kind)
     ⇢ Progress / View activity = a separate "Viewing as client" page: Activity · Nutrition · Cardio · Measurements · Photos · Progress
     ⇢ Messages = /coach/messages/:id (leaves the workspace)
Messages: every client listed (even with no messages) + ⚡ Broadcast → thread
Elsewhere: Revenue · Reports · Client Plans · My Plan · Templates (→ preview → editor) · Library (4 chips) · Check-ins · Assessments
   · Adherence · Notifications (bell) · Account
Orphan: /coach/client/:id/activity
```

**Desktop (1280–1440) and tablet (768–1023)**

| Surface | Desktop and tablet behaviour |
|---|---|
| Overall | Same tree. A 13-item sidebar replaces the bottom bar and ☰. `/coach` lands on **Dashboard** (on mobile it lands on Clients). |
| Clients | A 7-column table next to an empty "Select a client" panel. The table scrolls sideways at 1440 (BV-21). Clicking a row only opens a preview. |
| Workspace | All 11 tabs, which only fit at 1440. |
| Messages | A split view whose selection isn't in the URL. `/coach/messages/:id` renders a different, full-page layout. |
| Top bar | ⌘K palette, a "Synced" chip (from the *client* sync engine), bell, avatar. |
| Inside a client | No sidebar item is active (NAV-K11). |
| Tablet | Desktop chrome around phone layouts. |

**Counts**

| Measure | Value |
|---|---|
| Top-level coach destinations | 13 in the menu + Notifications = **14** |
| Bottom-bar items | 4 |
| Workspace tabs | **11** (4 + More below 1024 px) |
| View-as-client chips | 6 |
| URLs per client | **~21** (9 workspace children + 2 view routes + 3 version kinds + 1 legacy + thread) |
| Dashboard metric cards | **22** across 4 tabs |
| Revenue cards | **17** at 390 (BV-23) |

## 4. Coach IA issues

| ID | CURRENT | PROBLEM | RECOMMENDED STRUCTURE | WHY |
|---|---|---|---|---|
| IA-K01 | Phone lands on Clients; desktop lands on Dashboard; tab #1 is Dashboard | No triage list. Decisions are spread over 8+ screens. 9/10 rows say "Needs attention" (BV-20) | **Today** queue as the landing on every breakpoint | One decision surface replaces Dashboard, Check-ins, Assessments, the notification feed and the transfer strip |
| IA-K02 | Client = 11 tabs + More + 6-chip "view as client" + versions page + legacy route (~21 URLs) | Context lost mid-task. Names collide ("Nutrition" = plan vs food log). Check-ins hidden behind More | Client = **Summary · Plan · Progress · Profile**; the thread is a child route that returns to the client | 4 stable sections, one name per concept |
| IA-K03 | Overview = counters + a second menu | Wrong adherence number (BV-22); no next actions; a destructive "Release" under "Manage plan" | Summary: week vs plan, open items, latest check-in inline, days left | The most-visited client screen |
| IA-K04 | Check-ins / Assessments / Adherence as separate pages | Filtered views of the roster. The best mechanic (sequential review queue) is buried in the menu | Today items + Clients filters/sort | Fewer places, same actions |
| IA-K05 | Messages vs Notes vs assessment notes vs check-in feedback vs Notifications vs Broadcast | Visibility unclear: "private" notes are published (BV-12); notes are client-visible without saying so | **Messages (to the client)** vs **Private notes (coach-only)**. Coach events go to Today | Trust |
| IA-K06 | Revenue on the bottom bar; Reports / Client Plans / My Plan in ☰; capacity shown in 5 places | Commerce crowds the daily loop. "Plan" means 4 things | **Me** hub: Business (Revenue + Packages + Exports), Forma subscription, Account, Help | Prime slots for the daily loop; one word, one meaning |
| IA-K07 | Templates page + Library chips; no apply-from-client; nutrition templates have no UI | Reuse is off the work path | **Library**: Programs / Exercises / Foods / Supplements. "Start from template" inside a client's Plan | Reuse where the work happens |
| IA-K08 | Desktop = the phone structure stretched; tablet = phone layouts | Width without capability | Same 4 destinations: two-pane Today, table, split editor, docked thread | One product across devices |

**Naming collisions to resolve (coach)**

| Label shown | What it actually is |
|---|---|
| "Workouts (7d)" | Finished workouts among the last 10 logs, any date |
| "Avg adherence" | % of clients with at least one finished workout in 7 days |
| "Check-ins overdue" / "Pending check-ins" / "Check-ins to review" | All three are the same count: submitted check-ins awaiting the coach |
| "Active clients" | Account status = active (not subscription) |
| "Retention (30d)" | 100 − churn % over all relationships ever |
| "Frozen" (client filter) | Admin-suspended *account*; the coach's own "Freeze" is a *subscription* state and doesn't appear under it |
| "History" (workspace tab) | Coaching-relationship timeline, not workout history |
| "Manage plan" | Workout/Nutrition/Cardio links + Add note + **Release client** |
| "Cancel" (subscription) | A terminal subscription action, labelled like closing a dialog |
| Broadcast "All" | All clients **in the current inbox filter**, not the roster |
| "Plan" | Training/nutrition plan · "My Plan" (Forma subscription) · "Client Plans" (packages) · plan gate/banner (Forma state) |

---

## 5. Semantic navigation — mechanics

| Mechanism | Current behaviour |
|---|---|
| `useBack(fallback)` (`src/hooks/useBack.ts:25-47`) | `navigate(-1)` when `history.state.idx > 0`; otherwise `navigate(fallback, {replace})`. Goes through the unsaved-changes guard first. |
| Workspace tabs, view-as-client chips, `?tab=` params | Use **replace**: switching a tab never creates a history entry. |
| Everything else | Pushes. |
| Unsaved guard (`navGuardStore`) | Checked by `useBack`, `useGuardedNav`, BottomNav and SidebarNav. Plain `navigate` / `<Link>` callers, browser/OS back and Android hardware back are **not** guarded. There is no `@capacitor/app` back handler. |
| `ScrollToTop` (`src/components/ScrollToTop.tsx:9-16`) | Resets scroll on every path change, so Back restores the URL but **not** the list position. |

## 6. Coach semantic navigation findings (NAV-K)

### NAV-K01 — "Messages"/"Progress" via More (mobile) or the tab rail (desktop) replace history; Back leaves the client
- **Priority:** P1  **Effort:** S  **Impact:** HIGH  **Action:** REDESIGN
- **Who / where:** coach · `/coach/client/:id` → `/coach/messages/:id` · 390 and desktop
- **Evidence:**
  - **BV-41 (browser):** at 390, Clients → Nour → More › Notes → More › Messages → ‹ Back landed on **`/coach/clients`**.
  - Code: `CoachClientWorkspaceLayout.tsx:54-55,145,185` (`replace:true`); `CoachMessageThread.tsx:16`; `CoachViewLayout.tsx:34`.
- **Steps:** Clients → client → (More) Notes → (More) Messages → Back
- **Expected vs actual:** Back returns to Notes (or at least the client) · Back lands on the Clients list (or the Dashboard, if that's where the coach came from)
- **Why it matters:** this is your example in the brief. The header 💬, the Overview card and the header button on any tab all return correctly (BV-34), so the same destination gives two different Back results depending on which control opened it.
- **Direction:** tabs/sections replace; task views (thread, progress, editor) push and return to their origin.
- **Verified:** BROWSER-VERIFIED

### NAV-K02 — Three back controls in editors; "Leave" keeps the draft
- **Priority:** P1  **Effort:** M  **Impact:** HIGH  **Action:** REDESIGN
- **Evidence:** BV-09 (three backs on the day screen: workspace ‹, editor "‹ Workout plan", breadcrumb "‹ WORKOUT PLAN"); `CoachWorkoutEditor.tsx:95` vs `CoachClientWorkspaceLayout.tsx:86`; `lib/draft.ts`
- **Steps:**
  1. Edit a plan.
  2. Leave via the workspace ‹, a tab or the bottom nav, and confirm "Discard changes?" → Leave.
  3. Reopen Workout.
- **Expected vs actual:** Leave discards · the "discarded" edits come back as "Unsaved changes" (only the editor's own ‹ clears the draft)
- **Direction:** one back control, owned by the layout. "Leave" always clears the draft.
- **Verified:** BROWSER-VERIFIED (three backs) · CODE-CONFIRMED (draft resurrection)

### NAV-K03 — The freeze-request notification lands where the request isn't shown
- **Priority:** P1  **Effort:** S  **Impact:** HIGH  **Action:** REDESIGN
- **Evidence:** `api/_trpc/routers/clientCheckIns.ts:247` routes to `/coach/client/:id`; the request card exists only in `CoachSubscriptionPanel.tsx:157`
- **Steps:** client sends a pause request → coach taps the notification → Overview shows nothing → More › Subscription → the card
- **Direction:** deep links land where the action is (a Today item, or Subscription).
- **Verified:** CODE-CONFIRMED

### NAV-K04 — Template Save/exit push; Back returns into the editor
- **Priority:** P2 · S · MEDIUM · REDESIGN
- **Evidence:** `CoachWorkoutTemplateEditor.tsx:75,79-83`; `CoachTemplatePreview.tsx:30`
- **Steps:** Templates → card → Edit → Save → ‹ → **the editor again**. History becomes [list, preview, edit, preview].
- **Direction:** Save/exit return via Back or replace.
- **Verified:** CODE-CONFIRMED

### NAV-K05 — Navigations that skip the unsaved-changes guard
- **Priority:** P2 · S · MEDIUM · REDESIGN
- **Evidence:**
  - Unguarded triggers: bell and toasts (`NotificationBell.tsx:90,102`), ⌘K (`CommandHost.tsx:41`), the editor's "History" chip (`VersionActions.tsx:41,73`), the plan-banner CTA (`CoachPlanBanner.tsx:29`), the `ClientCapBlocked` link, OS back (`useUnsavedGuard.ts:20-25`).
  - The template editor registers no guard at all.
- **Steps:** edit a plan → tap 🔔 → the page changes without "Discard changes?"
- **Direction:** route every trigger through the guard.
- **Verified:** CODE-CONFIRMED

### NAV-K06 — Android hardware back skips levels (sheets and builder levels aren't history entries)
- **Priority:** P2 · M · MEDIUM · REDESIGN
- **Evidence:** `Sheet.tsx`, `PlanBuilder.tsx:55` (levels are component state); no Android back handler
- **Steps:** Android, exercise sheet open inside the builder → hardware back → **leaves the editor** instead of closing the sheet
- **Direction:** sheets and editor levels push a history entry on mobile.
- **Verified:** INFERRED (needs a real Android device)

### NAV-K07 — Thread ↔ client ping-pong inflates history
- **Priority:** P2 · S · LOW · REDESIGN
- **Evidence:** `CoachMessageThread.tsx:39,45-52` (title tap pushes the client)
- **Steps:** inbox → thread → title → client → 💬 → thread → title → client… → Back walks back through every hop
- **Direction:** "open client" from a thread pops if the previous entry is that client.
- **Verified:** CODE-CONFIRMED

### NAV-K08 — Back from a workspace sub-tab returns to Clients, not the client
- **Priority:** P3 · S · LOW · KEEP (decide explicitly)
- **Evidence:** BV-09 (J2 tap #9), J1 tap #7
- **Steps:** Clients → client → Workout → Save → ‹ → Clients
- **Note:** consistent with "tabs don't create history". Make it an explicit rule of the 4-section client in Phase B.
- **Verified:** BROWSER-VERIFIED

### NAV-K09 — Back after a destructive action lands on dead pages
- **Priority:** P2 · S · MEDIUM · REDESIGN
- **Evidence:** `CoachClientDetail.tsx:59`; `CoachTemplatePreview.tsx:44,56-57`
- **Steps:**
  - Release a client → `/coach` → Back → **the released client's workspace**.
  - Delete a template → Back → "No templates yet" for the deleted item.
- **Direction:** replace history after destructive actions.
- **Verified:** CODE-CONFIRMED

### NAV-K10 — Version history lives outside the client and falls back to the wrong parent
- **Priority:** P3 · S · LOW · MOVE
- **Evidence:** `PlanVersionHistory.tsx:41`; `CoachApp.tsx:109`
- **Steps:** open `/coach/client/:id/versions/workout` in a new tab → ‹ → client overview (expected: the workout editor)
- **Direction:** versions become a sheet inside the editor.
- **Verified:** CODE-CONFIRMED

### NAV-K11 — No primary nav item is active inside a client
- **Priority:** P2 · S · MEDIUM · REDESIGN
- **Evidence:** `nav.ts:89,114` (`/coach/clients` vs `/coach/client/:id`); `BottomNav.tsx:53-60`; `SidebarNav.tsx:69-73`; `evidence/coach-client-overview-390-full.png`
- **Steps:** open any client → no bottom tab or sidebar item is highlighted
- **Direction:** Clients stays active for the whole client subtree.
- **Verified:** BROWSER-VERIFIED

**Coach flows verified correct (KEEP)**
- Clients → client → header 💬 → thread → ‹ = client overview.
- Overview "Messages" card → thread → ‹ = client overview.
- Nutrition tab → header 💬 → browser Back = Nutrition tab (BV-34).
- The client switcher replaces with the same tab for the next client.

---

## 7. Client semantic navigation findings (NAV-C)

| Screen | Back control | Fallback when there is no history | Behaviour |
|---|---|---|---|
| Today, Train, Fuel, Progress, Settings | none | — | Tab roots (correct) |
| Cardio `/cardio` | none | — | A menu destination without Back, while History (also a menu destination) has one |
| Inbox `/messages` | TopBar ‹ | `/` | **A tab root with a Back button** (`Messages.tsx:66-71`); behaves like browser back to the previous tab |
| Coach `/coach-notes`, Notifications, Check-ins | ‹ | `/` | — |
| Check-in `/check-in/:id` | wizard ‹ (previous step) / ✕ (leave) | `/check-ins` | ✕ discards every answer with no prompt |
| Assessment | ‹ | `/settings?tab=account` | A notification deep link returns the user to Settings, not to the coach context |
| Routine detail (orphan) | ‹ | `/workout` | — |
| Exercise detail | ‹ | `/workout/library` | A cold deep link lands on a menu-only page the user never visited |
| Session | ⌄ minimise / Done / Discard | `/workout` | History-dependent: returns to wherever the session was opened from |
| History / Measurements / Photos | ‹ | `/progress[?tab=…]` | Scroll position reset (ScrollToTop) |

### NAV-C01 — Back means different things on similar screens; a tab root has a Back button
- **Priority:** P2 · S · MEDIUM · REDESIGN
- **Evidence:** `Messages.tsx:66-71`; `evidence/client-inbox-390.png` (‹ on the Inbox tab); Cardio has no Back but History does
- **Steps:**
  - Today → Inbox tab → ‹ → back to Today (a tab acting like a pushed page).
  - ☰ → Cardio (no Back) vs ☰ → History (Back).
- **Direction:** tab roots never show Back. Sub-pages always do, and their Back goes to their semantic parent.
- **Verified:** BROWSER-VERIFIED

### NAV-C02 — Reload or cold deep links fall back to parents the user never visited; the session position resets
- **Priority:** P2 · S · MEDIUM · REDESIGN
- **Evidence:** `useBack.ts:25-47` fallbacks; `WorkoutSession.tsx:98-101` (exercise index not persisted)
- **Steps:**
  1. Mid-workout, reload `/workout/session` → "Done"/minimise go to **Train** (the user came from Today), and the current exercise resets to 1 of 5.
  2. Open a shared `/workout/exercise/:id` → ‹ → `/workout/library`, a menu-only page.
  3. `assessment_reviewed` notification → `/coach-notes`, which doesn't show the review (`api/_trpc/routers/clientProfile.ts:184`) → the user must find Settings › Account › Assessment.
- **Direction:** fallbacks go to the semantic parent of the new IA (Train › Day, Coach › My assessment). Persist the session's current exercise.
- **Verified:** CODE-CONFIRMED

### NAV-C03 — Session exits are inconsistent; a running session is invisible from other tabs
- **Priority:** P2 · M · HIGH · REDESIGN
- **Evidence:** `WorkoutSession.tsx` minimise / Done / Discard all `navigate(-1)`; no global "resume" bar (02 §18)
- **Steps:**
  1. Start a workout from Today → minimise → open Fuel → nothing indicates that a workout is running or how long it has been. Resuming takes Today → RESUME (2 taps).
  2. Open a past day from the week strip → read-only session → Done → back on Today, but **Today now shows that past day's checklist under a header that still says today** (the hidden selected day, IA-C07).
- **Direction:** a persistent "Workout in progress · 23:14 · Resume" bar on every tab. Session exit always returns to Train › Day. Past days never change the global context.
- **Verified:** CODE-CONFIRMED (the related day hijack by notification is BROWSER-VERIFIED: BV-02, NT-02)

### NAV-C04 — No exit protection in any client flow
- **Priority:** P2 · S · HIGH · REDESIGN
- **Evidence:** no client page uses `useUnsavedGuard`; check-in ✕/tabs/bell/menu leave the wizard (`CheckIn.tsx`); BV-15 (the bottom nav stays visible inside the wizard)
- **Steps:** check-in → fill steps 1–3 → tap the Today tab (or ✕, or the bell) → every answer is silently discarded. Re-entering starts at step 1 with the default values.
- **Direction:** full-screen task flows without global chrome. "Discard answers?" on exit. Keep a local draft.
- **Verified:** CODE-CONFIRMED

### NAV-C05 — Hardware/browser Back doesn't match on-screen Back in sheets and wizard steps
- **Priority:** P2 · M · MEDIUM · REDESIGN
- **Evidence:** sheets and wizard steps are component state, not history entries (`Sheet.tsx`; `CheckIn.tsx` steps)
- **Steps:** Android: open the food editor sheet → hardware Back → **the page underneath changes** instead of the sheet closing. Wizard step 3 → hardware Back → leaves the wizard instead of going to step 2.
- **Direction:** on mobile, sheets and steps push a history entry.
- **Verified:** INFERRED (needs a real Android device)

### NAV-C06 — Back restores the URL but not the scroll position
- **Priority:** P3 · S · LOW · REDESIGN
- **Evidence:** `ScrollToTop.tsx:9-16` resets scroll on every path change, contradicting the `useBack` comment
- **Steps:** Progress › Strength → scroll to a PR → open the exercise → ‹ → back at the top of the list
- **Direction:** restore scroll on POP navigations.
- **Verified:** CODE-CONFIRMED

### NAV-C07 — Orphan, duplicate and legacy routes
- **Priority:** P3 · S · LOW · REMOVE
- **Evidence:**
  - `/workout/routine/:dayId` is reachable only from notification links.
  - `/progress/photos` and `/progress/measurements` duplicate Progress segments.
  - `/settings/app` only redirects.
  - `/settings/videos` and `/settings/import` are legacy and empty for real clients (BV-18).
  - `/coach-notes` duplicates other surfaces (BV-19).
- **Direction:** fold these into the destinations in 16 and delete the rest (removal candidates RM-57, RM-21/22).
- **Verified:** CODE-CONFIRMED

**Related, owned by other docs:**
- **NT-02:** a notification toast moves the client's selected day; later logs go to the wrong date. BROWSER-VERIFIED, BV-02.
- **NT-07:** three notification types open the wrong screen.
- **CL-04:** the hidden selected day itself.

---

## 8. Rules to adopt for Phase B (both apps)

1. **One back control per screen, owned by the layout.** Tab roots never show Back.
2. **Tabs and segments replace; task flows push and return.** Task flows are the editor, thread, review, check-in and session.
3. **Every navigation trigger goes through the unsaved-changes guard.** That includes the bell, toasts, ⌘K, banners and OS back. "Leave" means discard, whichever control triggered it.
4. **Sheets, wizard steps and editor levels push a history entry on mobile,** so hardware/edge-swipe back closes or steps back instead of leaving the page.
5. **Notification deep links land on the screen that contains the action,** and never change global state (such as the selected day) until tapped.
6. **Cold-entry fallbacks go to the semantic parent.** Versions → its editor; exercise → its day; assessment → Coach.
7. **After a destructive action, replace history** so Back can't return to a deleted object.
8. **The primary nav item stays active for the whole subtree it owns.** Clients is active inside a client; Train is active inside a session.
9. **A running workout is always one tap away** (resume bar), and it never depends on browser history.
