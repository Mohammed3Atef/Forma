# B2 — Client visual QA

> What was looked at, at which sizes and in which languages; what was wrong; what was changed; what still deviates.
> All screenshots come from an isolated e2e3 stack seeded with realistic client data (`e2e3/visual/seed-client.mjs`: a 4-day plan, 4 meals, 7 finished sessions, 16 weigh-ins, measurements, coach messages, notes and a requested check-in). No production data, no real client photos.
> Browser emulation only — this is not physical-device evidence (see the certification report, RELEASE).

## 1. How to reproduce

```
E2E_RUN_ID=b2-visual E2E_PORT=5260 E2E_STUB_PORT=5360 node e2e3/env/server.mjs     # isolated stack
node e2e3/visual/seed-client.mjs 5260                                             # realistic client data
node e2e3/visual/shots.mjs 5260 5360 <outDir> <widths> <langs> "<name>:<path>,…"   # full-page shots + overflow + dir
node e2e3/visual/session-shots.mjs 5260 5360 <outDir> <lang> <width>               # live workout session states
node e2e3/visual/axe-client.mjs 5260 5360 <outDir> 390,1440 en,ar                  # axe WCAG 2.1 A/AA sweep
```

`shots.mjs` records, for every shot, the horizontal overflow (`scrollWidth − innerWidth`) and the document direction; it writes `shots.json` as it goes.

## 2. Coverage

**Final matrix** — `e2e-out/b2-visual/b2.8-matrix/` (228 full-page screenshots, `shots.json`):

| Dimension | Values |
|---|---|
| Widths | 360 · 390 · 430 (phones) · 768 (tablet) · 1024 (side rail starts) · 1440 (desktop) |
| Languages | English (LTR) · Arabic (RTL) |
| Screens (19) | Today · Train · Day (`/workout/routine/upper-a`) · Exercise (`/workout/exercise/bench`) · Cardio · History · Nutrition · Progress › Body · Progress › Strength · Progress › Consistency · Measurements · Coach › Chat · Coach › Updates · Coach › Check-ins · My assessment · You › Profile · You › Preferences · You › Account · Subscription |

**Result:** 228 / 228 rendered; **horizontal overflow 0 px on every shot**; every Arabic shot has `dir="rtl"`, every English shot `dir="ltr"`. The only page errors in the run came from the screenshot tool's own init script touching `localStorage` on `about:blank` (fixed in the tool), not from the app.

**Per-milestone review sets** (EN + AR, 390 and 1440 unless noted) — each was looked at screen by screen while building:

| Folder | Content |
|---|---|
| `b2.1-shell` | Shell, header, tab bar, side rail, resume bar |
| `b2.2-today` | Today (planned / in progress / done states) |
| `b2.3-train`, `b2.3-session` | Train, Day, Exercise, Cardio, History; session start, set logged + rest, menu, finish sheet, Today while a workout runs (390 EN) |
| `b2.4-nutrition` | Nutrition, Cardio with the day switcher |
| `b2.5-progress` | Body, Strength, Consistency, Measurements (also 1024) |
| `b2.6-coach` | Chat, Updates, Check-ins, My assessment |
| `b2.7-you` | You (three sections), merged Updates timeline |
| `axe/axe.json` | axe results, 19 screens × EN/AR × 390/1440 |

Browser-journey screenshots (every milestone of every e2e3 test) are attached to the runs under `e2e-out/<run>/artifacts`, including the B2 spec (`80-b2-client.spec.ts`: mobile nav, desktop rail, resume bar, Today done, nutrition add/edit, "viewing another day" notice, consistency, offline-queued and acknowledged message, sign-out-with-pending, client-B isolation, remove-device-data confirmation, Arabic workout / nutrition / message).

## 3. Issues found and corrected

| # | Milestone | Screen | Issue (as seen) | Correction |
|---|---|---|---|---|
| 1 | B2.1 | Shell | Toasts hook mounted twice (double poll) | One mount in the shell |
| 2 | B2.2 | Today | Greeting showed a double comma ("Good evening,,") | Greeting strings already end with the comma |
| 3 | B2.2 | Today (AR) | Mono face on mixed Arabic meta lines looked broken; the "−" sign rendered oddly | `tabular-nums` on the reading face instead of mono |
| 4 | B2.3 | Day | The sticky Start overlapped the resume bar while a workout ran | Sticky Start hidden while a workout runs (the resume bar covers it) |
| 5 | B2.3 | Cardio | History rows truncated and showed "0 steps" | Zero values omitted; shorter meta |
| 6 | B2.3 | Train | Plan rows truncated; the video chip squeezed exercise names | Row meta = focus; video moved into the meta line |
| 7 | B2.3 | Day / Exercise | Coach notes rendered as a box inside a box | Inline note line with a "Coach" label |
| 8 | B2.4 | Nutrition (AR) | Number runs (kcal, macros, quantities, water) sat on the wrong side in RTL | Lines follow the page direction; only the number run is isolated (`<span dir="ltr">` / `<bdi>`) |
| 9 | B2.4 | Nutrition (1440) | One very wide column of meal cards | Meals in two columns from 1280 px |
| 10 | B2.5 | Progress › Body | Two different weight changes on one card (30-day figure vs. chart period) | One number, driven by the chosen period |
| 11 | B2.5 | Progress | The selected segment used the orange gradient (gradient is a background *image*, so a colour override didn't apply) | `.seg.seg-quiet` with `bg-none` + neutral fill; orange stays with the one primary action |
| 12 | B2.5 | Progress (1024 / 1440) | Shared SVG charts scaled their axis text to ~2× | Two-column layout from 1024 px keeps charts at a readable scale |
| 13 | B2.5 | Strength | 22 personal records in one list; orange dots on every row | First 8 + "Show all"; decorative dots removed; muscle bars in one neutral data colour |
| 14 | B2.5 | Consistency | Weeks before the client's first session counted as missed | Grid starts at the first session's week |
| 15 | B2.6 | My assessment | A long question squeezed the answer to one character per line ("7 / 1 0"); the card repeated the page title | Answer column keeps a minimum width (shared fix); duplicate title removed |
| 16 | B2.6 | Updates | A shared coach note appeared twice (as the notification preview and as the note) — caught by the B0 spec | One timeline: the note is shown once and carries its notification's unread state (`lib/coachUpdates.ts`, unit-tested) |
| 17 | B2.7 | You | The photo picker's hint pushed the name aside; "Client assessment" (coach wording); the remove-data explanation was truncated; Sign out in the warning colour | Photo moved into Profile; "My assessment"; explanation wraps; Sign out neutral |
| 18 | B2.7 | You (AR) | Support e-mail aligned to the wrong side | E-mail isolated inside a line that follows the page direction |
| 19 | B2.8 | Strength | Chart week labels failed contrast (axe, serious); labels read "0t t" | Chart text colour raised to ≥ 4.5:1 (shared, ticks/values/empty text only); unit no longer doubled |
| 20 | B2.8 | Subscription | Freeze date inputs had no programmatic label (axe, critical) | `<label for>` / `id` pairs |
| 21 | B2.8 | Day, Today | Orange placeholder tile for exercises without an image; orange steps / cardio tile | Neutral placeholder; info tone for activity (orange = action / progress only) |

## 4. Accessibility sweep (axe, WCAG 2.0 / 2.1 A + AA)

19 client screens × EN / AR × 390 / 1440 = 76 scans.
- **Before fixes:** 2 findings — Strength chart label contrast (serious, 10 nodes) and Subscription freeze inputs without labels (critical, 2 nodes).
- **After fixes (re-run):** **0 violations in all 76 scans** (`e2e-out/b2-visual/axe/axe.json`). The sweep script is kept in `e2e3/visual/axe-client.mjs` for re-checking.

Manual checks (keyboard / screen reader semantics, from the code and the browser specs): every icon-only control has a label (B1 `IconButton` requires one); row menus are `aria-haspopup="menu"` + `role="menu"`; segmented view switches are radiogroups; the Coach sections are links with `aria-current`; ticks are `aria-pressed`; touch targets ≥ 44 px (56 px for in-workout controls); the day-switcher notice is a `role="status"`.

## 5. Remaining deviations (accepted, with reason)

| Deviation | Why it stays |
|---|---|
| Buttons use the brand's mono, upper-case label | It is the website's own button language (`SiteButton`); Arabic drops case and tracking |
| Chart tick text is 9–9.5 px (below the 12 px caption floor) | Shared chart component used by coach / admin; B2 only raised its contrast. Resize belongs with B3 / B4 chart work (P2) |
| `MeasurementForm`, `AvatarPicker` hint and `AssessmentView` keep their B1 look | Shared with coach screens; B2 does not redesign Coach (only a layout bug fix in `AssessmentView`) |
| Today's weight tile and Progress › Body can show different changes | Different, labelled windows ("in 32 days" vs. the chosen period) |
| The avatar button is also shown on You itself | Harmless; it keeps the header identical across screens |
| Initials "CA" for both coach and client in the screenshots | Seed data (Coach Amira, Client Aya) |
| The live workout session was reviewed at 390 EN (+ the Arabic browser journey), not across the full width matrix | The session is a full-screen task with a fixed bottom stack; its layout is width-independent up to the 768 px content cap |
