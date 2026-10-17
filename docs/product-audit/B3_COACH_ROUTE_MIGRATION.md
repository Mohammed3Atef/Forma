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
| `/coach/client/:id` (+ every workspace section) | Client › Summary · Plan · Progress · Profile | same URLs; new `…/plan`, `…/progress`, `…/profile` | B3.4 | Unchanged; lights **Clients** (NAV-K11) |
| `…/workout`, `…/nutrition`, `…/cardio` | editors (task flows) | same URLs | B3.5 | Unchanged |
| `…/view`, `…/view/:tab` | Client › Progress | redirect `…/progress?view=:tab` | B3.4 | Unchanged |
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
| `/coach/client/:id/<section>` (incl. `view`, `versions`) | `/coach/client/:id` | B1 |
| `/coach/client/:id` | `/coach/clients` | B1 (NAV-K08 refinement in B3.4) |
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
| Client workspace + editors, message thread, template preview / editor, Notifications | the page itself (rebuilt with one header in B3.4–B3.7); the shell adds none |

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
