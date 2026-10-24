# B1 — Foundation specification

> **What this is.** The contracts B2 (client), B3 (coach) and B4 (content/media) build on. Every rule here exists in code today and points at its source of truth. Where a screen hasn't migrated yet, §24 says what replaces what.
>
> **Status:** 2026-10-08 · Phase B1 · companion docs: `B1_P1_TRIAGE.md`, `B1_IMPLEMENTATION_LOG.md`, `B1_CERTIFICATION_REPORT.md`.
>
> **Rule of precedence:** B0 safety guarantees win over anything below (offline boot, per-user IndexedDB, pending isolation, role-gated sync, conflict detection, update-ready deferral, truthful upload states).

---

## 1. Design tokens

- **Source:** `src/styles/tokens.css`. It is imported first by `src/index.css` and exposed to Tailwind as the `ui-*` namespace in `tailwind.config.ts`.
- **One value, three readers.** Every token is a CSS custom property, so Tailwind classes (`bg-ui-surface`), component CSS and inline styles read the same number.
- **Colours are RGB channels** (`--ui-accent: 255 139 2`), so Tailwind alpha works: `bg-ui-accent/15`.

| Group | Tokens |
|---|---|
| Surfaces | `--ui-bg` #0C0A09 · `--ui-surface` #141110 · `--ui-surface-raised` #1B1714 · `--ui-surface-interactive` #241E1A |
| Hairlines (website tiers) | `--ui-border-subtle` .09 · `--ui-border` .14 · `--ui-border-strong` .22 (warm white) |
| Text | `--ui-text-primary` #F8F4F1 · `--ui-text-secondary` #ABA19B · `--ui-text-muted` #948A83 (floor, ≥ 4.5:1) |
| Accent | `--ui-accent` #FF8B02 · `-hover` #FFB208 (also accent text) · `-pressed` #FF4C01 · `-ink` #1A0E05 · `--ui-accent-gradient` |
| Status | `--ui-success` · `--ui-warning` · `--ui-error` · `--ui-info` |
| Sync states | `--ui-offline` (cool neutral — offline is not an error) · `--ui-syncing` (= info) · `--ui-conflict` (= warning) |
| Focus | `--ui-focus-ring` (amber); global rule `outline: 2px solid rgb(var(--ui-focus-ring)); outline-offset: 2px` |

- **Legacy palette.** `surface`, `brand`, `earth`, `line` and the rest keep rendering existing screens until they migrate (§24). New components use `ui-*` only.

## 2. Typography

There is one class per role. Never combine size, weight and tracking utilities by hand for text that has a role.

| Role | Size / line-height / weight | Use |
|---|---|---|
| `.t-display` | 32 / 1.1 / 700, −0.02em, balance | One per screen at most — hero numbers or greetings |
| `.t-title-lg` | 24 / 1.2 / 650 | Page title on desktop |
| `.t-title` | 20 / 1.25 / 600 | Page / sheet title |
| `.t-heading` | 17 / 1.3 / 600 | Section heading |
| `.t-body` | 15 / 1.5 | Body copy |
| `.t-body-sm` | 13 / 1.45 | Secondary copy |
| `.t-label` | 13 / 1.3 / 500 | Field labels, list-row titles |
| `.t-caption` | **12** / 1.4 | **The floor for meaningful text (VS-04)** |
| `.t-tag` | 12 mono, 0.06em, uppercase | Eyebrows, short tags — the brand's mono signature, Latin only |
| `.t-numeric` | mono, tabular figures | Numbers that are read and compared (sets, weights, prices, timers) |

- **Families:** Latin is Poppins; mono is DM Mono.
- **Size floor:** nothing meaningful renders under 12 px. The 10–11 px legacy pills, nav labels and chart labels are listed in §24.

## 3. Arabic typography

- **Face:** IBM Plex Sans Arabic, with Cairo as fallback (the website's face). `html[dir=rtl] body` uses `font-arabic`.
- **Part of every role.** The Arabic path is built into each role (`:lang(ar) .t-*`): Arabic face, `letter-spacing: 0` and `text-transform: none`. Line heights are taller: display/title-lg 1.35, title/heading/label 1.45, body/caption 1.7. `.t-tag` becomes 13 px / 600 with no caps.
- **Root safety net (RTL-01).** Under `:lang(ar)`, legacy screens' `.font-mono` falls back per glyph to the Arabic face, `.uppercase` is neutralised and every `tracking-*` is set to 0. Component classes `.label .sec-link .chip .h1 .h2 .stat-num .stat-unit .eyebrow .ui-label .btn .seg button .stat-label .pill` are covered in `src/index.css`.
- **Direction:**
  - Use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`).
  - Directional icons mirror automatically (`Icon` `MIRROR_IN_RTL`: `chevron`, `chevronLeft`); media and vertical glyphs never do.
  - Email, phone, URL and password inputs, and numeric fields, are always LTR (`TextInput`, `NumericField`).
  - Counters such as "1 / 2" are LTR.

## 4. Spacing

On a 4 px grid, with semantic steps:

| Token | Value | Use |
|---|---|---|
| `--ui-gutter` | 16 → 24 (md) → 32 (lg) | Page side padding |
| `--ui-section` | 24 → 32 (md) | Between sections |
| `--ui-stack` | 12 | Between items in a stack |
| `--ui-inset` | 16 | Inside a surface / row |
| `--ui-inset-compact` | 12 | Dense desktop rows |
| `--ui-hit` / `--ui-hit-workout` / `--ui-control-dense` | 44 / 56 / 32 | Touch targets (§22) |

## 5. Radius

| Token | Value | Use |
|---|---|---|
| `--ui-radius-control` (`rounded-ui-control`) | 12 | Inputs, non-pill buttons |
| `--ui-radius-surface` (`rounded-ui-surface`) | 16 | Cards, list groups, menus, banners |
| `--ui-radius-surface-lg` (`rounded-ui-surface-lg`) | 24 | Sheets, dialogs |
| `--ui-radius-pill` (`rounded-ui-pill`) | 9999 | Status chips, segmented control, filter chips, count badges |

## 6. Elevation and layers

- **Depth comes from surface tiers, not shadows.** Shadows exist only where something physically floats:

  | Token | Use |
  |---|---|
  | `--ui-shadow-menu` | Menus |
  | `--ui-shadow-sheet` | Sheets |
  | `--ui-shadow-dialog` | Dialogs |
  | `--ui-shadow-sticky` | Sticky action bars |

- **Layer ladder.** One ladder, matching the order the app already stacks in, so legacy and new overlays interleave correctly:

  | Layer | z | Notes |
  |---|---:|---|
  | `ui-sticky` | 20 | Sticky in-page headers |
  | `ui-header` | 30 | |
  | `ui-nav` | 40 | Bottom nav, floating timers |
  | `ui-banner` | 45 | Update pill |
  | `ui-task` / `ui-overlay` | 50 | Full-screen flows / sheets |
  | `ui-toast` | 55 | |
  | `ui-dialog` | 60 | Also the offline strip |
  | `ui-media` | 70 | Media viewer |
  | `ui-palette` | 80 | Command palette |

## 7. Accent semantics

- **Accent means "act here".** It marks the primary action, the active nav item and focus. It is not decoration, not "info" and not good/bad news.
- **Accent text** on dark uses `--ui-accent-hover` (amber). The gradient is reserved for primary action fills.
- **Status colours carry meaning only:** success (done, saved), warning (needs attention, conflict), error (failed, destructive), info (neutral system info, syncing). Offline is `--ui-offline`, a neutral — never red.
- **Chart tokens** follow the same rule (VS-17 moves to B2/B3 with the chart screens).

## 8. Canonical components

All live in `src/components/ui/` unless noted. "Evolved" means the existing component gained the contract; its existing call sites keep working.

| Component | Status | Contract |
|---|---|---|
| `Button` (`ui/Button.tsx`) | **Created** (evolved from SubmitButton) | Variants primary / secondary / tonal / ghost / danger; sizes sm / md / lg; `pending` (spinner over the still-laid-out label, no width jump, disabled); `offline` (disabled + reason tooltip); leading `icon`; `sm` gets `hit-44` |
| `SubmitButton` | **Evolved** | Thin `type="submit"` wrapper over `Button` |
| `IconButton` | **Created** | **`label` required** (aria-label + tooltip); md = 44 px box, sm = 36 px visual + 44 px hit area; optional `badge` |
| `LinkButton` | **Created** | Router link styled as a button (navigation, not action) |
| `CountBadge` | **Created** | One unread bubble: 18 px, 11 px tabular, "9+" cap |
| `StatusChip` (`ui/Pill.tsx`) | **Created** (evolved Pill) | Six tones on the 12 px floor, `role="status"`; legacy `Pill` keeps 10 px until migration |
| `Tabs` | Existing | URL-synced (`useTabParam`), `role=tablist` |
| `SegmentedControl` (`ui/Tabs.tsx`) | **Created** | In-place view switch, radio semantics, `.seg` visuals |
| `Banner` + `BannerRegion` (`ui/Banner.tsx`) | **Created** | §9 |
| `TextInput`, `SelectField`, `TextAreaField`, `SearchField`, `FormField` (`ui/Field.tsx`) | **Evolved** | Persistent associated label, helper / error wired with `aria-describedby`; LTR for email / tel / url / password |
| `NumericField` | Created (B1.8) | §15 |
| `SecondLanguageField` | Created (B1.8) | §15 |
| `LoadingState` / `EmptyState` / `ErrorState` | Existing | §11 |
| `ScreenState`, `OfflineState`, `StaleNotice` (`ui/ScreenState.tsx`) | **Created** | §11 |
| `ConflictState` (`SyncConflictNotice.tsx`) | **Created** (extracted) | One conflict's decision, usable inline |
| `SyncStatus` | Created (B1.7) | §13 |
| `MediaViewer` (`media/MediaViewer.tsx`) | **Created** (replaces 2) | §19 |
| `Sheet`, `DialogHost`, `ToastHost`, `DataTable`, `MobileCardList`, `PageHeader`, `Skeleton`, `Pagination` | Existing | Kept; their visual migration is B2/B3 |

- **Not created in B1 (deliberately).** ActionMenu (AX-06/VS-15) and FilterControl were scoped by the audit to the screens that own the seven menu-like implementations and the chip misuse. They are built with those screens in B2/B3 rather than as unused infrastructure now.

## 9. Responsive shell contract

- **Two shells** that share chrome primitives:
  - `AppShell` (client): mobile width at every breakpoint.
  - `ResponsiveShell` (coach/admin): bottom nav under `md`; sidebar + desktop top bar at `md` and above.
- **Banner region (VS-11).** Each shell renders exactly ONE `BannerRegion` at the top of `<main>`. Shell-level notices register a priority with `useBannerSlot(id, priority, active)`:

  | Priority | Notice |
  |---:|---|
  | 100 | Sync conflict |
  | 90 | Plan lapsed / subscription read-only |
  | 70 | Over capacity |
  | 60 | Plan ending |
  | 50 | Reminder |
  | 40 | Open plan request |
  | 10 | Announcement |

  - **Collapsed:** only the top notice shows.
  - **"N more notices"** (`aria-expanded`) reveals the rest, so no notice becomes unreachable.
  - **Announcements** show only on the home screen they are named for (`client_home` → `/`, `coach_dashboard` → `/coach`, `/coach/dashboard`).
  - **Not region banners:** the offline strip and the update-ready pill are global overlays (B0) and stay that way. Page-local cards (trial checklist, check-in request card) belong to their screens.
- **Role chrome.** The client `ReminderBanner` and other client-only systems never mount in the coach/admin shell (AR-02).
- **One bell per breakpoint** is visible; both bells share one poller (`shareSubscription`).

## 10. Safe-area and keyboard contract

| Variable | Meaning |
|---|---|
| `--shell-safe-top` | `env(safe-area-inset-top)` |
| `--shell-safe-bottom` | `env(safe-area-inset-bottom)` |
| `--shell-bottom-clearance` | Bottom-nav height + home-indicator inset — anything pinned above the nav sits here |
| `--shell-keyboard` | On-screen keyboard height (0 when closed), kept current by `src/lib/viewportInsets.ts`; `<html data-keyboard="open">` while up |

- **Top inset.** `body` pads the top inset for in-flow content. Sticky chrome that must cover the notch (BrandBar) pulls itself up by `--shell-safe-top` instead of adding a second inset (the double gap is fixed).
- **Bottom.** `BottomNav` pads `--shell-safe-bottom`. The rest-timer card and the bulk action bar sit at `--shell-bottom-clearance + gap`.
- **Full-screen task flows** (check-in, assessment wizard) own both insets in their header and footer.
- **Exception, B0-protected:** the main-content bottom padding stays `--bottomnav-h + 2.5rem`. The certified Messages composer cancels exactly that (`-mb-28`). B2 replaces it with the keyboard-aware composer layout.

## 11. Screen-state contract

`screenStatus({ loading, error, hasData, empty, online })` in `ui/ScreenState.tsx` is the one rule:

1. **Data on screen is never replaced** by an error or a spinner. A failed refresh or going offline marks it **stale** (`StaleNotice`: "Offline — showing what's saved on this device" / "Couldn't refresh — showing the last loaded version").
2. **No data and offline → `offline`** (`OfflineState`). Never a false "empty" and never a generic error.
3. **No data and error → `error`** (`ErrorState` with Retry).
4. **No data yet → `loading`** (`LoadingState`: skeletons that mirror the layout, `role="status"`).
5. **Loaded and nothing there → `empty`** (`EmptyState` with an action when one exists).

- **Composition.** `ScreenState` composes these; every state is overridable.
- **Conflicts.** `ConflictState` shows a record's conflict decision inline. The shell region shows the first open conflict (§9).
- **Mutations.** In-flight actions use `Button pending` and are never double-submitted. Offline actions that can't queue are disabled with a reason (`Button offline`). Actions that CAN queue go through the outbox (§12).

## 12. Durable outbox

- **Source:** `src/data/outbox/outbox.ts` (queue), `handlers.ts` (operation types) and `runtime.ts` (what the account runtime starts).
- **Storage.** Per account (`forma-u-<uid>` → `outbox` store) and IndexedDB-backed. Started and stopped per account for every role. An operation is never processed for another account; on switch the in-flight upload is interrupted and requeued before the database closes.
- **Record shape.** `operationId`, `userId`, `type`, `scope`, `dedupeKey`, `payload`, `blobKeys`, cached upload `media`, `dependencyIds`, `status`, `attemptCount`, `lastAttemptAt`, `nextAttemptAt`, `lastError`, `serverAcknowledgedAt`.
- **Status:** `queued → sending → acknowledged | waiting_for_network | failed_retryable | failed_permanent`. Users never see the raw value; they see sending / uploading N% / waiting for connection / retrying / failed + Retry / Discard.
- **Ordering and deduplication:**
  - FIFO per scope (thread, check-in week).
  - `dependencyIds` (a caption waits for its attachment).
  - `dedupeKey` (one submit per check-in week, one upload per photo).
- **Idempotency:** `message.send` uses `clientMsgId` = operation id; `checkin.submit` sends `opId` (the server replays the stored result).
- **Retries:** exponential backoff with jitter. Triggers are reconnect, return to foreground and a timer. Errors are classified once (`src/lib/errorKind.ts`).
- **Approved operation types:** `message.send` (text / attachment / voice), `checkin.submit` (with locally kept photos), `progressPhoto.upload`.
- **Online-required, deliberately not queued:** commercial actions, security, coach notes, plan saves and broadcasts.
- **Safety coupling.** An outbox send counts as critical work, so an update reload waits for it (§13, B0.7).

## 13. Sync status model

- **Source:** `src/data/sync/syncTruth.ts` (`deriveSyncTruth`), `src/hooks/useSyncState.ts` and `ui/SyncStatus.tsx`.
- **States, in priority order:**
  1. `conflict`: a record needs a decision.
  2. `failed`: last pass failed / a permanent outbox failure.
  3. `syncing`.
  4. `waiting`: offline with unsent changes / `saved_on_device`.
  5. `synced`.
- **"Synced" is only claimed** when nothing is unacknowledged and a sync pass has completed in this session. Unacknowledged means dirty records, tombstones, outbox operations or rejected records.
- **Coaches are judged on their outbox only.** They have no client data.
- **Live pending count.** It comes from a LocalRepository change signal (`src/data/localChanges.ts`), so a fresh edit changes the label immediately.
- **Display.** `SyncStatus inline` is silent when synced and shows Retry when failed. `SyncStatus detail` is the Settings card. It is the one component; the two older badges were deleted.

## 14. Sync payload contract

- **Server:** `api/sync/_contract.ts` (`SYNC_SCHEMA_VERSION = 1`).
  - **Allow-list:** only `SYNC_COLLECTIONS` are accepted.
  - **Validated per record.** Reasons: `BAD_ID`, `ID_MISMATCH`, `BAD_DATE` (only if a date is present), `BAD_UPDATED_AT`, `TOO_LARGE` (256 KB), `UNSUPPORTED_VERSION`.
  - **One bad record never blocks the batch.** Invalid records are returned in `rejected[]` and the rest are applied.
  - **Push limit:** at most 500 records per push. Pull returns `sv`.
  - **No clock-skew rejection:** revisions decide winners (B0 conflict detection).
- **Client:** `src/data/sync/contract.ts`.
  - **Pull validation is stricter:** `data.id === id`, a valid day key, and a schema not newer than this client. A failing record is skipped, never imported.
  - **Pushes** go in batches of 200.
  - **Rejected records** are remembered in meta `syncRejected` and count as unacknowledged (§13).
- **Ownership.** Engine writes use `putFromSync`; local edits keep the stored base revision (`_remoteRev`). This is the B0 rule.

## 15. Arabic number and date rules

- **Source:** `src/lib/format.ts`. All formatters are cached `Intl` instances. Nothing outside website/marketing calls `toLocale*` directly.
- **Digits are always Latin**, in every language (`-u-nu-latn`). This is a product decision: one numeral system across inputs, charts, timers and prices.
- **Locales:** `en` → `en-GB` (day-first); `ar` and `ar-eg` → `ar-EG`.
- **Day keys are LOCAL days** (`dayKeyOf`). Never `toISOString().slice(0, 10)` for a user-facing day.
- **API:**
  - Dates and time: `formatDate(value, lang, style)` (short / medium / long / full / weekday / weekdayShort / weekdayDayMonth / monthYear / dayMonth / iso), `formatTime`, `formatDateTime`, `formatRelative`.
  - Numbers: `formatNumber`, `formatPercent`, `formatCurrency`, `formatUnit`, `formatBytes`.
  - Durations and weekdays: `formatDuration` (floors), `weekdayInitials`.
  - Plurals: `pluralCategory`.
  - Mixed-direction text: `isolate()` (FSI/PDI).
- **Plurals.** i18next keys carry `_zero/_one/_two/_few/_many/_other` for Arabic, `_one/_other` for English.
- **Input:**
  - `NumericField` accepts Latin and Arabic-Indic digits, "٫" and "٬", and strips bidi marks.
  - Modes are `reject` (keystroke ignored) or `flag` (kept and marked invalid). Integer mode, stepper, clamp, unit suffix, 44 / 56 px.
  - `parseNumber` returns `NaN` for empty input (never a silent 0).
- **Bilingual content.** `applyLocalizedEdit(prev, value, lang)` changes the edited language. The other language follows only if it was a copy or empty; a real translation is never overwritten. `SecondLanguageField` opens itself when the translation may be stale.

## 16. Notification taxonomy

- **Source:** `src/lib/notificationTaxonomy.ts` (client) and `api/_lib/notificationTypes.ts` (server; both server unions derive from it). A test keeps the two lists identical.

| Category | Meaning | Types (audience) |
|---|---|---|
| **task** | Asks the reader to do something; the server resolves it when done | `checkin_requested` (client), `checkin_submitted`, `assessment_submitted`, `freeze_requested` (coach), `plan_change_requested` (admin) |
| **message** | A chat message — counted by the Messages badge, never the bell; grouped per thread | `message_received` |
| **update** | Something changed | `coach_note`, `targets_updated`, `measurement_added`, `checkin_reviewed`, `assessment_reviewed`, `plan_assigned`* (client); `coach_assigned`*, `client_released`* (coach) |
| **account** | About the reader's own account / plan | `freeze_decided`, `subscription_updated`* (client); `trial_expiring`*, `plan_decided`* (coach) |

\* Reserved: renders correctly if it arrives, but nothing produces it yet (`produced: false`).

## 17. Notification lifecycle

1. **Raised** server-side by the acting party (`notify()`), best-effort. A failed notify never fails the action that raised it.
2. **Delivered** by one shared poll per user (`notif-feed:<uid>`, 25 s, shared by every bell / feed).
3. **Toasted** only if it is new since this device's high-water mark and within 10 minutes (`notificationBaseline.ts`). The backlog is never replayed. Building a toast has no side effects; only a tap moves the day or focus (B0 / NT-01, NT-02).
4. **Counted.** The bell counts unseen feed rows after grouping, excluding messages (`bellCount`).
5. **Read** (`seenAt`): tapping a row, "mark all read", or opening the thread for messages (one `markRead` call clears both the messages and their notifications).
6. **Done** (`resolvedAt`): the server resolves a task when the work happens (check-in submitted / reviewed, assessment reviewed, freeze decided).
7. **Opened.** `notificationTarget(n, viewer)` / `openNotification` (§18) lands where the action is. Task types ignore stale stored routes (NAV-K03: a pause request opens the client's Subscription tab).

## 18. Navigation and back contract

- **Source:** `src/lib/navContract.ts` and `src/hooks/useBack.ts`.
- **Back** = real history when this app has an entry to go back to (`history.state.idx > 0`). The unsaved-changes guard always runs first.
- **No in-app history** (cold deep link, notification, reload), in order:
  1. A `?returnTo=`, only if it is one of this role's own screens and not the current one.
  2. The caller's fallback.
  3. The screen's **semantic parent**, e.g.:
     - workspace tab → workspace → clients → coach home;
     - thread → inbox;
     - template edit → template → templates;
     - routine day → workout;
     - check-in → check-ins;
     - any top-level client section → Today.
- **Push vs replace.** Moving within a shell (tab rail, `?tab=`) **replaces**. Leaving a shell (workspace → Messages / Progress) **pushes**, so Back returns (NAV-K01).
- **External paths.** Any path that arrives from outside (notification route, `returnTo`) must pass `isRolePath(path, role)`. That rejects absolute URLs, `//host`, backslashes, control characters, `..` segments and other roles' screens.

## 19. Media reference abstraction

- **Source:** `src/lib/mediaRef.ts`, `src/stores/mediaViewerStore.ts` and `src/components/media/MediaViewer.tsx`.
- **`MediaRef`** is `{ ref, kind, name?, mimeType?, path? }`:
  - `ref` is a URL, or `local:<blobKey>` for a file saved on this device and not uploaded yet (outbox).
  - `path` is the storage path, now returned by every `/api/media` upload. B4 can resolve references through a provider instead of trusting stored URLs.
- **`resolveMedia(ref)` is pure.** It returns `ready` (image / audio / file `src`, or a classified video), `not_uploaded` (local key) or `unsupported` (reason). It accepts only https, loopback http and `blob:` URLs.
- **One viewer for every kind**, with honest runtime states:
  - loading;
  - ready;
  - failed + Retry;
  - offline;
  - saved on this device, not uploaded yet (local preview);
  - can't preview + Open.
- **Video.** Remote video uses the B0-certified honest player: YouTube embed, file with stall/decode detection, unsupported-link message.
- **Callers.** They use `viewImages(urls, i)`, `playVideo(url)` or `viewMedia(refs, i)`.

## 20. Cache ownership rules

1. **Every query that reads per-user data has its owner in the key** (`['coachDashboard', coachId]`, `['coachCommercial', 'mine', uid]`). No uid-less `'mine'` keys.
2. **The cache belongs to one account.** Sign-out clears it, and so does any change of signed-in uid, including another tab signing in as someone else (`sessionStore` cache owner).
3. **One definition per key.** A shared key has one query factory (`coachDashboardQuery`). Screens don't redefine its `queryFn` or `staleTime`.
4. **Each entity has one home:**
   - **Mirrored and synced:** the client's own tracking data (logs, plans as mirrored, settings, photos metadata), in per-user IndexedDB + SyncEngine.
   - **Queued writes:** the approved outbox operations (§12).
   - **Server-cached:** coach/admin reads of other users' data, check-ins, notes, subscription (React Query, memory).
   - **Online-only:** commercial, security, plan saves.
5. **Polling.** Pollers for the same data are shared (`shareSubscription`); an open thread feeds its own badge. Realtime replacement of polling is B5 (PF-05).

## 21. Query and refetch policy

- **Defaults** (`queryClient.ts`): `staleTime` 60 s, `gcTime` 10 min, `retry` 1, refetch on focus (visibilitychange) and on reconnect, for stale queries only.
- **Overrides** must be justified in place. Today they are: notifications 25 s (shared poll); the coach plan banner and coach plan at 60 s intervals; the coach's client nutrition view at 15 s; admin payment requests at 60 s.
- **Client resume.** On return, the client re-mirrors coach content (one in-flight guard merges `visibilitychange` + `focus`), syncs and kicks the outbox. This is required for "coach edit → visible on the client's next refocus" (e2e spec 43). B5 replaces it with push.
- **Hidden tabs.** Every message poll skips its tick while the tab is hidden.
- **Updates.** The app checks for an update every 60 s and on becoming visible. It installs at a safe point, and every open tab must be idle (§23 / B0.7, PWA-10).

## 22. Accessibility guarantees

- **Names.** Every interactive control has an accessible name. `IconButton` makes the label mandatory. A visual label hidden on small screens uses `sr-only sm:not-sr-only`, never `hidden`.
- **Fields.** Every field has a persistent, associated label (`Field` family). Placeholder-only fields are not allowed; search boxes carry an aria-label.
- **Touch targets:**
  - ≥ 44 px everywhere (`--ui-hit`); ≥ 56 px for in-workout controls (`--ui-hit-workout`).
  - A smaller visual gets the `hit-44` hit area (centred, layout-neutral).
- **Focus and announcements:**
  - Focus is visible: a 2 px amber outline, offset 2 px.
  - Status regions use `role="status"`; decisions use `role="alert"`; the banner toggle has `aria-expanded`; segmented controls use radio semantics; tabs use tab semantics.
  - The media viewer is a modal dialog with Esc to close.
- **Text:** a 12 px floor for meaningful text (§2), and contrast ≥ 4.5:1 for muted text on every surface tier.
- **Motion:** reduced motion is honoured globally (§23).
- **Arabic:** labels are never letter-spaced or uppercased, and numbers stay legible LTR (§3, §15).

## 23. Motion rules

| Token | Use |
|---|---|
| `--ui-dur-fast` 120 ms | Press feedback, colour |
| `--ui-dur-base` 200 ms | Small content / status change |
| `--ui-dur-slow` 320 ms | Sheets / dialogs |
| `--ui-ease` | Standard |
| `--ui-ease-emphasized` | Entering surfaces |

- **Purpose.** Motion explains a change of state or place; it is never decorative loops.
- **Reduced motion.** `prefers-reduced-motion` collapses every animation and transition to 0.01 ms (one global rule).
- **Updates never move the screen under the user.** An update reload happens only when the app is hidden and no critical work is running in ANY open tab: workout, cardio, rest timer, dirty editor or check-in, upload in flight. Critical work is registered by its owner (`src/lib/criticalWork.ts`); other tabs are seen through the `forma-busy-tab:*` heartbeat.

## 24. Migration map from legacy components

| Legacy | Canonical | State in B1 |
|---|---|---|
| `SyncStatusBadge`, `shared/SyncStatusIndicator` | `ui/SyncStatus` | **Deleted**; all refs migrated |
| `NumberStepper`, `NumericCell`, raw numeric inputs | `ui/NumericField` | **NumberStepper deleted**; brief areas migrated; coach editors migrate in B3 |
| `ImageViewer` + `imageViewerStore`, `VideoPopup` + `videoPopupStore` | `media/MediaViewer` + `mediaViewerStore` | **Deleted**; all refs migrated |
| Notification grouping in `Notifications.tsx`; `n.route ?? '/coach'` tap logic ×2 | `notificationTaxonomy.coalesceFeed`, `notificationTarget/openNotification` | **Replaced** |
| `SubmitButton` | `Button` (`type="submit"`) | Alias kept; 21 call sites unchanged |
| `.btn-*` hand-rolled buttons, `.icon-btn` raw buttons | `Button`, `IconButton` | Migrate per screen (B2/B3) |
| `Pill` (10 px) | `StatusChip` (12 px) | Migrate per screen (B2/B3) |
| `.seg` hand-rolled toggles | `SegmentedControl` | Migrate per screen |
| Hand-made unread bubbles (bell, nav, sheets) | `CountBadge` | Migrate per screen |
| SubscriptionBanner / SyncConflictNotice / CoachPlanBanner / BannerHost / ReminderBanner own styles | `Banner` in the shell `BannerRegion` | **Migrated** |
| `CoachTrialBanner`, usage strips, check-in card | `Banner` (page-local) | B2/B3 with their screens |
| Bare loading / empty / error divs; `isLoading ? … : !data ? … : …` chains | `ScreenState` (+ `OfflineState`, `StaleNotice`) | Migrate per screen |
| Raw `<input>` + `<label className="label">` without `htmlFor` (50 left) | `TextInput` / `SelectField` / `TextAreaField` / `SearchField` | B2/B3 (B1 fixed composer, searches, invite, check-in notes) |
| `toLocaleDateString` / `toLocaleString` / `shortDate` / `dateLocale` / `fmtDate` | `lib/format.ts` | **Done** outside website/marketing (`shortDate`/`fmtDate` delegate; `dateLocale` deprecated) |
| `rtl:rotate-180` chevron flips | `Icon` auto-mirror | **Done** |
| `env(safe-area-inset-*)` per component | `--shell-*` variables | Shell chrome done; task flows keep their own insets |
| Legacy colours `surface` / `brand` / `earth` / `line`, `rounded-xl/2xl`, `shadow-elevated`, `z-[NN]` | `ui-*` tokens | Migrate per screen |
| `font-mono uppercase tracking-[…]` on translatable text | `.t-tag` (Latin) / `.t-label` | Arabic neutralised globally (§3); migrate per screen |
| Menu-like sheets (FloatingActionMenu, ManageSheet, QuickActions, More sheet, NavMenuSheet, LanguageToggle, message sheet) | ActionMenu | Built with B2/B3 (VS-15) |
