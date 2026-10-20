# B3 — Coach visual QA

> One section per B3 milestone: what was looked at, at which sizes and in which languages, what was wrong, what was changed, and what still deviates.
> Screenshots come from the isolated e2e3 stack (in-memory MongoDB, local media stand-in) with the standard e2e3 seed (coach **Coach Amira**, client **Client Aya**). No production data.
> Browser emulation only (Chromium) — this is not physical-device evidence.

---

## B3.1 — Coach shell (2026-10-17)

**Scope reviewed:** the shell only — header, tab bar, side rail (collapsed and labelled), the Me hub, Back ownership, RTL mirroring. The screens inside the shell (dashboard, Clients, client workspace, Messages, Library) are still the pre-B3 pages; their own issues are listed in §4 for the milestone that rebuilds them, not fixed here (owner: "Do not redesign B3.2+ screens prematurely").

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/85-b3-coach.spec.ts -g "visual QA"
```

The matrix test writes `e2e-out/<run>/b31-visual/<width>-<lang>-<screen>.png` plus `shots.json` (per shot: horizontal overflow `scrollWidth − innerWidth`, document `dir`, and the Clients navigation label as actually rendered). It **fails** if any shot overflows horizontally, has the wrong direction, or shows an untranslated label. Shots are viewport-sized (not full-page), so the fixed tab bar and rail appear as a coach sees them.

The other five tests in spec 85 also attach screenshots (phone Today, phone Me, tablet rail, desktop rail, dirty-editor guard, Arabic desktop).

### 2. Coverage and result

Reference run: `e2e-out/b31-85c/b31-visual/` — **48 screenshots**.

| Dimension | Values |
|---|---|
| Widths | 390 (phone, Pixel 7 emulation, tabs) · 768 (tablet, 72 px icon rail) · 1024 (labelled 240 px rail starts) · 1440 (desktop) |
| Languages | English (LTR) · Arabic (RTL) |
| Screens (6) | Today (`/coach/dashboard`) · Clients · Client workspace (`/coach/client/e2e-client-a`) · Messages · Library · **Me** (new) |

**Result:** 48 / 48 rendered; **horizontal overflow 0 px on every shot**; every Arabic shot has `dir="rtl"` and the Arabic label (العملاء), every English shot `dir="ltr"` and "Clients". The same matrix also passed inside the full e2e3 run (`e2e-out/b31-full/b31-visual/`).

**Accessibility (spec 46, axe WCAG 2.1 A / AA at 1440 EN):** coach dashboard and the Me hub — **0 violations of any impact**; every rail and header control has an accessible name (the collapsed rail's icons carry `aria-label` + `title`, asserted in spec 85).

What was checked on every shot:

| Check | Result |
|---|---|
| One navigation system per width: tabs < 768, icon rail 768–1023, labelled rail ≥ 1024; never both | ✓ |
| The active destination is lit, and only one: Today on the dashboard, Clients inside a client, Library for the library, Me (ring on the avatar / rail foot) on the Me hub | ✓ |
| No hamburger, no WhatsApp button, no old grouped sidebar or "Revenue" tab | ✓ |
| Rail widths 72 px / 240 px (also asserted in spec 85) | ✓ |
| Arabic: tab order mirrored (Today at the right), rail on the right, rail-active bar on the inline-start edge, chevrons point inline-end | ✓ |
| Header: wordmark only on destinations (phone); the shell Back only on Me pages and tools; never a second Back on screens that draw their own (client workspace) | ✓ |
| Desktop / tablet header: search (⌘K) and bell at the inline end, nothing duplicated from the rail | ✓ |
| Me hub: Business (Revenue & renewals, Client packages, Reports & exports), Forma subscription (live trial state), Coaching (Check-ins, Assessments, Adherence), Account & preferences, Help & support (WhatsApp), Sign out; long subtitles truncate on phone | ✓ |

### 3. Issues found during review and what was done

| # | Finding | Where | Change |
|---|---|---|---|
| V1 | The collapsed rail showed a generic initials avatar ("F") as the brand | 768–1023, EN + AR | **Fixed** — the Forma brand mark (`/forma-mark-128.webp`, the "F" with the arrow from the wordmark; already used by the admin sidebar) |
| V2 | The Arabic captures at 390 / 768 / 1024 rendered in English | capture tool | **Fixed (tool, not app)** — the language is a per-device setting, so each fresh browser context now switches its own language; the matrix now asserts `dir` and the translated label so this cannot pass silently again |

No shell defect remained after V1 / V2.

### 4. Seen inside pre-B3 screens — left for the milestone that rebuilds them

| Screen | Observation | Milestone |
|---|---|---|
| Today (dashboard) | Plural errors "1 clients need you today." / "1 missed sessions"; a lone round "+" button above the stats on phones; the section chips (Overview · Clients · Engagement · Content) scroll past the edge on phones (an intentional scroller, no page overflow); "COACH PORTAL" eyebrow | B3.2 (Today queue replaces this page) |
| Clients | At 1024 the table and the detail panel share the width tightly; one-line rows stretch at 1440 (DT-11) | B3.3 |
| Client workspace | Icon-only Message / Edit actions on phones (CO-29); 11-tab rail; the phone header's start slot is empty because the workspace draws its own Back row below it | B3.4 (workspace header merges into the shell header) |
| Messages | "COACH PORTAL" eyebrow; empty-state panel at desktop | B3.6 |
| Library | At 390 the search field is squeezed (≈ 5 characters visible) beside "Load starter library" and "+" | B3.7 |

### 5. Not covered

- Physical devices (R-01…R-26 checklist unchanged).
- A realistic coach data set (many clients, unread threads, long names). B3.1 only changes chrome, which the standard seed exercises; B3.2+ screens will need a coach visual seed comparable to B2's `e2e3/visual/seed-client.mjs`.
- Egyptian Arabic (`ar-eg`) was not captured separately; its `coachNav` / `coachMe` strings are complete and share the RTL layout with `ar`.

---

## B3.2 — Coach Today (2026-10-17)

**Scope reviewed:** the Today screen in every state, at every width the brief names, in English, Arabic and Egyptian Arabic. Fixtures: a busy coachPro roster (one client per queue kind, six unread conversations, plus records that must not show) and an all-clear roster (a single client whose package ends in ~15 days). See spec 86.

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/86-b3-today.spec.ts
```

The matrix test writes `e2e-out/<run>/b32-visual/<state>-<width>-<lang>.png` (full page) and `shots.json` (overflow, `dir`). It fails on any horizontal overflow or wrong direction. The other spec-86 tests attach state shots: new coach, review sheet, transfer panel, failing backend, offline, Arabic desktop.

### 2. Coverage and result

| Dimension | Values |
|---|---|
| Widths | 360 · 390 (Pixel 7) · 430 · 768 · 1024 · 1440 |
| Languages | English · Arabic · Egyptian Arabic (390, 1440) |
| States | busy queue (14 items, 9 kinds), all clear (+ Coming up), plus state shots: new coach, review sheet, transfer panel, failing backend, offline |

Reference run: `e2e-out/b32-final/b32-visual/` (the final full suite). Note the matrix runs after the spec's review and transfer tests, so its busy shots show 12 items; the 14-item state (check-in and transfer included) is the attached `today-busy-1440` shot.

**Result:** 18 / 18 matrix shots, **0 px horizontal overflow, correct `dir` on every shot**. axe (WCAG 2.1 A / AA) on the busy queue, the review sheet and the desktop panel in EN and AR: **0 violations**.

Checked on every shot: one summary line that tells the truth (count / caught up / partial / stale); rows read who · reason with evidence · one action label; section order To review → Requests → Unread messages → Subscriptions → Coaching → Coming up; "Show N more" past 5 rows; the desktop panel is sticky beside the queue; Arabic mirrors (avatar at the inline start, action at the inline end, chevrons inline-end); the client's own English words stay readable inside Arabic sentences.

### 3. Found during review and changed

| # | Finding | Where | Change |
|---|---|---|---|
| T1 | Nine kind chips wrapped onto 3–5 lines before the queue | phones (360–430), EN + AR | **Fixed**: one horizontally scrolling line under 768 px (scrollbar hidden, no page overflow); wraps from 768 px |
| T2 | "You're all caught up" said twice (summary line and card) | all-clear, all widths | **Fixed**: the card says it once; the summary line stays empty in that state |
| T3 | The client's English words reordered the Arabic sentence (quotes and "?" jumped) | message previews, freeze / transfer reasons, AR / AR-EG | **Fixed**: the client's text is bidi-isolated (U+2068 / U+2069). An English quote wrapping across lines still reads end-of-line on the left, which is correct RTL behaviour |
| T4 | With nothing queued on desktop, the checklist spanned the full width while the all-clear card was centred | all-clear 1440 | **Fixed**: one reading column (header included) whenever there is no two-pane view |
| T5 | At 1024 px the labelled rail leaves ~720 px; the side panel got ~280 px (name truncated, reason over four lines) | busy 1024, EN + AR | **Fixed**: 1024–1279 px split the panes evenly (each about a phone sheet wide); "Open client" became a text link under the reason |

### 4. Still deviating (owned by later milestones)

| What | Milestone |
|---|---|
| The check-in summary's notes show trailing punctuation on the wrong side in Arabic (shared component, also used by the client) | B3.9 RTL polish |
| Chips use the app's mono chip style (the same as the Clients filters) | B3.9 visual polish, if the design system changes the chip face |
| "Coming up" lists at most 5 terms with no "show more" (it is informational; the full list is in Me › Business) | B3.8 |

### 5. Close-out recheck (owner follow-ups, 2026-10-17)

After B32-P1 (freeze requests from their canonical documents) and NT-10 (announcement dismissals), Today was rechecked at phone, tablet and desktop in English and Arabic, from the close-out full run (`e2e-out/b32-close2/b32-visual/`, 18 / 18, 0 px overflow, correct `dir`). The only visible change is the freeze row's evidence, which now names the requested dates ("Asked to freeze 18 October – 25 October: …", asserted in spec 86). Announcements look exactly as before; only their dismissal memory changed.

---

## B3.3 — Clients directory (2026-10-17)

**Scope reviewed:** the Clients screen at every width the brief names, in English, Arabic and Egyptian Arabic, and at roster sizes 0, 1, 25 and 210:
- the list, the desktop table, the Filter & sort sheet and the weekly check-ins view;
- states: empty, no match, partial, roster error, offline.

Fixtures: coachPro with no clients; coachB with its one seeded client; an isolated mixed roster of 25 on coachPro (one client per package / check-in / plan / activity state, a frozen account, an unread message, a client taken over from another coach); 210 clients for the many-clients layouts. See spec 87.

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/87-b3-clients.spec.ts
```

The spec writes `e2e-out/<run>/b33-visual/<view>-<width>-<lang>.png` (full page) with `b33-empty.json`, `b33-mixed.json` and `b33-many.json` (overflow, `dir`). It fails on any horizontal overflow or wrong direction. Other spec-87 tests attach state shots: mixed 1440, Arabic 1440, offline 390, outgoing transfers, weekly check-ins before the bulk request, 210 clients at 1440.

### 2. Coverage and result

| Dimension | Values |
|---|---|
| Widths | 360 · 390 (Pixel 7) · 430 · 768 · 1024 · 1440, plus 1280 in the table test |
| Languages | English · Arabic · Egyptian Arabic (390, 1440) |
| Views | list / table (mixed 25: all widths × EN / AR, + AR-EG 390 / 1440); weekly check-ins (390 / 1440 × EN / AR); Filter & sort sheet (390 × EN / AR); empty (390 / 1440 × EN / AR); 210 clients (390 / 1440 EN) |

Reference run: `e2e-out/b33-full-a/b33-visual/` (the final full suite; the same 26 shots were reviewed by eye from `e2e-out/b33-s87-e/`).

**Result:** 26 / 26 shots, **0 px horizontal overflow, correct `dir` on every shot**. The table also has no inner overflow at 1024 / 1280 / 1440. axe (WCAG 2.1 A / AA) on the phone list, the filter sheet, the desktop table and the weekly check-ins view in EN and AR: **0 violations** (after the fixes below).

Checked on every shot:
- rows read name · reason (exactly Today's wording) or last workout · package;
- no email or phone anywhere in the list;
- the package pill and the account pill are never confused;
- "—" for unknown;
- the table's columns are in priority order, with Workouts (7d) folding under Last workout below 1280 px;
- Arabic mirrors (name column on the right, menu on the left, chevrons inline-end), and Arabic plurals read correctly ("ينتهي خلال 3 أيام", "منذ يومين");
- the client's own English words stay readable inside Arabic text.

### 3. Found during review and changed

| # | Finding | Where | Change |
|---|---|---|---|
| C1 | The red `bad` pill (Expired, Frozen account, Declined transfer) failed AA contrast (~4.1:1) | all widths, EN + AR (axe) | **Fixed on these screens**: AA-safe `danger.text` token (#FF6B62, ≥ 5:1). The shared style is B3.9 (B33-R1: it also changes client and admin screens) |
| C2 | The Filter button had no accessible name on phones (icon only) | 360–430 (axe) | **Fixed**: it is labelled "Filter & sort", or "Filter & sort · N" when filters are on |
| C3 | The count inside the selected chip was dimmed below AA | all widths (axe) | **Fixed**: no dimming |
| C4 | "Last workout" was cut off in the table ("Worked out tod…", "Last workou…") | 1024 / 1440 | **Fixed**: short forms in the table ("Today", "6 days ago", "None yet"); the list keeps the full sentence |
| C5 | Package pills ("ENDS IN 3D", "NO PACKAGE") wrapped onto two lines | 1024 | **Fixed**: rebalanced widths (package 19 % below 1280 px) and pills that never wrap |
| C6 | The Add button dropped onto its own line under the title | 360–430 | **Fixed**: the header no longer wraps; the button stays on the title row |
| C7 | The search placeholder was cut mid-word | phones | **Shortened** ("Search name, email, phone"). It still clips at 360 px; the field's accessible name is the full sentence |
| C8 | Clear / Done of the filter sheet were cut off by the sheet's bottom edge | 390, EN + AR | **Fixed**: pinned in the sheet footer |
| C9 | Two-column tablet list: only the first row had a divider | 768, EN + AR | **Fixed**: `divide-y-0` also zeroed the rows' own bottom border; borders are now set explicitly, with a column divider and none under the last row |
| C10 | "Ends in 3 day" in Arabic (an older string without plural forms) | AR / AR-EG | **Fixed**: a new pluralised string |
| C11 | Long names were truncated in the 1024 table without a way to read them | 1024 | **Fixed**: a tooltip with the full name |

### 4. Still deviating (owned by later milestones)

| What | Milestone |
|---|---|
| The shared `bad` pill colour on client and admin screens (C1) | B3.9 |
| The check-in summary's notes in Arabic (shared component, B32-R1) | B3.9 RTL polish |
| Chips keep the app's mono chip face (as on Today) | B3.9 visual polish |
| The client switcher sheet still shows the old "Needs attention" pill | B3.4 |

### 5. Not covered

Physical devices (iOS Safari, Android Chrome, installed PWA), screen readers beyond axe, and real data volumes beyond the 210-client fixture.

---

## B3.4 — Client workspace (2026-10-18)

**Scope reviewed:**
- the workspace header;
- Summary, Plan, Progress (week, day, body, check-ins) and Profile (with a section);
- package actions, the switcher, the not-on-roster state;
- English, Arabic and Egyptian Arabic, 360–1440 px.

Fixtures on coachPro: an active client with a full month of logs, plans, weigh-ins, check-ins and a note; trial / paused / expired / frozen-account / incomplete-assessment clients; a client transferred from coachB mid-week. See spec 88.

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/88-b3-workspace.spec.ts
```

The matrix test writes `e2e-out/<run>/b34-visual/<section>-<width>-<lang>.png` (full page) and `shots.json` (overflow, `dir`), and fails on any horizontal overflow or wrong direction. Other spec-88 tests attach state shots: Summary 1440, Arabic Summary 1440, Plan 390, Progress week 1440, package actions 390, the transferred client's history.

### 2. Coverage and result

| Dimension | Values |
|---|---|
| Widths | 360 · 390 (Pixel 7) · 430 · 768 · 1024 · 1440 |
| Languages | English · Arabic · Egyptian Arabic (390, 1440) |
| Screens | all four sections at 390 and 1440 (EN, AR); Summary and Progress at 360 / 430 / 768 / 1024 (EN, AR); Summary in AR-EG at 390 / 1440 |

Reference run: `e2e-out/b34-full-b/b34-visual/` (the final full suite); the shots were reviewed by eye across the runs while fixing (§3).

**Result:** 34 / 34 shots, **0 px horizontal overflow, correct `dir` on every shot**. axe (WCAG 2.1 A / AA) on Summary, Plan, Progress, Profile and package actions, EN + AR, 390 and 1440 (20 scans): **0 violations**.

Checked on every shot:
- one header (Back · client · package / account · Message · More);
- one tab bar; one orange primary per view;
- numbers say their window;
- Arabic mirrors (Back on the right, chevrons inline-end) with Arabic plurals ("3 أيام تدريب", "3 وجبات");
- the client's own English text keeps its direction.

### 3. Found during review and changed

| # | Finding | Where | Change |
|---|---|---|---|
| W1 | The name was cut ("Nadia H…", "… Hassan") — the Message pill and the avatar took the row | phones, EN + AR | Message is a 44 px icon button below 640 px (named for screen readers); the avatar hides below 430 px |
| W2 | Summary repeated the header's Message | all widths | Removed; Summary keeps Edit plan and Request this week's check-in |
| W3 | Numbers in the monospace face: "2 of 3" spaced out; in Arabic "2 مـن 3" | Summary, EN + AR | The UI face with tabular figures |
| W4 | The weight change showed its minus on the wrong side in Arabic ("1.4- كجم") | Summary AR | The signed number is isolated left-to-right |
| W5 | An English note's full stop jumped to the start in Arabic | Summary AR | The note is `dir="auto"` |
| W6 | The nutrition targets line was scrambled in Arabic ("kcal · P 160 … 2,100") | Plan AR | The macro line is an LTR-isolated run |
| W7 | Every Plan card had an orange Edit — three primaries on one view | Plan | Card actions are secondary (blueprint §7: one orange primary per view) |
| W8 | The four tabs stretched across ~1,100 px | desktop | The tab bar is capped at a readable width |
| W9 | The email row used the chat icon | Profile | A mail icon |
| W10 | Back, the week arrows and row chevrons pointed the wrong way in Arabic: they had an extra `rtl:rotate-180` on top of the icons' own mirroring (found by the layout spec's "back chevron mirrored" check at every width) | AR / AR-EG, all widths | Removed; the icons mirror themselves (B1.8) |

### 4. Still deviating (owned by later milestones)

| What | Milestone |
|---|---|
| Progress › Check-ins keeps the per-client page's look ("Request" first, its own title) — reviewing in place is on Summary (CO-13) | B3.9 |
| The Nutrition, Cardio, Photos and day views keep their B1 look inside Progress | B3.9 |
| The plan editors (B34-R1: a legacy plan opens "unsaved") | B3.5 |
| The shared red pill on client / admin screens (B33-R1) and check-in bidi (B32-R1) | B3.9 |

### 5. Not covered

Physical devices, screen readers beyond axe, and clients with years of logs (Progress reads 8 weeks — B34-R2).

### 6. Owner review addition — the client's closed check-in (2026-10-18)

One new client state: a previous coach's request left open, opened from an old notification link or a saved draft, reads **"This check-in has closed"**. It explains why, says the answers are still saved on this device, shows them read-only (stats grid + notes, the existing summary component) and offers **Open check-ins** as the single primary. No wizard, no leave guard.

| Check | Result |
|---|---|
| Spec 88 "the transferred client …" (EN + AR, 390) | text and saved answers present; `dir` ltr / rtl; **0 px overflow**; axe **0 violations** (both languages); shots `client-closed-checkin-en-390`, `client-closed-checkin-ar-390` |
| Compatibility runner (390, EN) | `e2e-out/b34-compat-4/S2-new-closed.png`, `S3-b-new-closed.png`, `S5-b-closed.png` — the same state reached after a hand-over, after an update with a queued B3.3 submission, and after an update with a B3.3 draft |
| Older builds, for reference | `S2-rc2-refused.png` / `S2-b33-refused.png` — RC2 shows its generic "Something went wrong." with the answers still on screen; B3.3 its "wasn't sent — your answers are kept" |

Reviewed by eye: one primary, the date range in the eyebrow, the notes kept in the client's own direction (the existing summary component, `whitespace-pre-wrap`), Arabic copy in both registers (AR formal, AR-EG colloquial).

## B3.5 — Plan editors (2026-10-18)

**Scope reviewed:**
- the training editor (plan level, a day, the desktop day table, the programming sheet, the picker);
- the nutrition editor (targets, planned vs target, meals, food sheet, supplements, notes, policy);
- the cardio editor (daily movement, sessions, the session form);
- English, Arabic and Egyptian Arabic, 360–1440 px.

Fixtures on coachPro (`e2e-ed-` ids): a client with an older training plan (a flat day and a `sections: []` day, exercises with RIR / tempo / Arabic notes / video / library link), a nutrition plan with alternatives, supplements and drinks notes, a cardio plan and daily targets; a client with no plan. See spec 89.

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/89-b3-editors.spec.ts
```

The matrix test writes `e2e-out/<run>/b35-visual/<editor>-<width>-<lang>.png` (full page; phones also `…-day`) and `shots.json` (overflow, `dir`), and fails on any horizontal overflow or wrong direction. Note: full-page captures stitch the desktop save bar where it was when captured — in use it is pinned to the bottom of the window.

### 2. Coverage and result

| Dimension | Values |
|---|---|
| Widths | 360 · 390 (Pixel 7) · 430 · 768 · 1024 · 1440 |
| Languages | English · Arabic · Egyptian Arabic (training, 390 / 1440) |
| Screens | the three editors at 390 and 1440 (EN, AR); training (plan + day) and nutrition at 360 / 430 / 768 / 1024 (EN, AR) |

**Result:** 39 shots, **0 px horizontal overflow, correct `dir` on every shot** (`e2e-out/b35-full-a/b35-visual/`, the final full run; E5 re-checked in `e2e-out/b35-89-d`). axe (WCAG 2.1 A / AA) on the three editors plus the programming and food sheets, EN + AR, 390 and 1440 (20 scans): **0 violations**.

Checked on every shot:
- one header (Back · title · client · History · More) and one bottom bar (state + Save) — the only orange primary;
- phones: the editor covers the shell (no tab bar under it); the bar sits above the content;
- desktop: no empty right pane (first day / meals / session form);
- numbers: `sets × reps`, tempo and signed differences are left-to-right runs; units and macro letters translated in Arabic;
- the client's own text (exercise, meal, food, supplement names) keeps its direction and its place in Arabic rows.

### 3. Found during review and changed

| # | Finding | Where | Change |
|---|---|---|---|
| E1 | English names in Arabic rows (client name, meals, foods, supplements, exercises) sat at the left edge — `dir="auto"` made the whole row block left-to-right | AR, all editors | display text is an isolated `<bdi>` inside a row that keeps the page direction; inputs keep `dir="auto"` |
| E2 | The warm-up count read backwards in Arabic ("إحماء + 4 × 5 2") — it was inside the left-to-right run | AR, training rows | the warm-up count is its own phrase; only `sets × reps` is the left-to-right run |
| E3 | Desktop table: "2 wu + 4 × 5" ran into the Rest column; the Rest column repeated "rest" in every cell | training 1024 / 1440 | column widths set; Rest cells show "180s" |
| E4 | Phone rows ran the details together ("3 × 8-10 90s rest RIR 1") | training 390 | middle dots between the details |
| E5 | The section-type select clipped its label in Arabic ("تمرين" lost its descenders) | AR 390 | a minimum width and no vertical padding on the select |
| E6 | Planned vs target was a sideways-scrolling table (TB-03) | nutrition phones | four rows |

### 4. Still deviating (owned by later milestones)

| What | Milestone |
|---|---|
| The template preview page and Library chips | B3.7 |
| The shared red pill (B33-R1) and check-in bidi (B32-R1) on client / admin screens | B3.9 |

### 5. Not covered

Physical devices (including the on-screen-keyboard lift), screen readers beyond axe, days with hundreds of exercises.

### 6. Owner review addition (2026-10-19) — daily-targets conflict and stale drafts

Two new states, both in spec 89:
- **The daily-targets conflict** (cardio editor): a warning panel under the targets — "The daily targets changed somewhere else", a short explanation, a small table (target · **yours** · **saved now**), then **Keep mine** (tonal) and **Use the saved ones** (ghost). The bar says "Not saved — changed elsewhere"; Save stays the one orange primary.
- **The stale-draft notice**: the restored-draft line says the saved version changed since and that saving will ask; **Discard them** beside it.

| Check | Result |
|---|---|
| Conflict panel + stale notice, EN and AR at 390 (`targets-conflict-en-390`, `targets-conflict-ar-390`) | 0 px overflow; `dir` ltr / rtl; axe **0 violations**; numbers are plain digits in their own cells; the table's row headers are the target names |
| Conflict panel, EN 1440 (`targets-conflict-1440`) | the panel stays inside the targets card; the session form beside it is unchanged |

Reviewed by eye: the Arabic table reads right to left (target · yours · saved now), the buttons keep their order (Keep mine first), and nothing else on the screen moves when the panel appears.

## B3.6 — Coach Messages (2026-10-19)

**Scope reviewed:**
- the inbox (phones: a page; ≥ 768: the left pane) — rows, previews, unread, search, All · Unread, its states;
- the conversation (phones: full-screen; ≥ 768: the right pane) — header with the client's context, the unread divider, bubbles, voice notes, the composer and its counter, the ended / not-assigned states, the refused-after-transfer bubble;
- the broadcast sheet (compose, choose recipients, preview, partial result);
- English, Arabic and Egyptian Arabic, 360–1440 px; the emulated on-screen keyboard (390); touch on Pixel 390 / 430 and WebKit iPhone.

Fixtures on coachPro (`e2e-msg-` ids): 33 active conversations (two unread, a last message of the coach's, a deleted last message, a photo, an Arabic / English mixed message, a voice note, a suspended client, a 60-message conversation whose last 25 are unread, 24 older ones), a released client. See spec 90.

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/90-b3-messages.spec.ts
```

The matrix test writes `e2e-out/<run>/b36-visual/{inbox,thread,thread-unread}-<width>-<lang>.png` (viewport captures — the conversation scrolls inside its pane) and `shots.json` (overflow, `dir`), and fails on any horizontal overflow or wrong direction. The other tests attach their own screenshots (`01-inbox-1440` … `17-broadcast-partial`).

### 2. Coverage and result

| Dimension | Values |
|---|---|
| Widths | 360 · 390 (Pixel 7) · 430 · 768 · 1024 · 1440 |
| Languages | English · Arabic · Egyptian Arabic (390 / 1440) |
| Screens | inbox and an open conversation at every width; the conversation opened at its unread divider at 390 and 1440; plus the test shots — split 768 / 1440, phone thread, draft restored, offline waiting, the divider, the voice note that can't play, a failing upload, the transfer refusal, the toast-opened thread, the emulated keyboard, broadcast compose and partial result |

**Result:** 34 matrix shots, **0 px horizontal overflow, correct `dir` on every shot** (`e2e-out/b36-final-matrix-b/b36-visual/`, final code). axe (WCAG 2.1 A / AA) on the inbox, the conversation and the broadcast sheet, EN + AR, 390 and 1440 (12 scans): **0 violations** after M3 and M6 below. Touch: spec 91 on Pixel 390 / 430 and WebKit iPhone.

Checked on every shot:
- the recipient is always named in the conversation header, with the same package / account pills as Clients and the workspace; no presence, typing or delivery claims;
- phones: the conversation covers the shell (no tab bar under the composer); the composer is the hit target at its own position; one bottom safe area;
- ≥ 768: inbox and conversation side by side, the selected row marked; the composer inside the pane, never under anything; the page itself does not scroll;
- Arabic: the panes mirror (inbox on the right), Back points right, times and counts read correctly; English names / previews keep their direction inside Arabic rows (`<bdi>`), and a message's own text keeps its direction in its bubble (`dir="auto"`).

### 3. Found during review and changed

| # | Finding | Where | Change |
|---|---|---|---|
| M1 | An English sentence in an Arabic conversation read "?Is it ok to train fasted" — message text inherited the page's right-to-left direction | AR, bubbles (both apps) and the composer | bubbles, pending bubbles, the composer and the edit box take the text's own direction (`dir="auto"`) |
| M2 | The coach's message-action button appeared on a phone after a tap (sticky hover) | coach, 390 | below 768 the button never shows on hover — long-press opens the actions |
| M3 | The Messages unread badge in the tab bar / rail: white on #F0483E, ~3.6:1 (axe) | coach shell | the coach shell's badges use a solid red at ≥ 5:1 (the shared badge style stays for the a11y pass) |
| M4 | After a mid-visit transfer the header fell back to "Client" (the row had left the roster) | coach, conversation | the header keeps the name it showed |
| M5 | "Retry" offered on a message refused because the client is no longer assigned (it can never succeed) | coach, refused bubble | Delete only |
| M6 | axe `scrollable-region-focusable` on the conversation at 390 (no control inside the bubbles on phones, so the list could not be scrolled from a keyboard) | EN / AR 390, both apps | the message list is a focusable region named "Conversation" with a focus ring |

### 4. Still deviating (owned by later milestones)

| What | Milestone |
|---|---|
| The client's conversation keeps its B2 look (B36-R7) | B5 |
| Image attachments have no stored size (a small shift when they load); PDFs open outside the app; Android Back and the image viewer (MS-13) | B5 |
| The shared red badge / pill styles on client and admin screens (B33-R1) | B3.9 |

### 5. Not covered

Physical devices (the real keyboard, home indicators, iOS WebM playback — R-17), screen readers beyond axe and the roles / labels checked in tests, conversations with thousands of messages beyond the 200-message window plus "Load older".

### 6. Certification addition (2026-10-20)

| State | Shot | Reviewed |
|---|---|---|
| Broadcast, answers lost after the server stored the copies | `19-broadcast-unconfirmed` (1440) | warning card "Sent to 0 of 2 clients · 2 not confirmed — may have arrived"; each client "Not confirmed — it may have arrived"; the note that Retry sends only to these and nobody already reached gets a second copy; the button reads "Retry for 2 clients" (no "failed") |
| Broadcast, a refused recipient | the broadcast test's partial result | "1 not sent"; the client "Not sent — no longer your client" |
| Read receipt | `18-seen-after-client-read` (1440) | "Seen" only on the newest own message, only after the client opened the conversation; older own messages carry no status |

Both new broadcast lines are plural-aware in Arabic (six forms) and keep the warning card's layout; spec 90's axe test covers the sheet (EN / AR, 390 / 1440).

## B3.7 — Coach Library (2026-10-20)

**Scope reviewed:**
- the Library: the four segments, Foods › Swap groups, Supplements — lists (phones / tablets) and tables (≥ 1024), search, filters (inline / the phone "Filter & sort" sheet), Select mode, paging / Show more, the first-run panel, the template-sync notice, offline;
- read-first details: exercise (video, image, "No demo yet", a link that can't play, the source credit), food, swap group, supplement; the forms (the metadata-first exercise form, food, swap group with its checklist, supplement);
- "Use in a client plan": the client picker and the editors' "Add to which day / meal?" prompt;
- a program read-first (`/coach/templates/:id`) and its builder;
- English, Arabic and Egyptian Arabic, 360–1440 px.

Fixtures on coachPro (`e2e-lib-` ids): 215 exercises (210 generated across 5 muscles × 5 equipment, every 7th with a video; four demo cases — video, image, nothing, a Drive link credited to wger), a bilingual food, a seeded-shape template (flat days), a client with a training plan (a flat day and a sectioned day) and a nutrition plan; plus a brand-new coach for the first run. See spec 92.

### 1. How to reproduce

```
E2E_RUN_ID=<run> E2E_PORT=5199 E2E_STUB_PORT=5299 \
  npx playwright test -c playwright.e2e3.config.ts --project=chromium-1440 e2e3/specs/92-b3-library.spec.ts
```

The matrix test writes `e2e-out/<run>/b37-visual/{programs,exercises,foods,groups,supplements,detail,program,prompt}-<width>-<lang>.png` (full page) and `b37-library.json` (overflow, `dir`), and fails on any horizontal overflow or wrong direction. The other tests attach their own shots (first run 360 / 390 EN + AR / 1440, starter exercises, demo rows, the broken-link detail, Journey I, the program read-first, the TS-04 notice, offline, the CO-26-R form, Arabic 390 / 1440).

### 2. Coverage and result

| Dimension | Values |
|---|---|
| Widths | 360 · 390 (Pixel 7) · 430 · 768 · 1024 · 1440 (the 200+ rows test also 1280) |
| Languages | English · Arabic · Egyptian Arabic (390 / 1440, plus foods / groups / supplements at 390) |
| Screens | Programs, Exercises, Foods, Swap groups and Supplements at every width; an exercise detail, a program read-first and the editor's "Add to which day?" prompt at 390 and 1440; plus the test shots listed in §1 |

**Result:** 85 matrix shots (programs 14, exercises 14, foods 13, swap groups 13, supplements 13, detail 6, program 6, prompt 6; EN 36 · AR 36 · AR-EG 13), **0 px horizontal overflow and the right `dir` on every shot** — in the certification of the final tree (`e2e-out/b37-cert-r2/b37-visual/`, 2026-10-21, after the B37-R2 fix), the one before it (`e2e-out/b37-cert-final/b37-visual/`), the certification run before it (`e2e-out/b37-cert-full2/b37-visual/`) and the run before L10 (`e2e-out/b37-92-e/`). axe (WCAG 2.1 A / AA) on Programs, Exercises, an exercise detail, "Use in a client plan", swap groups, the editor prompt and a program read-first — EN + AR, 390 and 1440: **0 violations** after L6. No horizontal scroll from 360 to 1440 with 215 exercises (table from 1024, list below).


Checked on every shot:
- the four segment labels are whole at every width and language (EN "Supplements" at 360 included); the active one is underlined; the search has its own full-width row;
- rows: the name is the open control, one line of facts, the demo badge (Video / Image / "No demo yet") — no checkbox or ✕ on rows outside Select mode; desktop headers are real column names;
- the detail's primary action ("Use in a client plan") on its own row, Edit and Delete under it; nothing cramped at 360;
- Arabic: the table's first column on the right, chevrons and the sort indicator mirrored, English names in Arabic rows keep their direction (`<bdi>`), food names in the reader's language; Egyptian Arabic copy fits the same layouts.

### 3. Found during review and changed

| # | Finding | Where | Change |
|---|---|---|---|
| L1 | "Supplements" was cut to "Suppleme…" — four equal tabs at 360–390 | EN, phones | segment tabs take their labels' widths (`flex: 1 1 auto`); a test checks every label at 360 / 390, EN + AR |
| L2 | "Use in a client plan" wrapped to three lines next to Edit and Delete | detail sheets, 390 | the primary action has its own full-width row; Edit and Delete below |
| L3 | Filters, the sort and Select took four rows before the first item | phones | one "Filter & sort" button (with the number of active filters) opens a sheet; count and Select share the row |
| L9 | Long exercise names were cut by a trailing "No demo yet" | phones | on phones "No demo yet" leads the facts line; a video / image stays an icon at the end |
| L10 | The Foods · Swap groups switch used the orange gradient (B2 keeps it for the one primary action) | Foods | the quiet segmented style (neutral "on") |
| L4 | An empty segment showed a search and a sort above the starter offer | first run | an empty list shows no search, sort or Select (the B3.3 rule) |
| L5 | The starter panel's icon column and a wrapped "Add the starter library" button | first run, 390 | no icon column below 640 px; the actions are full width on phones |
| L6 | axe `definition-list` on the exercise detail (rows were divs inside a `dl`) | detail, EN / AR | plain container |
| L7 | A seeded template (flat days) read "No exercises yet" in the read-first view | program read-first | the view reads days the way the builder does (`normalizeWorkoutBody`); unit test + spec 92 |
| L8 | The header's description took three lines on phones | 390 | shown from 640 px |

### 4. Still deviating (owned by later milestones)

| What | Milestone |
|---|---|
| Most starter exercises have no demo; wger videos are mostly HEVC; images are unprocessed originals (EX-01 / 02 / 17 / 18) — the Library is honest about it, it does not fix the content | B4 |
| Exercise names are one language; muscle / equipment vocabularies are raw source values (EX-09 / 12) | B4 |
| Search has no synonyms or Arabic aliases ("dumbbell incline press" does not find "Incline dumbbell press") | B4 (EX-14 / EX-15 rest) |
| The pill `Tabs` on one admin page (AdminPlans) | B5 (admin shell) |

### 5. Not covered

Physical devices; screen readers beyond axe and the roles / names checked in tests; video playback inside the detail sheet (the e2e stack has no reachable video host — the player's own states are covered by the B0 video tests).
