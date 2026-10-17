# B3.2 — Coach Today: queue criteria

> The rules behind every item, count and state on the coach's Today screen (`/coach/dashboard`). Code: `src/lib/coachToday.ts` (`buildTodayQueue`, pure, unit-tested in `coachToday.test.ts`), screen `src/pages/coach/today/`, data `useTodaySources.ts`, server field `coachClients.dashboardSummaries.hasWorkoutPlan / hasNutritionPlan` (owner O-7).
> Blueprint §6.1, owner brief 2026-10-17, decisions O-5 (no coach bell), O-6 (banner policy), O-7 (plan fields), O-20 (inactivity rule).

## 1. Principles

1. **Grounded.** Every item comes from a stored fact the coach is already authorized to read. No score, no prediction, no "at risk", no "needs attention" without its reason.
2. **One per client per kind.** A client can appear under two kinds (for example an unread message and a renewal), because those are two different tasks. The same task never appears twice.
3. **Exact place.** Every item carries the route that resolves it. A check-in can also be reviewed in place, and a transfer decided in place.
4. **Honest states.** "You're all caught up" appears only when every source loaded successfully, the device is online and nothing is stale. Loading, error, offline and stale each have their own wording.
5. **Only this coach's work.** The roster is `coachClients.listMyClientUsers` (active relationships). An item for a client who is not on the roster is never shown. Server scoping from B3.0.1 (per-coach conversations, coach-scoped notifications) is reused, never reimplemented on the client.

## 2. Sources

| Source | Procedure (cache key) | Authorization | Refresh |
|---|---|---|---|
| Roster | `coachClients.listMyClientUsers` (`myClients`) | self (or `users.read`) | 60 s while Today is open, on focus, and on Refresh |
| Relationships / subscriptions | `coachClients.list({status:'all'})` (`coachRelationships`) | self | 60 s |
| Summaries | `coachClients.dashboardSummaries` (`coachDashboardSummaries`), plus the **O-7** plan fields | self | 60 s |
| Check-ins | `checkIns.listForCoachClients` (`coachCheckInSummaries`) | self | 60 s |
| Incoming transfers | `transfers.list({type:'incoming'})` (`incomingTransferRequests`) | self | 60 s |
| Conversations | `messages.coachThreadsSummary`, via the app's shared 20 s poller (the same one behind the Messages badge, so no second poll) | self; per-coach conversation (R-4, server-side) | 20 s |
| Freeze requests (**B32-P1**) | `subscriptionRequest.pendingForCoach` (`coachFreezeRequests`): the canonical request documents, every page read (cursor on requested-at + client, ≤ 200 per page) | self (or `users.read`); only the caller's **active** clients; only requests made **since that relationship began** (never a previous coach's, never an earlier stint's) | 60 s, and right after a decision on the client's Subscription page |

Each source keeps its own error state. A kind is shown only when every source it needs has loaded (`KIND_SOURCES`). A source that fails blanks only the kinds that depend on it. When the roster fails, everything fails.

The requests are batched by tRPC (`httpBatchLink`), so a page load is normally one or two HTTP requests. There is no per-client fan-out (blueprint §9 budget).

## 3. Items

Priorities follow blueprint §6.1. Sections run top to bottom in this order.

| Kind | Section | Shown when | Not shown when | Evidence on the row | Action → exact place | Leaves Today when | Order |
|---|---|---|---|---|---|---|---|
| **Check-in to review** | To review | a check-in for this client has `status = submitted` **and** was requested by this coach (`coachId`). A legacy check-in with no `coachId` counts only if it was submitted after this relationship began. Both the latest and the previous check-in are considered | the check-in belongs to a previous coach (before a transfer); requested or reviewed weeks | the week; "N check-ins waiting" when two are waiting; when submitted | **Review**: the review sheet (phones) or panel (desktop), when the waiting week is the latest one. Otherwise → `/coach/client/:id/checkins` | the coach marks it reviewed (the server also resolves the `checkin_submitted` task) | longest waiting first |
| **Assessment** | To review | `dashboardSummaries.assessment ∈ {submitted, updated_after_review}` | in progress, not started, reviewed | "submitted", or "updated since your last review" | **Review** → `/coach/client/:id/assessment` | marked reviewed | by client |
| **Freeze request** | Requests | the client's request document has `status = pending`, the client is on this coach's active roster, and it was made after this relationship began (B32-P1). It does **not** depend on notifications: 60 newer notifications change nothing | accepted, rejected, cancelled by the client; relationship ended; raised under a previous relationship | the dates asked for and the client's reason | **Decide** → `/coach/client/:id/subscription` | the request leaves `pending`, or the relationship ends | longest waiting first |
| **Transfer request** | Requests | `transfers.list(incoming)`: `status = pending`, `fromCoachId = me`, and the client is on my roster | any other status | the requesting coach's reason | **Decide**: Approve or Reject in place (both confirmed; Approve is not the primary style) | decided | longest waiting first |
| **Unread conversation** | Unread messages | `unreadForCoach > 0` in this coach's own conversation | 0 unread; another coach's conversation (never sent by the server) | unread count; the client's last line (not for attachments or deleted lines) | **Reply** → `/coach/messages/:id` | the thread is read | newest first |
| **Renewal due** | Subscriptions | effective status active or trial **and** `0 < endAt − now ≤ 7 days` | frozen, expired, cancelled, ended, no term | "Package / Trial ends in N days · date" | **Renew** → `/coach/client/:id/subscription` | the term is renewed or extended | soonest first |
| **Lapsed** | Subscriptions | effective status `expired` **and** the stored status is not `cancelled` / `ended` **and** `now − endAt ≤ 30 days` | cancelled or ended terms (the coach decided); lapses older than 30 days (still in Clients) | "Package ended N days ago — not renewed" | **Renew** → `/coach/client/:id/subscription` | renewed, or the client is released | most recent first |
| **Needs a plan** | Coaching | effective status active or trial; the client's account is active; `hasWorkoutPlan = false` **and** `hasNutritionPlan = false`; assessment `reviewed` | either plan has content; assessment not yet reviewed (a submitted one is already a review item; before submission the coach is waiting on the client); an older server without the O-7 fields | "Assessment reviewed — no training or nutrition plan yet" | **Build plan** → `/coach/client/:id/workout` (desktop panel also offers nutrition) | a plan with ≥ 1 day or ≥ 1 meal is saved | longest on the roster first |
| **No workout in 7 days** (O-20) | Coaching | effective status active or trial; account active; on this coach's roster ≥ 7 days; `hasWorkoutPlan = true`; the last finished workout is ≥ 7 calendar days ago, or none was ever logged | frozen, expired, no term; a nutrition-only client (no training plan); a client added < 7 days ago; an older server without the O-7 fields | "No workout in N days · last on date", or "Has a training plan but hasn't logged a workout yet" | **Message** → `/coach/messages/:id` (desktop panel also offers Open client) | a workout is logged | never logged first, then the longest gap |

**"Has a plan" (O-7):** the server counts `days` (training) / `meals` (nutrition) in the client's single plan document. A plan saved with no days or meals counts as no plan, and a malformed (non-array) field counts as none. Only the sizes leave the database.

**Coming up (not counted, not a task):** running terms that end after the 7-day window and within 30 days, listed below the queue ("Package ends in N days · date"). It answers "what's next" without inflating the queue.

## 4. States

| State | Condition | What the coach sees |
|---|---|---|
| Loading | the roster has not loaded and has not failed | five row skeletons; no summary claim |
| Error | the roster failed, online | error card with **Retry** (`role=alert`) |
| Offline, nothing cached | the roster failed, offline | "You're offline. Your queue will load when you're back online." + Retry |
| New coach | roster = 0 clients | "Welcome, name", **Add client** (opens the add sheet), the trial notice, the onboarding checklist |
| Queue | ≥ 1 item | "N things need you", kind chips (filter, `?focus=`), sections (5 rows, then "Show N more") |
| All caught up | 0 items **and** every source loaded **and** online **and** nothing stale | "You're all caught up" + Coming up |
| Partial | ≥ 1 kind failed | "Some of your queue couldn't load". Each failing source group shows a line, "Couldn't load check-ins." + Retry, inside its section. Never "all caught up" |
| Stale | data on screen whose last refresh failed | "Couldn't refresh — showing your queue from hh:mm". An empty queue then reads "Nothing was waiting when your queue last loaded (hh:mm)" |
| Offline with cache | the device is offline | "You're offline — showing your queue from hh:mm". Same empty-state wording as Stale |

"Updated hh:mm" shows the oldest successful load across the timed sources. **Refresh** refetches every source, including the shared pollers.

**Onboarding checklist:** shown only while it is incomplete **and** the coach has fewer than 3 clients. A 10-client coach never sees "Get started 1 / 3" (CO-17).

## 5. Screen behaviour

- **Phones / tablet (< 1024 px):** the row is the action. A check-in opens the review sheet (client context, the check-in, the change since the last check-in, feedback the client will see; empty feedback asks first). A transfer opens the decision sheet. Every other kind opens its exact route.
- **Desktop (≥ 1024 px):** two panes. Rows select; the panel shows the selected item's context and action. A check-in is reviewed and a transfer decided in the panel, and selection then moves to the next item. **J / K** move between items (ignored while typing or with a dialog open). Selecting never navigates.
- **Filters:** a chip per kind with items. `?focus=<kind>` shows one kind. The legacy `/coach/assessments` lands on `?focus=assessments`. "Show everything" clears it.

## 6. Notifications, bell and banners

- **No coach bell (O-5).** Only three non-message types are ever produced for coaches: `checkin_submitted`, `assessment_submitted`, `freeze_requested`. All three are Today items, grounded in their data. `message_received` is the Messages badge, so nothing is signalled twice. The other coach types (`trial_expiring`, `plan_decided`, `coach_assigned`, `client_released`) are declared but never produced.
- **Toasts stay.** They are mounted by the coach shell now (they were mounted only by the bell): a new check-in, assessment, freeze request or message still pops up on any screen.
- **`/coach/notifications`** redirects to Today. Admin keeps its own Notifications page and both of its bells, unchanged.
- **Banners (O-6).** App-wide only when work is blocked: Forma plan lapsed / suspended, over client capacity. "Paid term ends within 5 days" and "plan request awaiting payment" show on Today only. Admin announcements were already limited to Today. The trial card sits on Today.
- **Announcement dismissals (NT-10, owner-approved).** A dismissed informational announcement stays dismissed for that signed-in user across launches (this device), until its content (title, body, link, style) changes; a `warning` one is dismissed for the session only. Critical plan / payment / account notices have no dismiss. Shared with the client home; same look. Code: `src/lib/bannerDismissals.ts`.

## 7. Known limits (documented, not hidden)

1. ~~Freeze requests came from the newest-50 notification feed~~. **Fixed (B32-P1, owner-approved 2026-10-17):** Today reads the canonical pending requests (§2).
2. **Check-ins:** only the latest and the previous check-in are returned per client. A third waiting week (rare) is not counted, though the client's check-ins page shows it.
3. **Day boundaries:** "No workout in 7 days" compares the client's local workout date with the coach's local date, so it can be up to a day off across time zones.
4. **"Last workout"** includes workouts from before this coach (the client's history). A client added under a week ago is never flagged.
5. **Partial failures are batch-sized:** tRPC batches the sources into one request, so one failing procedure usually fails the whole batch and the screen shows the roster error. Retry recovers.
6. **Plan freshness:** a plan assigned two days ago counts as a plan, so a client can be flagged "no workout in 7 days" right after a long gap even if the plan is new. The rule does not know when the plan was assigned.

## 8. Proposed follow-ups (need approval; not implemented)

| ID | Proposal | Why |
|---|---|---|
| B32-P1 | ~~Complete freeze requests beyond the newest 50 notifications~~ | **Done** (owner-approved): `subscriptionRequest.pendingForCoach`, read-only, server-scoped, paginated — not a notification filter |
| B32-P2 | Scope `dashboardSummaries.toReview` to check-ins requested by this coach (as Today already does) | Clients / ⌘K still show "Check-in awaiting review" for a previous coach's check-in |
| B32-P3 | Optional role-aware PWA shortcuts (per-role manifest) | RM-79 removed the role-agnostic ones; an enhancement, not a launch item |
