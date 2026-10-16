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
