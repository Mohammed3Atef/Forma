# 14 — Accessibility & Arabic / RTL audit (client + coach)

> Phase A · Discovery only · 2026-10-04 · HEAD `e7663ab`; production runs RC2 `cf3a5d9`. None of the cited files differ between RC2 and HEAD, so findings apply to production.
> **Sources:**
> - Code read of the shells, `src/components/**`, client and coach pages, `src/i18n/{en,ar,ar-eg}.json` and `src/index.css`.
> - WCAG 2.x contrast computed from the hex values in `tailwind.config.ts` (alpha composited).
> - Browser probes on the isolated stack, per route, measuring visible box sizes:
>   - interactive elements <44px and <32px
>   - text nodes <12px
>   - nested cards, fixed/sticky elements, horizontal scrollers
>   - Latin text on RTL pages
> - Suites: client 390 EN (25 routes), client 360/375/430 (27), client 390 ar-eg (21), coach 390 EN (32), coach 390 ar-eg (12), coach 1440 (32).
> - Screenshots in `evidence/`.
> **Probe caveat:** sizes are the visible box. `.icon-btn/.chip/.btn-sm/.seg/.sec-link` add an invisible 4px hit area on each side (`index.css:202-210`), so a 36px icon button there is effectively 44px.

## Bottom line

- **Accessibility belongs inside the new system; it doesn't compete with good design. Most failures here are design-system defects**, and the new kit can fix them once:
  - ~40% of phone controls are under 44px (client 174/443, coach 298/672). The smallest sit in gym-critical places: next-exercise 32px, rest-timer 36px, a 20px dismiss on every coach page (AX-01).
  - Coach mobile header actions have no accessible name (AX-02).
  - ~70 form fields have no programmatic label (AX-03).
  - Several tokens fail contrast (AX-04).
- **Already right:**
  - Sheets and confirm dialogs: role, modal, focus trap, Esc, focus return.
  - 94/95 icon-only buttons are named.
  - Charts ship screen-reader data lists.
  - i18n key parity is perfect: 2,218 keys in en / ar / ar-eg.
- **Arabic is translated, but not designed:**
  - Mono labels keep their letter-spacing and a font without Arabic glyphs, so words break apart, including the day navigator and bottom nav (RTL-01, BV-26).
  - Egyptian-Arabic users get English dates on Today (RTL-02).
  - Dates use Arabic-Indic digits while metrics use Latin; some dates are US M/D/YYYY (RTL-03).
  - Number entry rejects Arabic-Indic digits in the workout logger (RTL-04).
  - Plurals aren't handled anywhere (RTL-05).
- **Direction for Phase B:**
  - Build accessibility and RTL into the components: size tokens, a required label prop, menu and dialog semantics, Arabic type variants, one formatting service with a digit policy.
  - Then verify in both languages per screen.

---

## Part A — Accessibility (brief §34)

### A.1 Browser probe summary (visible boxes)

| Suite | Routes | Interactive | <44px | <32px | Text <12px | Card boxes (nested) | Page-level horizontal overflow |
|---|---|---|---|---|---|---|---|
| Client 390 EN | 25 | 443 | 174 (39%) | 30 | 474 | 102 (8) | none |
| Client 360/375/430 | 27 | 465 | 180 (39%) | 24 | 606 | 111 (24) | none (week strip scrolls at 360/375) |
| Client 390 ar-eg | 21 | 413 | 168 (41%) | 31 | 420 | 97 (8) | none |
| Coach 390 EN | 32 | 672 | 298 (44%) | 52 | 538 | 130 (1) | none |
| Coach 390 ar-eg | 12 | 325 | 147 (45%) | 28 | 270 | 59 (1) | none |
| Coach 1440 | 32 | 1128 | 810 (72%)* | 64 | 717 | 203 (1) | clients table scrolls inside its card (BV-21) |

\* At 1440 the 17 sidebar links (40px tall) account for most of the <44px count. That's acceptable with a mouse; the <32px count is what matters there.

**Worst routes (390):**

| Route | <44 / total | <32 | Notable samples |
|---|---|---|---|
| Client History | 35/42 | 0 | calendar day cells 41×41, month arrows 36×36 |
| Client Cardio | 25/32 | 16 | entry chips 34px, list deletes |
| Client Fuel | 21/35 | 4 | Delete 32×32 on every food row (BV-39) |
| Client Progress | 12/19 | 0 | WEIGHT/STRENGTH/… 36px; range chips scroll and clip |
| Client check-in | 8/15 | 2 | CONTINUE below the nav (BV-15) |
| Client Settings (preferences) | 15/25 | 3 | language segment 36px, inline inputs 40px |
| Coach nutrition editor | 62/91 | 14 | slot chips, bare − icons (BV-40) |
| Coach client cardio | 17/28 | 3 | — |
| Coach Reports | 13/21 | 1 | rows 36px |
| Coach thread | 6/15 (EN), 7/16 (AR) | 2–3 | title button 23px tall, "Message actions" 30×24 |
| Every coach page except messages | — | 1 | WhatsApp dismiss 20×20 |

### A.2 Touch targets by control

| Control | Size | Hit area | Where |
|---|---|---|---|
| Previous / next exercise in a live session | 32px | 40px | `WorkoutSession.tsx:399-416` |
| Rest timer −15 / +15 / Skip | 36px | 36px (none) | `RestTimerBar.tsx:17,44` |
| ExerciseCard header (notes, video, remove) | 32px | 40px | `ExerciseCard.tsx:73,81,90` |
| Fuel food-row icons (edit / swap / delete) | 32px | 40px | `Nutrition.tsx:414-457` |
| Row checkbox (bulk select) | 20px | 20px | `RowCheckbox.tsx:33` |
| Switch | 25×42px | none | `Switch.tsx:25` |
| WhatsApp dismiss | 20×20 | none | `WhatsAppFab.tsx:46` |
| Message "⋮" / reaction trigger | 24px | none | `MessageThread.tsx:1114-1116` |
| Bare icon buttons (no size/padding): 13, mostly deletes | ~16–18px | none | `CoachExerciseLibrary.tsx:176,235,318,382,487,612`, `CoachNutritionEditor.tsx:250,427`, `Cardio.tsx:258` |
| Text links: "VIEW ALL", "Hide history", phone link | 17–20px tall | +4px on `.sec-link` only | probe Today, coach-notes, assessment |
| Bottom-nav item | ~80×53px; label 9.5px | — | `BottomNav.tsx:80` |

The 56px `spacing.touch` token ("gym-friendly large touch target", `tailwind.config.ts:125-127`) is used 0 times.

### A.3 Focus and keyboard

- **Global focus ring:** `:focus-visible` outline 2px brand, offset 2px (`index.css:103-107`). Good coverage, but it forces `border-radius:5px` on every focused pill (VS-02).
- **Sheet and DialogHost:** correct trap, Esc and focus return (`Sheet.tsx:96-130`, `DialogHost.tsx:20-50`).
- **CommandPalette:** traps focus. Its input has no label, and options don't use `aria-activedescendant` (`CommandPalette.tsx:113-127`).
- **ImageViewer, VideoPopup, LanguageToggle, FloatingActionMenu:** none of them move, trap or return focus (`ImageViewer.tsx:41-82`, `VideoPopup.tsx:34-65`, `LanguageToggle.tsx:26-49`, `MessageThread.tsx:1294`).
- **Tabs** has `role=tablist/tab` + `aria-selected`, but no arrow-key roving and no `aria-controls` (`Tabs.tsx:52-75`).
- **The other three tab systems** expose no selected state.
- **DataTable** makes `<tr role="button" tabIndex=0>` (`DataTable.tsx:94-100`). This removes table semantics for screen readers in the clients table, the library and Reports.
- **Session number cells** only change border colour on focus (`ExerciseCard.tsx:49`, `NumberStepper.tsx:60`). `.input` has a 3px ring (`index.css:251`).
- **Toasts** that carry actions are clickable `div`s, which keyboards can't reach (`ToastHost.tsx:58`).

### A.4 Names and labels

- Icon-only controls: 94 of 95 have `aria-label`/`title`.
- **Unnamed at <640px:** the workspace header Message / Edit plan and the dashboard "+". Their text is `hidden sm:inline` and there is no `aria-label` (probe `noName` on all 16 workspace routes; `CoachClientWorkspaceLayout.tsx:128-133`, `CoachDashboard.tsx:63-65`; CO-29).
- **Hard-coded English names:** DayNav "previous day" / "next day" / "pick date" (`DayNav.tsx:24,38,52`), announced in English in the Arabic UI (probe ar-eg).
- **Wrong name:** the video iframe is titled "Close" (`VideoPopup.tsx:55`).
- **Fields:** 87 raw inputs vs 120 `Field` uses. ~70 raw inputs have no `aria-label`, no `id`, or no wrapping `<label>` (e.g. `Settings.tsx:315-351`, `Progress.tsx:571-581`, `CoachSubscriptionPanel.tsx:419-436`, `Cardio.tsx:278-292`).
- **Placeholder-only fields:**
  - client invite sign-up (`AcceptInvite.tsx:145-149`, 5 fields)
  - local sign-in (`Onboarding.tsx:122,130`)
  - 9 search boxes
  - the composer (`MessageThread.tsx:892`)

### A.5 Contrast (WCAG 2.x; token hex from `tailwind.config.ts`, tints composited over the real surface)

| Pair | Ratio | Needs | Result |
|---|---|---|---|
| `earth` / `earth-muted` / `earth-subtle` text on bg→hover | 18.1–15.1 / 7.8–6.5 / 5.9–4.9 | 4.5 | pass |
| `brand` #FF8B02 text on bg→hover | 8.4–7.0 | 4.5 | pass |
| `brand-ink` on the gradient stops FFB208 / FF8B02 / FF4C01 | 10.5 / 8.1 / 5.7 | 4.5 | pass |
| **Input placeholder `earth-faint` #6F6660** on input / focused input (`index.css:250`) | **3.18 / 2.94** | 4.5 | **fail** |
| **`pill-bad`**: danger on danger 14% (10px) | **4.42** | 4.5 | **fail** |
| `danger` text on hover surface | 4.47 | 4.5 | fail (marginal) |
| **White on red badges** (Bell `NotificationBell.tsx:109`, Sidebar `SidebarNav.tsx:88`; 9–10px bold) | **3.68** | 4.5 | **fail** |
| **White check on brand** (RowCheckbox checked) | **2.35** | 3 (UI) | **fail** |
| **Chart labels** rgba(255,238,228,.4) (`charts.tsx:10`; 8–9.5px) | **3.51** | 4.5 | **fail** |
| **Legacy `text-slate-500`** (5 uses, e.g. `CoachViewMeasurements.tsx:80`) | **4.01–4.21** | 4.5 | **fail** |
| `brand-ink`/70 on FF4C01 (week-strip "today" weekday, 9px) | 3.69 | 4.5 | fail |
| **Muscle colour Calves #5C3A2A** (dot and icon, `lib/muscle.ts:11-12`) | **1.87** | 3 (UI) | **fail** |
| Input / card boundary (`line` on card / raised) | 1.32 / 1.25 | 3 (UI, 1.4.11) | fail. Inputs are told apart by a ~1.1:1 fill difference. |
| `pill-ok` / `pill-warn` / `pill-info` / `pill-brand` | 5.8 / 7.2 / 4.9 / 6.6 | 4.5 | pass |
| Black on warn (OfflineBanner 12px) | 10.4 | 4.5 | pass |

Don't import the website's `site-tx3` (4.21) or `site-tx4` (2.43) as body-text tiers.

### A.6 Overlays and menus

| Overlay | role / aria-modal | Trap | Esc | Initial focus | Focus return |
|---|---|---|---|---|---|
| Sheet (`Sheet.tsx:96-130`) | dialog / true, labelled | yes | yes | panel | yes |
| DialogHost (`DialogHost.tsx:55-64`) | alertdialog / true, labelled + described | yes | yes | Cancel | yes |
| CommandPalette (`CommandPalette.tsx:113`) | dialog / true | yes | input only | input | yes |
| ImageViewer (`ImageViewer.tsx:41`) | **none** | no | yes | none | no |
| VideoPopup (`VideoPopup.tsx:34`) | **none** | no | yes | none | no |
| LanguageToggle menu (`LanguageToggle.tsx:26-49`) | **none** (no `aria-expanded`) | no | **no** | none | no |
| FloatingActionMenu (`MessageThread.tsx:1294`) | **none** (no `role=menu`) | no | yes | none | no |
| 7 full-screen auth/onboarding overlays (`AcceptInvite.tsx:120`, `AccountPending.tsx:27`, `ResetPassword.tsx:48/61/73`, `AssessmentWizard.tsx:228/254`, `Onboarding.tsx:74`, …) | pages rendered as fixed overlays | n/a | n/a | n/a | n/a |

The app has 0 `role="menu"` and 0 `aria-expanded`/`aria-haspopup`. The website's mobile menu already uses `aria-expanded` + `role="dialog"` (`SiteNav.tsx:96,106`).

### A.7 Feedback, motion, charts, headings

- **Toasts**
  - Each toast is its own `role=status aria-live=polite` node, inserted already filled (`ToastHost.tsx:55-56`), which screen readers announce unreliably. Danger toasts are polite too.
  - They auto-dismiss at 5s with no pause (`ToastHost.tsx:15`).
  - On cold open, 4 replayed toasts cover the top ~400px of Today (BV-01, NT-01).
- **Errors:** 43 of 53 `alertDialog` calls are error messages that block the flow; the danger toast is never used.
- **Reduced motion**
  - CSS gates the entrance, ring, skeleton and toast-timer animations (`index.css:491-514`).
  - Not gated: `.card-tap` press scale (`index.css:123`, 13 uses), `.card-hover` lift (`:127`), 13 `active:scale-*`, 7 spinners, smooth `scrollIntoView` (`EntityNotes.tsx:89`).
- **Charts**
  - Bar/Line charts render screen-reader data lists and focusable bars (`charts.tsx:81-87,222-228`). Keep.
  - ProgressRing has no role or value (`ProgressRing.tsx:17-65`).
  - `.prog` bars have no `progressbar` role.
  - The donut has only a 9.5px legend.
  - Chart defaults are English ("Not enough data yet", "kg"; `charts.tsx:60,150-151,310`).
- **Headings**
  - Two `<h1>` on workspace sub-pages (probe: "Nour Hassan" + "Nutrition plan").
  - Two 30px headings on Home (`Home.tsx:162,223`).
  - "Client asses…" truncated next to a badge (`evidence/client-assessment-390-full.png`).

### A.8 Findings — accessibility

### AX-01 — ~40% of phone controls are under 44px; the gym-critical ones are the smallest
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · all routes · 390 (also 360/375)
- **Evidence:**
  - A.1–A.2. Client: 174/443 controls <44px, 30 <32px. Coach: 298/672, 52 <32px.
  - Worst routes: Cardio 25/32, History 35/42, coach nutrition editor 62/91 (BV-40).
  - Gym-critical controls: session next 32px, rest timer 36px with no hit area, row checkbox 20px, switch 25px, WhatsApp dismiss 20×20, 13 bare ~16–18px delete icons.
  - `spacing.touch` (56px) is unused.
  - Screen-level instance: CO-41.
- **Expected vs actual:** ≥44px everywhere, ≥48–56px for in-workout controls · 32–40px common, some 16–24px.
- **Why it matters:** sweaty hands, motion and glances. Mis-taps land on delete and next.
- **Direction:**
  - Size tokens per context: workout 56, standard 44, dense desktop 32 with a 44 hit area.
  - Hit areas owned by the components, not by call sites.
- **Verified:** BROWSER-VERIFIED (route probes)

### AX-02 — Icon-only header actions lose their accessible name on phones
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · workspace header on all 11 client tabs, dashboard "Add client" · <640px, EN and AR
- **Evidence:**
  - Probe `noName` on 16 workspace routes at 390: `btn-secondary btn-sm` (Message) and `btn-primary btn-sm` (Edit plan). Their label is `<span class="hidden sm:inline">` (`CoachClientWorkspaceLayout.tsx:128-133`).
  - Dashboard `btn-primary !px-4` "+" (`CoachDashboard.tsx:63-65`).
  - Same in the coach-390-ar suite. Related: CO-29.
- **Expected vs actual:** "Message, button" · "button".
- **Why it matters:** the two primary per-client actions are anonymous to screen-reader and voice-control users.
- **Direction:** IconButton requires a label prop; hiding the label responsively keeps the accessible name.
- **Verified:** BROWSER-VERIFIED

### AX-03 — ~70 form fields have no programmatic label; the client sign-up is placeholder-only
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client sign-up (`/invite/:code`), Settings, Cardio log, check-in; coach subscription sheets, search boxes; message composer · all
- **Evidence:**
  - A.4: 87 raw inputs vs 120 `Field` uses.
  - `<label className="label">` without `htmlFor` (`Settings.tsx:315-351`, `CoachSubscriptionPanel.tsx:319-324,350-355,420-436,463-468`, `Cardio.tsx:278-292`, `Progress.tsx:571-581`).
  - Placeholder-only fields: `AcceptInvite.tsx:145-149`, `Onboarding.tsx:122,130`, 9 search inputs, `MessageThread.tsx:892`, `CommandPalette.tsx:119-127`.
- **Expected vs actual:** a persistent, associated label on every field · visual-only or placeholder-only labels.
- **Why it matters:** WCAG 1.3.1 / 3.3.2 / 4.1.2. The labels vanish once typing starts, which is worse for people with memory limits and people on autofill.
- **Direction:**
  - `Field` is mandatory in both apps.
  - Follow the website pattern (`form.tsx:11-55`): sentence-case label, help text, error with icon, 52px control.
- **Verified:** CODE-CONFIRMED

### AX-04 — Contrast failures inside the tokens
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** all · inputs, red badges, status pills, charts, bulk-select, muscle colour dots
- **Evidence:** A.5. Placeholder 3.18, `pill-bad` 4.42, white-on-red badges 3.68, checked checkbox 2.35, chart labels 3.51, `slate-500` 4.01, Calves colour 1.87, input boundaries ~1.3.
- **Expected vs actual:** text ≥4.5:1 and UI ≥3:1 · 9 failing pairs.
- **Why it matters:** low-vision users in gym lighting; status read as decoration.
- **Direction:** validate the new token set for contrast, including tinted chips and chart tokens.
- **Verified:** CODE-CONFIRMED (computed)

### AX-05 — Keyboard and focus management gaps
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** keyboard users, mostly coach desktop · media viewer, language menu, message menu, tabs, tables, toasts
- **Evidence:**
  - A.3. Focus isn't moved, trapped or returned in 4 overlays.
  - Tabs have no arrow-key navigation.
  - `<tr role="button">` (`DataTable.tsx:94-100`).
  - Session cells show focus as a 1px colour change (`ExerciseCard.tsx:49`).
  - Toast actions sit on a `div` (`ToastHost.tsx:58`).
  - The ring shape changes on focus (VS-02).
- **Expected vs actual:** every interaction reachable and visible by keyboard · several dead ends.
- **Why it matters:** coach desktop is a keyboard surface (it has ⌘K); gaps break the flow.
- **Direction:** a focus spec per component; roving tabindex for tabs and menus; row actions via a real button in the cell.
- **Verified:** CODE-CONFIRMED

### AX-06 — Overlays and menus without dialog or menu semantics
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** all · photo viewer, video player, language switch, message actions (desktop)
- **Evidence:**
  - A.6. The video iframe is titled "Close" (`VideoPopup.tsx:55`).
  - 0 `role="menu"` and 0 `aria-expanded` in the app.
  - Screen-level instance: MS-12.
- **Expected vs actual:** each overlay is a Dialog or Sheet; menus are menus · fixed `div`s.
- **Why it matters:** screen-reader users lose context and can tab behind the overlay.
- **Direction:** Dialog/Sheet for every overlay; one ActionMenu primitive (popover on desktop, sheet on phones) with menu semantics.
- **Verified:** CODE-CONFIRMED

### AX-07 — Feedback disappears too fast or blocks the flow
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** all roles · toasts and error alerts · all
- **Evidence:**
  - Live regions are created already filled (`ToastHost.tsx:55-56`).
  - 5s auto-dismiss with no pause (`ToastHost.tsx:15`); actions only by clicking the toast.
  - 4 replayed toasts cover Today's header for 5s (BV-01; `evidence/client-cold-open-replayed-toasts.png`; NT-01).
  - 43 blocking error alerts.
- **Expected vs actual:** announced, pausable and actionable feedback; errors inline when recoverable · silent or blocking.
- **Why it matters:** WCAG 2.2.1 / 4.1.3. Users miss confirmations and are interrupted by modal errors.
- **Direction:**
  - Persistent polite and assertive regions; pause on hover/focus.
  - A real button for the action; max 1–2 toasts.
  - Recoverable errors shown inline.
- **Verified:** BROWSER-VERIFIED (BV-01)

### AX-08 — State shown by colour only
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client Fuel, session, Today week strip, Progress, Settings · coach workspace tabs, library tabs
- **Evidence:**
  - Meal "eaten" toggle has no `aria-pressed` (`Nutrition.tsx:319-327`); supplements do have it (`:645`).
  - Set "Done" has no pressed state (`ExerciseCard.tsx:173-181`).
  - Week-strip done/today shown by border/fill only (`WeekStrip.tsx:49-55`).
  - `.seg`, the workspace rail and chip tabs have no selected state (`Progress.tsx:247-257`, `CoachClientWorkspaceLayout.tsx:141-152`, `CoachExerciseLibrary.tsx:66-72`).
  - The bottom-nav centre button is "inactive" at opacity .9 (`BottomNav.tsx:45`).
- **Expected vs actual:** state exposed (`aria-pressed`/`selected`/`current`) with a non-colour cue · colour and opacity only.
- **Why it matters:** screen readers can't tell what is done; colour-blind users can't either.
- **Direction:** every toggle and selection in the kit carries state and a shape or text cue.
- **Verified:** CODE-CONFIRMED

### AX-09 — Fixed chrome hides primary actions and focused elements
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client check-in, Today, routine · coach thread, lists · 390×844 and smaller
- **Evidence:**
  - Check-in CONTINUE sits under the bottom nav (probe sticky footer top 827 vs nav top 772; BV-15).
  - Coach composer under the nav when a banner shows (BV-14; MS-01).
  - START WORKOUT just above the nav (BV-16).
  - The routine page stacks a 155px fixed CTA on top of the 72px nav (probe).
  - The WhatsApp FAB covers rows (BV-20).
- **Expected vs actual:** task flows own the screen; nothing fixed covers an action · global chrome stays on and overlaps.
- **Why it matters:** WCAG 2.4.11 (focus not obscured); the primary step is unreachable or hidden.
- **Direction:** task flows (check-in, session, thread, editors) hide the global nav; one bottom-stack manager computes padding from the real chrome (see IA doc 16, principle P4).
- **Verified:** BROWSER-VERIFIED

### AX-10 — Progress rings, bars and the donut have no accessible value
- **Priority:** P2      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client Today, Fuel, Progress · coach Revenue · all
- **Evidence:**
  - ProgressRing has no role or `aria-valuenow`; the centre text "0% 3 LEFT" has no context (`ProgressRing.tsx:17-65`).
  - `.prog` has no `progressbar` role (`index.css:323-328`).
  - The donut has only a 9.5px legend (`charts.tsx:310-362`).
  - Chart defaults are in English (`charts.tsx:60,150-151`).
- **Expected vs actual:** "Today's tasks, 0 of 3" · a bare percentage.
- **Why it matters:** the headline progress on Today is meaningless to a screen reader.
- **Direction:** a progress primitive with role, value and label; keep the existing screen-reader data lists of the charts.
- **Verified:** CODE-CONFIRMED

### AX-11 — Heading structure
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach workspace sub-pages · client Home, assessment
- **Evidence:** two `<h1>` per workspace sub-page (probe); two 30px headings on Home (`Home.tsx:162,223`); a truncated h1 beside a badge (`evidence/client-assessment-390-full.png`); a 28px h2 above 16px h2 sections (`OverviewPanel.tsx:48`, `DashboardSection.tsx:27`).
- **Expected vs actual:** one h1, then nested sections · competing titles.
- **Why it matters:** heading navigation, the main screen-reader shortcut, becomes unreliable.
- **Direction:** the header components own the h1; sections own h2/h3.
- **Verified:** BROWSER-VERIFIED (probe h1 lists)

### AX-12 — Reduced motion only partly honoured
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** all
- **Evidence:**
  - Not gated: `.card-tap` / `.card-hover` (`index.css:123,127`), 13 `active:scale-*`, 7 spinners (`SubmitButton.tsx:63`, `SyncStatusIndicator.tsx:28`, `SyncStatusBadge.tsx:20`, `Settings.tsx:75`, `ExerciseForm.tsx:141`, `WorkoutSession.tsx:162`, the MessageThread pending state), smooth scroll (`EntityNotes.tsx:89`).
  - The website has a single kill-switch (`site.module.css:44`).
- **Expected vs actual:** all non-essential motion respects the setting · partly.
- **Why it matters:** vestibular comfort.
- **Direction:** one global reduced-motion rule in the kit, as on the website.
- **Verified:** CODE-CONFIRMED

---

## Part B — English vs Egyptian Arabic (brief §35)

### B.1 What already works (keep)

- **Key parity:** en, ar and ar-eg each have 2,218 keys. None missing, none identical to English, no interpolation-variable mismatches. The 1,463 static `t()` keys all resolve.
- **Logical CSS:** 211 logical utilities vs 34 physical ones. `<html dir/lang>` is set on every locale change (`i18n/index.ts`).
- **Chat bubbles mirror correctly:** own messages on the left in RTL with the right tail corners (`MessageThread.tsx:1064,1155`). The desktop message menu resolves logical alignment (`MessageThread.tsx:1243-1255`).
- **Charts are deliberately LTR,** so time reads oldest→newest left-to-right (`charts.tsx:95-101,216-221`). A defensible, documented choice: keep it, and say so in the design system.
- **`parseDecimal` already normalises Arabic-Indic and Persian digits** and Arabic decimal separators (`lib/utils.ts:182-190`). It just isn't used everywhere (RTL-04).

### B.2 English leakage on Arabic pages (probe, ar-eg, 390)

The probe counts Latin words on RTL pages, capped at 25 per route.

| Route | Latin strings | What leaks | Kind |
|---|---|---|---|
| Today | 13 | "Sunday, October 4" eyebrow; SAT/SUN/MON… week strip; "previous day / next day"; plan names | **system dates** (RTL-02) + coach data |
| Fuel | 7 | "1900 kcal", "ml 3000 / 0", "489 kcal P 21 C 68 F 14", "g 60" | **units** (RTL-06) + food names |
| Train / Routine | 16 / ≥25 | muscle groups, exercise names, wger English instructions | system exercise data (RTL-10) |
| Library | ≥25 | exercise names; "Traps" untranslated in the muscle chips | system data (RTL-10, RTL-07) |
| Exercise detail | 14 | English instructions; "RIR 2" | system data |
| History | 5 | "October", weekday header S M T W T F | **system dates** (RTL-02) |
| Assessment | 8 | `assessment.activities.moderate` raw key | **raw key** (RTL-07) |
| Client Inbox / coach thread | ≥25 | message text | user content (fine) |
| Coach nutrition editor | 21 | food names; "Any time, daily" | system data / coach text |
| Coach dashboard | 9 | client names; greeting "مساء الخير, Karim" (Latin comma) | user data + punctuation (RTL-09) |

### B.3 Typography and wrapping

- **Mono labels break Arabic** (`index.css:41-50`):
  - Only 6 classes drop caps, tracking and mono in RTL: `.eyebrow .ui-label .btn .seg button .stat-label .pill`.
  - 196 `font-mono` class strings and 42 ad-hoc mono+tracking labels have **no** `rtl:` override.
  - DM Mono has no Arabic glyphs, so the system fallback renders with letter-spacing that breaks joining. Seen in the day navigator "النهارده" and the bottom nav (BV-26; `evidence/client-today-390-ar.png`, `client-fuel-390-ar.png`).
- **Headings:** `.h1/.h2` keep negative tracking and a 1.04 line height on Arabic titles (`index.css:173-178`). TopBar patches the line height for RTL (`TopBar.tsx:32`); Home does not (`Home.tsx:162`).
- **Two Arabic faces:** app Cairo (`tailwind.config.ts:121`) vs website IBM Plex Sans Arabic (`:123`). Tajawal is a fallback that is never loaded.
- **Wrapping:** assessment answers wrap one character per line ("8/10") (BV-27). History cuts localized weekday names with `.slice(0,3)` (`History.tsx:149`), which truncates Arabic words.

### B.4 Direction, icons, chevrons

- **28 of 62 chevrons have no RTL handling,** so they point the wrong way in Arabic. Examples: `CoachClients.tsx:305`, `CoachMessages.tsx:224,283`, `Notifications.tsx:197`, `CoachCard.tsx:25`, `History.tsx:79,89`, `PlanBuilder.tsx:244,341,375,405`; full list in the scan notes.
- **Back chevrons are handled four different ways:** `Sheet.tsx:117`, `TopBar.tsx:47` (JS), `CoachClientWorkspaceLayout.tsx:113`, `DayNav.tsx:25,54` (inverted JS).
- **Not mirrored:**
  - send icon (`MessageThread.tsx:913`)
  - sidebar collapse (`SidebarNav.tsx:110`)
  - "reset" uses a chevron rotated in both directions (`Nutrition.tsx:427-431`)
- **The image viewer's arrows, arrow keys and swipe are LTR-only** (`ImageViewer.tsx:25-26,49,73-77`).
- **Physical leftovers:**
  - `text-right` ×12 in the A/B/Δ tables (`Measurements.tsx:77-91`, `CoachViewMeasurements.tsx:66-80`)
  - `ml-*` ×5
  - manual `rtl:pl/pr` search boxes (`ExerciseLibrary.tsx:66-69`, `WorkoutSession.tsx:520-524`)

### B.5 Numbers, dates, units

| Strategy in code | Where | Result for `ar` | Result for `ar-eg` |
|---|---|---|---|
| `language === 'ar' ? 'ar-EG' : 'en-US'` | `Home.tsx:150`, `WeekStrip.tsx:39`, `History.tsx:54,149` | Arabic, Arabic-Indic digits | **English, en-US** |
| `=== 'ar' ? 'ar-EG' : 'en-GB'` | `Home.tsx:385` | Arabic | **English, en-GB** (en-US and en-GB on one screen) |
| `startsWith('ar') ? 'ar-EG' : 'en-GB'` | `charts.tsx:20`, `lib/utils.ts:98` (`shortDate`), `formaFormat.ts:6`, `CoachTimeline.tsx:9`, `AddExistingClient.tsx:28` | Arabic-Indic | Arabic-Indic |
| `startsWith('ar') ? 'ar-EG' : 'en-US'` | `Settings.tsx:214`, `CoachMessages.tsx:252` | Arabic-Indic | Arabic-Indic |
| raw `i18n.language` | `MessageThread.tsx:1002,1034`, `CoachDayNav.tsx:11`, `MyAssessment.tsx:90,101`, `Settings.tsx:460` | **Latin digits** | Arabic-Indic |
| no locale (device default) | 15 calls, e.g. `CoachClientDetail.tsx:261`, `Notifications.tsx:57`, `Home.tsx:285`, `Nutrition.tsx:204` | device-dependent: "10/4/2026" US format (`evidence/coach-client-overview-1440.png`), notifications M/D/YYYY (BV-33) | same |

Metrics are printed raw (Latin digits). The result is mixed numerals on one screen, e.g. "الاثنين، ٢٨ سبتمبر" next to "4 × 6-8" and "RIR 2" (probe, exercise detail). There is no `Intl.NumberFormat`, no plural rules and no digit policy. Currency is printed as `${amount} ${currency}` ("5200 EGP"). A raw ISO date reaches users at `CoachClients.tsx:294`.

### B.6 Charts, tables, bubbles, tabs in RTL

| Element | Behaviour in Arabic | Verdict |
|---|---|---|
| Bar/line charts | forced LTR; labels LTR | keep, documented; label text still 8–9.5px (VS-17) |
| DataTable | `text-start` headers; mono headers keep their tracking | fix type (RTL-01) |
| A/B/Δ tables | physical `text-right`, Latin letters as headers | redo (RTL-11, RTL-06) |
| Message bubbles | mirrored correctly; times use Arabic-Indic digits under ar-eg ("١٠:٤٢ م") | keep layout; digits follow the policy (RTL-03) |
| Tab rails / segments | follow `dir` automatically; mono labels break joining | fix type (RTL-01) |
| Week strip | Sat→Fri week in both directions; English weekdays under ar-eg | RTL-02 |

### B.7 Findings — Arabic / RTL

### RTL-01 — Arabic labels break apart: mono letter-spacing and a font with no Arabic glyphs
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** ar and ar-eg users · bottom nav, day navigator, tabs, table headers, metric labels, workspace tabs, ring labels · all
- **Evidence:**
  - BV-26 (`evidence/client-today-390-ar.png`, `client-fuel-390-ar.png`).
  - Only 6 classes are neutralised (`index.css:41-50`). 196 `font-mono` strings and 42 ad-hoc mono labels have no `rtl:` override, e.g. `BottomNav.tsx:80`, `DayNav.tsx:29`, `Tabs.tsx:67`, `DataTable.tsx:74`, `MetricCard.tsx:70`, `CoachClientWorkspaceLayout.tsx:146`, `ProgressRing.tsx:61`, `WeekStrip.tsx:58`.
  - `.h1/.h2` negative tracking (`index.css:173-178`).
  - The website solved this for every mono class (`type.tsx:26,32,40`; `SiteButton.tsx:17`).
- **Expected vs actual:** Arabic in the brand's Arabic face, no tracking, taller line height · disconnected letters in a fallback font.
- **Why it matters:** Arabic is a primary market. The most visible chrome looks broken.
- **Direction:** every type role in the kit ships an Arabic variant (face, no tracking or caps, line height); one Arabic face shared with the website.
- **Verified:** BROWSER-VERIFIED (BV-26)

### RTL-02 — Egyptian-Arabic users get English dates and weekdays
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** ar-eg users · Today eyebrow and week strip, History, routine cards · all
- **Evidence:**
  - Probe ar-eg Today: "Sunday, October 4", SAT/SUN/MON… (BV-26).
  - `=== 'ar'` checks fall back to English for `ar-eg` (`Home.tsx:150,385`, `WeekStrip.tsx:39`, `History.tsx:54,149`).
  - Hard-coded `['S','S','M','T','W','T','F']` (`History.tsx:13`) and `.slice(0,3)` on localized names (`History.tsx:149`).
- **Expected vs actual:** Arabic dates for both Arabic locales · English on the main screen.
- **Why it matters:** ar-eg is the target locale, and Today is the first thing it sees.
- **Direction:** one locale resolver (ar and ar-eg → Arabic formats) used by every formatter; no string slicing of localized names.
- **Verified:** BROWSER-VERIFIED (BV-26)

### RTL-03 — Mixed numeral systems and device-locale (US) dates
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** all users, both languages · exercise detail, messages, workspace, notes, notifications, assessment · all
- **Evidence:**
  - B.5. The probe shows Arabic-Indic dates and times next to Latin metrics ("الاثنين، ٢٨ سبتمبر" vs "4 × 6-8"; "تمارين (٧ أيام)" vs "10").
  - US dates: "10/4/2026" (`CoachClientDetail.tsx:261`), "Last updated 9/14/2026" (`MyAssessment.tsx:90`), notifications M/D/YYYY (BV-33).
  - Currency is printed raw ("5200 EGP").
- **Expected vs actual:** one digit policy and one date order per locale · three systems and an ambiguous order.
- **Why it matters:** 10/4 reads as 10 April in Egypt. Mixed digits look broken.
- **Direction:** one formatting service for dates, numbers, currency, units and relative time, with an explicit digit policy decided once (Latin vs Arabic-Indic).
- **Verified:** BROWSER-VERIFIED

### RTL-04 — Arabic-Indic digits are rejected or silently dropped in number entry
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** Arabic-keyboard users · live-session set weight and reps, finish duration, weekly goal, measurements, assessment · phones
- **Evidence:**
  - `ExerciseCard.tsx:251` `/^\d*\.?\d*$/` rejects ٠-٩.
  - `WorkoutSession.tsx:500` and `Settings.tsx:383` strip them with `replace(/[^\d]/g,'')`.
  - `MeasurementForm.tsx:80` `Number()` gives NaN, and the value is silently not saved.
  - `Settings.tsx:329` and `AssessmentWizard.tsx:441` use `Number()`.
  - `parseDecimal` (`lib/utils.ts:182-190`) handles all of these.
- **Expected vs actual:** "١٠٠" is accepted as 100 · the input refuses it, or the save drops it.
- **Why it matters:** logging is the core loop. Users who type Arabic digits can't record sets.
- **Direction:** one NumericInput in the kit, built on `parseDecimal`, used by every number entry.
- **Verified:** CODE-CONFIRMED (how often keyboards emit Arabic digits needs a device check)

### RTL-05 — No pluralisation in either language
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** all users · History, inbox, bulk actions, tasks, dashboard counts, pricing copy
- **Evidence:**
  - 114 English strings carry a count variable; only 8 use `{{count}}`.
  - Exactly 1 plural key exists (`coachLib.templatesUpdated_other`).
  - "1 workouts" on History (`gt.workoutsN`; BV-30); `messages.newBelow` = "{{n}} new message".
  - Arabic needs zero/one/two/few/many/other: `common.bulk.selected` = "{{n}} محدد", "حتى {{n}} عميل".
- **Expected vs actual:** grammatical counts in both languages · wrong singulars in English, ungrammatical Arabic for 2–10.
- **Why it matters:** counts are everywhere in a fitness product; errors read as low quality.
- **Direction:** count strings use the i18n plural mechanism (`count`), with all six Arabic forms.
- **Verified:** BROWSER-VERIFIED (BV-30)

### RTL-06 — Units and macro letters are untranslated; bidi order breaks
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** ar and ar-eg users · Fuel, Today, session summary, Progress, Cardio, coach editors
- **Evidence:**
  - BV-26: kcal, ml, g and P/C/F stay English; mis-ordered "g 60" and "ml 3000 / 0" (`evidence/client-fuel-390-ar.png`).
  - Hard-coded units:
    - kcal ×10 (`Nutrition.tsx:201,312,565,781`, `FoodSearchPicker.tsx:62,91`, `CoachNutritionEditor.tsx:248,490`)
    - ml ×4, km ×4, cm ×5
    - t / m tiles (`Home.tsx:343-344`, `WorkoutSession.tsx:252`)
    - "W" (`ExerciseCard.tsx:138`)
    - "A/B/Δ" (`Measurements.tsx:77-79`)
    - "-Nw" (`Home.tsx:92`)
  - `common.kg`, `cardio.kcal` and `common.min` exist and go unused.
- **Expected vs actual:** localized units, isolated with their number · English abbreviations in the wrong order.
- **Why it matters:** nutrition is read in units; reversed "g 60" is a reading error.
- **Direction:** unit formatting through the formatting service (translated unit keys or `Intl` units) with bidi isolation of number + unit.
- **Verified:** BROWSER-VERIFIED (BV-26)

### RTL-07 — Raw keys, missing taxonomy labels, one-character-per-line wrapping
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** client and coach · assessment, cardio, library · 390
- **Evidence:**
  - `assessment.activities.moderate` shown to client and coach (BV-27; `evidence/client-assessment-390-full.png`).
  - `cardio.types.incline_treadmill` (BV-28).
  - "8/10" wraps one character per line (BV-27).
  - Muscles without a key fall back to English ("Traps"; `lib/muscle.ts:36-37`).
- **Expected vs actual:** every enum has a label in both languages · raw keys and English fallbacks.
- **Why it matters:** looks broken; erodes trust in the coach's tool.
- **Direction:** one taxonomy per domain with a guaranteed label fallback; key/value rows that stack on narrow widths.
- **Verified:** BROWSER-VERIFIED (BV-27)

### RTL-08 — Direction-sensitive icons aren't mirrored
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Arabic users · list rows, send button, sidebar, photo viewer, Fuel reset
- **Evidence:** B.4. 28 of 62 chevrons have no RTL handling. Back chevrons are handled 4 ways. The send icon, sidebar collapse and image-viewer arrows/keys/swipe are LTR-only. Screen-level instance: CO-42.
- **Expected vs actual:** forward/back icons follow reading direction · they point the wrong way on a third of rows.
- **Why it matters:** navigation affordances contradict the layout.
- **Direction:** a per-glyph `mirrorInRtl` flag in the Icon component; the viewer maps arrows and swipe to logical next/previous.
- **Verified:** CODE-CONFIRMED

### RTL-09 — English accessible names and broken bidi punctuation in the Arabic UI
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Arabic users, incl. screen-reader users · Today, coach dashboard, Settings, error screen
- **Evidence:**
  - DayNav aria-labels "previous day / next day / pick date" (`DayNav.tsx:24,38,52`; probe ar-eg).
  - The greeting's period lands before the Latin name, ".Nour Hassan" (`Home.tsx:167`; `evidence/client-today-390-ar.png`).
  - Latin comma in "مساء الخير, Karim" (`CoachDashboard.tsx:54`).
  - ErrorBoundary is English-only (`ErrorBoundary.tsx:52-59`).
  - Language buttons "EN / ع / مصري" have no `lang` (`Settings.tsx:374`). The website's toggle sets `lang` (`LangToggle.tsx:18`).
- **Expected vs actual:** names, punctuation and language tags are correct in Arabic · English names and misplaced punctuation.
- **Why it matters:** screen readers mispronounce; names look mangled.
- **Direction:** all accessible names through i18n; bidi-isolate user names; locale-aware separators; `lang` on language options.
- **Verified:** BROWSER-VERIFIED

### RTL-10 — System content is English-only in the Arabic app
- **Priority:** P2      **Effort:** L      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Arabic clients and coaches · Train, routine, exercise detail, library, food names, coach editors
- **Evidence:**
  - B.2: routine and library show ≥25 Latin strings each; exercise detail shows 14 (wger English instructions).
  - Coach editors write `.en` and copy it into `.ar` (`CoachNutritionEditor.tsx:213,227,272`; also CO-26).
  - The coach library shows muscle keys raw (`CoachExerciseLibrary.tsx:197-198`).
- **Expected vs actual:**
  - User content (names, messages, coach notes) may be English.
  - System content (exercise names and instructions, muscles, categories, foods) should exist in Arabic.
  - Actual: system content is English.
- **Why it matters:** the Arabic product is half English exactly where clients need clarity: how to perform an exercise.
- **Direction:** a localised-content model (Arabic fields + fallback indicator) for the library and taxonomies; editors that don't overwrite the other language.
- **Verified:** BROWSER-VERIFIED (probe Latin counts)

### RTL-11 — Physical CSS leftovers
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client Measurements, session, library · coach measurements view
- **Evidence:** 34 physical vs 211 logical utilities:
  - `text-right` ×12 (`Measurements.tsx:77-91`, `CoachViewMeasurements.tsx:66-80`)
  - `ml-*` (`ExerciseCard.tsx:145`, `ExerciseDetail.tsx:128,132`, `Progress.tsx:267,550`)
  - manual `rtl:` search insets (`ExerciseLibrary.tsx:66-69`, `WorkoutSession.tsx:520-524`)
- **Expected vs actual:** logical properties only · a few mirrored-by-hand spots.
- **Why it matters:** small misalignments in RTL, and duplicated client/coach code that drifts.
- **Direction:** logical utilities only, enforced by a lint rule in Phase B.
- **Verified:** CODE-CONFIRMED

### RTL-12 — Stale and developer-facing copy in the translations
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REMOVE
- **Who / where:** all · Settings (local-only), video, admin usage
- **Evidence:**
  - `settings.localOnly` and `landing.features.secure.desc` mention Firebase.
  - `video.missingFile` exposes `public/exercise_videos/`.
  - `adminUsage.siteTrafficNote` exposes `VITE_ANALYTICS_SRC` (en/ar/ar-eg).
- **Expected vs actual:** user-facing copy only · build and vendor details.
- **Why it matters:** confusing and unprofessional.
- **Direction:** remove or rewrite during the Phase B copy pass.
- **Verified:** CODE-CONFIRMED

---

## How to verify Phase B (both languages)

- Run the same route probes in EN and ar-eg on every screen, and fail the build if:
  - a control on a task screen is under 44px
  - meaningful text is under 12px
  - an Arabic page has system Latin text
  - two numeral systems appear on one screen
- Check every component's states (default, focus, pressed/selected, disabled, error) with a keyboard and a screen reader in both directions.
