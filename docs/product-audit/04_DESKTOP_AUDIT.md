# 04 — Desktop and tablet audit, plus the table audit

## Bottom line

- **Coach desktop (1280–1440) has the same structure as the phone app.** The phone's problems carry over: no triage surface, an 11-tab client workspace, the dashboard metric soup. They are not fixed by the extra width.
- **Desktop adds layout problems of its own:**
  - The primary client table overflows at 1440 (907 px of table in a 794 px pane). An empty "Select a client" panel takes ~320 px, and a row click only opens a preview (TB-01, BV-21).
  - A thread opened from a client renders a different, full-page layout than the Messages split view, and the selected thread is not in the URL (DT-01).
  - Inside a client, no sidebar item is active (NAV-K11).
- **Wide screens show sparse, single-day or single-column content:**
  - "View as client" is one empty day of full-width zero tiles (DT-05).
  - The plan editor's right pane is blank until a day is clicked, with all controls stacked in a narrow left pane (DT-04).
  - Lists stretch one-line rows across ~1,100 px (DT-11).
- **Tablet (768–1023) is a dead tier.** It gets the desktop sidebar but every *phone* layout (4+More rail, drill-down builder, no tables) stretched to 650–900 px (DT-07).
- **Tables (§6–7):** 26 table or grid lists inventoried.
  - Keep as tables only where the task is scanning and comparing: clients on desktop, library tables, renewals (with actions), measurement compare, the client set-logging grid.
  - Remove the duplicate rankings (Adherence, Reports).
  - Turn the nutrition planned-vs-target table into macro rows.
  - The shared `DataTable` needs sorting, column priorities and a row-action slot (TB-08).
- **Client app at 1440** is a centered phone column with a floating bottom nav. Acceptable for a phone-first product; document it as a decision (DT-13).
- **Direction:** desktop expands the *same* four coach destinations (Today · Clients · Messages · Library + Me):
  - two-pane triage;
  - a sortable 5-column client table;
  - a split plan editor;
  - the thread docked inside the client.

  No desktop-only destinations (§8, consistent with `16_TARGET_INFORMATION_ARCHITECTURE.md`).

Scope:
- Coach at 1440×900 (all 32 coach routes captured), plus code-derived behaviour at 1024–1279 and the 768–1023 tablet tier.
- The client app at 1440 briefly.
- Context: audit date 2026-10-04, HEAD `e7663ab`.
- Evidence comes from the isolated stack: seeded coach "Karim Mansour", 10 clients.
- Chrome swaps at 768 px (`ResponsiveShell`); data layouts swap at 1024 px (`useIsDesktop`).
- The sidebar is 72 px icon-only at 768–1023 and 240 px expanded from 1024 (`SidebarNav.tsx:49`).

---

## 1. Desktop, measured (1440×900)

Source: `shots/coach-1440/results.json`, screenshots in `shots/coach-1440/` and `evidence/coach-*-1440.png`.
- Small = targets <44 px. On desktop this matters mainly for touch laptops and tablets; it is reported for completeness.
- Tiny = text nodes under 12 px.

| Route | Screens tall | Interactive | Small | Tiny | Cards | Observation |
|---|---|---|---|---|---|---|
| `/coach` → Dashboard | 2.1 | 53 | 27 | 16 | 21 | "Needs attention" starts at ~780 px of a 900 px viewport |
| Clients | 1.4 | 45 | 21 | 36 | 4 | Table scrolls horizontally: 907 px in 794 (BV-21) |
| Client › Overview | 1.0 | 40 | 30 | 30 | 4 | 11-tab rail fits at 1440 only |
| Client › Workout | 1.2 | 46 | 34 | 23 | 3 | Right pane empty until a day is chosen |
| Client › Nutrition | 2.2 | 72 | 51 | 38 | 7 | Planned-vs-target table fits at this width |
| Client › Cardio | 1.0 | 54 | 42 | 26 | 3 | |
| View as client | 1.1 | 28 | 25 | 15 | 6 | One day; four full-width zero tiles |
| Messages | 1.1 | 32 | 19 | 15 | 3 | Split view, empty right pane "Select a conversation" |
| Thread `/coach/messages/:id` | 1.0 | 44 | 38 | 55 | 20 | Full-page layout, no inbox list; 20 severe targets (the ⋮ bubble menus) |
| Revenue | 1.6 | 19 | 17 | 35 | 16 | Renewals table rows have no actions |
| Reports | 1.3 | 32 | 17 | 18 | 7 | |
| Check-ins overview | 1.3 | 31 | 17 | 21 | 5 | Single-column rows ~1,100 px wide |
| Library (empty) | 1.0 | 27 | 22 | 17 | 3 | Column headers read "CATEGORY (E.G. COMPOUND)" |
| My Plan | 1.4 | 21 | 17 | 15 | 11 | |

Idle network on the desktop dashboard (`shots/perf/notes.txt`): **27 requests / 120 s**.
- `notifications.list` ×10: two mounted bells, each polling every 25 s.
- `sync.pull` ×8: the *client* sync engine running in the coach app (BV-25).
- `messages.coachThreadsSummary` ×6.

---

## 2. Coach desktop, screen by screen

### 2.1 Shell (sidebar, top bar, floating elements)

| Element | What it is | Action | Why |
|---|---|---|---|
| Sidebar: Today (Dashboard, Messages) · Coaching (Clients, Check-ins, Assessments, Adherence) · Content (Templates, Library) · Business (Revenue, Reports, Client Plans) · You (My Plan, Account) | 13 items, 240 px (`nav.ts:103-142`) | REDESIGN | → Today · Clients · Messages · Library ── Business ── Forma subscription · Account. **No item is active while viewing a client** (screens `1440-client-*`, NAV-K11) |
| "Collapse sidebar" control | Persisted preference (`SidebarNav.tsx:100-112`) | KEEP | |
| Top bar search "Search… Ctrl K" | Opens the command palette (DT-08) | KEEP, REDESIGN content | Clients come only from the dashboard cache; navigation skips the unsaved guard |
| "✓ Synced" chip | Client sync-engine state (`SyncStatusIndicator.tsx`) | REMOVE | Meaningless for a coach (DT-09) |
| Bell + avatar | Notifications feed; avatar → Account | MERGE bell into Today; KEEP avatar → Me | Bell duplicates Messages (CO-33) |
| WhatsApp FAB bottom-right | `md:bottom-6 md:end-6` | MOVE (Me › Help) | Overlaps table cells and buttons (DT-10) |
| Page eyebrows "COACH PORTAL / BUSINESS / CONTENT" | Every page | REMOVE | Noise |

### 2.2 Dashboard (`evidence/coach-dashboard-1440.png`)

| Element | What it is | Action | Why |
|---|---|---|---|
| Greeting + ADD CLIENT (labelled on desktop) | `CoachDashboard.tsx:58-66` | REMOVE greeting; MOVE add | |
| 3 hero pills (Active clients, Renewals (7d), Revenue this month) | Account-based "active"; "renewals" = ending | REMOVE | Mislabelled (CO-22) |
| 4 tabs (Overview, Clients, Engagement, Content) | All visible at 1440 | REMOVE | Duplicates other destinations |
| "Get started 1/3" checklist | Full width, shown to a 10-client coach | MOVE (new-coach state) | Stale (BV-24) |
| Headline + "AT RISK" hero (Laila: "Assessment awaiting your review") | Full-width hero card | REMOVE | Wrong "at risk" semantics; duplicates the first row |
| Needs attention list | Begins ~780 px down | KEEP → Today queue pane | The only actionable block, below the fold |
| 5 KPI cards, renewals, Quick actions grid (5 cards visible at ≥768) | Repeats | REMOVE / MOVE | 21 cards on one page |

### 2.3 Clients (`evidence/coach-clients-1440.png`)

| Element | What it is | Action | Why |
|---|---|---|---|
| "10 / 25 clients used" strip, full width | | REDESIGN (only near the cap) | |
| Search + chips All/Active/Frozen/Trashed | Account states | REPLACE | Coaching filters (CO-07) |
| `DataTable` in a `SplitPane` with `DetailPanel` | 7 columns: CLIENTS · ACCOUNT STATUS · CLIENT ASSESSMENT · RECENT ACTIVITY · ADDED · ADHERENC… (cut) · Open | RESPONSIVE TRANSFORM (TB-01) | Overflows; wrong columns; "Added" dates wrap to 3 lines ("Thu / 24 / Sept") |
| "Select a client" empty preview (~320 px) | Shown until a row is clicked | REMOVE (or render on demand) | Takes the width the table needs |
| Row click → preview (repeats the row's fields + Open / Messages) | `CoachClients.tsx:261-278, 528-567` | REDESIGN | Two clicks to open a client; "Open" column is off-screen |

### 2.4 Client workspace (`evidence/coach-client-overview-1440.png`, `shots/coach-1440/1440-client-*.png`)

| Element | What it is | Action | Why |
|---|---|---|---|
| Header: ‹ · avatar · name · ACTIVE · ▾ | ··· MESSAGE · EDIT PLAN on the right | KEEP (sticky), REMOVE Edit plan | Edit plan = Workout tab |
| 11-tab rail (OVERVIEW … HISTORY) | Fits at 1440 with the expanded sidebar. At 1024–1279 it overflows with a hidden scrollbar (code: ~1,000 px of tabs in a 720–976 px column) | REBUILD → 4 tabs (DT-03) | Progress/Messages tabs leave the workspace (NAV-K01) |
| Overview: phone link · 4 big stat tiles (10 WORKOUTS (7D) · 74.6 kg · 1 NOTES · 2 PLANS) · VIEW ACTIVITY (half width) / MANAGE PLAN · 3 link cards · Targets · Notes | The same content as the phone, stretched | REBUILD (Summary grid) | Wrong headline metric (BV-22); vanity tiles at 270 px each |
| Notes date "10/4/2026" | US format | REDESIGN | Locale |

---
### 2.5 Plan editors (`shots/coach-1440/1440-client-workout.png`, `1440-client-nutrition.png`)

| Element | What it is | Action | Why |
|---|---|---|---|
| Workout: left pane (`lg:w-72`) | Client context · plan name · Save as template · the versioning hint paragraph · Save as new version · History · then the day list | REDESIGN (DT-04) | All chrome sits above the structure the coach came to edit; day cards truncate ("0 secti…") |
| Workout: right pane | "Select a day to edit its sections and exercises" until a click; then day → section drill-down *inside* the pane | REDESIGN | Wide screen, empty pane; still 3 levels deep |
| SAVE PLAN | Top-right only, not sticky | REDESIGN | Sticky action bar + autosave |
| Nutrition: single column (no split for targets/table); meals split list/editor below | Table fits at 1440; ~2.2 screens | REDESIGN | Targets and planned-vs-target belong side by side, with meals in the main pane |
| Cardio: session list left / form right | Fine at 1440 | MERGE into Plan | |

### 2.6 View as client (`shots/coach-1440/1440-client-view.png`)

A single day ("TODAY"): full-width cards "No workout logged this day" / "No meals logged this day", then four ~560 px tiles reading 0 steps · 0 min · 0 ml · —. The workspace header and tabs are gone; the sidebar has no active item. → REBUILD as Progress with a week/calendar view and a log table (DT-05).

### 2.7 Messages (`shots/coach-1440/1440-messages.png`, `1440-thread.png`)

| Element | What it is | Action | Why |
|---|---|---|---|
| `/coach/messages` split: list (search, All/Unread/Broadcasts, every client incl. "No messages yet") + "Select a conversation" | Selection in local state (`CoachMessages.tsx:47, 109-146`) | REDESIGN (DT-01) | Reload or Back loses the thread; directory, not inbox |
| `/coach/messages/:clientId` (from a client, the dashboard or a notification) | Full-page thread, **no inbox list**, its own header (‹, avatar, name ›, 👤) | REDESIGN | Two different desktop messaging layouts for the same task |
| ⚡ Broadcast (top-right) | Same icon as Revenue | REDESIGN | Explicit audience (CO-27) |
| Bubble ⋮ menus | 20 targets under 24 px | KEEP (desktop hover) | Fine for a mouse; small for touch laptops |

### 2.8 Revenue / Reports / lists

| Screen | What it shows at 1440 | Action | Why |
|---|---|---|---|
| Revenue (`1440-revenue.png`) | Hero 5200 EGP + 4 KPI cards (the first repeats the hero) + renewals table (Client · Date · Amount; no actions) + donut + 6 tiles + growth | REDESIGN (DT-06, TB-02) | Repeats; the expired client is not named (BV-23) |
| Reports | 4 KPIs + 3 aggregate CSV buttons + ranking table | MERGE into Business › Exports | Duplicate ranking; exports of totals only |
| Check-ins overview (`1440-checkins.png`) | Sectioned single-column rows ~1,100 px wide; REVIEW (1) / SEND REMINDERS (7) | MERGE into Today | Low density (DT-11); the review queue is the right mechanic |
| Assessments, Adherence | Same wide single-column rows; adherence is a 2-column table (client, bar + "n wk") | REMOVE | Roster filters (CO-34) |
| Library (`evidence/coach-library-1440.png`) | Chips + search + LOAD STARTER LIBRARY + "+" + DataTable with headers "CATEGORY (E.G. COMPOUND)", "EQUIPMENT (E.G. BARBELL)" | KEEP TABLE, fix headers (TB-04) | Placeholder copy used as column titles |
| My Plan | 4 cards in a row, capacity, offers, requests | REDESIGN (CO-32) | Single product, heavy page |

---

## 3. Tablet tier (768–1023)

Code-derived; no tablet capture was made.

| Surface | What a tablet gets | Problem |
|---|---|---|
| Chrome | Desktop chrome: 72 px icon-only sidebar + DesktopTopBar; no BrandBar or bottom nav (`ResponsiveShell.tsx:32-46`) | Fine |
| Data layouts | **Phone layouts** (`useIsDesktop` = ≥1024): Clients as phone rows; no DataTables; Messages list → full-page thread; workspace 4 tabs + More sheet; PlanBuilder drill-down; nutrition editor with every meal expanded | 650–900 px of single-column phone UI with wide empty margins |
| `/coach` landing | Dashboard (≥768) | Phone users land on Clients, tablet users on Dashboard: two different homes |
| Sheets | Centered modals (`md:`), not bottom sheets | Fine |

Direction: treat 768–1023 as "desktop with a collapsed sidebar":
- 2-column lists and grids;
- the same 4 client tabs;
- split editors from ~900 px;
- tables with column priorities (TB-08).

---

## 4. Client app at 1440 (brief)

`shots/client-1440/1440-today.png`, `1440-inbox.png`:
- The client app renders a **centered ~448 px phone column** at every desktop width: black margins of ~500 px on each side, a floating bottom nav with the raised workout button, the ☰ menu and bell.
- Today is 2.6 screens tall. Inbox is a phone thread in the middle of the screen.
- Nothing breaks, and probes show no overflow.

This is a coherent choice for a phone-first client product, but it is undocumented. Today's week strip, progress charts and history would benefit from width on tablets and laptops (DT-13; detail in the client doc).

---

## 5. Desktop findings

### DT-01 — Two different desktop messaging layouts, and the selected thread isn't in the URL
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/messages`, `/coach/messages/:clientId` · ≥1024
- **Evidence:** `shots/coach-1440/1440-messages.png` (split: list + "Select a conversation") vs `1440-thread.png` (full-page thread, no list); `CoachMessages.tsx:47, 109-146` (selection is `useState`); `CoachMessageThread.tsx:30` (`md:h-[calc(100dvh-7rem)]`).
- **Steps / scenario:** Open Messages and pick a thread → reload → the selection is lost. Then open a thread from a client's 💬 → a different layout appears, with no inbox.
- **Expected vs actual:** Expected: one split view where the URL is the selection, reachable from anywhere. Actual: local-state split view vs full-page route.
- **Why it matters:** Coaches triaging several conversations on a laptop lose their place.
- **Direction:**
  - `/coach/messages/:id` renders inside the split.
  - Inside a client, the thread docks as a side panel.
  - The inbox lists conversations, not every client.
- **Verified:** BROWSER-VERIFIED

### DT-02 — Desktop dashboard: 21 cards, with the actionable list below the fold
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/dashboard` (desktop landing) · ≥768
- **Evidence:** `evidence/coach-dashboard-1440.png`. Above "Needs attention" (y≈780 of 900): hero pills, 4 tabs, a "Get started 1/3" checklist, the headline and an "AT RISK" hero. 2.1 screens and 21 cards (probe); BV-24.
- **Steps / scenario:** Log in on a laptop.
- **Expected vs actual:** Expected: the triage queue fills the first viewport. Actual: decoration and repeats fill it.
- **Why it matters:** Desktop is where coaches do their heavier daily pass.
- **Direction:** Today as a two-pane triage (queue + selected item with inline action); Business KPIs move to Business.
- **Verified:** BROWSER-VERIFIED

### DT-03 — The 11-tab workspace rail only fits at 1440, and two tabs leave the workspace
- **Priority:** P2      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id/*` · 1024–1440
- **Evidence:** `evidence/coach-client-overview-1440.png` (all 11 visible); `CoachClientWorkspaceLayout.tsx:136-168`. At 1024–1279, ~1,000 px of tabs sit in a 720–976 px column with a hidden scrollbar (code-derived). Progress/Messages unmount the layout (NAV-K01).
- **Steps / scenario:** At 1280, try to reach History or Subscription.
- **Expected vs actual:** Expected: 4 stable tabs. Actual: an 11-item rail that scrolls invisibly at common laptop widths.
- **Why it matters:** Same IA failure as mobile (CO-08), now hidden behind a scroll.
- **Direction:** Summary · Plan · Progress · Profile (16_TARGET_INFORMATION_ARCHITECTURE).
- **Verified:** BROWSER-VERIFIED

### DT-04 — The desktop plan editor stacks all controls in a narrow left pane and leaves the right pane empty
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Client › Workout (and nutrition/cardio splits) · ≥1024
- **Evidence:** `shots/coach-1440/1440-client-workout.png`. The left 288 px holds context, plan name, Save as template, the versioning hint, two version buttons and then the day cards (truncated "0 secti…"). The right pane says "Select a day to edit its sections and exercises". `PlanBuilder.tsx:444-463`.
- **Steps / scenario:** Open a client's workout plan on a laptop.
- **Expected vs actual:** Expected: the plan structure visible at once (days × exercises), editing in place, a sticky Save/autosave. Actual: an empty main pane and 3 drill levels inside it.
- **Why it matters:** Desktop is where full programs get written.
- **Direction:** Structure tree (days → exercises) left, the selected day's exercise table right, sticky action bar, history as a sheet.
- **Verified:** BROWSER-VERIFIED

### DT-05 — "View as client" on desktop is one empty day of full-width tiles
- **Priority:** P2      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id/view/*` · ≥1024
- **Evidence:** `shots/coach-1440/1440-client-view.png` ("TODAY": "No workout logged this day", "No meals logged this day", four ~560 px tiles 0 · 0 · 0 · —); separate layout (`CoachApp.tsx:107-108`).
- **Steps / scenario:** Review a client's last two weeks.
- **Expected vs actual:** Expected: a calendar/table of sessions and adherence with drill-in. Actual: a day stepper.
- **Why it matters:** Wide screens should make history scannable; this wastes them.
- **Direction:** Progress tab: a week grid (sessions done/planned, nutrition adherence, cardio) + log table + body charts.
- **Verified:** BROWSER-VERIFIED

### DT-06 — Revenue on desktop repeats its KPIs, and the renewal table can't act
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/revenue`, `/coach/reports` · ≥1024
- **Evidence:** `shots/coach-1440/1440-revenue.png` (hero 5200 + first card 5200; renewals table without row actions); `AnalyticsPanel.tsx:17-105`; BV-23 (expired client unnamed); Reports CSVs = aggregates (`ReportsPanel.tsx:20-42`).
- **Steps / scenario:** Renew the next client due from Revenue.
- **Expected vs actual:** Expected: a row action "Renew / Message", plus a lapsed-clients list. Actual: a read-only table; leave to the client → More → Subscription.
- **Why it matters:** The desktop is the right place for business admin, and this page can't do any.
- **Direction:** Business page: month summary, an actionable renewals/lapsed table (TB-02), exports with rows and a date range.
- **Verified:** BROWSER-VERIFIED

### DT-07 — Tablet (768–1023) gets desktop chrome around phone layouts
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · all routes · 768–1023
- **Evidence:**
  - `ResponsiveShell.tsx:32-46` (sidebar/top bar from 768).
  - `useIsDesktop` = ≥1024 gates every data layout: `CoachClients.tsx:260`, `CoachMessages.tsx:109`, `CoachClientWorkspaceLayout.tsx:137`, `PlanBuilder.tsx:439`, `CoachNutritionEditor.tsx:389`.
  - `/coach` lands on Dashboard here but on Clients below 768 (`CoachApp.tsx:53-56`).
- **Steps / scenario:** An iPad in portrait (810 px).
- **Expected vs actual:** Expected: 2-column lists, tables with priority columns, the same 4 client tabs. Actual: single-column phone UI with a 72 px icon rail.
- **Why it matters:** Tablets are a natural coach device on the gym floor.
- **Direction:** One layout tier from ~768 with a collapsed sidebar; column priorities in tables (TB-08).
- **Verified:** CODE-CONFIRMED

### DT-08 — The command palette searches only cached clients, and its commands mislead
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · ⌘K / top-bar search · ≥768
- **Evidence:** `CommandHost.tsx:46-68`:
  - clients come from the dashboard query cache only, so the list is empty until the dashboard has loaded;
  - "New exercise" / "New food" only open library tabs;
  - "Send broadcast" opens the inbox;
  - plain `navigate`, so it skips the unsaved guard (NAV-K05).
- **Steps / scenario:** Deep-link into a client page, press ⌘K and type a client's name.
- **Expected vs actual:** Expected: every client, and commands that do what they say. Actual: no clients; commands that just open pages.
- **Why it matters:** The power-user path is unreliable.
- **Direction:** Index the roster; commands open the actual sheet; route through the guard.
- **Verified:** CODE-CONFIRMED

### DT-09 — The coach top bar shows the client sync engine's "Synced" state
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REMOVE
- **Who / where:** coach · DesktopTopBar · ≥768
- **Evidence:** "✓ Synced" in every 1440 screenshot (`DesktopTopBar.tsx:26`, `SyncStatusIndicator.tsx`); the coach boot runs `sync.deletionsPull`/`sync.singletonGet`/`sync.pull` (BV-25), and `sync.pull` ×8 per 120 s idle (perf notes).
- **Steps / scenario:** Any coach page.
- **Expected vs actual:** Expected: no client-sync concept for coaches. Actual: a status chip and background sync traffic.
- **Why it matters:** An exposed implementation detail plus wasted requests (see PF doc).
- **Direction:** Don't mount the client sync engine or its indicator in the coach app.
- **Verified:** BROWSER-VERIFIED

### DT-10 — The WhatsApp FAB overlaps table cells and buttons on desktop
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** MOVE
- **Who / where:** coach · all routes except messages · ≥768
- **Evidence:** `shots/coach-1440/1440-revenue.png` (over the last renewal amount); `evidence/coach-dashboard-1440.png` (over the first REVIEW button); `WhatsAppFab.tsx:28` (`md:bottom-6 md:end-6`).
- **Steps / scenario:** Scroll any table to its last row.
- **Expected vs actual:** Expected: no floating support button over work. Actual: it covers right-aligned values and actions.
- **Why it matters:** Hidden numbers and mis-clicks.
- **Direction:** Me › Help (same as CO-28).
- **Verified:** BROWSER-VERIFIED

### DT-11 — Desktop lists are one-line rows stretched across ~1,100 px
- **Priority:** P3      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Check-ins, Assessments, Adherence, the Messages list · ≥1024
- **Evidence:** `shots/coach-1440/1440-checkins.png` (name/date at the far left, status pill at the far right of a 1,136 px card); `1440-assessments.png`, `1440-adherence.png`.
- **Steps / scenario:** Scan 10 clients' check-in states on a laptop.
- **Expected vs actual:** Expected: a dense queue/table, or a two-pane queue with preview. Actual: eye travel across the full width per row.
- **Why it matters:** Desktop density is the point of desktop.
- **Direction:** These lists merge into Today (two-pane) and Clients (table).
- **Verified:** BROWSER-VERIFIED

### DT-12 — Two notification pollers run on desktop
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach · shell · all
- **Evidence:** `NotificationBell` is mounted in both BrandBar (CSS-hidden ≥768) and DesktopTopBar (`ResponsiveShell.tsx:34-39`); each `pollFeed` runs every 25 s (`notificationsApi.ts:44, 59`); measured `notifications.list` ×10 per 120 s idle (perf notes).
- **Steps / scenario:** Leave the dashboard open.
- **Expected vs actual:** Expected: one feed poll. Actual: two.
- **Why it matters:** Doubled background load per open coach tab (see PF doc).
- **Direction:** Mount chrome per breakpoint, or share one subscription.
- **Verified:** BROWSER-VERIFIED

### DT-13 — The client app on desktop is an undocumented phone column
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** KEEP
- **Who / where:** client · all routes · ≥768
- **Evidence:** `shots/client-1440/1440-today.png`, `1440-inbox.png` (~448 px centered column, floating bottom nav and centre workout button, ~500 px empty margins); `AppShell` `max-w-md`.
- **Steps / scenario:** A client opens Forma on a laptop.
- **Expected vs actual:** Expected: a deliberate phone-frame decision (or a wider layout for Progress/History/Inbox). Actual: the phone UI centered in black.
- **Why it matters:** Acceptable for a phone-first product, but it should be a decision, not a default.
- **Direction:** Keep the phone frame for training flows. Allow wider layouts for Progress, History and Inbox, or document the frame.
- **Verified:** BROWSER-VERIFIED

---

## 6. Table audit (§12) — every table and grid list

`DataTable` (`components/ui/DataTable.tsx`) renders only at ≥1024. Callers branch with `useIsDesktop` or `hidden lg:block`, and render cards/rows below that.

| # | Table / grid list (file) | Essential columns · secondary columns | 1440 behaviour | 390 behaviour | Row actions and discoverability | Tap-through value | Classification | Finding |
|---|---|---|---|---|---|---|---|---|
| 1 | Coach clients table + preview panel (`CoachClients.tsx:174-203, 261-278, 528-567`) | Essential: client, next action/reason*, last workout, adherence 7d, subscription days left*. Secondary: email, **account status**, assessment text, added date (*missing today) | **907 px in 794**; cut at "ADHERENC…"; 3-line dates; empty "Select a client" panel ~320 px (BV-21) | Not rendered (see #2) | "Open" button in the last column, off-screen; row click = preview | Low: the preview repeats the row | RESPONSIVE TRANSFORM | TB-01 |
| 2 | Coach clients mobile rows (`CoachClients.tsx:285-309`) | Name + signal line · account pill | n/a | 9/10 rows red "Needs attention"; "ACTIVE" on every row (BV-20) | Whole row → client ✓ | High (opens the client) | REPLACE WITH LIST (urgency-sorted, reason + days left) | CO-05, CO-07 |
| 3 | Adherence table / rows (`CoachAdherence.tsx:45-99`) | Client · bar + "n wk" (= workouts) | Table, rows navigate | Rows are **not tappable** | None on mobile | None on mobile | REMOVE (sortable column on Clients) | CO-34 |
| 4 | Reports ranking table / card list (`ReportsPanel.tsx:44-105`) | Client, workouts 7d · assessment, last activity (dropped on mobile) | Table | Card list | Row → client | Medium | REMOVE (duplicate of #3 and #1) | CO-35 |
| 5 | Revenue renewals table / card list (`AnalyticsPanel.tsx:17-63`) | Client, renewal date, amount · status*, action* | Read-only table | Read-only list | **None** | None | RESPONSIVE TRANSFORM (table with a row action on desktop; tappable rows on mobile) | TB-02 |
| 6 | Dashboard lists: attention rows, upcoming renewals, "pending assessments", "inactive this week" (`parts.tsx:39-77`; `OverviewPanel.tsx:115-132`; `ClientsPanel.tsx:28-50`) | Name, reason, CTA | Full width | Stacked | Row → client; CTA button ✓ | High (attention), low (panels) | MOVE attention + renewals → Today; REMOVE the panel lists | CO-05, CO-17 |
| 7 | Nutrition planned-vs-target `<table min-w-[420px]>` (`CoachNutritionEditor.tsx:322-354`) | Target / Planned / Difference × kcal, P, C, F | Fits | **Scrolls sideways (460 px in 348)**; Carbs/Fats hidden | n/a | n/a | RESPONSIVE TRANSFORM (macro progress rows under the targets) | TB-03 |
| 8 | Library exercises table / rows (`CoachExerciseLibrary.tsx:168-239`) | Name, muscle, equipment, media* · category, sets×reps·rest, tags | Headers read "CATEGORY (E.G. COMPOUND)", "EQUIPMENT (E.G. BARBELL)"; select + ✕ columns | Rows with a checkbox and ✕ each | ✕ always visible; select-all | View sheet → Edit (2 steps) | KEEP TABLE (desktop) · REPLACE WITH LIST (mobile, select mode) | TB-04 |
| 9 | Library foods table / rows (`:309-386`) | Name, serving, kcal, P/C/F · category, ✕ | As #8 | As #8 | As #8 | Edit sheet (1 step; inconsistent with #8) | KEEP TABLE · REPLACE WITH LIST | TB-04 |
| 10 | Food (swap) groups cards (`:477-491`) | Name, food count | Cards with a checkbox | Same | ✕ | Edit sheet | REPLACE WITH LIST | TB-04 |
| 11 | Supplements list (`:603-615`) | Name, dose, timing | List at every width | Same | ✕ | Edit sheet | KEEP LIST | — |
| 12 | Measurement compare grid, coach view + client page (`CoachViewMeasurements.tsx:63-86`; `Measurements.tsx:75-87`) | Part · A · B · Δ | Fits | Fits (BV-38 client page) | Two date selects | n/a | KEEP TABLE (translate A/B/Δ, default to the last two entries) | TB-05 |
| 13 | Client set-logging grid (`ExerciseCard.tsx:22`) | Set #, previous, weight, reps, done | Phone frame | 5 columns; "previous" truncates at 360 (prior audit C24) | Inline inputs | n/a | KEEP TABLE (owned by the client doc) | — |
| 14 | Training-guide RIR table (`TrainingGuideSheet.tsx:81-90`) | RIR, effort, description | Phone frame | Fits | n/a | n/a | KEEP TABLE | — |
| 15 | Client History month grid (`History.tsx:92`) | 7 day columns | Phone frame | Fits | Day → detail | High | KEEP (client doc) | — |
| 16 | Workout templates grid (`CoachTemplates.tsx:90-102`) | Name, goal, split, days | 3-column cards with a corner checkbox | 1 column, checkbox on each | Checkbox + bulk bar | → a "preview" with no exercises | KEEP grid (desktop) · REPLACE WITH LIST (mobile) | CO-39 |
| 17 | Template preview day cards (`CoachTemplatePreview.tsx:76-87`) | Day title, focus, **counts only** | Cards | Cards | None | None | REMOVE (open the template itself) | CO-39 |
| 18 | Plan version list (`PlanVersionHistory.tsx:82-104`) | Version, name, counts, reason, date · Restore | Cards | Cards | Restore button | n/a | KEEP (as a sheet inside the editor) | CO-11 |
| 19 | Subscription history (`SubscriptionHistory.tsx:43-61`) | Term, dates, price; totals | Rows | Rows | n/a | n/a | KEEP (once history is actually written, CO-15) | CO-15 |
| 20 | Packages ("Client Plans") list (`CoachSubscriptionPlans.tsx:83-108`) | Name (+trial), duration, price · [Edit] [Delete] | Rows | Rows with two text buttons | Visible buttons | Via Edit only | REPLACE WITH LIST (row → sheet; delete inside) | TB-06 |
| 21 | My Plan add-ons / requests (`CoachPlan.tsx:196-280`) | Name, price, date, status · Cancel | Rows | Rows | Cancel link | n/a | KEEP (collapse history) | CO-32 |
| 22 | Check-ins overview sections (`CoachCheckInsOverview.tsx:158-196`) | Client, week, overdue, status | ~1,100 px single-line rows | Names truncated ("K…") next to two pills | Row → client check-ins | Medium | MERGE into Today (queue) | CO-13, DT-11 |
| 23 | Assessments list (`CoachAssessments.tsx:61-76`) | Client, status | Wide rows | Rows | Row → assessment | Medium | REMOVE (Today + Clients filter) | CO-38 |
| 24 | Messages inbox list (`CoachMessages.tsx:117-125, 166-174`) | Avatar, name, preview, time, unread | List pane in the split | **Every client** incl. "No messages yet"; names truncated | Row → thread | High | REPLACE WITH LIST (conversations only) | CO-27, DT-01 |
| 25 | Notifications list + numbered pagination of 15 (`Notifications.tsx:158-203`) | Sender/type, body, time | Rows | Rows | Row → route | Medium; duplicates the inbox | REMOVE (→ Today) | CO-33 |
| 26 | Sheet pick-lists: client switcher, add-existing results, assign-template, exercise picker, pending invites, incoming transfers | Name + meta (+ select) | Modal lists | Bottom-sheet lists | Row = action ✓ | High | KEEP LIST (add media to the picker; transfers → Today) | CO-24 |

**Counts:** 26 surfaces.

| Classification | Count | Rows |
|---|---|---|
| KEEP TABLE | 4 | #12–15 |
| KEEP TABLE desktop + REPLACE WITH LIST mobile | 3 | #8, #9, #16 |
| RESPONSIVE TRANSFORM | 3 | #1, #5, #7 |
| REPLACE WITH LIST | 4 | #2, #10, #20, #24 |
| KEEP LIST / KEEP | 5 | #11, #18, #19, #21, #26 |
| MOVE / MERGE | 2 | #6, #22 |
| REMOVE | 5 | #3, #4, #17, #23, #25 |

**Rule of thumb for Phase B:**
- A table is right only when the coach **scans and compares across rows**: clients, library, renewals, measurements, set logging.
- Everything else is a list of things to act on: one row, one reason, one action.

---

## 7. Table findings

### TB-01 — The primary client table overflows at 1440 and shows the wrong columns
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN (table classification: RESPONSIVE TRANSFORM)
- **Who / where:** coach · `/coach/clients` · ≥1024
- **Evidence:** BV-21; `evidence/coach-clients-1440.png`; probe `hScrollers`: card 907 px in 794 px; `SplitPane.tsx:27` (preview `w-64 xl:w-80`); `CoachClients.tsx:174-203` (columns), `:269` (row click = select).

  Pane width by viewport (code-derived, table needs ~907 px):

  | Viewport | Table pane | Overflow |
  |---|---|---|
  | 1280 | ~636 px | ~270 px |
  | 1024 | ~444 px | ~460 px |
- **Steps / scenario:** Open Clients on a 1280–1440 laptop and look for the adherence column or the Open action.
- **Expected vs actual:**
  - Expected: a sortable table that fits, with row → client and an optional preview.
  - Actual:
    - an empty preview panel takes ~320 px;
    - the table scrolls sideways and "Open" is off-screen;
    - status = admin account state;
    - "Added" wraps to 3 lines;
    - no sorting.
- **Why it matters:** This is the coach's main desktop surface.
- **Direction:**
  - Five columns: Client · Next action/reason · Last workout · Adherence 7d · Subscription (days left).
  - Sortable, with column priorities (drop the rightmost first).
  - Row → client; the preview opens on demand and offers actions, not repeated fields.
- **Verified:** BROWSER-VERIFIED

### TB-02 — Renewal rows can't act
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN (table classification: RESPONSIVE TRANSFORM)
- **Who / where:** coach · `/coach/revenue` · all
- **Evidence:** `shots/coach-1440/1440-revenue.png`, `evidence/coach-revenue-390-full.png` (BV-23); `AnalyticsPanel.tsx:45-62`: no `onRowClick`/`onItemClick`. The Dashboard's renewals *are* tappable (`OverviewPanel.tsx:121`).
- **Steps / scenario:** Tap "Omar Khaled — Tue 6 Oct — 1000 EGP".
- **Expected vs actual:** Expected: Renew / Message from the row; expired and lapsed clients listed by name. Actual: nothing happens; lapsed clients appear only as a count.
- **Why it matters:** Renewals are the only revenue action, and the revenue page can't start one.
- **Direction:** Table on desktop with a status column and a row action; tappable rows on mobile; include lapsed clients.
- **Verified:** BROWSER-VERIFIED

### TB-03 — The nutrition planned-vs-target table scrolls sideways on phones
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN (table classification: RESPONSIVE TRANSFORM)
- **Who / where:** coach · Client › Nutrition · ≤767
- **Evidence:** BV-40; probe `div.card mb-5 overflow-x-auto sw=460 cw=348`; `evidence/coach-client-nutrition-editor-390-full.png` (only Calories/Protein visible); `CoachNutritionEditor.tsx:322-354`.
- **Steps / scenario:** Open a meal plan at 390 and compare carbs/fats to target.
- **Expected vs actual:** Expected: all four macros visible against target. Actual: a sideways-scrolling table placed *before* the target inputs.
- **Why it matters:** This comparison is the point of the editor.
- **Direction:** Four compact rows (macro · planned / target · Δ as a bar) directly under the targets; the same component on desktop.
- **Verified:** BROWSER-VERIFIED

### TB-04 — Library tables use placeholder copy as headers and put bulk controls on every row
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN (table classification: KEEP TABLE desktop / REPLACE WITH LIST mobile)
- **Who / where:** coach · `/coach/library` (exercises, foods, groups) · all
- **Evidence:** `evidence/coach-library-1440.png` (headers "CATEGORY (E.G. COMPOUND)", "EQUIPMENT (E.G. BARBELL)"); `CoachExerciseLibrary.tsx:168-239, 309-386, 477-491`.
  - Mobile rows carry a `RowCheckbox` and a bare ✕.
  - Exercises open a view sheet then an edit sheet; foods open edit directly.
  - Food-group forms list every food as a chip.
- **Steps / scenario:** Browse the starter library (909 exercises) on desktop and on a phone.
- **Expected vs actual:**
  - Expected: a media-first, sortable/filterable table on desktop; a clean list with a "Select" mode on mobile.
  - Actual: hint text as headers; a checkbox and delete on every row; inconsistent open behaviour.
- **Why it matters:** The library is the coach's main content tool (detail in docs 07/08).
- **Direction:** Real column names; muscle/equipment filters; media column; bulk actions only in selection mode; one open behaviour.
- **Verified:** BROWSER-VERIFIED

### TB-05 — The measurement compare grid is hard-coded and defaults to the oldest entry
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** KEEP (table classification: KEEP TABLE; fix details)
- **Who / where:** coach view-as-client › Measurements; client `/progress/measurements` · all
- **Evidence:** `CoachViewMeasurements.tsx:63-86` (literal "A", "B", "Δ"; defaults to the first vs last date); `Measurements.tsx:75-87` (same pattern); BV-38 (client page stacks the form, compare and history).
- **Steps / scenario:** Switch to `ar-eg` and compare two dates.
- **Expected vs actual:** Expected: localized headers, defaulting to the last two entries, units shown. Actual: Latin letters, first-vs-last default.
- **Why it matters:** Small, but it is the one genuinely comparative table on both sides.
- **Direction:** Keep the grid; localize, default sensibly, add units.
- **Verified:** CODE-CONFIRMED

### TB-06 — The packages list puts two text buttons on every row
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN (table classification: REPLACE WITH LIST)
- **Who / where:** coach · `/coach/subscription-plans` · all
- **Evidence:** `CoachSubscriptionPlans.tsx:89-106` ([Edit] [Delete] per row, Delete one tap from Edit); the form exposes "Order".
- **Steps / scenario:** Edit a package on a phone.
- **Expected vs actual:** Expected: tap a row → sheet; delete inside the sheet. Actual: adjacent Edit/Delete buttons.
- **Why it matters:** A destructive action next to the common one.
- **Direction:** Row → sheet, delete inside with confirm, implicit ordering.
- **Verified:** CODE-CONFIRMED

### TB-07 — Lists use four different paging patterns
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach + client · lists · all
- **Evidence:**
  - Infinite scroll **and** "Show more" on Clients (`CoachClients.tsx:168-170, 310-313`).
  - "Show more" on Messages (`CoachMessages.tsx:88-91`).
  - Numbered `Pagination` on Adherence (25), Library (25), Templates (24), Notifications (15).
  - None on Check-ins and Assessments.
- **Steps / scenario:** Move between lists.
- **Expected vs actual:** Expected: one pattern per context. Actual: four.
- **Why it matters:** Inconsistency; small numbered chips on phones.
- **Direction:** Progressive "load more" on mobile; pagination only inside desktop tables.
- **Verified:** CODE-CONFIRMED

### TB-08 — The shared DataTable lacks sorting, column priority and a row-action slot
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** all desktop tables · ≥1024 (and the missing tablet tier)
- **Evidence:** `DataTable.tsx:31-121`: no sort, no column-priority or hide rules, no sticky first column, `px-4` on every cell; row actions are ad-hoc cells (Open button, ✕). It renders only at ≥1024, so tablets get none.
- **Steps / scenario:** Sort clients by days left; narrow the window to 1100 px.
- **Expected vs actual:** Expected: sortable headers; low-priority columns collapse; a sticky name column; consistent row actions. Actual: a static table that scrolls sideways.
- **Why it matters:** Every desktop table inherits these limits (TB-01).
- **Direction:** One table primitive with sort, priority columns (also used from 768), a sticky first column and a row-action menu.
- **Verified:** CODE-CONFIRMED

---

## 8. How desktop should expand from the mobile structure

Same product, more room. Desktop adds **density and side-by-side panes**, never new destinations.

The structure follows `16_TARGET_INFORMATION_ARCHITECTURE.md`:
- Sidebar = Today · Clients · Messages · Library, then Business and Forma subscription · Account.
- Top bar = ⌘K (guarded, roster-backed) + avatar.

| Mobile surface | Desktop expansion (≥1024; 768–1023 uses it with a collapsed sidebar and 2 columns) | What must stay identical |
|---|---|---|
| Today queue | Two-pane: queue left; the selected item's context + inline action right (check-in review, assessment review, reply, renew). Keyboard J/K + Enter | Items, order, actions |
| Clients list | Sortable 5-column table (TB-01) + optional quick-look with actions | Filters, urgency order, the status vocabulary (subscription, not account) |
| Client (4 sections) | Summary as a 2–3 column grid; Plan as a split editor (tree + exercise table) with a sticky action bar; Progress as a calendar + log table; Profile in 2 columns; **thread docked in a right panel** | Section names, header, Back behaviour |
| Messages | Split with a URL-backed selection; the same thread component | Conversation list, composer |
| Library | Tables with filters and media columns; programs as cards | Segments and item sheets |
| Me › Business | Tables + exports with date range; actionable renewals | Numbers and definitions |

Guardrails:
1. No desktop-only page or metric.
2. Every desktop action exists on mobile, behind at most one more tap.
3. Tables only where rows are compared (§6 rule).
4. No floating chrome (FAB, global banners) over work surfaces.
5. Tablet = desktop structure with fewer columns, not phone layouts.
