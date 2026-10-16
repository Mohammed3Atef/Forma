# B3 — Coach route migration

> Living document for the coach URL changes of B3 (blueprint §5.3). **B3.1 delivered the shell, the Me hub and the navigation contract**; routes whose replacement screen belongs to a later milestone keep their current page until that milestone ships, so nothing a coach can reach today disappears in between.
> Code: `src/config/coachNav.ts` (destinations, active tab, Back ownership), `src/lib/navContract.ts` (semantic parents), `src/apps/CoachApp.tsx` (routes), `src/components/coach/CoachShell.tsx` (chrome). Tests: `src/config/coachNav.test.tsx`, `src/lib/navContract.test.tsx`, `src/components/coach/CoachShell.test.tsx`, `e2e3/specs/85-b3-coach.spec.ts`.

## 1. Destinations (B3.1)

| Destination | URL | Phone (< 768) | Tablet (768–1023) | Desktop (≥ 1024) |
|---|---|---|---|---|
| **Today** | `/coach/dashboard` (today's dashboard screen until B3.2) | tab | collapsed rail | labelled rail |
| **Clients** | `/coach/clients` | tab | rail | rail |
| **Messages** | `/coach/messages` (unread badge) | tab | rail | rail |
| **Library** | `/coach/library` (+ "Programs" segment → templates) | tab | rail | rail |
| **Me** | `/coach/me` (**new**) | avatar in the header | avatar at the rail's foot | avatar + name at the rail's foot |

Removed from the coach (still used by the admin shell): the ☰ menu sheet, the old bottom bar (Dashboard · Clients · Messages · Revenue), the grouped sidebar, the floating WhatsApp button (Help & support is in Me). The notifications bell **stays in the header until Today's queue lands in B3.2** (O-5), and it now honours the unsaved-changes guard.

## 2. Route table

| Old | New | Handling | Milestone | B3.1 status |
|---|---|---|---|---|
| `/coach` | Today | redirect to `/coach/dashboard` on **every** breakpoint (was Clients on phones — IA-K01) | B3.1 | **Done** |
| `/coach/dashboard` | Today | same URL; content becomes the queue | B3.2 | URL unchanged; Today tab |
| `/coach/me` | Me hub | **new** route | B3.1 | **Done** |
| `/coach/assessments`, `/coach/checkins` | Today (filtered queue) | redirect `/coach/dashboard?focus=…` | B3.2 | Pages kept; reachable from Me › Coaching; light **Today** |
| `/coach/adherence` | Clients sorted by activity | redirect `/coach/clients?sort=activity` | B3.3 | Page kept; Me › Coaching; lights **Clients** |
| `/coach/notifications` | Today | redirect (O-5) | B3.2 | Page kept (the bell opens it); lights **Today** |
| `/coach/clients` (`?new=1`, `?q=`) | Clients | same URL | — | Tab |
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
| Me pages (`/plan`, `/settings`, `/revenue`, `/reports`, `/subscription-plans`), `/coach/templates`, the tools in Me › Coaching | the shell header (`shell-back`) |
| Client workspace + editors, message thread, template preview / editor, Notifications | the page itself (rebuilt with one header in B3.4–B3.7); the shell adds none |

## 5. Unsaved-changes guard — every exit

Tab bar, rail, rail Me, header avatar, shell Back, notifications bell and every ⌘K command go through `confirmLeave()`. A browser / hardware Back cannot be intercepted with the app's `BrowserRouter` (no data router) — the editors' per-coach drafts (C3) keep the work, and `beforeunload` covers reload / close (B1 known limit, unchanged).

## 6. Test selector changes (B3.1)

| Old | New | Specs |
|---|---|---|
| `coach-sidebar` (coach) | `coach-rail` (admin keeps `coach-sidebar`) | 20, 46, `_b-helpers.appReady`, `_d-layout` |
| `sidebar-coachClients` | `rail-clients` | 20, 23 |
| coach nav keys `coachDashboard / coachClients / coachMessages / coachRevenue` | `today / clients / messages / library` (`nav-*` tabs, `rail-*` rail) | `_d-layout` |
| header avatar → `/coach/settings` (`getByRole(banner)` "Coach Amira") | `rail-me` / `me-button` → `/coach/me` | 23 |
