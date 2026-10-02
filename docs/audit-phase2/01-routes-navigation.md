# Phase 2 — 01 Routes, Navigation, Shells, PWA (static certification)

Scope: `src/App.tsx`, `src/apps/*`, `src/config/nav.ts`, shells, nav hooks/stores, auth pages, PWA wiring, RTL nav logic. Static read only; nothing under `src/`/`api/` modified.
Legend — Status: VERIFIED | VWKL = VERIFIED WITH KNOWN LIMITATION | DEAD | BROKEN | VISUAL | BLOCKED. Behavior: BQ=BACKEND_QUERY BM=BACKEND_MUTATION LS=LOCAL_STATE NAV=NAVIGATION EXT=EXTERNAL_NAVIGATION.

## 0. Mount logic (App.tsx)

| Condition (`src/App.tsx`) | Mounted | Line |
|---|---|---|
| `!ready \|\| phase==='loading'` | `<Splash/>` | 101 |
| `phase==='anonymous'` | `AnonymousApp` (lazy) | 106 |
| `phase==='pending'` | `AccountPending` (no router) | 107 |
| `phase==='suspended'` | `AccountSuspended` (no router) | 108 |
| `needsContact` (cloud client w/o phone) | `CompleteAccount` (no router) | 50,109 |
| `role==='coach'` | `CoachApp` | 110 |
| `role in admin/super_admin` | `AdminApp` | 111 |
| else | `ClientApp` | 112 |

Global (all phases): `ScrollToTop`, `OfflineBanner`, `DialogHost`, `ToastHost`, `ImageViewer`, `VideoPopup`, `BannerHost`, `MustChangePasswordPrompt` (App.tsx:116-126). Account re-read on `visibilitychange` (App.tsx:63-70). Pending/suspended/complete screens have no `<Routes>` → URL preserved, resumes on state change.

## 1. Route table

### 1a. Anonymous (`src/apps/AnonymousApp.tsx`)

| Route | State req. | Shell | Component | Queries | Mutations | Links out | Responsive | Status |
|---|---|---|---|---|---|---|---|---|
| `/` | anon | none | `Landing` (or `Navigate /login` if standalone PWA, L23-32) | `publicPlanTiers`, `publicPlanTiers/coreFeatures` (Pricing.tsx:18-19) | — | `/login`, `/login?signup=1`, in-page anchors `#features #pricing #how #showcase` (LandingHeader.tsx:7-12, ids verified Features:17 HowItWorks:16 Pricing:27 Showcase:14), `mailto`, `wa.me` | LandingHeader section nav `hidden md:flex` (L51) | VERIFIED |
| `/experience` | anon | none (own CSS/three.js) | `Experience` (lazy, L12) | — | — | raw `<a href="/login?signup=1">` ×4 (Experience.tsx:87,107,371,394), `#clients #builder #business` (ids at 191,211,316), `href="#"` ×9 (80,385,426-455) | n/a | VWKL (see R-7) |
| `/login` | anon | none | `Login` | — | `signIn`, `signInWithGoogle`, `resetPassword` (sessionStore) | none (mode toggle is LS, L181) | single column | VERIFIED — `?signup=1` read once at mount (L30) |
| `/invite/:code` | anon | none | `AcceptInvite` | `getInvite(code)` (L45) | `trpc.invites.claim` (L95) → `hydrate` → `navigate('/')` (L108) | `/login` (L126) | single | VERIFIED |
| `/reset/:token` | anon | none | `ResetPassword` | — | `mongoAuth.confirmPasswordReset` (L33) | `/login` (L53,66) | single | VERIFIED |
| `*` | anon | none | `Login` (no redirect, L44) | | | | | VERIFIED — deep link URL preserved through sign-in; role app then resolves it |

### 1b. Client (`src/apps/ClientApp.tsx`, all inside `ClientGate` → assessment gate L132-139, `ClientNotesProvider`, `Onboarding` overlay)

| Route | Shell | Gate | Component | Queries (keys) | Mutations | Links out | Status |
|---|---|---|---|---|---|---|---|
| `/` | `AppShell showDayNav` | `SubscriptionGate` | `Home` | store-driven (day stores); `activeCheckIn` via hook | start session (workoutStore) | `/workout/session` (133,138,144), `/settings` (170), `/check-in/:id` (183), `/nutrition` (262), `/cardio` (280), `/history` (294,363), `/workout` (392) | VERIFIED |
| `/coach-notes` | AppShell | — | `CoachInbox` | `useCoachContent` | — | `/messages` (25), `clientNoteRoute(n)` (60) | VERIFIED |
| `/notifications` | AppShell | — | `Notifications` | `myCoach` (75) | `markNotificationSeen`, `markMessageNotificationsSeen` | `clientNoteRoute` / `n.route` (131-145); back fallback `/` (64) | VERIFIED |
| `/check-in/:id` | AppShell | — | `CheckIn` | `['checkIn',uid,id]` (42) — id == weekStart (checkInApi.ts:26-33; API notify route `/check-in/${weekStart}` clientCheckIns.ts:95,152 ✔) | `submitCheckIn` (48) | `navigate(-1)` ×5 (71,80,88,98,122) | VWKL → R-4 |
| `/check-ins` | AppShell | — | `CheckInHistory` | `checkInsHistory` | — | `/check-in/:id` (43); back `/` (26) | VERIFIED |
| `/assessment` | AppShell | — | `MyAssessment` | assessment | — | back `/settings?tab=account` (32) | VERIFIED |
| `/messages` | AppShell | — | `Messages` | `myCoach` (17) | via `MessageThread` | back `/` (14) | VERIFIED |
| `/workout` | AppShell showDayNav | SubscriptionGate | `Workout` | stores | start session | `/workout/session` (45,49,66) | VERIFIED |
| `/workout/routine/:dayId` | AppShell | SubscriptionGate | `RoutineDetail` | stores | start session | `/workout/session` (54), `/workout/exercise/:id` (65); back `/workout` (27) | VERIFIED |
| `/workout/library` | AppShell | — | `ExerciseLibrary` | stores | — | `/workout/exercise/:id` (92); back `/workout` (16) | VERIFIED |
| `/workout/exercise/:exId` | AppShell | — | `ExerciseDetail` | stores | — | back `/workout/library` (21) | VERIFIED |
| `/workout/session` | `AppShell hideNav` | SubscriptionGate | `WorkoutSession` | stores | log sets | `/workout` (137,148); back `/workout` (34) | VERIFIED |
| `/nutrition` | AppShell showDayNav | SubscriptionGate | `Nutrition` | stores | logs | — | VERIFIED |
| `/cardio` | AppShell showDayNav | SubscriptionGate | `Cardio` | stores | logs | — | VERIFIED |
| `/progress` | AppShell | — | `Progress` | stores | weight log | `?tab=weight\|strength\|measure\|photos` + `?wr=` (Progress.tsx:62-64), `/history` (238), `/workout/exercise/:id` (387), `/progress/measurements` (508) | VERIFIED (filters in URL, replace) |
| `/history` | AppShell | — | `History` | stores | — | `/workout/session` (68); back `/progress` (21) | VERIFIED |
| `/progress/photos` | AppShell | — | `ProgressPhotos` | photoStore | upload | back `/progress?tab=photos` (210) | VERIFIED (tab key matches Progress.tsx:38) |
| `/progress/measurements` | AppShell showDayNav | — | `Measurements` | measurementStore | add | back `/progress?tab=measure` (48) | VERIFIED |
| `/settings` | AppShell | — | `Settings` | stores | profile/settings updates, `reload()` (243,263) | `?tab=` (141-143), `/settings/videos` (420), `/settings/import` (425), `/assessment` (445), `/settings/subscription` (456) | VERIFIED |
| `/settings/app` | AppShell | — | `ClientSettings` → `Navigate /settings?tab=preferences replace` (L8) | — | — | — | DEAD (no inbound link; legacy) → R-10 |
| `/settings/subscription` | AppShell | — | `ClientSubscriptionPage` | subscription | freeze request | back `/settings` (13) | VERIFIED |
| `/settings/videos` | AppShell | — | `VideoManager` | videoStore | — | back `/settings?tab=preferences` (38) | VERIFIED |
| `/settings/import` | AppShell | — | `ImportData` | — | import | back `/settings?tab=preferences` (21) | VERIFIED |
| `*` | — | — | `Navigate to="/" replace` (169) | | | | VERIFIED (see R-3 for `/invite`,`/reset` side-effect) |

Client chrome: `AppShell` (BrandBar + ReminderBanner + SubscriptionBanner + DayNav + RestTimerBar + BottomNav; AppShell.tsx:21-40). Bottom tabs `CLIENT_NAV` (nav.ts:29-35) all exist. Menu sheet `CLIENT_MENU` (nav.ts:44-78): `/`,`/workout`,`/nutrition`,`/cardio`,`/workout/library`,`/progress`,`/progress/measurements`,`/history`,`/messages`,`/check-ins`,`/coach-notes`,`/settings/subscription`,`/settings` — all mounted ✔. Client has NO desktop shell (max-w-md always, AppShell.tsx:24) — by design.

### 1c. Coach (`src/apps/CoachApp.tsx`; every route = `ResponsiveShell(COACH_NAV, COACH_SIDEBAR)` + `CoachPlanBanner`; `gated()` = + `CoachPlanGate`)

| Route | Extra gate | Component | Queries | Mutations | Links out | Responsive branch | Status |
|---|---|---|---|---|---|---|---|
| `/coach` | — | `CoachIndex` (L48-51): tabletUp → `Navigate /coach/dashboard replace`; mobile → inline `<CoachClients/>` | — | — | — | JS fork on `useIsTabletUp` | VWKL → R-5 |
| `/coach/dashboard` | — | `CoachDashboard` | `coachDashboard`, `coachPlan` (29-35) | `checkTrialExpiry` (37) | `?tab=overview\|clients\|engagement\|content` (50-51), `/coach/clients?new=1` (63); panels → many (see §2) | `Tabs` horizontal scroll; QuickActionsGrid `hidden md:grid` / Trigger `md:hidden` (QuickActions.tsx:38,84) | VERIFIED |
| `/coach/clients` | — | `CoachClients` | `myClients`, `coachDashboard`, `coachPlan` (89-109) | add/invite/transfer via sheets | `?new=1` opens Add sheet then cleared (73-80); `?q` read at mount only (64); `/coach/client/:id` (191,261,284), `/coach/messages/:id` (261), `/coach/settings` (227, `md:hidden`) | `isDesktop` → SplitPane+DataTable (246) else list | VERIFIED |
| `/coach/assessments` | — | `CoachAssessments` | assessments list | — | `/coach/client/:id/assessment` (67) | — | VERIFIED |
| `/coach/checkins` | — | `CoachCheckInsOverview` | `listForCoachClients` | request/review | `/coach/clients` (153), `/coach/client/:id/checkins` (174) | — | VERIFIED |
| `/coach/reports` | — | `CoachReports` → `ReportsPanel` | `coachDashboard` | CSV export | `/coach/client/:id` (ReportsPanel 84,92) | table `hidden lg:block` / cards `lg:hidden` (78,88) | VERIFIED |
| `/coach/revenue` | — | `CoachRevenue` → `AnalyticsPanel` | `coachDashboard` | — | — | `hidden lg:block`/`lg:hidden` (45,48) | VERIFIED |
| `/coach/plan` | — | `CoachPlan` | plan, tiers, request | `coachPlanRequests.submit/cancel` | — | — | VERIFIED (out of slice for plan states) |
| `/coach/subscription-plans` | — | `CoachSubscriptionPlans` | — | — | — | — | VERIFIED (mounted, sidebar item nav.ts:132) |
| `/coach/client/:clientId` (layout) | — | `CoachClientWorkspaceLayout` + `<Outlet/>` | `useCoachClientHeader` | — | back `useBack('/coach/clients')` (81); tabs `navigate(to,{replace:true})` (142,182); `/coach/messages/:id` (125); `/coach/client/:id/workout` (128); switcher → same tab other client (94) | desktop 11 tabs; mobile 4 + "More" sheet (36-37,134,152) | VWKL → R-20 |
| ├ index | — | `CoachClientDetail` | `user`, `clientLogs`×2, `coachNotes`, 3 plans, `clientAssessment` (63-108) | `releaseClient` → `navigate('/coach')` (52-60) | `tel:` (122), `/view` (155), `/coach/messages/:id` (175), `/assessment` (194), `/checkins` (216), `/workout` `/nutrition` `/cardio` (282-284) | grid `md:grid-cols-2 lg:grid-cols-3` | VERIFIED |
| ├ `assessment` | — | `CoachClientAssessment` | assessment | review | `/coach/client/:id/${b.kind}` (128) | — | VERIFIED |
| ├ `checkins` | — | `CoachCheckIns` | check-ins | request/review | — | — | VERIFIED |
| ├ `workout` / `nutrition` / `cardio` | `CoachPlanGate` (90-92) | editors | plan + drafts | save plan; `useUnsavedGuard` | exit `useBack('/coach/client/:id')` (Workout 94, Nutrition 132, Cardio 104); `VersionActions` → `/versions/:kind` (73) | Nutrition/Cardio `isDesktop` forks (88,55) | VERIFIED |
| ├ `notes` / `subscription` / `history` | — | `CoachClientNotes` / `CoachClientSubscriptionTab` / `CoachClientHistory` | notes / user+sub / timeline | notes, sub edits | — | — | VERIFIED |
| `/coach/client/:clientId/activity` | — | `CoachClientActivity` | logs | — | back `/coach/client/:id` (10) | — | DEAD (no inbound link) → R-9 |
| `/coach/client/:clientId/view[/:tab]` | — | `CoachViewLayout` | `user`, `coachNotes` (39-40) | `addCoachNote` (46) | tabs `replace` (72); back `/coach/client/:id` (34) | chips scroll | VERIFIED (invalid `:tab` → activity, L35) |
| `/coach/client/:clientId/versions/:kind` | — | `PlanVersionHistory` | versions | restore | back `/coach/client/:id` (41) | — | VERIFIED |
| `/coach/library` | — | `CoachExerciseLibrary` | per tab | CRUD | `?tab=exercises\|foods\|groups\|supplements` (61-76) | `isDesktop` DataTable forks (86,268) | VERIFIED |
| `/coach/templates` | — | `CoachTemplates` | `workoutTemplates` | — | `/coach/templates/new` (57), `/coach/templates/:id` (94) | — | VERIFIED |
| `/coach/templates/new`, `/:templateId/edit` | `CoachPlanGate` (107-108) | `CoachWorkoutTemplateEditor` | template | save → `/coach/templates/:id` (74) | exit → `/coach/templates` or `/coach/templates/:id` (78-82, own confirm, not `useBack`) | — | VERIFIED |
| `/coach/templates/:templateId` | — | `CoachTemplatePreview` | template | duplicate/delete → `/coach/templates` (39,44) | `/edit` (70); back `/coach/templates` (30) | — | VERIFIED |
| `/coach/adherence` | — | `CoachAdherence` | logs | — | `/coach/client/:id` (82) | `isDesktop` (22) | VERIFIED |
| `/coach/messages` | — | `CoachMessages` | `myClients` (50), `subscribeCoachThreadsSummary` (63) | `broadcast` (300) | mobile rows → `/coach/messages/:id` (165); desktop rows → local `selectedId` (119); header → `/coach/client/:id` (202); `/coach/clients` (149) | `isDesktop` SplitPane (106) | VWKL → R-15b |
| `/coach/messages/:clientId` | — | `CoachMessageThread` | `user` (19) | via `MessageThread` | back `/coach/messages` (16); `/coach/client/:id` (39,47) | full page at every width | VERIFIED |
| `/coach/notifications` | — | `Notifications` | `myClients` (70) | seen marks | `n.route ?? '/coach'` (137,142); back fallback `/coach` (64) | — | VERIFIED |
| `/coach/settings` | — | `RoleAccount` | `coachPlan`, `coachPlanTiers`, `myClients` (34-36) | `updateSelf`, `signOut` | `/coach/plan` (87) | — | VERIFIED |
| `*` | — | `Navigate /coach replace` (115) | | | | | VERIFIED |

Coach chrome: mobile `BrandBar`+`BottomNav(COACH_NAV)`; ≥md `SidebarNav(COACH_SIDEBAR)`+`DesktopTopBar` (ResponsiveShell.tsx:32-46). `CommandHost` mounted once (CoachApp.tsx:118). `WhatsAppFab` hidden on `/messages*` (WhatsAppFab.tsx:20). All 14 `COACH_SIDEBAR` targets (nav.ts:103-142) and 4 `COACH_NAV` targets (87-92) are mounted ✔.

### 1d. Admin / super_admin (`src/apps/AdminApp.tsx`; every route = `ResponsiveShell(ADMIN_NAV, sidebar by role L35-36)`)

| Route | Role gate | Component | Queries | Mutations | Links out | Status |
|---|---|---|---|---|---|---|
| `/admin` | — | `AdminDashboard` → `OverviewPanel` | `adminStats`; `coachAdmin`, `adminGrowth`, `planRequests` only when `isSuper` (24-29) | — | `/admin/accounts` (59), `/admin/coaches/:id` (91,103,154 — all inside `isSuper &&` 68,146), `/admin/assignments` (113), `/admin/audit` (122), `/admin/coaches` (150, isSuper) | VERIFIED |
| `/admin/accounts` | — | `AdminAccounts` | `adminUsers.list` with `?q=`,`?status=` in URL (79-94) | create/status/role | `/admin/clients/:id` (356) | VERIFIED (filters in URL) |
| `/admin/members` | — | `AdminMembers` | `adminMembers.get` (73, admin+) | `setAccountStatus` | `openMember` → `/admin/coaches/:id` for coaches, `/admin/clients/:id` (105) | BROKEN for plain admin → R-2 |
| `/admin/banners` | `flags.manage` (admin+) | `AdminBanners` | banners | CRUD | — | VERIFIED |
| `/admin/clients/:clientId` | — | `AdminClientDetail` | `user`, 3 plans, assessment (25-29) | — | back `/admin/accounts` (23) | VERIFIED |
| `/admin/assignments` | — | `AdminAssignments` | `usersByRole`×2, `pendingTransfers`, `coachAdmin` (`enabled: canAssign`, 128 — super-only procedure) | assign/transfer | `/admin/coaches/:id` (221) | VWKL → R-2 (capacity section silently empty for admin) |
| `/admin/governance` | `flags.manage` (admin+ per roles.ts:38) | `AdminGovernance` | `featureFlags` | `saveFlag` | — | VERIFIED (eyebrow label wrong → R-12) |
| `/admin/analytics` | — | `AdminAnalytics` | usage/stats | — | — | VERIFIED |
| `/admin/coaches` | `isSuper` else `Navigate /admin` (129) | `AdminCoaches` | `coachAdmin`, `planRequests` (69-71) | — | `/admin/coaches/:id` (194,260), `/admin/audit` (261) | VERIFIED (super) |
| `/admin/coaches/:coachId` | `isSuper` else `Navigate /admin` (120) | `AdminCoachDetail` | `coachUser`, `coachPlanAdmin`, `planRequests`, `adminCoachClients`, `coachPlanTiers` (48-57) | confirm/reject/adminUpdate | back `/admin/coaches` (40) | VERIFIED (super) |
| `/admin/plans` | `isSuper` else `Navigate /admin` (96) | `AdminPlans` | tiers | save | — | VERIFIED (super) |
| `/admin/subscriptions` | none | `AdminSubscriptions` | `coachAdmin` (34, **super-only**), `planRequests` (35, **super-only**), `adminGrowth` (37) — no `enabled`, no error branch (78) | — | `/admin/coaches/:id` ×4 (107,120,165,181), `/admin/coaches` (177), `/admin/clients/:id` (130) | BROKEN for plain admin → R-1 |
| `/admin/audit` | `audit.read` (admin+) | `AdminAudit` | `adminAudit.list` | — | — | VERIFIED |
| `/admin/media` | `super_admin` else `Navigate /admin` (59) | `AdminMedia` | `media.listImages` | delete | CDN `href` (98) | VERIFIED (super) |
| `/admin/notifications` | — | `Notifications` | (`useNotifications` only fetches when `isSuper`, useNotifications.ts:50) | — | `n.route ?? '/admin'` (131) | VWKL (plain admin feed always empty) |
| `/admin/settings` | — | `RoleAccount` | — | `updateSelf`, `signOut` | — | VERIFIED |
| `*` | — | `Navigate /admin replace` (62) | | | | VERIFIED |

Admin chrome: `ADMIN_NAV` (nav.ts:151-156) same for both admin roles; `SUPER_ADMIN_SIDEBAR` adds `/admin/coaches`, `/admin/plans`, `/admin/media` (199-227). All targets mounted ✔.

Route count: anonymous 6 · client 25 · coach 33 · admin 17 = **81 route entries** (incl. 4 catch-alls) + 3 router-less phase screens.

## 2. Navigation-target verification

Matcher: each target normalised (strip `?query`), matched against the role app's `<Route path>` list with `:param` wildcards. "Reach" = the role that renders the link can land on it.

### 2a. Config (`src/config/nav.ts`)

| Config | Items | All mounted? | Role reach |
|---|---|---|---|
| `CLIENT_NAV` 29-35 | 5 | ✔ | client |
| `CLIENT_MENU` 44-78 | 13 | ✔ | client |
| `COACH_NAV` 87-92 | 4 | ✔ | coach |
| `COACH_SIDEBAR` 103-142 | 14 | ✔ | coach |
| `ADMIN_NAV` 151-156 | 4 | ✔ (`/admin/subscriptions` mounted but non-functional for admin → R-1) | admin/super |
| `ADMIN_SIDEBAR` 164-196 | 10 | ✔ | admin |
| `SUPER_ADMIN_SIDEBAR` 199-227 | 13 | ✔ | super |

### 2b. `navigate()` / `<Link>` / `href` call sites (grouped; every site listed in §1 "Links out" column)

| Source | Target(s) | Exists | Role-reachable | Notes |
|---|---|---|---|---|
| `BottomNav.tsx:24,38,55` | `item.to` | ✔ | ✔ | guarded by `hasNavGuard()` (21-26) |
| `SidebarNav.tsx:58` `NavLink` | `item.to` | ✔ | ✔ | **not** guarded by nav guard (no click interception) → R-21 |
| `NavMenuSheet.tsx:27` | group items | ✔ | ✔ | **not** guarded → R-21 |
| `DesktopTopBar.tsx:20,33` | `/coach/settings` \| `/admin/settings` | ✔ | ✔ | |
| `NotificationBell.tsx:31,90,102` | `/coach/notifications` \| `/admin/notifications` \| `/notifications`; toast → `n.route` | ✔ | ✔ | |
| `CommandHost.tsx:48-55` coach cmds | `/coach/clients?new=1`, `/coach/templates/new`, `/coach/library[?tab=…]`, `/coach/messages`, `/coach/assessments`, `/coach/reports` | ✔ | ✔ | `?tab=` keys match CoachExerciseLibrary.tsx:54 |
| `CommandHost.tsx:58-67` coach entities | `/coach/client/:id`, `/coach/library?tab=…`, `/coach/templates/:id` | ✔ | ✔ | |
| `CommandHost.tsx:71-78` admin cmds/entities | `/admin/accounts`, `/admin/assignments`, **`/admin/coaches`**, `/admin/subscriptions`, `/admin/governance`, `/admin/coaches/:id` | ✔ | ✘ for plain admin (`a-coaches`, `co-*` bounce to `/admin`; `a-revenue` lands on R-1 page) | R-2 |
| Marketing `Link`s (Hero:29, FinalCta:21,24, Pricing:52, LandingFooter:20,23, LandingHeader:74,79) | `/login`, `/login?signup=1` | ✔ | anon | `?plan=` is NOT used anywhere (grep) — single-plan model, VERIFIED |
| `Experience.tsx:87,107,371,394` raw `<a href>` | `/login?signup=1` | ✔ | anon | full reload, not SPA (P3) |
| `Experience.tsx:80,385,426,429,432,435,443,452,455` | `href="#"` | ✘ (no-op) | — | R-7 |
| `AcceptInvite.tsx:108,126`, `ResetPassword.tsx:53,66` | `/`, `/login` | ✔ | ✔ | |
| `Notifications.tsx:64,131,137,142,145` | role home / `n.route` / `clientNoteRoute` | ✔ | ✔ | API-generated routes (`/coach/client/:id/assessment`, `/coach-notes`, `/nutrition`, `/check-in/:weekStart`, `/coach/client/:id/checkins`, `/coach/client/:id`, `/coach/messages/:id`, `/messages` — clientProfile.ts:154,184; clientCoachNotes.ts:116; clientCheckIns.ts:95,138,152,236,266; messages.ts:139) all exist for the addressed role ✔; admin route `/admin/coaches/:coachId` (useNotifications.ts:22) super-only ✔ (feed only built for super) |
| `noteTarget.ts:6-13,32` | `/nutrition`,`/workout`,`/cardio`,`/progress`,`/progress/measurements`,`/progress/photos`,`/workout/routine/:dayId`,`/` | ✔ | client | |
| `SubscriptionGate.tsx:25` | `/messages` | ✔ | client | |
| `CoachPlanProvider.tsx:52`, `CoachPlanBanner.tsx:44,58`, `RoleAccount.tsx:87` (coach-only block 67) | `/coach/plan` | ✔ | coach | |
| `CoachChecklist.tsx:43-45` | `/coach/settings`, `/coach/clients?new=1`, `/coach/templates/new` | ✔ | coach | |
| `dashboard/parts.tsx:32-36` | `/coach/client/:id/checkins`, `/assessment`, `/coach/messages/:id` | ✔ | coach | |
| `ClientsPanel.tsx:21-46`, `OverviewPanel.tsx:21-126`, `ContentPanel.tsx:13-26`, `EngagementPanel.tsx:32` | coach routes listed in §1c | ✔ | coach | |
| `CoachClients.tsx:191,227,261,284` | `/coach/client/:id`, `/coach/settings`, `/coach/messages/:id` | ✔ | coach | |
| `CoachClientDetail.tsx:59,155,175,194,216,282-284` | `/coach`, `/view`, `/coach/messages/:id`, `/assessment`, `/checkins`, editors | ✔ | coach | `/coach` on mobile → R-5 |
| `CoachClientWorkspaceLayout.tsx:46-59,94,125,128,142,182` | `tabPath()` set incl. `/view/progress`, `/coach/messages/:id` | ✔ | coach | R-20 |
| `VersionActions.tsx:73` | `/coach/client/:id/versions/:kind` | ✔ | coach | |
| `CoachViewLayout.tsx:72` | `/coach/client/:id/view/:tab` | ✔ | coach | |
| `CoachTemplates.tsx:57,94`, `CoachTemplatePreview.tsx:39,44,70`, `CoachWorkoutTemplateEditor.tsx:74,81` | templates routes | ✔ | coach | |
| `CoachAdherence.tsx:82`, `CoachAssessments.tsx:67`, `CoachCheckInsOverview.tsx:153,174`, `CoachMessages.tsx:149,165,202`, `CoachMessageThread.tsx:39,47` | coach routes | ✔ | coach | |
| `AdminMembers.tsx:105` | `/admin/coaches/:id` | ✔ | ✘ admin | R-2 |
| `AdminSubscriptions.tsx:107,120,130,165,177,181` | `/admin/coaches[/:id]`, `/admin/clients/:id` | ✔ | ✘ admin (coach targets) | R-1/R-2 |
| `AdminAssignments.tsx:221` | `/admin/coaches/:id` | ✔ | ✘ admin (section empty for admin anyway) | R-2 |
| `AdminAccounts.tsx:356`, `AdminCoaches.tsx:194,260,261`, `OverviewPanel.tsx:59-154` | admin routes | ✔ | ✔ (super gates in place) | |
| Client pages (`Home`, `Workout`, `RoutineDetail`, `ExerciseLibrary`, `History`, `Progress`, `Settings`, `CheckInHistory`, `CoachInbox`, `CoachCard:17`, `CoachInfoCard:33,83`) | client routes | ✔ | client | |
| `CheckIn.tsx:71,80,88,98,122` | `navigate(-1)` | n/a | — | R-4 |
| External: `WhatsAppFab:30`, `LandingFooter:37,40`, `CoachInfoCard:71 tel:`, `CoachClientDetail:122 tel:`, `MessageThread:1252`, `VideoPlayerSheet:106`, `ExerciseView:90`, `BannerHost:91`, `AdminMedia:98`, `CoachClients:440 wa.me` | EXT | — | all `target=_blank rel=noreferrer/noopener` ✔ |

Totals: **≈235 navigation targets checked** (57 config items, ~148 `navigate()`/`Navigate` sites, 8 `<Link>`, ~22 `href`). Route-existence failures: 0 (every in-app path matches a mounted route). Reachability/semantic failures: 9 dead `href="#"`, 12 admin→super-only call sites (R-1/R-2), 5 `navigate(-1)` sites (R-4), 2 signed-in bounce cases (R-3) = **28 defective targets**.

## 3. Navigation semantics

| Case | Evidence | Status |
|---|---|---|
| Browser back | `useBack` (useBack.ts:25-35): real `navigate(-1)` unless `location.key==='default'` (first entry) → fallback `replace`. Always via `confirmLeave()`. | VWKL → R-20 (replace on first entry defeats fallback) |
| Direct deep link (signed out) | `AnonymousApp:44` renders Login at the same URL; after sign-in role app resolves it. | VERIFIED |
| Deep link (wrong role) | each app `*` → role home (ClientApp:169, CoachApp:115, AdminApp:62) | VERIFIED |
| Refresh | Phase screens have no routes; role apps re-resolve URL; `?tab`/`?q`/`?status`/`?wr` are URL-synced with `replace` (Tabs.tsx:24, Settings.tsx:143, AdminAccounts.tsx:79-94, Progress.tsx:62-64) | VERIFIED |
| Query params preserved | `?new=1` consumed & stripped (CoachClients.tsx:73-80); `?q` in CoachClients read at mount only (64), not written back | VWKL (P3) |
| Message thread → previous list | coach: `useBack('/coach/messages')` (CoachMessageThread.tsx:16); client: `useBack('/')` (Messages.tsx:14) | VERIFIED |
| Client detail → subpages | workspace tabs `replace`; child pages exit `useBack('/coach/client/:id')`; escape hatches `/view/progress`, `/coach/messages/:id` unmount the layout (CoachClientWorkspaceLayout.tsx:39-59) | VERIFIED |
| Admin coach detail | `useBack('/admin/coaches')` (AdminCoachDetail:40) — super only | VERIFIED |
| Marketing → pricing → signup | `#pricing` scroll (LandingHeader:15-18) → `Link /login?signup=1` (Pricing:52) → `Login` mode `signup` (Login:30). No `?plan=` (single Trial→Pro model; Pricing.tsx:9-14). | VERIFIED |
| Login ↔ signup switching | LS toggle (Login:181) — URL not updated; refresh on signup form without `?signup=1` returns to sign-in | VWKL (P3) |
| Post-login | `sessionStore.signIn` sets phase; no explicit redirect — URL kept. `AcceptInvite` → `/` replace (108). `signOut` → phase anonymous, URL kept → Login at that URL (sessionStore.ts:134-137). | VERIFIED |
| Standalone PWA at `/` | `Navigate /login replace` (AnonymousApp:23-32) | VERIFIED |
| Manifest shortcuts `/coach`, `/workout` (vite.config.ts:62-63) | resolve via catch-alls for other roles | VERIFIED |
| Unsaved-changes guard | `useUnsavedGuard` → `setNavGuard`; honoured by `useBack`, `useGuardedNav`, `BottomNav`; browser Back NOT blocked (documented, useUnsavedGuard.ts:20-24); `SidebarNav`/`NavMenuSheet`/`DesktopTopBar` NOT guarded | VWKL → R-21 |
| Scroll restore | `ScrollToTop` on `pathname` change only (query changes keep scroll) ✔ | VERIFIED |

## 4. Responsive interaction parity (static)

| Surface | Desktop/tablet (≥md / ≥lg) | Mobile (<md) | Gap |
|---|---|---|---|
| Coach/admin destinations | `SidebarNav` = `COACH_SIDEBAR` / `ADMIN_SIDEBAR` | `BottomNav` (4) + `NavMenuSheet` (same grouped list, NavMenuSheet.tsx:56-63) | none |
| Global search / command palette | `GlobalSearch` in `DesktopTopBar:24` + ⌘K (CommandHost:28-37) | `BrandBar` has bell + menu only (BrandBar.tsx:40-55); no trigger, no keyboard | **desktop-only** → R-15a |
| Notifications | `DesktopTopBar:27` | `BrandBar:42` | none |
| Account/settings | avatar `DesktopTopBar:33` | menu sheet "You" group; coach clients page extra `md:hidden` button (CoachClients:227) | none |
| Sync indicator | `DesktopTopBar:26` `SyncStatusIndicator` | not in BrandBar (client Home has `SyncStatusBadge` 171) | coach/admin mobile lack sync indicator (P3) |
| Sidebar collapse | `lg:flex` toggle (SidebarNav:88-98) | n/a | by design |
| Coach workspace tabs | 11 tabs | 4 + More sheet (all 11) | none |
| Quick actions | grid `hidden md:grid` | "+" trigger `md:hidden` + sheet | none |
| Coach Messages | split pane; selected thread in **local state** (CoachMessages:46,119) | list → `/coach/messages/:id` | desktop selection not in URL (refresh/back loses thread) → R-15b |
| Coach Clients | SplitPane + DataTable + preview (246-262) | list rows | preview actions (open/message) also on row/detail ✔ |
| Admin tables (`AdminAccounts:286-312`, `AdminMembers:200`, `AdminCoaches:240`) | DataTable | card lists | verified both branches render actions (out of slice for per-row actions) |
| Reports/Analytics tables | `hidden lg:block` tables | `lg:hidden` cards | none |
| Client app | none (max-w-md) | full | by design |
| Landing section nav | `hidden md:flex` (LandingHeader:51) | none (scroll only) | P3 marketing only |
| Hover-only controls | `CommandPalette` `onMouseEnter` (147) sets highlight only; DataTable hover classes cosmetic | — | none blocking |

## 5. PWA + RTL

### 5a. PWA (§32)

| Item | Evidence | Status |
|---|---|---|
| SW registration | `registerSW({immediate:true})` main.tsx:17; `registerType:'prompt'`, `injectRegister:false` vite.config.ts:31-32 | VERIFIED |
| Deferred update reload | `onNeedRefresh` → `updateSW(true)` immediately if hidden else on next `visibilitychange→hidden` (main.tsx:19-34); `skipWaiting:false` + `clientsClaim:true` + `cleanupOutdatedCaches` (vite.config.ts:85-87) so SKIP_WAITING only from `updateSW(true)` | VERIFIED (approved strategy intact) |
| Update polling | `registration.update()` every 60s when online + on visible (main.tsx:35-44) | VERIFIED |
| Stale-chunk recovery | `ErrorBoundary.componentDidCatch` regex (ErrorBoundary.tsx:8-11) → one guarded `reload()` (34-42); guard cleared 10s after successful boot (main.tsx:61-67); manual Reload fallback (54-60) | VERIFIED |
| Offline | `useOnlineStatus` seeds `navigator.onLine` + events (useOnlineStatus.ts:9-19); `OfflineBanner` fixed z-60 `pointer-events-none` (OfflineBanner.tsx:16-23) mounted globally (App.tsx:119) | VERIFIED |
| Install prompt | none implemented (no `beforeinstallprompt` in `src/`) | VISUAL ONLY BY DESIGN (browser default) |
| `navigateFallback:'/index.html'` no denylist (vite.config.ts:72) | any top-level navigation to `/api/*` (e.g. opening a media URL in a new tab) is answered with index.html by the SW | VWKL → R-22 |
| Precache excludes | `globIgnores` landing images + `Experience-*.js` (71) | VERIFIED |

### 5b. RTL (§28)

| Element | Evidence | Status |
|---|---|---|
| `<html dir>` | `applyLocale` sets `html.dir` (i18n/index.ts:61); CSS `html[dir='rtl']` (index.css:36-46) | VERIFIED |
| TopBar back chevron / title chevron | `rtl` from `i18n.dir()`; `rotate-180` (TopBar.tsx:28,47,56) | VERIFIED |
| Workspace back | `rtl:rotate-180` (CoachClientWorkspaceLayout:110) | VERIFIED |
| CheckIn back/continue | `rtl:rotate-180` (CheckIn.tsx:119,212) | VERIFIED |
| Sheet step-back | `rotate-180 rtl:rotate-0` (Sheet.tsx:117) | VERIFIED |
| DayNav prev/next | swapped rotations (DayNav.tsx:20,25,54); CoachDayNav (16,29) | VERIFIED |
| Row chevrons | `rtl:rotate-180` in NavMenuSheet:51, Home:193,326,383, Settings:423-459, Workout:99, ExerciseLibrary:99, WorkoutSession:398,407, CoachClientDetail:187,209,228 | VERIFIED |
| Row chevrons NOT flipped | Notifications.tsx:197; CoachMessages.tsx:221,280; CoachInbox.tsx:28,68 | R-11 |
| Sidebar collapse chevron | `chevronLeft` + `rotate-180` when collapsed, no RTL branch (SidebarNav:96) | R-11 |
| Drawer side | no side drawer; Sheet is bottom (mobile) / centered (md+) (Sheet.tsx:99-110) — no flip needed | VERIFIED |
| Badges / logical props | `end-*`, `ms-*`, `border-e` used (BottomNav:71, SidebarNav:36,74, NotificationBell:109, WhatsAppFab:28) | VERIFIED |
| Horizontal scroll rails | flex + `overflow-x-auto` (CoachClientWorkspaceLayout:133, Tabs.tsx:55, CoachViewLayout:66) — native RTL flow | VERIFIED |
| Swipe | ImageViewer swipe: `dx<0 → next` regardless of dir (ImageViewer.tsx:49) | VWKL (P3, R-11) |
| Charts | forced `dir="ltr"` with rationale (charts.tsx:95-101,216-221) | VERIFIED |
| Context menu placement | `document.dir` aware (MessageThread.tsx:1162-1174) | VERIFIED |
| Search-field icon | physical `left-3 rtl:left-auto rtl:right-3` (ExerciseLibrary:66-69, WorkoutSession:512-516) | VERIFIED |

## 6. Unreachable components

| Component | Path | Why |
|---|---|---|
| `RolePlaceholder` | `src/pages/RolePlaceholder.tsx` | never imported (grep: only its own definition) — dead code |
| `CoachClientActivity` | `src/pages/coach/CoachClientActivity.tsx` | route `/coach/client/:clientId/activity` mounted (CoachApp:101) but no `navigate`/link targets it; `ClientActivityView` itself is reached via `/view` tab instead |
| `ClientSettings` | `src/pages/ClientSettings.tsx` | `/settings/app` redirect stub, no inbound link |
| `Experience` | `src/pages/experience/Experience.tsx` | `/experience` mounted but no in-app link from Landing/anywhere; URL-only |

All other `src/pages/**` files are either routed or composed by a routed page (verified by import grep: dashboard panels, CoachView*, AddExistingClient, CoachSubscriptionPanel, LoadStarterLibraryButton, CoachTrialBanner, CoachChecklist, CoachStateBadge, marketing sections/Reveal, AssessmentWizard via ClientGate).

## 7. FINDINGS

| ID | Sev | file:line | Defect | Proposed fix |
|---|---|---|---|---|
| R-1 | P1 | `src/pages/admin/AdminSubscriptions.tsx:34-35,78` (+ `src/config/nav.ts:154,182`) | `/admin/subscriptions` is a bottom-nav tab + sidebar item for plain `admin`, but its primary queries `fetchCoachAdmin`→`adminCoaches.list` and `listPendingPlanRequests` are `role(super_admin)` (Phase-1 §36 L350,307). No `enabled: isSuper`, no error branch → plain admin sees an infinite `LoadingState` on a primary tab; every coach row there also targets super-only `/admin/coaches/:id`. | Either gate the page `if (!isSuper) return <Navigate to="/admin"/>` and drop it from `ADMIN_NAV`/`ADMIN_SIDEBAR` (keep in super sidebar), or build an admin-safe variant (use `adminGrowth`/`adminMembers` only, `enabled:isSuper` on super queries, render `ErrorState` on `q.isError`). |
| R-2 | P2 | `src/pages/admin/AdminMembers.tsx:105`; `src/components/CommandHost.tsx:73,78`; `src/pages/admin/AdminAssignments.tsx:128,221`; `AdminSubscriptions.tsx:107,120,165,177,181` | Plain admin is routed to `/admin/coaches[/:id]`, which `AdminCoaches.tsx:129` / `AdminCoachDetail.tsx:120` bounce back to `/admin` — silent dead-end. `AdminAssignments` capacity query fails silently (super-only) so the section vanishes. | Branch on `isSuper`: `openMember` → `/admin/clients/:id`-style read-only view or disable coach rows; hide `a-coaches` command and coach entities for non-super in `CommandHost`; `enabled: isSuper` on `coachAdmin` in AdminAssignments. |
| R-3 | P2 | `src/apps/ClientApp.tsx:169`, `src/apps/CoachApp.tsx:115`, `src/apps/AdminApp.tsx:62` | A signed-in user opening `/invite/:code` or `/reset/:token` is silently redirected to the role home by the catch-all — invite/reset links are unusable while a session exists, with no explanation. | Add `/invite/:code` and `/reset/:token` routes in each role app rendering a small "You're signed in as X — sign out to continue" screen with a Sign-out button that preserves the URL (sessionStore keeps the URL on signOut). |
| R-4 | P2 | `src/pages/CheckIn.tsx:71,80,88,98,122` | Uses raw `navigate(-1)` instead of `useBack`: on a notification deep link / fresh tab (`route: /check-in/:weekStart`, api clientCheckIns.ts:95,152) there is no in-app history, so back/close does nothing or leaves the site; also bypasses `confirmLeave()`. | `const goBack = useBack('/check-ins')` and use it for all five sites (step-0 back and the close button). |
| R-5 | P2 | `src/apps/CoachApp.tsx:48-51`; `src/pages/Notifications.tsx:64`; `src/pages/coach/CoachClientDetail.tsx:59` | On mobile `/coach` renders `CoachClients` inline at URL `/coach`, which is not a `COACH_NAV` item (nav.ts:87-92) → no active tab, and back-fallbacks (`/coach`) land on this un-highlighted state. | `CoachIndex` → `<Navigate to={tabletUp ? '/coach/dashboard' : '/coach/clients'} replace />`; change fallbacks to `/coach/clients` (mobile) or keep `/coach` once it redirects. |
| R-20 | P2 | `src/hooks/useBack.ts:29-34`; `src/components/coach/CoachClientWorkspaceLayout.tsx:142,182`; `src/pages/coach/CoachViewLayout.tsx:72` | `useBack` treats `location.key !== 'default'` as "has history", but a `replace` navigation assigns a new key. Deep-link to `/coach/client/X` (or `/view`) then tap a tab (replace) → back arrow calls `navigate(-1)` and exits the site instead of the fallback. | Track history depth in a store (increment on PUSH via `useNavigationType()`/`history.state.idx`) and use `window.history.state?.idx > 0` (react-router sets `idx`) instead of `location.key`. |
| R-21 | P2 | `src/components/shell/SidebarNav.tsx:56-59`; `src/components/NavMenuSheet.tsx:26-29`; `src/components/shell/DesktopTopBar.tsx:33` | Unsaved-changes guard (`useUnsavedGuard`) is honoured by `BottomNav`/`useBack`/`useGuardedNav` but NOT by the desktop sidebar `NavLink`s, the mobile menu sheet, or the top-bar avatar — a dirty plan editor can be abandoned without confirmation from the sidebar (desktop is the primary coach surface). | Apply the same `guardedClick` pattern as `BottomNav.tsx:20-26` to `SidebarNav`, and route `NavMenuSheet.go`/`DesktopTopBar` through `useGuardedNav()`. |
| R-15a | P2 | `src/components/BrandBar.tsx:40-55`; `src/components/CommandHost.tsx:28-37` | Command palette / global entity search (clients, exercises, foods, templates, coaches) is desktop-only: the only triggers are `GlobalSearch` in `DesktopTopBar` and ⌘K. Mobile has no entry point. | Add a search icon button in `BrandBar` for coach/admin roles calling `useCommandStore.show()`. |
| R-15b | P3 | `src/pages/coach/CoachMessages.tsx:46,119` | Desktop split view keeps the open thread in `selectedId` state only; refresh/back/deep-link cannot restore it, while mobile uses `/coach/messages/:clientId`. | Sync selection to `?client=` via `useTabParam('client')` (or navigate to `/coach/messages/:id` and render the split there). |
| R-22 | P3 | `vite.config.ts:72` | `navigateFallback:'/index.html'` without `navigateFallbackDenylist` — a top-level navigation to `/api/*` (e.g. a media/export URL opened in a new tab) is served the SPA shell by the SW. | `navigateFallbackDenylist: [/^\/api\//]`. |
| R-7 | P3 | `src/pages/experience/Experience.tsx:80,385,426,429,432,435,443,452,455` (+87,107,371,394) | Public `/experience` page has 9 `href="#"` dead links (Exercises/Foods/Templates/Assessments/About/Privacy/Terms/brand) and uses raw `<a href="/login?signup=1">` (full reload) instead of `<Link>`; page has no inbound link (URL-only). | Replace with real targets (`/#features`, `/#pricing`, `mailto`) or remove; use `<Link>`; either link it from Landing or drop the route. |
| R-8 | P3 | `src/pages/RolePlaceholder.tsx` | Unused component (no imports). | Delete. |
| R-9 | P3 | `src/apps/CoachApp.tsx:101`; `src/pages/coach/CoachClientActivity.tsx` | `/coach/client/:clientId/activity` has no inbound link (legacy per comment 97-100); duplicate of `/view` (activity tab). | Replace route with `<Navigate to="/coach/client/:id/view" />` or delete route + page. |
| R-10 | P3 | `src/apps/ClientApp.tsx:165`; `src/pages/ClientSettings.tsx` | `/settings/app` legacy redirect stub with no inbound links. | Keep only if external links exist; otherwise delete route + file. |
| R-11 | P3 | `src/pages/Notifications.tsx:197`; `src/pages/coach/CoachMessages.tsx:221,280`; `src/pages/CoachInbox.tsx:28,68`; `src/components/shell/SidebarNav.tsx:96`; `src/components/ImageViewer.tsx:49` | RTL inconsistencies: right-pointing `chevron` rows not flipped (siblings use `rtl:rotate-180`); sidebar collapse chevron direction not RTL-aware; image swipe direction not mirrored. | Add `rtl:rotate-180` to the row chevrons; use `rtl:rotate-180` + inverse when collapsed on the sidebar toggle; mirror `dx` sign when `document.dir==='rtl'`. |
| R-12 | P3 | `src/pages/admin/AdminGovernance.tsx:25` (+ `AdminApp.tsx:31-32` comment) | Governance is reachable by plain admin (`flags.manage` in roles.ts:38, ADMIN_NAV nav.ts:155) but the eyebrow hard-codes `platform.superAdmin`; the AdminApp comment claims it is super-only. | Use `t(isSuper ? 'platform.superAdmin' : 'platform.admin')`; fix comment. |
| R-13 | P3 | `src/hooks/useNotifications.ts:50,59-62`; `src/components/NotificationBell.tsx:31` | Plain admin gets a bell that navigates to `/admin/notifications` which is always empty (feed only built for super). | Hide bell for `admin` (non-super) or give admins an admin-safe feed. |
| R-14 | P3 | `src/pages/coach/CoachClients.tsx:64` | `?q` is read once at mount and never written back; sharing/refresh of a filtered client list is not preserved (unlike AdminAccounts:79-94). | Use `useTabParam('q')`-style sync with `replace`. |
| R-16 | P3 | `src/pages/auth/Login.tsx:30,181` | Sign-in/sign-up mode toggle is local state; URL `?signup=1` not updated, so refresh on the sign-up form falls back to sign-in. | Mirror mode to `searchParams` with `replace`. |
| R-17 | P3 | `src/components/shell/DesktopTopBar.tsx:26` vs `src/components/BrandBar.tsx` | `SyncStatusIndicator` shown only in desktop chrome; coach/admin mobile shell has no sync/offline-write indicator besides the global OfflineBanner. | Add `SyncStatusIndicator` to `BrandBar` for coach/admin. |

Known limitations accepted (no fix proposed): browser hardware Back not blocked by unsaved guard (declarative `BrowserRouter`, useUnsavedGuard.ts:20-24); `SUPER_ADMIN_NAV === ADMIN_NAV` (Coaches/Plans/Media only via menu sheet, nav.ts:144-157 by design); client app has no desktop shell (mobile-first by design).
