# 16 — Target information architecture (proposal, not a design)

> Phase A · Discovery only · 2026-10-04 · Inputs: 05 (current IA), 02/03/04 (screen audits), 15 (journeys), 10/11 (notifications, offline).
> This proposes **structure only**: which destinations exist, what lives in each, and what disappears or moves. It doesn't design screens, components or visuals (17 lists the components).

## Bottom line

- **Client: 5 equal tabs + avatar.** Today · Train · Nutrition · Progress · Coach, with "You" behind the avatar. No hamburger menu, no center FAB, no bell. 23 routes collapse into about 12 destinations and sub-screens.
- **Coach mobile: 4 tabs + avatar.** Today (a triage queue, the landing on every breakpoint) · Clients · Messages · Library, with "Me" behind the avatar (Business, Forma subscription, Account, Help).
- **One client = one place with 4 sections:** Summary · Plan · Progress · Profile. This replaces the 11-tab workspace, the 6-tab "view as client" layout and the separate version page (~21 URLs per client today).
- **Coach desktop = the same structure, denser.** Sidebar with the same 4 destinations + Business, two-pane triage, a 5-column client table, split editors, and chat docked inside the client. No desktop-only destinations.
- **Removed as destinations:**
  - Coach: Dashboard (and its 4 tabs), Adherence, Assessments list, Check-ins overview, Reports, the Notifications page, the ☰ menu, view-as-client, the activity route, the version page, the template preview.
  - Client: Exercise Library, History, Cardio, Measurements and Photos as separate routes, the Coach-notes page, Notifications, Video manager, Import, Update the app.
- **Rules that make the structure hold:**
  - every screen belongs to exactly one primary destination;
  - every task flow is full-screen and returns to where it started;
  - "today" is the default tense;
  - one name per concept;
  - the word "Plan" means a training or nutrition plan only.

## Principles (each one traced to audit evidence)

| # | Principle | Evidence that it is needed |
|---|---|---|
| P1 | **One place per question.** Each user question has exactly one home. | The client relationship is spread over 7 surfaces. Progress is answered in 4 places. Subscription UI appears 3 times (BV-19). The coach's "who needs me" signals are scattered over 8+ places (BV-20/24). |
| P2 | **One navigation system per role.** Tabs + avatar. Nothing hidden behind ☰. | The client has tabs + a 13-row menu repeating them + a bell + hidden doors (avatar, calendar icon, cards). The coach has 4 tabs + 13 menu items + a sidebar + ⌘K. |
| P3 | **The home screen is an action queue, not a report.** | Today is 2.8 screens with the date 4 times (BV-16). The coach dashboard is 22 cards over 2.8 screens. 9/10 clients are "Needs attention" (BV-20/24). |
| P4 | **Task flows take over the screen and return to their origin.** | The check-in wizard keeps the tab bar and hides its CTA (BV-15). The plan editor stacks 3 back buttons (BV-09). The coach thread works correctly; keep that pattern (BV-34). |
| P5 | **Logging always means today unless the screen says otherwise, visibly.** | A hidden global "selected day" was moved by a notification (BV-02). Train and the session never show the date. |
| P6 | **Coach content appears in context.** Notes sit inside the session, the meal and the day, not as more cards. | The orphan RoutineDetail hides coach notes. Home stacks two coach cards. Notes are client-visible without saying so (BV-12). |
| P7 | **Business is a report, not a daily tab.** The renewals that need action surface in Today. | Revenue is bottom tab #4 with 17 cards (BV-23). The expired client never appears as a row. |
| P8 | **Same structure on every breakpoint; desktop adds density, not destinations.** | Desktop-only Dashboard home vs mobile Clients home. A 1440 table overflows next to an empty preview panel (BV-21). |
| P9 | **No implementation concepts in the UI.** | "Synced" chips, Reset/Clear-day, Video manager, Import, "Update the app", "0 sections", versioning paragraphs (BV-16/18, BV-09). |

---

## CLIENT

### Current → proposed (overview)

```
CURRENT (perceived)                                   PROPOSED
───────────────────────────────────────────────────   ─────────────────────────────────────────────
Bottom: Today · Fuel · (●Train FAB) · Progress · Inbox  Bottom: Today · Train · Nutrition · Progress · Coach
Top: [logo]  …  [🔔 bell] [☰ Menu: 13 rows]            Top: [title]  …  [avatar → You]
Menu: Daily(Today,Train,Fuel,Cardio,Exercise Library)
      Track(Progress,Measurements,History)
      Coach(Inbox,Check-ins,Coach)  You(Subscription,Settings)
Hidden doors: avatar→Settings, calendar→History,
      cards→Coach/Inbox/History, Settings→Account→Assessment
```

### Proposed client destinations

| Destination | Answers | Contains | Comes from (merged / moved) | Disappears |
|---|---|---|---|---|
| **Today** (landing) | "What do I do now?" | One adaptive hero: Start / Resume workout · Done for today · Rest day + next session · Waiting for coach (with "Message coach"). A compact checklist (workout, meals x/y, water, steps/cardio) with inline quick actions. At most **one** coach item, and only when actionable (check-in due, plan updated, new note). | Home hero + task rows; steps/cardio quick-log from Cardio; check-in card | Day navigator, repeated dates, "Synced" chip, weekly ring, the 4 "This week" tiles, volume-trend chart, Recent list, two coach cards, "Start empty workout" |
| **Train** | "What's my plan, and how do I do it?" | Next session first; plan days → day detail (sections, coach notes, video, rest) → exercise detail; full-screen session with a persistent **Resume** bar when minimized; coach cardio plan + cardio timer; workout history (calendar + list) | Workout + RoutineDetail (merged; RoutineDetail is an orphan today); Cardio page (moved); History (moved); Exercise detail | Exercise Library as a destination (BV-36); Training-guide sheet; separate `/cardio` and `/history` routes |
| **Nutrition** (one name) | "What do I eat today?" | Remaining kcal/macros, meals (tick, swap per the coach's policy), one "Add food" flow, water, supplements, coach notes collapsed; a day switcher local to this screen and labelled when not today | Nutrition as-is, simplified | "Fuel" vs "Nutrition" double name (BV-39); duplicate add-food paths; red ✕ on every planned row |
| **Progress** | "Is it working?" | **Body:** weight + measurements + photos, one "Log body update" flow; check-in weight and photos land here. **Strength:** PRs, e1RM trends. **Consistency:** sessions vs plan, calendar. | Progress tabs + `/progress/measurements` + `/progress/photos` + check-in body data + streak/weekly goal from Home | Tonnage as a headline metric; separate Measurements/Photos routes (BV-37/38) |
| **Coach** | "What does my coach need from me, and what did they say?" | Chat first, with a coach identity header. Pinned to-dos: check-in due (opens the full-screen wizard), assessment reviewed (view), plan updated. A feed of notes and announcements; check-in history; "My assessment". | Inbox + Notifications + `/coach-notes` + Home coach cards + Check-ins + Assessment (moved out of Settings) | The bell, the Coach-notes page, the duplicated subscription block (BV-19), the targets grid page |
| **You** (avatar, not a tab) | "My account" | Profile (name, phone, photo), **Subscription** (its only home: status, days left, pause request, history), Preferences (language, haptics, keep-awake), password, sign out, Help/contact | Settings + Subscription page | Sync card/badges, storage notice, Clear day, **Reset all data** (P0 risk), Reminders, Video manager, Import data, Update the app, client-set weekly goal and default rest (coach- or session-owned) |

### What moves where (client)

| Current route | Future home | Notes |
|---|---|---|
| `/` Home | Today | Rebuilt as an action surface (P3). |
| `/workout` Train ("Routines") | Train | |
| `/workout/routine/:dayId` (orphan) | Train › Day | Becomes the only way into a day; carries coach notes. |
| `/workout/session` | Train › Session (full-screen) | Resume bar when minimized. Deep link with nothing active redirects to Train with a message (today: an empty screen). |
| `/workout/library` | **removed** | Exercise detail is reachable from Day, Session and Strength. |
| `/workout/exercise/:id` | Train › Exercise | Back goes to its real parent. |
| `/nutrition` | Nutrition | |
| `/cardio` | Train (plan + timer) / Today (quick-log) | |
| `/progress` (+ `/progress/measurements`, `/progress/photos`) | Progress › Body / Strength / Consistency | One body-logging flow. |
| `/history` | Train › History, plus Progress › Consistency calendar | |
| `/messages` | Coach (chat) | No Back button on a root destination. |
| `/coach-notes` | Coach (feed) | |
| `/notifications` | **removed as a page** | Becomes the Coach feed; a dot on the Coach tab carries unread. |
| `/check-ins`, `/check-in/:id` | Coach › Check-ins; wizard full-screen | |
| `/assessment` | Coach › My assessment | |
| `/settings`, `/settings/app`, `/settings/subscription` | You | One subscription home. |
| `/settings/videos`, `/settings/import` | **removed** | Legacy local-tracker tools (BV-18). |

### Why this client IA

- It mirrors the coached loop: do today → train → eat → check progress → talk to the coach.
- It removes two of the three navigation systems and every hidden door.
- Coach intent shows up where the action happens, and everything else lives in one Coach place.
- Date semantics become explicit, which ends silent backdating (BV-02).
- It is "less UI": about 10 Today blocks → about 3, and 23 routes → about 12 destinations and sub-screens.

---

## COACH — MOBILE

### Current → proposed (overview)

```
CURRENT (390px)                                           PROPOSED (390px)
───────────────────────────────────────────────────────   ──────────────────────────────────────────────
Bottom: Dashboard · Clients(landing) · Messages · Revenue  Bottom: Today(landing) · Clients · Messages · Library
Top: [logo] … [🔔] [☰ 13 items in 5 groups]                 Top: [title / client] … [🔍] [avatar → Me]
Client: header + Overview·Workout·Nutrition·Progress⇢·More  Client: header + Summary · Plan · Progress · Profile
   More: Cardio·Assessments·Check-ins·Messages⇢·Notes·        (💬 thread pushes and returns to the client)
         Subscription·History
   Progress⇢ = separate "view as client" layout (6 chips)
Elsewhere: Check-ins · Assessments · Adherence · Templates ·
   Library(4 chips) · Reports · Client Plans · My Plan · Account
```

### Proposed coach mobile destinations

| Destination | Answers | Contains | Replaces |
|---|---|---|---|
| **Today** (landing on every breakpoint) | "Who needs me, for what, in what order?" | A ranked queue of actionable items, each with its action inline: **check-ins to review** (reuses the existing sequential review flow) · new/updated assessments · unread conversations · requests (client freeze, coach transfer) · **renewals due ≤ 7 days and already lapsed** · trials ending · payments pending · clients with a plan and an active subscription but no workout in N days · new clients without a plan ("Start from template") · flagged food swaps. Empty state = the onboarding checklist (only while it isn't done) + Forma plan notices. | Dashboard (and its 4 tabs and 22 cards), Check-ins overview, Assessments list, Adherence, Notifications page (coach events), transfer-request strip, the attention parts of Revenue |
| **Clients** | "Find a client / see the roster." | Search + an urgency-sorted list. Chips: Needs you · Check-in due · Expiring · Lapsed · No plan · Frozen (subscription) · All. Each row shows the *reason*, subscription days left and last workout. **The status shown is the subscription state**, not the admin account state. "+" opens one unified add flow (email/phone → existing account: assign or request transfer; otherwise invite). | Clients list (account-status chips, all "ACTIVE"), capacity strip (moves to Me › Forma subscription unless at cap) |
| **Client** (pushed from Today / Clients / Messages) | "How is this client doing, and what do they need?" | Compact sticky header: ‹ · avatar · name · **subscription** chip · 💬 · ⋯ (call, switch client, transfer, release; destructive actions in red, confirmed). Four sections: **Summary** (this week vs plan, open items, latest check-in with inline review, weight trend, days left) · **Plan** (Workout / Nutrition / Cardio cards → full-screen editors with a sticky bottom bar, autosave + automatic versions, "Start from template", history as a sheet) · **Progress** (activity calendar of workouts, meals and cardio; body: weight, measurements, photos; check-in history) · **Profile** (assessment + mark reviewed; **private notes**, explicitly coach-only; subscription and billing; contact; coaching history in one line). | Workspace (11 tabs), view-as-client (6 chips), legacy activity route, version page, Overview counters |
| **Messages** | "Conversations." | Conversations only, newest first; client threads with history. Compose = pick a client. Broadcast lives in the header overflow with an **explicit audience picker**. A thread opened from a client returns to that client (today's behaviour, BV-34). | Inbox listing every client, including ones with no messages; broadcast "All" meaning "current filter" |
| **Library** | "My reusable content." | Segments: **Programs** (workout + nutrition templates) · **Exercises** (global curated catalog + the coach's own; media-first rows) · **Foods** (with swap groups inside) · **Supplements**. Bulk actions only in "Select" mode. | Templates page + Library's 4 chips + template preview step; per-coach copies of the starter catalog (see 07) |
| **Me** (avatar) | "My business and account." | **Business:** this month (booked / due / lost), renewals list, **Packages** (renamed from "Client Plans"), exports (desktop hint). **Forma subscription** (renamed from "My Plan"): status, renew, capacity, add-ons, requests. Account, language, **Help & support** (WhatsApp moves here), sign out. | Revenue tab, Reports, Client Plans, My Plan, Account; WhatsApp FAB; the non-blocking plan banners |

**Removed as destinations:** Dashboard, Adherence, Assessments, Check-ins overview, Reports, Notifications page, the ☰ menu sheet, view-as-client, `/coach/client/:id/activity`, the version page, the template preview.

**Behaviour rules:**
- Editors and sheets push history.
- Android back closes the sheet, or ascends one level.
- The unsaved-changes guard covers every exit: tabs, bell, command palette, banners.
- Editors never open on a failed load (BV-11).

### Secondary features: how they are reached

| Feature | Reached from | Why not a destination |
|---|---|---|
| Check-in review | Today queue → sequential review; Client › Summary | It's a task, not a place |
| Assessment review | Today queue; Client › Profile | Same |
| Templates | Library › Programs; "Start from template" inside a client's empty Plan | Reuse happens where the work happens |
| Plan versions | A "History" sheet inside each editor | Today it's a separate layout with its own back behaviour |
| Adherence ranking | A sort/filter on Clients | It's a view of the roster |
| Revenue, renewals | Me › Business; renewals needing action also appear in Today | Weekly/monthly concern, not a daily one |
| Forma plan, capacity | Me › Forma subscription; a blocking banner only when it blocks work | Reduces chrome; fixes BV-14's root cause (banners pushing the composer) |
| Notifications | Today (coach events). No separate bell. | Coach notifications are almost all per-client actions |
| Help / WhatsApp | Me › Help | Today it floats over content on every page |

---

## COACH — DESKTOP (≥1024; tablet 768–1023 = same with a collapsed sidebar and 2-column lists)

```
Sidebar:  Today · Clients · Messages · Library  ── Business (Revenue · Packages · Exports) ── Forma subscription · Account
Top bar:  ⌘K search (guarded navigation; clients from the roster query) · avatar
```

| Destination | Desktop expansion | Same as mobile? |
|---|---|---|
| Today | **Two-pane triage**: queue on the left; the selected item's context and inline action on the right (check-in summary + feedback; assessment + mark reviewed; thread reply; renew form). Keyboard J/K + Enter. | Same items, side by side |
| Clients | Sortable table with **5 columns**: Client · Next action/reason · Last workout · Adherence 7d · Subscription (days left). Row → client. An optional quick-look offers actions, not repeated fields. Bulk messaging via selection. | Same list, more columns |
| Client | The same 4 sections as tabs. Summary as a 2–3 column grid. **Plan editors as a split view** (structure tree left, editor right, sticky action bar). Progress as a calendar/table hybrid. Profile in 2 columns. **Messages docked as a right-side panel inside the client.** | Same sections |
| Messages | Split view with a **URL-backed selection** (`/coach/messages/:id` renders inside the split) | Same threads |
| Library | Sortable, filterable tables for exercises and foods; cards for programs | Same segments |
| Business | Desktop-first tables + exports with date range; Packages editor | Mobile shows a summary |

**Why:**
- Desktop serves the heavier management work (bulk actions, tables, exports, side-by-side review) without new destinations.
- Every desktop surface maps 1:1 to a mobile one, so a coach can switch devices mid-task without relearning.

---

## Coach current → proposed mapping (complete)

| Current | Proposed home |
|---|---|
| `/coach/dashboard` (Overview attention list, Clients/Engagement/Content tabs), `/coach/checkins`, `/coach/assessments`, IncomingTransferRequests, freeze cards, renewals, coach notifications | **Today** (the Engagement/Content tab metrics are dropped; see the removal candidates) |
| `/coach/clients`, `/coach/adherence` | **Clients** (adherence becomes a column/sort) |
| `/coach/client/:id` (Overview), Check-ins tab, assessment review CTA | **Client › Summary** |
| `/coach/client/:id/{workout,nutrition,cardio}`, `/versions/:kind`, AssignTemplate, VersionActions | **Client › Plan** (+ sheets) |
| `/coach/client/:id/view[/:tab]`, `/coach/client/:id/activity`, check-in history | **Client › Progress** |
| `/coach/client/:id/{assessment,notes,subscription,history}` | **Client › Profile** |
| `/coach/messages`, `/coach/messages/:clientId`, broadcast | **Messages** (+ docked panel in Client on desktop) |
| `/coach/templates[/…]`, `/coach/library` (4 chips) | **Library** |
| `/coach/revenue`, `/coach/reports`, `/coach/subscription-plans` | **Me › Business** (Packages) |
| `/coach/plan`, CoachPlanBanner (non-blocking), CoachTrialBanner, the capacity card | **Me › Forma subscription** (+ blocking banner only) |
| `/coach/settings`, WhatsApp FAB | **Me › Account / Help** |
| `/coach/notifications` | **Today** |

---

## Open product decisions (needed before Phase B design)

1. **Private coach notes.** Should coaches have truly private notes, separate from client-visible notes? (Recommended: yes. BV-12 shows the current model misleads coaches.) This decides Client › Profile.
2. **Notifications for coaches.** Should Today fully replace the bell? (Recommended: yes for coach events; system and account notices go to Me.)
3. **Unified "Add client".** One email/phone flow that finds an existing account (assign or request transfer) or sends an invite? (Recommended: yes. It also shrinks the cross-coach search exposure in BV-13.)
4. **Client Coach tab vs Inbox name.** "Coach" (relationship) is recommended over "Inbox" (mechanism).
5. **Cardio placement.** Coach-prescribed cardio in Train, with steps/minutes quick-log on Today (recommended), vs a separate Cardio tab.
6. **Global exercise catalog.** A shared, curated catalog plus coach-owned additions, instead of per-coach copies of 909 records (see 07). This changes what "Library" means for both roles.
7. **Arabic variants.** Keep three locales (EN / ع / مصري) or two? The two Arabic options confuse users (see 14).
