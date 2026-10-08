# 10 — Notifications, toasts, banners and reminders audit

## Bottom line

- **Old notifications replay as stacked toasts every time the app opens (BV-01).**
  - The bell decides what is "new" from the empty list it has before the first poll, so it toasts every unread item.
  - What it has already shown is remembered only in memory, so every relaunch, deploy reload or iOS eviction replays the newest 4 unread notifications.
- **The replay never ends.** Nothing marks a notification read unless that exact row or toast is tapped. Doing the actual task (submitting the check-in, reviewing the assessment) never clears it, and there is no "mark all read". One client had 12 unread, including 3 check-in requests already answered (BV-33).
- **Showing a toast changes the client's data context.** The deep link runs when the toast is created, so a dated coach note moved a client's logging day to Sept 25 on cold open (BV-02). Food and cardio logged afterwards go to the wrong day.
- **Nothing reaches users outside the app.** No browser/PWA push exists, and email covers only account and billing events. A client who doesn't open the app never learns their coach messaged them or asked for a check-in.
- **Other things that come back:**
  - Local reminders fire late, all at once, as OS popups when the app opens.
  - Dismissed admin banners return on every relaunch (dismissal kept in `sessionStorage`).
- **Toasts:** 68 call sites. 46 are legitimate toasts (13 need result-style wording), 20 should be inline feedback or nothing, 1 needs a persistent banner, and 1 is the notification feed itself. Errors never use toasts; 44 UI error paths show raw server text in blocking modals instead.
- **Phase B order:**
  1. Toast only genuinely new items, and never run a deep link before a tap.
  2. Resolve notifications when the underlying task is done; mark seen when the feed opens.
  3. One notification per subject: per chat thread, per check-in week.
  4. Persist dismissals; add a reminder grace window.
  5. Build a real delivery model: per-channel delivery records, push, and a digest email.

## Scope, sources and versions

- Repo HEAD `e7663ab` (`development`). Production runs RC2 `cf3a5d9` (per project notes, not re-verified).
  - Since RC2, the only change in the files covered here is the website contact email in `api/_lib/email.ts` (out of scope).
  - **Every finding in this document applies to production as well as HEAD.**
- Browser evidence: isolated stack, production build, client at 390×844. Cited: BV-01, BV-02, BV-29, BV-33, plus `evidence/client-cold-open-replayed-toasts.png`, `evidence/client-selected-day-hijacked.png`, `evidence/client-notifications-390-full.png`.
  - Coach polling numbers are in 13_PERFORMANCE.
  - The earlier certification already observed "coach notifications polled twice (two bells mounted)" (`docs/FORMA_FINAL_BROWSER_E2E_CERTIFICATION.md:112`).
- Code facts below were read at HEAD (file:line).
  - The backlog-toast bug was previously logged as M-9 (P2, "no data impact") in `docs/audit-phase2/05-messenger-media.md:215`.
  - BV-02 shows it does have a data impact.

---

## 1. Notification system maps (brief §18)

### 1.1 In-app notifications (Mongo `notifications`)

**Storage and API**

| Item | Fact | Evidence |
|---|---|---|
| Record | `clientId` (the client the event concerns, not the recipient), `forRole` (`client`/`coach`), `type`, `body` (≤140 chars), deep-link anchor (`screen`, `date`, `entityType`, `entityId`, `route`), `seenAt`, `createdAt`, `createdBy`, `updatedAt` | `api/messages/_handlers/notifications-data.ts:54-69` |
| State | **One state field only: `seenAt`.** There is no delivered, toasted, read, resolved or archived state. | same |
| Writers | Two writers, two id formats: `createNotification` (best-effort, try/catch) and `notify()` (**no try/catch**, awaited after the main write) | `notifications-data.ts:93-117`; `api/client/_lib/notify.ts:19-39` |
| Read | `notifications.list({since?})` returns the newest 50 (or rows newer than `since`) plus `unreadCount` across the whole feed. **The app ignores `unreadCount`.** | `api/_trpc/routers/notifications.ts:16-28`; `src/services/platform/notificationsApi.ts:71-77` |
| Mark | `notifications.markRead({id?})` marks one row, or every unread row when no id is given. **No screen ever calls the "all" form.** | `notifications.ts:31-48` |
| Scope | Client: own rows. Coach: own rows plus rows of every active client (an extra `coachClients` read on every poll). Admin: empty feed. | `notifications-data.ts:127-136` |
| Retention | Index `{clientId, forRole, createdAt}`; **no TTL**. Rows beyond the newest 50 can never be seen or marked. | `scripts/mongo-init-indexes.mjs:48` |

**Producers (complete grep of `api/`)**

| Type | Recipient | Created at | Deep link | One per… | Cleared when the task is done? |
|---|---|---|---|---|---|
| `message_received` | other party | `api/_trpc/routers/messages.ts:132-141` | coach `/coach/messages/:clientId`; client `/messages` | **message** (a broadcast creates one per client) | Yes, when the thread is opened (`messages.ts:226-237`) |
| `checkin_requested` | client | `api/_trpc/routers/clientCheckIns.ts:95` | `/check-in/:weekStart` | week (re-request returns early, :76) | **No.** Submitting (:115-140) leaves it unread (BV-33) |
| `checkin_submitted` | coach | `clientCheckIns.ts:138` | `/coach/client/:id/checkins` | submission | **No.** Review (:143-155) leaves it |
| `checkin_reviewed` | client | `clientCheckIns.ts:152` | `/check-in/:weekStart` | **every review**, including re-reviews | No |
| `measurement_added` | client | `clientCheckIns.ts:206` (coach/admin writes only) | measurements **plus that date** | save | No |
| `freeze_requested` | coach | `clientCheckIns.ts:247` | `/coach/client/:id`, though the decision UI is on the Subscription tab | request | **No.** Decision (:264-279) leaves it |
| `freeze_decided` | client | `clientCheckIns.ts:277` | `/coach-notes` | decision | No |
| `coach_note` | client | `api/_trpc/routers/clientCoachNotes.ts:53-63` | anchored: screen **plus date** and entity; unanchored: no route, so falls back to `/` | note | No |
| `targets_updated` | client | `clientCoachNotes.ts:116` | `/nutrition` | **every save**, even unchanged | No |
| `assessment_submitted` | coach | `api/_trpc/routers/clientProfile.ts:154` | `/coach/client/:id/assessment` | **every submit / resubmit** | **No.** Review (:174-187) leaves it |
| `assessment_reviewed` | client | `clientProfile.ts:184` | `/coach-notes`, though the review is shown on `/assessment` | review | No |
| `trial_expiring` | coach | **never.** `coachTrialApi.ts:40-47` calls a front-end `notify()` that does nothing (`notificationsApi.ts:34-36`) | — | — | — |
| `plan_assigned`, `subscription_updated`, `plan_decided`, `coach_assigned`, `client_released` | — | **never produced by any code path.** The rows in BV-33 ("New plan assigned", "Subscription updated") exist only because the test seed wrote them | — | — | — |
| `plan_change_requested` | super-admin | built in the browser from pending plan requests, always `seenAt: null` | `/admin/plans?tab=requests` | request | Only by resolving the request |

**Lifecycle as implemented**

```
created   server insert, seenAt = null
delivered not recorded; whichever poller fetches it
toasted   decided in the browser from an in-memory "newest seen" timestamp + an in-memory Set; forgotten on reload
seen      only when (a) that toast is tapped, (b) that row is tapped in /notifications, or
          (c) the message thread is opened (message_received only)
read / resolved / archived   do not exist
```

### 1.2 Bell unread state

| Item | Fact | Evidence |
|---|---|---|
| Where | `NotificationBell` sits in the BrandBar for every role. The coach/admin shell mounts **two bells** (mobile and desktop chrome; CSS hides one). Each has its own poller, and `/notifications` adds a third. | `src/components/BrandBar.tsx:42`; `src/components/shell/ResponsiveShell.tsx:34-39`; `src/pages/Notifications.tsx:63` |
| Count | Unread rows among the newest 50 loaded in the browser; shows "9+" above 9 | `src/hooks/useNotifications.ts:74`; `NotificationBell.tsx:106-113` |
| Refresh | Polls every 25s (BV-29 measured 2.5/min on the client). Each poll fetches only rows newer than the last one, and the full feed every 4th tick. | `notificationsApi.ts:44-89` |
| After a read | A row marked read elsewhere still counts until the next full refresh, up to ~100s | `notificationsApi.ts:46-50` |
| Return to app | No refresh on focus or visibility. Hidden tabs skip ticks, so the badge waits up to 25s after returning. | `notificationsApi.ts:68` |
| Failure | Errors are swallowed. If the first poll fails, the feed shows "Working…" forever. | `notificationsApi.ts:78-80`; `useNotifications.ts:57-68` |

### 1.3 Toasts

| Item | Fact | Evidence |
|---|---|---|
| Store | In memory (zustand). Duplicates are caught by a module-level `Set` of keys that **resets on every page load**. | `src/stores/toastStore.ts:45-56` |
| Stacking | Only the last 4 are kept; earlier ones are silently dropped (no queue) | `toastStore.ts:66` |
| Position | Fixed at the top: centred on phones, top-end on wider screens. Layered above sheets and the bottom nav, below dialogs and the offline banner. | `src/components/ToastHost.tsx:26-27` |
| Duration | 5s; no pause on hover or focus, no swipe to dismiss; all toasts in a burst vanish together | `ToastHost.tsx:15,42-45` |
| Interaction | The whole toast is a clickable `div`, not keyboard-operable. Auto-dismiss and ✕ **do not** mark the notification seen. | `ToastHost.tsx:54-62`; `NotificationBell.tsx:88-91` |
| Persistence | **None.** This is the defect: "already shown" must survive a reload (see §2). | — |

### 1.4 Browser / PWA push and OS notifications

| Item | Fact | Evidence |
|---|---|---|
| Web Push | **Does not exist.** No `PushManager`, VAPID, `push` or `notificationclick` handler. The service worker is Workbox `generateSW` with no custom code. | grep (no matches); `vite.config.ts` (`VitePWA`, `registerType: 'prompt'`) |
| OS notifications | **Only one source: the client's local reminders.** `registration.showNotification('Gym Tracker', …)` with a fallback to `new Notification`, while the app is open. The title still uses the old product name. | `src/services/reminders/reminderStore.ts:84-101` |
| "Works while closed" | Relies on the Notification Triggers API (`showTrigger`/`TimestampTrigger`), which never shipped in any browser, so this path never runs | `reminderStore.ts:29-36,57-82` |
| Tap action | No `notificationclick` handler, so tapping the OS notification neither opens nor focuses the app | `vite.config.ts` |
| Permission UX | The Settings "Notifications" switch requests OS permission, but it only affects local reminders. Coach messages and check-ins never produce an OS notification. | `src/pages/Settings.tsx:216-219,391-396,425` |
| Idempotency | Not applicable (no push). Reminder OS notifications fire once per reminder per day (`lastFiredDate` is stored locally and synced). | `reminderStore.ts:162-163` |

### 1.5 Email (Resend)

| Event | Call site | Template | Waited for? | Repeat protection |
|---|---|---|---|---|
| Welcome, after signup | `api/_trpc/routers/auth.ts:105` | `docs/email-templates/welcome.html` | **No** | one per account |
| Welcome, after invite claim | `api/_trpc/routers/invites.ts:275` | welcome.html | **No** | one per claim |
| Client invite | `invites.ts:132` | client-invite.html | **No** | one per invite |
| Password reset | `auth.ts:235` | password-reset.html | Yes | rate-limited 5/h per email |
| Coach plan request awaiting / confirmed / rejected | `api/_trpc/routers/coachPlanRequests.ts:168,197,265,285` | inline HTML | **No** (`void notifyCoach`) | one per state change |
| Plan request expired | `api/cron/daily-maintenance.ts:39` | inline | Yes | compare-and-set on status |
| Trial ended → request awaiting | `daily-maintenance.ts:78` | inline | **No** | compare-and-set plus open-request check |

- **No email for any coaching event:** messages, check-ins, notes, plan changes, or client subscription changes.
- **Sends are not recorded and not retried.** Several are not awaited inside a Vercel function, and there is no `waitUntil` anywhere, so they can be cut off once the response returns.
- The default sender is Resend's test address when `RESEND_FROM_EMAIL` is unset (`api/_lib/email.ts:62-64`).
- Plan-request emails insert names, plan labels and admin notes into HTML without escaping (`email.ts:103-128`).

### 1.6 Banners

| Banner | Where it renders | Why it shows | Dismissal | Comes back? |
|---|---|---|---|---|
| Admin marketing banner (`BannerHost`) | **App root, above every role shell, on every route**: thread, workout session, editors | admin-defined targeting (`banners.forViewer`) | `sessionStorage` (`BannerHost.tsx:14-31,71-75`) | **Yes, on every app relaunch or new tab.** It survives a manual refresh only. |
| Coach plan banner | inside every coach page | plan ended or suspended, paid term ≤5 days, over capacity, plan request awaiting (`src/components/coach/CoachPlanBanner.tsx:47-56`) | none (state-derived) | by design. It also pushes the coach chat composer off-screen (09_MESSENGER MS-01). |
| Client subscription banner | client pages | subscription frozen, ended, expired or cancelled (`SubscriptionBanner.tsx`) | none | by design |
| Reminder banner | below the BrandBar | a reminder is due | in memory | no (`lastFiredDate`). It is `sticky top-0 z-40` and overlaps the BrandBar (`sticky top-0 z-30`) when scrolling (`ReminderBanner.tsx:13`; `BrandBar.tsx:30`). |
| WhatsApp support button (coach/admin) | fixed bottom-end | always, except on message routes | in memory "for this session" (`WhatsAppFab.tsx:12`) | **Yes, on every reload** |

The `BannerHost` comment says banners appear "at the top of the client home / coach dashboard", but its placement setting only chooses **which** banners to fetch, not **where** they render (`BannerHost.tsx:33-41,50`; `src/App.tsx:124`).

### 1.7 Local reminders (client)

| Item | Fact | Evidence |
|---|---|---|
| Start | Loaded and started for **every role** at boot; reloaded on every focus for clients | `src/App.tsx:85-86`; `src/apps/ClientApp.tsx:99` |
| Firing rule | Checks every 30s and once immediately. A reminder fires if its time has passed today and it hasn't fired today: **"due OR overdue"**, with no grace window. | `reminderStore.ts:148-175` (rule :155-162) |
| Effect | Writes `lastFiredDate` and sets the in-app banner (a single slot, so the last one wins). With notifications enabled, each reminder also produces an OS notification. | `reminderStore.ts:163-169` |
| Result | The first open of the day after several reminder times fires **every overdue reminder at once**. For example, opening at 20:00 with reminders at 08:00, 12:00 and 16:00 gives 3 OS popups plus the banner. There is no check that the task is already done. | — |

### 1.8 What replays, and when

| Trigger | Bell toasts | Reminders | Banners |
|---|---|---|---|
| Cold open: PWA relaunch, iOS eviction, new tab | **Replay**: newest 4 unread, deep links executed (BV-01, BV-02) | Every overdue reminder fires once that day | Dismissed admin banners and the WhatsApp button return |
| Deploy: the service worker reloads the app as soon as it is backgrounded (`src/main.tsx:17-34`) | **Replay, arriving up to 25s after the user returns** (the first poll is skipped while hidden, `notificationsApi.ts:68`) | same | same |
| Manual refresh | Replay | none (same day) | Banners stay dismissed (`sessionStorage` survives a refresh); WhatsApp button returns |
| Focus / visibility change | No replay (pollers keep their state); badge catches up within ≤25s | 30s check continues | — |
| Reconnect (`online`) | No replay; nothing re-polls immediately | — | — |
| In-app navigation | No replay. The page-load `Set` stops repeats; a remounted BrandBar (e.g. after the workout session) toasts only items not yet shown in this page load. | — | — |

---

## 2. Root cause — "old notifications appear again" (brief §18)

### 2.1 Mechanism (certain; BROWSER-VERIFIED by BV-01 and BV-02)

1. `useNotifications` starts with an empty list (`src/hooks/useNotifications.ts:56`).
2. On its first render the bell records that list's newest timestamp as its "already seen" mark. With nothing loaded, that mark is **0** (`src/components/NotificationBell.tsx:64-69`).
3. The first poll returns the newest 50. Every unread row is "newer than 0", so every one is toasted (`NotificationBell.tsx:71-93`).
4. For each of those rows, the bell computes the deep link **immediately**, before any tap (`NotificationBell.tsx:76`).
   - For clients that is `clientNoteRoute(n)`, which sets the focus target and, for dated rows, **the app's selected day** (`src/lib/noteTarget.ts:23,36`).
   - The day change reloads nutrition, workout and habits for that date (`src/App.tsx:53-58`).
5. The toast store remembers shown keys only in memory (`src/stores/toastStore.ts:45-56`) and keeps the last 4 (`:66`). Those 4 are the newest unread, so they are the same 4 every launch.
6. Nothing in that path marks anything read. Auto-dismiss and ✕ don't. The feed page doesn't mark on open. Completing the task doesn't. No "mark all" exists. So the set never shrinks.

### 2.2 Reproduction

1. **Seed:** the coach requests a weekly check-in, writes a coach note anchored to last Friday's meal, reviews last week's check-in, and sends two messages. The client has not opened the app since.
2. **Open:** the client opens the app (or the installed PWA relaunches, or a deploy reloads it in the background).
   - Within about a second of the first poll, 4 toasts stack over the top ~400px of Today (BV-01, `evidence/client-cold-open-replayed-toasts.png`). Each is titled with the coach's name, for example "Weekly check-in requested", "New coach note · Focus on sleep…", "Check-in reviewed · Great consistency…".
   - The day navigator now shows the note's date (e.g. "FRI 25 SEPT") while the header and week strip still say today (BV-02, `evidence/client-selected-day-hijacked.png`).
3. **Act and reopen:** the client submits the check-in from the Today card and closes the app. On reopen, "Weekly check-in requested" toasts again (BV-01 shows two for already-submitted check-ins) and the day jumps again.
4. **Repeat:** this continues on every open until each notification is tapped one by one on `/notifications` (BV-33: 12 unread, 3 stale check-in requests).

**Unit-level repro for Phase B:** render the bell with a feed whose first emission contains two unread rows.
- Today: two toasts, and the selected day changes.
- Expected: no toasts and no day change.

### 2.3 Other mechanisms that "bring things back", ranked

| Rank | Mechanism | Who | Evidence |
|---|---|---|---|
| 1 | Bell baseline taken from the empty initial list + in-memory dedupe + unread never resolved | every client and coach with ≥1 unread | §2.1; BV-01, BV-02, BV-33 |
| 2 | Overdue local reminders fire together as OS popups on the first open of the day | clients with reminders and the Notifications switch on | `reminderStore.ts:155-169,84-101` |
| 3 | Admin banner dismissals kept in `sessionStorage`; WhatsApp button dismissal kept in memory | anyone shown a banner; coaches/admins | `BannerHost.tsx:14-31`; `WhatsAppFab.tsx:12` |
| 4 | Super-admin plan-request items are always unread, so they toast on every launch | super-admin | `useNotifications.ts:15-28` |

**Ruled out:**
- There is no push, so nothing is re-sent from a server.
- Focus and reconnect don't reset pollers.
- Within one page load, the key `Set` prevents duplicates across the two bells.
- Reminders never repeat within a day.
- Cron emails can't repeat, thanks to the status compare-and-set.

---

## 3. Target lifecycle and channel-by-event table (brief §18)

**Lifecycle every notification should follow:**

1. **Created:** one row per subject, not per event. Examples: `message_received` per thread, `checkin_requested` per client and week.
   - A repeat event updates the row (count, latest preview, timestamp) instead of adding another.
   - Each row carries a recipient id, a canonical server-computed link, and a priority.
2. **Delivered:** tracked per channel and recorded, so it is never repeated.
   - **In-app feed:** delivered implicitly by being listed.
   - **Toast:** at most once per device, and only if the row is newer than the last fetch watermark stored on that device for that user, created within the last ~10 minutes, and not about the screen the user is already looking at. The deep link runs only on tap.
   - **Push** (when built): once per row version per device subscription.
   - **Email:** only as a digest for items still unseen after N hours.
3. **Seen:** opening the bell or feed marks everything visible as seen and clears the badge.
4. **Read:** opening an item.
5. **Resolved:** the server marks the row resolved when the underlying task is done. Examples: submitting a check-in resolves its request; reviewing resolves the submission; opening a thread resolves its messages (this already exists).
6. **Expired:** resolved and read rows leave the unread count at once; every row is purged after about 90 days.

**Which channel fires for which event:**

| Event | Feed | Toast (fresh, in-session) | Existing badge / surface | OS push (when built) | Email | Banner |
|---|---|---|---|---|---|---|
| New chat message | No (one coalesced row per thread at most) | Yes, unless that thread is open | Messages/Inbox badge (exists) | Yes, coalesced per thread | Digest if unread 12–24h | No |
| Check-in requested (client) | Yes | Yes | Today check-in card (exists) | Yes | Optional digest | No |
| Check-in reviewed / assessment reviewed (client) | Yes | Yes | — | Yes | No | No |
| Coach note (client) | Yes (coalesced per day) | Yes | Note shown inline on the relevant screen (exists) | Optional | No | No |
| Plan or targets changed (client) | Yes (coalesced) | No | — | Optional | No | No |
| Check-in / assessment submitted, freeze requested (coach) | Yes, resolved by handling the queue | No | Queue counts on Check-ins / dashboard | Optional daily | Daily digest | No |
| Measurement added by the coach (client) | Yes, low priority | No | — | No | No | No |
| Trial / plan / subscription ending or ended | No | No | — | No | Yes (cron) | Yes (state-derived, exists) |
| Local reminder | No | No | Reminder banner | At the scheduled time only, ≤30 min late, otherwise skipped | No | Reminder banner |
| Admin marketing banner | No | No | — | No | No | Yes; dismissal remembered per user and banner version |

---

## 4. Toast audit (brief §19)

### 4.1 Inventory — every `showToast(` in `src/` (website excluded): 68 sites

Classes: **TOAST** (keep as a toast) · **INLINE FEEDBACK** (the result is already visible in place, so show it there) · **BANNER** (state that must persist until fixed) · **NOTIFICATION CENTER ITEM** · **NOTHING** (the screen change is the feedback).

Every toast below fires only after its mutation succeeds; none fires early. "Action label" means the title is a button label ("Freeze") instead of a result ("Subscription frozen").

| # | file:line | Text (key → EN) | Kind | Trigger | Class | Note |
|---|---|---|---|---|---|---|
| 1 | components/NotificationBell.tsx:80 | coach name / notification type + preview | info | poll finds "new" unread | NOTIFICATION CENTER ITEM | **Replays on every launch; runs deep links when created (§2); can toast a message for the thread already open** |
| 2 | components/ClientSubscriptionSection.tsx:45 | `subscription.requestSubmitted` "Request sent" | success | pause request sent | INLINE FEEDBACK | the section already re-renders as pending |
| 3 | components/coach/IncomingTransferRequests.tsx:66 | `transferReq.approveDone` | success | approve transfer | TOAST | the row disappears |
| 4 | components/coach/IncomingTransferRequests.tsx:71 | `transferReq.rejectDone` | success | reject transfer | TOAST | |
| 5 | components/coach/TransferWizard.tsx:89 | `transfer.confirm` "Transfer client" | success | transfer done | TOAST | action label |
| 6 | components/coach/VersionActions.tsx:53 | `planVersions.versionSaved` | success | save version | TOAST | |
| 7 | components/MeasurementForm.tsx:88 | `common.saved` | success | measurement saved | INLINE FEEDBACK | |
| 8 | components/workout/PlanBuilder.tsx:171 | `coachLib.detachConfirmTitle` "Make this a custom override?" | warning | coach edits a library-linked exercise | INLINE FEEDBACK | **asks a question that can't be answered** |
| 9 | pages/admin/AdminAccounts.tsx:169 | `common.saved` | success | status change | TOAST | |
| 10 | pages/admin/AdminAccounts.tsx:178 | `common.saved` | success | role change | TOAST | |
| 11 | pages/admin/AdminAccounts.tsx:187 | `common.removed` | success | delete account | TOAST | an undo would be better |
| 12 | pages/admin/AdminAccounts.tsx:196 | `common.bulk.done` | success/warning | bulk status | TOAST | should name the failed count |
| 13 | pages/admin/AdminAccounts.tsx:546 | `admin.createAccount` "Create account" | success | create account | TOAST | action label |
| 14 | pages/admin/AdminAssignments.tsx:139 | `common.saved` | success | assign | TOAST | |
| 15 | pages/admin/AdminAssignments.tsx:148 | `common.removed` | success | unassign | TOAST | |
| 16 | pages/admin/AdminAssignments.tsx:154 | `transferReq.rejectDone` | success | reject | TOAST | |
| 17 | pages/admin/AdminBanners.tsx:66 | `common.saved` | success | save banner | INLINE FEEDBACK | the list updates |
| 18 | pages/admin/AdminBanners.tsx:71 | `common.removed` | success | delete banner | TOAST | |
| 19 | pages/admin/AdminBanners.tsx:76 | `common.saved` | success | toggle banner | NOTHING | the switch is the feedback |
| 20 | pages/admin/AdminCoachDetail.tsx:80 | caller-supplied (`forma.admin.renewForma`, `extend`, `admin.setEndDate`, suspend…) | success | admin coach actions | TOAST | mostly action labels (:84-118) |
| 21 | pages/admin/AdminCoaches.tsx:78 | `adminCoaches.renew` "Renew +30d" | success | renew | TOAST | action label |
| 22 | pages/admin/AdminCoaches.tsx:95 | `adminCoaches.suspend` / `reactivate` | success | status | TOAST | action label |
| 23 | pages/admin/AdminCoaches.tsx:124 | `common.bulk.done` | success/warning | bulk | TOAST | |
| 24 | pages/admin/AdminGovernance.tsx:48 | `admin.flagEnabled` / `flagDisabled` | success | flag toggle | TOAST | |
| 25 | pages/admin/AdminGovernance.tsx:183 | `common.saved` | success | add flag | TOAST | |
| 26 | pages/admin/AdminMembers.tsx:86 | `platform.status.<next>` | success | member status | TOAST | |
| 27 | pages/admin/plans/CapacityPackagesTab.tsx:106 | `common.saved` | success | save package | TOAST | |
| 28 | pages/admin/plans/FormaPlanTab.tsx:99 | `common.saved` + raised-coaches count | success | save plan | TOAST | good: the body says what changed |
| 29 | pages/admin/plans/PaymentRequestsTab.tsx:60 | `forma.admin.confirmed` | success | confirm payment | TOAST | |
| 30 | pages/admin/plans/PaymentRequestsTab.tsx:61 | `forma.admin.rejected` | success | reject payment | TOAST | |
| 31 | pages/Cardio.tsx:103 | `common.saved` | success | cardio logged (sheet closes) | NOTHING | the new row is the feedback |
| 32 | pages/CheckIn.tsx:57 | `checkin.submitted` | success | check-in submitted | TOAST | should also clear `checkin_requested` (NT-03) |
| 33 | pages/coach/AddExistingClient.tsx:268 | `coach.addClient` "Add client" | success | assign existing client | TOAST | action label |
| 34 | pages/coach/AddExistingClient.tsx:276 | `transferReq.pending` | success | transfer requested | INLINE FEEDBACK | the row should show "requested" |
| 35 | pages/coach/AddExistingClient.tsx:291 | `common.removed` | success | release client | TOAST | "Released" is clearer |
| 36 | pages/coach/CoachCardioEditor.tsx:98 | `common.saved` | success | save cardio plan | INLINE FEEDBACK | **duplicate**: the editor already shows "Saved" (:100-101) |
| 37 | pages/coach/CoachCheckIns.tsx:48 | `checkin.request` "Request Weekly Check-In" | success | request check-in | TOAST | action label |
| 38 | pages/coach/CoachCheckIns.tsx:91 | `checkin.markReviewed` "Mark Reviewed" | success | review | TOAST | action label |
| 39 | pages/coach/CoachCheckInsOverview.tsx:92 | `checkin.reviewed` | success | review in the queue | INLINE FEEDBACK | queue progress is the feedback |
| 40 | pages/coach/CoachCheckInsOverview.tsx:113 | `coachDash.remindersSent` "Reminders sent to N client(s)" | success | "Send reminders" | TOAST | **misleading**: only clients who never had a check-in get a first request (:72,105-116) |
| 41 | pages/coach/CoachClientNotes.tsx:35 | `common.saved` | success | add note | NOTHING | the note appears in the list |
| 42 | pages/coach/CoachExerciseLibrary.tsx:120 | `common.saved` + `coachLib.templateSyncFailed` (tap = retry) | warning | exercise saved, template sync failed | BANNER | **the failure disappears after 5s; Retry is a mouse-only tap** |
| 43 | pages/coach/CoachExerciseLibrary.tsx:122 | `common.saved` + `templatesUpdated(n)` | success | saved and synced | TOAST | informative |
| 44 | pages/coach/CoachExerciseLibrary.tsx:124 | `common.saved` | success | save exercise | NOTHING | the list updates |
| 45 | pages/coach/CoachExerciseLibrary.tsx:141 | `starter.loadedTitle` + errors | warning | starter library partly loaded | INLINE FEEDBACK | needs a result panel naming what failed |
| 46 | pages/coach/CoachExerciseLibrary.tsx:143 | `starter.loadedTitle` + counts | success | starter library loaded | TOAST | |
| 47 | pages/coach/CoachExerciseLibrary.tsx:150 | `common.removed` | success | delete exercise | TOAST | undo preferred |
| 48 | pages/coach/CoachExerciseLibrary.tsx:286 | `common.saved` | success | save food | NOTHING | |
| 49 | pages/coach/CoachExerciseLibrary.tsx:291 | `common.removed` | success | delete food | TOAST | undo preferred |
| 50 | pages/coach/CoachExerciseLibrary.tsx:430 | `common.saved` | success | save food group | NOTHING | |
| 51 | pages/coach/CoachExerciseLibrary.tsx:435 | `common.removed` | success | delete food group | TOAST | undo preferred |
| 52 | pages/coach/CoachExerciseLibrary.tsx:550 | `common.saved` | success | save supplement | NOTHING | |
| 53 | pages/coach/CoachExerciseLibrary.tsx:555 | `common.removed` | success | delete supplement | TOAST | undo preferred |
| 54 | pages/coach/CoachNutritionEditor.tsx:126 | `common.saved` | success | save meal plan | INLINE FEEDBACK | **duplicate** of the inline "Saved" (:128) |
| 55 | pages/coach/CoachSubscriptionPanel.tsx:86 | caller-supplied (`subscription.unfreeze`, `end`, `cancel`, `extend`, `pauseTitle`) | success | subscription actions | TOAST | action labels (:94-103) |
| 56 | pages/coach/CoachSubscriptionPanel.tsx:115 | `subscription.setTerm` "Set term" | success | set term | TOAST | action label; this mutation defines no error handler |
| 57 | pages/coach/CoachSubscriptionPanel.tsx:123 | `subscription.freeze` "Freeze" | success | freeze | TOAST | action label; no error handler |
| 58 | pages/coach/CoachSubscriptionPanel.tsx:131 | `subscription.setPrice` "Set price" | success | set price | TOAST | action label; no error handler |
| 59 | pages/coach/CoachTemplatePreview.tsx:39 | `workoutTemplate.duplicate` "Duplicate" | success | duplicate, then navigate away | TOAST | action label |
| 60 | pages/coach/CoachTemplatePreview.tsx:44 | `common.removed` | success | delete, then navigate away | TOAST | |
| 61 | pages/coach/CoachWorkoutEditor.tsx:80 | `common.saved` | success | save workout plan | INLINE FEEDBACK | **duplicate** of the inline "Saved" (:85-86) |
| 62 | pages/coach/CoachWorkoutEditor.tsx:177 | `common.saved` | success | save as template (sheet closes) | TOAST | |
| 63 | pages/coach/CoachWorkoutTemplateEditor.tsx:74 | `common.saved` | success | save, then navigate away | TOAST | |
| 64 | pages/Nutrition.tsx:160 | `common.saved` | success | food added or replaced | NOTHING | the row is the feedback |
| 65 | pages/onboarding/AssessmentWizard.tsx:210 | `common.saved` | success | assessment re-edited, then navigate away | TOAST | |
| 66 | pages/Progress.tsx:222 | `common.saved` | success | weight logged | NOTHING | the chart and header update |
| 67 | pages/ProgressPhotos.tsx:106 | `common.saved` | success | photo added | INLINE FEEDBACK | **misleading**: shown even when the upload failed (`photoStore` swallows it), which is every photo in production today (Bunny 401) |
| 68 | pages/Settings.tsx:235 | `common.removed` | success | clear day | TOAST | |

**Totals:**
- TOAST 46, of which 13 use action labels: #5, #13, #20, #21, #22, #33, #37, #38, #55–#59.
- INLINE FEEDBACK 11.
- NOTHING 9.
- BANNER 1.
- NOTIFICATION CENTER ITEM 1.

### 4.2 Checks required by the brief

| Check | Result | Evidence |
|---|---|---|
| Duplicate toasts | None within one page load (keys are checked). The bell can toast a message for the thread you're reading: the 25s bell poll can land between the message arriving and the open thread marking it read. | `toastStore.ts:53-56`; `NotificationBell.tsx:65-93`; `MessageThread.tsx:348-354` |
| Duplicate feedback | 3 coach editors show a toast **and** an inline "Saved" | #36, #54, #61 |
| Replayed toasts | #1 replays the unread backlog on every launch | §2; BV-01 |
| Technical text | No error toasts exist. **44 UI error paths** show raw `e.message` (server English, sometimes validation JSON) in blocking modals or inline text. The tRPC error formatter adds only a commercial reason code. Example in this area: a failed broadcast shows raw server text under the title "Sent". | `api/_trpc/trpc.ts:12-17`; `src/pages/coach/CoachMessages.tsx:308`; `src/lib/commercialErrors.ts:18` |
| Too many success toasts | 20 sites confirm something the screen already shows (11 INLINE FEEDBACK + 9 NOTHING) | table |
| Stacking | Up to 4 visible; extra ones silently dropped; all disappear at the same moment | `toastStore.ts:66`; `ToastHost.tsx:42-45` |
| Mobile obstruction | Top-anchored, so the bottom nav and composer are never covered. The **header, Back, bell and day navigator are covered and tap-blocked** for 5s; BV-01 measured ~400px with 4 toasts. | `ToastHost.tsx:26-27`; `evidence/client-cold-open-replayed-toasts.png` |
| Reappearing after refresh | Yes, for #1 | §1.8 |

---

## 5. Findings

### NT-01 — Old notifications replay as stacked toasts on every app open
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach (super-admin too) · any route · all viewports, worst at 390
- **Evidence:** `src/components/NotificationBell.tsx:64-93`; `src/hooks/useNotifications.ts:56`; `src/stores/toastStore.ts:45-66`; `src/main.tsx:17-34`; `src/services/platform/notificationsApi.ts:68`; BV-01; `evidence/client-cold-open-replayed-toasts.png`
- **Steps / scenario:** see §2.2. Any user with unread notifications opens, relaunches or reloads the app, or a deploy reloads it in the background.
- **Expected vs actual:**
  - Expected: no toasts for items that existed before this open; the badge alone signals them.
  - Actual: the newest 4 unread toasts stack over the top ~400px for 5s, every launch, including check-in requests already submitted.
- **Why it matters:** this is the reported bug. It covers the header and Back on every open, and teaches users to ignore notifications.
- **Direction:** decide "new" against a per-user watermark stored on the device and advanced after every successful poll. Toast only rows created in the last few minutes; never toast the backlog. Add an automated test for exactly this case.
- **Verified:** BROWSER-VERIFIED

### NT-02 — A notification toast moves the client's selected day; later logs go to the wrong date
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client · Today / Fuel / Cardio / Measurements · all viewports
- **Evidence:**
  - `NotificationBell.tsx:76` computes `clientNoteRoute(n)` when the toast is created.
  - `src/lib/noteTarget.ts:23,36` sets the focus target and the selected day; `src/App.tsx:53-58` reloads data for the new day.
  - Dated producers: `api/_trpc/routers/clientCoachNotes.ts:53-63`, `clientCheckIns.ts:206`, `src/pages/coach/CoachViewLayout.tsx:46-52`.
  - BV-02; `evidence/client-selected-day-hijacked.png`.
- **Steps / scenario:** the coach leaves a note on the client's Sept 25 meal ("view as client" → Nutrition) or records a measurement for a past date. The client opens the app, or is using it when the note arrives.
- **Expected vs actual:**
  - Expected: the day changes only if the client taps the notification.
  - Actual: the day navigator jumps to "FRI 25 SEPT" while the header and week strip still say Oct 4, both live and on every replay.
- **Why it matters:** food and cardio logs silently land on the wrong day. The client's adherence and the coach's view of it become wrong.
- **Direction:** a notification never changes app state until it is tapped. A day change caused by following a link should be visible and easy to undo (return to today).
- **Verified:** BROWSER-VERIFIED

### NT-03 — Unread never clears: no mark-all, opening the feed marks nothing, finishing the task leaves it unread
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · bell badge, `/notifications`, `/coach/notifications` · all viewports
- **Evidence:**
  - Only three places mark rows read: `MessageThread.tsx:350-354`, `NotificationBell.tsx:89`, `src/pages/Notifications.tsx:134-140`.
  - Server mark-all exists but is unused: `api/_trpc/routers/notifications.ts:46`.
  - Task handlers don't resolve their notification: `clientCheckIns.ts:115-155,264-279`, `clientProfile.ts:174-187`.
  - BV-33; `evidence/client-notifications-390-full.png`.
- **Steps / scenario:** the client submits the requested check-in from the Today card, or the coach reviews a check-in from the Check-ins screen. Neither touches the notification.
- **Expected vs actual:**
  - Expected: the request disappears from unread once the check-in is submitted, and opening the feed clears the badge.
  - Actual: 12 unread, including 3 stale "Weekly check-in requested" rows. The badge never reaches zero, and those rows keep replaying (NT-01).
- **Why it matters:** a badge that never clears carries no information, and it keeps the replay going forever.
- **Direction:** track read separately from seen; resolve rows on the server when the task is done; mark everything visible as seen when the feed opens; purge after a retention window (§3).
- **Verified:** BROWSER-VERIFIED

### NT-04 — Nothing reaches users outside the app (no push, no coaching email)
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REBUILD
- **Who / where:** client and coach · outside the app · installed PWA and web
- **Evidence:** no `PushManager`, VAPID, or `push`/`notificationclick` code anywhere; `vite.config.ts` (`generateSW`); email events listed in §1.5 (`api/_lib/email.ts`); the "Notifications" setting only drives local reminders (`src/pages/Settings.tsx:391-396,425`)
- **Steps / scenario:** the coach sends a message or requests a check-in, and the client doesn't open the app for 3 days.
- **Expected vs actual:**
  - Expected: the client is told on their phone (push) or by a digest email.
  - Actual: nothing happens until the client happens to open the app.
- **Why it matters:** this is a coach-led product, and coach actions currently go unseen. Response times and check-in completion depend entirely on clients opening the app by habit.
- **Direction:** Web Push for installed PWAs (with a pre-permission explanation), delivery recorded per device, coalesced per thread or subject; a digest email for items unseen after N hours; per-user channel preferences (§3 table).
- **Verified:** CODE-CONFIRMED

### NT-05 — One notification per chat message: double badges, toast bursts, and toasts for the thread you're reading
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client and coach · bell, Inbox/Messages badge, open thread
- **Evidence:** `api/_trpc/routers/messages.ts:132-141` (one insert per send; a broadcast inserts one per client); `src/components/BottomNav.tsx:13-14` (Inbox badge from messages); `NotificationBell.tsx:65-93` (doesn't know which thread is open); `MessageThread.tsx:348-354`
- **Steps / scenario:** the coach sends 5 short messages. On the client's next open, 4 toasts can be messages; the bell shows +5 and the Inbox badge shows 5. While the client reads the thread, the 25s bell poll can land before the thread marks the message read and toast it anyway.
- **Expected vs actual:**
  - Expected: a single "Karim · 5 new messages" item, counted once, never toasted inside that thread.
  - Actual: one row and one toast per message, counted in two badges.
- **Why it matters:** noise that hides the notifications that actually matter (check-ins, reviews).
- **Direction:** one row per thread that updates on each message; leave messages out of the bell (the Messages badge already covers them); never toast for the thread on screen.
- **Verified:** CODE-CONFIRMED (the in-thread toast race is INFERRED)

### NT-06 — Notification centre: every client row is titled with the coach's name; US dates; no grouping or error state
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client (and coach) · `/notifications` · 390
- **Evidence:** `src/pages/Notifications.tsx:90-97` (for clients the "sender" is always the coach), `:162-195` (title = sender, type shrunk to an eyebrow), `:50-58` (`toLocaleDateString()` with no app locale), `:124,202` (15 per page with numbered pages), `:152-155` ("Working…", no error state); BV-33; `evidence/client-notifications-390-full.png`
- **Steps / scenario:** open `/notifications` as a client.
- **Expected vs actual:**
  - Expected: scannable rows that say what happened ("Check-in reviewed", "Plan updated"), grouped by Today / Earlier, dates in the app language.
  - Actual: 12 rows all titled "Karim Mansour", with the event as small caps under the name; older dates as "9/25/2026"; numbered pages; a failed first load shows "Working…" forever.
- **Why it matters:** the feed can't be scanned, so users don't use it, which feeds NT-03.
- **Direction:** title rows with the event, the person secondary; group by recency; one continuous list; a real error state; mark seen on open (NT-03).
- **Verified:** BROWSER-VERIFIED

### NT-07 — Three notification types open the wrong screen
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** client and coach · notification tap targets
- **Evidence:**
  - `assessment_reviewed` → `/coach-notes` (`clientProfile.ts:184`), but the review is shown on `/assessment` (`src/pages/MyAssessment.tsx:94-110`).
  - An unanchored `coach_note` has no route, so it falls back to `/` (`src/lib/noteTarget.ts:25,38`); Today doesn't show notes.
  - `freeze_requested` → `/coach/client/:id` overview (`clientCheckIns.ts:247`), but the decision lives on the Subscription tab (`src/pages/coach/CoachClientSubscriptionTab.tsx:17`).
- **Steps / scenario:** tap each of these notifications.
- **Expected vs actual:**
  - Expected: you land on the thing the notification is about.
  - Actual: you land somewhere that doesn't show it.
- **Why it matters:** each wrong landing costs a hunt, and the user learns not to trust taps.
- **Direction:** the server computes one canonical link per type and subject; check every type against its target in an automated test.
- **Verified:** CODE-CONFIRMED

### NT-08 — Half the notification types are never sent, and the rest are not coalesced
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** client and coach · notification feed
- **Evidence:**
  - No producer for `plan_assigned`, `subscription_updated`, `plan_decided`, `coach_assigned`, `client_released` (grep `api/`; `src/types/index.ts:706-724`). BV-33's "New plan assigned" and "Subscription updated" rows were seeded directly.
  - The trial-expiry chain does nothing: `src/services/platform/coachTrialApi.ts:39-47` → `notificationsApi.ts:34-36`.
  - New rows on every save: `clientCoachNotes.ts:116` (targets), `clientProfile.ts:154` (every assessment resubmit), `clientCheckIns.ts:143-155` (re-review).
- **Steps / scenario:**
  - The coach edits the client's workout plan: the client is never told.
  - The coach saves targets twice: the client gets two notifications.
- **Expected vs actual:**
  - Expected: plan, assignment and subscription changes notify the client once.
  - Actual: they are silent, while trivial saves notify repeatedly.
- **Why it matters:** the feed misses the events clients most need and repeats the least useful ones.
- **Direction:** define the taxonomy once, server-side, with one subject key per type (§3); delete type names nothing produces; move trial reminders to the existing daily cron.
- **Verified:** CODE-CONFIRMED

### NT-09 — Local reminders fire late, all at once, as OS popups on the first open of the day
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client with reminders and the Settings "Notifications" switch on · any route
- **Evidence:** `src/services/reminders/reminderStore.ts:155-169` (fires if due or overdue, no grace window), `:84-101` (OS notification per reminder, titled "Gym Tracker"), `:29-36,57-82` (the "fires while closed" path relies on an API no browser shipped); no `notificationclick` handler (`vite.config.ts`); `src/pages/Settings.tsx:391-396,425`
- **Steps / scenario:** set reminders at 08:00, 12:00 and 16:00 and first open the app at 20:00.
- **Expected vs actual:**
  - Expected: reminders fire on time, or are skipped if missed.
  - Actual: three OS popups and a banner at 20:00 for reminders that are hours old. Tapping a popup does nothing.
- **Why it matters:** stale popups at the wrong time feel like spam. The "Notifications" label also implies coach notifications that never arrive.
- **Direction:** fire only within a short grace window, otherwise mark as missed silently; drop the dead Triggers path; use the "Forma" title and open the app on tap; rename the setting to "Reminders", or make it real push (NT-04).
- **Verified:** CODE-CONFIRMED

### NT-10 — Dismissed admin banners return on every relaunch and show on every screen
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MOVE
- **Who / where:** client and coach · every route, including the chat thread and workout session · all viewports
- **Evidence:** `src/components/BannerHost.tsx:14-31,71-75` (dismissals in `sessionStorage`), `:50` (placement only filters which banners are fetched); `src/App.tsx:124` (rendered at the app root above every shell); `src/components/WhatsAppFab.tsx:12` (dismissed only for the current page load)
- **Steps / scenario:** an admin publishes a client-home banner. The client dismisses it, closes the installed app and reopens.
- **Expected vs actual:**
  - Expected: a dismissed banner stays dismissed; it appears only on Today or the coach dashboard.
  - Actual: it is back after every relaunch, above every page, and it pushes fixed-height layouts down (09_MESSENGER MS-01).
- **Why it matters:** it is one of the "old things reappear on reopen" complaints and makes promotions feel like nagging.
- **Direction:** remember dismissal per user and banner version (server-side, or device storage keyed by user); render banners only in their placement's page; the same rule for the WhatsApp button.
- **Verified:** CODE-CONFIRMED

### NT-11 — Bell polling is duplicated, slow to update after reads, and silent on failure
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client and coach · all routes · coach shells on every viewport
- **Evidence:**
  - Two bells and two pollers per coach/admin page (`ResponsiveShell.tsx:34-39`; certification E-D-11 at `docs/FORMA_FINAL_BROWSER_E2E_CERTIFICATION.md:112`), plus one more on `/notifications`.
  - BV-29: client 2.5 `notifications.list`/min.
  - Server `unreadCount` ignored (`notificationsApi.ts:71-77`); full refresh only every 4th tick (`:46-50`); no refetch on return (`:68`); errors swallowed (`:78-80`).
- **Steps / scenario:** read a notification from the feed, go back, look at the bell.
- **Expected vs actual:**
  - Expected: the badge drops immediately, with one poller per app.
  - Actual: it stays up to ~100s; coaches run 2–3 identical pollers.
- **Why it matters:** wasted requests and a badge that disagrees with what the user just did.
- **Direction:** one shared feed for the whole app; badge from the server's count; refresh immediately after a read and on return to the app; visible error and retry.
- **Verified:** CODE-CONFIRMED (client rate BROWSER-VERIFIED in BV-29)

### NT-12 — Clients have four overlapping "from my coach" places; the coach bell repeats existing work queues
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:**
  - Client: bell → `/notifications`, Inbox tab → `/messages`, menu "Coach" → `/coach-notes`, menu "Check-ins".
  - Coach: bell → `/coach/notifications` vs Messages, Check-ins, Assessments, Subscription tab.
- **Evidence:** `src/config/nav.ts:29-73`; `src/pages/CoachInbox.tsx:25-29` ("Messages" card with an info icon); BV-19 (subscription UI duplicated on "Your coach"); BV-33; `evidence/client-your-coach-390-full.png`
- **Steps / scenario:** a client wants "what did my coach say/ask?" and has to check the bell, the Inbox and the Coach page. A coach handles a check-in from Check-ins, and the bell keeps the item anyway (NT-03).
- **Expected vs actual:**
  - Expected: one coach hub for the client; for the coach, the bell is a derived attention list that empties as queues are handled.
  - Actual: overlapping surfaces with different read states.
- **Why it matters:** splitting the coach relationship across four surfaces makes the product feel less personal and less trustworthy.
- **Direction:** merge the client's coach surfaces into the thread-based coach hub (09_MESSENGER MS-04); the bell carries only system events; the coach bell becomes queue-derived or folds into the dashboard attention list.
- **Verified:** CODE-CONFIRMED (surfaces BROWSER-VERIFIED in BV-19, BV-33)

### NT-13 — Emails are fire-and-forget on Vercel with no record or retry
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach and new users · welcome, invite and plan-request emails
- **Evidence:** not awaited with no `waitUntil`: `coachPlanRequests.ts:47-54,168,197,265,285`, `invites.ts:132`, `auth.ts:105`, `daily-maintenance.ts:78`; no record of what was sent; default sender `onboarding@resend.dev` (`api/_lib/email.ts:62-64`); unescaped HTML in plan-request emails (`email.ts:103-128`)
- **Steps / scenario:** a coach submits a plan request; the function returns before the Resend call finishes.
- **Expected vs actual:**
  - Expected: every transactional email is sent once, recorded, and retried on failure.
  - Actual: delivery depends on the function staying alive; there is no record and no retry.
- **Why it matters:** invite and payment emails are part of revenue and onboarding, and silent drops can't be diagnosed.
- **Direction:** an outbox with sent-at, attempt count and last error, drained by the request (`waitUntil`) or the daily cron; fail loudly in production when the sender isn't configured; escape interpolated values.
- **Verified:** INFERRED (needs production log check)

### NT-14 — Super-admin bell items can never be read; the plain-admin bell is always empty
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** super-admin and admin · bell, `/admin/notifications`
- **Evidence:** `src/hooks/useNotifications.ts:15-28` (`seenAt: null` hard-coded), `:59-62`
- **Steps / scenario:** a super-admin opens the app with pending plan requests.
- **Expected vs actual:**
  - Expected: the requests show as a count and toast once.
  - Actual: they toast again on every launch (NT-01) and stay unread until resolved; an admin's bell never shows anything.
- **Why it matters:** noise for the operators who handle payments.
- **Direction:** show pending requests as a queue count, not notifications; hide the bell for roles without a feed.
- **Verified:** CODE-CONFIRMED

### NT-15 — A failed notification write fails an action that already succeeded
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** KEEP
- **Who / where:** server · 10 check-in, note, target and assessment mutations
- **Evidence:** `api/client/_lib/notify.ts:19-39` (no try/catch), awaited after the main write at `clientCheckIns.ts:95,138,152,206,247,277`, `clientCoachNotes.ts:53,116`, `clientProfile.ts:154,184`; contradicts `docs/FORMA_FINAL_BACKEND_TRPC_AUDIT.md:124`
- **Steps / scenario:** the notification insert fails after the check-in submit is stored.
- **Expected vs actual:**
  - Expected: the submit succeeds and the notification is retried or logged.
  - Actual: the client sees an error; retrying is refused as "already submitted".
- **Why it matters:** rare, but confusing when it happens.
- **Direction:** keep the helper; make it best-effort like `createNotification`, or part of the new outbox (§3).
- **Verified:** CODE-CONFIRMED

### NT-16 — Notifications are never purged; only the newest 50 can ever be seen
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** server · `notifications` collection
- **Evidence:** `scripts/mongo-init-indexes.mjs:48` (no TTL); `notifications.ts:24` (limit 50)
- **Steps / scenario:** an active coach accumulates thousands of message notifications.
- **Expected vs actual:**
  - Expected: resolved and read rows expire.
  - Actual: everything is kept forever; unread rows beyond 50 are unreachable but still counted by the server.
- **Why it matters:** storage and query cost grow without bound.
- **Direction:** a retention window with an expiry index, as part of §3.
- **Verified:** CODE-CONFIRMED

### TS-01 — The toast stack covers the top of the phone screen and blocks taps
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** every role · every route · 390 especially
- **Evidence:** `src/components/ToastHost.tsx:15,26-27,42-45,54-62`; `src/stores/toastStore.ts:66`; BV-01 (~400px covered); `evidence/client-cold-open-replayed-toasts.png`
- **Steps / scenario:** any burst of 2–4 toasts.
- **Expected vs actual:**
  - Expected: one compact toast at a time that never covers Back, the bell or the page title, can be swiped away, and pauses while touched.
  - Actual: up to 4 full-width cards over the header for 5s, tap-blocking; a mouse-only clickable `div`.
- **Why it matters:** blocks navigation exactly when the app opens.
- **Direction:** one visible toast plus a "+N" summary; place it clear of navigation; swipe and keyboard support; pause on interaction.
- **Verified:** BROWSER-VERIFIED

### TS-02 — Errors never use toasts; blocking modals show raw server text
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach and admin mostly · 44 UI error paths
- **Evidence:** `e instanceof Error ? e.message` at 44 places in `src/pages`, `src/components` and `src/lib` (grep; e.g. `src/pages/coach/CoachMessages.tsx:308` titled "Sent", `CoachCheckIns.tsx:50,93`, `IncomingTransferRequests.tsx:67,72`, `AdminAccounts.tsx:171-201`); `src/lib/commercialErrors.ts:18`; the tRPC error formatter adds only a commercial reason code (`api/_trpc/trpc.ts:12-17`)
- **Steps / scenario:** any server-side validation failure, for example a broadcast to a client who was just released.
- **Expected vs actual:**
  - Expected: a short, translated, actionable message next to the failed control, with a retry.
  - Actual: a modal with English server text (sometimes validation JSON), even in the Arabic UI.
- **Why it matters:** it looks broken and can't be acted on.
- **Direction:** map stable error codes to translated messages; show inline errors on forms; use a non-blocking error toast with Retry for background actions.
- **Verified:** CODE-CONFIRMED

### TS-03 — Two success toasts say things that aren't true
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · Progress photos; coach · Check-ins overview
- **Evidence:** `src/pages/ProgressPhotos.tsx:106` "Saved" after `photoStore.add`, which swallows the upload failure (`src/stores/photoStore.ts`; production uploads fail with Bunny 401); `src/pages/coach/CoachCheckInsOverview.tsx:72,105-116` "Reminders sent to N" although only clients with no check-in at all get a first request
- **Steps / scenario:**
  - A client adds a progress photo in production today.
  - A coach taps "Send reminders" while clients have last week's check-ins.
- **Expected vs actual:**
  - Expected: the photo shows "Saved on this phone · not shared yet" until uploaded; the coach is told who actually got a request.
  - Actual: "Saved", and the coach never receives the photo; "Reminders sent" when nothing was sent to most clients.
- **Why it matters:** both break trust between client and coach.
- **Direction:** show sync state per item; reword or rebuild "Send reminders" as a real recurring check-in reminder (NT-08).
- **Verified:** CODE-CONFIRMED (production photo failure INFERRED from the release report)

### TS-04 — A failed template sync is reported only by a 5-second toast with a hidden Retry
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · Library › exercise save · all viewports
- **Evidence:** `src/pages/coach/CoachExerciseLibrary.tsx:120` (warning toast; Retry = tapping the toast); `ToastHost.tsx:54-62`
- **Steps / scenario:** edit a library exercise used in templates while the template sync fails.
- **Expected vs actual:**
  - Expected: a persistent notice on the exercise ("2 templates not updated · Retry") until it is fixed.
  - Actual: a toast that vanishes after 5s; Retry is an undiscoverable, mouse-only tap.
- **Why it matters:** templates silently keep the old exercise.
- **Direction:** persistent inline state with an explicit Retry.
- **Verified:** CODE-CONFIRMED

### TS-05 — Success toasts for things the screen already shows; three editors confirm twice
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client and coach · 20 sites (§4.1 INLINE FEEDBACK and NOTHING rows)
- **Evidence:** e.g. `src/pages/Nutrition.tsx:160`, `src/pages/Cardio.tsx:103`, `src/pages/Progress.tsx:222`, `CoachExerciseLibrary.tsx:124,286,430,550`; duplicates at `CoachWorkoutEditor.tsx:80` (+:85-86), `CoachNutritionEditor.tsx:126` (+:128), `CoachCardioEditor.tsx:98` (+:100-101)
- **Steps / scenario:** log food; save a coach plan.
- **Expected vs actual:**
  - Expected: the new row or inline "Saved · 10:42" is the confirmation.
  - Actual: an extra top-of-screen toast, sometimes on top of an inline "Saved".
- **Why it matters:** noise; it teaches users to ignore toasts.
- **Direction:** toasts only for results that are not visible where the user is, and for undoable deletes.
- **Verified:** CODE-CONFIRMED

### TS-06 — Toast titles are button labels; one toast asks a question
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach and admin · 13 sites (§4.1)
- **Evidence:** `TransferWizard.tsx:89` "Transfer client"; `CoachCheckIns.tsx:48,91` "Request Weekly Check-In", "Mark Reviewed"; `CoachSubscriptionPanel.tsx:86,115,123,131` "Set term", "Freeze", "Set price"; `AdminCoaches.tsx:78` "Renew +30d"; `PlanBuilder.tsx:171` "Make this a custom override?"
- **Steps / scenario:** freeze a client's subscription.
- **Expected vs actual:**
  - Expected: "Subscription frozen until 12 Oct".
  - Actual: "Freeze".
- **Why it matters:** reads like an instruction, not a result; the question toast can't be answered.
- **Direction:** result-style wording with the key value; show the override as a small mark on the exercise, not a question.
- **Verified:** CODE-CONFIRMED

---

## 6. Cross-references (owned by other docs)

- **BV-03 / BV-04 (offline open and resume crash or sign-out):** `refreshAccount` on every return to the app treats any failure, including offline, as signed out (`src/services/auth/sessionStore.ts:146-164`, `src/App.tsx:63-70`). This also remounts the bell, though the key `Set` prevents a second replay within that page load.
- **Media:** the composer and photo pickers rely on `media.status`, which reports only whether keys are configured (`api/_trpc/routers/media.ts:13`). With the production Bunny 401, uploads are offered but fail (09_MESSENGER MS-02; TS-03).
- **Coach subscription panel:** `setStatus`, `setTerm`, `freeze` and `setPrice` define no error handler (`CoachSubscriptionPanel.tsx:90-135`); verify the call sites.
- **Polling totals** (BV-29: client on Today 14 requests/min, in a thread 21/min): 13_PERFORMANCE.
