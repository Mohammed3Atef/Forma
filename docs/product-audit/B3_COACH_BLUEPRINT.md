# B3 — Coach blueprint (B3.0)

> **Status (2026-10-17): approved by the owner with the decisions recorded in §13.** The security & ownership checkpoint **B3.0.1** (`B3.0.1_SECURITY_OWNERSHIP_PLAN.md`, B3-S07 rules in `B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md`) was approved and committed locally (`56b8365`). **B3.1 (Coach shell)** was approved and committed locally (`cdba889`). **B3.2 (Coach Today)** was approved with two follow-ups (B32-P1 freeze requests, NT-10 dismissals) and committed locally (`739cc33`) — `B3_IMPLEMENTATION_LOG.md` §B3.2, `B3_TODAY_QUEUE.md`, `B3_VISUAL_QA.md` §B3.2. **B3.3 (Clients directory)** was approved with decisions for B3.4 and committed locally (`28035b6`) — `B3_IMPLEMENTATION_LOG.md` §B3.3, `B3_CLIENTS_DIRECTORY.md`. **B3.4 (Client workspace)** was approved after a compatibility and privacy review against the previous client builds and committed locally — `B3_IMPLEMENTATION_LOG.md` §B3.4 (§8: the review), `B3_VISUAL_QA.md` §B3.4. **B3.5 (Plan editors)** is next.
> Scope: the coach experience. The client (B2), Super Admin, the marketing website, public authentication and legal pages are not redesigned.
> Sources: the Phase A audit (`00`–`18`, removal candidates), the B0 / B1 / B2 reports, and a code + server reconnaissance done for this blueprint (route map, feature inventory, API contracts). Facts marked **verified** were checked in the code for this document; facts marked **reported** come from the recon and must be re-checked before anything is built on them.
> §13 lists every decision that needs the owner. Nothing in §13 is assumed.

---

## 1. Repository state at B3.0 (verified 2026-10-15)

| Item | State |
|---|---|
| Branch / HEAD | `development` at `595e0af` ("update b1"); `f1151c0` (B0) below it |
| Remote | `development` is **2 commits ahead** of `origin/development` (B0 and B1 not pushed) |
| B2 | **Committed locally** after re-verification as `be3e357` "Phase B2: premium client experience" (77 files; O-1). Not pushed — `development` is 3 commits ahead of origin |
| Staged | Nothing |
| Owner edit | `docs/product-audit/B1_P1_TRIAGE.md` reformat with the stray `1o \| 0` row (line 20) — **preserved exactly**, not touched |
| Production | Runs RC2 `cf3a5d9` (deployed via CLI, per the Phase-4 release report). Nothing from B0–B2 is deployed |

**Implication for B3.** Several B2 files are shared with the coach (`Icon`, `charts`, `AssessmentView`, `EntityNotes`, `NotificationBell`, `navContract`, `noteTarget`, `index.css`, `useFillToBottomNav`). B2 is now its own commit (O-1), so B3 changes stay separable.

**Documents.** All requested documents exist. Three have different file names than the B3 brief uses: `04_DESKTOP_AUDIT.md` (brief: `04_COACH_DESKTOP_AUDIT.md`), `11_PWA_CACHE_OFFLINE_AUDIT.md` (brief: `…_SYNC_AUDIT.md`), `15_PRODUCT_JOURNEYS.md` (brief: `15_REAL_PRODUCT_JOURNEYS.md`); the removal candidates are at `docs/FORMA_PRODUCT_REMOVAL_CANDIDATES.md`.

---

## 2. Contracts B3 must preserve (B0 / B1 / B2)

Every row has a test that already guards it. B3 keeps the test green; a selector may change only with a documented reason (§10.3).

| # | Contract | Where it lives | Guarding tests |
|---|---|---|---|
| C1 | **A failed plan read is never an editable empty plan** (CO-01). Editor states `loading / offline / error / empty / ready`; Save not rendered before a plan exists | `usePlanEditor`, `PlanEditorStates` | unit `CoachWorkoutEditor` (3); api `planSafety` (9); e2e 61 |
| C2 | **Compare-and-swap plan saves.** `baseUpdatedAt` required; stale base → `CONFLICT` (`PLAN_CONFLICT:`); every save versioned; conflict banner "load latest / keep mine" | `api/_trpc/routers/clientPlans.ts`, `planApi.isPlanConflict` | `planSafety`; e2e 43 |
| C3 | **Drafts** per coach + client + kind in `gym-tracker/meta`; restored only if the server copy is not newer (`pickFreshDraft`); cleared on save / reload-latest / confirmed leave | `usePlanEditor`, `lib/draft.ts` | unit `draft`, `useUnsavedGuard` |
| C4 | **Unsaved-changes guard** on every in-app exit (shell nav, tabs, Back); "Leave" discards | `navGuardStore`, `useUnsavedGuard`, `useGuardedNav` | unit; e2e 23 |
| C5 | **Private notes** are private by default and filtered on the server; shared notes say so; assessment review note stored outside the client-readable object (CO-02 / CO-21) | `clientCoachNotes.ts`, `clientProfile.ts` | api `notePrivacy` (11); unit `CoachClientNotes`; e2e 61 |
| C6 | **Exact-match client lookup** (CO-03): exact email / phone only, ≤ 5 minimal results, rate-limited, audited; the other coach is never named | `adminUsers.searchClients`, `AddExistingClient` | api `clientLookup` (6); e2e 21, 61 |
| C7 | **Add Existing Client stays** (owner decision recorded here; see §13 O-3) | `AddExistingClient.tsx` | e2e 20, 21 |
| C8 | **Relationship + capacity rules**: one atomic slot reservation; at-capacity / expired / suspended reasons (`data.reason`) | `reserveClientSlot`, `capError` | api `coachClients`, `_capReservation`, `coachPlans`; e2e 50 |
| C9 | **Subscription ledger**: renewing archives the previous term with its price (CO-15); price pre-filled (CO-14) | `coach-clients/_service.ts`, `CoachSubscriptionPanel` | api `subscriptionHistory`; e2e 20, 61 |
| C10 | **Forma commercial model**: one public plan, configurable trial, monthly term, admin-controlled capacity and add-ons, renewal stacking, 24 h confirmation window | `api/coach-plans/*` | api `coachPlans` (renewal cases 1–11) ; e2e 11, 12, 50 |
| C11 | **Messaging engine**: idempotent send (`clientMsgId`), durable outbox (retry / discard / cancel upload), reactions, 2-minute edit/delete, voice, attachments, receipts, load older, honest attachment failures | `MessageThread`, `data/outbox/*`, `messages.ts` | api `messages`, `outboxIdempotency`; unit `outbox`; e2e 31, 32, 33, 40, 60 |
| C12 | **Composer never under the nav** with any banner (CO-04 / MS-01) | `useFillToBottomNav` | e2e 60 (EN + AR, 390–1280); real device R-17 |
| C13 | **No client sync in coach sessions** (PWA-04); coaches judged on their outbox only for sync status | `accountRuntime`, `syncTruth` | e2e 61 "no client sync calls"; certification |
| C14 | **Per-account isolation** (IndexedDB per uid; React Query cache owned by one account) | `localScope`, `sessionStore` cache owner | unit `localScope`, `accountRuntime`; e2e 10 |
| C15 | **Session ends only on a confirmed 401 / sign-out**; offline start keeps the verified identity | `sessionStore` | unit `sessionStore`; offline boot |
| C16 | **Updates install at a safe point**, never during critical work (an outbox send or an open editor counts) | `criticalWork`, `UpdateAvailable` | unit `UpdateAvailable`; prod-build PWA check |
| C17 | **Notification lifecycle**: one shared 25 s poll; no backlog replay; tasks resolve server-side; deep links via `notificationTarget` | `useNotifications`, `notificationTarget` | api `notificationLifecycle`; unit `notificationTaxonomy` |
| C18 | **Navigation contract**: in-shell tabs replace history, leaving a shell pushes; cold deep links Back to the semantic parent; external paths pass `isRolePath` | `navContract`, `useBack` | unit `navContract`, `useBack` |
| C19 | **Bilingual edits** never overwrite the other language (`applyLocalizedEdit`, `SecondLanguageField`) (EX-06 / FD-01) | `lib/localizedText.ts` | unit `localizedText` |
| C20 | **Numbers and dates** through `lib/format.ts` (Latin digits), Arabic-Indic input accepted (`NumericField`) | B1 | unit `arabicNumbers`, `NumericField` |
| C21 | **Screen states**: data never replaced by an error; offline ≠ empty; errors have Retry | `ScreenState` | e2e 42 (coach revenue, messages, clients, plan) |
| C22 | **Upload honesty** while MD-01/02/03 are open: nothing says "Saved" without a server acknowledgement; no feature may assume personal media is private | B0 / B1 | unit `photoUploadHonesty`, `VideoHonesty` |
| C23 | **One banner region per shell**, priority-ordered (VS-11) | `BannerRegion`, `useBannerSlot` | unit `Banner`; e2e 60 |
| C24 | **Polling budget** over 2 minutes idle on coach screens (`messages.list` ≤ 33, `coachThreadsSummary` ≤ 8, `notifications.list` ≤ 7, others ≤ 6; no duplicate concurrent GETs) | — | e2e 47 |
| C25 | **The B2 client** is unchanged by B3. Any shared-component change re-runs the client suites (30, 31–33, 40, 42–47, 61, 70, 80) | — | — |

PWA-06 remains **mitigated only** (B0). MD-01 / MD-02 / MD-03 remain **open, owner-deferred**.

---

## 3. The coach today (inventory)

### 3.1 Routes (31 coach routes + 2 interstitials) — `src/apps/CoachApp.tsx`

| Path | Screen | Gate | How it is reached today |
|---|---|---|---|
| `/coach` | redirect: ≥ 768 → `/coach/dashboard`, else `/coach/clients` | — | role home; catch-all; after release |
| `/coach/dashboard` | Dashboard (`?tab=overview\|clients\|engagement\|content`) | — | bottom nav, sidebar, menu; login landing ≥ 768 |
| `/coach/clients` | Clients (`?new=1` add sheet, `?q=` search) | add needs write + online | bottom nav, sidebar, menu, many links |
| `/coach/assessments` | Assessments list | — | sidebar / menu, dashboard cards, palette |
| `/coach/checkins` | Check-ins overview + sequential review queue | — | sidebar / menu only |
| `/coach/adherence` | Adherence ranking | — | sidebar / menu only |
| `/coach/reports` | Reports (KPIs, CSV exports, ranking) | — | sidebar / menu, engagement panel, palette |
| `/coach/revenue` | Revenue (17 cards) | — | bottom nav, sidebar, menu |
| `/coach/plan` | "My Plan" (Forma subscription, capacity, add-ons, requests) | — | sidebar / menu, banners, gate, cap-blocked, account card |
| `/coach/subscription-plans` | "Client Plans" (billing packages) | write + online | sidebar / menu only |
| `/coach/client/:id` | Workspace layout → Overview | — | clients rows, dashboard, palette, thread header |
| `…/assessment` | Assessment (review, private note, reset) | — | tab; notification `assessment_submitted` |
| `…/checkins` | Client check-ins (request, review) | — | tab; notification `checkin_submitted` |
| `…/workout` · `…/nutrition` · `…/cardio` | Plan editors | `CoachPlanGate` | tabs, "Edit plan", Manage sheet, assessment "Build" |
| `…/notes` | Notes | — | tab (More < 1024) |
| `…/subscription` | Subscription panel (7 actions) | — | tab (More); notification `freeze_requested` |
| `…/history` | Coaching timeline | — | tab (More) |
| `…/view` · `…/view/:tab` | "View as client" (activity, nutrition, cardio, measurements, photos, progress) | — | Overview "View activity"; Progress tab |
| `…/versions/:kind` | Plan version history (restore) | **none** (restore not gated) | editor "History" chip |
| `/coach/library` (`?tab=exercises\|foods\|groups\|supplements`) | Library | — | sidebar / menu, quick actions, palette |
| `/coach/templates` · `/new` · `/:id` · `/:id/edit` | Templates list, editor, preview | editor gated | sidebar / menu, checklist, palette |
| `/coach/messages` · `/coach/messages/:clientId` | Inbox (+ desktop split) · thread | — | bottom nav, sidebar, workspace, notifications |
| `/coach/notifications` | Notifications feed (shared with admin) | — | bell only |
| `/coach/settings` | Account (shared `RoleAccount`) | — | sidebar / menu, avatar, checklist |
| `/invite/:code`, `/reset/:token` | Signed-in interstitial | no shell | external links |

**Workspace rail:** 11 tabs (overview, workout, nutrition, cardio, progress, assessments, checkins, messages, notes, subscription, history); below 1024 px four show and seven hide in a More sheet. Progress and Messages leave the workspace (push).

### 3.2 Navigation today (shared `ResponsiveShell`, also used by admin)

| Width | Chrome |
|---|---|
| < 768 | `BrandBar` (logo, bell, ☰ menu sheet with 13 rows), `BottomNav` (Dashboard · Clients · Messages · Revenue), WhatsApp FAB |
| 768–1023 | icon-only sidebar (13 items in 5 groups), `DesktopTopBar` (search → ⌘K palette, sync status, bell, avatar) |
| ≥ 1024 | expanded sidebar (collapsible) |

Duplicated paths: Dashboard / Clients / Messages / Revenue sit in three nav systems; "Add client" has five entries; My Plan seven; inside the workspace, "Edit plan" = Workout tab = Manage sheet, "Message" = Messages tab = Overview card; editors show two Back controls. The bell and the ⌘K palette navigate **without** the unsaved guard (NAV-K05, **reported**).

### 3.3 Feature inventory (what must survive)

| Area | Features (all preserved unless §12 says otherwise) |
|---|---|
| Dashboard | greeting, add client, hero stats, trial banner + usage, checklist, "N need you today", at-risk card, attention list (6) with per-row CTA, quick actions, 5 metric cards, renewals (6), tabs Clients / Engagement / Content |
| Clients | search (name / email / phone), state chips (all, active, trial, frozen→"Paused", expiring, expired, none), desktop table + preview pane, mobile cards, paging 20, error + Retry, usage strip + limit link, **incoming transfer requests (approve / reject)**, add sheet: **invite** (name / email / phone, package picker, generate, copy / share / WhatsApp / revoke, pending list, cap-blocked) and **Add Existing** (exact search, assign with package, request transfer with reason, cancel, release own) |
| Workspace | header (back, client switcher with search, Message, Edit plan), Overview (phone, stat tiles, view activity, manage sheet: edit plans / add note / **release**), assessment (answers, private note, mark reviewed, reset, build links), check-ins (request, expand, feedback, mark reviewed), notes (add with visibility toggle, badges), subscription (freeze request decide, status, set term / renew, set price, freeze / unfreeze, extend +30, end, cancel, history), history timeline, view-as-client (day activity, nutrition day log, cardio, **measurement entry**, photos, weight chart, anchored notes on every entity) |
| Training editor | plan → days (add, title, focus, duplicate, move, remove) → sections (add, title, kind, move, duplicate, delete) → exercises (picker multi-select with batch sets / reps / rest, quick create, move, move-to-section, duplicate, delete); exercise form (name, muscle, category, equipment, presets, warm-up sets, sets, reps, rest, video URL or upload with honesty check, bilingual notes, progression notes, tags); library link / custom override / update from / reconnect to library; save as template; versions (save new with reason, history, restore); client context panel; draft; CAS; guard |
| Nutrition editor | plan name, targets (kcal / P / C / F / water), planned-vs-target table, substitution policy (3 switches), meals (label, slot, add / remove), foods (library picker or food search, bilingual name, quantity, macros, approved-alternatives group, allow custom swap, save / remove), supplements (library chips, name, dose, timing, add / remove) |
| Cardio editor | plan name, sessions (type, duration, frequency, notes, add / remove) |
| Check-ins overview | batched list, sections (needs review / awaiting / reviewed / not requested), overdue pill, **sequential review queue** (context panel, comparison with last week, feedback, skip, mark reviewed & next), bulk "send reminders" |
| Assessments / Adherence / Reports | status-sorted list; workouts-7d ranking; KPIs, CSV exports (clients, subscriptions, revenue), ranking |
| Revenue | collected / due / lapsed, renewals table, subscription donut + counts, growth / retention / churn |
| Library | 4 tabs (exercises, foods, groups, supplements), search, muscle chips, **load starter library**, new / view / edit / delete, desktop tables, paging 25, bulk select + delete, library→template sync with result toast + retry |
| Templates | list (search, goal chips, grid, paging 24, bulk delete, load starter), preview (edit, **assign to client**, duplicate, delete), editor (name, goal, split, plan builder) |
| Messages | roster inbox (search, all / unread / broadcasts), desktop split with embedded thread, mobile thread route, **broadcast** (category, all / selected recipients, body), full `MessageThread` |
| My Plan | Forma state, ends, price, request subscription / renewal preview, capacity (usage, over-capacity, breakdown), active add-ons, offers + request, requests (cancel) |
| Client Plans | packages list / add / edit / delete (name, duration, unit, price, order, trial) |
| Account | avatar (upload / crop / remove), name, phone, timezone, currency, language (English / العربية / مصري), change password, sign out, plan card |
| Global | ⌘K palette (commands + clients / exercises / foods / templates), notifications feed (mark all), banners (plan lapsed / ending, capacity, plan request, announcements), WhatsApp FAB |

### 3.4 Data and API dependencies (per destination)

| Destination | Reads (polling) | Writes |
|---|---|---|
| Dashboard / Today | `coachClients.listMyClientUsers`, `.dashboardSummaries` (workouts 7d, last activity, assessment status, `toReview`), `.list({status:'all'})` (subscriptions → renewals, revenue), `messages.coachThreadsSummary` (20 s), templates counts, `coachPlans.me` | — |
| Clients | `listMyClientUsers`, dashboard query, `coachPlans.me`, `transfers.list(incoming)`, `invites.list` | `invites.create/revoke`, `adminUsers.searchClients`, `coachClients.assign`, `transfers.create/resolve` |
| Workspace | `adminUsers.get`, `profile.get`, `assessment.get`, `coachClients.get`, `logsWeight.list`, `logsWorkout.list`, `coachNotes.list`, `workoutPlan/nutritionPlan/cardioPlan.get`, `checkIns.list`, logs `*.get` per day (view nutrition polls 15 s), `photos.list`, `measurements.*` | notes create, check-in request / review, assessment setCoachNotes / review / reset, measurements save, `updateSubscription`, `subscriptionRequest.decide`, `coachClients.end` |
| Editors | plan `.get`, `planVersions.list`, `coachAssets.*.list/get` | plan `.save` (CAS), `planVersions.restore`, `workoutTemplates.save` |
| Messages | `coachThreadsSummary` (20 s), `messages.list` (open thread 5 s, full refresh every 4th tick) | `send` (idempotent), `edit`, `delete`, `react`, `markRead`, media upload |
| Library | `coachAssets.exercises/foods/foodGroups/supplements/workoutTemplates.list`, `foodSearch.search` (live wger proxy) | asset save / delete, `seedStarterLibrary` |
| Me | `coachCommercial.myOverview` (60 s), `coachPlanRequests.mine` (60 s), `coachAssets.billingPlans.list`, dashboard query (revenue) | requests submit / cancel, billing plans save / delete, `updateSelf`, password |
| Global | `notifications.list` (25 s, shared) | `markRead` |

**Server facts B3 relies on** (reported unless marked):
- Coach → client access requires an **active relationship and an active coach account** for every client-data procedure (`api/client/_lib/access.ts`), except messaging (see B3-S04).
- Plans: CAS on `updatedAt` only, versioned; **no shape or bilingual validation** on client plans (passthrough); templates and library are zod-validated (`LocalizedText` for exercise notes, food name, meal label, supplement dose / timing).
- Templates: no CAS; duplicate and assign are client-side (assign = `workoutPlan.save` with `replaceExisting`, no notification). **No cardio template collection; nutrition templates have server CRUD but no UI.**
- Check-ins: request is idempotent; review has no status precondition (B3-S09).
- Directory: `listMyClientUsers` returns the full `PublicUser` per client (more than a list needs); `dashboardSummaries` has no plan-existence flags (B3-C09).
- Revenue: computed **in the browser** (B3-S08).
- Six notification types are never produced (B3-S12) — Today must derive states from data, not notifications.

### 3.5 Server gaps found during B3.0

These are **not UI problems** and **not fixed by a redesign**. Each needs an owner decision because fixing it changes an API or a business rule. All are in the backlog with acceptance tests.

| ID | Finding | Severity | Verified | Recommendation |
|---|---|---|---|---|
| B3-S01 | `coachClients.list({clientId})` returns **every** relationship doc for a client — including another coach's subscription price, history and invite code — to any coach who ever had a relationship with that client, ended ones included | **P1 privacy** | **verified** | Fix in B3.4 as an approved additive restriction (return only the caller's own doc unless `users.read`); server test |
| B3-S02 | `coachNotes.update/delete` have no author check; after a `keep_plans` transfer the new coach reads, edits and deletes the previous coach's private notes | **P1 privacy** | **verified** | Owner decides the policy (author-private vs relationship-private); then a server rule + test |
| B3-S03 | Public `invites.getByCode` returns the whole invite (invitee email, phone, name, price) | P2 privacy | **verified** | Return only what the claim screen needs; rate-limit |
| B3-S04 | A suspended coach can still read and send messages (thread access ignores the coach's account status) | P2 | **verified** | Decide with MS-17 (suspended clients) |
| B3-S05 | `updateSubscription` edits an **ended** relationship's subscription | P2 | **verified** | `CONFLICT` on a non-active relationship; test |
| B3-S06 | Client-subscription expiry / read-only is enforced only in the browser | P1 (business) | reported | Owner decision on server enforcement (release hardening) |
| B3-S07 | "Extend" adds days to a past end date while the UI preview assumes `max(now, end)`; "Freeze" applies immediately even with a future start and never extends the end date | P2 (business) | **verified** | Make preview and server agree; **do not change the rule without owner approval** |
| B3-S08 | Revenue: browser-computed, mixed currencies summed, browser-local month | P2 (financial) | reported | Document; fix only with authorization and tests |
| **B3-S01b** | `adminUsers.get` returns a user's **full contact profile** to anyone with a relationship doc in either direction **in any status**, so an ended coach keeps the client's email / phone and a former client keeps the former coach's | **P1 privacy** | **verified** | Full profile only for an **active** relationship; redacted name card otherwise (B3.0.1) |
| **B3-S14** | Message threads are keyed by client: after a transfer the **new coach reads the previous coach's whole conversation** with the client. Messages carry the conversation's `coachId` since the Mongo migration; older ones may not | P1 privacy | **verified** | **Owner R-4 = Option C** (2026-10-16): per-coach conversations enforced server-side; the client keeps earlier conversations read-only (B3.0.1 plan §9) |
| B3-S09 – S13 | Check-in review status precondition; assessment draft resets a reviewed assessment; restore without CAS; attribution dropped on exercise save; never-produced notification types; stale fields on re-assigned relationships | P2–P3 | reported | Per backlog |

---

## 4. Coach journeys (Phase A J1–J5) → B3 target

| Journey | Today (Phase A evidence) | B3 target | Findings |
|---|---|---|---|
| **J1 Morning triage** | 6 taps + typing, only if you already know which client; 9 / 10 rows "Needs attention"; bell 6 vs Messages 3; review hidden under "More" | Open the app on **Today**: a ranked queue with one reason and one action per row; review a check-in in place (sequential review sheet) in ≤ 3 taps; the row disappears when resolved | JR-02, CO-05, CO-06, CO-13, CO-17, DT-02 |
| **J2 Modify a program** | 10 taps, three Back controls, mandatory section level, versioning paragraph, alphabetical picker, Back lands on Clients | Client › Plan › Workout opens a **full-screen editor**: days list exercises directly, one Back, sticky save bar, history as a sheet; picker ranked with media indicator (media data is B4); ≤ 6 taps to add an exercise and save | JR-07, CO-10, CO-24, CO-25, NAV-K02, NAV-K08 |
| **J3 Library** | empty library until "Load starter", squeezed search, 17 text rows, no "add to plan", 835 KB per open | Library with a full-width search, segments, honest media states and "Use in plan / template"; starter content explained up front; payload work is B4 (PF-11) | JR-06, CO-23, EX-08, EX-15, TB-04 |
| **J4 Messaging and back** | 4 taps; Back returns to the client ✅ | **Keep** the behaviour; split view on tablet / desktop with URL-backed selection; per-thread drafts | DT-01, MS-04, MS-07 |
| **J5 Renewal** | 4 taps, 7 competing actions, lapsed clients only as a count | Today names renewals due ≤ 7 days and lapsed clients with Renew / Message; Profile › Subscription has one primary "Renew / change term" | JR-03, CO-14-R, CO-16, DT-06, TB-02 |

---

## 5. Target information architecture

### 5.1 Destinations

**Primary (tabs on phones, rail on tablet / desktop): Today · Clients · Messages · Library.**
**Me** behind the avatar: **Business** (revenue, renewals, packages, exports) · **Forma subscription** (state, capacity, add-ons, requests) · **Account** · **Preferences** · **Help**. No ☰ menu, no FAB, no bell (O-5).

| Destination | Answers | Contains |
|---|---|---|
| **Today** | "Who needs me, for what, in what order?" | One overview line (counts that are actionable), then the **queue** (§6.1). Onboarding checklist only while incomplete. Forma notices only when they block work |
| **Clients** | "Find a client; see my roster" | Search, task + state filters, sort, rows with reason · subscription days left · last workout; desktop table; Add client (invite **and** Add Existing); incoming / outgoing transfers |
| **Client** (pushed) | "How is this client doing; what do they need?" | Sticky client header + **Summary · Plan · Progress · Profile** (§6.3) |
| **Messages** | "Conversations" | Conversation list newest-first with unread; thread; split view ≥ 768; broadcast in the overflow |
| **Library** | "My reusable content" | **Programs** (workout templates; nutrition templates if O-9) · **Exercises** · **Foods** (+ swap groups) · **Supplements** |
| **Me** | "My business and account" | Business · Forma subscription · Account · Preferences · Help & support (WhatsApp) · Sign out |

### 5.2 Shell by breakpoint (same IA everywhere)

| Width | Chrome |
|---|---|
| < 768 | `AppHeader` (title or client identity, search on Clients / Today, avatar → Me) + `TabBar` (4 tabs, Messages unread badge). Task flows (editors, check-in review, broadcast) take the full screen |
| 768–1023 | collapsed `SideRail` (icons + tooltips, avatar at the bottom) + header; two-column lists; split Messages |
| ≥ 1024 | expanded `SideRail` (labels, sections, Me entry); dense tables; split editors; thread docked in the client (optional, O-12) |

Admin keeps `ResponsiveShell` unchanged (no admin redesign). The coach moves to a new `CoachShell` built from the same B2 primitives as `ClientShell`.

### 5.3 Route plan (URLs kept wherever they already point at the right place)

The full table becomes `B3_COACH_ROUTE_MIGRATION.md` in B3.1. Proposal:

| Old | New | Handling |
|---|---|---|
| `/coach` | **Today** | redirect to `/coach/dashboard` on **every** breakpoint (IA-K01) |
| `/coach/dashboard` | **Today** | **same URL**, new screen (login landing and spec 10 keep working); `?tab=*` ignored |
| `/coach/assessments`, `/coach/checkins` | Today (queue filtered to assessments / check-ins) | redirect `/coach/dashboard?focus=assessments\|checkins` |
| `/coach/adherence` | Clients sorted by workouts 7d | redirect `/coach/clients?sort=activity` |
| `/coach/notifications` | Today | redirect (O-5); admin keeps its own Notifications page |
| `/coach/clients` | Clients | same URL (`?new=1`, `?q=` kept) |
| `/coach/client/:id` | Client › **Summary** | same URL |
| `…/workout` · `…/nutrition` · `…/cardio` | Client › **Plan** › editor (full-screen task) | same URLs (notification and draft keys depend on them) |
| — | Client › **Plan** (landing) | **new** `…/plan` |
| `…/view`, `…/view/:tab` | Client › **Progress** | redirect `…/progress?view=:tab` |
| — | Client › **Progress** | **new** `…/progress` |
| `…/checkins` | Client › Progress › Check-ins (review opens the review sheet) | same URL (notification target `checkin_submitted`) |
| `…/assessment` · `…/notes` · `…/subscription` · `…/history` | Client › **Profile** sections | same URLs render Profile scrolled to the section (notification targets `assessment_submitted`, `freeze_requested`) |
| — | Client › **Profile** (landing) | **new** `…/profile` |
| `…/versions/:kind` | editor with the History sheet open | redirect `…/:kind?history=1` |
| `/coach/messages`, `/coach/messages/:clientId` | Messages | same URLs |
| `/coach/library?tab=…` | Library | same URL; `?tab=programs` added |
| `/coach/templates`, `/:id`, `/new`, `/:id/edit` | Library › Programs | list → `/coach/library?tab=programs`; editor URLs kept; preview opens the editor read-first (RM-27) |
| `/coach/revenue`, `/coach/reports` | Me › Business | **new** `/coach/business` (`?tab=overview\|renewals\|packages\|exports`); old URLs redirect |
| `/coach/subscription-plans` | Me › Business › Packages | redirect `/coach/business?tab=packages` |
| `/coach/plan` | Me › Forma subscription | same URL (banners, gates, specs 11 / 12 / 50) |
| `/coach/settings` | Me › Account / Preferences | same URL |
| — | Me (hub) | **new** `/coach/me` |

Stored notification routes (`/coach/client/:id/checkins`, `/assessment`, `/subscription`, `/coach/messages/:id`, `/coach/plan`) all keep resolving. Semantic parents in `navContract` are updated: editor → Plan, Profile sections → Profile, Progress → Summary, Client → Clients, Business / Forma subscription / Account → Me → Today.

---

## 6. Screen blueprints

### 6.1 Today (B3.2)

**Principle:** a queue, not a report. Every row = **who · why (with its source) · one action**. Nothing labelled "Needs attention" without a reason. No engagement or risk scores.

| Queue item | Grounded source (existing data) | Priority | Action | Resolves when |
|---|---|---|---|---|
| Check-in to review | `checkIns.listForCoachClients` → `latest.status = submitted` (also an unresolved `checkin_submitted` task) | 1 | **Review** → sequential review sheet (existing component, reused) | coach marks reviewed (server resolves the task) |
| Assessment submitted / updated after review | `dashboardSummaries.assessment ∈ {submitted, updated_after_review}` | 2 | **Review assessment** sheet (highlights first) | marked reviewed |
| Freeze request | unresolved `freeze_requested` task in the coach feed | 2 | **Decide** (accept with dates / decline) | decide + subscription update |
| Incoming transfer request | `transfers.list({type:'incoming'})` | 2 | **Approve / Reject** (approve not styled primary) | resolved |
| Unread conversation | `coachThreadsSummary.unreadForCoach > 0` | 3 | **Reply** → thread | thread read |
| Renewal due ≤ 7 days | relationship subscription `endAt ∈ (now, now+7d]`, status active / trial | 3 | **Renew** (Profile › Subscription sheet) · Message | term renewed |
| Lapsed this month | subscription expired / cancelled with `endAt` this month | 3 | **Renew** · Message · Release (overflow) | renewed or released |
| No workout in N days | `dashboardSummaries.lastActivity` older than N days **and** subscription active / trial **and** not paused **and** client added ≥ N days ago | 4 | **Message** · open Summary | a workout is logged |
| Client without a training plan | **no batched source today** (B3-C09) | 4 | **Start from template / Build plan** | plan saved — **only if O-7 approves an additive summary field; otherwise omitted** |

- Overview line: "3 check-ins · 2 messages · 1 renewal" (counts only of queue groups). No KPI wall; business numbers live in Me › Business.
- Empty state: "You're all caught up" + the next scheduled things (renewals later this month). New coach: the onboarding checklist (profile, first client, first program) — hidden once done.
- Desktop ≥ 1024: two panes — queue left, the selected item's context and action right (review, reply, renew) with J / K navigation; same actions exist on mobile one tap deeper.
- States: loading skeleton mirroring the queue; offline = last loaded queue marked stale; error = Retry; partial failure = the failing group says so (no false "all caught up").
- Banners: only blocking Forma states (plan lapsed / suspended, at capacity with a pending add) appear app-wide; "plan ending" and announcements show on Today only (CO-30, O-6).

### 6.2 Clients (B3.3)

- **Search** (name, email, phone — local over the roster; exact external lookup stays in Add Existing).
- **Filters (chips):** task filters derived from the Today queue — *Needs you* (any queue item) · *Check-in to review* · *Renewal due* · *Lapsed* — and state filters as shipped in B0 — *Active · Trial · Paused · Expiring · Expired · Pending · No package*. ("No plan" is renamed "No package" because it means no subscription term, CO-36.)
- **Sort:** needs-you first (default) · name · last workout · days left · workouts 7d (replaces the Adherence page).
- **Row:** avatar, name, reason line (the queue reason or "Last workout 2 days ago"), state chip, days left. Mobile list with "load more"; tablet two columns; desktop table (client · next action · last workout · workouts 7d · subscription) with sortable headers, column priority instead of horizontal scroll, row action menu (TB-01, TB-07, TB-08).
- **Add client** (one "+" in the header; O-3): a sheet with **Invite a new client** and **Add an existing Forma client** — both kept. Fixes: the silent auto-revoke of uncopied invites becomes explicit (CO-37, O-4); errors and capacity blocks inline; the B0 lookup rules unchanged.
- **Transfers:** incoming requests in the list header (and Today); **outgoing requests** listed with status and Cancel (B3-C06).
- **Capacity:** the usage strip only near or at the limit, linking to Me › Forma subscription.
- **Privacy:** rows show only what the list needs; email / phone appear in Profile, not in search results.

### 6.3 Client workspace (B3.4) — Summary · Plan · Progress · Profile

**Header (sticky, compact):** Back · avatar + name (opens the client switcher) · subscription chip with days left · **Message** · overflow (Call, Switch client, Request transfer?, **Release** — destructive, confirmed, names the consequences, error state, history replaced after). One header for every section; editors are task flows with their own header.

| Section | Contents | Sources |
|---|---|---|
| **Summary** | This week vs plan (sessions done / planned, 7 d and 28 d, each number with its window); last workout; weight trend; open items for this client (check-in to review — reviewed **in place**, assessment, freeze request, renewal); latest coach note; next actions (Plan, Message, Request check-in) | logs, plans, check-ins, assessment, notes, relationship |
| **Plan** | Cards: **Workout**, **Nutrition** (+ targets), **Cardio** — each with name, last updated, "Edit" and History; empty plan → "Start from template" / "Build"; save-as-template | plan `.get`, versions, templates |
| **Progress** | One date context (week navigation): activity calendar (workouts, meals, cardio) with tap-through to a day's log; Body (weight chart, measurements with **coach entry kept**, photos with honest upload states); check-in history with feedback; anchored notes on entities with a visibility label | logs, measurements, photos, check-ins |
| **Profile** | Assessment (highlights first, mark reviewed, private note, reset); **notes** (private by default, shared ones say so); subscription (one primary **Renew / change term**, Freeze secondary, Extend / Set price / End / Cancel in an overflow with consequences; freeze requests; history); contact; coaching history in one line | assessment, notes, relationship, timeline |

- Desktop: Summary as a 2–3 column grid; Progress as a week grid + log table + body charts; Profile in two columns.
- Behaviour: switching sections **replaces** history and keeps the client; editors and the thread **push** and return to the section they came from; switching client keeps the section; a client change never shows the previous client's data (keys include `clientId`; skeleton until the new client loads). NAV-K08 rule: Back from any section returns to where the client was opened from (Today, Clients or Messages), not to Summary.
- The "view as client" pages are retired as a destination; their capabilities move into Progress (§12).

### 6.4 Plan editors (B3.5)

**Shared rules (all three editors):** full-screen task flow · one Back owned by the editor header · sticky bottom bar (save status + Save) that never covers inputs and lifts above the keyboard · History as a sheet (list, restore — restore gated like editing, B3-C02) · the B0 load gate, CAS, conflict banner and drafts unchanged (C1–C4) · every exit through the guard, including the palette and notifications (NAV-K05) · Arabic-Indic digits in every numeric input (`NumericField`) · bilingual fields with `SecondLanguageField` everywhere the model is `LocalizedText`.

**Training:**
- Days list exercises directly. **Sections stay in the data model** (no migration); a day with one default section shows no section header; named sections (warm-up, working, finisher…) show as grouping headers (O-8).
- Exercise row: name, `sets × reps · rest`, video indicator; tap opens a **programming sheet** (sets, warm-up sets, reps, rest, **RIR**, **tempo**, notes EN / AR, progression notes, video) — library metadata (muscle, category, equipment, tags) edited only in the Library (CO-26-R). RIR and tempo already exist in the model and are shown to clients but have no editor today (B3-C03, O-10).
- Reorder with accessible move up / down (and drag where supported — never drag-only).
- Picker: search with muscle / equipment filters, media indicator, "recently used", "Create new" as the last row; previews and ranking quality are B4 (EX-14).
- Desktop: structure tree (days → exercises) left, the selected day's exercise table right, sticky bar.
- Templates: "Save as template", "Start from template" in an empty Plan. Assign stays `replaceExisting` with a version reason (C2).

**Nutrition:** targets first (kcal, P, C, F, water) with planned-vs-target as four rows (no sideways table); meals collapsed to name + kcal, slot as one select, **bilingual meal label**; one food sheet with library + food-search; foods / meals / supplements **reorderable**; delete via row menu with confirm or undo; substitution policy kept; **beverage and general notes editable** (they are shown to clients today but have no editor, B3-C03); supplements dose / timing bilingual (B3-C04).

**Cardio:** a small section (type, duration, frequency, notes **bilingual**); reorder; steps / cardio-minute **targets** become editable here if O-11 approves re-adding the `coachTargets.get/set` wrappers (the server procedures exist; clients already see these targets).

**Template editor:** same guard, per-coach draft key (B3-C01); CAS on templates is an API change (O-13).

### 6.5 Messages (B3.6)

- **Engine unchanged** (C11): `MessageThread`, outbox, idempotency, receipts, polling intervals.
- Inbox: conversations newest-first with unread count, "You:" / "Message deleted" previews, search; filters *All · Unread* (Broadcasts filter removed); the open conversation never disappears because of a filter (MS-09).
- Split view ≥ 768 with the selection in the URL (`/coach/messages/:clientId`); mobile thread full-screen without the tab bar; composer contract C12 re-certified (spec 60 + R-17).
- **Per-thread drafts** (local, per account + client) so switching conversations never loses or misroutes text; the thread header always shows the recipient.
- Client context line in the thread (subscription, last check-in, last workout) + quick actions (open client, request check-in) (MS-04).
- **Broadcast** from the inbox overflow: explicit audience (all clients / selected), preview, send with a per-recipient `clientMsgId` generated client-side (idempotent with today's API), result summary "Sent to 9 of 10 · Retry failed" (MS-10, B3-C08).
- Open at the first unread with a divider (MS-05); status on the last own message only (MS-11).

### 6.6 Library (B3.7)

- Segments **Programs · Exercises · Foods · Supplements** (food swap groups inside Foods).
- Full-width search; filters (muscle, equipment, has video); mobile list, desktop table with real column names; paging; bulk actions only in a "Select" mode.
- Rows show a media indicator; media plays only when valid (B0 honesty); otherwise an honest "No demo yet" placeholder; attribution shown when present.
- First run: explain the starter library and offer "Add the starter library" prominently (the per-coach copy model stays until B4 decides the global catalog, EX-07).
- From a template / exercise: **Use in a client plan** (assign / add) and **Edit**; preview opens the editor read-first (RM-27).
- Library → template sync result stays visible (not just a toast) with Retry (TS-04).
- **B4 boundary:** media coverage, HEVC transcoding, metadata quality, curated catalog, food data, portions, images and search quality are not done in B3.

### 6.7 Me / Business (B3.8)

- **Me hub:** Business · Forma subscription · Account · Preferences · Help & support (WhatsApp moves here) · Sign out.
- **Business:** this month (collected · due · lapsed — the existing formula, with each label stating exactly what it counts), renewals due (named, Renew inline), lapsed clients (named, actions), packages (renamed from "Client Plans"), exports (CSV, desktop-first). Metrics that are miscomputed today (retention, duplicate tiles) are **removed, not re-derived**, unless O-14 authorizes a formula change. Mixed currencies are shown per currency, never summed (display-only change; the formula stays).
- **Forma subscription** (`/coach/plan`): one status card (state, end date, price, renew / request), capacity line (one count), add-ons, requests (collapsed history). Truthful labels for `trial · active · expired · suspended · none`, and requests `awaiting · confirmed · rejected · cancelled · expired`. Commercial model unchanged (C10).
- **Account / Preferences:** avatar, name, phone, timezone, currency, language, password — each with a visible saved / failed state (CO-31).

---

## 7. Visual blueprint

- **One design system with the client:** B1 tokens and primitives, B2 composites, the website icon set (`SiteIconSet`) for coach screens too (VS-07, VS-20), the real Forma wordmark.
- **Density:** comfortable rows (56 px) on phones; compact rows on desktop tables (32 px visual, 44 px hit area). One hero per view at most (Today has none — the queue is the hero).
- **Colour:** orange only for the one primary action per view, the active destination and meaningful progress; semantic success / warn / danger / info for states; destructive actions only in row menus or confirmations (VS-05, VS-08, VS-09).
- **Rows, not boxes** (CD-01 / CD-03): `Section` + `ListGroup` + `ListRow`; cards only for the single most important block of a screen.
- **Tables** (TB-08): sortable headers, column priority (drop from the end), sticky header, row link + action cell (no `role=button` rows), loading / empty inside the table.
- **Headers:** `AppHeader` (shell) + the client header; no page draws its own `TopBar` inside the shell (VS-13).
- **States:** `ScreenState` everywhere (CO-18): loading skeletons that mirror the layout, offline = stale data, error = Retry, empty = next action.
- **Arabic:** RTL mirroring via logical properties; numbers via `lib/format.ts`; number runs isolated inside RTL lines; Arabic accessible names (RTL-09).

**Component plan (no parallel copies):**

| Component | Plan |
|---|---|
| `TabBar` / `SideRail` (B2) | generalize: configurable testids (`client-rail` stays for the client), a **collapsed** rail variant for 768–1023, a footer slot (Me) |
| `AppHeader`, `ListRow`, `Section`, `ListGroup`, `IconTile`, `ActionMenu` (B2) | reuse as-is (role-agnostic) |
| `CoachShell` | new, mirrors `ClientShell` (banner region, guard-aware navigation, Suspense inside the shell) |
| `QueueRow`, `ClientHeader`, `KeyValueList`, `DataTable` v2 | new / evolved, shared where the client can use them |
| `ResponsiveShell`, `BrandBar`, `NavMenuSheet`, `BottomNav`, `SidebarNav`, `DesktopTopBar` | stay for **admin**; removed from the coach |
| Shared with client / admin (`MeasurementForm`, `AvatarPicker`, `AssessmentView`, charts, `MessageThread`, `RoleAccount`, `Notifications`) | changed only together with their other consumers, with the client and admin suites re-run (C25) |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Plan-editor rebuild loses a field or the save-safety guarantees | Field-coverage checklist from the data model (§3.3); keep `usePlanEditor` untouched; C1–C4 tests + a two-session conflict e2e (Journey D) before and after |
| Shared components change under the client (B2) or admin | Change shared pieces additively; re-run client (30, 61, 80) and admin (13) specs at each milestone |
| Route changes break stored notification links and bookmarks | Keep every notification-target URL; redirects with tests for every retired URL (`B3_COACH_ROUTE_MIGRATION.md`) |
| Today invents states | Only the grounded sources in §6.1; no score; items with no source are omitted (O-7) |
| Polling and request budgets grow (Today combines several sources) | Reuse the existing dashboard query and shared pollers; no per-client fan-out; spec 47 budgets unchanged |
| Composer / keyboard regressions on the new shell | Re-certify spec 60 (EN + AR, 390–1280); R-17 on real devices before release |
| Mixed change (B2 uncommitted) | O-1: commit B2 first |
| Server gaps (§3.5) leak data regardless of UI | Owner decisions O-15 / O-16 before release; UI never displays other coaches' data even where the API returns it |
| Bilingual data loss in rebuilt editors | `SecondLanguageField` on every `LocalizedText` field; round-trip unit tests per editor |
| Scope creep into B4 / B5 | §6.6 boundary; backlog phases |

---

## 9. Performance baseline (production build, 2026-10-09) and budgets

| Measure | Baseline | B3 budget |
|---|---|---|
| Entry bundle | 458.5 KB (148.7 KB gz) | no growth from coach code (coach strings: see B2-R01) |
| `CoachApp` chunk | 63.2 KB (17.7 KB gz) | ≤ +10 % |
| Largest coach screens | Library 28.5 KB · view-as-client layout 19.2 · nutrition editor 19.2 · dashboard 18.9 · plan builder 18.6 · subscription tab 17.5 | each ≤ its current size + 20 % |
| Polling (spec 47, 2 min idle) | `messages.list` ≤ 33 · `coachThreadsSummary` ≤ 8 · `notifications.list` ≤ 7 · others ≤ 6 | unchanged |
| Library payload | 835 KB per open (PF-11) | not worse (fix is B4) |
| Today | today's dashboard queries | no additional per-client requests |

Measured again at B3.9 (build sizes, spec 47, a 200-client roster render, chart rendering on Business / Progress).

---

## 10. Test plan

### 10.1 Unit / API
Keep: `planSafety`, `notePrivacy`, `clientLookup`, `coachClients`, `_capReservation`, `coachPlans`, `subscriptionHistory`, `messages`, `outboxIdempotency`, `notificationLifecycle`, `certification`, `CoachWorkoutEditor`, `CoachClientNotes`, `CoachPlan`, `draft`, `useUnsavedGuard`, `useBack`, `navContract`, `nav`, `notificationTaxonomy`, `localizedText`, `VideoHonesty`.
Add: Today queue derivation (grounding + resolution rules), client filters / sort, bilingual round-trips for every editor field, per-thread drafts, broadcast result summary, route redirects, and — if approved — server tests for B3-S01 / S02 / S03 / S05.

### 10.2 Browser journeys (new spec `85-b3-coach.spec.ts` + a `.responsive` variant)

| Journey | Covers |
|---|---|
| A — Coach first run | new coach (coachPro, 0 clients) → useful empty Today → add / invite client → client appears |
| B — Daily triage | Today → check-in item → review in place → row resolves → client sees feedback |
| C — Training plan | open client → Plan → workout → add + reorder exercise → save → client sees it (refocus) |
| D — Conflict | same plan in two contexts → save in one → save in the other → conflict banner, no silent overwrite |
| E — Nutrition | meal + food (library and search) → Arabic name preserved → client sees the correct result |
| F — Cardio | session edit → save → client sees it |
| G — Check-in | client submits → coach reviews → client sees "Reviewed" + feedback |
| H — Messaging | two conversations → send → offline queue → reconnect → acknowledged → right recipient; drafts kept per thread |
| I — Library | search exercise / food → use in a plan → no duplicated or corrupted metadata (bilingual intact) |
| J — Business | Business / Forma subscription / capacity show truthful data; at-capacity blocks add with a reason |
| K — Account isolation | coach A out → coach B in → no A data, drafts, notes or messages |
| L — Arabic | plan edit (Arabic digits), messaging, Today in RTL |
| M — Failure recovery | network failure, API timeout, save conflict, offline reopen, reload mid-edit (draft restored), failed media upload |

Plus every existing coach spec (00, 10, 11, 12, 13 (admin shell unchanged), 20, 21, 22, 23, 30 coach parts, 31, 40, 42, 43, 44 / 45, 46, 47, 50, 60, 61) and the client / B0 / B1 / B2 regressions.

### 10.3 Known selector changes (to be documented one by one in the implementation log, guarantee kept)
- `_d-layout` coach nav keys (`coachDashboard / coachClients / coachMessages / coachRevenue` → `today / clients / messages / library`) and the rail testid (`coach-sidebar` stays for admin).
- Spec 00 / 10 read "Client Aya" and the trial usage on `/coach/dashboard` (same URL; content moves).
- Spec 20 workspace tabs (`workspace-tab-*`, Manage sheet `coach-manage`) → section navigation + header overflow; subscription renew-date selector `p.font-mono.font-medium` → a semantic testid.
- Spec 23 workspace Back located by xpath → `client-header-back`.
- Spec 13 (admin) unchanged (admin keeps its shell).

### 10.4 Visual QA and accessibility
`e2e3/visual` tools extended to the coach (seed a realistic coach with 30+ clients, plans, threads, check-ins, renewals): 360 / 390 / 430 / 768 / 1024 / 1440 × EN / AR, including empty, loading, error, offline, editing, saving, conflict, keyboard-open, long content and large lists; axe sweep on every coach screen; physical devices are **not** covered by this (R-17 stays a release row).

---

## 11. Milestones

| Milestone | Scope | Main findings | Exit checks |
|---|---|---|---|
| **B3.0.1** Security & ownership | server-side fixes for S01 (+ S01b), S02 (+ assessment private note), S03, S04, S05, S14 (per-coach conversations), client read-only enforcement (S06) and the approved Extend / Freeze rules (S07), per `B3.0.1_SECURITY_OWNERSHIP_PLAN.md` and `B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md` §0 | B3-S01, S01b, S02, S03, S04, S05, S06, S07, S14 | negative + regression api tests; full api / unit / e2e3; stop for owner review |
| **B3.1** Shell | `CoachShell`, tabs / rail, header, Me entry, routes + redirects, guard on every exit, icons | CO-28/29/30, NAV-K02/05/06/07/09/11, RM-34, RM-48, VS-07/12/13/14, DT-07/08/10, IA-K01/08, NT-12, CO-33 | route-migration doc; specs 10, 20–23, 44 / 45, 46, 60 green |
| **B3.2** Today | queue, review sheets, overview line, desktop two-pane | CO-05/06/13/17, JR-02, DT-02, RM-17/19/41, IA-K04, B3-S12 | Journey B; spec 43 |
| **B3.3** Clients | directory, filters, sort, table, add client (both flows), transfers | TB-01/07/08, CO-34, CO-37, RM-18/28, B3-C06 | Journey A; specs 20, 21, 50, 61 |
| **B3.4** Workspace | header + Summary · Plan · Progress · Profile; subscription panel | CO-08/09/14-R/20/38/40, DT-03/05, RM-20/26/35/43, IA-K02/03/05, NAV-K08 | Journeys G, J (part); spec 20, 61 |
| **B3.5** Editors | training, nutrition, cardio, template editor, history sheet | CO-10/12/19/25/26-R/41, JR-07, NAV-K04/10, RM-39/67, TB-03, DT-04, B3-C01–C05 | Journeys C, D, E, F; specs 20, 22, 43, 61 |
| **B3.6** Messages | inbox, split, drafts, context, broadcast | CO-27, MS-03/04/05/07/09/10/11/12, DT-01, B3-C08 | Journey H; specs 31, 47, 60 |
| **B3.7** Library | segments, search, media states, programs, use-in-plan | CO-23/24, EX-08/15, TB-04, RM-27 | Journey I; specs 22, 40 |
| **B3.8** Me / Business | hub, business, packages, Forma subscription, account | CO-16/22/31/32/35/36, JR-03, DT-06, TB-02/06, RM-25/38/42/52/55, IA-K06 | Journey J; specs 11, 12, 42, 50 |
| **B3.9** Polish & certification | visual QA, axe, RTL, performance, full suite, docs | VS-04/19/20, AX-01/03/08/11, CD-01–06, CO-18/42, RTL-07/09/11, PF-14/21 | full e2e3, prod-build PWA + offline boot, Journeys K, L, M |

Each milestone records scope, findings, decisions, files, data / API changes, tests, browser evidence, accessibility, RTL, offline / sync impact and remaining issues in `B3_IMPLEMENTATION_LOG.md`.

---

## 12. Retirement and removal candidates (proposed — each needs the owner's OK in §13)

| Candidate | What happens to its value | Source |
|---|---|---|
| Dashboard tabs Clients / Engagement / Content, Overview filler, 5 metric cards, hero stats | queue on Today; numbers in Business | RM-17, RM-41, CO-17 |
| `/coach/assessments`, `/coach/checkins` overview pages | Today queue + Clients filters (review queue component reused) | RM-19, IA-K04 |
| `/coach/adherence`, mobile Reports ranking | Clients sort / column | RM-18, CO-34, CO-35 |
| `/coach/reports` page | Business › Exports (desktop-first) | RM-38 |
| "View as client" layout (6 chips) | Client › Progress (measurement entry and anchored notes kept) | RM-20, CO-20 |
| Workspace Overview stat tiles + link cards + Manage sheet | Summary + header overflow | RM-35, RM-43, CO-09 |
| Plan versions page | History sheet in each editor | RM-39, NAV-K10 |
| Template preview step | editor read-first | RM-27, CO-39 |
| ☰ menu sheet, bell, WhatsApp FAB (coach) | tabs + Me; Today; Me › Help | RM-34, RM-48, CO-28, CO-33 |
| Coach `/coach/notifications` page | Today (admin keeps its page) | doc 16 #2 |
| "Revenue" bottom tab, 17 cards, retention / duplicate tiles | Me › Business (truthful subset) | RM-38, RM-42, CO-16 |
| "My Plan" Product = Forma card + 4 KPI cards | Forma subscription status card | RM-55, RM-25 |
| Subscription panel's 7 equal actions | one primary + overflow | RM-26, CO-14-R |
| Broadcasts filter in the inbox | broadcast in the overflow | CO-27 |
| Dead promises (swap review, apply template, nutrition templates, step targets) | **build or remove** per O-9 / O-11 | CO-19, RM-67, RM-11 |

**Not removed:** Add Existing Client (O-3), invites, transfers, release, private notes, measurement entry, anchored notes, versions (as a sheet), templates, starter library, broadcast, ⌘K on desktop, exports.

---

## 13. Decisions for the owner

Owner answers (2026-10-15) are in the last column.

| # | Decision | Recommendation | **Owner decision** |
|---|---|---|---|
| **O-1** | Commit B2 before B3 starts (B3 builds on uncommitted B2 files) | **Yes** — owner reviews and commits B2; B3 then starts from a clean tree | Approved — verify B2, review the diff, commit only reviewed B2 locally, no push (done: `be3e357`) |
| **O-2** | Coach IA: **Today · Clients · Messages · Library** + Me (Business, Forma subscription, Account, Preferences, Help) | **Approve** (doc 16) | Approved |
| **O-3** | Add client: keep **both** "Invite a new client" and "Add an existing Forma client" as two clear options in one sheet (no forced single field) | **Keep both, as today** — record the owner's KEEP decision in the docs | Approved (KEEP both) |
| **O-4** | Stop auto-revoking invites that were not copied when the sheet closes; revoke only on an explicit "Revoke" | **Yes** (CO-37 calls the silent revoke a bug) | Approved |
| **O-5** | Remove the coach bell; Today replaces it (Messages keeps its unread badge); `/coach/notifications` → Today | **Yes** (doc 16 #2) | Approved |
| **O-6** | Banner policy: app-wide only when work is blocked (plan lapsed / suspended, at capacity); "plan ending" and announcements on Today only | **Yes** (CO-30) | Approved |
| **O-7** | "Clients without a training plan" on Today needs an **additive** field in `dashboardSummaries` (`hasWorkoutPlan`, `hasNutritionPlan`) — an API change | **Approve the additive field**; otherwise the item is omitted | Approved (additive field) |
| **O-8** | Training editor keeps **sections** in the data model (no migration); the UI hides the default section and shows named ones as groups | **Yes** (no data migration in B3) | Approved |
| **O-9** | Nutrition templates: server CRUD exists without UI. Build Library › Programs nutrition templates (create, edit, assign) in B3, or defer to B5 | **Defer to B5** (keeps B3 focused); remove the dashboard count that hints at them | Approved — nutrition templates deferred |
| **O-10** | Expose editing of fields clients already see but coaches cannot edit: exercise **RIR** and **tempo**, nutrition **beverage / general notes** (no data-model change). Prescribed weight is **not** in the model — adding it would be a data change | **Yes** to existing fields; **no** new weight field in B3 | Approved |
| **O-11** | Step / cardio-minute **targets**: clients see them, coaches cannot set them (the server `coachTargets.set` exists; the B0 cleanup deleted the client wrappers). Re-add the wrappers and edit targets in Plan, or hide the targets from clients | **Re-add and edit in Plan** (no server change) | Approved |
| **O-12** | Desktop: dock the client's thread as a side panel inside the workspace (doc 16), or keep Messages as its own split view only | **Messages split view only in B3**; docked thread later if wanted | Approved |
| **O-13** | Templates have no compare-and-swap (last write wins); adding it is an API change | **Defer** (single-author content); guard + per-coach drafts in B3 | Approved — template CAS deferred |
| **O-14** | Business metrics: remove miscomputed ones (retention, duplicate tiles) without re-deriving; show mixed currencies separately; no formula change without authorization | **Yes** | Approved |
| **O-15** | Server privacy fixes found in B3.0: **B3-S01** (other coaches' relationship docs readable), **B3-S03** (public invite lookup returns PII), **B3-S05** (ended relationship editable) — additive restrictions with tests | **Approve fixing in B3** (privacy; no UI depends on the leaked data) | Approved — fix S01, S03, S05 with server-side authorization / privacy tests (B3.0.1) |
| **O-16** | **B3-S02** notes policy after a transfer: private notes stay with their author (new coach cannot read / edit), or move with the client (continuity) — and should only the author edit / delete a note? | Owner's call; recommended: **author-private**, editable by the author only | **Author-private.** A new coach must not read, edit or delete the previous coach's private notes after a transfer; the previous coach keeps no automatic workspace access after the relationship ends; history preserved with explicit authorized access (B3.0.1) |
| **O-17** | **B3-S04 / MS-17**: may a suspended coach (or a suspended client) keep messaging? | Recommended: **read-only** while suspended | Suspended coaches **and clients** may read conversations they remain authorized to access, but cannot send, edit, delete, react, upload attachments or broadcast — enforced server-side (B3.0.1) |
| **O-18** | **B3-S06 / S07**: server-side enforcement of client read-only; the "extend from a past end date" and "freeze starts now" rules | Owner's call (business rules); B3 only makes the UI preview truthful to the current rule | Server-side client read-only enforcement **approved** (scope verified in B3.0.1). Extend intended = `max(now, currentEndAt)`. Freeze: document current vs proposed and **approve before changing**; no silent migration (`B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md`) |
| **O-19** | Coach can send assessment feedback to the client? (B0 made assessment review notes private-only) | Recommended: **no change in B3** (use a shared note instead) | Approved — no new assessment-feedback feature in B3 |
| **O-20** | Inactivity threshold for "No workout in N days" | **N = 7**, only for active / trial, not paused, client added ≥ 7 days ago | Approved — 7 days, eligible active / trial clients, not paused, onboarded ≥ 7 days |

**B3.0.1 decisions (owner, 2026-10-16):**

| # | Question | **Owner decision** |
|---|---|---|
| **R-4** | Messages across coaches after a transfer (B3-S14) | **Option C, strict server-side conversation ownership**: each coach sees only their own conversation while active; no previous-coach messages, attachments, previews, unread counts or metadata for the new coach; the client keeps earlier conversations as a separated read-only history; legacy messages without a reliable `coachId` hidden from coaches by default (client / admin fallback documented); one rule across list, send, edit, delete, react, markRead, summaries, attachments, broadcast and outbox retries |
| **R-6** | Server-side read-only enforcement in sync | **Date-based**, on the activity date, accepting in-term work synced late; refusing logs outside authorized periods or inside freeze windows; never discarding refused records; stop and report where the stored history cannot decide |
| **S07** | Extend / Freeze | **E2 + F-C** with conditions (exact rules: `B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md` §0); no silent migration |
| R-1 | Admin reads of private notes | Permission-scoped **and audited when read** |
| R-2 | Admin corrections to ended subscriptions | Permitted **and audited** |
| R-3 | Suspended users | Keep only their authorized read access |
| R-5 | Invite claim pre-fill | Removal approved |
| R-7 | Older deployed clients | May show generic rejection messages; no production change or deploy |

---

## 14. Out of scope for B3

- **B4:** curated / global exercise catalog, playable formats (HEVC), posters, instructions, metadata, attribution, bilingual content, food quality, images, portions, search quality, library payload (PF-11).
- **B5:** remaining client and coach P2 / P3, chart readability, check-in content redesign (CL-42), navigation edge cases (NAV-C05 / C06), lazy-loaded languages (B2-R01), realtime instead of polling (PF-05), push / email digests (NT-04), notification producers.
- **Release hardening:** MD-01 / MD-02 / MD-03, PWA-06 acceptance, physical-device checks (R-01…R-26), security / privacy review, production configuration, owner sign-off.
- **Never in B3:** marketing website, public authentication, legal pages, Super Admin redesign, B2 client redesign, the commercial model, deploys, pushes, commits without approval, production data.
