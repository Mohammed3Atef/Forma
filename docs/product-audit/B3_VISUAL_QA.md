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
