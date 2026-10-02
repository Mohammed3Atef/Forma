# Phase 2 — Coach App static interaction & wiring certification (slice 04)

Scope: role `coach`, routes in `src/apps/CoachApp.tsx` (excluding CoachPlan/CoachPlanBanner/CoachPlanProvider internals and CoachMessages/CoachMessageThread/MessageThread). Every claim cites `file:line`. Backend procedures verified against `api/_trpc/routers/*.ts` and `api/coach-clients/_service.ts`. No `src/` or `api/` file was modified.

Status enum: VERIFIED | VERIFIED WITH KNOWN LIMITATION (VKL) | DEAD / UNREACHABLE | BROKEN | VISUAL ONLY BY DESIGN | BLOCKED FROM STATIC/COMPONENT VERIFICATION (BLOCKED).
Behavior enum: BACKEND_QUERY (BQ) | BACKEND_MUTATION (BM) | LOCAL_STATE (LS) | NAVIGATION (NAV) | EXTERNAL_NAVIGATION (EXT) | FILE_UPLOAD (FU) | DOWNLOAD_EXPORT (DL) | CLIPBOARD (CB) | BROWSER_API (BA) | VISUAL_ONLY (VO).

Backend facts relied on (Phase 1): `ROLE_PERMISSIONS.coach = []` (`api/_lib/rbac.ts:42`); `adminUsers.get` returns a redacted (name-only) profile when no relationship exists (`api/_trpc/routers/adminUsers.ts:213-241`); `adminUsers.searchClients` allows coaches (`adminUsers.ts:151-157`); `coachClients.list({clientId})` throws FORBIDDEN unless caller is the client, holds `users.read`, or has a relationship (`coachClients.ts:80-86`); `assignExistingClient` refuses when `client.assignedCoachId` is set (`_service.ts:127`) and when at cap (`_service.ts:136-137`); `endRelationship` throws CONFLICT when the relationship is not active (`_service.ts:177`); `transfers.resolve accept` performs the move itself via `transferClientWithMode` (`transfers.ts:140-150`); `adminUsers.setStatus` is `permissionProcedure('users.manageStatus')` (`adminUsers.ts:253`); `invites.create` sends the invite email immediately when an email is supplied (`invites.ts:130-138`).

---

## A. Interaction certification (§2/§3/§5/§24/§25/§27/§29)

Columns: Route | Component | Control (label/aria) | Type | Handler | Service/Hook | tRPC | Success | Error | Invalidates | Nav | Mobile equiv. | Status | Finding

### A1. /coach/clients — CoachClients, AddChooser, InvitePanel, ClientPreview, IncomingTransferRequests

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /coach/clients | CoachClients | "Add client" icon-btn (`aria-label coach.addClient`, `CoachClients.tsx:224`) | LS | `openAdd` :87 | — | — | sheet opens in `choose` mode | disabled when `!canWrite \|\| !online` :224 | — | — | same control | VERIFIED | — |
| /coach/clients | CoachClients | Account icon-btn :227 (md:hidden) | NAV | navigate('/coach/settings') | — | — | — | — | — | /coach/settings | mobile-only (desktop has top bar) | VERIFIED | — |
| /coach/clients | CoachClients | `?new=1` deep-link :73-80 | LS | effect opens sheet, strips param | — | — | sheet opens | — | — | replace URL | same | VERIFIED | — |
| /coach/clients | CoachClients | Search input `coach-clients-search` :204 | LS | setSearch | — | — | in-memory filter :120-134 | — | — | not written to URL (reads `?q` once :64) | same | VKL | K-26 |
| /coach/clients | CoachClients | Status filter chips :209-213 | LS | setStatusFilter | — | — | filters both data sources | — | — | — | same | VKL (no `aria-pressed`) | K-27 |
| /coach/clients | CoachClients | Clear filters (empty state) :150 | LS | reset search+status | — | — | — | — | — | — | mobile only (desktop inline empty has no CTA :155-160) | VKL | K-21 |
| /coach/clients | CoachClients | "Add client" (empty state) :151 | LS | openAdd | — | — | — | — | — | — | mobile only | VERIFIED | — |
| /coach/clients | CoachClients (desktop) | DataTable row click :255 | LS | setSelectedId | — | — | preview panel | — | — | — | mobile row navigates instead :284 | VERIFIED | — |
| /coach/clients | CoachClients (desktop) | Row "Open" btn :191 | NAV | navigate | — | — | — | — | — | /coach/client/:id | row tap | VERIFIED | — |
| /coach/clients | ClientPreview | "Open" :542 / "Messages" :543 | NAV | onOpen/onMessage | — | — | — | — | — | workspace / thread | no direct Message on mobile list (reachable in workspace) | VKL | — |
| /coach/clients | CoachClients (mobile) | Client row btn :284 | NAV | navigate | — | — | — | — | — | workspace | — | VERIFIED | — |
| /coach/clients | CoachClients (mobile) | "Show more" :298 + infinite-scroll sentinel :164,296 | LS | setVisible | useInfiniteScroll | — | page-only slicing of in-memory list | — | — | — | — | VERIFIED | — |
| /coach/clients | CoachClients | Sheet back (`add-mode-back`/`existing-back`) :308-315 | LS | existingBack or setAddMode | — | — | — | — | — | — | same | VERIFIED | — |
| /coach/clients | AddChooser | "Create new" / "Add existing" :342,349 | LS | setAddMode | — | — | — | — | — | — | same | VERIFIED | — |
| /coach/clients | InvitePanel | Name/Email/Phone inputs :451-453 | LS | setPrefill | — | — | — | — | — | — | same | VERIFIED | — |
| /coach/clients | InvitePanel | SubscriptionPlanPicker :454 | BQ+LS | setSub | listCoachPlans (`coachPlansApi.ts:15`) | coachAssets.billingPlans.list (coach self) | default = first plan else custom (`SubscriptionPlanPicker.tsx:58-61`) | query error → falls to custom silently | — | — | same | VKL | — |
| /coach/clients | InvitePanel | "Generate invite" `coach-invite-generate` :455 | BM | gen.mutate :388-408 | createInvite (`inviteApi.ts:92-112`) | invites.create (protectedProcedure; coach → own id `invites.ts:79-80`) | prefill reset, list invalidated | alertDialog :407 | `['pendingInvites',coachId]` | — | same | VERIFIED | — |
| /coach/clients | InvitePanel | at-limit block :447-448 | VO | — | — | — | form hidden with reason `coachTrial.limitBody` | — | — | — | same | VERIFIED | K-17 (count source) |
| /coach/clients | InvitePanel | Pending invite "Revoke" :482 | BM | revoke.mutate :409-413 | revokeInvite | invites.revoke (owner check `invites.ts:157-160`) | list invalidated | alertDialog | `['pendingInvites',coachId]` | — | same | VKL (no confirm dialog for a destructive action) | — |
| /coach/clients | InvitePanel | "Copy link" :487 | CB | copy :415-425 | inviteLink | — | "Copied" 2s :420-421 | clipboard blocked → silent, link visible :422-424 | — | — | same | VERIFIED | — |
| /coach/clients | InvitePanel | "Share" :491 (only if `navigator.share`) | BA | share :427-435 | — | — | native sheet | cancel swallowed | — | — | same | VERIFIED | — |
| /coach/clients | InvitePanel | "WhatsApp" :495 | EXT | whatsapp :436-441 | — | — | `window.open wa.me` | — | — | external | same | VERIFIED | — |
| /coach/clients | InvitePanel | unmount auto-revoke of uncopied invites :371-375 | BM (fire-and-forget) | effect cleanup | revokeInvite | invites.revoke | silently revokes | `.catch(() => undefined)` | none | — | same | BROKEN (emailed invite gets revoked) | K-4 |
| /coach/clients | IncomingTransferRequests | list query :27-52 | BQ | — | listIncomingTransferRequests + fetchUser×2 | transfers.list(incoming) + adminUsers.get (requester → redacted name card, name kept) | rows | no loading/error UI; failure renders nothing :75-76 | — | — | same | VKL | K-29 |
| /coach/clients | IncomingTransferRequests | "Approve" :93-109 | BM | confirmDialog → approve.mutate :61-68 | resolveTransferRequest(accept) THEN releaseClient | transfers.resolve(accept) moves client (`transfers.ts:140-150`); then coachClients.end → `endRelationship` CONFLICT "Relationship is not active" (`_service.ts:177`) | never reached (2nd call throws) | alertDialog shows CONFLICT after a SUCCESSFUL transfer; `refresh()` never runs | (intended) incomingTransfers, myClients, coachDashboard, coachDashboardSummaries | — | same | BROKEN | K-1 |
| /coach/clients | IncomingTransferRequests | "Reject" :110-126 | BM | confirmDialog → reject.mutate :69-73 | resolveTransferRequest(reject) | transfers.resolve(reject) (fromCoach check `transfers.ts:116`) | toast + refresh | alertDialog | 4 keys :54-59 | — | same | VERIFIED | — |

### A2. Add Existing Client — AddExistingClient / ClientResultDetail

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /coach/clients (sheet) | AddExistingClient | Search field + Enter / "Search" btn :158-169 | BQ | submit :117-120 → query :79-109 | searchClients (`accountsApi.ts:76-80`) then getClientAssignment per row (`coachClientsApi.ts:215-221`) then fetchUser per coach | adminUsers.searchClients (coach allowed) ; coachClients.list({clientId}) → FORBIDDEN for clients the coach has no relationship with (`coachClients.ts:82-84`) → caught and treated as **unassigned** :86-90 | list / single auto-detail :113-115 | assignment FORBIDDEN swallowed → wrong "Unassigned" label :202 | — | — | same | BROKEN (owner never resolved) | K-2 |
| sheet | AddExistingClient | "Create new" (no-account empty) :180 / "Search again" :181 | LS | onCreateNew / setTerm('') | — | — | — | — | — | — | same | VERIFIED | — |
| sheet | AddExistingClient | Result row :189-206 | LS | setSelectedId | — | — | detail view | — | — | — | same | VERIFIED | — |
| sheet | ClientResultDetail | "Release" (already mine) :309-320 | BM | confirmDialog → release.mutate :271-281 | releaseClient | coachClients.end (owning coach `coachClients.ts:220`) | toast, onDone (sheet closes, `clients.refetch()` `CoachClients.tsx:327`) | alertDialog | myClients, coachDashboard, coachDashboardSummaries | — | same | VERIFIED | — |
| sheet | ClientResultDetail | SubscriptionPlanPicker + "Assign to me" :331-334 | BM | assign.mutate :248-258 | assignExistingClient (`coachClientsApi.ts:234-241`) | coachClients.assign (coach → own id `coachClients.ts:203-204`; cap CONFLICT `_service.ts:136-137`; already-assigned CONFLICT `_service.ts:127`) | toast + onDone | alertDialog with server message | myClients, coachDashboard, coachDashboardSummaries | — | same | VKL — reachable for every non-own client because K-2 mislabels owned clients; server then returns CONFLICT "Client already has an assigned coach" | K-2 |
| sheet | ClientResultDetail | at-limit block :327-328 | VO | — | — | — | reason shown | — | — | — | same | VERIFIED | K-17 |
| sheet | ClientResultDetail | Reason textarea + "Request transfer" :354-366 | BM | request.mutate :260-264 | submitTransferRequest (`transferApi.ts:51-68`) | transfers.create (coach only; `fromCoachId` must be current coach `transfers.ts:59-61`) | toast, `transferReq` invalidated | alertDialog | `['transferReq',meId,clientId]` | — | same | DEAD / UNREACHABLE (CASE 2 panel requires `row.coachId`, which K-2 never yields for another coach's client) | K-2 |
| sheet | ClientResultDetail | "Cancel request" :348 | BM | cancelReq.mutate :265-269 | cancelTransferRequest | transfers.resolve(cancel) (`transfers.ts:109-113`) | invalidates transferReq | alertDialog | transferReq | — | same | DEAD / UNREACHABLE (same gate) | K-2 |

### A3. /coach/dashboard, /coach/reports, /coach/revenue, /coach/adherence, /coach/assessments, /coach/checkins

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /coach/dashboard | CoachDashboard | "Add client" header btn :63 | NAV | navigate | — | — | — | — | — | /coach/clients?new=1 | icon-only (`hidden sm:inline` label) | VERIFIED | — |
| /coach/dashboard | CoachDashboard | Tabs overview/clients/engagement/content :44-51,80 | LS+URL | useTabParam('tab') (`Tabs.tsx:16-28`) | — | — | URL `?tab=` synced | — | — | — | same | VERIFIED | — |
| /coach/dashboard | CoachDashboard | dashboard query :29-34 (staleTime 300s) | BQ | — | getCoachDashboard (`coachDashboardApi.ts:76-84`) | coachClients.listMyClientUsers + dashboardSummaries + list(all) + coachAssets lists + messages unread — all self-scoped | — | no error UI (`!d` → skeleton forever :83-84) | — | — | same | VKL (no error/retry state) | K-21 |
| /coach/dashboard | CoachDashboard | checkTrialExpiry effect :36-38 | BM (best-effort) | — | coachTrialApi (`coachTrialApi.ts:24-56`) | notifications create; `markTrialNotified` is a no-op (`coachPlanApi.ts:71-77`) → reminder can re-fire each foreground until server flag exists | — | swallowed | — | — | same | VKL (documented no-op) | — |
| /coach/dashboard | CoachTrialBanner | banner :21-31 | VO | — | — | — | — | — | — | — | same | VISUAL ONLY BY DESIGN | — |
| /coach/dashboard | CoachChecklist | 3 checklist rows :63-84 | NAV | navigate(item.to) | listWorkoutTemplates (`['coachTemplatesCount']`) | coachAssets.workoutTemplates.list | disabled when done | — | — | settings / clients?new=1 / templates/new | same | VERIFIED | — |
| /coach/dashboard | OverviewPanel | Featured client "Message"/"Open workspace" :69-74 | NAV | navigate | — | — | — | — | — | thread / workspace | same | VERIFIED | — |
| /coach/dashboard | OverviewPanel | AttentionRow name btn / CTA btn (`parts.tsx:46-55`) | NAV | onOpen / attentionAction | — | — | — | — | — | workspace / checkins / assessment / messages | same | VERIFIED | — |
| /coach/dashboard | OverviewPanel | QuickActionsGrid (md+) / QuickActionsTrigger "+" sheet (<md) :20-26,100-102 | NAV | navigate | — | — | — | — | — | clients?new=1, templates/new, library, assessments, messages | trigger sheet is the mobile equivalent (`QuickActions.tsx:63-113`) | VERIFIED | — |
| /coach/dashboard | OverviewPanel | MetricCards :107-111 | NAV | onClick | — | — | — | — | — | clients / assessments / messages | same | VKL — "Check-ins" tile :110 has no onClick | K-28 |
| /coach/dashboard | OverviewPanel | Upcoming renewal rows :121 | NAV | navigate | — | — | — | — | — | workspace | same | VERIFIED | — |
| /coach/dashboard | ClientsPanel | MetricCards :21-25, section links :28,40, ClientRow :34,46 | NAV | navigate | — | — | — | — | — | clients / assessments / workspace / assessment tab | same | VKL — "Needs attention"/"Inactive" tiles have no onClick | K-28 |
| /coach/dashboard | EngagementPanel | "View full ranking" :32 | NAV | navigate('/coach/reports') | — | — | — | — | — | reports | same | VERIFIED | — |
| /coach/dashboard | ContentPanel | MetricCards + QuickActions :12-35 | NAV | navigate | — | — | — | — | — | templates / library?tab= | trigger sheet | VERIFIED | — |
| /coach/reports | ReportsPanel | "Export clients/subscriptions/revenue" :71-73 | DL | downloadCsv | `@/lib/csv` | — | CSV download | — | — | — | same buttons | VERIFIED | — |
| /coach/reports | ReportsPanel | Ranking DataTable row (lg) :79-86 / MobileCardList item (<lg) :89-104 | NAV | navigate | — | — | — | — | — | workspace | parity OK | VERIFIED | — |
| /coach/revenue | AnalyticsPanel | Renewals DataTable (lg) / MobileCardList (<lg) :45-60 | VO | — | — | — | — | — | — | — | parity OK | VISUAL ONLY BY DESIGN | — |
| /coach/adherence | CoachAdherence | DataTable row click (desktop) :78-84 | NAV | navigate | listMyClients + listClientDashboardSummaries | coachClients.listMyClientUsers / dashboardSummaries | — | — | — | workspace | mobile rows :86-97 are plain `div.row` — NOT tappable | BROKEN (mobile parity) | K-15 |
| /coach/adherence | CoachAdherence | Pagination :99 | LS | usePagination | — | — | — | — | — | — | same | VERIFIED | — |
| /coach/assessments | CoachAssessments | Row :63-74 | NAV | navigate | listMyClients + summaries | as above | — | — | — | assessment tab | same | VERIFIED | — |
| /coach/assessments | CoachAssessments | empty `coachDash.noClients` :59 | VO | — | — | — | — | — | — | — | — | VKL (plain div, no CTA) | K-21 |
| /coach/checkins | CoachCheckInsOverview | "Start review (n)" :133 | LS | startQueue :97-101 | — | — | queue sheet opens | — | — | — | same | VERIFIED | — |
| /coach/checkins | CoachCheckInsOverview | "Send reminders (n)" :138 | BM (batched, Promise.all) | confirmDialog → remind.mutate :104-121 | requestCheckIn ×n (`checkInApi.ts:75-77`) | checkIns.request (owning coach via canWriteCoachOwned `clientCheckIns.ts:72-73`; idempotent :76-77) | toast + invalidates | alertDialog (partial sends possible; safe to retry) | `['checkIns',clientId]`×n, `['coachCheckInSummaries',coachId]` — NOT `coachDashboard` | — | same | VKL | K-5 |
| /coach/checkins | CoachCheckInsOverview | Section rows :170-187 | NAV | navigate | — | — | — | — | — | client checkins tab | same | VERIFIED | — |
| /coach/checkins | CoachCheckInsOverview | Queue "Skip" :223 | LS | add to reviewedIds | — | — | next client shown | — | — | — | same | VKL — feedback text not cleared on skip | K-19 |
| /coach/checkins | CoachCheckInsOverview | Queue "Mark reviewed (+next)" :226 | BM | review.mutate :85-96 | reviewCheckIn(clientId, weekStart, feedback) | checkIns.review (`clientCheckIns.ts:143-154`) | toast, advance queue, close when last | alertDialog | `['checkIns',id]`, `coachCheckInSummaries` — NOT coachDashboard/coachDashboardSummaries | — | same | VKL | K-5 |
| /coach/checkins | CoachCheckInsOverview | Empty "Add client" :153 | NAV | navigate('/coach/clients') | — | — | — | — | — | clients | same | VERIFIED | — |

### A4. Client workspace shell — /coach/client/:clientId (CoachClientWorkspaceLayout, ClientSwitcherSheet, useCoachClientHeader)

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workspace | Layout | Back :109 | NAV | useBack('/coach/clients') (guarded `useBack.ts:27`) | — | — | — | — | — | back / clients | same | VERIFIED | — |
| workspace | Layout | Header identity btn (`workspace-switch-trigger`) :112 | LS | setSwitcherOpen | useCoachClientHeader (`['user']`,`['clientProfile']`,`['clientAssessment']`,`['relationship']`,`['clientLogs',id,'weightLogs']`) | adminUsers.get (relationship → full), profile.get, assessment.get, coachClients.get, logsWeight.list | switcher sheet | header shows `coach.client` fallback on error | — | — | same | VKL — `SUB_TONE` lacks `ended` (`useCoachClientHeader.ts:10-18`) | K-18 |
| workspace | Layout | "Message" :125 / "Edit plan" :128 | NAV | useGuardedNav | — | — | — | — | — | thread / workout tab (gated route) | icon-only on <sm | VERIFIED | — |
| workspace | Layout | Tab rail (11 desktop / 4 + More mobile) :134-164 | NAV | guarded navigate replace | — | — | — | — | — | tab routes | "More" sheet :171-190 | VKL (no `role=tab`/`aria-selected`) | K-27 |
| workspace | ClientSwitcherSheet | search :47, row :57-80 | BQ+NAV | onSelect → navigate same tab (`Layout:90-95`) | getCoachDashboard (`['coachDashboard']`) | self-scoped | switch keeps tab | `search.noResults` | — | equivalent tab on other client | same | VERIFIED | — |

### A5. Overview tab — CoachClientDetail (+ ManageSheet, NoteSheet, release Sheet)

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| overview | CoachClientDetail | reads :63-108 | BQ | — | fetchUser, fetchClientLogs, listCoachNotes, get*Plan, getClientAssessment | adminUsers.get, logsWorkout/Weight.list, coachNotes.list, workoutPlan/nutritionPlan/cardioPlan.get, assessment.get (all via canReadClientData) | — | no error UI (tiles show 0/—) | — | — | same | VKL | — |
| overview | CoachClientDetail | `tel:` link :121-127 | EXT | — | — | — | — | — | — | dialer | same | VERIFIED | — |
| overview | CoachClientDetail | "View activity" :152 / "Manage" :160 | NAV / LS | navigate `/view` / setSheet('manage') | — | — | — | — | — | view screen | same | VERIFIED | — |
| overview | CoachClientDetail | Messages / Assessment / Check-ins cards :172-229 | NAV | navigate | — | — | — | — | — | thread / assessment / checkins | same | VERIFIED | — |
| overview | ManageSheet | Workout / Nutrition / Cardio / Add note rows :455-485 | NAV / LS | navigate / onNote | — | — | — | — | — | editors (gated) | same | VERIFIED | — |
| overview | ManageSheet | "Release client" :486-496 | LS | close + setSheet('release') | — | — | release sheet | — | — | — | same | VERIFIED | — |
| overview | release Sheet | "Confirm release" `release-confirm` :305-313 | BM | release.mutate :52-61 | releaseClient | coachClients.end (owning coach) | closes sheet, navigate('/coach') | **no onError** — sheet stays open silently | myClients, coachDashboard, coachDashboardSummaries | /coach | same | VKL (silent failure) | K-9 |
| overview | NoteSheet | "Save" `coach-note-save` :380-388 | BM | mut.mutate :362-369 | addCoachNote (`coachApi.ts:240-256`) | coachNotes.create (canWriteCoachOwned `clientCoachNotes.ts:36`) | body reset, onSaved (invalidates `['coachNotes',clientId]`), close | **no onError** | coachNotes | — | same | VKL (silent failure) | K-9 |

### A6. Assessment / Check-ins / Notes / History tabs

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| assessment | CoachClientAssessment | Coach notes textarea + "Save" :82-97 | BM | saveNotes.mutate :45 | setAssessmentCoachNotes | assessment.setCoachNotes (`clientProfile.ts:161-171`) | invalidate `['clientAssessment']` → effect re-seeds textarea :40-42 | **no onError** | clientAssessment only | — | same | VKL | K-6, K-9 |
| assessment | CoachClientAssessment | "Mark reviewed" :107 | BM | review.mutate :46 | markAssessmentReviewed | assessment.review (:174-187) | status pill → reviewed | **no onError** | clientAssessment only (CoachAssessments list + dashboard `pendingAssessments` stale) | — | same | VKL | K-6, K-9 |
| assessment | CoachClientAssessment | "Reset" :103 | BM | confirmDialog(danger) → reopen.mutate :47,49-51 | resetAssessment | assessment.reset (:190-202) | status → in_progress | **no onError** | clientAssessment only | — | same | VKL | K-6, K-9 |
| assessment | CoachClientAssessment | Build workout/nutrition/cardio rows :122-136 | NAV | navigate | — | — | — | — | — | editors (gated) | same | VERIFIED | — |
| checkins | CoachCheckIns | "Request check-in" :54-62 | BM | request.mutate :41-48 | requestCheckIn(coachId, clientId, week) | checkIns.request (coach id from ctx `clientCheckIns.ts:82`) | toast + invalidate | alertDialog | `['checkIns',clientId]`, `coachCheckInSummaries` | — | same | VKL | K-5 |
| checkins | CheckInRow | expand toggle :95 | LS | setOpen | — | — | — | — | — | — | same | VERIFIED | — |
| checkins | CheckInRow | feedback textarea + "Mark reviewed" :118-127 | BM | review.mutate :83-91 | reviewCheckIn(clientId, weekStart, feedback) | checkIns.review | close row, toast, invalidate | alertDialog | checkIns, coachCheckInSummaries | — | same | VKL | K-5 |
| notes | CoachClientNotes | "Add note" (header :44 / empty CTA :49) | LS | setOpen | — | — | sheet | — | — | — | same | VERIFIED | — |
| notes | CoachClientNotes | Sheet "Save" :69 | BM | add.mutate :29-38 | addCoachNote | coachNotes.create | reset, close, toast, invalidate | alertDialog | `['coachNotes',clientId]` (Overview preview shares key) | — | same | VERIFIED | — |
| history | CoachTimeline | list :26-41 | BQ | — | listClientCoachHistory + fetchUser per coach | coachClients.list({clientId}) (caller has relationship → allowed) + adminUsers.get (other coaches → redacted, `displayName` kept) | current + previous | `.catch(() => null)` → `timeline.unknownCoach` | — | — | same | VERIFIED | — |

### A7. Subscription tab — CoachClientSubscriptionTab → CoachSubscriptionPanel

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| subscription | Panel | reads :59-60 | BQ | — | getRelationship, getClientFreezeRequest | coachClients.get (owner ok), subscriptionRequest.get | — | no error UI | — | — | same | VKL | — |
| subscription | FreezeRequestCard | from/until inputs, note, "Accept" :317 | BM | decide.mutate :88-95 (decide THEN freeze) | resolveFreezeRequest + freezeSubscription | subscriptionRequest.decide (`clientCheckIns.ts:253-268`) then coachClients.updateSubscription freeze (owner `coachClients.ts:231-233`) | toast + invalidate | alertDialog; if 2nd call fails request is already `accepted` and card disappears | relationship, freezeRequest, user | — | same | VKL (non-atomic) | K-14 |
| subscription | FreezeRequestCard | "Reject" :320 | BM | decide.mutate(rejected) | resolveFreezeRequest | subscriptionRequest.decide | toast | alertDialog | same | — | same | VERIFIED | — |
| subscription | Panel | "Set term"/"Renew" :190 | LS | setSheet('term') | — | — | SetTermSheet | — | — | — | same | VERIFIED | — |
| subscription | SetTermSheet | plan select (prefill) :400, start date, duration, unit, price, "Save" :426-435 | BM | setTerm.mutate :99-107 | setSubscriptionTerm (`coachClientsApi.ts:138-148`) | updateSubscription op setTerm (`_service.ts:53-73`) | invalidate, close, toast | inline `common.savedFailed` :425 (no onError; `error` prop) | relationship, freezeRequest, user — NOT coachDashboard | — | same | VKL | K-7, K-13 |
| subscription | Panel | "Set price" chip :197 → PriceSheet "Save" :347 | BM | setPrice.mutate :116-123 | setSubscriptionPrice | op setPrice | invalidate, close, toast | inline error | same | — | same | VKL | K-7, K-13 |
| subscription | Panel | "Freeze" chip :201 → FreezeSheet "Freeze" :461 | BM | freeze.mutate :108-115 | freezeSubscription | op freeze | invalidate, close, toast | inline error | same | — | same | VKL | K-13 |
| subscription | Panel | "Unfreeze" :199 | BM | confirmDialog → unfreeze.mutate :84 | unfreezeSubscription | op unfreeze | toast | alertDialog | same | — | same | VERIFIED | K-7 |
| subscription | Panel | "Extend 30d" :204 | BM | confirmDialog(with new date) → extend.mutate :87,136-140 | extendSubscription | op extend | toast | alertDialog | same | — | same | VERIFIED | K-7 |
| subscription | Panel | "End" :212 | BM | confirmDialog(danger) → end.mutate :85,133-135 | endSubscription | op end | toast | alertDialog | same | — | same | VERIFIED | K-7 |
| subscription | Panel | "Cancel" :214 | BM | confirmDialog(danger) → cancel.mutate :86 | cancelSubscription | op cancel | toast | alertDialog | same | — | same | VERIFIED | K-7 |
| subscription | Panel | Account "Freeze" :236 / "Unfreeze" :232 / "Trash" :246 / "Restore" :242 | BM | changeStatus :125-132 → setStatus.mutate :80-83 | setAccountStatus (`accountsApi.ts:96-98`) | **adminUsers.setStatus = permissionProcedure('users.manageStatus')** (`adminUsers.ts:253`); coach permissions `[]` (`rbac.ts:42`) → FORBIDDEN | never | inline `subscription.statusError` :251 | — | — | same | BROKEN | K-3 |
| subscription | SubscriptionHistory :219 | — | VO | — | — | — | — | — | — | — | same | VISUAL ONLY BY DESIGN | — |

### A8. View-as-client — /coach/client/:id/view/:tab (CoachViewLayout + views) and /activity

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| view | CoachViewLayout | Back :63 | NAV | useBack | — | — | — | — | — | overview | same | VERIFIED | — |
| view | CoachViewLayout | tab chips :67-77 | NAV | navigate replace | — | — | — | — | — | view/:tab | same | VKL (chips no `aria-pressed`) | K-27 |
| view | CoachViewLayout | EntityNotes "add note" (per entity, `EntityNotes.tsx:115-119`) → Sheet "Save" `entity-note-save` :91 | BM | addNote.mutate :46-59 | addCoachNote(anchor) | coachNotes.create with screen/date/entity (`clientCoachNotes.ts:48-51`) | reset, close, invalidate coachNotes | **no onError** | `['coachNotes',clientId]` | — | same | VKL | K-9 |
| view/activity, /activity | ClientActivityView | prev/next day :57-72 | LS+BQ | setDate → `['clientDay',id,date]` | fetchClientDay (5 procedures) | logs*.get/list, logsChecklist.get | — | `auth.working` while loading; no error UI | — | — | same | VKL | — |
| view/nutrition | CoachViewNutrition | CoachDayNav :44 ; polling 15s :27-34 | BQ | — | fetchClientDay, getClientMealPlan | — | — | none | — | — | same | VERIFIED | — |
| view/cardio | CoachViewCardio | CoachDayNav :23 | BQ | — | fetchClientDay, getClientCardioPlan | — | — | none | — | — | same | VERIFIED | — |
| view/measurements | CoachViewMeasurements | MeasurementForm save :42-47 | BM | save.mutateAsync :27-30 | saveClientMeasurement (`coachApi.ts:214-222`, + writeAudit) | measurements.save | invalidate `['clientMeasurements']` | **no onError here**; depends on MeasurementForm (outside slice) | clientMeasurements (CoachViewProgress shares key) | — | same | BLOCKED (MeasurementForm error handling not in slice) | K-9 |
| view/measurements | CoachViewMeasurements | compare selects A/B :54-59 | LS | setDateA/B | — | — | — | — | — | — | same | VKL (hard-coded "A"/"B"/"Δ" :64-66) | K-22 |
| view/photos | CoachViewPhotos | `<img onClick>` :39 | BA | viewImages | imageViewerStore | — | lightbox | — | — | — | same | VKL (not keyboard reachable) | K-27 |
| view/progress | CoachViewProgress | — | VO | — | fetchClientWeightLogs, fetchClientMeasurements | logsWeight.list, measurements.list | — | — | — | — | same | VISUAL ONLY BY DESIGN | — |

### A9. Plan editors — workout / nutrition / cardio (+ PlanBuilder, ExercisePickerSheet, ExerciseForm, VersionActions, PlanVersionHistory)

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workout | CoachWorkoutEditor | initial load :47-54 (`draft ?? base`) | BQ+LS | localforage draft | getClientWorkoutPlan | workoutPlan.get | plan state | — | — | — | same | VKL (stale draft wins over newer server plan) | K-16 |
| workout | CoachWorkoutEditor | Back :149 | NAV | useBack(…, clear draft) :94 | — | — | draft removed only after confirm | — | — | back / overview | same | VERIFIED | — |
| workout | CoachWorkoutEditor | Plan name :119-125 | LS | setPlan | — | — | dirty computed :56 | — | — | — | same | VERIFIED | — |
| workout | CoachWorkoutEditor | "Save assigned plan" `workout-save` :151 | BM | save.mutate :68-87 | saveClientWorkoutPlan (`planApi.ts:21-23`) | workoutPlan.save full replace (`clientPlans.ts:34-42`, canWriteCoachOwned) | draft cleared, baseline updated, toast, "Saved" 3s | inline banner :110-112 (`save.isError`) | `['clientWorkoutPlan',clientId]` | stays | same | VERIFIED | — |
| workout | CoachWorkoutEditor | "Save as template" chip :134 → SaveAsTemplateForm "Save" :202 | BM | mut.mutate :170-177 | saveClientPlanAsTemplate (`coachAssetsApi.ts:172-194`, fresh ids) | coachAssets.workoutTemplates.save | toast, close | inline `common.savedFailed` :201 | **none** (`['workoutTemplates',coachId]` not invalidated → templates list stale until refetch) | — | same | VKL | K-8 |
| workout | VersionActions | "Save as version" :61 → Sheet "Save" :100-108 | BM | save.mutate :46-57 | saveAsNewVersion (`planVersionsApi.ts:32-41`) | planVersions.save (also mirrors live plan `clientPlans.ts:136`) | toast, close, invalidates | inline error :95-99 | `['planVersions',id,kind]`, `[PLAN_QUERY_KEY,id]` | stays | same | VKL — editor baseline not updated → still "unsaved" | K-25 |
| workout | VersionActions | "History" :69-76 | NAV | plain `useNavigate` :41 (NOT guarded) | — | — | — | — | — | /versions/:kind | same | VKL — bypasses unsaved guard | K-10 |
| versions | PlanVersionHistory | "Restore" :97 | BM | confirmDialog → restore.mutate :51-63 | restoreVersion | planVersions.restore (`clientPlans.ts:141-154`) | invalidates 4 keys | **no onError** | planVersions + 3 plan keys; does not clear localforage drafts | — | same | VKL | K-9, K-16 |
| workout | PlanBuilder | Add day :414/450, day card :392, Day title/focus :343-344, Duplicate/Move up/down/Remove day :346-349 | LS (+confirm on remove :97) | setDays/mapDay | — | — | — | — | — | — | drill-down vs desktop split pane :439-463 | VERIFIED | K-22 (`(copy)`) |
| workout | PlanBuilder | Add section :380, section row :358, reorder :362-363, "More" sheet (duplicate/delete) :364-374,423-436 | LS (+confirmDelete on delete :124) | mapDay | — | — | — | — | — | — | same | VERIFIED | — |
| workout | PlanBuilder | Section title/kind :246-253 | LS | mapSection | — | — | — | — | — | — | same | VERIFIED | — |
| workout | PlanBuilder | Exercise row → edit sheet :264, reorder :271-272, "More" (move-to/duplicate/delete) :273-284 | LS (+confirmDelete :206) | mapSectionEx | — | — | — | — | — | — | same | VERIFIED | — |
| workout | PlanBuilder | "Add exercise" :292 → ExercisePickerSheet | LS | setPicker | — | — | — | — | — | — | same | VERIFIED | — |
| workout | ExercisePickerSheet | search :138, multi-select rows :175-192, defaults toggle :147, "Add N exercises" :126 | BQ+LS | toggle/confirmAdd :71-103 | listExercises (`['exerciseLibrary',coachId]`) | coachAssets.exercises.list | pickFromLibrary sets `libraryExerciseId`+`librarySyncEnabled` (`workoutPresets.ts:85-87`), reset, close | `coachLib.noResults`/`coachLib.empty` :201 (no Load-starter CTA here) | — | — | same | VERIFIED | — |
| workout | ExercisePickerSheet | "Quick create" :140 → ExerciseForm "Add exercise" :205 | BM | create.mutate :105-112 | saveExercise | coachAssets.exercises.save | invalidates library, inserts linked copy, back to list | **no onError** | `['exerciseLibrary',coachId]` | — | same | VKL | K-9 |
| workout | ExerciseForm (edit sheet) | fields :98-153, presets :108-113, "Save" :157 | LS | onSave → applyExerciseEdit (`PlanBuilder.tsx:166-172`) | — | — | synced-field edit flips `librarySyncEnabled=false` + warning toast; programming-only edits keep sync | — | — | — | same | VERIFIED | — |
| workout | ExerciseForm | "Upload video" :140-144 | FU | onPickVideo :61-74 | uploadFile(category 'exercise') (`mediaApi.ts`) | media upload | URL filled | alertDialog with `upload.<code>` | — | — | same (shown only when configured :59-60) | VERIFIED | — |
| workout | PlanBuilder | "Update from library" / "Reconnect" :308-315 | BM (client ctx) / BQ (template ctx) | refreshFromLibrary :184-204 | updatePlanExerciseFromLibrary / getExercise | workoutPlan.updateExerciseFromLibrary (server doc lookup `clientPlans.ts:64-68`) / exercises.get | local exercise replaced, sheet closed | alertDialog | none (server plan already changed; editor still "dirty") | — | same | VKL | K-11 |
| nutrition | CoachNutritionEditor | load/draft :94-106, Back :289, Save `nutrition-save` :291 | BM | save.mutate :119-130 | saveClientMealPlan | nutritionPlan.save | draft cleared, toast, invalidate | inline banner :308-312 | `['clientMealPlan',clientId]` | stays | same | VERIFIED | K-16 |
| nutrition | CoachNutritionEditor | plan name :314, targets :364-373, policy chips :379-383 | LS | setPlan | — | — | — | — | — | — | same | VERIFIED | — |
| nutrition | CoachNutritionEditor | Add meal :392/410, meal select (desktop) :264, label/slot :226-236, Remove meal :227 (confirm :171) | LS | patchMeal/removeMeal | — | — | — | — | — | — | list-pane vs expanded cards :388-414 | VERIFIED | — |
| nutrition | CoachNutritionEditor | Food row edit :241, delete :249 (confirmDelete :202), "Add food" :255 | LS | setEditing/removeFood | — | — | — | — | — | — | same | VERIFIED | — |
| nutrition | Food sheet | library picker search+rows :474-493 | BQ+LS | fills form | listFoods (`['foods',coachId]`) | coachAssets.foods.list | snapshot into form | — | — | — | same | VERIFIED | — |
| nutrition | Food sheet | FoodSearchPicker :500 (§18) | BQ | debounce 400ms, min 2 chars (`FoodSearchPicker.tsx:7-8,28-39`) | searchFoods (`foodSearchApi.ts:23-25`) | foodSearch.search (authed) | result → grams preview → "Use this" fills form :43-49 | `coachEditor.foodSearchError` :82; empty → `coachLib.noResults` | — | — | same | VKL — `language` never passed :500 | K-23 |
| nutrition | Food sheet | group chips :518-525, allow-custom :529, "Save" :533 | LS | saveFood :175-199 | — | — | snapshot alternatives from group | — | — | — | same | VERIFIED | — |
| nutrition | CoachNutritionEditor | Supplement row edit :422, delete :426 (**no confirm**), "Add supplement" :435, sheet picker chips :448, "Save" :459 | LS | saveSupp/removeSupp :206-221 | listSupplements | coachAssets.supplements.list | — | — | — | — | same | VKL | K-24 |
| cardio | CoachCardioEditor | load/draft :57-69, Back :190, Save `cardio-save` :192 | BM | save.mutate :91-102 | saveClientCardioPlan | cardioPlan.save | toast, invalidate | inline banner :209-213 | `['clientCardioPlan',clientId]` | stays | same | VERIFIED | K-16 |
| cardio | CoachCardioEditor | Add session :225/241, row edit :143, delete :147 (confirmDelete), type chips :162, duration/frequency/notes, "Save" :178 | LS | saveSession :115-131 | — | — | — | — | — | — | Sheet on mobile :244-246 / pane on desktop | VERIFIED | — |
| all editors | ClientContextPanel | toggle :29 | LS | setOpen | useCoachClientHeader | — | — | — | — | — | same | VERIFIED | — |
| all editors | useUnsavedGuard | leave via useBack / workspace tab rail / BottomNav | LS | confirmLeave (`navGuardStore.ts:23`) | — | — | prompt | — | — | — | BottomNav guarded (`BottomNav.tsx:23`); **desktop SidebarNav is a bare `NavLink` (`SidebarNav.tsx:60`), nothing in `src/components/shell` calls `confirmLeave`** | VKL | K-10 |

### A10. Templates — /coach/templates, /coach/templates/:id, /coach/templates/new|:id/edit

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| templates | CoachTemplates | "New" icon-btn :57 | NAV | navigate | — | — | — | — | — | /templates/new (route gated `CoachApp.tsx:107`) | same | VKL — not disabled by `canWrite` (lands on gate notice) | K-12 |
| templates | CoachTemplates | search :73 + goal chips :76-80 (combine :33-36; page reset via resetKey :39) | LS | setSearch/setGoalFilter | — | — | — | — | — | not URL | same | VKL | K-26 |
| templates | CoachTemplates | Clear filters :87 | LS | reset | — | — | — | — | — | — | same | VERIFIED | — |
| templates | CoachTemplates | card → preview :94 ; RowCheckbox :93 | NAV / LS | navigate / sel.toggle | — | — | — | — | — | /templates/:id | same (grid) | VERIFIED | — |
| templates | CoachTemplates | BulkActionBar "Delete" :107 | BM | confirmDialog(n) → bulkDel.mutate :40-48 | bulkDeleteWorkoutTemplates (allSettled `coachAssetsApi.ts:247-267`) | coachAssets.workoutTemplates.delete ×n | sel.clear + invalidate | alertDialog; partial failures NOT surfaced (result ignored) | `['workoutTemplates',coachId]` | — | fixed bar (`BulkActionBar.tsx:24-26`) | VKL — not gated by `canWrite`; partial-failure count dropped | K-12 |
| templates | CoachTemplates | Empty → LoadStarterLibraryButton :66 | BM | confirm → seed | seedStarterLibrary | coachAssets.seedStarterLibrary | alertDialog summary, 6 keys invalidated (`LoadStarterLibraryButton.tsx:8,22`) | alertDialog | exerciseLibrary, foods, foodGroups, supplements, workoutTemplates, coachDashboard | — | same | VERIFIED | K-30 |
| preview | CoachTemplatePreview | Back :53 | NAV | useBack | — | — | — | — | — | templates | same | VERIFIED | — |
| preview | CoachTemplatePreview | "Edit" :70 | NAV | navigate | — | — | — | — | — | /edit (gated) | same | VERIFIED (disabled when `!canWrite`) | — |
| preview | CoachTemplatePreview | "Assign" :71 → AssignTemplate | LS | setAssigning | listMyClients | coachClients.listMyClientUsers | sheet | — | — | — | same | VERIFIED | — |
| preview | AssignTemplate | search :50, client row :62 → confirmDialog → mut.mutate :28-40 | BM | assignWorkoutTemplate (`coachAssetsApi.ts:147-169`: get → auto-version → save; 3 sequential calls) | workoutPlan.get, planVersions.save, workoutPlan.save | per-row check, "Done" :71 | alertDialog | **none** (`['clientWorkoutPlan',clientId]`, `['planVersions',clientId,'workout']` not invalidated) | — | same | VKL | K-8 |
| preview | CoachTemplatePreview | "Duplicate" :72 | BM | dup.mutate :37-41 | duplicateWorkoutTemplate (fresh ids) | workoutTemplates.save | toast, invalidate, navigate list | alertDialog | `['workoutTemplates',coachId]` | /templates | same | VERIFIED | K-22 (`(copy)`) |
| preview | CoachTemplatePreview | "Delete" :73 | BM | confirmDialog(name, danger) → del.mutate :42-49 | deleteWorkoutTemplate | workoutTemplates.delete | toast, invalidate, navigate | alertDialog | workoutTemplates | /templates | same | VERIFIED | — |
| editor | CoachWorkoutTemplateEditor | load :48-58 (`draft ?? saved`; baseline = whatever opened) | BQ+LS | — | getWorkoutTemplate (`['workoutTemplate',coachId,id]`) | workoutTemplates.get | — | not-found → blank template silently :51 | — | — | same | VKL | K-16 |
| editor | CoachWorkoutTemplateEditor | Back :87,130 | NAV | own `exit` :78-82 (confirm if dirty, clears draft) | — | — | — | — | — | preview / list | same | VKL — no `useUnsavedGuard` registration → sidebar/bottom nav leave silently | K-10 |
| editor | CoachWorkoutTemplateEditor | name :99, goal chips :103-107, split chips :113-117, PlanBuilder :138 | LS | patch | — | — | dirty indicator :120 | — | — | — | same | VERIFIED | — |
| editor | CoachWorkoutTemplateEditor | "Save" `template-save` :132 | BM | save.mutate :66-76 | saveWorkoutTemplate | workoutTemplates.save (coach-scoped upsert `coachAssets.ts:129-146`) | draft cleared, invalidate, toast, navigate preview | inline banner :98 | `['workoutTemplates',coachId]`, `['workoutTemplate',coachId,id]` | /templates/:id | same | VERIFIED | — |

### A11. Library — /coach/library (exercises / foods / groups / supplements)

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| library | CoachExerciseLibrary | tab chips :67-71 | LS+URL | useTabParam | — | — | `?tab=` | — | — | — | same | VERIFIED | — |
| library?tab=exercises | ExercisesTab | search :182, muscle chips :193-196 (combine :95-108, page reset :153) | LS | — | listExercises (`['exerciseLibrary',coachId]`) | coachAssets.exercises.list | — | — | — | not URL | same | VKL | K-26 |
| exercises | ExercisesTab | "Load starter library" header btn :184 | BM | confirmDialog → loadStarter.mutate :133-144 | seedStarterLibrary (idempotent server `coachAssets.ts:320-383`) | coachAssets.seedStarterLibrary | toast (summary / warning with failed categories) | alertDialog | exerciseLibrary, foods, foodGroups, supplements, workoutTemplates (NOT coachDashboard) | — | same | VERIFIED | K-30 |
| exercises | ExercisesTab | "New exercise" :187 → ExerciseForm sheet "Save" :252 | BM | saveMut.mutate :110-125 | saveExercise (returns `sync`) | coachAssets.exercises.save (+ propagateExerciseToTemplates `coachAssets.ts:209`) | close, toasts incl. "N templates updated" / sync-failed retry toast :116-122 | alertDialog :124 | exerciseLibrary, workoutTemplates | — | same | VERIFIED | — |
| exercises | ExercisesTab | DataTable row click (desktop) :207 / mobile row btn :228 → view sheet → "Edit" :245 | LS | setViewing/setEditing | — | — | — | — | — | — | parity OK | VERIFIED | — |
| exercises | ExerciseView | YouTube iframe :27-36 / native `<video>` with onError fallback :37-49 / image :50-52 / "Watch video" link :89-93 | BA/EXT | — | youtubeEmbed | — | — | fallback link on failure | — | — | same | VERIFIED | — |
| exercises | ExercisesTab | row delete (desktop :173 / mobile :232) | BM | confirmDialog(name, danger) → delMut.mutate :145-150 | deleteExercise | exercises.delete | toast, invalidate | alertDialog | exerciseLibrary (linked template copies keep stale data by design) | — | parity OK | VERIFIED | — |
| exercises | ExercisesTab | select-all / row select / BulkActionBar "Delete" :208-214,238-240 | BM | confirmDialog(n) → bulkDel.mutate :155-163 | bulkDeleteExercises (allSettled) | exercises.delete ×n | sel.clear, invalidate | alertDialog; partial failures dropped | exerciseLibrary | — | mobile has RowCheckbox :227 (no select-all) | VKL | K-12 |
| exercises | ExercisesTab | Pagination :237 | LS | usePagination | — | — | — | — | — | — | same | VERIFIED | — |
| foods | FoodsTab | search :340, "New food" :342 → form "Save" :406 | BM | saveMut :281-285 | saveFood | foods.save | close, toast, invalidate | alertDialog | `['foods',coachId]` | — | same | VERIFIED | — |
| foods | FoodsTab | row click → edit (desktop :354 / mobile :375) ; delete :315/:379 (confirm) ; bulk delete :386 | BM | delMut/bulkDel :286-304 | deleteFood/bulkDeleteFoods | foods.delete | toast, invalidate | alertDialog | foods | — | parity OK | VERIFIED | K-12 |
| groups | GroupsTab | "New group" :468 → name/notes/food chips → "Save" :518 (requires ≥1 food) | BM | saveMut :425-429 | saveFoodGroup | foodGroups.save | close, toast, invalidate | alertDialog | `['foodGroups',coachId]` (nutrition editor reads same key) | — | same (cards, no DataTable) | VERIFIED | — |
| groups | GroupsTab | row → edit :480, delete :484 (confirm), bulk delete :494 | BM | delMut/bulkDel :430-447 | deleteFoodGroup/bulk | foodGroups.delete | toast, invalidate | alertDialog | foodGroups | — | same | VERIFIED | K-12 |
| supplements | SupplementsTab | search :585, "New" :587 → form "Save" :624 ; row edit :605 ; delete :609 (confirm) ; bulk :616 | BM | saveMut/delMut/bulkDel :545-567 | saveSupplement/deleteSupplement/bulk | supplements.save/delete | toast, invalidate | alertDialog | `['supplements',coachId]` | — | same (list, no DataTable) | VERIFIED | K-12 |

### A12. Settings, command palette, billing plans

| Route | Component | Control | Type | Handler | Service | tRPC | Success | Error | Invalidates | Nav | Mobile | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /coach/settings | RoleAccount | AvatarPicker upload/remove (`AvatarPicker.tsx:51-73`) | FU+BM | onCropped → uploadImage → `updateSelf({photoUrl})` :110 | mediaApi.uploadImage; sessionStore.updateSelf (`sessionStore.ts:164-169`) | media upload + auth.updateProfile (`mongoAuth.ts:73-77`) | avatar updates from returned account | upload error inline `avatar-error` :79; `updateSelf` failure swallowed (`void`) | — | — | same | VKL | K-31 |
| /coach/settings | RoleAccount | Name/Phone/Timezone blur-save :113,117,121 ; Currency select :126-136 | BM | saveIfChanged → `void updateSelf` :49-51 | sessionStore.updateSelf | auth.updateProfile | account state replaced | **no error/saving feedback** | — | — | same | VKL | K-31 |
| /coach/settings | RoleAccount | Language chips :152-156 | LS | setLocale | settingsStore | — | — | — | — | — | same | VERIFIED | — |
| /coach/settings | RoleAccount | "Change password" :162 → ChangePasswordSheet | LS | setPwOpen | (outside slice) | auth.changePassword | — | — | — | — | same | BLOCKED (sheet outside slice) | — |
| /coach/settings | RoleAccount | "Sign out" :167 | BM | confirmDialog → signOut :53-61 | sessionStore | — | — | — | — | login | same | VERIFIED | — |
| /coach/settings | RoleAccount | Plan card button :87 | NAV | navigate('/coach/plan') | getCoachPlan, listCoachPlanTiers, listMyClients | coachPlans.me, coachPlanTiers.list, listMyClientUsers | — | — | — | /coach/plan | same | VERIFIED | K-17 |
| /coach/subscription-plans | CoachSubscriptionPlans | "Add plan" :73 (disabled `!canWrite \|\| !online`) → form → "Save" :126-135 | BM | save.mutate :41-55 | saveCoachPlan (`coachPlansApi.ts:23-37`) | coachAssets.billingPlans.save | close, invalidate | **no onError** (button just re-enables) | `['coachPlans',coachId]` (SubscriptionPlanPicker & SetTermSheet share key) | — | same | VKL | K-9 |
| /coach/subscription-plans | CoachSubscriptionPlans | "Edit" :98 / "Delete" :99 (confirm with name) | BM | remove.mutate :56,61-63 | deleteCoachPlan | billingPlans.delete | invalidate | **no onError** | coachPlans | — | same | VKL | K-9 |
| /coach/subscription-plans | CoachSubscriptionPlans | empty `coachPlans.none` :84 | VO | — | — | — | — | — | — | — | same | VKL (no CTA) | K-21 |
| global | CommandHost | ⌘K / Ctrl+K :28-37 ; commands :47-56 ; entity rows from cached `['coachDashboard']`, `['exerciseLibrary']`, `['foods']`, `['workoutTemplates']` :57-68 (keys match producers) | NAV | run | — | — | — | entities absent until those pages were visited (by design) | — | various | same | VKL — "New exercise"/"New food" only navigate to the tab, never open the create sheet :51-52 | K-20 |
| global | GlobalSearch trigger (`GlobalSearch.tsx:13-25`) | — | LS | onOpen | commandStore | — | — | — | — | — | icon-only <sm | VERIFIED | — |

---

## B. Form certification (§7/§8) — EDIT → SAVE → REFETCH → SAME VALUE

| Form | File | Fields → payload | Procedure | Refetch key / reader | Same-value proof | Dirty / autosave / guard | Double-submit | Status | Finding |
|---|---|---|---|---|---|---|---|---|---|
| Invite (Create new) | CoachClients.tsx:388-401 | name/email/phone/sub* → `invites.create` body (`inviteApi.ts:93-109`) | invites.create | `['pendingInvites',coachId]` → list rows :469-480 show `displayName`/code/expiry | server returns the stored doc (`invites.ts:139`) and list refetches; sub fields are not displayed post-create (BLOCKED for sub values) | n/a | `disabled={gen.isPending}` :455 | VKL | K-4 |
| Add-existing subscription | AddExistingClient.tsx:249 | PlanPickResult (+currency) → `coachClients.assign.subscription` | coachClients.assign | `['myClients']`/`['coachDashboard']`; value visible later in Subscription tab via `['relationship']` (not invalidated, but not yet fetched) | `buildSubscription` server-side (`_service.ts:140`); UI later reads `coachClients.get` | n/a | `disabled={assign.isPending}` | VKL (owner detection broken) | K-2 |
| Transfer request reason | AddExistingClient.tsx:354-366 | reason (required, trimmed `transferApi.ts:64`) | transfers.create | `['transferReq',me,client]` → pending chip | server stores `reason` :76 | n/a | pending + empty guard | DEAD | K-2 |
| Set term | CoachSubscriptionPanel.tsx:355-439 | start/duration/unit/price/planName → op setTerm | coachClients.updateSubscription | `['relationship',coach,client]` → summary grid :161-180 | server writes startAt/endAt/months/price/currency/planName (`_service.ts:53-73`); grid re-renders from refetch; **days-based terms render `months: —`** :178 (no days field shown) | sheet state never re-initialised after save | `SubmitButton pending` | VKL | K-13 |
| Price | CoachSubscriptionPanel.tsx:329-353 | price/currency → op setPrice | updateSubscription | relationship → `sub-price` :172 | server :74-76 | stale `initialPrice` on reopen | pending | VKL | K-13 |
| Freeze | CoachSubscriptionPanel.tsx:441-467 | from/until/note → op freeze | updateSubscription | relationship → `frozenUntil` :181-183 | server :77-79 | fields persist after close | pending | VKL | K-13 |
| Freeze-request decision | CoachSubscriptionPanel.tsx:292-327 | outcome/note/from/until → decide (+freeze) | subscriptionRequest.decide (+updateSubscription) | `['freezeRequest']`, `['relationship']` | decide stores note :262; freeze as above | n/a | `busy` prop | VKL (non-atomic) | K-14 |
| Account status | CoachSubscriptionPanel.tsx:125-132 | status → adminUsers.setStatus | FORBIDDEN for coach | `['user',clientId]` | never | n/a | pending | BROKEN | K-3 |
| Coach note (3 entry points) | CoachClientDetail.tsx:362-369; CoachClientNotes.tsx:29-38; CoachViewLayout.tsx:46-59 | body (+anchor) → coachNotes.create | coachNotes.create | `['coachNotes',clientId]` → lists | server inserts `body` :43; list refetch | n/a | `disabled={!body.trim() \|\| pending}` | VERIFIED (Notes tab) / VKL (silent errors elsewhere) | K-9 |
| Check-in review | CoachCheckIns.tsx:83-91; CoachCheckInsOverview.tsx:85-96 | feedback → checkIns.review | checkIns.review | `['checkIns',clientId]` → `coachFeedback` :114 | server `coachFeedback: feedback.trim()` :149 | n/a | pending | VERIFIED | K-5 |
| Assessment coach notes | CoachClientAssessment.tsx:82-97 | coachNotes → assessment.setCoachNotes | assessment.setCoachNotes | `['clientAssessment']` → effect re-seeds :40-42 | server `assessment.coachNotes` :168 | save disabled when unchanged :93 | pending | VKL (no error) | K-9 |
| Exercise (library) | ExerciseForm.tsx:76-94 → CoachExerciseLibrary.tsx:110-125 | name/muscle/category/equipment/warmup/working/reps/rest/video/notes/progression/tags | coachAssets.exercises.save (ExerciseBodySchema) | `['exerciseLibrary',coachId]` → table/list + view sheet | server `replaceOne` with body (`coachAssets.ts:197-208`); refetch renders same fields | n/a | `SubmitButton pending` | VERIFIED | — |
| Exercise (in plan/template) | ExerciseForm → PlanBuilder.applyExerciseEdit :166-172 | same → local `exercises[id]` | persisted with plan/template save | plan/template query | full-replace save then refetch | dirty computed vs baseline (`CoachWorkoutEditor.tsx:56`) | n/a | VERIFIED | — |
| Food (library) | CoachExerciseLibrary.tsx:319-333 | name(en=ar)/quantity/macros/category/tags | foods.save | `['foods',coachId]` | replaceOne; refetch | n/a | pending | VERIFIED | K-22 |
| Food group | CoachExerciseLibrary.tsx:449-462 | name/notes/foods snapshot | foodGroups.save | `['foodGroups',coachId]` | replaceOne (createdAt preserved server-side `coachAssets.ts:141`) | n/a | pending | VERIFIED | — |
| Supplement (library) | CoachExerciseLibrary.tsx:569-578 | name/dose/timing | supplements.save | `['supplements',coachId]` | replaceOne | n/a | pending | VERIFIED | — |
| Workout template | CoachWorkoutTemplateEditor.tsx:66-76 | name/goal/split/days/exercises | workoutTemplates.save | `['workoutTemplate',coachId,id]` + list | replaceOne; preview reads refetched doc | dirty vs baseline; localforage draft; own exit confirm only | pending | VKL | K-10, K-16 |
| Client workout plan | CoachWorkoutEditor.tsx:68-87 | WorkoutPlan (+meta.isCustomized) | workoutPlan.save (full replace) | `['clientWorkoutPlan',clientId]` | replaceOne :40; baseline := saved | dirty computed; draft autosave :64-66; useUnsavedGuard :61 | pending | VERIFIED | K-16 |
| Client meal plan | CoachNutritionEditor.tsx:119-130 | MealPlan (targets, meals, supplements, policy, water) | nutritionPlan.save | `['clientMealPlan',clientId]` (Overview targets read same key) | replaceOne | same pattern | pending | VERIFIED | K-16 |
| Client cardio plan | CoachCardioEditor.tsx:91-102 | CardioPlan | cardioPlan.save | `['clientCardioPlan',clientId]` | replaceOne | same pattern | pending | VERIFIED | K-16 |
| Save as version | VersionActions.tsx:46-57 | plan + reason | planVersions.save | `['planVersions']`, plan key | server snapshot :129 | editor baseline not updated | pending | VKL | K-25 |
| Billing plan | CoachSubscriptionPlans.tsx:41-55 | name/unit/duration/price/isTrial/order | billingPlans.save | `['coachPlans',coachId]` → rows :86-103 | replaceOne | form recreated per open :58-60 | `disabled={save.isPending…}` | VKL (no error) | K-9 |
| Coach profile | RoleAccount.tsx:49-51,110,130 | displayName/phone/timezone/photoUrl/currency | auth.updateProfile | session `account` replaced from response (`sessionStore.ts:167-168`) | response is the stored record | blur-save, no dirty state | none (blur) | VKL | K-31 |

---

## C. Mutation → invalidation matrix (§6)

| Mutation (file:line) | Keys invalidated | Keys readers depend on | Verdict |
|---|---|---|---|
| invites.create / revoke (CoachClients.tsx:405,411) | `['pendingInvites',coachId]` | same | OK |
| coachClients.assign (AddExistingClient.tsx:250-253) | myClients, coachDashboard, coachDashboardSummaries | CoachClients (myClients, coachDashboard), Adherence/Assessments (summaries), RoleAccount (myClients), ClientSwitcher (coachDashboard) | OK |
| coachClients.end — release (AddExistingClient.tsx:274-276; CoachClientDetail.tsx:55-57) | same 3 | same + `['relationship']`/`['user']` (left page) | OK |
| transfers.create/cancel (AddExistingClient.tsx:262,267) | `['transferReq',me,client]` | same | OK (unreachable, K-2) |
| transfers.resolve accept/reject (IncomingTransferRequests.tsx:54-59) | incomingTransfers, myClients, coachDashboard, coachDashboardSummaries | same | OK for reject; **approve never reaches onSuccess** (K-1) |
| checkIns.request (CoachCheckIns.tsx:34-37; Overview:108-111) | `['checkIns',clientId]`, `['coachCheckInSummaries',coachId]` | + `['coachDashboard']` (`toReview`, `checkinsToReview` `coachDashboardApi.ts:107,126`), `['coachDashboardSummaries']` (`toReview` `coachClients.ts:184`) | **MISMATCH** (K-5) |
| checkIns.review (CoachCheckIns.tsx:85-87; Overview:88-89) | checkIns, coachCheckInSummaries | + coachDashboard, coachDashboardSummaries | **MISMATCH** (K-5) |
| assessment.setCoachNotes/review/reset (CoachClientAssessment.tsx:44) | `['clientAssessment',clientId]` | + `['coachDashboardSummaries']` (CoachAssessments list :41), `['coachDashboard']` (pendingAssessments/needsAttention), useCoachClientHeader name (same key, OK) | **MISMATCH** (K-6) |
| coachNotes.create (Detail:293-295; Notes:34; ViewLayout:57) | `['coachNotes',clientId]` | Overview preview, Notes tab, EntityNotes provider — all same key | OK |
| coachClients.updateSubscription (all ops) + subscriptionRequest.decide (CoachSubscriptionPanel.tsx:68-72) | relationship, freezeRequest, user | + `['coachDashboard']` (ClientPreview `row.subscription` `CoachClients.tsx:514`, renewals/revenue/subs counts) | **MISMATCH** (K-7) |
| adminUsers.setStatus (CoachSubscriptionPanel.tsx:80-83) | relationship, freezeRequest, user | + myClients/coachDashboard (`accountStatus` pills `CoachClients.tsx:182,290`) | MISMATCH (moot — K-3 FORBIDDEN) |
| workoutPlan.save (CoachWorkoutEditor.tsx:78) | `['clientWorkoutPlan',clientId]` | Overview (same), ClientActivityView (same), PlanVersionHistory current (same) | OK |
| nutritionPlan.save (CoachNutritionEditor.tsx:124) | `['clientMealPlan',clientId]` | Overview targets, CoachViewNutrition, ClientActivityView | OK |
| cardioPlan.save (CoachCardioEditor.tsx:96) | `['clientCardioPlan',clientId]` | Overview, CoachViewCardio | OK |
| workoutPlan.updateExerciseFromLibrary (PlanBuilder.tsx:190) | none (local merge) | `['clientWorkoutPlan']` now stale vs server; editor baseline unchanged | **MISMATCH** (K-11) |
| planVersions.save (VersionActions.tsx:49-50) | planVersions, plan key | editor local state/baseline | OK for queries; editor UX K-25 |
| planVersions.restore (PlanVersionHistory.tsx:54-57) | planVersions + 3 plan keys | + localforage drafts `workoutDraft:*` etc. (not cleared) | **MISMATCH (draft layer)** (K-16) |
| workoutTemplates.save (TemplateEditor.tsx:71-72) | `['workoutTemplates',coachId]`, `['workoutTemplate',coachId,id]` | list, preview, CommandHost, CoachChecklist (`['coachTemplatesCount']` — **not invalidated**, staleTime 60s), dashboard `templatesCreated` (`['coachDashboard']` — not invalidated) | MINOR MISMATCH (K-8) |
| saveClientPlanAsTemplate (CoachWorkoutEditor.tsx:170-177) | **none** | `['workoutTemplates',coachId]`, coachTemplatesCount, coachDashboard | **MISMATCH** (K-8) |
| assignWorkoutTemplate (AssignTemplate.tsx:28-32) | **none** | `['clientWorkoutPlan',clientId]`, `['planVersions',clientId,'workout']` | **MISMATCH** (K-8) |
| workoutTemplates.delete / duplicate (Preview:36) ; bulk (Templates:42) | `['workoutTemplates',coachId]` | + coachTemplatesCount, coachDashboard.templatesCreated | MINOR MISMATCH (K-8) |
| exercises.save (Library:114-115) | exerciseLibrary, workoutTemplates | + `['workoutTemplate',coachId,id]` (open preview/editor of a linked template shows pre-propagation data) | MINOR MISMATCH (K-8) |
| exercises.delete / bulk (Library:147,157) | exerciseLibrary | same | OK |
| foods.save/delete (Library:283,288,298) | foods | Nutrition editor picker (same key), CommandHost | OK |
| foodGroups.save/delete (Library:427,432,441) | foodGroups | Nutrition editor groups (same key) | OK |
| supplements.save/delete (Library:547,552,561) | supplements | Nutrition editor supp picker (same key) | OK |
| seedStarterLibrary (LoadStarterLibraryButton.tsx:22) | exerciseLibrary, foods, foodGroups, supplements, workoutTemplates, coachDashboard | + coachTemplatesCount | MINOR MISMATCH |
| seedStarterLibrary (ExercisesTab:136) | 5 keys (no coachDashboard) | + coachDashboard, coachTemplatesCount | MINOR MISMATCH (K-30) |
| billingPlans.save/delete (SubscriptionPlans:39) | `['coachPlans',coachId]` | SubscriptionPlanPicker, SetTermSheet (same key) | OK |
| measurements.save (CoachViewMeasurements:29) | `['clientMeasurements',clientId]` | CoachViewProgress (same key) | OK |
| auth.updateProfile (RoleAccount) | session store (not RQ) | Avatar/name shown from session | OK |

---

## D. Library / template checklist (§17)

| Check | Evidence | Result |
|---|---|---|
| Load Starter Library discoverable from empty states | Templates empty → `LoadStarterLibraryButton` (`CoachTemplates.tsx:66`); Foods/Groups/Supplements mobile empties (`CoachExerciseLibrary.tsx:368,490,597`); Exercises header button always visible (:184) | PASS (desktop DataTable empties for exercises/foods lack the CTA — K-21) |
| Re-running the seed | Server inserts only missing ids per category (`coachAssets.ts:325-374`), each category isolated (`runSeedStep` :304-310); UI confirm dialog before run (`LoadStarterLibraryButton.tsx:35`; `ExercisesTab:184`); errors reported per category | PASS |
| Create / edit / delete for exercises, foods, groups, supplements, billing plans | rows in A11/A12; all deletes confirm with entity name; all saves `SubmitButton pending` | PASS |
| Bulk select / delete | `useSelection` + `BulkActionBar` in all four tabs + templates; confirm names count (`common.bulk.confirmDelete`); `allSettled` per item — but `{ok,failed}` result ignored by every caller (Library:157,298,441,561; Templates:42) | PARTIAL (partial failures invisible; not `canWrite`-gated — K-12) |
| Search / filters | in-memory `useMemo` filters; muscle chip + search combine (Library:95-108); templates goal + search combine (:33-36); page resets via `resetKey`; state not URL-persisted | PASS (K-26 polish) |
| Inline video / YouTube / fallback | `ExerciseView.tsx:27-52,89-93`: iframe embed → native `<video>` with `onError` → image → external "Watch video" link | PASS |
| Add from library (link creation) | `pickFromLibrary` is the only place `libraryExerciseId`/`librarySyncEnabled:true` is set (`workoutPresets.ts:84-87`); picker multi-select + optional batch defaults (`ExercisePickerSheet.tsx:86-103`) | PASS |
| Copy vs detach vs reconnect | copy: `copyExercise` keeps link (:54-56); detach: manual edit of a SYNCED field flips `librarySyncEnabled=false` + warning toast, id retained (`PlanBuilder.tsx:166-172`); reconnect: "Reconnect to library" → `refreshFromLibrary` re-pulls synced fields and sets `librarySyncEnabled:true` (:184-204; server `clientPlans.ts:72-77`) | PASS |
| Programming edits (sets/reps/rest) accidentally detach? | `SYNCED_EXERCISE_FIELDS` excludes workingSets/repRange/restSec/tempo/rir/warmups (`workoutPresets.ts:69-82`); `touchedSynced` compares only those fields (`PlanBuilder.tsx:169`) | PASS — programming edits never detach |
| `librarySyncEnabled` state visible | edit sheet `extra` shows `coachLib.linkedToLibrary` vs `coachLib.customOverride` (`PlanBuilder.tsx:303-317`) | PASS |
| Update from library — template context | local merge, persisted on template Save (`PlanBuilder.tsx:192-196`) | PASS |
| Update from library — client-plan context | immediate server mutation against the STORED plan; unsaved locally-added exercise → NOT_FOUND (`clientPlans.ts:66-68`); editor still shows dirty; discard leaves server changed | FAIL (K-11) |
| Library edit propagates to templates | server `propagateExerciseToTemplates` on save/update (`coachAssets.ts:209,222`; `exerciseSync.ts:56-86`); UI toast "N templates updated"/sync-failed retry (`CoachExerciseLibrary.tsx:116-122`) | PASS |
| Assigned client plans auto-sync? | No (by design — `clientPlans.ts:50-58`); manual "Update from library" only | PASS (documented) |
| Template → client assign snapshot + auto-version | `assignWorkoutTemplate` fresh ids + prior plan saved as version (`coachAssetsApi.ts:147-169`), `meta.sourceTemplate*` set; editor shows "from template · customized" (`CoachWorkoutEditor.tsx:113-117`) | PASS (cache not invalidated — K-8; English reason string — K-22) |
| Plan → template ("Save as template") | fresh ids, goal/split chosen (`CoachWorkoutEditor.tsx:164-207`) | PASS (list not invalidated — K-8) |
| Template preview/edit/duplicate/delete gated by plan state | Preview buttons `disabled={!canWrite}` (`CoachTemplatePreview.tsx:70-73`); editor routes wrapped in `gated()` (`CoachApp.tsx:107-108`) | PASS (list-level "New" + bulk delete + entire library NOT gated — K-12) |

## E. Empty-state table (§23)

| Location (file:line) | Trigger | Component | Copy key | CTA | Status |
|---|---|---|---|---|---|
| CoachClients.tsx:144-153 (mobile) | no clients / filtered | EmptyState | coach.noClientsTitle / noClientsFilteredTitle | Add client / Clear filters | VERIFIED |
| CoachClients.tsx:155-160 (desktop table) | same | inline spans | same | none | VKL (K-21) |
| CoachClients.tsx:466 | no pending invites | text | invite.none | — (form above) | VERIFIED |
| AddExistingClient.tsx:173,177-183 | no term / no account | text / card | existing.emptyState / existing.noAccount | Create new / Search again | VERIFIED |
| CoachDashboard OverviewPanel.tsx:82,117; ClientsPanel.tsx:30,42 | all good / no renewals | EmptyState | coachDash.allGood / noRenewals / allActive | none (informational) | VERIFIED |
| ReportsPanel.tsx:85,93 | no clients | DataTable empty / EmptyState | coachDash.noClients | none | VKL (K-21) |
| AnalyticsPanel.tsx:42 | no renewals | EmptyState | coachDash.noRenewals | none | VERIFIED |
| CoachAdherence.tsx:76,83 | no clients | plain div / DataTable empty | coach.noClients | none | VKL (K-21) |
| CoachAssessments.tsx:59 | no clients | plain div | coachDash.noClients | none | VKL (K-21) |
| CoachCheckInsOverview.tsx:149-154 | no clients | EmptyState | coachDash.noClients | Add client → /coach/clients | VERIFIED |
| CoachCheckIns.tsx:68 | no check-ins | EmptyState | checkin.noCheckins | none (Request button above) | VERIFIED |
| CoachClientNotes.tsx:49 | no notes | EmptyState | coach.noNotes | Add note | VERIFIED |
| CoachClientDetail.tsx:266-268 | no notes | text | coach.noNotes | none | VERIFIED |
| CoachTimeline.tsx:48 | no history | text | timeline.none | none | VERIFIED |
| CoachSubscriptionPanel.tsx:186 | no subscription | text | subscription.none | Set term button below | VERIFIED |
| CoachSubscriptionPlans.tsx:84 | no plans | text | coachPlans.none | none | VKL (K-21) |
| ClientSwitcherSheet.tsx:51 | no results | text | search.noResults | none | VERIFIED |
| CoachViewProgress.tsx:76 / CoachViewPhotos.tsx:27 / CoachViewMeasurements.tsx:88 / CoachViewCardio.tsx:29,56 / CoachViewNutrition.tsx:80 / ClientActivityView.tsx:153,188 | no data | text / EmptyCard | coachView.noProgress, progress.noData, measure.empty, activity.noCardio, clientCoach.waitingNutrition, activity.noWorkout/noNutrition | none (read-only mirror) | VERIFIED |
| PlanBuilder.tsx:256,353,388 | no exercises/sections/days | EmptyState | coachEditor.emptyExercises/emptySections/emptyDays | Add button below each | VERIFIED |
| PlanBuilder.tsx:456-459; CoachNutritionEditor.tsx:400-403; CoachCardioEditor.tsx:231-234 | desktop right pane unselected | card | coachEditor.selectDayPrompt / selectMealPrompt / selectSessionPrompt | — | VERIFIED |
| ExercisePickerSheet.tsx:201 | empty library / no results | text | coachLib.empty / noResults | none (Quick create above; no Load starter) | VKL |
| CoachNutritionEditor.tsx:432; CoachCardioEditor.tsx:153 | no supplements / sessions | text | coachEditor.noSupps / noSessions | Add button below | VERIFIED |
| FoodSearchPicker.tsx:83 | no results | text | coachLib.noResults | — | VERIFIED |
| CoachTemplates.tsx:66,84-88 | no templates / no matches | EmptyState | starter.emptyTitle / coachLib.noResults | Load starter / Clear filters | VERIFIED |
| CoachTemplatePreview.tsx:57 | template not found | EmptyState | workoutTemplate.empty | none | VKL (K-21) |
| PlanVersionHistory.tsx:106-109 | no versions | card | planVersions.noVersions | none | VERIFIED |
| CoachExerciseLibrary.tsx:215,218-222 (exercises), 362,365-369 (foods), 490 (groups), 594-598 (supplements) | empty / no results | DataTable empty text (desktop) vs EmptyState (mobile) | coachLib.empty / coachFoods.empty / coachFoods.noGroups / coachSupps.empty | mobile: Load starter / Clear filters; desktop tables: none | VKL (K-21) |
| AssignTemplate.tsx:46,58 | no clients / no match | text | coach.noClients | none | VERIFIED |

## F. Role / state gating (§12)

| Surface | Gate | Evidence | Verdict |
|---|---|---|---|
| Workout/Nutrition/Cardio editors, template new/edit | `CoachPlanGate` | `CoachApp.tsx:90-92,107-108` | VERIFIED |
| Add client (+ invite/assign) | `canWrite`, `online`, `atLimit` reason text | `CoachClients.tsx:224,447-448`; `AddExistingClient.tsx:327-328` | VERIFIED (count source K-17) |
| Template preview actions | `canWrite` | `CoachTemplatePreview.tsx:70-73` | VERIFIED |
| Templates list "New" + bulk delete | none | `CoachTemplates.tsx:57,107` | GAP (K-12) |
| Library CRUD / bulk / seed | none (route `shell()` `CoachApp.tsx:105`) | `CoachExerciseLibrary.tsx` no `useCoachPlan` | GAP (K-12) |
| Billing plans | `canWrite` + `online` | `CoachSubscriptionPlans.tsx:73,98-99,130` | VERIFIED |
| Notes / check-in request / assessment review / subscription ops / freeze decide | none | files in A5–A7 | GAP (design decision needed — K-12) |
| Coach reading other coaches' data | `fetchUser` on other coach → redacted name card (`adminUsers.ts:226-240`) | IncomingTransferRequests:39, CoachTimeline:35, AddExistingClient:97 | VKL (names still resolve) |
| Coach calling `users.read`/`users.manageStatus` procedures | `adminUsers.setStatus` (K-3); `coachClients.list({clientId})` for non-clients (K-2) | see findings | BROKEN |

## G. i18n (§34)

All 611 literal `t('…')` keys used across the slice files exist in `en.json`, `ar.json` and `ar-eg.json` (script run over the 65 slice files; 0 missing). Hardcoded English that reaches users or persisted data: `(copy)` (`PlanBuilder.tsx:110,136`; `coachAssetsApi.ts:128`), auto-version reason "Auto-saved before assigning template …" (`coachAssetsApi.ts:150`), "A"/"B"/"Δ" headers (`CoachViewMeasurements.tsx:64-66`), timezone placeholder "Africa/Cairo" (`RoleAccount.tsx:121`), `name.ar` silently copied from `name.en` on food/supplement save (`CoachNutritionEditor.tsx:182,212`; `CoachExerciseLibrary.tsx:323,574`). → K-22.

---

## H. FINDINGS

| ID | Sev | File:line | Defect | Proposed fix |
|---|---|---|---|---|
| K-1 | P1 | `src/components/coach/IncomingTransferRequests.tsx:61-68`; `api/_trpc/routers/transfers.ts:140-150`; `api/coach-clients/_service.ts:177` | "Approve" calls `transfers.resolve(accept)` (which already moves the client and ends the old relationship) and THEN `releaseClient` → `coachClients.end` → `endRelationship` throws CONFLICT "Relationship is not active". Every approval ends in an error dialog after a successful transfer; `refresh()`/success toast never run, list stays stale. | Remove the `releaseClient` call from `approve.mutationFn`; keep `refresh()`. |
| K-2 | P1 | `src/pages/coach/AddExistingClient.tsx:84-90,233-235,325-338,341-371`; `api/_trpc/routers/coachClients.ts:80-86` | `getClientAssignment` → `coachClients.list({clientId})` is FORBIDDEN for a coach with no relationship to that client; the catch treats it as **unassigned**, so every other coach's client shows "Unassigned" + "Assign to me" (server then CONFLICTs "Client already has an assigned coach") and the request-transfer/cancel panel (CASE 2) is unreachable. | Return `assignedCoachId` (+ coach display name) from `adminUsers.searchClients`, or add a coach-callable `coachClients.assignmentOf({clientId})` returning `{coachId, coachName}` only; treat FORBIDDEN as "owned by someone else", never "unassigned". |
| K-3 | P1 | `src/pages/coach/CoachSubscriptionPanel.tsx:80-83,125-132,230-249`; `src/services/platform/accountsApi.ts:96-98`; `api/_trpc/routers/adminUsers.ts:253`; `api/_lib/rbac.ts:42` | Account "Freeze/Unfreeze/Trash/Restore" buttons call `adminUsers.setStatus` (`users.manageStatus`); coaches hold no permissions → always FORBIDDEN; only a generic inline error. | Add a relationship-gated coach procedure (e.g. `coachClients.setClientAccountStatus` allowing suspended/active/disabled for the owning coach, mirroring the Firestore fix noted in memory) or hide the Account section for coaches. |
| K-4 | P1 | `src/pages/coach/CoachClients.tsx:369-375,402-406`; `api/_trpc/routers/invites.ts:130-138` | On sheet unmount every invite generated this session that wasn't copied/shared is auto-revoked — but the server already **emailed** the link when an email was entered, so the emailed link is dead. | Mark invites created with an email as `kept`, or drop the auto-revoke and rely on the explicit Revoke button. |
| K-5 | P2 | `src/pages/coach/CoachCheckIns.tsx:34-37`; `src/pages/coach/CoachCheckInsOverview.tsx:87-94,108-111`; readers `CoachDashboard.tsx:29-34` (staleTime 300s), `CoachClients.tsx:97-102`, `ClientSwitcherSheet.tsx:32`, `CoachAssessments.tsx:40-44` | Check-in request/review never invalidate `['coachDashboard',coachId]` / `['coachDashboardSummaries',coachId]` → "to review"/needs-attention counters and row signals stay stale up to 5 min. | Add both keys to the two `invalidate` helpers. |
| K-6 | P2 | `src/pages/coach/CoachClientAssessment.tsx:44-47` | Review/reset/notes invalidate only `['clientAssessment']`; `CoachAssessments` (summaries) and dashboard `pendingAssessments` remain stale. | Also invalidate `['coachDashboardSummaries',coachId]` and `['coachDashboard',coachId]`. |
| K-7 | P2 | `src/pages/coach/CoachSubscriptionPanel.tsx:68-72` | Subscription ops invalidate relationship/freezeRequest/user only; `CoachClients` preview subscription pill (`row.subscription` from `['coachDashboard']`), renewals and revenue tiles stay stale. | Add `['coachDashboard',coachId]` (and `['myClients',coachId]` for status changes) to `invalidate()`. |
| K-8 | P2 | `src/components/coach/AssignTemplate.tsx:28-32`; `src/pages/coach/CoachWorkoutEditor.tsx:170-177`; `CoachWorkoutTemplateEditor.tsx:71-72`; `CoachExerciseLibrary.tsx:114-115` | Assign-template writes the client's plan + a version but invalidates nothing (`['clientWorkoutPlan',clientId]`, `['planVersions',clientId,'workout']`); "Save as template" invalidates nothing (`['workoutTemplates',coachId]`); template mutations skip `['coachTemplatesCount']`/`['coachDashboard']`; exercise save skips open `['workoutTemplate',coachId,id]`. Manual refresh needed. | Invalidate the listed keys in each `onSuccess`. |
| K-9 | P2 | `CoachClientDetail.tsx:52-61,362-369`; `CoachClientAssessment.tsx:45-47`; `CoachViewLayout.tsx:46-59`; `PlanVersionHistory.tsx:51-59`; `CoachSubscriptionPlans.tsx:41-56`; `ExercisePickerSheet.tsx:105-112`; `CoachViewMeasurements.tsx:27-30` | Core mutations with no `onError` and no inline error: release client, add note (2 places), assessment save/review/reset, restore version, billing-plan save/delete, quick-create exercise, measurement save → failures are silent (sheet stays open / button re-enables). | Add `onError: alertDialog(...)` (pattern used in CoachClientNotes) or inline `isError` copy. |
| K-10 | P2 | `src/components/coach/VersionActions.tsx:41,73`; `src/components/shell/SidebarNav.tsx:60` (no `confirmLeave` in `src/components/shell`); `src/pages/coach/CoachWorkoutTemplateEditor.tsx:78-82` | Unsaved-changes guard bypassed: "History" uses plain `useNavigate`; desktop sidebar `NavLink`s never call `confirmLeave`; the template editor never registers `useUnsavedGuard` (only its own back button asks). | Use `useGuardedNav` in VersionActions; route SidebarNav clicks through `confirmLeave`; call `useUnsavedGuard(dirty, …)` in the template editor. |
| K-11 | P2 | `src/components/workout/PlanBuilder.tsx:184-204`; `api/_trpc/routers/clientPlans.ts:64-68` | In the client editor "Update from library"/"Reconnect" hits the SERVER plan: an exercise added this session but not yet saved → NOT_FOUND "Exercise is not linked…"; on success the server plan changes while the editor still reads "unsaved" and a discarded exit leaves server ≠ what the coach saw. | Perform the merge locally (same as template context) and persist with the editor's Save; or after the server call reset `baselineRef` and clear the draft. |
| K-12 | P2 | `src/apps/CoachApp.tsx:105` (library route uses `shell()`); `src/pages/coach/CoachExerciseLibrary.tsx` (no `useCoachPlan`); `src/pages/coach/CoachTemplates.tsx:40-48,57,107`; `api/_trpc/routers/coachAssets.ts:129,148,161` (`roleProcedure('coach')` has no plan-state check) | CoachPlanGate coverage is inconsistent: a lapsed coach can still create/edit/delete/bulk-delete library assets, bulk-delete templates, load the starter library, add notes, request check-ins, review assessments and mutate client subscriptions; only editors/template editor/preview buttons/billing plans/add-client are gated. Bulk deletes also drop the `{ok,failed}` tally. | Decide the policy; at minimum gate library + templates bulk delete with `canWrite`, and surface `failed>0` from bulk results. |
| K-13 | P2 | `src/pages/coach/CoachSubscriptionPanel.tsx:257-287,331-332,379-383,443-445` | PriceSheet/SetTermSheet/FreezeSheet are always mounted; `useState(initialPrice/initialStart/initialMonths)` is captured once, so reopening after a term/price change or for a refreshed relationship shows stale values; FreezeSheet retains previously typed dates/notes. | Mount sheets only while open (`{sheet==='term' && <SetTermSheet/>}`) or key them by `sub?.updatedAt`. |
| K-14 | P2 | `src/pages/coach/CoachSubscriptionPanel.tsx:88-95` | Freeze-request "Accept" = `subscriptionRequest.decide` then `updateSubscription(freeze)`; if the second call fails the request is already `accepted`, the card disappears, and the subscription is not frozen. | Server-side: apply the freeze inside `decide` when `outcome==='accepted'` (from/until in input); or order freeze first then decide. |
| K-15 | P2 | `src/pages/coach/CoachAdherence.tsx:86-97` vs `:78-84` | Mobile rows are plain `div.row` with no `onClick`; desktop rows navigate to the workspace. | Render rows as buttons (or `MobileCardList` with `onItemClick`). |
| K-16 | P2 | `CoachWorkoutEditor.tsx:49-53`; `CoachNutritionEditor.tsx:101-105`; `CoachCardioEditor.tsx:64-68`; `CoachWorkoutTemplateEditor.tsx:50-57`; `PlanVersionHistory.tsx:51-59` | Editors load `draft ?? base` without comparing to the server `updatedAt`; a draft left from an earlier session silently overrides a newer server plan (template assign, version restore, another device). Restore doesn't clear drafts. Template editor sets baseline to the draft, hiding that it differs from saved. | Keep `savedUpdatedAt` in the draft; discard the draft when `query.data.updatedAt` is newer (or prompt); clear `*Draft:${clientId}` on restore/assign. |
| K-17 | P2 | `src/pages/coach/CoachClients.tsx:112-115`; `src/pages/RoleAccount.tsx:39`; server `api/coach-clients/_service.ts:136-137` | At-limit is computed from "clients not disabled" (Clients page) / all clients (Settings) while the server gates on the maintained `activeClientCount`; three different numbers → invite/assign can be offered then refused with CONFLICT, or blocked while the server would accept. | Use one source (`plan.activeClientCount`, reconciled) for both the usage line and `atLimit`; keep the server message as the fallback. |
| K-18 | P3 | `src/hooks/useCoachClientHeader.ts:10-18` | `SUB_TONE` lacks `ended` → header Pill gets `tone={undefined}` for ended subscriptions (Panel's map has it). | Add `ended: 'bad'`. |
| K-19 | P3 | `src/pages/coach/CoachCheckInsOverview.tsx:92,223-224` | Review queue "Skip" doesn't clear `feedback`; typed text carries over to the next client. | `setFeedback('')` on skip. |
| K-20 | P3 | `src/components/CommandHost.tsx:51-52` | "New exercise"/"New food" commands only navigate to the tab; nothing opens the create sheet. | Support `?new=1` in `CoachExerciseLibrary` like `CoachClients` does. |
| K-21 | P3 | `CoachAssessments.tsx:59`; `CoachAdherence.tsx:76,83`; `CoachSubscriptionPlans.tsx:84`; `CoachClients.tsx:155-160`; `CoachExerciseLibrary.tsx:215,362`; `ReportsPanel.tsx:85`; `CoachTemplatePreview.tsx:57`; `CoachDashboard.tsx:83-84` | Empty/error states without the shared `EmptyState` or without a CTA; desktop DataTable empties lack the Load-starter/Add CTA their mobile counterparts have; dashboard shows skeleton forever on query error. | Use `EmptyState` with an action; pass a retry/CTA node to `DataTable.empty`; add `q.isError` retry. |
| K-22 | P3 | `PlanBuilder.tsx:110,136`; `coachAssetsApi.ts:128,150`; `CoachViewMeasurements.tsx:64-66`; `RoleAccount.tsx:121`; `CoachNutritionEditor.tsx:182,212`; `CoachExerciseLibrary.tsx:323,574` | Hardcoded English in user-visible/persisted strings (`(copy)`, auto-version reason, A/B/Δ, placeholder) and `ar` copies of `en` names. (All 611 t() keys exist in en/ar/ar-eg.) | Route through `t()`; store a reason key instead of English text. |
| K-23 | P3 | `src/pages/coach/CoachNutritionEditor.tsx:500`; `FoodSearchPicker.tsx:19,34` | `language` never passed → Arabic-UI coaches search the food DB in English. | Pass `i18n.language.startsWith('ar') ? 'ar' : 'en'`. |
| K-24 | P3 | `src/pages/coach/CoachNutritionEditor.tsx:221,426` | Supplement delete has no confirm while food/meal deletes do. | Use `confirmDelete(s.name)`. |
| K-25 | P3 | `src/components/coach/VersionActions.tsx:46-57`; `CoachWorkoutEditor.tsx:56` | "Save as version" writes the live plan but the editor's `baselineRef` isn't updated → "Unsaved changes" stays on after a successful version save. | Expose an `onSaved` callback so the editor resets baseline + draft. |
| K-26 | P3 | `CoachClients.tsx:63-64` (reads `?q`, never writes); `CoachTemplates.tsx:27-28`; `CoachExerciseLibrary.tsx:87-88` | Search/filter state not URL-synced (tab is) → back/refresh loses filters. | Mirror into search params like `useTabParam`. |
| K-27 | P3 | `DataTable.tsx:94-101`; `CoachViewPhotos.tsx:39`; `CoachClientWorkspaceLayout.tsx:138-150`; `CoachClients.tsx:210`; `CoachViewLayout.tsx:67-77` | a11y: `<tr role="button">` wrapping nested buttons; `<img onClick>` not keyboard reachable; tab rails/filter chips lack `role="tab"`/`aria-selected`/`aria-pressed`. | Wrap image in a button; add ARIA tab semantics; make row activation a dedicated cell control. |
| K-28 | P3 | `OverviewPanel.tsx:110`; `EngagementPanel.tsx:25`; `ClientsPanel.tsx:23,25` | "Check-ins to review"/"Needs attention"/"Inactive" MetricCards have no `onClick` while sibling tiles navigate. | `onClick={() => navigate('/coach/checkins')}` etc. |
| K-29 | P3 | `src/components/coach/IncomingTransferRequests.tsx:75-76` | No loading/error state; a failed `transfers.list` silently renders nothing. | Show an inline error with retry. |
| K-30 | P3 | `LoadStarterLibraryButton.tsx:23-28` vs `CoachExerciseLibrary.tsx:136-141` | Same seed action reports via `alertDialog` in one place and `showToast` in the other; the tab version skips `['coachDashboard']`. | Reuse `LoadStarterLibraryButton` in the Exercises header. |
| K-31 | P3 | `src/pages/RoleAccount.tsx:49-51,110,130` | Profile blur-saves are `void updateSelf(...)` with no saving/error feedback. | Wrap in `useMutation` with inline status. |

Counts: controls certified 214 rows (A1–A12); forms 27; mutations traced 32 (matrix C); invalidation mismatches 9 (C rows marked MISMATCH, 5 major + 4 minor); findings 31 (P1 ×4, P2 ×13, P3 ×14).
