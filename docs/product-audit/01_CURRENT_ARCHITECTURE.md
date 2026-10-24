# 01 — Current architecture map (Phase A)

Audit 2026-10-04 · repo `development` @ `e7663ab` (website committed today) · production runs RC2 `cf3a5d9` (from project notes; not re-verified). Where something exists only in HEAD, it says so. This is a read-only map; no code was changed. Removal IDs (RM-xx) refer to `docs/FORMA_PRODUCT_REMOVAL_CANDIDATES.md`. Area findings are in docs 02–17.

## Bottom line
- **One React 18 + Vite PWA.** A role-agnostic root lazy-loads 4 role apps (client, coach, admin, anonymous). Behind it run **3 Vercel functions**: one tRPC monolith with 42 namespaces and 145 procedures, chunked media upload, and a daily cron. Data lives in **MongoDB**, media on **Bunny CDN**, and email goes through **Resend**.
- **The client app is still the original single-user, local-first tracker.** It keeps one device-wide IndexedDB (`gym-tracker`), uses date-keyed whole-day records and runs a 120 s sync engine, with coach content mirrored in. **The coach and admin apps are online React Query apps** with no persisted cache.
- **The client has three data paths with three freshness models:** an IndexedDB mirror, the sync engine, and memory-only React Query (AR-01). "Realtime" is about 10 independent polling loops. There is no push and no sockets.
- **Client-only systems boot in the shared root for every role.** Bootstrap, 6 IndexedDB stores, reminders and the sync engine all run there, so coach, admin and anonymous sessions pay for them. The coach/admin case can capture client data (AR-02, RM-81 P0).
- **Navigation has three systems per role:** bottom bar, ☰ menu sheet and sidebar/top bar, all defined in `src/config/nav.ts`. The coach client workspace has 11 tabs, plus a second 6-tab "view as client" layout.
- **Measured:** returning-client boot takes 0.35 s / 1.0 s / 1.5 s (fast / Slow-4G / 3G) behind 3 serial network calls (BV-25). An idle client on Today makes about 14 requests/min (BV-29).

## 1. System overview
```
Browser / installed PWA (Workbox SW: 159-entry precache, 2.43 MB)
  └─ index.html → /assets/index-*.js (entry 475 KB raw / 150 KB gz)
       ├─ lazy ClientApp | CoachApp | AdminApp | AnonymousApp (+ website chunk SitePages, not precached)
       └─ IndexedDB "gym-tracker" · localStorage · sessionStorage · Cache Storage
Vercel (static dist + 3 functions)
  ├─ /api/trpc/[trpc].ts          tRPC httpBatchLink: auth, sync, messages, client data, coach, admin …
  ├─ /api/media/[action].ts       upload | init → chunk (4 MiB) → finalize  → Bunny Storage
  └─ /api/cron/daily-maintenance  03:00 UTC (vercel.json:4): expire requests / subscriptions / capacity + emails
External: MongoDB (Atlas) · Bunny Storage + pull-zone CDN (public URLs) · Resend · Google OAuth ·
          wger.de (food-search proxy; exercise images/videos hotlinked) · YouTube embeds · Vercel Analytics
```
Size: `src` ≈ 44k lines excluding the website; `api` ≈ 10.3k lines (non-test). Dev: `vite-plugins/localApi.ts` runs the 3 functions inside `vite dev`.

## 2. Boot sequence and role routing
```
main.tsx: registerSW({immediate, prompt}) → <ErrorBoundary> → <BrowserRouter> → <App>
App.tsx:72-99 (runs for EVERY visitor, before any role routing)
  bootstrapData()                      IDB meta/profile/settings (seed branch dead, RM-02)
  6 store loads                        settings(+applyLocale) · workout · nutrition · cardio · videos · measurements
  habits.refresh() · reminders.load()+start()          full-history scans; 30 s reminder timer
  session.init()  → auth.refresh (raw fetch) → auth.me  [first network call]
  cloud.init()    → SyncEngine for any signed-in account (RM-81)
  initNative() · setupPersistentStorage() → ready
App render (App.tsx:101-127)
  Splash until ready & phase≠loading
  anonymous → AnonymousApp · pending → AccountPending · suspended → AccountSuspended
  client without phone → CompleteAccount · coach → CoachApp · admin/super_admin → AdminApp · else ClientApp
  Root overlays (all roles): ScrollToTop · SiteAnalytics · PresenceTracker · OfflineBanner · DialogHost ·
  ToastHost · ImageViewer · VideoPopup · BannerHost · MustChangePasswordPrompt
ClientApp → ClientGate (ClientApp.tsx:75-182)
  assessment.get (Splash) → AssessmentWizard if not submitted (full-screen, no exit)
  refresh() on mount + visibilitychange + focus: scopeLocalToUser → loadCoachAssignedContent
     (workoutPlan / nutritionPlan / coachTargets / profile → IDB) → reload 6 stores + habits   [runs twice per launch, RM-85]
  <ClientNotesProvider> <Onboarding/> (legacy overlay) <Routes/>
```
- **Offline:** a failed `auth.refresh` at cold start, or a failed `auth.me` on foreground, sets the session to anonymous. HEAD then crashes on the non-precached website chunk (BV-03, BV-04, PWA-01).
- **Startup cost:** BV-25 measured `auth.refresh → auth.me → (banners) → assessment.get` running in series before any content, even though the client data is local.

## 3. Routes

### 3.1 Client (`src/apps/ClientApp.tsx:150-178`): 23 pages + 2 interstitials + catch-all
Shell = `AppShell` (BrandBar · ReminderBanner · SubscriptionBanner · optional DayNav · RestTimerBar · BottomNav). SG = wrapped in `SubscriptionGate`.

| Route | Page | Shell / gate | Reached from |
|---|---|---|---|
| `/` | Home ("Today") | DayNav · SG | bottom nav, menu, `*`, login |
| `/nutrition` | Nutrition ("Fuel") | DayNav · SG | bottom nav, menu, Home row, `targets_updated` |
| `/workout` | Workout ("Routines"/"Train") | SG | centre FAB, menu, Home |
| `/workout/routine/:dayId` | RoutineDetail | SG | **deep link only** (`noteTarget.ts:26-33`) |
| `/workout/session` | WorkoutSession | `hideNav` · SG | Home, Train, History |
| `/workout/library` | ExerciseLibrary | — | menu only (RM-23) |
| `/workout/exercise/:exId` | ExerciseDetail | — | library, Progress PRs, RoutineDetail |
| `/cardio` | Cardio | DayNav · SG | menu, Home row |
| `/progress` (`?tab=weight\|strength\|measure\|photos`, `?wr=`) | Progress | — | bottom nav, menu |
| `/progress/measurements` | Measurements | DayNav | Progress "+ Log", menu, `measurement_added` |
| `/progress/photos` | ProgressPhotos wrapper | — | deep link only (RM-40) |
| `/history` | History | — | Home cards, Progress icon, menu |
| `/messages` | Messages | — | bottom nav "Inbox", menu, coach cards, toasts |
| `/coach-notes` | CoachInbox ("Your coach") | — | menu, Home card, `freeze_decided`, `assessment_reviewed` |
| `/notifications` | Notifications | — | bell only |
| `/check-ins`, `/check-in/:id` | CheckInHistory, CheckIn (4-step wizard) | inside full shell | menu; Home card; `checkin_*` |
| `/assessment` | MyAssessment | — | Settings › Account only |
| `/settings` (`?tab=profile\|preferences\|account`) | Settings | — | menu, Home avatar |
| `/settings/subscription` | ClientSubscriptionPage | — | menu, Settings |
| `/settings/videos`, `/settings/import` | VideoManager, ImportData (legacy, RM-57) | — | Settings › Tools |
| `/settings/app` | redirect → `/settings?tab=preferences` | — | none (RM-40) |
| `/invite/:code`, `/reset/:token` | SignedInInterstitial | none | external links |
| `*` | → `/` | | |

### 3.2 Coach (`src/apps/CoachApp.tsx:78-123`): 33 paths incl. 9 nested
Shell = `ResponsiveShell` + `CoachPlanBanner` (inside `CoachPlanProvider`). G = `CoachPlanGate` (lapsed plan makes editors read-only).
```
/coach                       → redirect: <768px /coach/clients · ≥768px /coach/dashboard
/coach/dashboard             ?tab=overview|clients|engagement|content
/coach/clients               ?new=1 (add sheet) ?q=
/coach/client/:clientId      ← CoachClientWorkspaceLayout (header + 11-tab rail; <1024: 4 tabs + More sheet)
   ├─ (index)                CoachClientDetail ("Overview")
   ├─ assessment · checkins · notes · subscription · history
   └─ workout · nutrition · cardio      (G) editors
/coach/client/:clientId/view[/:tab]     CoachViewLayout "view as client" (6 chips; outside the workspace)
/coach/client/:clientId/versions/:kind  PlanVersionHistory (outside the workspace)
/coach/client/:clientId/activity        CoachClientActivity (orphan, RM-61)
/coach/messages · /coach/messages/:clientId (inbox split at ≥1024; thread page)
/coach/library ?tab=exercises|foods|groups|supplements
/coach/templates · /new (G) · /:id (preview) · /:id/edit (G)
/coach/assessments · /coach/checkins · /coach/adherence · /coach/reports · /coach/revenue
/coach/plan (My Plan = Forma subscription) · /coach/subscription-plans ("Client Plans" = packages)
/coach/notifications · /coach/settings (RoleAccount) · /invite/:code · /reset/:token · * → /coach
```
Workspace tab rule (`CoachClientWorkspaceLayout.tsx:39-59`): tabs `replace` history. "Progress" jumps to `/view/progress` and "Messages" to `/coach/messages/:id`; both unmount the workspace.

### 3.3 Admin (cross-check only; `AdminApp.tsx:48-68`): 16 pages
`/admin` (overview) · `/accounts` · `/members` · `/assignments` (TransferWizard) · `/governance` (flags + role matrix) · `/audit` · `/banners` · `/analytics` · `/clients/:id` · then super-admin only: `/coaches` · `/coaches/:id` · `/plans` (Forma plan · capacity packages · payment requests) · `/subscriptions` · `/media` (all-client image gallery). Plus `/notifications`, `/settings`, interstitials, and `*` → `/admin`.

### 3.4 Anonymous (`AnonymousApp.tsx:51-83`)
`/` → website (standalone PWA → `/login`) · `/contact` · `/terms` · `/privacy` · `/cookies` (website, out of scope) · `/login` and `*` → `SiteAuth` (the login form lives in the non-precached `SitePages` chunk in HEAD, PF-03) · `/invite/:code` (AcceptInvite) · `/reset/:token` · `/landing-v1` (old landing, noindex, RM-62) · `/experience` (three.js, RM-63).

## 4. Navigation definitions (`src/config/nav.ts`)
| Role | Mobile bottom bar | ☰ menu sheet (`NavMenuSheet` from BrandBar) | Desktop (≥768) |
|---|---|---|---|
| Client | `CLIENT_NAV` (5): Today `/` · Fuel `/nutrition` · **Train `/workout` (centre FAB, no visible label)** · Progress · Inbox `/messages` (unread badge) | `CLIENT_MENU`, 4 groups / 13 rows: Daily (Today, Train, Fuel, Cardio, Exercise Library) · Track (Progress, Measurements, History) · Coach (Inbox, Check-Ins, Coach notes) · You (Subscription, Settings) | none (`AppShell` is capped at `max-w-md`) |
| Coach | `COACH_NAV` (4): Dashboard · Clients · Messages · Revenue | `COACH_SIDEBAR`, 5 groups / 13 items: Today (Dashboard, Messages) · Coaching (Clients, Check-ins, Assessments, Adherence) · Content (Templates, Library) · Business (Revenue, Reports, Client Plans) · You (My Plan, Account) | `SidebarNav` (same groups, collapsible, persisted) + `DesktopTopBar` (⌘K search → CommandPalette, SyncStatusIndicator, bell, avatar) |
| Admin / super | `ADMIN_NAV` / `SUPER_ADMIN_NAV` (4) | `ADMIN_SIDEBAR` (4 groups) / `SUPER_ADMIN_SIDEBAR` (5 groups incl. Monetise) | same shell as coach |

Shells:
```
AppShell (client)        BrandBar[logo · bell · ☰] · ReminderBanner(sticky) · <main overflow-x-hidden>
                         SubscriptionBanner · DayNav? · page </main> · RestTimerBar(global) · BottomNav
ResponsiveShell (coach/admin)
                         SidebarNav · [md:hidden BrandBar] · [hidden md:block DesktopTopBar] · ReminderBanner ·
                         <main> page </main> · [md:hidden BottomNav] · WhatsAppFab
                         ⚠ both mobile and desktop chrome stay MOUNTED (CSS-hidden) → 2 bells, 2 pollers (RM-82)
```
- **Back model:** `useBack(fallback)` goes `navigate(-1)` when `history.state.idx>0`, otherwise `replace` to the fallback.
- **Guards:** `navGuardStore` + `useGuardedNav`/`useUnsavedGuard` guard the editors. Plain `navigate`/`<Link>` callers, the browser back button and the OS back button are not guarded. There is no Capacitor back handler.
- **No active tab inside a client:** `/coach/clients` does not match `/coach/client/:id`.

## 5. Tabs
| Where | Items | Mechanism |
|---|---|---|
| Coach client workspace | 11 (desktop) · 4 + More sheet (<1024) | NavLink rail, `replace`; 2 tabs leave the layout |
| Coach "view as client" | 6 chips: activity · nutrition · cardio · measurements · photos · progress | own rail, `replace`, each with its own date state |
| Coach dashboard | overview · clients · engagement · content | `ui/Tabs` + `useTabParam('tab')` |
| Coach library | exercises · foods · groups · supplements | `ui/Tabs` (row likely clipped at 390) |
| Client Progress | weight · strength · measure · photos (+ `?wr=` range) | `.seg` buttons + `useTabParam` |
| Client Settings | profile · preferences · account | `.seg` buttons + `?tab=` |
| Admin Plans | Forma plan · Capacity packages · Payment requests | `ui/Tabs` |

## 6. Sheets, modals and overlays
| Layer | What | Notes |
|---|---|---|
| `Sheet` (`components/Sheet.tsx`) | **55 uses in 38 files**: bottom sheet <md, centred dialog ≥md; role=dialog, focus trap, Esc, scroll lock | No swipe-to-dismiss. Primary buttons usually sit at the end of the body, not in the `footer` slot |
| `DialogHost` + `dialogStore` | `confirmDialog` / `alertDialog` / `confirmDelete`: **126 call sites** | Also used for most errors (raw server text; TS-02) |
| Named sheets | NavMenuSheet · ClientSwitcherSheet · ExercisePickerSheet · ChangePasswordSheet · AvatarCropper · TrainingGuideSheet · VideoPlayerSheet (legacy) · VersionActions · QuickActions | |
| Full-screen overlays | AssessmentWizard · CompleteAccount · AccountPending/Suspended · Onboarding (legacy) · AcceptInvite · ResetPassword · MustChangePasswordPrompt (sheet, re-shown every reload) | No dialog semantics on most |
| Global viewers | `ImageViewer`, `VideoPopup` (z-70) · `CommandPalette` (z-80, coach/admin desktop) | |

Z-ladder: BrandBar z-30 · BottomNav, ReminderBanner, RestTimer z-40 · Sheet z-50 · ToastHost z-55 · DialogHost, OfflineBanner z-60 · ImageViewer, VideoPopup z-70 · CommandPalette z-80.

## 7. Major components (lines)
| Layer | Components |
|---|---|
| Chrome | AppShell · ResponsiveShell · BrandBar · BottomNav · SidebarNav · DesktopTopBar · NavMenuSheet · NotificationBell · DayNav · WeekStrip · banners (Subscription, CoachPlan, Reminder, Offline, BannerHost) · WhatsAppFab · Splash |
| UI kit (`components/ui`, 27 files) | Tabs · DataTable · MobileCardList · Pagination · SplitPane · DetailPanel · PageHeader · MetricCard · DashboardSection · EmptyState · LoadingState/Skeleton · ErrorState · Field · Pill · Switch · SubmitButton · BulkActionBar · RowCheckbox · GlobalSearch · CommandPalette · QuickActions (+5 unused, RM-01) |
| Domain | MessageThread **1338** · PlanBuilder 476 · charts 377 · TransferWizard 279 · ExercisePickerSheet · ExerciseForm · FoodSearchPicker · EntityNotes · CheckInSummary · AssessmentView · ExerciseCard · ClientContextPanel · CoachTimeline · VersionActions · SubscriptionPlanPicker · AvatarPicker |
| Largest pages | Nutrition 823 · CoachExerciseLibrary 633 · AssessmentWizard 630 · Progress 599 · AdminAccounts 585 · CoachClients 576 · WorkoutSession 560 · CoachNutritionEditor 542 · Settings 534 · CoachClientDetail 499 · CoachSubscriptionPanel 479 · Home 404 |
| Types / services | `types/index.ts` 1415 · `services/platform/*` 33 files (one per API area) · `services/trpc.ts` · `platformApi.ts` (token + raw refresh) |

## 8. API surface (`api/_trpc/router.ts`)
**42 namespaces, 145 procedures, one function.** Transport is tRPC `httpBatchLink`: same-tick calls share one request and wait for the slowest (PF-13).

**Auth**
- The access JWT lives in memory and lasts 15 min. The refresh cookie `forma_rt` is httpOnly, lasts 30 days and is rotated on every use.
- A 401 triggers a refresh with no single-flight (PF-10).
- `auth.refresh` is also called through a raw `fetch` (`platformApi.ts:38`).

| Group | Namespaces (procedures) |
|---|---|
| Identity | `auth` (10: signup, login, refresh, logout, me, updateProfile, changePassword, reset ×2, googleSignIn) · `invites` · `transfers` |
| Client data (client writes, coach reads) | `sync` (push, pull, deletionsPush/Pull, singletonGet/Set, wipe) · `logsWorkout/Nutrition/Weight/Cardio/Checklist` · `photos` (read-only views over `syncRecords`) |
| Coach-authored client content | `profile` · `assessment` (get, saveDraft, submit, setCoachNotes, review, reset) · `workoutPlan` · `nutritionPlan` · `cardioPlan` · `planVersions` · `coachNotes` · `coachTargets` · `checkIns` · `measurements` · `subscriptionRequest` |
| Coach workspace | `coachClients` (list, listMyClientUsers, dashboardSummaries, get, assign, end, updateSubscription, transfer) · `coachAssets` (exercises, workoutTemplates, nutritionTemplates, foods, foodGroups, supplements, billingPlans, seedStarterLibrary) · `foodSearch` |
| Messaging | `messages` (list, send, edit, delete, react, markRead, coachThreadsSummary) · `notifications` (list, markRead) |
| Commercial | `coachPlans` (me, createTrial, adminUpdate) · `coachPlanRequests` (8) · `coachPlanTiers` (public, get, save) · `coachCommercial` (11) |
| Admin / platform | `adminUsers` (10) · `adminCoaches` · `adminStats/Members/Growth` · `adminAudit` · `banners` · `flags` · `usage` · `media` (status, listImages) · `health` · `contact` |

Mongo collections (main): `users`, `coachClients`, `syncRecords`/`syncDeletions`/`syncSingletons`, `clientProfiles`, plan docs and `planVersions`, `checkIns`, `measurements`, `messages`, `notifications`, `coachExercises`/foods/groups/supplements/templates/billing plans, `coachPlans`, `coachPlanRequests`, `coachPlanTiers`, capacity packages, `featureFlags`, `adminAuditLogs`, `mediaUploadChunks` (TTL 1 h), invites, transfer requests, banners.

## 9. Query hooks and mutations
| Measure | Value |
|---|---|
| `useQuery` / `useInfiniteQuery` | 136 / 3 (≈140 call sites in 82 files) |
| `useMutation` / `invalidateQueries` | 97 / 119 · **0 `onMutate`, 0 `setQueryData`, 0 `placeholderData`**: every save is write → refetch (PF-12) |
| Defaults (`queryClient.ts:8-27`) | staleTime 60 s · gcTime 10 min · retry 1 · refetchOnWindowFocus · **no persistence**; cleared on sign-out |

| Key queries (key → where) | Notes |
|---|---|
| `['assessment', uid]` → ClientGate, Settings, Progress | gates the client app |
| `['mySubscription', uid]` → `useSubscription` | drives the gate, banner and read-only flag |
| `['activeCheckIn']` → Home | staleTime 0, **polls 60 s**, fetches the full history |
| `['coachNotes']` + `['myCoachNotes']`, `['myCoachTargets']`, `['myCoach']` | same data under two keys (RM-84) |
| `['coachDashboard', coachId]` → Dashboard, Reports, Revenue, Clients, Switcher | composite of 6 procedures; staleTime 300/60/300 s |
| `['coachPlan', coachId]` → CoachPlanProvider (+3 direct copies) | capacity and plan state |
| `['exerciseLibrary', coachId]` → library, picker | **835 KB** unprojected (PF-11) |
| `['clientDay', id, date]` → CoachViewNutrition | **polls 15 s**, 5 procedures |

Custom hooks: `useSubscription`, `useAssessmentStatus`, `useActiveCheckIn`, `useCoachContent`, `useNotifications`, `useClient/CoachMessageUnread`, `useCoachClientHeader` (5 queries), `useBack`, `useGuardedNav`, `useUnsavedGuard`, `useOnlineStatus`, `useMediaQuery`, `useFullBleed`, `usePagination`, `useInfiniteScroll`, `useSelection`, `useWakeLock`, `useElapsed`, `useVoiceRecorder`, `useLocalized`.

## 10. Stores (Zustand, 24)
| Store | Holds | Backing |
|---|---|---|
| `useSession` | phase, uid, account | memory (restored by refresh cookie) |
| `useCloud` | sync user, syncing, lastSync, error | memory; runs SyncEngine (all roles) |
| `useWorkout` · `useNutrition` · `useCardio` · `useMeasurements` · `usePhotos` · `useSettings` · `useHabits` · `useVideos` · `useReminders` | client tracker state | **IndexedDB** (`getDataSource()`); loaded at boot for every role |
| `useDay` | the **global selected day** for day-scoped logging | memory (set by DayNav, WeekStrip, History, notifications) |
| `useTimer` · cardio `liveStart` | rest timer, live cardio | **memory only**; lost on reload (PWA-07) |
| `useCoachContentSync` | coach-content mirror status / retry | memory |
| `useDialog` · `useToasts` · `useImageViewer` · `useVideoPopup` · `useCommandStore` · `useFocus` · `useLayoutStore` · `useNavGuard` | UI services | memory |
| `useSidebarStore` | sidebar collapsed | localStorage (`persist`) |
| `useUploadConfig` (mediaApi) | media upload availability | memory |
| `subscriptionGate.ts` | read-only flag read by workout/nutrition stores | module variable |

## 11. Browser storage
| Store | Contents |
|---|---|
| **IndexedDB `gym-tracker`** (localforage, one DB per device) | `profile`, `settings`, `workoutPlans`, `workoutLogs`, `mealPlans`, `nutritionLogs`, `cardioLogs`, `weightLogs`, `measurementLogs`, `videoAssets` (legacy), `progressPhotos`, `dailyChecklists`, `reminders` · `blobs` (photo originals, videos) · `deletions` (tombstones) · `meta` (`seedVersion`, `localOwnerUid`, `pullCursorV3:<uid>:<coll>`, editor drafts `workoutDraft:<clientId>` etc., `assessmentDraft:<uid>`) |
| Instances | `LocalRepository`, `blobStore`, `bootstrap`, `SyncEngine`, `tombstones`, `clientSync`, 4 coach editors, `AssessmentWizard` |
| Scoping | Device-wide. On a different uid, `scopeLocalToUser` wipes the repos but **not** `blobs`, `deletions` or V3 cursors. Coach and admin never scope (PWA-02/03/05). Nothing is cleared on logout |
| localStorage | `forma.sidebarCollapsed`, `forma.micPrimed`, `forma:active:<date>` (presence, one key per day forever) |
| sessionStorage | `forma:chunk-reload-attempted` (cleared 10 s after render), `forma:dismissedBanners` |
| Cookie / memory | `forma_rt` refresh cookie (30 d) · access token (memory, 15 min) |
| Cache Storage | Workbox precache + 7 runtime caches (§13) |

## 12. Service worker, PWA registration, update and version behaviour
| Item | Current |
|---|---|
| Plugin | vite-plugin-pwa 0.21 `generateSW` (Workbox 7.4): `registerType:'prompt'`, `injectRegister:false`, `clientsClaim:true`, `skipWaiting:false`, `cleanupOutdatedCaches` (`vite.config.ts:27-168`) |
| Registration | `main.tsx:17-45`. `registerSW({immediate:true})`. Checks with `registration.update()` every **60 s** and on every visible event (online only) |
| Precache | 159 entries, **2.43 MB**. Includes `/experience/*.png` + CSS (614 KB, RM-72) and the `ar`/`ar-eg` chunks. Excludes `landing_page/**`, `Experience-*.js`, `website/**`, **`SitePages-*` (the login form in HEAD)** |
| Navigation | `NavigationRoute → /index.html` (denylist `/api/`), so the SW always serves the precached shell |
| Manifest | standalone, portrait, `start_url /`; shortcuts "Dashboard" → `/coach`, "Today" → `/workout` (RM-79); screenshots taken from `landing_page/` |
| Push | **none** (no PushManager, no `push`/`notificationclick` handler) |

Update flow as built:
```
deploy → running tab keeps old precached shell → soft update / 60 s check → new SW installs (background download)
→ waiting (skipWaiting:false) → onNeedRefresh → defer until document.visibilityState === 'hidden'
→ updateSW(true): SKIP_WAITING → activate (old precache deleted) → clientsClaim → every tab's 'controlling' listener reloads
```
- **BV-06 (a):** after a deploy, the old build runs for the whole foreground session, and the new one appears only after the first backgrounding.
- **BV-06 (b):** there is no "update available" UI.
- **BV-06 (c):** mid-workout the reload happened while hidden. The logged workout survived; in-memory timers did not.
- **BV-06 (d):** a tab that was not SW-controlled at load gets the new SW but never reloads, so it runs old JS under the new SW.
- **Version contract:** none. There is no build header and no skew protection, so old JS can talk to the new API indefinitely (PWA-17).
- **Safety nets:** the `ErrorBoundary` stale-chunk reload runs once per session. The client-only "Update the app" button unregisters the SW and wipes all caches.

## 13. Caching layers
| # | Layer | Policy |
|---|---|---|
| L1 | HTTP (`vercel.json`) | `/(.*)` no-store (covers HTML, `/data`, icons, `/website`); `/assets/*` immutable 1 y; `sw.js` and `workbox-*` no-store; `/exercise_videos/*` 1 d. Missing `/assets/*` is answered with index.html (SPA rewrite) |
| L2 | Vercel edge | per-deploy static files |
| L3 | Bunny CDN | public, random-path URLs; no token auth; **no deletion path** |
| L4 | SW precache | §12 (the shell; source of the old-version-after-deploy effect) |
| L5 | SW runtime | `landing-images`, `website-images` (SWR) · `exercise-videos` (CacheFirst, legacy) · `google-fonts-*` · `exercise-images` (raw.githubusercontent, **stale**) · `app-data` `/data/*` (**idle**: no client fetch). None for wger.de or Bunny |
| L6 | React Query | memory only (§9); refetch-on-focus when stale |
| L7 | Custom pollers | §14 |
| L8 | Zustand | memory; tracker stores reloaded from IDB on boot and on every client focus |
| L9 | IndexedDB | §11; the client's local truth; drafts |
| L10 | Cookie / token | §11 |

## 14. Refetch and polling policies
| Loop | Interval | Where / who |
|---|---|---|
| Message thread `subscribeMessages` | **5 s** (full 200-message window every 4th tick) | open thread; `markRead` sent ×2 per tick while unseen (PF-08) |
| Client unread `subscribeThreadMeta` | 20 s, **not multiplexed** | BottomNav **and** the closed NavMenuSheet: 2 loops |
| Coach unread `coachThreadsSummary` | 20 s, multiplexed | aggregation over all messages of all clients (PF-14) |
| Notifications `pollFeed` | 25 s (full every 4th) | each NotificationBell (coach desktop: 2) + `/notifications` page |
| SyncEngine | 120 s visible + on focus (60 s throttle) + forced on `online` | **all roles**; ≥11 serial calls + 8 full IDB scans per pass |
| `useActiveCheckIn` / `CoachPlanBanner` / `CoachPlan` / `PaymentRequestsTab` | 60 s | client Home / every coach page / My Plan / admin |
| `CoachViewNutrition` | **15 s** (5 procedures) | coach "view as client" nutrition |
| SW update check | 60 s + visible | all |
| Reminders | 30 s (local) | started for all roles |
| ClientGate refresh | every focus **and** visibilitychange | 4 reads + 6 IDB reloads + streaks |

Measured idle (BV-29):
- **Client on Today: 14 req/min.** `messages.list` runs 6×/min from the two 20 s loops; `sync.pull` 4×/min; notifications 2.5×/min; `checkIns.list` 1×/min.
- **Client in a thread: 21 req/min.**
- **Resume** (hidden → visible + focus) fires about 11 procedures.
- **Coach boot** also runs the client sync engine (BV-25).

## 15. Offline behaviour (summary; detail in 11_PWA)
| Capability | Today |
|---|---|
| Stay signed in offline | **Fails.** Resume or cold start offline goes anonymous; HEAD then crashes (BV-03, BV-04) |
| View plan, log sets/meals/cardio/weight/measurements/photos | Works while the in-memory session lives. Writes go to IDB first, marked `dirty`, and the sync engine pushes them later. A workout finished offline synced about 1.4 s after the next online boot (BV-05) |
| Check-in submit, messages, voice, attachments | Online only. Pending messages live in component state and are lost on navigation or reload |
| Coach-authored widgets (cardio plan, notes, check-ins, subscription) | Not mirrored, so they are missing offline |
| Coach and admin screens | Memory-only React Query; editors offline start from an **empty plan** (BV-11 P0); mutations pause and are lost on reload |
| Exercise videos | Streamed from wger, Bunny or YouTube; no offline path |
| Sync indicator | "Synced" while changes are pending (BV-05) |

## 16. Notification system (detail in 10_NOTIFICATIONS)
```
server action ──► notifications (Mongo; fields: clientId, forRole, type, body, screen/date/entity anchor, route, seenAt)
   writers: createNotification (best-effort, messages) · client/_lib/notify.ts (awaited, NOT caught: NT-15)
client ──poll 25 s──► notifications.list (newest 50 / since cursor) ──► NotificationBell
   ├─ badge = unseen among newest 50 (server unreadCount ignored)
   ├─ toasts for "fresh" items (high-water mark starts at [] → backlog replays on every cold open: BV-01, NT-01)
   │     toast build calls clientNoteRoute() → sets the GLOBAL selected day (BV-02, NT-02)
   └─ /notifications page (paged 15); seenAt set only by tapping that toast/row or opening the thread
```
- **Types:** 9 of 18 front-end types are ever produced (`plan_assigned`, `subscription_updated` and `trial_expiring` never are; RM-68).
- **Lifecycle gaps:** no coalescing, no mark-all in the UI, no resolve-on-done, no retention (NT-16).
- **Other channels:**
  - Banners: `BannerHost` (admin promos at the app root, on every route; dismissals in sessionStorage), `CoachPlanBanner`, `SubscriptionBanner`, `ReminderBanner`, `OfflineBanner`, WhatsApp FAB.
  - Local reminders: client-only concept, started for all roles, titled "Gym Tracker".
  - Email (Resend): account and billing only, fire-and-forget without `waitUntil`.
  - Web Push: none.

## 17. Toast system
`toastStore` (Zustand; dedupe `Set` for the page lifetime; keeps the last 4) + `ToastHost` (fixed top, z-55, 5 s auto-dismiss, no pause; a clickable `div`). **About 68 call sites, all success or info.** Errors go to blocking `alertDialog` modals, often with raw server text (TS-02). Four stacked toasts cover the top ~300 px of a phone (BV-01, TS-01).

## 18. Messaging (detail in 09_MESSENGER)
| Part | Current |
|---|---|
| API | `messages.list/send/edit/delete/react/markRead/coachThreadsSummary`; idempotent `clientMsgId`; broadcast = **N client-side sends** (`messagesApi.ts:291`) |
| Client | `/messages` → `MessageThread` (1,338 lines: pending/failed/retry, long-press menu, reactions, edit/delete window, load-older, attachments, voice). Height measured to fill above the nav (cf3a5d9 fix) |
| Coach | `/coach/messages` inbox lists **every client** (split view ≥1024, selection not in the URL) + `/coach/messages/:id` page with a fixed `h-[calc(100dvh-8.5rem)]`, so the composer hides under the nav when a banner shows (BV-14, P0) |
| Freshness | thread 5 s, badges 20 s, no sockets or push; pending queue in component memory (lost on reload) |
| Media | attachments and voice notes go through §19; **currently failing in production (Bunny 401)** |

## 19. Media pipeline (detail in 12_MEDIA)
```
client: pick/capture → downscale (photos 1600 px WebP; avatar 512 px; video/voice raw)
  → /api/media  upload (small) | init → chunk (4 MiB, staged in Mongo mediaUploadChunks, TTL 1 h) → finalize
  → Bunny Storage  Forma/{uid}/{avatar|progress|assessment|checkin/<id>|messages}/rand.ext · Forma/{coachId}/exercises/…
  → public pull-zone URL stored in the document (photoUrl, cdnUrl, attachment, videoUrl, check-in photos)
```
- **Progress photos:** the original blob is stored first in IDB `blobs`, with a best-effort upload and a retry on the next `load()`. A failure is silent ("Saved" is shown).
- **Limits:** video ≤50 MB, file ≤25 MB, voice ≤5 min / 10 MB. No transcoding, no thumbnails.
- **Exposure:** every URL is public and permanent, and **no delete call exists**.
- **Admin:** a super-admin gallery lists all client images (`media.listImages`).

## 20. Exercise library (detail in 07_EXERCISE_LIBRARY)
```
public/data/exercise-library.json (909 wger.de items, 1.07 MB; server-side only)
  └─ coachAssets.seedStarterLibrary ("Load starter library") copies into the coach's collections:
       909 exercises (46 with video, 273 with image) + 84 foods + 10 food groups + 10 supplements + 9 templates (BV-10)
coach library CRUD (coachAssets.exercises: list = 835 KB unprojected, refetched on every change)
  → templates (workoutTemplates; library→template sync via exerciseSync.ts)
  → client plan = SNAPSHOT (workoutPlan.save; library edits never reach assigned plans: EX-05)
client: sees exercises only inside its plan; no images (BV-17); video tap only works with a coach videoUrl (BV-07)
```
Media is hotlinked from wger.de, and 35 of the 46 videos are HEVC. Coach uploads go to Bunny. The legacy local `videoAssets` fallback is dead (RM-57).

## 21. Food library (detail in 08_FOOD_LIBRARY)
Coach collections: `foods` (84 starter, bilingual), `foodGroups` (approved-swap groups), `supplements`, `nutritionTemplates` (API exists, **no UI**). External search: `foodSearch.search` proxies wger ingredients by exact name, with no rate limit. Plans store food snapshots. Client swaps are limited by the coach's substitution policy; "flag for review" has no review flow (RM-67). There are no food images anywhere, and editing a food copies the English name over the Arabic one (FD-01).

## 22. Workout, nutrition and progress flows
```
COACH                                   SERVER                         CLIENT DEVICE
PlanBuilder (day → section → exercise)  workoutPlan.save (full replace;  ClientGate refresh → loadCoachAssignedContent
Nutrition / Cardio editors            → versions only on "Save as new  → IDB workoutPlans / mealPlans
 (IDB drafts per client)                 version": CO-11)                 + settings.targets (meal macros + coachTargets)
                                                                        Train / Fuel / Cardio / Progress read the stores
                                                                        logs: workoutLogs, nutritionLogs, weightLogs,
                                                                          measurementLogs (id = DATE, whole-day docs),
                                                                          cardioLogs, progressPhotos (uid ids), dailyChecklists
                                        sync.push / pull ◄──────────── SyncEngine (dirty → push; LWW by device clock;
                                        syncRecords (by clientId)          tombstones; 120 s / focus / online)
View-as-client, Overview, dashboard ◄── logs*, coachClients.dashboardSummaries, photos (read syncRecords)
```
- **Workout session:** `/workout/session` holds one log per date. Starting on a date that already has a finished log reopens that log. Writes are debounced (300 ms) to IDB. The rest timer lives in memory. The "selected day" is a hidden global (`useDay`) set by DayNav, WeekStrip, History and notifications (BV-02).
- **Nutrition:** meals are ticked and food is swapped within the coach policy. Custom foods and water are logged per date. Read-only gating comes from `subscriptionGate`.
- **Progress:** weight (`/progress` sheet, logs today), measurements (own route, selected day), photos (IDB blob + CDN), and habits/streaks derived from the logs. Check-in weight and photos do **not** feed Progress.

## 23. Check-ins
`checkIns.request` (coach) → `checkin_requested` → client wizard `/check-in/:weekStart` (4 steps, inside the tab shell; CTA under the nav, BV-15) → `checkIns.submit` (not idempotent) → `checkin_submitted` → coach per-client tab (`CoachCheckIns`) or the overview queue (`CoachCheckInsOverview`, sequential review) → `checkIns.review` (feedback) → `checkin_reviewed`. The client Home card polls `checkIns.list` (full history) every 60 s. Two review UIs exist (RM-19).

## 24. Assessments
Gate: `useAssessmentStatus` → the full-screen `AssessmentWizard` (8 steps, no exit, local draft `assessmentDraft:<uid>` in IDB, photos → Bunny `assessment/`) blocks the client app until `assessment.submit`. Submit writes the answers plus the derived `clientProfiles.profile` and the user's displayName, then sends `assessment_submitted` to the coach. The coach uses the workspace tab (`CoachClientAssessment`: review, reset, "coach notes"), which **the client sees as "Coach feedback"** (BV-12), or the `/coach/assessments` list. `assessment_reviewed` takes the client to `/coach-notes`, but the review is shown on `/assessment`.

## 25. Subscriptions
**A. Client coaching subscription** (coach ⇄ client relationship doc `coachClients.subscription` + `subscriptionHistory`)
```
coach: CoachSubscriptionPanel → coachClients.updateSubscription (Set term / Renew / Extend +30d / Set price / Freeze / End / Cancel: BV-35)
       packages = coachAssets.billingPlans ("Client Plans") via SubscriptionPlanPicker; invite claim builds the first term
client: subscriptionRequest.submit/cancel (freeze request) → coach decide → freeze_decided → /coach-notes
client gate: useSubscription → effectiveSubscriptionStatus → access full | limited (pending/none: SubscriptionGate screen)
             | readonly (frozen/expired/cancelled/ended: SubscriptionBanner + subscriptionGate blocks workout/nutrition logging)
             failed read → full (fail-open); server does NOT enforce on sync.*
```
**B. Coach's own Forma subscription** (single product: Trial → monthly; capacity add-ons)
```
coachPlans.me (phase trial|forma, state, base/addon/manual capacity, activeClientCount)
coachPlanRequests (subscription / capacity requests → super-admin confirm/reject within a deadline; emails)
coachCommercial (capacity packages, entitlements, manual adjustments, renew) · coachPlanTiers (Forma config: price, trial, base clients)
UI: CoachPlanProvider/Gate (lapsed → read-only editors) · CoachPlanBanner (60 s) · CoachTrialBanner (legacy plan.plan) ·
    /coach/plan · ClientCapBlocked · capacity strip/card · admin Plans/Subscriptions/CoachDetail
server: capacity enforced at assign/claim (reserveClientSlot); cron 03:00 expires requests, trials/terms and capacity
```

## 26. Coach business / revenue
`getCoachDashboard` (`coachDashboardApi.ts`) is a **client-side composite of 6 procedures**: listMyClientUsers, dashboardSummaries, coachClients.list, workoutTemplates.list, nutritionTemplates.list, coachThreadsSummary. From these it derives: revenueThisMonth (collected + due, summed in the last seen currency), lapsed, subscription mix, renewals, retention/churn (over all relationships ever), needsAttention, adherence %. It feeds Dashboard (300 s), Reports (60 s; CSV via `lib/csv.ts`), Revenue (300 s), Clients and the client switcher. "Collected" means manually entered term prices; no payment records exist (CO-15).

## 27. Admin (cross-check only)
Same `ResponsiveShell`, with a role-specific nav (super-admin adds Coaches, Plans, Subscriptions and Media). Data comes from `adminUsers`, `adminCoaches`, `adminStats/Members/Growth`, `usage`, `adminAudit`, `banners`, `flags` (written, never read: RM-66), `coachPlanRequests` (60 s poll in PaymentRequestsTab) and `media.listImages`. Admin and super-admin sessions also run the client sync engine (RM-81).

## 28. Architecture findings
Area symptoms are owned by the other docs: PWA (11), PF (13), NT/TS (10), MS (09), EX (07), FD (08), CO (03). Only the two structural causes that cut across areas are raised here.

### AR-01 — The client has three data paths with three freshness and offline models
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client app (every screen) and the coach's views of client data.
- **Evidence:**
  - Plans and targets are mirrored into IndexedDB by `clientSync.ts:57-124` on every focus (`ClientApp.tsx:81-130`).
  - Logs go through the SyncEngine (120 s; whole-day docs; device-clock LWW).
  - Check-ins, notes, subscription, cardio plan and messages are memory-only React Query or custom pollers (`queryClient.ts:8-27`).
  - The profile lives in 3 places (RM-83, PWA-19).
  - Browser evidence: resume fires about 11 procedures (BV-29); "Synced" shows while changes are pending (BV-05).
- **Expected vs actual:** Expected: one client data layer where each entity declares its policy (mirrored and synced, cached, or online-only) and one shared pending/synced state. Actual: three mechanisms with separate triggers and a different offline behaviour per widget.
- **Why it matters:** it produces the resume storm, false-empty offline screens and coach content missing in the gym. It also creates the conditions for the P0 account-switch losses (PWA-02, PWA-03, PWA-05).
- **Direction:** a per-user local store with an outbox (see 11_PWA). Declare a sync policy per entity, persist the query cache for server-authored data, and use one pending/synced/failed status model.
- **Verified:** CODE-CONFIRMED (+ BV-05, BV-29)

### AR-02 — The role-agnostic root boots client-only systems for every role
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** all roles and anonymous visitors · `App.tsx:72-99` · entry chunk.
- **Evidence:**
  - `bootstrapData`, 6 IndexedDB store loads, habits, reminders and `useCloud.init()` run before session and role routing.
  - The entry chunk (475 KB raw / 150 KB gz) carries the client stores, seed data, reminders, Capacitor and en.json (PF-17, PF-30, dist inspection).
  - The coach boot runs `sync.*` (BV-25).
  - `ResponsiveShell` mounts the client `ReminderBanner` for coach and admin.
- **Expected vs actual:** Expected: the root resolves identity, then each role app owns its subsystems. Actual: website visitors, coaches and admins pay for the client boot (IndexedDB scans before the first network call), and coach/admin sessions run the client sync engine (P0 data capture, RM-81 / PWA-04).
- **Why it matters:** slower first paint for every non-client, wasted requests, and a data-integrity hole on shared devices.
- **Direction:** keep the root thin (session plus global overlays). Move the tracker, sync, reminders and native init into ClientApp. The server should reject `sync.*` for non-client roles. Split client-only code out of the entry chunk.
- **Verified:** BROWSER-VERIFIED (BV-25) + CODE-CONFIRMED

| ID | Title | P | Effort | Impact | Action | Area | Verified | Doc |
|---|---|---|---|---|---|---|---|---|
| AR-01 | Client has three data paths with three freshness/offline models | P1 | L | HIGH | REBUILD | Architecture | CODE-CONFIRMED | 01_CURRENT_ARCHITECTURE.md |
| AR-02 | Role-agnostic root boots client-only systems for every role | P1 | M | HIGH | REBUILD | Architecture | BROWSER-VERIFIED | 01_CURRENT_ARCHITECTURE.md |

## Method
- Read every role app, `src/config/nav.ts`, the shells, stores, hooks and services.
- Import graph and route↔link matrix over `src/ api/` (TypeScript compiler API).
- tRPC namespace and procedure inventory, and HEAD `dist/` inspection (`sw.js` precache, entry chunk).
- Storage, caching and polling facts cross-checked with the PWA and performance audits (11, 13) and the measured BV-25 and BV-29.
- Counts are from HEAD `e7663ab`. Production (RC2 `cf3a5d9`) differs mainly in the login chunk (precached in RC2).
