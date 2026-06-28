# Architecture Refactor Audit (Phase 0)

Baseline audit for the role-separation / code-splitting / offline / design-system pass. Records the current
structure, the **boundary contract** the refactor enforces, the offline map, and what's already done vs remaining.

## 1. Entry points & role routing

- `src/main.tsx` → `BrowserRouter` + manual PWA SW registration (deferred reload).
- `src/App.tsx` — the role/phase switch. `phase` (loading/anonymous/pending/suspended/complete) + `role`
  (client/coach/admin/super_admin). **Already lazy:** `CoachApp`, `AdminApp`, `AnonymousApp` via `React.lazy`.
  `ClientApp` is currently **eager** (bundled into the entry chunk). Global wrappers for all roles: `ScrollToTop`,
  `DialogHost`, `ImageViewer`, `VideoPopup`, `MustChangePasswordPrompt`, Suspense fallback `<Splash/>`.
- Shells: `ClientApp` → `AppShell` (mobile-first); `CoachApp`/`AdminApp` → `ResponsiveShell` (sidebar+topbar on
  `md+`, BrandBar+BottomNav below). Coach adds `CoachPlanProvider`/`CoachPlanGate`/`CoachPlanBanner` + `CommandHost`.

## 2. Boundary contract (enforced by `scripts/check-boundaries.mjs`)

Every component lives in exactly one bucket, by folder. Allowed import directions:

```
        ┌─────────────────────────────────────────────┐
        │  services · hooks · stores · types · lib ·    │  ← any UI bucket may import these
        │  i18n · config   (role-agnostic, no UI)       │
        └─────────────────────────────────────────────┘
                         ▲      ▲      ▲
        ┌─────────┐   ┌──┴──┐ ┌─┴───┐ ┌┴────┐
        │ shared  │◀──│client│ │coach│ │admin│     shared ← (client|coach|admin)   [allowed]
        │ ui·shell│   └──────┘ └─────┘ └─────┘     shared → role bucket            [FORBIDDEN]
        └─────────┘                                client ↔ coach/admin            [FORBIDDEN]
```

- `coach/**` & `admin/**` must NOT import `client/**`. `client/**` must NOT import `coach/**`/`admin/**`.
- `shared/**` (+ `ui`, `shell`) must NOT import any role bucket. All buckets may import shared + non-UI modules.
- `BrandBar` / `BottomNav` are shared mobile chrome (used by both `AppShell` and `ResponsiveShell`).

## 3. Component classification (target buckets)

| Bucket | Components |
|---|---|
| **client** (mobile-only) | AppShell, DayNav, ExerciseCard, CoachCard, CoachInfoCard, Onboarding, SubscriptionGate, SubscriptionBanner, ClientNotesProvider, RestTimerBar, SyncStatusBadge, TrainingGuideSheet, WaitingForCoach, NumberStepper, Slider, TagInput, VideoPlayerSheet |
| **coach** | CoachPlanProvider/Gate, CoachPlanBanner, CoachDayNav, VersionActions, IncomingTransferRequests, PlanBuilder, ExerciseForm, ExerciseView, ExercisePickerSheet, SubscriptionHistory, ClientSubscriptionSection. Cross-role (Admin reuses): CoachTimeline, TransferWizard, ClientActivityView |
| **admin** | (none yet — Admin composes shared + cross-role coach views) |
| **shared** | Avatar, Sheet/ResponsiveDialog, Icon, TopBar, MessageThread, AssessmentView, CheckInSummary, MeasurementForm, ProgressRing, PosePhotoPicker, AvatarPicker, EntityNotes, ReminderBanner, NotificationBell, ImageViewer, VideoPopup, DialogHost, Splash, ScrollToTop, MustChangePasswordPrompt, ChangePasswordSheet, BrandBar, BottomNav, NavMenuSheet, OfflineBanner(new) |
| **shared/ui** | DataTable, Field(+TextInput/Select/TextArea/Search), Tabs, MetricCard, EmptyState, LoadingState, ErrorState, Skeleton, Pagination, BulkActionBar, RowCheckbox, DetailPanel, ResponsiveGrid, MobileCardList, PageHeader, DashboardSection, DashboardCard, GlobalSearch, CommandPalette, Page, charts, PermissionState(new), OfflineState(new) |
| **shared/shell** (coach+admin) | ResponsiveShell, SidebarNav, DesktopTopBar |

Pages are already role-split: `pages/` (client) · `pages/coach/` · `pages/admin/` · `pages/auth/` · `pages/marketing/`.
`services` / `stores` / `types` / `lib` / `i18n` / `config` / `hooks` are role-agnostic and UI-free (verified).

## 4. Offline / cache / sync map

- **PWA** (`vite.config.ts`): workbox runtime caching for exercise videos (CacheFirst+range), images, fonts,
  `/data` bundles (SWR). `manualChunks`: firebase / react-vendor / query / i18n / vendor.
- **Client = offline-first**: localforage stores (profile, plans, logs, measurements, photos, reminders, meta,
  deletions, blobs); dirty-flag writes; `SyncEngine` (push dirty → pull since watermark, last-write-wins,
  tombstones); auto-sync on sign-in / `online` event / foreground / 120s (`cloudStore.ts`).
- **Coach/Admin = online React Query**, ephemeral, `staleTime 60s`, `refetchOnWindowFocus:false` (`queryClient.ts`).
- **Existing offline UI**: `SyncStatusBadge` (client settings). **Missing**: a centralized `useOnlineStatus`,
  a global `OfflineBanner`, a coach/admin `SyncStatusIndicator`, and offline-gating of coach/admin mutations.
- **Heaviness**: client first-paint does `getAll()` scans + seed parse + (if configured) Firestore's own
  persistent cache. Coach/Admin are already light. → Keep the engine; add only the UX/safety layer.

## 5. Already done (prior passes) vs remaining

**Done:** lazy Coach/Admin/Anonymous apps; role-split pages; responsive `Sheet`/`ResponsiveDialog` (sizes,
centered desktop, single back, RTL chevron); `Field` primitives; `max-w-screen-2xl` shell cap; Add-Existing
duplicate-back fix; RTL chevrons; client offline sync engine; light coach/admin React Query.

**Remaining (this pass):** `useOnlineStatus` + `OfflineBanner` + `SyncStatusIndicator` + offline mutation gating;
lazy `ClientApp` + lazy heavy coach/admin route pages; `fullBleed` opt-in; persistent labels on remaining
coach/admin forms; component regrouping into buckets + boundary guard; design-system tokens + docs + standard
states (`PermissionState`/`OfflineState`) + Icon variants; feature docs; tests; final report.

## 6. Baseline bundle sizes (raw, pre-refactor — for the Phase 8 comparison)

| Chunk | Raw KB |
|---|---|
| `index` (entry **incl. eager ClientApp** + App shell) | 452.1 |
| `firebase` | 574.4 |
| `CoachApp` (lazy) | 209.6 |
| `react-vendor` | 154.1 |
| `AdminApp` (lazy) | 71.0 |
| `vendor` | 58.6 |
| `useSelection` (shared chunk) | 58.0 |
| `i18n` | 48.2 |
| `query` | 45.6 |
| `AnonymousApp` (lazy) | 25.8 |

Initial-load JS for a Client today ≈ `index` + `react-vendor` + `query` + `i18n` + `firebase` (firebase loads on
auth). Target after Phase 2: `ClientApp` splits out of `index`; heavy coach/admin pages split out of `CoachApp`/`AdminApp`.
