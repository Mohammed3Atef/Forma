# B2 — Client blueprint

> Phase B2 · 2026-10-08 · baseline `595e0af` (B1 committed, tree clean). Built against:
> - `16_TARGET_INFORMATION_ARCHITECTURE.md` (client), `17_TARGET_DESIGN_SYSTEM.md`, `02_CLIENT_MOBILE_AUDIT.md` and the 13 B2-class P1s in `B1_P1_TRIAGE.md`;
> - the B0 guarantees (`B0_SAFETY_TRUST_REPORT.md`) and the B1 contracts (`B1_FOUNDATION_SPEC.md`);
> - the approved website's own drawn client screens (`src/pages/website/sections/AppStory.tsx`: Today / Train / Fuel / Progress / Inbox mocks), which are the visual target.
>
> Companion docs: `B2_ROUTE_MIGRATION.md` (every route), `B2_IMPLEMENTATION_LOG.md`, `B2_VISUAL_QA.md`, `B2_CLIENT_CERTIFICATION_REPORT.md`.

## 1. What the client must always be able to answer

| Question | Where it is answered |
|---|---|
| What should I do today? | **Today**: one adaptive hero + a short checklist |
| What has my coach planned? | **Train** (sessions) · **Nutrition** (meals) |
| How do I complete it? | Train › Session (full-screen) · Nutrition rows (tap = eaten) |
| How am I progressing? | **Progress** (Body · Strength · Consistency) |
| What needs my attention? | Today's single coach item · the Coach tab badge |
| How do I talk to my coach? | **Coach** (chat first, then Updates, Check-ins) |

## 2. Information architecture

**Five equal tabs + the avatar.** There is no hamburger menu, no centre floating button and no bell; doc 16 removes all three. The website mock draws a raised centre "Train" button, but the B2 brief overrides that: Train is an ordinary tab.

| Tab (label) | Root URL | Sub-screens (URL) | Comes from |
|---|---|---|---|
| **Today** | `/` | — | Home (rebuilt) |
| **Train** | `/workout` | Day `/workout/routine/:dayId` · Exercise `/workout/exercise/:exId` · Session `/workout/session` (full-screen) · Cardio `/cardio` · History `/history` | Workout + RoutineDetail (the orphan becomes the day screen) + Cardio + History |
| **Nutrition** | `/nutrition` | — (food editor and swap are sheets) | Fuel |
| **Progress** | `/progress` (`?tab=body \| strength \| consistency`) | Measurements `/progress/measurements` | Progress + Measurements + Photos + the weekly goal / streak from Home |
| **Coach** | `/messages` | Updates `/coach-notes` · Check-ins `/check-ins` · Check-in `/check-in/:id` (full-screen) · My assessment `/assessment` | Inbox + Notifications + Coach notes + Check-ins + Assessment |
| **You** (avatar, not a tab) | `/settings` | Subscription `/settings/subscription` | Settings + Subscription page |

**Rules that hold the structure:**
- **URLs are kept wherever they already mean the right place.** Old links, server-stored notification routes and the e2e suite keep working. Only meaningless routes redirect: `/workout/library` → `/workout`, `/notifications` → `/coach-notes`.
- **Tab membership comes from one route map** (`src/config/clientNav.ts`). The tab stays lit for its whole subtree; Train stays lit inside a session (doc 05 rule 8).
- **Back is one control in the header, owned by the shell.** Tab roots never show Back (NAV-C01). Sub-screens use the B1 contract (`useBack` → history, validated `returnTo`, semantic parent). The semantic parents are updated to this IA in `navContract.ts`.
- **Full-screen task flows hide the global nav and banners**: session, check-in, assessment wizard and media viewer (D8). They own their safe-area insets.
- **A running workout is always one tap away.** A persistent "Workout in progress · mm:ss · Resume" bar sits above the tab bar on every screen except the session (NAV-C03). It also carries a running rest timer.

### Desktop (≥ 1024 px)

- **Navigation:** a fixed side rail with the same five destinations and the avatar at the bottom. No desktop-only destinations (P8).
- **Content:** a centred column up to ~720 px, with two-column layouts where they help: Today (hero + checklist), Nutrition (meals + day summary), Progress, and Coach (chat + context).
- **Task flows:** the session and check-in stay a centred ~560 px focused column.
- **768–1023 px:** keeps the phone layout with a wider gutter and the bottom tab bar (tablet portrait, thumb reach).

## 3. Every client feature and its new home

| Feature (today) | New home | Notes |
|---|---|---|
| Today hero (start / resume) | Today › hero | Gains states: done · week complete · waiting · no coach · read-only · load failed |
| Today's plan task rows | Today › checklist | Workout row folds into the hero; meals x/y, water, cardio/steps, check-in |
| Check-in card | Today (when due) + Coach › Check-ins | One coach item at most on Today |
| Coach info card / latest coach note (×2) | Coach header / Coach › Updates | Today shows at most one actionable coach item |
| Weekly goal ring + streak | Progress › Consistency | Goal = plan sessions per week (CL-11); no invented streaks |
| "This week" 4 tiles, volume chart | **retired** (doc 16) | Tonnage is not a headline (RM-45); volume trend stays in Strength |
| Recent workouts | Train › History | |
| "Start empty workout" | **retired** | It only opened the Routines list (CL-12) |
| WeekStrip / DayNav on Today | **retired** | Today is always today (P5) |
| Routines accordion | Train › week list → Day | Rows now open the day (CL-13) |
| RoutineDetail (orphan) | Train › Day | Coach notes, sections, rest, video only when playable |
| Exercise library (plan exercises only) | **retired as a destination** | Detail stays reachable from Day, Session and Strength (RM-23) |
| Exercise detail | Train › Exercise | Back → its day or Train |
| Training guide sheet | Train › Day › "How to read your plan" | Kept: generic warm-up / working / RPE-RIR guidance |
| Session (live, finished, summary) | Train › Session | Rebuilt UI on the same store; B0 logging rules kept |
| Rest timer | Session + Resume bar | Same timer store |
| Cardio page (plan, live timer, log, history) | Train › Cardio | All functions kept; steps quick-log on the Today checklist |
| History calendar + list | Train › History, + the Consistency calendar | Opening a day no longer moves the app-wide day (CL-04) |
| Fuel (meals, swaps, extras, custom foods, supplements, water, notes) | Nutrition | Row tap = eaten; swap / edit / remove in a row menu (VS-08); one Add-food flow |
| DayNav on Nutrition | Nutrition › local day switcher | Shows "Viewing Mon 29 Sep · Back to today" when not today |
| Weight (Progress tab) | Progress › Body | One "Log body update" sheet (weight + optional measurements) |
| Measurements page | Progress › Body › Measurements | Same store and URL |
| Photos (Progress tab) | Progress › Body › Photos | Honest upload states kept; MD-01/02/03 still open |
| Strength (PRs, e1RM, volume, muscle split) | Progress › Strength | 4 all-time tiles retired (02 verdict) |
| Inbox thread | Coach › Chat | Same engine (outbox, retries, receipts); new header + segment |
| Notifications page | Coach › Updates | Same lifecycle (read / resolved, mark all, deep links) |
| Coach notes page | Coach › Updates | Duplicated subscription block removed (RM-22); targets grid → Nutrition / Today |
| Check-in history | Coach › Check-ins | |
| Check-in wizard | Coach › Check-in (full-screen) | B0/B1 behaviour unchanged |
| My assessment | Coach › My assessment | Back → Coach |
| Settings › Profile | You › Profile | Name autosave, phone, photo, password |
| Settings › Preferences (language, keep awake, vibration, notifications, default rest) | You › Preferences | Weekly-goal input retired (coach/plan-owned) |
| Reminders editor | You › Preferences › Reminders | Kept. RM-59 is a product decision we don't take silently |
| "Update the app" tool | **retired** | The B0 update pill + B1 multi-tab update replace it (RM-58) |
| Cloud sync card + Sign out | You: quiet SyncStatus row + its own Sign out row | Sign-out flow (sync, then confirm with pending count) unchanged (B0) |
| Storage persistence notice | **retired** (CL-45) | |
| Subscription page | You › Subscription (only home) | |
| (new) Remove this account's data from this device | You › Privacy | PWA-14 residual; refuses while changes are unsynced |
| Notification bell + toasts | Toasts kept (shell hook); bell retired for the client | Coach tab badge = unread messages + unseen updates |

Nothing is removed without a stated reason. Retired items are listed in `B2_ROUTE_MIGRATION.md` §3.

## 4. Product decisions taken in B2 (owner may override)

| # | Decision | Why |
|---|---|---|
| D1 | Labels **Today · Train · Nutrition · Progress · Coach · You** | Doc 16 naming ("Nutrition, not Fuel", BV-39; "Coach, not Inbox", open decision #4). The brief's default |
| D2 | Keep existing URLs; redirect only the two retired routes | Zero broken deep links (server notifications store routes) |
| D3 | Cardio lives in Train; steps / minutes quick-log on Today | Doc 16 open decision #5, recommended option |
| D4 | No "rest day" from a schedule (the data has none). Recovery state = this week's planned sessions done | The brief forbids inventing a workout or schedule |
| D5 | Exercise library retired as a destination | RM-23; it only listed the client's own plan |
| D6 | Reminders kept (in You › Preferences) | RM-59 is unresolved; removing a working feature needs the owner |
| D7 | "Update the app" retired | RM-58; the safe update UX exists (B0 pill, B1 multi-tab) |
| D8 | Weekly-goal input retired; consistency is measured against the plan's sessions | CL-11 (0/5 goal vs a 4-day plan). The stored value is untouched |
| D9 | Client uses the website icon set (1.75 stroke) through an icon-set context; coach/admin icons are unchanged until B3 | Doc 17 Icon REPLACE; the brief keeps coach screens unchanged |
| D10 | ≥ 1024 px side rail; < 1024 px bottom tab bar | The brief: no stretched bottom bar on desktop |
| D11 | "Plan updated" coach item = the mirrored plan's `updatedAt` is newer than the last time the client opened Train (stored per user, per device) | Grounded in real data; `plan_assigned` notifications are not produced server-side |
| D12 | Check-in weight and photos are **not** merged into Progress in B2 | A server data-model change (CL-33); left open as P2 |

## 5. Visual direction (layout rules for every client screen)

**Source:** the website mocks (`AppStory.tsx`), doc 17 brand anchors and B1 tokens.

- **Canvas first.**
  - The page is the container. A surface must group related rows, be interactive, or be the single hero.
  - Cards are never nested.
  - Hairline tier 1 (`--ui-border-subtle`) by default; no shadows on content.
- **One hero per screen** (`MHi` look): `bg-gradient-surface-hi` + amber halo, radius 20, and the single primary action (gradient pill).
  - Today: the session.
  - Nutrition: remaining kcal.
  - Progress: the weight trend.
  - Train: the next session.
- **Orange = act here.**
  - The gradient is reserved for the one primary action per view and the active tab.
  - Accent text is amber (`--ui-accent-hover`).
  - Status uses semantic colours: success green for done, info blue.
  - Never orange for decoration, headings or borders.
- **Type (practical reading sizes).**
  - Body 15 px.
  - Row titles 15–16 px, 600.
  - Exercise names 17–20 px.
  - Primary metrics: 32–40 px mono.
  - Secondary text 13 px.
  - Captions 12 px, the floor.
  - Arabic uses its own face, no caps or tracking, taller line height.
  - The B1 `.t-*` roles are the base; client screens use them directly.
- **Lists are rows, not cards** (Section + ListRow): leading icon tile / tick, title, one meta line, trailing value or chevron. 56 px rows on phones, hairline dividers.
- **Numbers.**
  - Mono tabular (`.t-numeric`), always through `lib/format.ts` (Latin digits, units isolated).
  - A zero state is a sentence, never a zero tile.
- **Status** = borderless tint + dot (`StatusChip`); never tappable-looking.
- **Destructive actions** live in a row menu or edit mode (ActionMenu): trash glyph, last in the menu, with confirm or undo. Never a red × on every row (VS-08).
- **Motion.** The 120 / 200 / 320 ms tokens; set completion uses a short success fill; nothing loops; reduced motion respected.
- **Targets.** 44 px everywhere; 56 px for in-workout controls (set inputs, tick, next / finish, rest controls).
- **Header.**
  - 56 px.
  - Tab roots show the wordmark (Today) or the screen title, plus the avatar at the end.
  - Sub-screens show Back + title.
  - Sync status is quiet (silent when healthy).
- **Tab bar** (phone tab bar from `frames.tsx`):
  - solid `surface` with a hairline top;
  - icon + 12 px label;
  - active = amber label + icon + a top indicator (shape + colour, not opacity);
  - Coach badge = `CountBadge`;
  - safe-area padding from `--shell-safe-bottom`.

## 6. Reused B1 foundations (no client-specific copies)

| Need | B1 piece |
|---|---|
| Tokens, type, spacing, z-ladder | `tokens.css`, Tailwind `ui-*` |
| Banners | `BannerRegion` + `useBannerSlot` (one per shell) |
| Actions | `Button` / `IconButton` / `LinkButton` / `CountBadge` |
| Status | `StatusChip`, `SegmentedControl`, `Tabs` |
| Inputs | `NumericField` (Arabic digits), `SecondLanguageField`, Field family |
| States | `ScreenState`, `OfflineState`, `StaleNotice`, `ConflictState`, `EmptyState`, `ErrorState`, `LoadingState` |
| Media and sync | `MediaViewer` / `viewImages` / `playVideo`; `SyncStatus` |
| Formatting and navigation | `lib/format.ts`; `useBack` / `navContract` |
| Notifications | `notificationTarget` / `openNotification`; taxonomy, `bellCount` |
| Offline and safety | outbox (`queueMessage`, `queueCheckInSubmit`, progress photos); `criticalWork` registry; `--shell-*` variables |

**New shared primitives B2 adds** (generic, so B3 can adopt them for the coach):
- `TabBar` and `SideRail`: the shell nav from one item list.
- `AppHeader`.
- `ListRow`.
- `Section`.
- `Metric`.
- `ActionMenu`: a sheet on phones, a popover on desktop, with `role=menu` and destructive items last.
- `IconSet` context.

**Client composition:** `ClientShell`, `ResumeBar`, `TodayHero`, `MealSection`, `FoodRow`, `SetRow`.

## 7. Preserved contracts (no API or schema change planned)

- **Stores and engine.** All client stores keep their APIs and persistence: workout, nutrition, cardio/weight, measurements, photos, habits, timer, day, settings, reminders. B0 rules stay inside the stores:
  - set logging commits shown values;
  - `startSession` uses today;
  - nutrition commit / rollback;
  - read-only subscription blocks.
- **Local-first sync.** SyncEngine, conflicts, tombstones, per-user IndexedDB and `liveState` are untouched.
- **Server-only reads** (React Query keys unchanged): check-ins, coach notes, notifications, subscription, cardio plan, coach info, assessment.
- **Outbox operations unchanged:** `message.send`, `checkin.submit`, `progressPhoto.upload`.
- **No tRPC or Mongo changes are planned.** Any that prove necessary are logged in the implementation log with a test.
- **Permissions.** Coach-authored plan data stays read-only to the client; the UI offers no plan editing. The server already rejects client writes to plan collections (sync contract allow-list; plans are server reads).

## 8. Risks to B0/B1 guarantees and how they are held

| Risk | Guard |
|---|---|
| Session UI rebuild breaks "commits the shown values" / "refuse empty row" | Logic stays in `workoutStore.toggleSetDone`. New SetRow keeps `set-done-N`, `set-reps-N`, `set-needs-reps`, labels `Weight` / `reps`. Spec `61-b0` + `loggingCorrectness.test` |
| Per-screen date model regresses CL-04 / NT-02 | `dayStore` semantics kept (today default, tab reset, 30-min reset, `startSession` = today); Nutrition shows the date when not today; Today never moves the day |
| New shell covers the composer / check-in CTA | Messages keep the composer contract; the shell's bottom padding stays `bottomnav-h + 2.5rem` on chat (B1 known limit). Specs 32/33/60/61 hit-tests |
| Removing the bell drops toast behaviour (NT-01) | The toast logic moves into a shell hook shared with `NotificationBell`; `NotificationBell.test` keeps covering it |
| Sign-out / account isolation | Sign-out flow reused unchanged; "remove device data" refuses with pending changes and never touches the server |
| Offline boot | The client shell is in the lazy ClientApp chunk (precached); `b1-client-offline-boot.mjs` re-run on the prod build |
| Update safety | The session, cardio timer, rest timer and check-in still register critical work (no change to registrations) |
| e2e selectors | Testids and accessible names the suite relies on are kept. Deliberate changes (nav keys, client desktop rail, Settings layout) are listed in the implementation log with the guarantee each test protects |

## 9. Milestones

`B2.1` shell → `B2.2` Today → `B2.3` Train → `B2.4` Nutrition → `B2.5` Progress → `B2.6` Coach → `B2.7` You and first-run → `B2.8` polish, visual QA and certification.

Each milestone is followed by typecheck, unit tests and screenshots (390 EN/AR plus desktop). The full matrix and the e2e3 suite run at B2.8.
