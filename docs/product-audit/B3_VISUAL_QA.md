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
