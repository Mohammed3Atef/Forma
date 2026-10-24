# 09 — Messenger audit (coach ↔ client)

## Bottom line

- **Keep the engine.** These parts are solid: sends that can't duplicate on retry, pending / failed / Retry bubbles, upload progress with cancel, a working touch long-press menu, "Load older" that survives polling, the 2-minute edit/delete window, and reactions.
- **Rebuild the mobile shell around it.**
  - **P0:** on a coach's phone the composer is pushed under the bottom nav whenever the coach plan banner is showing, so the coach cannot reply (BV-14). The client got this fix in RC2; the coach screen didn't.
  - Both roles' threads keep the full app chrome (brand bar, page header, bottom nav) and add the bottom safe area twice.
- **In production today, attachments and voice notes are offered but every upload fails** (Bunny 401). The composer can't tell that uploads are broken.
- **Missing everyday basics:**
  - No marker for where unread messages start.
  - No offline outbox and no saved draft.
  - Voice notes play in a bare native player with unreliable duration.
  - 18 thread requests per minute (BV-29), plus a mark-read sent twice on every tick.
- **It does not feel like part of the coaching relationship.** Chat, coach notes, announcements and broadcasts are four separate channels, and the thread shows nothing about the client's plan, check-ins or subscription.
- **Direction:**
  - One full-screen thread layout for both roles.
  - The thread becomes the coach–client hub: check-in, plan and note events shown inline; notes pinned.
  - One notification per thread, not per message.
  - An outbox and saved drafts.
  - A real voice player.

## Scope, sources and versions

- **Code read:**
  - `src/components/MessageThread.tsx` (1,338 lines, shared by both roles)
  - `src/pages/Messages.tsx` (client)
  - `src/pages/coach/CoachMessages.tsx` (inbox, desktop split view, broadcast)
  - `src/pages/coach/CoachMessageThread.tsx` (coach mobile thread)
  - `src/services/platform/messagesApi.ts`
  - `api/_trpc/routers/messages.ts`, `api/messages/_data.ts`
  - `src/hooks/useVoiceRecorder.ts`, `src/lib/attachmentKind.ts`, `src/lib/messagesEqual.ts`, `src/components/ImageViewer.tsx`
  - The unread hooks and the shells
- **Versions:** HEAD `e7663ab`. None of these files changed between RC2 (`cf3a5d9`, production) and HEAD, so every finding applies to production.
- **Browser evidence (isolated stack, production build):**
  - BV-14 (coach composer under nav), `evidence/coach-thread-composer-under-nav.png`
  - BV-29 (polling)
  - BV-34 (coach back navigation)
  - `evidence/client-inbox-390.png`, `evidence/client-your-coach-390-full.png`
- **Earlier messenger certification** (`docs/audit-phase2/05-messenger-media.md`, M-1…M-28), re-checked at HEAD:
  - Fixed: voice Cancel (M-1), Load older wiped by polling (M-2), iOS long-press (M-3), thread load error state (M-10).
  - Still open, now included below: M-5, M-6, M-7, M-8, M-13, M-14, M-16, M-17, M-18, M-19, M-22, M-24, M-25.
- **Notification-side messenger issues** (one notification per message, toasts for an open thread) are in 10_NOTIFICATIONS NT-05.

---

## 1. Element walkthrough (brief §17), mobile first

| Element | What happens today (evidence) | Verdict |
|---|---|---|
| **Thread list (coach)** | Sorted by last message (`CoachMessages.tsx:70-73`). Search by name/email only (:74-83). Filters All / Unread / Broadcasts. 30 rows then "Show more" on mobile (:88-91,171-173). Preview is the text, or a media label (📷 / 🎬 / 🎙️ / 📎) for attachments (:265-273). Time label: time today, otherwise day + month (:248-256). | Usable. A **deleted last message previews "No messages yet."**; no "You:" prefix; no "needs reply" ordering; the desktop conversation closes under the Unread filter (MS-09) |
| **Thread list (client)** | None: one coach, so the Inbox tab opens the thread directly (`ClientApp.tsx:157`) | Right for 1:1 |
| **Header (client)** | Back · coach avatar · coach name (`Messages.tsx:66-71`) | Nothing about the plan, check-in or subscription (MS-04) |
| **Header (coach)** | Back · avatar · name · "goal · N days left"; tapping the name or the user icon opens the client workspace (`CoachMessageThread.tsx:20-54`). Desktop adds a subscription pill (`CoachMessages.tsx:197-228`). | Good start; no check-in, plan or adherence context and no shortcuts (MS-04) |
| **Back** | `useBack` uses real history, falling back to `/coach/messages` (`CoachMessageThread.tsx:16`). BV-34: Back is correct from the workspace header button, the overview card and the tested tab path. The desktop tab rail and the mobile More sheet use `replace: true` (`CoachClientWorkspaceLayout.tsx:145,183`). | Mostly right; tab-rail edge case (MS-14) |
| **Grouping** | Same sender within 5 minutes groups into a run (spacing, trailing avatar) (`MessageThread.tsx:736-743`) | Keep |
| **Timestamps / day separators** | Time inside every bubble, in the app language (:1034-1058). Separator "Today" or a short weekday/date (:1001-1007). | Keep; add "Yesterday" and the year for old dates (MS-16) |
| **Delivery / seen** | Pending "Sending…" / "Uploading N%" with Cancel, then the server copy. Failed shows "Couldn't send · Retry · Delete" (:766-803). Every own bubble repeats "· Sent" or "· Seen" (:1051-1056). Seen updates only on a full refresh (≤20s). | Noisy; status should show on the last own message only (MS-11) |
| **Reactions** | 6 fixed emoji; one per person; confirmed by the server before showing; chip shows up to 3 emoji plus a count; tapping the chip opens the action menu (:601-610,1172-1185) | Keep |
| **Edit / delete** | Sender only, within 2 minutes, enforced by the server (`messages.ts:21-31`). Inline editor; "message deleted" placeholder (:1009-1020). After the window you get a generic error (:588,598). | Keep; clearer message after the window (MS-15) |
| **Images** | Lazy image with no stored size; tap opens the full-screen viewer (:1320-1325) | Layout shift; Android Back doesn't close the viewer (MS-13) |
| **Video** | Native `<video controls>`, no poster, default preload (:1327-1329) | Needs poster/preload control (MS-13) |
| **Files (PDF)** | Link opening a new tab with fallback text "file" (:1333-1337). "Open attachment" uses `window.open` (:680). Only image, video and PDF can be picked (:862). | Leaves the installed app (MS-13) |
| **Voice notes** | Recording UI: m:ss / 5:00 plus a level bar (:815-837). First use shows an explanation dialog (:535-552). Stop → review in the composer → Send. Playback is a native `<audio controls>` (:1330-1332). Recording format: WebM/Opus where supported, MP4 on Safari (`useVoiceRecorder.ts:4-14`). | Flow is fine; playback must be rebuilt (MS-08); fails in production today (MS-02) |
| **Composer** | Auto-growing textarea up to 128px (:278-284). Enter sends with a keyboard; on touch, Enter adds a new line (:896-902). Three 44px buttons: attach, mic, send (:861-915). Attach and mic appear only when uploads are "configured" (:863,875). | Keep the shape. No length limit although the server caps at 4,000 characters (MS-07); no accessible name (MS-16); availability check can't see broken uploads (MS-02) |
| **Keyboard / safe area** | Re-pins to the newest message when the visible viewport resizes (keyboard) (:313-321) and on focus (:326-330). The composer adds the bottom safe area even though it sits above a nav that already does (:814; `BottomNav.tsx:31`). | Sound approach inside the wrong shell (MS-01, MS-03) |
| **Scroll anchoring** | Auto-scroll only when within 120px of the bottom (:293-302); otherwise a "N new message" jump pill (:695-704) | Keep (plural text is missing, MS-16) |
| **Load older** | Older pages kept separately from the live window, so polling can't wipe them; scroll position preserved (:136-140,251-274) | Keep |
| **Unread position** | None. Opening pins to the bottom and marks everything read (:223,348-369). | Missing (MS-05) |
| **Long-press (touch)** | 450ms press, cancelled by moving 10px; the release click is swallowed so the sheet doesn't close under the finger (:59-81,1082-1105). Passed on mobile-430, mobile-390 and iPhone WebKit in the certification (`FORMA_FINAL_BROWSER_E2E_CERTIFICATION.md:58`). | Keep |
| **Desktop hover actions** | The "⋮" button is visible on **every** bubble at ≥768px, not only on hover (:1114). The floating menu avoids screen edges well (:1213-1305) but has no menu semantics. | MS-12 |
| **Offline send** | Send fails into a failed bubble with manual Retry. Pending and failed bubbles live in component state (:150), so leaving the thread loses them. The draft is not saved. | Missing outbox (MS-07) |
| **Retry / failure** | Retry reuses the same idempotency key (the server dedupes, `messages.ts:98-130`) but re-uploads the file (:502-505). A failed first load shows "Couldn't load messages" with Retry (:707-712). | Keep; minor (MS-15) |
| **Optimistic updates** | Text and attachments show as pending immediately. Reactions and edits wait for the server (no flicker, small delay). | Keep |
| **Polling / ordering** | Thread polls every 5s, with the full 200-message window every 4th tick (`messagesApi.ts:20,32,79-122`). Order follows server time, but just-sent messages are appended without sorting (:195). BV-29: 18 `messages.list` per minute in a thread. | MS-06 |

## 2. Element classification

| Element | What it is | Action | Why |
|---|---|---|---|
| Message engine (idempotent send, pending / failed / retry, cancel upload) | `MessageThread.tsx:392-505`; `messages.ts:79-144` | KEEP | Correct and tested; the base for the rebuild |
| Bubbles, grouping, in-bubble time, day separators | `MessageThread.tsx:728-765,1001-1167` | KEEP | Clear; copy fixes only |
| Reactions (6 emoji, chip) | `:601-645,1172-1185` | KEEP | Right size for 1:1 |
| Edit / delete within 2 minutes | `:565-600`; `messages.ts:151-181` | KEEP | Server-enforced; tombstone is clear |
| Touch long-press action sheet | `:1082-1105`; Sheet | KEEP | Works on iOS and Android |
| Load older + "N new messages" pill | `:251-274,695-704` | KEEP | Correct after the M-2 fix |
| Voice recording flow (record → review → send) | `:815-858`; `useVoiceRecorder.ts` | KEEP | Review-before-send is right |
| Voice playback | native `<audio>` `:1330-1332` | REBUILD | No reliable duration or seeking; inconsistent across browsers (MS-08) |
| Brand bar + bottom nav inside threads | `ClientApp.tsx:157`; `CoachApp.tsx:116-117` | REMOVE | Thread routes should be full-screen (MS-01, MS-03) |
| Coach thread page sizing | `CoachMessageThread.tsx:30` fixed `100dvh − 8.5rem` | REBUILD | Composer under the nav (MS-01) |
| Client thread page sizing | `Messages.tsx:20-50` measured fill | REDESIGN | Works, but patches the wrong layout (MS-03) |
| Thread header (client) | coach name only | REDESIGN | Becomes the relationship header (MS-04) |
| Thread header (coach) | name, goal, days left, link to workspace | REDESIGN | Add check-in and plan state compactly; contextual actions in a menu, not more buttons (MS-04) |
| "Sent / Seen" on every own bubble | `:1051-1056` | REDESIGN | Last message only (MS-11) |
| Desktop "⋮" on every bubble | `:1114` | REDESIGN | Show on hover or focus (MS-12) |
| Image / video / file rendering | `:1314-1338`; ImageViewer | REDESIGN | Dimensions, poster, in-app files, Back closes overlays (MS-13) |
| Attach / mic availability check | `media.status` = keys configured (`api/_trpc/routers/media.ts:13`) | REDESIGN | Must reflect whether uploads actually work (MS-02) |
| Unread position | not present | REBUILD | Divider plus anchor at the first unread (MS-05) |
| Offline outbox / drafts | not present | REBUILD | Matches the local-first client (MS-07) |
| Polling, unread badge loops, mark-read | `messagesApi.ts`; `BottomNav.tsx:14`; `NavMenuSheet.tsx:24`; `MessageThread.tsx:348-354` | REDESIGN | One shared store; one mark-read (MS-06) |
| Coach inbox list | `CoachMessages.tsx:258-286` | REDESIGN | Who spoke last, needs-reply order, stable selection (MS-09) |
| Inbox filter "Broadcasts" | `:27,80` | REMOVE | Little value once broadcasts appear inline in the thread; All / Unread is enough |
| Broadcast sheet | `:288-339`; `messagesApi.ts:291-293` | REBUILD | Correct recipients, per-recipient result, no duplicates (MS-10) |
| Coach notes page, announcements, broadcast categories | `CoachInbox.tsx`; `clientCoachNotes.ts`; `MessageThread.tsx:98-104` | MERGE | Into the thread as pinned items and system events (MS-04) |
| "Messages" card on the client's "Your coach" page | `CoachInbox.tsx:25-29` (shown with an info icon) | REMOVE | Disappears once the coach hub is the thread |
| Message notifications in the bell | `messages.ts:132-141` | MERGE | One thread row at most; the Messages badge already covers it (10_NOTIFICATIONS NT-05) |

## 3. Does the messenger feel integrated with the client relationship?

**No.** It is a capable generic 1:1 chat placed next to the coaching product, not inside it.

- **Four parallel coach→client channels with different read models:**
  - Chat messages.
  - Coach notes, both general and anchored to a meal or exercise (`clientCoachNotes.ts`). They show on a separate "Your coach" page and inline on the relevant screens.
  - Broadcast messages with categories (announcement / offer / reminder / update).
  - An unused "announcement note" path (`coachApi.ts:261`).
  - A client has to check the thread, the "Your coach" page and the bell to know what their coach said (`evidence/client-your-coach-390-full.png`).
- **The thread knows nothing about the relationship.**
  - The coach header shows goal and days left. Nothing about a submitted check-in waiting for review, this week's adherence, or plan changes.
  - Check-in requests and reviews, plan updates and notes never appear in the conversation, so "how was this week?" happens without the data on screen.
- **Entry points scatter.** Six places open a coach thread: workspace header, overview card, workspace tab, client list preview, dashboard row, inbox. The client reaches theirs from the Inbox tab, the menu, the "Your coach" card, the subscription gate and Today's coach card. Each lands in the same generic screen.
- **Direction (less UI, not more):**
  - Make the thread the relationship hub. System events appear inline as compact rows: check-in requested / submitted / reviewed, plan updated, note added.
  - Pin coach notes and announcements at the top.
  - The coach gets one compact context line (subscription, last check-in, this week's adherence) and contextual actions in the composer menu (request check-in, add note, open plan).
  - Retire the separate "Your coach" notes list and the per-message bell rows.

---

## 4. Findings

### MS-01 — Coach composer is hidden under the bottom nav whenever a coach banner shows
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/messages/:clientId` · phones (390×844 and 390×664 measured)
- **Evidence:**
  - `src/pages/coach/CoachMessageThread.tsx:30` (fixed `h-[calc(100dvh-8.5rem)] -mb-28`).
  - The coach plan banner renders above every coach page (`src/apps/CoachApp.tsx:64-68`; `src/components/coach/CoachPlanBanner.tsx:47-56`); admin banners render above the whole shell (`src/App.tsx:124`).
  - The client received a measured-height fix in RC2 (`src/pages/Messages.tsx:12-50`, commit `cf3a5d9`); the coach page did not. The regression test `e2e3/specs/33-composer-banner.responsive.spec.ts` covers only the client.
  - BV-14: composer top 842px vs nav top 772px at 390×844; 662 vs 592 at 390×664. `evidence/coach-thread-composer-under-nav.png`.
- **Steps / scenario:** a coach whose Forma term ends within 5 days opens a client thread on a phone. The same happens with a plan request awaiting payment, over capacity, plan expired/suspended, or any admin banner.
- **Expected vs actual:**
  - Expected: the composer sits visible above the nav.
  - Actual: the composer is entirely below the nav, the page can't scroll it into view, and the coach cannot reply.
- **Why it matters:** replying to clients is the coach's core daily task. The triggering states (renewal due, payment pending) are routine. On notched iPhones in the installed app the composer is also partly covered with no banner at all (taller brand bar plus nav safe area).
- **Direction:** one full-screen thread layout for both roles: own header, list, and a composer sized from the real visible viewport, with no global nav. Banners stay outside the thread or collapse into its header. Extend the composer-reachability test to the coach, to banners and to safe-area insets.
- **Verified:** BROWSER-VERIFIED

### MS-02 — Attachments and voice notes are offered but fail in production
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · thread composer · production
- **Evidence:**
  - `api/_trpc/routers/media.ts:13`: "configured" only means the keys are present, not that they work.
  - `src/components/MessageThread.tsx:863-886`: attach and mic are shown when "configured".
  - `MessageThread.tsx:447-460`: an upload failure produces a failed bubble plus an alert.
  - Production uploads fail with Bunny 401 (2026-10-03 release report; root cause in the media doc).
- **Steps / scenario:** in production, record a one-minute voice note, then Stop, then Send. Or attach a meal photo.
- **Expected vs actual:**
  - Expected: it sends, or the composer says up front that attachments are unavailable.
  - Actual: the upload fails after the user's effort, showing "Couldn't send" plus an error dialog.
- **Why it matters:** voice notes and photos are the highest-effort, highest-value messages, and they fail after the effort is spent.
- **Direction:** fix the key (media doc). The composer should reflect real upload health and hide or explain attachments when uploads are failing. A failed attachment should survive in the outbox for later retry (MS-07).
- **Verified:** INFERRED (production state per the 2026-10-03 release report, not re-verified)

### MS-03 — Phone threads keep the full app chrome and add the bottom safe area twice
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · `/messages`, `/coach/messages/:id` · phones, installed PWA
- **Evidence:**
  - Threads are wrapped in the normal shells: `src/apps/ClientApp.tsx:157` (brand bar + bottom nav), `src/apps/CoachApp.tsx:116-117`.
  - The composer adds `env(safe-area-inset-bottom)` (`MessageThread.tsx:814`) while sitting above a nav that already does (`src/components/BottomNav.tsx:31`).
  - The rest-timer card is fixed just above the nav, which is where the composer is (`src/components/AppShell.tsx:33-37`).
  - The client's height measurement watches only its own containers (`Messages.tsx:31-40`), so a root admin banner loading after the page opens is missed.
  - `evidence/client-inbox-390.png`: brand bar, page header, composer and bottom nav take about 250 of 844px.
- **Steps / scenario:** open the thread in the installed app on a notched iPhone, then focus the composer. Or open Messages while a rest timer is running between sets.
- **Expected vs actual:**
  - Expected: a full-height conversation with nothing over the composer.
  - Actual: about 590px of messages in a mobile browser and less in the installed app; much less once the keyboard opens; the rest-timer card covers the composer.
- **Why it matters:** chat is a one-handed phone task, and app chrome takes space away from the conversation.
- **Direction:** the same full-screen thread layout as MS-01, with one safe-area treatment at the true bottom edge.
- **Verified:** CODE-CONFIRMED (keyboard and rest-timer overlap INFERRED; needs a device check)

### MS-04 — Generic chat beside three other coach channels, with no client context
- **Priority:** P2      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** MERGE
- **Who / where:** client and coach · thread, "Your coach" page (`/coach-notes`), inline coach notes, broadcasts
- **Evidence:**
  - Separate channels: messages (`api/_trpc/routers/messages.ts`); coach notes (`api/_trpc/routers/clientCoachNotes.ts`; `src/pages/CoachInbox.tsx:48-76`); broadcast categories (`src/pages/coach/CoachMessages.tsx:26,288-339`; `MessageThread.tsx:98-104`); the unused announcement path (`src/services/platform/coachApi.ts:261`).
  - Headers: the client sees only the coach name (`Messages.tsx:66-71`); the coach sees goal and days left (`CoachMessageThread.tsx:20-27`).
  - `evidence/client-your-coach-390-full.png`.
- **Steps / scenario:** a coach answers "how was my week?" in the thread and has to leave for the workspace to see the check-in and adherence. A client must check the thread, the "Your coach" page and the bell to see everything the coach said.
- **Expected vs actual:**
  - Expected: one conversation that shows check-in, plan and note events in context, with the client's current state at a glance.
  - Actual: four channels with different read models; the thread knows nothing about the relationship.
- **Why it matters:** the coaching relationship is the product. A generic chat makes Forma feel like a tracker with messaging bolted on.
- **Direction:** see §3: inline system events, pinned notes, one compact context line for the coach, contextual actions in the composer menu; retire the separate notes list and the per-message bell rows.
- **Verified:** CODE-CONFIRMED

### MS-05 — No unread marker; opening a thread jumps to the bottom and marks everything read
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach mostly · thread · all viewports
- **Evidence:** `MessageThread.tsx:223` (opens pinned to the bottom), `:348-369` (marks read as soon as unread peer messages are loaded); no divider exists
- **Steps / scenario:** a client sends 8 messages overnight; the coach opens the thread in the morning.
- **Expected vs actual:**
  - Expected: the thread opens at an "8 new messages" divider, and read state follows what was actually shown.
  - Actual: it lands at the bottom, and the earlier unread messages are marked read unseen.
- **Why it matters:** questions inside a burst get missed.
- **Direction:** open at the first unread with a divider; mark read only up to what was on screen.
- **Verified:** CODE-CONFIRMED

### MS-06 — Heavy thread polling, and mark-read sent twice on every tick
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client and coach · thread, unread badges
- **Evidence:**
  - BV-29: client in a thread makes 18 `messages.list` requests per minute (the 5s thread loop plus two duplicate 20s badge loops); 6 per minute on Today from the two badge loops alone.
  - `src/services/platform/messagesApi.ts:20,32,79-122` (5s loop, full 200-message window every 4th tick).
  - Two badge loops that don't share data: `src/components/BottomNav.tsx:14`, `src/components/NavMenuSheet.tsx:24`.
  - Mark-read twice: `MessageThread.tsx:348-354` calls `markThreadSeen` and `markMessageNotificationsSeen`, both of which hit `messages.markRead`. They repeat every tick until the full refresh because cached messages keep `seenAt: null`.
  - `api/_trpc/routers/messages.ts:227` runs an unused feed query inside mark-read.
  - `messages.ts:250-284`: the coach summary aggregates all message history every 20s.
- **Steps / scenario:** open a thread with unread messages and watch the network panel.
- **Expected vs actual:**
  - Expected: one request stream per screen, one mark-read per new message, badges from a cheap summary.
  - Actual: 18 list requests per minute, up to about 8 mark-read writes per 20s, and a full-history aggregation every 20s for coaches.
- **Why it matters:** phone battery and data, plus server cost that grows with message history.
- **Direction:** one shared message store for thread and badge; fetch only messages changed since the last poll (by `updatedAt`); refresh on return to the app; one mark-read up to a given message; a thread summary maintained when messages are written.
- **Verified:** BROWSER-VERIFIED (BV-29 rates); mark-read duplication CODE-CONFIRMED

### MS-07 — No offline outbox or saved draft; messages over 4,000 characters fail forever
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** client (an offline-first app) and coach · thread · poor networks
- **Evidence:** `MessageThread.tsx:147,150` (draft and pending messages live only in component state), `:447-460` (failure needs a manual Retry), `:887-904` (no length limit); `api/_trpc/routers/messages.ts:84` (server maximum 4,000 characters)
- **Steps / scenario:** offline at the gym, type a message and send it, then leave the thread or the app reloads. Separately, paste 5,000 characters.
- **Expected vs actual:**
  - Expected: the message is queued and sent when back online; the draft is kept per thread; the limit is shown while typing.
  - Actual: the failed bubble and the typed draft disappear when you leave; an over-limit message fails on every retry.
- **Why it matters:** everything else in the client app works offline. Lost messages are exactly the failure users notice.
- **Direction:** a saved per-thread outbox and draft, automatic retry on reconnect, a visible "waiting for connection" state, and the limit enforced in the composer.
- **Verified:** CODE-CONFIRMED

### MS-08 — Voice notes play in a bare native player; length and cross-device playback are unreliable
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** client and coach · thread · phones
- **Evidence:** `src/hooks/useVoiceRecorder.ts:4-14` (WebM/Opus preferred, MP4 on Safari), `:27` (5-minute cap); `MessageThread.tsx:1330-1332` (native `<audio controls>`, 240px; length unknown until loaded), `:843` (review uses the same player); `CoachMessages.tsx:31-36` (inbox preview "🎙️ Voice message" with no length)
- **Steps / scenario:** record on Chrome/Android, then play on the other side, including iOS.
- **Expected vs actual:**
  - Expected: a compact player that shows the length before playing, can seek, and behaves the same on iOS and Android.
  - Actual: native controls that differ per browser. Chrome-recorded WebM usually has no length header, so the player shows no total and can't seek until fully loaded. Playback of Android-recorded WebM on older iOS Safari is unverified.
- **Why it matters:** voice is the fastest way for coaches to answer form questions; a player that can't show length or seek feels broken.
- **Direction:** save the length (and a small waveform) when recording; a custom compact player; a recording or stored format that every target platform plays.
- **Verified:** INFERRED (needs device check)

### MS-09 — Coach inbox closes the open conversation under the Unread filter and mislabels deleted messages
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/messages` · desktop split view and phone list
- **Evidence:** `src/pages/coach/CoachMessages.tsx:84` (selected conversation looked up in the filtered list), `:70-73` (sorted by last message only), `:265-273` (preview shows the text or a media label). A deleted last message shows "No messages yet." because the server blanks its text and attachment (`api/messages/_data.ts:76-81`). There is no "You:" prefix.
- **Steps / scenario:** on desktop, filter Unread, open a conversation, and wait for the next 20s refresh. Separately, delete your last message.
- **Expected vs actual:**
  - Expected: the open conversation stays open; the row says "Message deleted" or "You: …"; threads waiting for your reply come first.
  - Actual: the conversation closes back to "Select a conversation" once it's read; a thread with history reads "No messages yet."
- **Why it matters:** the coach's main inbox should never close the conversation they're typing in.
- **Direction:** keep the selection independent of filters; previews show who spoke last; order by "needs reply".
- **Verified:** CODE-CONFIRMED

### MS-10 — Broadcast "All" means the filtered list, and partial failures can't be recovered cleanly
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach · `/coach/messages` › broadcast sheet
- **Evidence:** `CoachMessages.tsx:180` (recipients come from the currently filtered/searched list), `:294-295,320` ("All" = nobody selected = that list; the label reuses `admin.allRoles`), `:302-309` (error dialog titled "Sent" containing raw server text); `src/services/platform/messagesApi.ts:291-293` (all sends fired together with no idempotency keys); `api/_trpc/routers/messages.ts:132-141` (one notification per recipient)
- **Steps / scenario:** filter Unread, open Broadcast and send to "All". Or have one recipient fail mid-batch.
- **Expected vs actual:**
  - Expected: "All" means all active clients; the result reads "Sent to 9 of 10 · 1 failed · Retry failed"; a retry never duplicates.
  - Actual: "All" is the filtered subset; one failure shows raw text titled "Sent"; retrying re-sends to everyone who already received it.
- **Why it matters:** paying clients see missing or duplicated announcements.
- **Direction:** recipients independent of the inbox filter; per-recipient idempotency and a result summary.
- **Verified:** CODE-CONFIRMED

### MS-11 — "Sent / Seen" repeated on every own bubble; no delivered state; seen lags up to 20s
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client and coach · thread
- **Evidence:** `MessageThread.tsx:1040-1058` (status text on every own bubble); `messagesApi.ts:24-32` (seen changes only on a full refresh); `evidence/client-inbox-390.png` ("05:54 PM · Seen", "10:42 PM · Sent"); `evidence/coach-thread-composer-under-nav.png` ("01:02 AM · Seen")
- **Steps / scenario:** open any thread with several of your own messages.
- **Expected vs actual:**
  - Expected: status only on your latest message, compact.
  - Actual: every own bubble repeats "· Sent" or "· Seen".
- **Why it matters:** visual noise on the most-read screen.
- **Direction:** show status on the last own message only, in a compact tick style.
- **Verified:** BROWSER-VERIFIED (screenshots)

### MS-12 — Desktop shows a "⋮" on every bubble; the action menu lacks menu semantics
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client and coach · thread · ≥768px
- **Evidence:** `MessageThread.tsx:1114` (`hidden … group-hover:flex md:flex` makes it always visible at ≥768px), `:1213-1305` (floating menu without a menu role or focus handling)
- **Expected vs actual:**
  - Expected: actions appear on hover or focus; the menu works with the keyboard.
  - Actual: a dot button on every bubble; focus doesn't move into the menu.
- **Why it matters:** clutter and keyboard accessibility.
- **Direction:** reveal on hover or focus; proper menu semantics and focus handling.
- **Verified:** CODE-CONFIRMED

### MS-13 — Attachments shift the layout, open files outside the app, and Android Back leaves the image viewer open
- **Priority:** P3      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client and coach · thread · phones, installed PWA
- **Evidence:**
  - `MessageThread.tsx:1320-1325` (images have no stored size), `:1327-1329` (video has no poster or preload setting).
  - `:1333-1337,680` (files and "Open attachment" open a new tab, which pushes the installed PWA out to the browser); `:1335` (fallback text "file").
  - `src/components/ImageViewer.tsx:11-84` (mounted at the app root with no history entry; no Back-button handling anywhere in the app).
- **Steps / scenario:** open an image in a thread and press Android Back. Separately, open a PDF.
- **Expected vs actual:**
  - Expected: Back closes the viewer; files open or download inside the app.
  - Actual: Back changes the page underneath while the viewer stays on top; PDFs leave the app.
- **Why it matters:** disorienting on the platform most clients use.
- **Direction:** overlays get their own history entry; store media dimensions; in-app file viewing or download.
- **Verified:** CODE-CONFIRMED (Android Back behaviour INFERRED; device check)

### MS-14 — Back from a thread opened via the desktop tab rail can skip the client workspace
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach · client workspace → Messages tab → `/coach/messages/:id` · desktop tab rail (the mobile More sheet uses the same call)
- **Evidence:** `src/components/coach/CoachClientWorkspaceLayout.tsx:54-55` (the Messages tab links to `/coach/messages/:id`), `:145,183` (tab rail and More sheet navigate with `replace: true`), `:128` (the header Message button adds a history entry); `CoachMessageThread.tsx:16` (fallback is `/coach/messages`); BV-34 (header button, overview card and the tested tab path all returned to the client overview)
- **Steps / scenario:** on desktop: Clients → client workspace → Messages tab → in-app Back.
- **Expected vs actual:**
  - Expected: Back returns to the client workspace.
  - Actual (by code): the replace removes the workspace from history, so Back returns to the Clients list. From a direct link the fallback is the inbox, not the client.
- **Why it matters:** small, but Back must be predictable in the coach's most-used flow.
- **Direction:** the Messages tab adds a history entry (or the thread opens inside the workspace); the fallback becomes the client workspace.
- **Verified:** CODE-CONFIRMED (other entry points BROWSER-VERIFIED correct in BV-34)

### MS-15 — Small engine glitches: ordering, retry, cleanup, error wording, copy feedback
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** KEEP
- **Who / where:** client and coach · thread
- **Evidence:** `MessageThread.tsx:195` (just-sent messages appended without sorting by time), `:502-505` (Retry uploads the file again), `:444-445` (preview memory not released after a successful send), `:588,598` (after the 2-minute window: a generic "Something went wrong"), `:657-673` (Copy gives no confirmation)
- **Expected vs actual:**
  - Expected: correct order; a retry reuses the already-uploaded file; a specific "too late to edit" message; a short "Copied".
  - Actual: as listed above.
- **Why it matters:** rare glitches in an otherwise solid engine.
- **Direction:** keep the engine; fix these during the shared-store rebuild.
- **Verified:** CODE-CONFIRMED

### MS-16 — Composer and copy details
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client and coach · thread, coach inbox
- **Evidence:** `MessageThread.tsx:887-904` (the text box has only a placeholder, no accessible label, no keyboard send hint), `:913` (the send button uses a chevron icon), `:1001-1007` (day separators: no "Yesterday", no year); `src/i18n/en.json:266` ("{{n}} new message" with no plural form); `CoachMessages.tsx:248-256` (any Arabic locale forced to `ar-EG` for times)
- **Expected vs actual:**
  - Expected: a labelled input, a send icon, natural day labels, correct plurals.
  - Actual: as listed above.
- **Why it matters:** polish and screen-reader support on the most-used screen.
- **Direction:** a copy and accessibility pass alongside the redesign.
- **Verified:** CODE-CONFIRMED

### MS-17 — Suspended accounts can still send messages through the API
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** KEEP
- **Who / where:** server · `messages.send`, `messages.markRead`
- **Evidence:** the messages router requires only a signed-in user, not an active account (`api/_trpc/routers/messages.ts:79-144`); `api/_trpc/routers/messages.test.ts:92` asserts that a suspended client can still send, list and mark read
- **Expected vs actual:**
  - Expected: a deliberate product decision about whether a suspended client may message their coach.
  - Actual: the API allows it while the UI hides it behind the suspended screen.
- **Why it matters:** UI and API disagree about policy.
- **Direction:** decide. If it's allowed, offer it on the suspended screen; if not, block it on the server.
- **Verified:** CODE-CONFIRMED
