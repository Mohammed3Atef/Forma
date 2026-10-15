# B2 — Client route migration

> Every client route before B2, where it lives after B2, what is preserved, how links resolve, and how it is tested.
> Rule: **URLs are kept wherever they already point at the right place.** That keeps server-stored notification routes, bookmarks and the e2e suite working. Only routes with no destination of their own redirect.
> "Tab" is the bottom-tab / side-rail item lit for that route, from the one route map in `src/config/clientNav.ts`.
>
> Status column: **✔** = the test listed passed on the final code. The certification report has the run details.

## 1. Routes

| Old route | New destination (tab) | Functionality preserved | Redirect / deep-link handling | Permission behaviour | Test status |
|---|---|---|---|---|---|
| `/` | Today (Today) | Start / resume / done session; checklist (meals, water, cardio, check-in); one coach item; waiting / no-plan / error / read-only states | — | Subscription gate unchanged (`SubscriptionGate`) | e2e 30, 42, 43, 61, 80 (IA, Journeys A, B) ✔ · prod-build offline boot ✔ |
| `/workout` | Train (Train) | Next session, every plan day (opens the day), cardio entry, history entry, resume | — | Gate unchanged; plan is read-only | e2e 30 (heading = day title, "Start this workout"), 43 (plan row), 80 ✔ |
| `/workout/routine/:dayId` | Train › Day (Train) | Sections, exercises, coach notes (day + exercise), rest, video only when playable, start / resume, "How to read your plan" | Same URL; it is now the normal way into a day (no longer an orphan) | Gate unchanged | unit navContract ✔ · visual matrix (6 widths × EN/AR) ✔ |
| `/workout/exercise/:exId` | Train › Exercise (Train) | Video, prescription, last time, PR, 1RM trend, cues | Same URL; cold Back → `/workout` (was `/workout/library`) | — | unit navContract ✔ · e2e 80 (cold Back → `/workout`) ✔ |
| `/workout/session` | Train › Session, full-screen (Train) | Live logging (B0 rules), rest timer, add / remove / restore exercises, finish, read-only finished view + edit, summary | Same URL; nothing active → Train with a message (CL-50) | Gate / read-only unchanged | e2e 30, 61 (B0), 80 (Journey B, Arabic) ✔ |
| `/workout/library` | **Retired** → Train | Exercise detail stays reachable from Day, Session and Strength | `<Navigate to="/workout" replace>` | — | e2e 80 (redirect) ✔ |
| `/cardio` | Train › Cardio (Train) | Coach cardio plan, live timer, log activity, history, delete | Same URL; Back → `/workout` | Gate unchanged | e2e 30 (cardio) ✔ |
| `/history` | Train › History (Train) | Month calendar + session list → read-only session | Same URL; Back → `/workout`. Opening a session sets the day for that view; any day-scoped screen opened next says which day it shows and that changes go there (day switcher), and a tab tap or 30 minutes returns to today (B0) — CL-04 | — | e2e 30 (heading `1 workout`), 80 (cold Back → `/workout`) ✔ |
| `/nutrition` | Nutrition (Nutrition) | Meals, tap = eaten, swaps (coach policy), extras, custom foods, supplements, water, notes, food search, local day switcher | — | Gate / read-only unchanged | e2e 30 (meal, food search, failure), 80 (Journeys C, G, I) ✔ |
| `/progress` | Progress (Progress) | Body (weight + measurements summary + photos), Strength, Consistency (weekly vs plan, week grid) | `?tab=weight\|measure\|photos` → Body (photos scrolls to Photos); `?tab=strength` → Strength; `?tab=consistency` → Consistency | — | e2e 30 + 40 (photo), 44 / 45 (Arabic chart), 80 (Journey D, `?tab=` links) ✔ |
| `/progress/measurements` | Progress › Body › Measurements (Progress) | All 14 fields, notes, compare, history, Arabic digits | Same URL; Back → `/progress` | — | e2e 30, 61 (Arabic digits), 80 (cold Back) ✔ |
| `/messages` | Coach › Chat (Coach) | The whole thread engine (outbox, retry, cancel, edit / delete, reactions, voice, receipts, load older) | Same URL. Tab root: no Back (NAV-C01) | Thread access server-enforced | e2e 31, 32, 33, 40, 42, 47, 80 (Journey E, Arabic) ✔ |
| `/coach-notes` | Coach › Updates (Coach) | One timeline: coach notes and announcements (anchored ones open their target) and the notification feed (unread / done, mark all); a shared note appears once, carrying its notification's unread state | Same URL. The duplicated subscription block moves to You (RM-22) | Private notes never reach the client (server) | e2e 61 (private note never shown; shared note shown once) ✔ · unit coachUpdates ✔ |
| `/notifications` | **Retired as a page** → Coach › Updates | Feed, mark-all, tap → `openNotification` | `<Navigate to="/coach-notes" replace>` (keeps `notification-item`) | — | e2e 61 (notification tap opens the day), 80 (redirect) ✔ |
| `/check-ins` | Coach › Check-ins (Coach) | Due / submitted / reviewed list + history | Same URL; Back → `/messages` | — | e2e 80 (list → wizard) ✔ |
| `/check-in/:id` | Coach › Check-in, full-screen (Coach) | The B0 wizard: draft, resume, single submit, outbox, leave guard | Same URL; cold Back → `/check-ins` | — | e2e 30, 40, 61 (B0), 80 (cold Close → `/check-ins`) ✔ · unit CheckIn.test ✔ |
| `/assessment` | Coach › Check-ins › My assessment (Coach) | View + edit (wizard) | Same URL; Back → `/check-ins` (was `/settings?tab=account`) | — | e2e 40 (edit wizard), 80 (cold Back → `/check-ins`) ✔ |
| `/settings` | You (no tab; avatar) | Profile (name, phone, photo, password), Preferences (language EN / ع / مصري, keep awake, vibration, notifications, default rest, reminders), Subscription row, Privacy (remove device data), Help, Sign out | Same URL. `?tab=profile\|preferences\|account` still works (Settings sections) | — | e2e 10, 30, 40 (avatar), 44 / 45 (`switchLanguage`), 61, 80 (remove device data, Journey G) ✔ |
| `/settings/subscription` | You › Subscription | Status, dates, pause request, history | Same URL; Back → `/settings` | Relationship data server-enforced | axe (labels fixed) ✔ · visual matrix ✔ |
| `/invite/:code`, `/reset/:token` | Signed-in interstitial (no shell) | Unchanged | — | — | e2e 10 ✔ |
| `*` | → Today | | `<Navigate to="/">` | | |

## 2. Navigation entry points (old → new)

| Old entry | New entry |
|---|---|
| Bottom tabs Today · Fuel · ●Train · Progress · Inbox | Today · Train · Nutrition · Progress · Coach (equal tabs; side rail ≥ 1024) |
| ☰ Menu sheet (13 rows) | Removed for the client. Every row has a home in the tabs above; coach / admin keep their menu until B3 |
| Bell → `/notifications` | Coach tab badge → Coach › Updates; toasts kept |
| Avatar on Home → `/settings` | Avatar in the header on every tab root → You |
| Calendar icon on Progress → `/history` | Train › History; Progress › Consistency shows the calendar too |
| Menu-only Cardio, Library, Measurements, History, Check-ins, Coach notes, Subscription | Cardio / History in Train; Measurements in Progress › Body; Check-ins / Updates in Coach; Subscription in You; Library retired |

## 3. Retired (with reason)

| Item | Reason | Where its value went |
|---|---|---|
| `/workout/library` page | RM-23: it listed only the client's own plan exercises | Exercise detail from Day / Session / Strength |
| `/notifications` page | Doc 16: the feed is part of Coach | Coach › Updates |
| Hamburger menu + bell (client) | Doc 16 P2: one navigation system per role | Tabs, avatar, Coach badge |
| "Start empty workout" | CL-12: fake (opened Routines) | — |
| Home "This week" tiles, volume chart, weekly ring, recent list, second coach card, DayNav, WeekStrip | Doc 16 / CL-09 | Progress › Consistency / Strength; Train › History; Coach |
| "Update the app" (Settings › Tools) | RM-58: replaced by the update pill (B0) and multi-tab update (B1) | Update pill |
| Storage-persistence notice, sync card (as a card) | CL-45: implementation detail | Quiet `SyncStatus` row in You |
| Weekly-goal input | CL-11: coach / plan-owned | Consistency vs plan sessions |
