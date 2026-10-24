# B3 — Coach route migration

> Living document for the coach URL changes of B3 (blueprint §5.3). **B3.1 delivered the shell, the Me hub and the navigation contract**; routes whose replacement screen belongs to a later milestone keep their current page until that milestone ships, so nothing a coach can reach today disappears in between.
> Code: `src/config/coachNav.ts` (destinations, active tab, Back ownership), `src/lib/navContract.ts` (semantic parents), `src/apps/CoachApp.tsx` (routes), `src/components/coach/CoachShell.tsx` (chrome). Tests: `src/config/coachNav.test.tsx`, `src/lib/navContract.test.tsx`, `src/components/coach/CoachShell.test.tsx`, `e2e3/specs/85-b3-coach.spec.ts`.

## 1. Destinations (B3.1)

| Destination | URL | Phone (< 768) | Tablet (768–1023) | Desktop (≥ 1024) |
|---|---|---|---|---|
| **Today** | `/coach/dashboard` — the queue since B3.2 (`B3_TODAY_QUEUE.md`) | tab | collapsed rail | labelled rail |
| **Clients** | `/coach/clients` | tab | rail | rail |
| **Messages** | `/coach/messages` (unread badge) | tab | rail | rail |
| **Library** | `/coach/library` (+ "Programs" segment → templates) | tab | rail | rail |
| **Me** | `/coach/me` (**new**) | avatar in the header | avatar at the rail's foot | avatar + name at the rail's foot |

Removed from the coach (still used by the admin shell): the ☰ menu sheet, the old bottom bar (Dashboard · Clients · Messages · Revenue), the grouped sidebar, the floating WhatsApp button (Help & support is in Me), and — **B3.2 (O-5)** — the notifications bell: Today carries the coach's task notifications, Messages its own unread badge; notification toasts still run from the shell.

## 2. Route table

| Old | New | Handling | Milestone | B3.1 status |
|---|---|---|---|---|
| `/coach` | Today | redirect to `/coach/dashboard` on **every** breakpoint (was Clients on phones — IA-K01) | B3.1 | **Done** |
| `/coach/dashboard` | Today | same URL; content becomes the queue (`?tab=*` ignored, `?focus=<kind>` filters) | B3.2 | **Done (B3.2)** |
| `/coach/me` | Me hub | **new** route | B3.1 | **Done** |
| `/coach/assessments` | Today (assessments) | redirect `/coach/dashboard?focus=assessments` | B3.2 | **Done (B3.2)**; Me row and list page removed |
| `/coach/checkins` | Clients › Weekly check-ins | redirect `/coach/clients?view=checkins` (history replaced) | B3.2 → **B3.3** | **Done (B3.3)**. Kept through B3.2 (owner-approved 2026-10-17) until the replacement shipped: the same groups (to review, overdue, awaiting, not requested, done), review in order, and the bulk "request this week's check-in" (now only to eligible clients). Page and Me row removed; the URL keeps working |
| `/coach/adherence` | Clients sorted by workouts (7 days) | redirect `/coach/clients?sort=workouts` | B3.3 | **Done (B3.3)**; page and Me › Coaching section removed |
| `/coach/notifications` | Today | redirect (O-5) | B3.2 | **Done (B3.2)**; admin keeps `/admin/notifications` |
| `/coach/clients` (`?new=1`, `?q=`) | Clients directory | same URL; B3.3 adds `?task=` `?state=` `?checkin=` `?plan=` `?sort=` `?dir=` `?view=checkins` (`B3_CLIENTS_DIRECTORY.md`) | B3.3 | **Done (B3.3)** |
| `/coach/client/:id` (+ every workspace section) | Client › Summary · Plan · Progress · Profile | same URLs; new `…/plan`, `…/progress`, `…/profile`; `…/assessment` `…/notes` `…/subscription` `…/history` are Profile sections, `…/checkins` is Progress › Check-ins | B3.4 | **Done (B3.4)**; lights **Clients** (NAV-K11) |
| `…/workout`, `…/nutrition`, `…/cardio` | editors (task flows) | same URLs; B3.4 draws no workspace chrome around them (one Back → Plan) | B3.5 | Unchanged inside (B3.5) |
| `…/view`, `…/view/:tab` | Client › Progress | redirect `…/progress?view=` (activity → `day`, measurements / progress → `body`, nutrition, cardio, photos) | B3.4 | **Done (B3.4)**; the "view as client" page is removed |
| `…/versions/:kind` | editor History sheet | redirect `…/:kind?history=1` (unknown kind → `…/plan`); the editor opens History from `?history=1` and drops the parameter once read; the Plan section's History links there too | B3.5 → **B3.9 (owner D10)** | **Done (B3.9)** — `PlanVersionHistory` page and `VersionActions` deleted; `versionsTarget` unit test + spec 89 redirect test |
| `/coach/messages`, `/coach/messages/:clientId` | Messages | same URLs | B3.6 | Tab |
| `/coach/library?tab=…` | Library | same URL; `?tab=programs` added (and the default); `?tab=groups` → Foods › Swap groups | B3.7 | **Done (B3.7)** — §12 |
| `/coach/templates`, `/:id`, `/new`, `/:id/edit` | Library › Programs | list → `/coach/library?tab=programs`; editor URLs kept; `/:id` opens the template read-first (RM-27) | B3.7 | **Done (B3.7)**; the list and preview pages are removed; light **Library** |
| `/coach/revenue`, `/coach/reports` | Me › Business | **new** `/coach/business`, old URLs redirect | B3.8 | **Done (B3.8)** — §13; pages removed |
| `/coach/subscription-plans` | Me › Business › Packages | redirect `/coach/business?tab=packages` | B3.8 | **Done (B3.8)**; page removed |
| `/coach/plan` | Me › Forma subscription | same URL | B3.8 | **Done (B3.8)** — one status card |
| `/coach/settings` | Me › Account / Preferences | same URL | B3.8 | **Done (B3.8)** — saved / failed per field |

Every stored notification target keeps resolving: `/coach/client/:id/checkins`, `…/assessment`, `…/subscription`, `/coach/messages/:id`, `/coach/plan`.

## 3. Semantic parents (where Back goes from a cold deep link)

| From | Up to | Since |
|---|---|---|
| `/coach/client/:id/workout · nutrition · cardio` | `/coach/client/:id/plan` | B3.4 |
| `/coach/client/:id/assessment · notes · subscription · history` | `/coach/client/:id/profile` | B3.4 |
| `/coach/client/:id/checkins`, `…/view`, `…/view/:tab` | `/coach/client/:id/progress` | B3.4 |
| `/coach/client/:id/versions/:kind` | `/coach/client/:id/:kind` (its editor) | B3.4 |
| `/coach/client/:id/plan · progress · profile` | `/coach/client/:id` (Summary) | B3.4 |
| `/coach/client/:id` | `/coach/clients` | B1 (B3.4: sections replace history, so with in-app history Back returns to the opener — NAV-K08) |
| `/coach/messages/:id` | `/coach/messages` | B1 |
| `/coach/templates/:id/edit` → `/coach/templates/:id` → **`/coach/library?tab=programs`** (`/coach/templates` and `/new` too) | Library › Programs | B3.1; B3.7 (the segment) |
| `/coach/business`, `/coach/plan`, `/coach/settings`, `/coach/revenue`, `/coach/reports`, `/coach/subscription-plans` | **`/coach/me`** | B3.1 (`/coach/business`: B3.8) |
| `/coach/me` and every other `/coach/<section>` | **`/coach/dashboard`** (Today) | B3.1 (was `/coach`, a redirect) |

With in-app history, Back is real history (B1 contract); the parent is only used when there is nothing to go back to.

## 4. One Back per screen

| Screen | Back owner |
|---|---|
| Destinations and the Me hub | none |
| Me pages (`/plan`, `/settings`, `/revenue`, `/reports`, `/subscription-plans`), `/coach/templates` | the shell header (`shell-back`) |
| Client workspace | its header's Back (`workspace-back`, B3.4) |
| Plan editors, message thread, template preview / editor | the page itself (editors: one Back, no workspace chrome since B3.4; rebuilt in B3.5–B3.7); the shell adds none |

## 5. Unsaved-changes guard — every exit

Tab bar, rail, rail Me, header avatar, shell Back and every ⌘K command go through `confirmLeave()` (the bell left with B3.2). A browser / hardware Back cannot be intercepted with the app's `BrowserRouter` (no data router) — the editors' per-coach drafts (C3) keep the work, and `beforeunload` covers reload / close (B1 known limit, unchanged).

## 6. Test selector changes (B3.1)

| Old | New | Specs |
|---|---|---|
| `coach-sidebar` (coach) | `coach-rail` (admin keeps `coach-sidebar`) | 20, 46, `_b-helpers.appReady`, `_d-layout` |
| `sidebar-coachClients` | `rail-clients` | 20, 23 |
| coach nav keys `coachDashboard / coachClients / coachMessages / coachRevenue` | `today / clients / messages / library` (`nav-*` tabs, `rail-*` rail) | `_d-layout` |
| header avatar → `/coach/settings` (`getByRole(banner)` "Coach Amira") | `rail-me` / `me-button` → `/coach/me` | 23 |

## 7. B3.2 changes

| Old | New | Specs |
|---|---|---|
| `notifications-bell` (coach) | none — Today + Messages badge; toasts from the shell | 85 (guard test drops the bell exit), 86 |
| `me-assessments` | none (Today `?focus=assessments`) | 85 |
| `coach-plan-banner` "term ending" on every screen | on Today only (O-6); blocking banners (lapsed, over capacity) stay app-wide | 60 now uses the over-capacity banner for the composer-reachability check |
| dashboard tabs / cards / `coach-dash-*` | Today: `coach-today`, `today-item[data-kind]`, `today-summary`, `today-chip-*`, `today-panel`, `today-detail`, `today-kind-error`, `today-stale`, `today-all-clear`, `today-new-coach` | 86, 42 (+ Today error case) |

## 8. B3.3 changes

| Old | New | Specs |
|---|---|---|
| `/coach/checkins` page, `me-checkins` | `/coach/clients?view=checkins` (`checkins-view`, `checkins-group-<state>`, `checkins-row`, `start-review-queue`, `review-queue-panel`, `checkins-request-week`) | 85 (cold deep link now lights Clients), 87 |
| `/coach/adherence` page, `me-adherence` | `/coach/clients?sort=workouts` | 85, 87 |
| desktop rows `data-row` with email / phone and an **Open** button | `client-table-row[data-client-id]`; the name is the link (`client-open`); a row menu (`client-row-menu`); no contact details in rows | 20, 21, 23 |
| phone rows (email shown) | `coach-client-row[data-client-id]` (name, reason, package; no contact details) | 87 |
| package pill "No plan" | "No package" (`client-coaching-state`) | 61 |
| — | `clients-task-*`, `clients-view-checkins`, `clients-filters-button` / `clients-filters`, `clients-sort-<key>` (`aria-sort`), `clients-load-more`, `pagination-*`, `clients-empty`, `clients-no-match`, `clients-partial`, `clients-stale`, `coach-clients-error`, `outgoing-transfers` | 87 |

## 9. B3.4 changes

| Old | New | Specs |
|---|---|---|
| 11-tab rail `workspace-tab-<overview…history>`, `workspace-tab-more` / `workspace-more-sheet` | four sections `workspace-tab-summary · plan · progress · profile` (`aria-current`) | 23, 88 |
| Overview `coach-client-detail` with stat tiles, `coach-manage` sheet, `coach-view-activity`, `coach-message-client`, `coach-view-assessment`, `coach-view-checkins` | Summary (root keeps `coach-client-detail`): `summary-needs` / `summary-item[data-kind]`, `summary-training`, `summary-body`, `summary-plan`, `summary-checkins`, `summary-note`, `summary-request-checkin` | 23, 88 |
| header back = first sibling of `workspace-switch-trigger`; header "Edit plan" | `workspace-back`; `workspace-message`; `workspace-more` (Call, Switch, `workspace-release`); Summary "Edit plan" opens Plan | 20, 23, 88 |
| `coach-release-client` → `release-confirm` | `workspace-more` → `workspace-release` → the danger `confirm-dialog`; lands on `/coach/clients` | 20, 88 |
| "view as client" `coach-view`, `coach-view-tab-*` | Progress `workspace-progress[data-view]`, `progress-view-*`, `progress-week`, `progress-day[data-date]`, `progress-back-week` | 88 |
| subscription chips `sub-set-price`, `sub-extend`, `sub-end`, `sub-cancel` | same ids inside `sub-more` ("More package actions"); `sub-set-term`, `sub-freeze`, `sub-unfreeze` stay visible | 20, 88 |
| — | Plan `plan-card-<kind>[data-state]`, `plan-edit-*`, `plan-history-*`, `plan-build-*`; Profile `profile-assessment · notes · subscription · history · contact`, `profile-back`; `workspace-not-on-roster`; switcher `switcher-client-row[data-client-id]`, `switcher-needs` | 88 |

**Client check-in links (B3.4 owner review, 2026-10-18).** A check-in's route id is its record key: `/check-in/<week>` for a week's first record (every existing link, draft and outbox key unchanged) and `/check-in/<week>__<coachId>` for the incoming coach's own record of a hand-over week (its notification carries that route). This release sends `byKey: true`, so `/check-in/<week>` opens exactly the week's first record; a previous coach's request left open there reads as closed (`checkin-closed`, `checkin-closed-kept`, `checkin-closed-history`) instead of a wizard that can't be sent. Older apps (RC2, B3.3) keep addressing the week and are served the week's actionable record (`B3_IMPLEMENTATION_LOG.md` §B3.4.8). Specs: 88, `e2e3/pwa/b34-checkin-compat.mjs`.

## 10. B3.5 changes

Routes are unchanged (the editors keep `…/workout`, `…/nutrition`, `…/cardio`, `/coach/templates/:id/edit`). `…/versions/:kind` is now behind the plan gate (B3-C02) and its cold Back goes to its editor (NAV-K10); the editors open history as a sheet.

| Old | New | Specs |
|---|---|---|
| `TopBar` per editor (`coach-workout-editor` etc. on the bar) | the editor frame's header keeps `coach-<kind>-editor` (with its Back), adds `plan-editor-client`, `version-history` (now opens a sheet), `<prefix>-more` | 23, 85, 88, 89 |
| status lines `<prefix>-saving / -unsaved / -saved` above the form; Save in the top bar | the same ids in the bottom bar `plan-editor-bar`, plus `-clean`, `-offline`, `-failed`, `-conflict`; Save `<prefix>-save` in the bar | 20, 23, 61, 85, 89 |
| `version-save-new` → sheet → `version-reason` / `version-save-confirm` | the History sheet `plan-history-sheet` holds `version-reason` / `version-save-confirm`, `version-row`, `version-restore-<n>` | 89 |
| PlanBuilder levels: `builder-day` → section button → `builder-section`; `🎬` text | the day shows its sections: `builder-section[data-section-id]` with `section-title`, `section-kind`, `section-menu`; rows `builder-exercise-row` / `builder-exercise-open`, video `ex-row-video`; `builder-day[data-day-id]`, `day-menu`, desktop `builder-day-tree` | 20, 22, 43, 89 |
| `ExerciseForm` for plan exercises | `exercise-programming` with `ex-name`, `ex-working-sets`, `ex-warmup-sets`, `ex-reps`, `ex-rest`, `ex-rir`, `ex-tempo`, `ex-notes`, `ex-notes-ar`, `ex-progression`, `ex-video`, `ex-save` | 22, 89 |
| picker | adds `picker-muscle`, `picker-equipment`, `picker-recent`, `picker-media`, `picker-error`; `picker-quick-create` is the last row | 20, 22, 89 |
| nutrition chips / table | `nutrition-totals`, `nutrition-total-<k>`, `nutrition-meal[data-meal-id]` / `nutrition-meal-toggle` / `meal-menu`, `meal-label` / `meal-label-ar`, `meal-slot`, `nutrition-food-row`, `nutrition-supp-row`, `supp-form` (`supp-name`, `supp-dose`, `supp-dose-ar`, `supp-timing`, `supp-timing-ar`, `supp-save`), `generalNotes-*` / `beverageNotes-*`; `policy-<k>` are switches | 20, 89 |
| cardio | `cardio-targets` (`cardio-target-steps`, `cardio-target-minutes`), `cardio-session-row`; `cardio-type-<type>` are radios | 20, 89 |
| template editor | `template-goal`, `template-split` (selects), `template-not-found`, `template-load-error` | 22, 89 |

**Owner review additions (2026-10-19):** `cardio-targets-conflict` with `cardio-targets-mine-<steps|cardioMin>`, `cardio-targets-theirs-<…>`, `cardio-targets-keep-mine`, `cardio-targets-use-theirs`; the bar's `cardio-conflict` also covers a targets conflict; `plan-editor-draft-restored` carries `[data-stale]` when the restored draft was made before the saved version changed. Spec 89.

## 11. B3.6 changes

URLs are unchanged (`/coach/messages`, `/coach/messages/:clientId`; every notification target keeps resolving), but they are now **one screen** (`CoachMessages`; `CoachMessageThread` is removed):

| Width | `/coach/messages` | `/coach/messages/:clientId` |
|---|---|---|
| ≥ 768 | inbox + "Select a conversation" | inbox + that conversation selected (split view) — no Back; selecting another row **replaces** the history entry, the first selection from the bare inbox pushes |
| < 768 | the inbox | the conversation, full-screen above the shell (no tab bar); its Back pops history, from a cold link → `/coach/messages` |

- Semantic parent unchanged (`/coach/messages/:id` → `/coach/messages`); the shell still draws no Back on a conversation (`coachPageOwnsBack`).
- **NAV-K07:** thread → client workspace pushes with `state.fromThread`; the workspace's Message pushes with `state.fromWorkspace`. Each side **pops** history instead when it was opened from the other for the same client, so thread ↔ client never stacks up.
- Notification toasts for the open conversation are suppressed on the split view too (its path is the conversation's).

| Old | New | Specs |
|---|---|---|
| `coach-thread` (phone/tablet thread page), `topbar-title` (header → workspace) | `coach-thread` = the phone full-screen layer (`role="dialog"`) or the split's conversation pane; header `thread-header` with `thread-recipient`, `thread-context`, `thread-header-identity`, `thread-open-client`, `thread-more` (`thread-request-checkin`, `thread-menu-open-client`), `thread-back` (phones) | 23, 60, 90, 91, `_d-layout` |
| `coach-desktop-messages` only ≥ 1024, selection in state | `coach-desktop-messages` ≥ 768 with `inbox-pane`; `thread-empty` when nothing is selected | 23, 85, 90 |
| `thread-row` (button), `thread-unread-badge` (`9+`) | `thread-row` is a link with `data-client-id` and `aria-current`; `thread-preview`; `thread-unread-badge` (`99+`, the real count for screen readers); `inbox-search`, `inbox-filter-all` / `-unread`, `inbox-list`, `inbox-no-results`, `inbox-threads-error`, `inbox-unread-line` | 23, 42, 90 |
| `broadcast-open` (top-bar button), `broadcast-search`, `broadcast-body`, `broadcast-send` | `messages-more` → `broadcast-open`; `broadcast-category-<c>`, `broadcast-audience-all` / `-chosen`, `broadcast-recipients` / `broadcast-recipient`, `broadcast-chosen-count`, `broadcast-preview`, `broadcast-send`, result `broadcast-result` / `broadcast-summary` / `broadcast-failed-list` / `broadcast-retry` / `broadcast-done` | 90 |
| engine | adds `unread-divider`, `message-composer`, `composer-count`, `composer-offline`, `thread-access-ended`, `thread-not-assigned`, `attachment-unavailable`, `voice-note` / `voice-note-toggle` / `voice-note-unplayable`; the action sheet / menu has `role="menu"` | 31, 32, 90, 91 |

**Certification additions (2026-10-20):** the broadcast result adds `broadcast-not-sent` (refused, nothing stored) and `broadcast-unconfirmed` (no answer, may have arrived); rows of `broadcast-failed-list` carry `data-failure` (`notAssigned` / `accountNotActive` / `rejected` / `unknown`). Spec 90.


## 12. B3.7 changes

Templates is **Library › Programs**; the separate preview page is gone (RM-27, owner decision 2026-10-20). Every old URL keeps working:

| URL | Now | Handling |
|---|---|---|
| `/coach/library` | Library, **Programs** first (Programs · Exercises · Foods · Supplements) | same URL; `?tab=programs\|exercises\|foods\|supplements`; Foods adds `?view=groups` (swap groups); the list's own state is in the URL: `?q=` `?muscle=` `?equipment=` `?video=1` `?goal=` `?sort=` `?dir=` |
| `/coach/library?tab=groups` (swap groups had their own tab) | Foods › Swap groups | rewritten in place (replace) to `?tab=foods&view=groups` |
| `/coach/library?…&new=1` | the segment's creation form opens once | ⌘K "New exercise" / "New food" (DT-08); the parameter is removed at once (replace) |
| `/coach/library?…&open=<id>` | that exercise / food / supplement opens read-first | ⌘K search results; removed at once |
| `/coach/templates` | Library › Programs | redirect `/coach/library?tab=programs` (replace) |
| `/coach/templates/:id` | the template **read-first** in its editor screen (the whole program; Edit, Use in a client plan, Duplicate, Delete) | same URL, readable while the coach's Forma plan has lapsed (writes disabled) |
| `/coach/templates/:id/edit`, `/coach/templates/new` (and `/new/edit`) | the builder (B3.5) | same URLs, behind the plan gate; Edit and Save **replace** the history entry, so Back from a program goes to the Library and never into the builder (NAV-K04) |
| `/coach/client/:id/workout?addExercise=<id>`, `…/nutrition?addFood=<id>` | **new** — "Use in a client plan": the client's existing editor asks for the day / meal and adds the item as an unsaved change | the parameter is read once and removed (replace); nothing is saved until Save |

**Semantic parents:** `/coach/templates/:id` and `/coach/templates/new` → `/coach/library?tab=programs` (was `/coach/templates`); `/coach/templates` → `/coach/library?tab=programs` (was `/coach/library`); `/coach/templates/:id/edit` → `/coach/templates/:id` (unchanged). The Library is a root (no Back); the template screens still draw their own Back (`coachPageOwnsBack`). "Start from a template" (empty Plan in the workspace and in the training editor) goes to `/coach/library?tab=programs`.

| Old | New | Specs |
|---|---|---|
| `TopBar` `coach-library`; chips `lib-tab-programs` (a link to `/coach/templates`), `lib-tab-exercises \| foods \| groups \| supplements` | page `coach-library[data-segment]` with its own header; segment tabs `lib-tab-programs \| exercises \| foods \| supplements` (`role="tab"`, one tab stop, arrow keys); Foods › `lib-foods-view-foods \| -groups` (radios) | 22, 85, 92 |
| `lib-load-starter` next to the search; `load-starter-library` in empty states; result: a toast (Library) or a dialog (Templates) | `lib-more` → `lib-load-starter`; the first-run panel `lib-starter` → `load-starter-library`; both confirm, then report in the same dialog | 22, 92 |
| `lib-new` / `food-new` / `group-new` / `supp-new` (+ icons beside each search), `template-new` (Templates top bar) | one header button whose id follows the segment: `template-new`, `lib-new`, `food-new`, `group-new`, `supp-new` | 22, 40, 92 |
| tables `coach-desktop-library`, `coach-desktop-foods` (`data-row`, a checkbox + ✕ on every row); cards `group-item`, `supp-item`, `template-card` | desktop tables `coach-desktop-templates \| library \| foods \| groups \| supplements` (`data-row[data-id]`, `row-open`, `row-menu` → `row-use`, `row-edit`, `row-duplicate`, `row-delete`; sortable headers `sort-<key>` with `aria-sort`); phones / tablets `lib-list-<segment>` with rows `template-card`, `lib-item`, `food-item`, `group-item`, `supp-item`; `lib-show-more` | 22, 92 |
| `row-select` / `select-all` / `bulk-delete` always visible | only after `lib-select` (Select mode); then `row-select`, `select-all` (desktop), `bulk-action-bar` / `bulk-delete` | 92 |
| searches `lib-search`, `food-search`, `supp-search`, `template-search`; muscle chips `lib-muscle-<m>` | same search ids (plus `group-search`); filters `lib-filter-muscle`, `lib-filter-equipment`, `lib-filter-video`, `lib-filter-goal` (desktop inline; phones `lib-filters` → `lib-filters-sheet` with `lib-sort`); `lib-count`, `lib-clear` | 92 |
| exercise view `exercise-view` + `exercise-view-edit`; foods opened straight into their form | every item opens read-first: `exercise-detail` (`exercise-view`, `exercise-use`, `exercise-view-edit`, `exercise-delete`), `food-view` (`food-use`, `food-view-edit`, `food-delete`), `group-view`, `supp-view`; demo `demo-video \| demo-image \| demo-none`, `demo-image-view`, `demo-placeholder`, `attribution` | 22, 92 |
| template preview `coach-template-preview`, `template-preview`, `template-preview-days`, `template-edit / -assign / -duplicate / -delete` | the editor screen `coach-template-editor` read-first: `template-preview` (`template-read-day`, `template-read-exercise`), `template-edit`, `template-assign`, `template-more` → `template-duplicate` / `template-delete`, `template-draft-pending` | 22, 89, 92 |
| — | "Use in a client plan": `use-in-plan` (`use-client-search`, `use-client-client`); in the editors `library-add` (`library-add-target`, `library-add-new`, `library-add-cancel`, `library-add-missing`) | 92 |
| — | template sync notice `lib-sync-issue` (`lib-sync-retry`, dismiss) | 92 |

## 13. B3.8 changes

**Routes** (`src/apps/CoachApp.tsx`):

| URL | Now | Notes |
|---|---|---|
| `/coach/business` (`?tab=overview` default · `renewals` · `packages` · `exports`) | **Me › Business** (new) | the tab replaces history; lights Me; shell Back → `/coach/me` |
| `/coach/revenue` | redirect → `/coach/business` | the Revenue page is removed |
| `/coach/reports` | redirect → `/coach/business?tab=exports` | the Reports page (KPIs, ranking, aggregate CSVs) is removed |
| `/coach/subscription-plans` | redirect → `/coach/business?tab=packages` | the Client Plans page is removed |
| `/coach/plan` | Me › Forma subscription (same URL) | restructured; every notification / banner link keeps resolving |
| `/coach/settings` | Me › Account & preferences (same URL) | shared with admin (`/admin/settings`) |

**Semantic parents** (`src/lib/navContract.ts`): `/coach/business` → `/coach/me` (added); the redirected URLs keep their entries (→ `/coach/me`). `src/config/coachNav.ts`: `/coach/business` belongs to Me.

**Test id changes** (guarantees unchanged):

| Old | New | Specs |
|---|---|---|
| Me rows `me-revenue`, `me-reports` | `me-business` (→ `/coach/business`); `me-packages` now opens `/coach/business?tab=packages` | 85 |
| `coach-revenue`, `coach-revenue-error` | `coach-business`, `coach-business-error` (`/coach/revenue` still works — it redirects) | 42 |
| `coach-reports`, the three unnamed export buttons | `biz-export-clients`, `biz-export-terms`, `biz-export-from`, `biz-export-to` (row-level files) | 93 |
| Packages: `coach-plan-edit` (a text button per row), `coach-plan-order` (field) | the row's `row-open` opens the sheet (`coach-plan-form`, `coach-plan-delete` inside); `coach-plan-up` / `coach-plan-down` on every row; `coach-plan-archived` marker. Kept: `coach-subscription-plans`, `coach-plan-list`, `coach-plan-row`, `coach-plan-add`, `coach-plan-name / -duration / -unit / -price / -trial / -save` | 93 (no spec used them before) |
| — | Business: `coach-business` (`data-tab`), `biz-tab-*`, `biz-money` (`data-currency`), `biz-booked / -due / -lost`, `biz-definitions`, `biz-month-range`, `biz-attention-soon / -lapsed / -none`, `biz-count-<state>`, `biz-upcoming-list`, `biz-lapsed-list`, `biz-row`, `biz-renew`, `biz-exports-phone` | 93 |
| Forma subscription | all ids kept (`plan-phase`, `plan-state`, `plan-ends`, `plan-price` now live inside `plan-subscription-card`); new `plan-requests-older` | 11, 12, 50, 93 |
| Account | new `account-identity`, `account-name`, `account-phone`, `account-timezone`, `account-timezone-device`, `account-*-status` (+ `-retry`), `account-name-error`, `account-sign-out`; kept `account-currency`, `change-password`, the language buttons' names and the "Sign out" button name | 93 (helpers in 10–92 unchanged) |
| Today | new `today-coming-up-all` (→ `/coach/business?tab=renewals`) | — |

## 14. B3.8 completion changes (2026-10-21)

**Routes:** none added or removed. The desktop sidebar now links `/coach/business`, `/coach/plan` and `/coach/settings` directly (they used to be reachable only through Me); on phones they stay behind the avatar.

**Lit destination** (`src/config/coachNav.ts` — `coachRailGroups`, pinned by `coachNav.test.tsx`):

| Location | Desktop sidebar | Phone |
|---|---|---|
| `/coach/business` (any tab), `/coach/revenue` (redirect) | `rail-business` (`aria-current="page"`); its tab `rail-sub-business-<tab>` (`aria-current="true"`) | avatar (`me-button`) |
| `/coach/plan` | `rail-forma` | avatar |
| `/coach/settings` | `rail-account` | avatar |
| `/coach/me` | the footer `rail-me` (only here now) | avatar |
| `/coach/library` (any segment), `/coach/templates/*` | `rail-library` + `rail-sub-library-<programs·exercises·foods·supplements·groups>` | `nav-library` |

**Test id changes** (guarantees unchanged unless stated):

| Old | New | Specs |
|---|---|---|
| `rail-me` lit on Business / Forma / Account | `rail-business`, `rail-forma`, `rail-account`; `rail-me` lit on `/coach/me` | 85, 93 |
| — | sidebar groups `rail-group-<workspace·content·business·account>`; sub-pages `rail-<key>-pages`, `rail-sub-<key>-<page>` | 94 |
| package card: `p.font-mono.font-medium` (renew date, B3-C07) | `sub-start`, `sub-last-day`, `sub-price`, `sub-length`, `sub-plan-name` | 20 |
| "Set term" / "Renew" `sub-set-term` (one sheet) | `sub-set-term` = Set package / Renew (`term-sheet-new` / `term-sheet-renew`); Edit `sub-edit-term` (`term-sheet-correct`, `term-reason-*`, `term-no-changes`); `term-renew-start` (a running term's fixed start); `term-error` | 20, 61, 81, 88, 93, 94 |
| price sheet `sub-set-price`, `price-amount`, `price-currency`, `price-save` | removed — a price change is an Edit (correction) | 88 |
| transfer wizard `transfer-sub-currency` | removed (EGP only) | — |
| Account `account-currency` (select), `account-timezone` (select), `account-timezone-device`, `account-*-status` for both | `account-currency`, `account-timezone` are read-only rows (EGP; the device zone); `role-account` wraps the page | 93 |
| — | payments: `client-payments`, `pay-balance`, `pay-recorded`, `pay-outstanding`, `pay-record`, `pay-list`, `pay-row`, `pay-reversed`, `pay-actions`, `pay-correct`, `pay-reverse`, `pay-form`, `pay-term`, `pay-amount`, `pay-method-<cash·mobile_wallet·instapay>`, `pay-date`, `pay-reference`, `pay-reason`, `pay-save`, `pay-error`, `pay-reverse-form`, `pay-reverse-reason`, `pay-reverse-save` | 94 |
| Business Overview `biz-money` (`data-currency`), `biz-attention-*`, `biz-currency-note` | `biz-booked`, `biz-collected`, `biz-due`, `biz-lost`, `biz-reversed`, `biz-outstanding`, `biz-overdue`, `biz-credit`, `biz-booked-all`, `biz-collected-all`, `biz-active-paying`, `biz-coverage`, `biz-trend` (`-legend`, `-month`, `-table-toggle`, `-table`, `-empty`), `biz-methods` (`-row`, `-scope-*`), `biz-pipeline` (`-row` with `data-key`), `biz-package-mix`, `biz-payments-error`; kept `biz-definitions`, `biz-month-range`, `biz-count-<state>` | 93, 94 |
| Exports | new `biz-export-payments` | 94 |
| P2 read-only | `message-readonly`, `plan-read-only`, `plan-read-only-renew` | 94 |
| Final review (2026-10-22): payments not linked to a package | new `biz-unlinked` (Overview coverage note), `pay-unlinked` (card note), `pay-no-term` (payment form, client with no package) | 95 |
| B3.9: states, shell, progress views | new: `skip-link`, `error-boundary`; states `checkins-offline/-error`, `timeline-offline/-error`, `assessment-offline/-error/-not-submitted`, `coach-invite-offline/-error`, `plan-history-offline`, `assign-clients-offline`, `incoming-transfers-error`, `outgoing-transfers-error`, `summary-plan-partial`, `summary-plan-failed-<kind>`, `summary-week-sessions`, `plan-offline-<kind>`, `progress-week-offline`; progress views `body-weights(-offline/-error/-empty)`, `body-latest-weight`, `body-weight-change`, `body-weight-list`, `body-measurements`, `measurements-offline/-error`, `measure-compare(-row)`, `coach-view-cardio`, `cardio-plan(-offline/-error)`, `cardio-plan-session`, `cardio-session-state`, `cardio-logged(-row)`, `cardio-day-offline/-error`, `coach-view-photos`, `photos-offline/-error/-empty`, `coach-view-nutrition`, `nutrition-view-offline/-error`, `day-offline/-error`, `day-activity`; Today `today-detail-context`. Removed: `policy-requireCoachApproval` (owner D6) | 89, 96, 97 |
