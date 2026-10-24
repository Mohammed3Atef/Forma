# B3.3 — Coach Clients directory: rules

> The rules behind every row, state, filter, sort and count on the coach's Clients screen (`/coach/clients`). Code: `src/lib/coachDirectory.ts` (`buildDirectory`, `filterRows`, `sortRows`, `bulkCheckInEligible`; pure, unit-tested in `coachDirectory.test.ts`), screen `src/pages/coach/CoachClients.tsx` + `src/pages/coach/clients/`, data `src/hooks/useCoachSources.ts` (shared with Today).
> Blueprint §6.2, owner brief 2026-10-17 (B3.3), decisions O-3 (both add paths kept), O-4 (an invite is never revoked by closing the sheet), O-7 (plan fields), O-20 (inactivity rule).

## 1. Principles

1. **Same facts as Today.** The directory is built from the same sources and the same queue rules as Today (`buildTodayQueue`). "Needs you" here is exactly Today's list of clients, for the same reasons, in the same order. The two screens cannot disagree.
2. **Every state is a stored fact.** Each state below is defined from data the coach is authorized to read. Nothing is scored, ranked by risk or predicted. There is no "at risk", no "low adherence" and no "inactive" flag beyond Today's documented rule.
3. **Unknown is not a guess.** When a source fails, the values it feeds show "—" and the filters that depend on it are disabled. A failure never turns into "no workout", "no plan" or "no clients".
4. **Only this coach's work.** The roster is the coach's **active** relationships. Check-ins count only when this coach requested them; a previous coach's check-ins never reach this screen (server-side, §11).
5. **Privacy in lists.** Rows show the client's name, photo, package and next action. Email and phone are searchable but never shown in a row. They stay in the client's Profile.
6. **The view lives in the URL.** Search, chips, filters, sort, direction and the weekly check-ins view are query parameters, so reload, Back and deep links keep the view.

## 2. Sources

All from `useCoachSources` (one hook, shared cache keys with Today and the other coach screens; refreshed every 60 s while open, on focus, and after the actions that change them).

| Source | Procedure (cache key) | Feeds |
|---|---|---|
| Roster | `coachClients.listMyClientUsers` (`myClients`) | the rows, search (name, email, phone), the capacity count |
| Relationships | `coachClients.list({status:'active', view:'summary'})` (`coachRelationships`) — **B3.3**: the summary view leaves out the audit trail, archived terms and invite code | package state, days left, "added" |
| Summaries | `coachClients.dashboardSummaries` (`coachDashboardSummaries`) | last workout, workouts in 7 days, plans (O-7), assessment, full name |
| Check-ins | `checkIns.listForCoachClients` (`coachCheckInSummaries`) — **B3.3**: this coach's check-ins only | this week's check-in state, the review queue |
| Conversations, freeze requests, incoming transfers | as on Today (B3.2) | Needs-you reasons |
| Outgoing transfers | `transfers.list({type:'outgoing'})` (`outgoingTransferRequests`) — **B3.3**: never names the current coach | "Your transfer requests" |
| Capacity | `coachPlans` (`coachPlan`) | "N / M clients", the limit link |

## 3. Package state (one pill per row)

From the relationship's `subscription` and `effectiveSubscriptionStatus` (the same function the subscription page and the server rules use).

| State | Shown as | Exactly when |
|---|---|---|
| Active | **Active** | a running paid term with more than 7 days left |
| Trial | **Trial** | a running trial term with more than 7 days left |
| Expiring | **Ends in Nd** (Arabic with its plural forms) | a running term (paid or trial) with 7 or fewer whole days left (`ceil((endAt − now) / day)`); the same 7-day window as Today's renewal item |
| Paused | **Paused** | the term is frozen now (inside its freeze window) |
| Expired | **Expired** | the term ran out (`now ≥ endAt`), or it was cancelled or ended while the relationship stays active |
| Pending | **Pending** | the term is stored as pending (not started yet) |
| No package | **No package** | the relationship has no subscription at all |
| Unknown | (no pill) | the relationships source failed |

The days left also show under the pill (desktop) for running terms that are not "Expiring".

**Account pill** (separate, only when it blocks the client — owner-approved 2026-10-18): **Account pending**, **Account frozen** (`suspended`), **Account trashed** (`disabled`). It always names the account, so it is never read as a paused package ("Paused" is the package). A frozen account with a running package still reads "Active" for the package; the account pill says why the client can't use the app. There is no account filter.

## 4. This week's check-in (this coach only)

"This coach's check-in" = one this coach requested (`coachId`), or a legacy one without `coachId` created after this relationship began. The week is the app's Saturday → Friday training week.

| State | Exactly when |
|---|---|
| **To review** | the latest or previous check-in of this coach is `submitted` (any week) |
| **Overdue** | this coach's latest request is still `requested` after its week ended |
| **Awaiting client** | this coach's latest request is for this week and still `requested` |
| **Done this week** | this coach's latest check-in is this week's and `reviewed` |
| **Not requested this week** | none of the above |
| Unknown | the check-ins or relationships source failed |

## 5. Activity and plans

- **Last workout:** the client's latest finished workout date (the client's own records, including history from before this coach): "Worked out today", "Last workout yesterday", "Last workout N days ago", "No workout logged yet" in the list; the short forms "Today", "Yesterday", "N days ago", "None yet" in the desktop table, whose column header already says "Last workout". "—" when the summaries failed.
- **Workouts (7 days):** finished workouts in the last 7 days.
- **No workout in N days** appears only as a Needs-you reason, under Today's O-20 rule: running term, active account, on this coach's roster for at least 7 days, a training plan with content, and the last workout at least 7 days ago (or none). A client added two days ago who hasn't trained yet reads "No workout logged yet", never "inactive".
- **Plans (O-7):** "No training plan" = the client's training plan has no days; "No nutrition plan" = no meals. A plan saved empty counts as none. Unknown when the summaries failed (filter disabled).

## 6. Chips, filters and sorting

**Chips** (counts reflect the current search):

| Chip | URL | Shows |
|---|---|---|
| All | — | every client on the roster |
| Needs you | `?task=needs` | clients with at least one Today item |
| Check-ins to review | `?task=checkin` | clients with a check-in to review |
| Renewals due | `?task=renewal` | running term ending within 7 days |
| Lapsed | `?task=lapsed` | Today's lapsed rule (ran out on its own within 30 days) |
| Weekly check-ins | `?view=checkins` | the weekly check-ins view (§7) |

**Filter & sort sheet** (Clear / Done pinned below the scrolling choices): Package (`?state=active|trial|expiring|paused|expired|pending|none`), This week's check-in (`?checkin=review|overdue|awaiting|notRequested|done`), Plans (`?plan=noWorkout|noNutrition`), Sort. Filters combine with each other, with the chip and with search. The button shows how many are on.

**Sorts** (`?sort=` and `?dir=desc`; the desktop column headers toggle direction and carry `aria-sort`):

| Sort | Ascending (default) |
|---|---|
| Needs you first (default) | clients with a reason first, by Today's priority (check-in, assessment, freeze, transfer, message, renewal, lapsed, plan, inactivity), then how long it has waited; then everyone else by name |
| Name | A → Z |
| Last workout | most recent first; never-logged after the oldest |
| Days left | fewest days left first |
| Workouts (7 days) | most first (the old Adherence ranking) |

Unknown values always sort last, in either direction. Ties fall back to the name.

## 7. Weekly check-ins (`?view=checkins`, was `/coach/checkins`)

- **Groups:** To review · Overdue · Awaiting client · Not requested this week · Done this week (§4), each with its count; a row opens the client's check-ins.
- **Review in order:** this coach's submitted check-ins, oldest first, reviewed in a sheet with the shared review form (feedback the client sees, the change since the last check-in, skip). "N of M" progress.
- **Request this week's check-in (bulk):** goes only to clients who are **Not requested this week**, have a **running** package (Active, Trial or Expiring) and an **active** account. Paused, Expired, Pending, No package and frozen or trashed accounts are never asked. The confirmation states the count and the rule. Requests go out in batches of 10. Any that fail are reported ("3 of 16 requests didn't go through"); the rest stand.
- **Search** applies here too. Filters don't (the groups are the filter).

## 8. Layouts

| Width | Layout |
|---|---|
| Phones (< 768 px) | one-column list: avatar, name, the reason or last workout, package pill. The whole row opens the client. 20 rows, then "Show more (N)" |
| Tablet (768–1023 px) | the same list in two columns, 20 then "Show more" |
| Desktop (≥ 1024 px) | a table: Client · Next action · Last workout · Workouts (7d) · Package · row menu (Open, Message, Package & billing, Check-ins). The name is the link; the rest of the row opens the client too. 50 rows per page. Workouts (7d) folds under Last workout below 1280 px. Fixed column widths and truncation instead of a horizontal scroll |

## 9. Screen states

| State | Condition | What the coach sees |
|---|---|---|
| Loading | the roster has not loaded | six row skeletons |
| Error | the roster failed, online | "Couldn't load your clients. Check your connection and try again." + **Retry**. Never "no clients" |
| Offline, nothing cached | the roster failed, offline | the offline card + Retry |
| No clients | roster = 0 | "No clients yet" + **Add client**; no search, chips or table |
| No match | filters or search exclude everyone | "No clients match" + **Clear filters** |
| Partial | summaries or check-ins failed | "Some details couldn't load — they show as —" + Retry; dependent filters disabled |
| Stale | the last refresh failed | "Couldn't refresh — showing the last loaded list." |
| Offline with data | the device is offline | "You're offline — showing the last loaded list."; Add client disabled |

**Capacity** (unchanged B0 semantics): "N / M clients" counts the real roster (trashed accounts excluded). At or over the limit, or with a lapsed Forma plan, adding is blocked and the line links to the plan page. Existing clients are never affected.

## 10. Add client, transfers

- **Add client** keeps both paths (O-3): **Invite a new client** (link, optional name / email / phone, the package) and **Add an existing client** (search, assign, or request a transfer). `?new=1` (Today, ⌘K, the checklist) opens the sheet and clears the parameter.
- **O-4:** an invite stays pending until the coach revokes it or it expires. Closing the sheet never revokes anything (it used to revoke links that were not copied, CO-37). Revoking a link that was claimed meanwhile is refused, never overwritten (§11).
- **Incoming transfer requests** (another coach asks to take over your client): the existing decision card at the top, unchanged.
- **Your transfer requests** (B3-C06): requests you made, with status (Waiting for their current coach, Accepted, Declined, Cancelled) and **Cancel request** while pending. Decided requests stay for 30 days. The client is shown by the public name card. The current coach is never named; the server no longer sends who it is (CO-03).

## 11. Server changes (B3.3)

| Change | Procedure | Why |
|---|---|---|
| `toReview` is this coach's work only (owner-approved) | `coachClients.dashboardSummaries` | a previous coach's submitted check-in flagged the transferred client for the new coach (B32-P2) |
| This coach's check-ins only | `checkIns.listForCoachClients` | the same rule for the records themselves: a previous coach's check-ins (notes, weights) were sent to the new coach and hidden client-side |
| A previous coach's week is not returned | `checkIns.request` | asking for a week that a previous coach already holds answered with that coach's check-in. B3.3 refused it (`CONFLICT`); **B3.4 (owner decision)** creates the incoming coach's own record of that week instead (`week__coachId`), leaving the previous coach's untouched — see `B3_IMPLEMENTATION_LOG.md` §B3.4 |
| `view: 'summary'` (optional input) | `coachClients.list` | the roster screens need the current term only; the audit trail grew with every subscription change |
| Outgoing requests omit `fromCoachId` | `transfers.list({type:'outgoing'})`, `transfers.create` | the requester must not learn who coaches the client (CO-03) |
| Revoke is compare-and-set | `invites.revoke` | a revoke racing a claim overwrote `claimed` with `revoked` |

Authorization is unchanged everywhere. Evidence: `api/_trpc/routers/b33Directory.test.ts`.

## 12. Old URLs and deep links

| Old | Now |
|---|---|
| `/coach/checkins` | `/coach/clients?view=checkins` (redirect, history replaced) |
| `/coach/adherence` | `/coach/clients?sort=workouts` (redirect) |
| `/coach/clients?new=1` | unchanged: opens Add client |
| Me › Check-ins, Me › Adherence | removed (the views live in Clients) |

## 13. Known limits (documented, not hidden)

1. ~~**One check-in per client per week.**~~ Resolved in B3.4 (owner decision): after a mid-week hand-over the new coach's request for that week creates a record of their own; the bulk request sends it like any other.
2. **Day boundaries:** "last workout", "No workout in N days" and "this week" use the coach's local date against the client's local workout date, so they can be a day off across time zones (carried to B3.9).
3. **Last workout** includes workouts from before this coach (the client's history).
4. **Check-ins:** only the latest and the previous check-in per client are read (as on Today). A third waiting week is counted once.
5. **Paging is on the device.** The whole roster loads once (bounded queries, no per-client calls); a coach with several hundred clients still gets one roster request. Server-side paging is a later step if rosters grow past that.
