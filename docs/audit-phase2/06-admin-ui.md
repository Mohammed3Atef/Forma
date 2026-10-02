# Phase 2 — 06 Admin / Super-Admin UI (static interaction & wiring certification)

Scope: `src/apps/AdminApp.tsx` routes, `src/pages/admin/**`, `src/pages/RoleAccount.tsx` (admin), `src/components/coach/TransferWizard.tsx`, `src/components/{BannerHost,PresenceTracker,CommandHost}.tsx`, `src/components/ui/{DataTable,BulkActionBar,Pagination,RowCheckbox,DetailPanel,SplitPane,MobileCardList,GlobalSearch,CommandPalette,QuickActions,PermissionState,EmptyState}.tsx`, `src/hooks/{useSelection,usePagination,useInfiniteScroll}.ts`, `src/config/nav.ts`, `src/services/auth/permissions.ts` vs `api/_lib/rbac.ts`. Static read only; nothing under `src/`/`api/` modified. Payment-confirmation confirm/reject on AdminCoachDetail and the AdminPlans tier editor body are owned by another agent and only referenced here for role visibility / invalidation.

Legend — Status: VERIFIED | VWKL = VERIFIED WITH KNOWN LIMITATION | DEAD | BROKEN | VISUAL | BLOCKED. Behavior: BQ=BACKEND_QUERY BM=BACKEND_MUTATION LS=LOCAL_STATE NAV=NAVIGATION EXT=EXTERNAL_NAVIGATION DL=DOWNLOAD_EXPORT BA=BROWSER_API VIS=VISUAL_ONLY. "Inv." = query keys invalidated on success. `qc` defaults: `staleTime 60s`, `gcTime 10m`, `retry 1`, `refetchOnWindowFocus` (`src/services/platform/queryClient.ts:14-23`).

## 0. Role model parity (§12 prerequisite)

| Item | Frontend | Backend | Result |
|---|---|---|---|
| `ALL_PERMISSIONS` | `src/services/auth/roles.ts:12-22` | `api/_lib/rbac.ts:11-21` | identical (9 keys, same order) |
| `ROLE_PERMISSIONS.super_admin` | `roles.ts:27` `[...ALL]` | `rbac.ts:24` | identical |
| `ROLE_PERMISSIONS.admin` | `roles.ts:31-40` (8 keys, no `clients.writeAll`) | `rbac.ts:25-34` | identical |
| `coach` / `client` | `[]` `roles.ts:44-45` | `[]` `rbac.ts:42-43` | identical |
| `can()` / `hasPermission()` | inactive → false; super_admin → true; else baseline ∪ extra (`permissions.ts:18-22`) | same (`rbac.ts:51-55`) | identical semantics |
| `useFlag()` | reads `account.featureFlags[flag]` (`permissions.ts:31-34`) | `flags.save` writes `featureFlags` **collection** (`api/_trpc/routers/flags.ts:31-33`); user-doc `featureFlags` only ever set to `{}` (`adminUsers.ts:120`, `auth.ts:84`, `invites.ts:242`) | **disconnected → A-7** |

Backend guards traced (from routers read): `adminCoaches.list/detail` = `roleProcedure('super_admin')` (`adminCoaches.ts:49,141`); `adminUsers.delete` = super_admin (`adminUsers.ts:244`); `adminUsers.list/byRole` = `users.read` (`:44,136`); `create` = `users.create` + super_admin for admin targets (`:84,102-103`); `setStatus/bulkSetStatus` = `users.manageStatus` + self-block + admin-on-admin block (`:178-191,253-262`); `setRole/setPermissions` = `users.manageRoles` (`:269,287`); `coachPlans.adminUpdate` = super_admin (`coachPlans.ts:46`); `coachPlanRequests.listPending/confirm/reject` = super_admin (`coachPlanRequests.ts:135,150,194`); `flags.list/save` = `flags.manage` (`flags.ts:15,21`); `banners.create/update/delete` = `flags.manage`, `list` = any active user (`banners.ts:32,48,59,71`); `adminAudit.list` = `audit.read` (`adminAudit.ts:50`); `adminStats/adminMembers/adminGrowth.get`, `usage.fetch` = `users.read` (`adminAnalytics.ts:18,51,132`, `usage.ts:27`); `transfers.list('pending')/resolve` = `coaches.assign` (`transfers.ts:36,104-116`); `coachClients.assign/end/transfer` = `coaches.assign`, fresh_start additionally `clients.writeAll` (`coachClients.ts:205,219,250-254`); `media.listImages` = super_admin (`media.ts:15`); `coachClients.listMyClientUsers` = self or `users.read` (`coachClients.ts:117-119`).

## 1. Route guards (AdminApp.tsx)

| Route | Component | In-page guard | admin | super_admin | Nav exposure (nav.ts) |
|---|---|---|---|---|---|
| `/admin` | AdminDashboard→OverviewPanel | none; super-only queries `enabled: isSuper` (OverviewPanel.tsx:27-29) | ok | ok | ADMIN_NAV:152, sidebar:168 |
| `/admin/accounts` | AdminAccounts | `useCan` per control | ok | ok | 153,175 |
| `/admin/members` | AdminMembers | none (data `users.read`) | ok | ok | 176 |
| `/admin/assignments` | AdminAssignments | `!canAssign` → text (L137-143) | ok (capacity panel silently fails → A-17) | ok | 177 |
| `/admin/subscriptions` | AdminSubscriptions | **none**; unconditional super-only queries (L34-35) | **perpetual skeleton → A-1** | ok | **ADMIN_NAV:154**, 182 |
| `/admin/governance` | AdminGovernance | `canFlags` per control | ok | ok | 155,187 |
| `/admin/analytics` | AdminAnalytics | none (all `users.read`) | ok | ok | 169 |
| `/admin/coaches` | AdminCoaches | `Navigate /admin` if !isSuper (L129) | bounced | ok | SUPER only:204; but CommandHost:73 + Members:105 expose to admin → A-15 |
| `/admin/coaches/:coachId` | AdminCoachDetail | `Navigate` (L120) | bounced | ok | via rows |
| `/admin/plans` | AdminPlans | `Navigate` (L96) | bounced | ok | SUPER only:213 |
| `/admin/audit` | AdminAudit | `!canAudit` → text (L66-73) | ok | ok | 188 |
| `/admin/banners` | AdminBanners | none (mutations need `flags.manage`, admin has it) | ok | ok | 189 |
| `/admin/media` | AdminMedia | `Navigate` (L59) | bounced | ok | SUPER only:223 |
| `/admin/clients/:clientId` | AdminClientDetail | none | ok | ok | via rows |
| `/admin/settings` | RoleAccount | — | ok | ok | 194 |
| `*` | `Navigate /admin` (AdminApp.tsx:62) | | | | |

## 2/3. Interaction certification

Columns: Route | Role | Component | Control | Beh. | Handler | Service/Hook | tRPC | Success | Error | Inv. | Nav | Mobile equiv. | Status | Finding

### 2a. `/admin/accounts` — AdminAccounts.tsx

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Nav | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| "Create account" (header, `canCreate`) L247-251 | LS | `setCreating(true)` | — | — | Sheet opens | — | — | — | same | VERIFIED | |
| Search field L256 (300ms debounce → URL `q`, L108-118) | BQ | `setSearch` | `fetchUsersPage` | `adminUsers.list{search}` (server-side regex `adminUsers.ts:73-77`) | new query identity resets cursor (L133-139) | `list.isError` unhandled → "No accounts" EmptyState | — | URL replace | same | VWKL | A-10 |
| Role chips ×5 L260-269 (`all/super_admin/admin/coach/client`) | BQ | `setRoleFilter` → URL | same | `adminUsers.list{role}` | server-filtered | same | — | URL | same | VERIFIED | A-26 (no aria-pressed) |
| Status chips ×5 L272-282 | BQ | `setStatusFilter` | same | `{status}` | server-filtered | same | — | URL | same | VERIFIED | |
| Infinite scroll sentinel L149,340 | BQ | `fetchNextPage` | `useInfiniteScroll` | cursor `createdAt:id` | appends | silent | — | — | same | VERIFIED | |
| Mobile "Select all" checkbox L287-294 / DataTable header checkbox | LS | `sel.setMany(selectableIds)` | `useSelection` | — | all *loaded* manageable rows | — | — | — | yes | VWKL | A-27 |
| Row checkbox (mobile L319 / table L105) | LS | `sel.toggle` (only if `canManage`) | | | | | | | yes | VERIFIED | |
| Row click → account Sheet L310,322 | LS | `setSelected(u)` | | | Sheet; error cleared on target change L128 | | | | yes | VERIFIED | |
| Bulk Activate / Suspend / Disable L345-347 (`canStatus`) | BM | `runBulkStatus` → confirmDialog (n named, danger for non-active) L210-219 | `bulkSetAccountStatus` | `adminUsers.bulkSetStatus{targetIds,status}` | toast `common.bulk.done{ok}` (warning if failed>0), `sel.clear()` | alertDialog | `users, platformStats, usersByRole, coachAdmin, adminMembers` (L151-162) | — | yes | VERIFIED | self included for super_admin → partial fail (A-6) |
| Bulk "Clear" (BulkActionBar.tsx:33-41) | LS | `sel.clear` | | | | | | | yes | VERIFIED | |
| Sheet: "View client details" (client rows) L355-358 | NAV | `navigate(/admin/clients/:id)` | | | | | | yes | same | VERIFIED | |
| Sheet: role chips client/coach L466-483 (`canRoles && changeableRoles`) | BM | `changeRole` → confirm (danger, name) L447-455 | `setRole` | `adminUsers.setRole{id,role∈client|coach}` | toast saved, sheet closes, `refresh()` | inline `actionError` L464 | as above | | same | VERIFIED | A-6 (self), A-21 ('Failed') |
| Sheet: status chips ×4 L486-503 (`canStatus`) | BM | `changeStatus` → confirm (danger for suspended/disabled) L436-445 | `setAccountStatus` | `adminUsers.setStatus` | same | inline | same | | same | VERIFIED | A-6 |
| Sheet: "Delete account" L507-513 (super_admin only) | BM | `doDelete` → confirm danger, `common.delete` label L426-434 | `deleteUser` | `adminUsers.delete` (super) | toast removed, close | inline | same | | same | VERIFIED | A-6 (self) |
| Sheet: non-manageable target → `admin.cannotEditSuper` L422-424 | VIS | | | | | | | | | VERIFIED | |
| Create form: email/name/phone/password/role chips, submit L555-583 | BM | `mut.mutate()` if `valid` (email>3, phone non-empty, password rule) | `createUser` | `adminUsers.create` (admin targets need super) | toast, `onDone` → close + `refresh()` | inline `create-error` | `users,…` | | same | VWKL | A-23 |
| Empty state "Clear filters" L301-306 | LS | resets search/role/status | | | | | | URL | same | VERIFIED (also shown on fetch error → A-10) | |
| `!online` → all action buttons disabled (L367,580) | VIS | `useOnlineStatus` | | | | | | | | VERIFIED | |

Double-submit: every mutation button `disabled={…isPending}` (L367,345-347,580). Sheet state reset: `Sheet` returns `null` when closed (Sheet.tsx:95) → `CreateAccountForm`/`AccountActions` unmount → fresh state. VERIFIED.

### 2b. `/admin/members` — AdminMembers.tsx

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Nav | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Search L150 (300ms → server) + `bumpUsage('searches')` telemetry L58-63 | BQ | `setSearch` | `fetchMembers(search)`, `bumpUsage` | `adminMembers.get{search}`, `usage.bump` | rows narrowed server-side; KPIs from full set | skeleton forever (`!d`) | — | — | same | VWKL | A-10 |
| Role select (all/coach/client/admin) L151-156 | LS | client filter over full server row set | | | | | | | same | VERIFIED | |
| Status select ×4 L157-163 | LS | same | | | | | | | same | VERIFIED | |
| Segment select L164-169 | LS | `inSegment` client-side (server also supports `segment`, unused) | | | | | | | same | VERIFIED | |
| Sort newest/oldest L170-173 | LS | | | | | | | | same | VERIFIED | |
| Pagination Prev/Next L218 | LS | `usePagination(rows,25,resetKey)` — resets to p1 on any filter change (L103) | | | | | | | same | VERIFIED | |
| Expiring-soon row click L183 | NAV | `openMember` | | | | | | `/admin/coaches/:id` or `/admin/clients/:id` | same | VWKL | A-15 |
| Table row click / mobile row L202,207 | NAV | `openMember` | | | | | | same | same | VWKL | A-15 |
| Row action Suspend/Reactivate L126-130 (`canManage(role) && id!==actorId`) | BM | `quickAction` → confirm only when suspending (danger, name) L106-111 | `setAccountStatus` | `adminUsers.setStatus` | toast `platform.status.{next}` | alertDialog | **`adminMembers` only** | | **none on mobile** | VWKL | A-11, A-14 |
| Empty state L197 | VIS | no CTA | | | | | | | same | VERIFIED | |

### 2c. `/admin/coaches` — AdminCoaches.tsx (super_admin)

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Nav | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Search L239 (300ms) | BQ | key `['coachAdmin', q]` / bare `['coachAdmin']` when empty (L66-70) | `fetchCoachAdmin` | `adminCoaches.list{search}` (server) | rows narrowed; KPIs full | skeleton forever | — | — | same | VWKL | A-10 |
| Pagination L245,270 | LS | `usePagination(rows,25,search)` | | | | | | | same | VERIFIED | |
| Select-all (page only) / row checkbox L175-181,195 | LS | `sel`; cleared on search/page change L107 | | | | | | | yes | VERIFIED | |
| Table row click → DetailPanel preview L174 | LS | `setSelectedId` | | | | | | | mobile taps navigate to detail L194 | VERIFIED | |
| Row "Renew" (attn col) L160 | BM | `renew.mutate(id)` **no confirm** | `renewCoachPlan` | `coachPlans.me`(403)→`adminCoaches.detail`, `coachPlans.adminUpdate{tier}`, `adminAudit.create` | toast | alertDialog | `coachAdmin` only | | badge only | VWKL | A-13, A-19, A-31, A-11 |
| Preview "Renew" L344-348 | BM | same | | | | | | | none | VWKL | same |
| Preview "Suspend" L352 | BM | `setStatus.mutate({status:'suspended'})` **no confirm** | `setCoachSuspended` | `coachPlans.adminUpdate{status}` + `adminUsers.setStatus` (Promise.all) + audit | toast | alertDialog | `coachAdmin, users, usersByRole coach` | | none (detail) | **VWKL** | **A-5**, A-16, A-11 |
| Preview "Reactivate" L350 | BM | `status:'active'` | same | same | | | same | | none | VERIFIED | A-16 |
| Preview "Audit logs" L354 | NAV | `/admin/audit` (no actor filter) | | | | | | yes | none | VERIFIED | A-29 |
| Preview "View details" L357 | NAV | `/admin/coaches/:id` | | | | | | yes | tap row | VERIFIED | |
| Bulk Activate / Suspend L274-275 | BM | `runBulk` → confirm (n) L124-128 | `bulkSetAccountStatus` | `adminUsers.bulkSetStatus` (**account only**) | toast bulk.done, clear | alertDialog | `coachAdmin, users, usersByRole coach` | | yes | **BROKEN (state drift)** | **A-2** |
| `requestPending` chip L159,214,322 | VIS | from `['planRequests','pending']` | | `coachPlanRequests.listPending` | | | | | yes | VERIFIED | |

### 2d. `/admin/coaches/:coachId` — AdminCoachDetail.tsx (super_admin)

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Nav | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Back (TopBar) L156 | NAV | `useBack('/admin/coaches')` | | | | | | | same | VERIFIED | |
| Plan request card Approve/Reject L171-172 | BM | (other agent) | | `coachPlanRequests.confirm/reject` | `planRequests pending` + `invalidate()` | | | | same | n/a | |
| Tier chips L208-212 (`tiers` from `coachPlanTiers.list`) | BM | `tier.mutate(key)` **no confirm; current tier clickable** | `setCoachTier` | `coachPlans.adminUpdate{coachId,tier}` + audit | toast changeTier; `coachPlanAdmin,coachUser,coachAdmin` | alertDialog | | | same | **VWKL** | **A-12** |
| "Renew" L219 | BM | `doRenew` → confirm (name) | `renewCoachPlan` | as 2c | toast | alert | same | | same | VWKL | A-13, A-19 |
| "Extend trial" L220 | BM | `doExtend` → confirm `{n:15}` | `extendCoachTrial(15)` | `adminUpdate{tier: current}` | toast | alert | same | | same | **VWKL** | **A-13** |
| "Suspend" L224 (accountStatus active/disabled) | BM | confirm danger `confirmSuspend` → `acct.mutate('suspended')` | `setCoachSuspended` | 2 mutations + audit | toast; `users,usersByRole coach,coachAdmin,+invalidate()` | alert | | | same | VERIFIED | A-16 |
| "Reactivate" L222 (suspended/pending) | BM | `acct.mutate('active')` (no confirm, non-destructive) | same | | | | | | same | VERIFIED | |
| Client limit input + "Set limit" L228-239 | BM | `doSetLimit` → confirm `{n,name}`; disabled unless numeric ≥0 | `setCoachMaxClients` | `adminUpdate{maxClients}` (sets `maxClientsOverride`) | `setLimit('')`, toast, invalidate → row "clients used" shows new cap | alert; input preserved | | | same | VERIFIED | |
| End date input + "Set end date" L242-251 | BM | `doSetEndDate` → confirm `{date,name}`; local-midnight ms L143 | `setCoachPlanEndsAt` | `adminUpdate{endsAt}` | invalidate; input re-synced via `toIso` (UTC) L60-62 | alert | | | same | **VWKL** | **A-9** |
| "Clear end date" L252 (disabled if none) | BM | confirm danger | `setCoachPlanEndsAt(null)` | `{endsAt:null}` | | | | | same | VERIFIED | |
| Plan history list L188-203 | VIS | `p.history` reversed, 15 max | | | | | | | same | VERIFIED | |
| `!online` disables all L209,219-224,239? (limit/enddate **not** offline-gated L239,251) | VIS | | | | | | | | | VWKL | minor |

### 2e. `/admin/assignments` — AdminAssignments.tsx

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Nav | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Search input L240 (unlabelled) | LS | client-side over `fetchByRole('client')` (max 200) | `adminUsers.byRole{role:'client',max:200}` | | | | | | same | **VWKL** | **A-4**, A-26 |
| Pagination L268 | LS | `usePagination(filtered,25,search)` | | | | | | | same | VERIFIED | |
| Client row → Sheet L256 | LS | `setSelected` | | | | | | | same | VERIFIED | |
| Coach capacity rows L221 (`capacityRows`) | NAV | `/admin/coaches/:id` | `fetchCoachAdmin` `['coachAdmin']` enabled `canAssign` | `adminCoaches.list` (super only) | | **FORBIDDEN for admin → panel hidden** | | | same | VWKL | **A-17** |
| Pending request "Review" L196-204 (`disabled={!client}`) | LS→BM | `setWizard({client, presetCoachId: toCoachId})` | TransferWizard → `transferClientWithMode` | `coachClients.transfer` (**not** `transfers.resolve`) | request stays `pending` | | | | same | **BROKEN** | **A-3** |
| Pending request "Reject" L205-207 | BM | `doRejectReq` → confirm danger `{coach}` | `resolveTransferRequest(...,'rejected')` | `transfers.resolve{action:'reject'}` | toast rejectDone; `refresh()` | alert | `usersByRole client, pendingTransfers, coachAdmin` | | same | VERIFIED | |
| Sheet (assigned): "Transfer" L280-287 | LS | close sheet, open wizard | | | | | | | same | VERIFIED | |
| Sheet (assigned): "Unassign" L288-290 | BM | `doUnassign` → confirm danger (name) | `unassignClient` | `coachClients.end{id,reason:'unassigned'}` | toast removed; close; refresh | alert | same | | same | VERIFIED | |
| Sheet (unassigned): coach rows L296-308 | BM | `pickCoach` → confirm `{name,coach}` → `assignMut` | `assignClientToCoach` | `coachClients.assign{clientId,coachId,subscription:{status:'pending'}}` | toast saved; close; refresh | alert (cap/etc.) | same (**not** `adminMembers`) | | same | VWKL | A-11, A-24 |
| Sheet (unassigned, no coaches): EmptyState `admin.noCoaches` L312 | VIS | | | | | | | | | VERIFIED | |
| Empty state "Clear filters" L246-251 | LS | `setSearch('')` | | | | | | | same | VERIFIED | |
| `!canAssign` page text L137-143 | VIS | `admin.cannotEditSuper` (wrong copy) | | | | | | | | VWKL | A-20 |

### 2f. TransferWizard.tsx (mounted by AdminAssignments in `Sheet size="wizard"`, footer lifted via `onFooterChange` L126-127)

| Step / Control | Beh. | Handler | Notes | Status | F |
|---|---|---|---|---|---|
| Step dots L129-135 | VIS | | | VERIFIED | |
| 1: coach rows (excl. `fromCoachId`) L168-173 | LS | `setToCoachId` | preset from request may not be in 200-cap list → no highlighted row | VWKL | A-4, A-24 |
| 2: Fresh Start option L183-190 (`disabled={!canFreshStart}`) + locked hint L191 | LS | `setMode('fresh_start')` | disabled+reason for admin (backend `clients.writeAll` `coachClients.ts:252`) | VERIFIED | |
| 2: Keep plans L192 (default) | LS | | | VERIFIED | |
| 3: keep/new/expire + new-sub fields (status select, months, price, currency) L200-236 | LS | validation `monthsInvalid`/`priceInvalid` gates Next L94 | | VERIFIED | |
| 4: review + `runError` role=alert L242-261 | VIS | | | VERIFIED | |
| Footer Back/Cancel L97-99 | LS | step-1 → `onCancel` | | VERIFIED | |
| Footer Next L100-109 | LS | `nextDisabled` | | VERIFIED | |
| Footer Confirm L110-121 | BM | `doRun`: fresh_start → confirm danger `{name,coach}`; `run.mutate()`; disabled `isPending||!online` | `coachClients.transfer{id:relId(from,client),toCoachId,mode,subscriptionHandling,newSubscription?}` → toast `transfer.confirm` → `onDone` (close+refresh) | VERIFIED (except A-3 when launched from a request) | A-3 |
| State reset between entities | LS | `wizard` null unmounts children (Sheet.tsx:95) | | VERIFIED | |

### 2g. `/admin/governance` — AdminGovernance.tsx

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|
| "Add" flag L72-76 (`canFlags`) | LS | `setAddingFlag(true)` | | | | | | same | VERIFIED | |
| Flag On/Off toggle L90-97 (`disabled={!canFlags||pending}`) | BM | `doToggle` → confirm `{id,scope}` (danger when disabling) | `saveFlag` | `flags.save{id,enabled,scope,targetId}` | toast flagEnabled/Disabled; inv `featureFlags` | alert | | same (no aria-pressed) | **VISUAL (no consumer)** | **A-7**, A-26 |
| Flag list (`flags.list`) L79-101 | BQ | | `listFlags` | `flags.list` (`flags.manage`) | | isError → "No flags" text | | same | VWKL | A-10 |
| FlagForm: id, scope chips, targetId (non-global), enabled checkbox, Save L193-213 | BM | submit if id non-empty | `saveFlag` | `flags.save` | toast saved; close; inv `featureFlags` | alert | | same | VISUAL | A-7 |
| Roles × permissions table L109-150 | VIS | reads `ROLE_PERMISSIONS` + `admin.permissionInfo` (all 9 keys present) | | | | | | `min-w-[560px]` h-scroll | VERIFIED (read-only by design) | A-8 (no editor) |

### 2h. `/admin/banners` — AdminBanners.tsx

| Control | Beh. | Handler | Service | tRPC | Success | Error | Inv. | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|---|
| "New banner" L73 | LS | `setEditing(blank(actorId))`, reset `submitAttempted` | | | | | | same | VERIFIED | |
| Load error EmptyState + Retry L77-83 | BQ | `q.refetch()` | `listBanners` | `banners.list` | | | | same | VERIFIED | |
| Row Enable/Disable L101 (no confirm) | BM | `toggle.mutate(b)` | `saveBanner` (update→create fallback) | `banners.update` | toast saved; inv `banners*` | alert | | same | VERIFIED | A-31 |
| Row Edit L102 | LS | `setEditing(b)` | | | | | | same | VERIFIED | |
| Form fields: headline (required), body, ctaLabel, ctaHref(type=url), style, placement, audience chips client/coach, segment, start/end dates, active L167-210 | LS | `onChange(setEditing)` | | | | | | same | VWKL | A-9 (dates), A-28 (href) |
| Footer Save (`form="banner-form"`, SubmitButton spreads `...rest` SubmitButton.tsx:46,59) L117-126 | BM | form `onSubmit` → `onSubmitAttempt`; requires title & date order L156 | `saveBanner` | `banners.update`→NOT_FOUND→`banners.create` | close; inv `banners`; toast | alert | | same | VERIFIED | |
| Footer Delete L127 | BM | `remove` → confirm danger `{title}` | `deleteBanner` | `banners.delete` | close; inv; toast removed | alert | | same | VERIFIED | |
| Empty state L85 (no CTA; header button) | VIS | | | | | | | | VERIFIED | |

### 2i. `/admin/audit` — AdminAudit.tsx

| Control | Beh. | Handler | Service | tRPC | Success | Error | Mobile | Status | F |
|---|---|---|---|---|---|---|---|---|---|
| Category chips (derived, accumulating) L78-86 | BQ | `setCat` → `['audit',{action}]` | `fetchAuditPage(25,cursor,{action})` | `adminAudit.list{action}` server regex `^cat\.` (`adminAudit.ts:76-80`) | full-log filter | | same | VERIFIED | |
| Infinite scroll L64,116 | BQ | cursor | | | | | same | VERIFIED | |
| Error EmptyState + Retry L89-95 | BQ | `audit.refetch()` | | | | | same | VERIFIED | |
| Empty `admin.noLogs` L112 | VIS | | | | | | | VERIFIED | |
| Log row (no click) L99-110 | VIS | raw `targetUserId`, `toLocaleString()` | | | | | | VWKL | A-29, A-21 |
| `!canAudit` L66-73 | VIS | wrong copy key | | | | | | VWKL | A-20 |

### 2j. `/admin` — OverviewPanel.tsx

| Control | Beh. | Target | Status | F |
|---|---|---|---|---|
| "Total accounts" MetricCard L59 (only clickable tile) | NAV | `/admin/accounts` | VERIFIED | |
| Needs-review rows: plan → `/admin/coaches/:id` L91; capacity → same L103; transfer → `/admin/assignments` L113 | NAV | | VERIFIED (plan/capacity super-only by data) | A-25 (dup key) |
| "Audit logs" link L122 | NAV | `/admin/audit` | VERIFIED | |
| Recent coaches rows L154, "Coaches" link L150 (super) | NAV | `/admin/coaches[...]` | VERIFIED | |
| Empty states `admin.nothingToReview` L79, `admin.noLogs` L135 | VIS | | VERIFIED | |

### 2k. `/admin/subscriptions` — AdminSubscriptions.tsx (excluding confirm/reject)

| Control | Beh. | Target / tRPC | Status | F |
|---|---|---|---|---|
| Page data `['coachAdmin']`, `['planRequests','pending']`, `['adminGrowth']` L34-37 | BQ | `adminCoaches.list` (super), `coachPlanRequests.listPending` (super), `adminGrowth.get` (`users.read`) | **BROKEN for admin** | **A-1** |
| Pending request rows → `/admin/coaches/:id` L107 | NAV | | VWKL | A-22 (raw tier key) |
| Expiring trial rows → coach detail L120 | NAV | | VERIFIED | |
| Expiring client rows → `/admin/clients/:id` L130 | NAV | | VERIFIED | |
| Plan-usage rows L165, top coaches L181, "Coaches" link L177 | NAV | coach detail / list | VERIFIED | |
| Empty states `admin.noRequests` L103, `adminPlans.none` L146, `admin.noRevenueByCoach` L188 | VIS | | VERIFIED | |

### 2l. `/admin/analytics` — AdminAnalytics.tsx: read-only tiles + `BarChart`/`DonutChart` (L74-116); per-card loading/error/no-data branches L92-115; `usage.fetch`/`adminStats.get`/`adminGrowth.get` all `users.read` → admin ok. No controls. VERIFIED. Usage tiles error state absent (`u?.dau ?? '—'`) → VWKL (silent '—').

### 2m. `/admin/media` — AdminMedia.tsx (super): Refresh icon-btn L70 (BQ refetch, aria-label ✔); not-configured EmptyState L77; error + Retry L81-86; empty L88; image `<a target=_blank>` L98 (EXT); "Load more" groups L110 (LS). Guard `Navigate` L59. VERIFIED. `clientNames` uses `byRole('client',500)` L30 (names fall back to ids beyond 500) → VWKL.

### 2n. `/admin/clients/:clientId` — AdminClientDetail.tsx: read-only; Back `useBack('/admin/accounts')` L23; queries `user`, `clientWorkoutPlan`, `clientMealPlan`, `clientCardioPlan`, `clientAssessment` L25-29; no controls; no not-found/error branch (title falls back to `coach.client`) → VWKL (A-10 family).

### 2o. `/admin/settings` — RoleAccount.tsx (admin/super_admin)

| Control | Beh. | Handler | Status | F |
|---|---|---|---|---|
| Name / Phone / Timezone inputs (save on blur) L113,117,121 | BM | `saveIfChanged` → `void updateSelf(...)` (`auth.updateProfile`) — no pending/toast/error | **VWKL** | **A-18** |
| AvatarPicker L110 | FILE_UPLOAD | `updateSelf({photoUrl})` fire-and-forget | VWKL (upload owned by other agent) | A-18 |
| Language chips en/ar/ar-eg L152-156 | LS | `setLocale` | VERIFIED | |
| "Change password" L162 → `ChangePasswordSheet` | BM | | VERIFIED (sheet elsewhere) | |
| "Sign out" L167 → confirm danger | BA | `signOut` | VERIFIED | |
| Role chip L141 | VIS | | VERIFIED | |

### 2p. Shell pieces
- `CommandHost` (⌘K) admin items L70-79: Accounts/Assignments/**Coaches**/Subscriptions/Governance + coach entities from `['coachAdmin']` cache → for plain admin "Coaches" bounces and Subscriptions is A-1. VWKL → A-15.
- `CommandPalette`: focus restore, Tab trap, ↑↓/Enter/Esc, `role=dialog aria-modal`, `listbox/option` L113-159. VERIFIED.
- `GlobalSearch` trigger `aria-label` L16. VERIFIED (visual trigger only).
- `PresenceTracker`: `usage.recordActiveDay` once/day via localStorage key L15-22, on mount + visibility. VERIFIED (best-effort).
- `BannerHost`: see §5. `PermissionState`: zero callers → DEAD (A-20). `QuickActions*`: zero admin callers (grep) → not exercised in this slice.
- `Sheet`: Escape/Tab trap/focus restore/body-lock (L63-93), unmount on close (L95). VERIFIED.
- `DataTable`: `<tr role="button" tabIndex=0>` L94-101 → A-26. `MobileCardList`: checkbox outside the row button L41-57 (valid). `Pagination`: hides when 1 page, aria-labels on prev/next L43,57. `RowCheckbox`: `role=checkbox aria-checked` + `stopPropagation` L23-30. `useSelection`/`usePagination`/`useInfiniteScroll`: pure LS; pagination clamps on shrink L39-41. VERIFIED.

## 3. Role / permission visibility matrix (§12, §20)

Legend: H = hidden, D = disabled+reason, E = exposed, BA = backend allows, BR = backend rejects.

| Action (page) | admin | super_admin | Backend guard | Verdict |
|---|---|---|---|---|
| Users list/search/filter (Accounts) | E/BA | E/BA | `users.read` | ok |
| Create client/coach (Accounts L247,530) | E/BA | E/BA | `users.create` | ok |
| Create admin/super_admin (Accounts L39-43) | H | E/BA | super_admin only (`adminUsers.ts:102`) | ok |
| Set status on client/coach (Accounts, Members) | E/BA | E/BA | `users.manageStatus` | ok |
| Set status on admin/super_admin target | H (`canManage` L62) | E/BA (Accounts) / H for super target (Members L77) | super only | ok (A-32 inconsistency) |
| Set status on **self** (Accounts) | H (self is admin → `canManage` false) | **E/BR** (L60-61 vs `adminUsers.ts:256`) | self-block | **A-6** |
| Set status on self (Members L126) | H | H | | ok |
| Bulk status (Accounts L343-349; Coaches L273-276) | E/BA (self excluded by role rule) | E/BA (self **included** → partial fail) | `users.manageStatus` | A-6 |
| Change role client↔coach (Accounts L466) | E/BA | E/BA | `users.manageRoles`; enum client/coach | ok |
| Change role on self | H (admin) | **E/BR** | self-block `:272` | A-6 |
| Set permissions | H (no UI) | H (no UI) | `users.manageRoles` | **A-8** (capability unreachable) |
| Delete user (Accounts L507) | H | E/BA (self **E/BR**) | super only | A-6 |
| Coaches page / coach detail / Plans / Media | H in sidebar + `Navigate` guard | E | super only | ok; but Members L105 + CommandHost L73 route admin there → **A-15** |
| Subscriptions page | **E (ADMIN_NAV:154)/BR data** | E/BA | `adminCoaches.list` super | **A-1** |
| Coach suspend/reactivate (Coaches L350-352, Detail L221-225) | H (page guard) | E/BA | super | ok; A-5 no confirm |
| Coach tier / maxClients / end date / renew / extend (Detail) | H | E/BA | super (`coachPlans.ts:46`) | ok; A-12/A-13 |
| Plan request approve/reject (Detail) | H | E/BA | super | ok (other agent) |
| Assign / unassign / transfer keep_plans (Assignments) | E/BA | E/BA | `coaches.assign` | ok |
| Fresh-start transfer (Wizard L183-191) | **D + reason** (`transfer.freshStartLocked`) | E/BA | `clients.writeAll` | ok (exemplary) |
| Resolve pending transfer (reject) | E/BA | E/BA | `coaches.assign` | ok |
| Coach capacity panel (Assignments L128) | rendered-if-data → **silently fails** | E/BA | super | **A-17** |
| Flags list/toggle/add (Governance) | E/BA | E/BA | `flags.manage` | ok (but inert → A-7) |
| Banners create/update/delete/toggle | E/BA | E/BA | `flags.manage` | ok |
| Audit list | E/BA | E/BA | `audit.read` | ok |
| Analytics / Growth / Usage / Overview stats | E/BA | E/BA | `users.read` | ok |
| Overview super widgets (revenue, growth chart, recent coaches, plan requests) | H (`enabled: isSuper`) | E/BA | super | ok |
| Media gallery | H + `Navigate` | E/BA | super | ok |
| Admin banners visibility (BannerHost) | never rendered (placement null L50) | same | `banners.forViewer` | ok (by design) |

Counts: protected actions checked = 29 rows; wrongly exposed (control visible but backend rejects) = 2 classes (A-1 Subscriptions data for admin; A-6 self status/role/delete for super_admin); exposed-but-bounced navigation = 2 (A-15 Members coach rows, CommandHost "Coaches"); silent-fail = 1 (A-17).

## 4. Form certification (§7 EDIT→SAVE→REFETCH→SAME VALUE)

| Form | Fields | Client validation | Server schema | Save → refetch key | Round-trip | Reset between entities | Status | F |
|---|---|---|---|---|---|---|---|---|
| Create account (Accounts L519-585) | email, name, phone, tempPassword, role | email>3, phone non-empty, password rule; **name not required** | email(), password 8-200, **displayName min 1**, phone optional | `['users',…]` invalidated; new row appears newest-first | ✔ | Sheet unmount | VWKL | A-23 |
| Account status/role (sheet) | chip pick + confirm | n/a | enums | `users`+4 families | ✔ (row badge/role re-rendered from refetch; sheet closes) | ✔ | VERIFIED | A-6 |
| Coach client limit (Detail L228-239) | numeric string | `Number(x)>=0`, non-empty | `int min 0` | `coachPlanAdmin` → "clients used" row L181 | ✔ | `setLimit('')` on success | VERIFIED | |
| Coach end date (Detail L242-253) | `<input type=date>` | non-empty | `int nonneg nullable` | `coachPlanAdmin` → `useEffect` re-sync L60-62 | **✘ in UTC+ zones (−1 day)** | ✔ | VWKL | **A-9** |
| Tier chips | click | none | `tier` string | `coachPlanAdmin` → `chip-on` L209 | ✔ | n/a | VWKL | A-12 |
| Flag form (Governance L164-216) | id, scope, targetId, enabled | id non-empty | id 1-120, targetId min 1 optional (form only sends when scope≠global & non-empty ✔) | `featureFlags` → list row | ✔ (row) / ✘ (no runtime effect) | Sheet unmount | VISUAL | A-7 |
| Banner form (L145-213) | title*, body, cta label/href, style, placement, roles, segment, start/end, active | title non-empty, end≥start on submit | title 1-200, body ≤2000, cta ≤60/≤2000, enums, roles default [] | `banners` → list card | text/enums ✔; **dates ✘ (−1 day UTC+)**; new banner id replaced by server id (relies on list refresh, documented bannersApi.ts:52-58) | `setEditing(b)`/null | VWKL | A-9, A-28 |
| Transfer wizard (4 steps) | coach, mode, sub handling(+status/months/price/currency) | months≥1 when active, price≥0 | `newSubscription` schema (months/days positive, price nonneg) | `usersByRole client, pendingTransfers, coachAdmin` → client row shows new coach L261 | ✔ (row) / request state ✘ | Sheet unmount | VWKL | A-3, A-11 |
| RoleAccount profile (name/phone/timezone) | blur-save | none | `auth.updateProfile` | `set({account})` on success | ✔ on success; ✘ silent on failure | n/a | VWKL | A-18 |

## 5. Mutation → invalidation matrix (§6)

Readers by key: `['users',filter]` Accounts · `['usersByRole',role]` Assignments, Media(`clientNames` separate) · `['coachAdmin'(,q)]` Coaches, Assignments capacity, Subscriptions, Overview, CommandHost · `['adminMembers',q]` Members · `['platformStats']` Overview, Analytics · `['coachPlanAdmin',id]`,`['coachUser',id]`,`['adminCoachClients',id]`,`['coachPlanTiers']` CoachDetail · `['planRequests','pending']` Coaches, CoachDetail, Subscriptions, Overview · `['pendingTransfers']` Assignments; `['pendingTransfers','count']` Overview · `['featureFlags']` Governance · `['banners','admin']` Banners · `['audit',*]` Audit/Overview · `['adminGrowth']`,`['adminUsage']` Analytics/Subscriptions/Overview.

| Mutation (file:line) | Invalidates | Stale readers left (≤60s) | Verdict |
|---|---|---|---|
| Accounts status/role/delete/bulk/create `refresh()` L151-162 | users, platformStats, usersByRole, coachAdmin, adminMembers | `coachPlanAdmin/coachUser` (coach status via Accounts) | VWKL (minor) |
| Members status L82 | adminMembers | **users, usersByRole, coachAdmin, platformStats, coachUser** | **A-11** |
| Coaches `renew` L76 | coachAdmin | **coachPlanAdmin[id]** | A-11 |
| Coaches `setStatus` L88-93 | coachAdmin, users, usersByRole coach | **coachPlanAdmin[id], coachUser[id], adminMembers, platformStats** | A-11 |
| Coaches `bulkStatus` L112-114 | same | same + plan status never written | A-2, A-11 |
| CoachDetail tier/extend/renew/cap/ends `invalidate()` L64-68 | coachPlanAdmin[id], coachUser[id], coachAdmin | — (tiers unchanged) | VERIFIED |
| CoachDetail `acct` L87-97 | + users, usersByRole coach | adminMembers, platformStats | VWKL |
| CoachDetail approve/reject `onResolved` L100-105 | planRequests pending + invalidate() | — | VERIFIED |
| Assignments assign/unassign/reject/wizard `refresh()` L57-70 | usersByRole client, pendingTransfers(+count), coachAdmin | **adminMembers (subState), adminCoachClients[id]**; users (assignedCoachId not displayed) | A-11 |
| Governance toggle/add L45,156 | featureFlags | — | VERIFIED |
| Banners save/delete/toggle L45 | banners* | BannerHost (non-RQ, per-mount fetch) | VERIFIED |
| Plans tier save/archive L57 (other agent) | coachPlanTiers* | **coachAdmin.tiers** (labels/prices in Coaches/Subscriptions) | A-30 |
| Key collisions | `['coachPlan',id]` (coach self) vs `['coachPlanAdmin',id]` (admin) — different users, no collision; `['coachAdmin']` vs `['coachAdmin',q]` — filtered rows under a distinct key ✔; `['pendingTransfers']` vs `['pendingTransfers','count']` — same payload, 2 fetches (A-25); `['coachPlans',coachId]` only used by coach pages (CoachSubscriptionPlans/Panel/Picker) with `listCoachPlans(coachId, true)` vs `(coachId)` — **same key, differently-filtered data** (outside admin slice; flagged for the coach agent) | | | note |

## 6. Feature-flag / banner trace (§31)

| Read site | Source | Writer | Effect | Status |
|---|---|---|---|---|
| `useFlag(flag)` `permissions.ts:31-34` | `account.featureFlags` (user doc) | none (always `{}`) | **zero callers** in `src/` (grep) | DEAD |
| `flags.list` → Governance list L41 | `featureFlags` collection | `flags.save` (Governance toggle/add) | list rows only; no runtime gate anywhere | VISUAL → A-7 |
| `banners.forViewer{placement}` ← `BannerHost` L62 | server `matchesViewer` (active, window, placement, roles, segment) `banners.ts:38-46` | Admin banners page | client_home / coach_dashboard only; admins get `placement=null` → none L50 | VERIFIED |
| Dismiss L71-75 | `sessionStorage forma:dismissedBanners` | | per-tab session; returns on new session (documented) | VERIFIED (by design) |
| Stale cache | fetched on role/placement/uid/createdAt change only L56-66 | | new/edited banner appears on next mount/reload | VWKL (documented, no RQ) |
| Client `matchesViewer` copy `bannersApi.ts:82-94` | | | unused (server filters) | DEAD code (P3, folded into A-21 cleanup) |

## 7. Empty states (§23)

| Page | Trigger | Component/text | CTA | Also shown on error? | Status |
|---|---|---|---|---|---|
| Accounts L301-306 | 0 rows | `admin.noAccounts(+Message)` | Clear filters | **yes (isError)** | A-10 |
| Accounts table `empty` L310 | | same | — | | ok |
| Members L197 | 0 rows | `adminMembers.noMembers` | — | skeleton on error | A-10 |
| Coaches L182,196 | 0 rows | `adminCoaches.none(+Message)` | — | skeleton on error | A-10 |
| Assignments L246-251 | 0 clients | `admin.noClients` | Clear filters | no error branch | A-10 |
| Assignments sheet L312 | no coaches | `admin.noCoaches` | — | | ok |
| Wizard step 1 L165 | no target coaches | `transfer.noCoaches` text | — | | ok |
| Governance L101 | no flags | text `admin.noFlags` | — (Add in header) | **yes** | A-10 |
| Banners L85 / L78-83 | none / error | `adminBanners.empty` / `loadFailed` | — / Retry | separate ✔ | ok |
| Audit L112 / L90-95 | none / error | `admin.noLogs` / `auditLoadFailed` | — / Retry | separate ✔ | ok |
| Media L77,81,88 | not configured / error / none | separate | Retry | ✔ | ok |
| Overview L79,135 | nothing to review / no logs | brand-tone check / list | — | | ok |
| Subscriptions L103,146,188 | | `admin.noRequests` / `adminPlans.none` / text | — | | ok |
| DetailPanel (Coaches) L249 | none selected | `coachDash.selectClient` | — | | ok |
| PermissionState | — | never rendered | | | DEAD (A-20) |

## 8. Toasts / loading / a11y / i18n (§24, §25, §29, §34)

- Toasts: every success path emits `showToast` with an existing key (`common.saved/removed/bulk.done`, `adminCoaches.*`, `admin.flag*`, `transfer.confirm`, `platform.status.*`); errors go to `alertDialog` or inline `role=alert` (Wizard L260). No fire-and-forget mutations except RoleAccount (A-18) and audit writes (best-effort by design `auditApi.ts:10-24`).
- Double-submit: all mutation triggers gated on `isPending` (cited per row); transfer request resolve is CAS server-side (`transfers.ts:133-138`).
- i18n: static keys in all slice files resolve in `en`, `ar`, `ar-eg` (scripted check, 0 missing); dynamic enum keys (`platform.status.*`, `roles.*`, `adminCoaches.state.*`, `platform.scopes.*`, `adminBanners.{placement,segment,styleOpt}.*`, `subscription.{acct,status}.*`, `adminMembers.{segment,sort}.*`, `adminMedia.context.*`, `coachPlan.hist.*`) all present. Hardcoded English listed in A-21; `adminCoaches.tier.${customKey}` unresolvable (A-22).
- a11y statics: Sheet/CommandPalette dialogs ✔; RowCheckbox ✔; Pagination ✔; DataTable `<tr role=button>` ✘; chips without `aria-pressed` ✘; unlabeled search (Assignments) ✘; unlabeled textarea (CoachDetail L169) ✘ → A-26.
- Mobile parity: Accounts ✔ (sheet + checkboxes both breakpoints); Coaches ✘ actions (tap-through), Members ✘ quick action → A-14; Assignments/Governance/Banners/Audit/Detail pages single layout ✔; Governance table horizontal scroll ✔.

## 9. FINDINGS

| ID | Sev | File:line | Defect | Proposed fix |
|---|---|---|---|---|
| A-1 | P1 | `src/pages/admin/AdminSubscriptions.tsx:34-35,78-79`; `src/config/nav.ts:154,182` | Page fetches `adminCoaches.list` and `coachPlanRequests.listPending` (both `roleProcedure('super_admin')`, `adminCoaches.ts:49`, `coachPlanRequests.ts:135`) with no role gate; on FORBIDDEN `q.isLoading||!d` renders `LoadingState` forever. The route sits in plain admin's bottom bar (`ADMIN_NAV`) and sidebar → a permanently-loading tab. | `enabled: isSuper` on both queries + render `PermissionState` for non-super (or drop the tab from `ADMIN_NAV` for admin); add `q.isError` branch with Retry. |
| A-2 | P1 | `src/pages/admin/AdminCoaches.tsx:108-116,273-276` vs `src/services/platform/coachPlanApi.ts:196-219`; `api/_trpc/routers/adminCoaches.ts:84` | Bulk Suspend/Activate calls `adminUsers.bulkSetStatus` (account status only); `CoachPlanDoc.status` untouched, so `r.state` (derived from plan) still reads trial/active: list Pill shows "active", preview offers "Suspend" again, while AdminCoachDetail (keyed on `accountStatus` L221) shows "Reactivate" — the two screens disagree and the code's own "never drift" invariant is violated. | Bulk path should run `setCoachSuspended` per id (or a new server `adminCoaches.bulkSetSuspended` that writes both docs atomically); derive `state` from `accountStatus` too. |
| A-3 | P1 | `src/pages/admin/AdminAssignments.tsx:196-204,318-332`; `src/components/coach/TransferWizard.tsx:49-50,73`; `src/services/platform/coachClientsApi.ts:288`; `api/coach-clients/_service.ts` (no `transfersCol` use; only `api/_trpc/routers/transfers.ts:34,63,98`) | "Review" on a pending takeover request opens the wizard, which completes the move via `coachClients.transfer`, never `transfers.resolve('accept')`. The request stays `pending`: it keeps appearing in the Assignments queue and Overview "needs review" count; a later Reject marks a completed transfer rejected; a later accept CONFLICTs (`transfers.ts:142`). The requester's `mode`/`subscriptionHandling` are also discarded (wizard defaults). | When the wizard is launched from a request, call `resolveTransferRequest(toCoachId, clientId, actor, 'accepted')` (server performs the identical transfer) or pass `requestId` to `coachClients.transfer` and have the server mark the request resolved; pre-fill mode/sub handling from the request. |
| A-4 | P1 | `src/pages/admin/AdminAssignments.tsx:40-41,49-54,240`; `src/services/platform/accountsApi.ts:67`; `api/_trpc/routers/adminUsers.ts:139-141` | Client and coach pickers load `byRole` with default `max=200`, unsorted `.limit()`; search is client-side over that slice. On a platform with >200 clients the remainder are unreachable, and pending requests for them render a disabled "Review" (L200) with no explanation. | Use `adminUsers.list{role:'client', search}` (server search, cursor) for the picker, or raise the cap with a deterministic sort and show a "showing first N" notice; enable Review by fetching the missing client via `adminUsers.get`. |
| A-5 | P2 | `src/pages/admin/AdminCoaches.tsx:352,259` | Preview-panel "Suspend" mutates immediately (`setCoachSuspended` → blocks login) with no confirmation; the same action confirms in AdminCoachDetail (L224) and bulk (L126). | Wrap in `confirmDialog({danger:true, message: adminCoaches.confirmSuspend})`. |
| A-6 | P2 | `src/pages/admin/AdminAccounts.tsx:60-61,206,466-514`; `api/_trpc/routers/adminUsers.ts:189,245,256,272` | `canManage('super_admin', target)` is true for the actor's own row, so a super_admin sees status chips, role chips and Delete on themselves (and self is bulk-selectable); every call is rejected server-side ("Cannot change your own …") and the raw English message is shown. AdminMembers correctly hides self (L126). | Add `target.id !== actorId` to `canManage`/`selectableIds` and show a "you can't modify your own account" hint. |
| A-7 | P2 | `src/services/auth/permissions.ts:31-34` (0 callers); `src/pages/admin/AdminGovernance.tsx:42-57,164-216`; `api/_trpc/routers/flags.ts:12-13,31-33` | Feature flags are write-only: `useFlag` reads the user-doc `featureFlags` map (only ever `{}`), while Governance writes the `featureFlags` collection which nothing reads. Toggling/adding a flag has no effect anywhere in the product. | Either add `flags.forViewer` (global + role/target scoped) consumed by `useFlag`, or remove the section / label it as inert. |
| A-8 | P2 | `src/services/platform/accountsApi.ts:130-132` (0 callers); `src/pages/admin/AdminGovernance.tsx:105-150`; `src/services/auth/roles.ts:28-30` | No UI to edit per-account `permissions` (e.g. grant `clients.writeAll` to an admin, which `roles.ts` says to "grant explicitly"); `users.manageRoles` backing exists (`adminUsers.setPermissions`). Governance matrix is read-only. | Add a permissions checklist to the AdminAccounts sheet (super_admin / `users.manageRoles`), calling `setPermissions` with confirm + `refresh()`. |
| A-9 | P2 | `src/pages/admin/AdminCoachDetail.tsx:32,60-62,143,182,184`; `src/pages/admin/AdminBanners.tsx:27-28,96,201-206` | Dates are written as local midnight (`new Date(`${d}T00:00:00`)`) but read back via `toISOString().slice(0,10)` (UTC). In Africa/Cairo (UTC+2/3) a saved "2026-10-01" re-renders as "2026-09-30" → EDIT→SAVE→REFETCH shows a different value; same skew in every `shortDate(new Date(ms).toISOString()…)` display. | Format with local date parts (`y-m-d` from `getFullYear/getMonth/getDate`) or store `Date.UTC(...)` and read with UTC consistently; centralise in `lib/utils`. |
| A-10 | P2 | `AdminAccounts.tsx:298-306`; `AdminCoaches.tsx:227-228`; `AdminMembers.tsx:137-138`; `AdminSubscriptions.tsx:78-79`; `AdminGovernance.tsx:79-101`; `AdminCoachDetail.tsx:157`; `AdminClientDetail.tsx:41` | Query errors are not branched: Accounts shows "No accounts / Clear filters", Coaches/Members/Subscriptions show a skeleton forever, Governance shows "No flags", detail pages render '—' rows. Only Banners/Audit/Media have error+Retry. | Add `isError` → `EmptyState` with `common.retry` (`refetch`) on each. |
| A-11 | P2 | `AdminMembers.tsx:82`; `AdminCoaches.tsx:76,88-93,112-114`; `AdminAssignments.tsx:57-70`; `queryClient.ts:14` | Cross-page invalidation gaps under 60s `staleTime`: Members status change leaves `users/usersByRole/coachAdmin/platformStats` stale; Coaches renew/suspend/bulk never invalidate `['coachPlanAdmin',id]`/`['coachUser',id]` so reopening the coach's detail shows the old status/end date; Assignments assign/transfer leaves `adminMembers` (subState) and `adminCoachClients[id]` stale. | Introduce one `invalidateAccountCaches(qc, {userId?, coachId?})` helper listing all families (documented in `accountsApi.ts:4-24`) and call it from every account/plan mutation. |
| A-12 | P2 | `src/pages/admin/AdminCoachDetail.tsx:208-212`; `api/_trpc/routers/coachPlans.ts:69-72,79-94,99-101` | Tier chips mutate on a single click with no confirmation; the current tier's chip is enabled, and re-sending it resets `endsAt = now + term` and forces `status='active'` (silent renewal/un-suspend). A real tier switch also clears any `maxClients` override without warning. | Disable the active chip; `confirmDialog` naming the new end date and cap reset. |
| A-13 | P2 | `src/pages/admin/AdminCoachDetail.tsx:135,219-220`; `src/services/platform/coachPlanApi.ts:149-180`; `api/_trpc/routers/coachPlans.ts:71` | "Extend trial (+15 days)" and "Renew" re-send the current tier, which the server turns into `endsAt = now + 15 (trial) / 30 (paid)` — not an extension of the existing date; for a paid coach "Extend trial" is a 30-day renewal from today, and renewing with days left discards them. Confirm copy (`{n:15}`) misstates the effect. | Add an `extendDays` field to `coachPlans.adminUpdate` (`endsAt = max(now, endsAt) + days`), or reword copy to "reset term to N days from today". |
| A-14 | P2 | `src/pages/admin/AdminMembers.tsx:126-130` vs `205-216`; `src/pages/admin/AdminCoaches.tsx:189-222` | Mobile parity: Members' Suspend/Reactivate exists only in the desktop table column; Coaches' Renew/Suspend/preview are desktop-only (mobile rows only navigate). | Add the action to the mobile card (secondary button outside the row button, as `MobileCardList` does for checkboxes) or a tap-to-open action sheet. |
| A-15 | P2 | `src/pages/admin/AdminMembers.tsx:105`; `src/components/CommandHost.tsx:73`; `src/pages/admin/AdminCoachDetail.tsx:120`; `src/pages/admin/AdminCoaches.tsx:129` | Plain admin is routed to super-only pages: Members coach rows → `/admin/coaches/:id` (bounced to `/admin`), admin-role rows → `/admin/clients/:id` (client plan view for an admin); ⌘K "Coaches" → bounced. | Role-aware `openMember` (admin: clients → client detail, coaches → Accounts sheet); hide `a-coaches` for non-super. |
| A-16 | P2 | `src/services/platform/coachPlanApi.ts:205-219` | `setCoachSuspended` runs `coachPlans.adminUpdate{status}` and `adminUsers.setStatus` in `Promise.all`; one can succeed while the other fails → plan/account status drift (with an error dialog but a half-applied state). | Single server procedure (`adminCoaches.setSuspended`) writing both docs; or sequential with compensation. |
| A-17 | P2 | `src/pages/admin/AdminAssignments.tsx:128-135,216-234`; `api/_trpc/routers/adminCoaches.ts:49` | Coach-capacity panel query runs for any `coaches.assign` holder but the procedure is super-only → FORBIDDEN (retried) and the section silently disappears for admins with no notice. | `enabled: isSuper` (and hide), or expose a `users.read`-gated `adminCoaches.capacity` projection. |
| A-18 | P2 | `src/pages/RoleAccount.tsx:49-51,110,113,117,121,130`; `src/services/auth/sessionStore.ts:164-169` | Profile fields save on blur via `void updateSelf(...)` with no pending state, toast, or error handling; on failure the input keeps the unsaved value and the rejection is unhandled. | Wrap in `useMutation` with toast on success, `alertDialog` + revert on error. |
| A-19 | P3 | `src/services/platform/coachPlanApi.ts:30-38,153,170`; `api/_trpc/routers/coachPlans.ts:25` | `getCoachPlan` always tries `coachPlans.me` (`roleProcedureNoActive('coach')`) first, guaranteeing a 403 for super_admin before `adminCoaches.detail`; happens on every plan read, Renew and Extend (2 extra requests each). | Branch on `useSession` role: coach → `me`, else `adminCoaches.detail`. |
| A-20 | P3 | `AdminAssignments.tsx:141,176`; `AdminAudit.tsx:70`; `AdminGovernance.tsx:25`; `src/components/ui/PermissionState.tsx` (0 callers) | Permission-denied pages render `admin.cannotEditSuper` ("You don't have permission to manage this account.") — account-level copy at page level — while `PermissionState` (`state.permissionTitle/Body`) exists unused; eyebrow `platform.superAdmin` hardcoded for plain admin on Assignments/Governance. | Use `<PermissionState/>`; eyebrow from role as AdminAccounts does (L244). |
| A-21 | P3 | `AdminAccounts.tsx:171,180,189,549`; `AdminAudit.tsx:105`; `OverviewPanel.tsx:130`; `AdminPlans.tsx:142,151,210,285-290`; all `e.message` surfaces; `bannersApi.ts:82-94` (dead client copy) | Hardcoded English `'Failed'` fallbacks; raw server error strings shown verbatim (not in en/ar/ar-eg); unlocalized `toLocaleString()`; `(EN)/(AR)` label suffixes and `"growth"` placeholder. | Map TRPC codes/messages to i18n keys in one `errorMessage(e)` helper; pass `i18n.language` to date formatting; localize suffixes. |
| A-22 | P3 | `src/pages/admin/AdminSubscriptions.tsx:112` | Pending-request subtitle uses `t(`adminCoaches.tier.${key}`)` → custom tier keys render as the raw key path. | Use `tierLabel(d.tiers, r.requestedTierKey, t)` (already used at L52) or `loc(r.planSnapshot.label)`. |
| A-23 | P3 | `src/pages/admin/AdminAccounts.tsx:552,564-567`; `api/_trpc/routers/adminUsers.ts:89-90` | Create form requires phone (server optional) and does not require name (server `min(1)`) → Zod error text shown raw. | Mirror server schema client-side (name required, phone optional) with field-level errors. |
| A-24 | P3 | `src/pages/admin/AdminAssignments.tsx:151-156,275-308`; `src/components/coach/TransferWizard.tsx:56,168-173` | `pickCoach`'s "already assigned → wizard" branch is unreachable (picker only renders for unassigned clients); coach pickers list suspended/pending/at-cap coaches with no status or capacity hint (server rejects at cap). | Remove dead branch; filter to active coaches and show `clientCount/maxClients` from `coachAdmin` where available. |
| A-25 | P3 | `src/pages/admin/dashboard/OverviewPanel.tsx:30` vs `AdminAssignments.tsx:77-81` | Same `transfers.list('pending')` payload cached under `['pendingTransfers','count']` and `['pendingTransfers']` → duplicate fetch. | Use the bare key in Overview. |
| A-26 | P3 | `src/components/ui/DataTable.tsx:94-101`; `AdminAccounts.tsx:261-282`; `AdminCoachDetail.tsx:169,209`; `AdminGovernance.tsx:90-97`; `AdminAssignments.tsx:240` | a11y: `<tr role="button">` breaks table semantics; filter/tier/flag chips lack `aria-pressed`; Assignments search input and CoachDetail note textarea have no accessible label. | Move click/keyboard handling to a per-row button cell or use `aria-selected`; add `aria-pressed`; use `SearchField`/`TextAreaField` with `srOnlyLabel`. |
| A-27 | P3 | `src/pages/admin/AdminAccounts.tsx:206-208,287-294`; `src/components/ui/DataTable.tsx:63-71` | "Select all" selects only the infinite-scroll pages already loaded while the cursor may have more; no indication of unloaded rows. | Label "Select all loaded (N)" or disable while `hasNextPage`. |
| A-28 | P3 | `api/_trpc/routers/banners.ts:18`; `src/components/BannerHost.tsx:91`; `AdminBanners.tsx:178` | `ctaHref` accepts any string (client `type="url"` only) and is rendered as `<a href target=_blank>`; no `http(s):` scheme enforcement. | Zod `.url()` + scheme allow-list server-side; client validation message. |
| A-29 | P3 | `src/pages/admin/AdminAudit.tsx:88,104-107`; `AdminCoaches.tsx:261` | Audit rows show raw `targetUserId`, use `log.action` as an i18n key (namespace collision risk), loading is plain "Working…" text; Coaches preview "Audit logs" links without an `actorId/targetUserId` filter although the server supports them (`adminAudit.ts:57-59`). | Resolve names via `usersByRole`/`adminUsers.get`; `t(`audit.${action}`, {defaultValue})`; skeleton; deep-link `?target=<coachId>` filter. |
| A-30 | P3 | `src/pages/admin/AdminPlans.tsx:57`; `api/_trpc/routers/adminCoaches.ts:130` | Tier save/archive invalidates `coachPlanTiers*` only; `coachAdmin.tiers` (labels/prices for Coaches, Subscriptions, Assignments capacity) stays stale ≤60s. | Also invalidate `['coachAdmin']`. |
| A-31 | P3 | `AdminCoaches.tsx:160`; `AdminBanners.tsx:101` vs `AdminCoachDetail.tsx:132` | Renew (list) and banner enable/disable fire without confirmation while the same or similar actions confirm elsewhere. | Consistent confirm policy: confirm anything that changes billing dates/visibility. |
| A-32 | P3 | `AdminMembers.tsx:76-77` vs `AdminAccounts.tsx:60-64` | Super_admin can change another super_admin's status from Accounts (backend allows) but Members hides it — inconsistent rule between two pages that edit the same record. | Share one `canManage(actor, target)` in `services/auth/permissions.ts`. |

Totals — controls inventoried: 131 rows (§2a–2p); protected actions checked: 29; wrongly exposed (visible, backend rejects): 2 classes (A-1, A-6); exposed-but-bounced navigation: 2 (A-15); silent permission failure: 1 (A-17). Findings: 32 (P1 ×4, P2 ×14, P3 ×14).
