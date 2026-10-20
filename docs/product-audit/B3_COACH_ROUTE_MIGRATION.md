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
| `…/versions/:kind` | editor History sheet | redirect `…/:kind?history=1` | B3.5 | Unchanged |
| `/coach/messages`, `/coach/messages/:clientId` | Messages | same URLs | B3.6 | Tab |
| `/coach/library?tab=…` | Library | same URL; `?tab=programs` added | B3.7 | Tab; "Programs" segment links to `/coach/templates` |
| `/coach/templates`, `/:id`, `/new`, `/:id/edit` | Library › Programs | list → `/coach/library?tab=programs`; editor URLs kept | B3.7 | Pages kept; light **Library**; Back → Library |
| `/coach/revenue`, `/coach/reports` | Me › Business | **new** `/coach/business`, old URLs redirect | B3.8 | Pages kept; Me › Business rows |
| `/coach/subscription-plans` | Me › Business › Packages | redirect `/coach/business?tab=packages` | B3.8 | Page kept; Me › Client packages |
| `/coach/plan` | Me › Forma subscription | same URL | — | Me › Forma subscription |
| `/coach/settings` | Me › Account / Preferences | same URL | — | Me › Account & preferences |

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
| `/coach/templates/:id/edit` → `/coach/templates/:id` → `/coach/templates` | **`/coach/library`** | B3.1 |
| `/coach/plan`, `/coach/settings`, `/coach/revenue`, `/coach/reports`, `/coach/subscription-plans` | **`/coach/me`** | B3.1 |
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
