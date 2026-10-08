# 17 — Target design system: the component inventory Phase B must standardise

> Phase A · Discovery only · 2026-10-04 · HEAD `e7663ab`. **Inputs:**
> - 06 (visual system + card audit, VS-/CD-)
> - 14 (accessibility + Arabic, AX-/RTL-)
> - 16 (target IA)
> - the approved public website `src/pages/website` (brand reference)
>
> This is an **inventory and a set of standards, not a visual design and not code.** For each component it says:
> - which existing implementation to **EVOLVE** (and where it lives) or **REPLACE**
> - what must be standardised
> - which brand anchor to take from the website

## Bottom line

- **About 50 components cover both apps.** Most exist in some form today, but in 2–7 competing versions:
  - 4 page headers, 4 tab systems, 4 KPI tiles
  - 4 status chips with 18 tone maps
  - 7 destructive styles, 15 banners, 8 row shapes
  - 7 menu-like surfaces and no ActionMenu
- **What Phase B does with them:**
  - Collapse each family into one component with variants.
  - Ship client and coach from the same kit, at comfortable and compact densities.
  - Delete the rest.
- **Keep and evolve:**
  - `Sheet` and `DialogHost` (accessibility done right)
  - `Field`, `SearchField`, `Pill`, `Skeleton`, `DataTable`, `SidebarNav`, `ResponsiveShell`
  - the chart components (they already have screen-reader lists)
- **Replace:**
  - The button size system (dead CSS, VS-01) and the icon set (adopt the website's).
  - KPI tiles → `Metric`; banners → `Banner` + region; sync indicators → one `SyncStatus`; the media viewers → one `MediaViewer`.
  - The 4 tab systems → `Tabs` + `SegmentedControl`.
- **The brand comes from the website:**
  - three translucent hairline tiers
  - borderless tinted status pills
  - amber accent text, with the gradient reserved for actions
  - gold-italic highlight
  - eyebrow with a gradient dash
  - sentence-case 52px form fields
  - 1.75-stroke icons
  - the wordmark
  - IBM Plex Sans Arabic, with every mono style dropping caps and tracking in RTL
- **Every component ships with:**
  - Arabic/RTL behaviour
  - size and hit-area tokens
  - focus, selected, disabled and error states
  - formatting through one service

## Principles (each traced to evidence)

| # | Principle | Why (evidence) |
|---|---|---|
| D1 | **Less UI by default.** The page canvas is the container; boxes must earn their place; one hero per screen. | 10–19 boxes per screen; 3 heroes on Progress (CD-01, CD-09) |
| D2 | **One component per job, variants not copies.** | 4 headers, 4 tabs, 4 KPI tiles, 7 destructive styles (VS-13/14/08, CD-02) |
| D3 | **Orange = act here.** Accent text in amber, information in blue, status in semantic colours. | Orange is used for action, info, selection and decoration (VS-05) |
| D4 | **Hierarchy through type and space, not chrome.** ≤8 type roles, a 12px floor, mono only for numbers and tags. | 21 sizes, 9 ≤11.5px (VS-04) |
| D5 | **Context-sized touch targets.** Workout 56, standard 44, dense desktop 32 with a 44 hit area. | 39–44% of phone controls <44px (AX-01) |
| D6 | **Arabic is a first-class rendering.** Every type role, icon and formatter defines its RTL behaviour. | Mono tracking breaks Arabic; English dates under ar-eg; mixed digits (RTL-01..03) |
| D7 | **Progressive disclosure.** Secondary and destructive actions go in an ActionMenu or edit mode, never on every row in read mode. | Red × on every food row; 62/91 small controls in the nutrition editor (VS-08, CD-08) |
| D8 | **Task flows own the screen.** The global nav and banners hide in check-in, session, thread and editors. | CONTINUE and composer hidden under the nav (AX-09; BV-14, BV-15) |
| D9 | **State is never colour-only,** and every overlay is a Dialog or Sheet. | AX-06, AX-08 |

## Brand anchors from the approved website

| Anchor | Website source | Use in the app |
|---|---|---|
| Hairline tiers `site.line / line2 / line3` (.09 / .14 / .22 translucent) | `tailwind.config.ts:78-91`; `mock.tsx:17-35` | the only boundary method for cards, rows, inputs and dividers; softest tier by default |
| Surfaces: page `surface`, raised `surface-raised`, glass for floating (`FloatCard`) | `frames.tsx:129-135`; `mock.tsx:305-316` (`MHi`) | three surface levels; the featured surface + halo for the single hero |
| Accent text amber `brand-hover`; actions on `bg-gradient-brand` with `brand-ink` | `type.tsx:25-26`; `SiteButton.tsx:13-24` | accent text and active labels in amber; the gradient for primary actions only |
| Gold-italic highlight (`Piv`, `bg-gradient-gold`) | `type.tsx:11-16` | rare celebratory emphasis (PR, goal reached), never decoration |
| Eyebrow = mono 12px + 18px gradient dash; Arabic face without caps or tracking | `type.tsx:25-26` | section context labels only where they add meaning, not on every title |
| Display / lead / caption scale with `text-wrap:balance` and RTL line heights | `type.tsx:32-40` | the type roles' starting point (titles, lead, meta, caption) |
| Status pill = borderless tint + dot (`MPill`); mono value numbers (`MNum`, `Kpi`) | `mock.tsx:62,84-104,318-338` | StatusChip and Metric look |
| Avatar = warm gradient disc + gold hairline (`MAv`) | `mock.tsx:106-118` | Avatar default |
| Buttons: pill, mono label in EN, Arabic face without caps in RTL, mirrored arrow | `SiteButton.tsx:13-33` | Button variants and the RTL rule |
| Form field: 52px, radius 14, line2 border, sentence-case 14px label, help, error with icon, 4px focus halo | `form.tsx:11-55` | Field |
| Icons: 1.75 stroke, 24 grid, 18px default; trash, copy, send, filter, dots, phone, alert, money… | `website/components/Icon.tsx:17`; `icons.tsx` | replaces `src/components/Icon.tsx` |
| Language toggle: target language in its own script, with `lang` set | `LangToggle.tsx:9-28` | language switch in Settings / You |
| Focus outline amber, offset 3px; global reduced-motion kill switch | `site.module.css:14,44` | focus token; motion policy |
| Wordmark `/website/forma-wordmark.webp` | `SiteNav.tsx:10,79` | the only logo in app headers |
| Phone tab bar: solid surface, hairline top, amber active label | `frames.tsx:83-127` | BottomNav look |

## Foundations to standardise (direction only; values are Phase B design work)

| Foundation | Today | Standardise | Fixes |
|---|---|---|---|
| Colour roles | 57 bg tokens, 35 border colours, orange for everything | role tokens: action, accent, info, success, warn, danger, neutral text ×3, hairline ×3, surface ×3; status tints. Every pair contrast-checked (text ≥4.5, UI ≥3). | VS-05, VS-06, AX-04 |
| Type roles | 21 sizes, 16 trackings, 32 heading styles, undefined `.h3/.bd/.num` | ≤8 roles (display, title, section, body, meta, label, numeric, caption). 12px floor. Arabic variant per role (face, no caps or tracking, line height). | VS-03, VS-04, RTL-01 |
| Spacing | 3 page rhythms, 3 row insets | named page, section, row and inset steps; one row inset per density | VS-06 |
| Radius | ≈13 values | ~4 (control, card, sheet, pill) | VS-06 |
| Elevation | shadows on every card | none for content; one level each for menu, sheet, dialog and toast | VS-06 |
| Z-index | 9 ad-hoc values, collisions | named layers: content, sticky header, nav, FAB-free, banner, overlay, toast, dialog | VS-12 |
| Size and hit area | `btn-sm` dead; `touch` token unused | control sizes per context (workout 56 / standard 44 / dense 32 + 44 hit area), owned by components | VS-01, AX-01 |
| Iconography | 43 glyphs, 18 sizes, stroke 2 | website set, named sizes, a meaning dictionary, a per-glyph `mirrorInRtl` flag | VS-07, RTL-08 |
| Motion | partial reduced-motion gating | durations/easing tokens (`theme/motion.ts`) + a global reduced-motion rule | AX-12 |
| Focus | `:focus-visible` forces 5px radius | a focus token that keeps geometry; per-component spec | VS-02, AX-05 |
| Formatting service | 6 locale strategies, no Intl, mixed digits | one service for dates, times, relative time, numbers, currency, units and plurals; explicit digit policy per locale; bidi isolation for number+unit and user names | RTL-02..06, RTL-09 |
| Status vocabulary | 18 tone maps | one map per domain (subscription, account, assessment, check-in, plan, sync) feeding StatusChip | VS-10 |

## Component inventory

Verdict: **EVOLVE** = keep the named file as the base and extend it. **REPLACE** = build new and retire the listed files. **MERGE** = fold several existing pieces into one.

### 1. Shell and navigation

| Component | Existing today (files) | Verdict | Must standardise | Website anchor | Fixes |
|---|---|---|---|---|---|
| **AppShell** | `components/shell/ResponsiveShell.tsx` (coach/admin); `components/AppShell.tsx` (client, `max-w-md` at all widths) | EVOLVE ResponsiveShell → one shell for all roles; retire AppShell | header / nav / content / banner-region slots; task-flow mode that hides the nav; one bottom-stack manager (nav + sticky CTA + timer); safe-area tokens; z-layers | page rhythm of `layout.tsx` (`Wrap`) | VS-20, VS-12, AX-09 |
| **MobileHeader** | `BrandBar.tsx` + `TopBar.tsx` | MERGE | one height; title + optional back + ≤2 actions + avatar (IA 16: no hamburger, no bell); no orange eyebrow by default; one back-chevron rule | wordmark (`SiteNav.tsx:79`); 72px header rhythm | VS-13, RTL-08 |
| **DesktopHeader** | `shell/DesktopTopBar.tsx` + `ui/PageHeader.tsx` | EVOLVE both: chrome bar (search, sync, account) + in-content page title | the page title lives in content; actions right-aligned (logical end); no mobile TopBar on desktop | display/lead type (`type.tsx:32-37`) | VS-13 |
| **BottomNav** | `BottomNav.tsx` | EVOLVE | 4–5 equal tabs per IA 16 (no centre FAB); labels ≥11px in the Arabic face; active state by shape + colour, not opacity; one count-badge token | phone tab bar (`frames.tsx:83-127`) | VS-04, AX-01, AX-08, RTL-01 |
| **Sidebar** | `shell/SidebarNav.tsx` | EVOLVE | same destinations as mobile (IA 16); accessible name when icon-only; RTL collapse icon; same badge token as BottomNav | hairline divider tiers | VS-10, RTL-08 |
| **EntityHeader** | workspace header `coach/CoachClientWorkspaceLayout.tsx:109-135`; thread header `CoachMessages.tsx` ThreadHeader; Settings identity hero | REPLACE with one component | avatar, name, one StatusChip, a one-line meta, ≤2 actions with required labels; owns the page h1; compact on scroll | `MAv` avatar; amber meta | AX-02, AX-11, CD-09 |
| **Tabs** | `ui/Tabs.tsx` (2 pages) + workspace underline rail + chip tabs | EVOLVE `ui/Tabs.tsx`; retire the rail and chip tabs | pill and underline variants; ≤4–5 visible + More; roving tabindex, arrow keys, `aria-controls`; links for route tabs; no overflow without an affordance | mono label in EN / Arabic face in RTL (`capClass`, `type.tsx:40`) | VS-14, AX-05, AX-08 |
| **SegmentedControl** | `.seg` (`index.css:312-320`; Progress, Settings) | EVOLVE as a component | 2–4 options; radiogroup or tablist semantics; 44px; Arabic face | gradient "on" state (already shared) | VS-14, AX-08 |
| **Global search / command** | `ui/GlobalSearch.tsx` + `ui/CommandPalette.tsx` | EVOLVE (coach desktop) | labelled input; `aria-activedescendant`; result groups; same row look as ListRow | — | AX-03, AX-05 |

### 2. Containers and data display

| Component | Existing today (files) | Verdict | Must standardise | Website anchor | Fixes |
|---|---|---|---|---|---|
| **Card** | `.card`, `.card-tap`, `.card-featured`, `.card-elevated`, `.card-hover` (`index.css:115-162`) | REPLACE with one `Card` (variants plain / outlined / interactive / featured) | one boundary method; never nested; featured once per screen; padding scale per density | `MCard` (softest hairline, no shadow); `MHi` for the hero | CD-01, CD-03, CD-09, VS-06 |
| **Section** (new name for the existing pattern) | `ui/DashboardSection.tsx`, `.sec-head`, `h2 mb-2` patterns | EVOLVE DashboardSection | real `<section>`/h2; optional action link; no box; one rhythm | `SecHead` rhythm (`type.tsx:46-90`) | VS-06, AX-11 |
| **Metric** | `StatTile.tsx`, `ui/MetricCard.tsx`, `ui/DashboardCard.tsx` (unused), HeroStat (`CoachDashboard.tsx:99`), TargetCell (`CoachClientDetail.tsx:327`) | REPLACE with one `Metric` (inline-row, tile, hero) | value + unit via the formatting service; label; optional delta with goal-aware colour; zero state = sentence; each KPI lives in one place | `Kpi` + `MNum` (`mock.tsx:62,318-338`) | CD-02, CD-05, VS-17, RTL-06 |
| **ListRow** | `.row`, `.rowline`, `TaskRow.tsx`, ClientRow/AttentionRow (`dashboard/parts.tsx`), ThreadRow, MobileCardList row, two different `Row` components (Settings, CoachClients) | REPLACE with one `ListRow` | leading (avatar/icon/check), title, meta, trailing (value, StatusChip, one action, chevron with RTL mirror); 44/56px heights; one inset per density; dividers via hairline | `MRow` + `MS` secondary line (`mock.tsx:36-60`) | VS-15, AX-01, RTL-08 |
| **Table** | `ui/DataTable.tsx` (+ 3 raw `<table>`s) | EVOLVE DataTable | no `role=button` rows (action cell / row link); one header style; numeric alignment; sticky header; column priority instead of horizontal overflow; empty/loading states inside | mono 11px header (`capClass`) with the RTL rule | AX-05, VS-06 (see TB findings) |
| **MobileDataList** | `ui/MobileCardList.tsx` | EVOLVE, built on ListRow | same data/columns contract as Table; no card wrapper inside sections; selection pattern | — | CD-03 |
| **KeyValueList** | assessment sections, subscription summary grid, ClientPreview `Row` | MERGE into one component | label/value pairs that stack on narrow widths (no one-char wrapping); formatted values | `MDiv` hairline | RTL-07, BV-27 |
| **ProgressChart** | `charts.tsx` (Bar, Line, Donut, Spark unused), `ProgressRing.tsx`, `.prog` | EVOLVE charts.tsx; ring and bar become a `Progress` primitive | chart tokens (series, track, grid, label ≥11px); goal-aware delta colour; LTR time axis documented; `role/aria-valuenow` on progress; keep the screen-reader data lists | `MBar` grow bar (`mock.tsx:229-261`) | VS-17, AX-10 |

### 3. Status and feedback

| Component | Existing today (files) | Verdict | Must standardise | Website anchor | Fixes |
|---|---|---|---|---|---|
| **StatusChip** | `ui/Pill.tsx` (41 uses) + raw `.pill` (7) + `.chip`+tone badges (27) + hand-rolled spans; 18 tone maps | EVOLVE `Pill.tsx`; delete the other three | fed by one status vocabulary per domain (subscription, account, assessment, check-in, plan, sync); read-only, never tappable; Arabic face; contrast-checked tints (pill-bad fails today) | `MPill` borderless tint + dot (`mock.tsx:84-104`) | VS-10, AX-04 |
| **CountBadge** (unread) | BottomNav gradient badge, Sidebar/Bell red badge, NavMenuSheet badge, ThreadRow badge, Notifications "+N" | MERGE | one token and one meaning (unread = accent, not danger); AA contrast; "9+" rule; accessible count in the parent's name | phone tab bar badge (`frames.tsx:118-120`) | VS-10, AX-04 |
| **Banner** + BannerRegion | 15 treatments: `BannerHost.tsx`, `SubscriptionBanner.tsx`, `ReminderBanner.tsx`, `coach/CoachPlanBanner.tsx`, `onboarding/CoachTrialBanner.tsx`, `ClientCapBlocked.tsx`, `shared/OfflineBanner.tsx`, usage strip, … | REPLACE with one component + one region per shell | tone, icon, one line + optional detail, one CTA, dismiss rule; region shows max 1 by priority (blocking > account > plan > marketing); none on task screens; dismissals persisted; in flow, never fixed over the header | hairline tier + tint; amber icon | VS-11, VS-12, AX-09 |
| **Toast** | `ToastHost.tsx` + `stores/toastStore` | EVOLVE | persistent polite/assertive live regions; pause on hover/focus; action as a real button; max 1–2 visible; never a replay of old notifications (NT-01); variants by meaning, not orange "info" | `FloatCard` glass surface (`frames.tsx:129-135`) | AX-07, VS-05 |
| **NotificationItem** | `pages/Notifications.tsx:166-200` rows | EVOLVE as a ListRow variant | sender/avatar, type, one-line body, relative time via the formatting service, unread dot (not a count chip); grouped per thread | `MRow` / `MS` | RTL-03 (BV-33) |
| **SyncStatus** | `SyncStatusBadge.tsx` + `shared/SyncStatusIndicator.tsx` | MERGE | silent when healthy; quiet pending/failed indicator with a retry action; detail row in Settings; correct icon (no scale glyph); motion-reduce spinner | — | VS-18 |
| **OfflineState** | `ui/OfflineState.tsx` (unused) + `shared/OfflineBanner.tsx` | EVOLVE and actually use it | page-level offline state for live data; the offline notice lives in the BannerRegion, not fixed over the header | — | VS-03, VS-12 |
| **EmptyState** | `ui/EmptyState.tsx` (always a card), `WaitingForCoach.tsx`, ≥15 plain `<p>` | EVOLVE `EmptyState.tsx`, unboxed by default | one sentence + optional action; inline (in a list) and page variants; never nested in a card | lead text style (`type.tsx:37`) | VS-16, CD-03, CD-06 |
| **ErrorState** | `ui/ErrorState.tsx`, inline red `<p role=alert>`, 43 error `alertDialog`s | EVOLVE `ErrorState.tsx` (inline + page) | recoverable errors inline with retry; dialogs only when the user must decide; no "empty" on failure (CO-18) | `FieldError` pattern (`form.tsx:48-55`) | VS-16, AX-07 |
| **Skeleton** | `ui/Skeleton.tsx` + `ui/LoadingState.tsx`; 24 "Working…" texts; 7 spinners | EVOLVE | layout-shaped skeletons per component (row, metric, card); spinner only inside buttons (`SubmitButton`); motion-reduce | — | VS-16, AX-12 |

### 4. Overlays and actions

| Component | Existing today (files) | Verdict | Must standardise | Website anchor | Fixes |
|---|---|---|---|---|---|
| **Sheet** | `Sheet.tsx` (47 uses) | KEEP / EVOLVE | the sheet is the surface (no cards inside); header with one close + optional single back; footer actions; task-flow full-screen variant on phones | mobile menu dialog (`SiteNav.tsx:106`) | CD-03 |
| **Dialog** | `DialogHost.tsx` (confirm / alert) | KEEP / EVOLVE | token shadow; decision-only use; destructive variant names the object and the consequence | — | VS-09, VS-16 |
| **ActionMenu** | none: FloatingActionMenu (`MessageThread.tsx:1213-1305`), ManageSheet (`CoachClientDetail.tsx:393`), `ui/QuickActions.tsx` sheet, workspace More sheet, `NavMenuSheet.tsx`, `LanguageToggle.tsx` | REPLACE with one component | popover ≥md, sheet <md; `role=menu`/`menuitem`, arrow keys, Esc, focus return; destructive items last and separated; trigger exposes `aria-expanded` | `aria-expanded` burger (`SiteNav.tsx:96`) | AX-06, VS-15 |
| **Button** | `.btn-primary/-secondary/-tonal/-ghost/-danger/-light`, `.btn-sm/.btn-lg` (dead), `SubmitButton.tsx`, ad-hoc pills | REPLACE the size system; EVOLVE `SubmitButton` into Button | variants: primary (gradient), secondary (hairline), quiet, destructive; sizes 56/44/36 with a 44 hit area; icon slot (mirrors in RTL); pending + offline states; one primary per view | `buttonClass` (`SiteButton.tsx:13-24`), `ButtonArrow` | VS-01, VS-08, VS-09, VS-05 |
| **IconButton** | `.icon-btn` (h-8…h-11), 13 bare icon buttons | EVOLVE as a component | required `label`; sizes tied to touch tokens; visible focus; tone only for destructive | round button (`roundBtn`, `SiteNav.tsx:28`) | AX-01, AX-02 |
| **Filter** (FilterChips) | `.chip`/`.chip-on` (84 interactive) | EVOLVE `.chip` as a component restricted to filters | single/multi-select semantics; overflow affordance; never used as tab, command, toggle, status or pagination | tinted chip | VS-15, VS-14 |
| **Search** | `ui/Field.tsx` `SearchField` (10) + 9 hand-rolled | KEEP `SearchField`; migrate the 9 | label (visible or sr-only), clear button, debounce, logical icon inset | `inputClass` (`form.tsx:11`) | AX-03, RTL-11 |

### 5. Inputs

| Component | Existing today (files) | Verdict | Must standardise | Website anchor | Fixes |
|---|---|---|---|---|---|
| **Field** (Text / Select / TextArea) | `ui/Field.tsx` (120 uses) vs 87 raw inputs; `.input`/`.label` (`index.css:248-255`) | EVOLVE `Field.tsx`; mandatory in both apps | persistent sentence-case label, help, error (icon + text), required/optional marker; `aria-describedby`; 52px control; focus halo | `inputClass`, `FieldLabel`, `FieldHelp`, `FieldError` (`form.tsx:11-55`) | AX-03, VS-04 |
| **NumericInput / Stepper** | `NumberStepper.tsx` (1 use), ExerciseCard `NumericCell` (`ExerciseCard.tsx:229-262`), raw `inputMode` inputs | MERGE into one | parses with `lib/utils.ts parseDecimal` (Arabic-Indic, comma); unit suffix via the formatting service; workout size 56px; ± steps; visible focus ring | `inputClass` | RTL-04, AX-01, AX-05 |
| **Switch** | `ui/Switch.tsx` | EVOLVE | 44px hit area; label association; on/off contrast ≥3:1 | gradient "on" (shared) | AX-01, AX-04 |
| **Checkbox / toggle check** | `ui/RowCheckbox.tsx` (20px), meal / supplement / set-done buttons | MERGE | 44px hit area; `aria-checked`/`aria-pressed` always; checked contrast ≥3:1 | — | AX-01, AX-08, AX-04 |
| **DateNavigator** | `DayNav.tsx` + `WeekStrip.tsx` + `coach/CoachDayNav.tsx` | MERGE into one (per IA 16: "today" is the default tense) | one control; visible non-today state; localized via the formatting service (no `=== 'ar'`, no `.slice`); translated aria; RTL arrows | — | RTL-02, RTL-09, CD-04 |
| **TagInput / Slider** | `TagInput.tsx`, `Slider.tsx` | EVOLVE | labels, Arabic face, hit areas | — | AX-03 |

### 6. Domain components

| Component | Existing today (files) | Verdict | Must standardise | Website anchor | Fixes |
|---|---|---|---|---|---|
| **ExerciseCard** (live logging) | `ExerciseCard.tsx` + `RestTimerBar.tsx` + session header (`WorkoutSession.tsx`) | EVOLVE | the one interactive card on the session screen; 56px set controls and toggles with pressed state; notes inline (no nested box); prev/next ≥48px; rest timer ±15/skip ≥48px; NumericInput; exercise image when available (BV-17) | `MCard` + `MNum` | AX-01, AX-08, CD-03, RTL-04 |
| **ExerciseRow / ExerciseView** | Workout accordion rows, `workout/ExerciseView.tsx`, `ExercisePickerSheet.tsx` rows | MERGE on ListRow | thumbnail or media indicator, muscle label (localized, no raw keys), prescription formatted; same row in the picker, plan and library (see EX findings) | `MIc` icon tile (`mock.tsx:201-221`) | RTL-07, RTL-10 |
| **FoodCard** → FoodRow + MealSection | meal cards (`Nutrition.tsx:300-546`), `FoodSearchPicker.tsx` rows, coach `mealCard` (`CoachNutritionEditor.tsx:224`) | REPLACE with Section + ListRow composition | macros via Metric inline + localized units; swap / edit / delete in edit mode or ActionMenu (no red × per row); one select for the meal slot (coach) | `MRow`, `MBar` | VS-08, CD-08, RTL-06 |
| **MediaViewer** | `ImageViewer.tsx`, `VideoPopup.tsx`, `VideoPlayerSheet.tsx` | MERGE into one dialog-based viewer | `role=dialog`, focus trap and return; logical next/prev for keys and swipe (RTL); captions; error/fallback state for unplayable links (BV-07); correct iframe title | — | AX-06, RTL-08 |
| **MessageBubble** | `MessageRow` inside `MessageThread.tsx` (1,338 lines) | EVOLVE (extract) | own/peer alignment via logical properties (already correct); time and receipt via the formatting service; actions through ActionMenu (no 24px "⋮" on every bubble) | `MBub` (`mock.tsx:284-303`) | MS-12, AX-01, RTL-03 |
| **Composer** | composer block in `MessageThread.tsx` | EVOLVE (extract) | labelled textarea; send icon mirrored in RTL; attachment preview; respects the bottom-stack manager (never under the nav) | `Voice` waveform (`mock.tsx:127-176`) | AX-03, RTL-08, AX-09 (MS-01) |
| **Avatar** | `Avatar.tsx` | EVOLVE | token ring (no raw hex, `Avatar.tsx:31`); name always available to assistive tech; sizes tied to ListRow/EntityHeader | `MAv` (`mock.tsx:106-118`) | VS-06 |
| **Icon** | `components/Icon.tsx` (43 glyphs, stroke 2) | REPLACE with the website set | 1.75 stroke; named sizes; meaning dictionary (delete = trash, send = send…); `mirrorInRtl` per glyph; decorative by default | `website/components/Icon.tsx`, `website/icons.tsx` | VS-07, RTL-08 |
| **Logo** | `/forma-logo.webp` (`BrandBar.tsx:35`), `forma-mark-128.webp`, `FormaMark.tsx` | REPLACE | wordmark in headers, mark for collapsed sidebar and app icon only | `SiteNav.tsx:10,79` | VS-19 |

## Rules of use (what to reach for)

| Situation | Use | Never |
|---|---|---|
| Show a list of things (clients, foods, exercises, notifications, settings) | Section + ListRow (MobileDataList on phones, Table on desktop) | a card per item |
| Show numbers that answer a question | Metric (inline row first; a tile only in a hero or a desktop grid) | four tiles of zeros; the same KPI on two tabs |
| The one thing to do now | Card `featured` (one per screen) with a primary Button | a hero for identity or charts |
| Secondary or destructive actions | ActionMenu or edit mode | a red icon on every row in read mode |
| Choose a section of one screen | Tabs (pill or underline), ≤4–5 + More | chips as tabs |
| Switch a small set of modes | SegmentedControl (2–4) | Tabs |
| Narrow a list | Filter chips | chips as commands, toggles or status |
| Read-only state | StatusChip | a chip that looks tappable |
| A notice | Banner in the BannerRegion (max 1) | stacked notices; banners on task screens |
| Feedback after an action | Toast (undo where possible) | a blocking dialog for a recoverable error |
| A decision with consequences | Dialog | a Sheet styled as a confirm |
| A multi-step or focused task | full-screen Sheet / task-flow mode (nav hidden) | keeping the bottom nav over the CTA |

## Retire list (delete once replacements land)

| Retire | Replaced by |
|---|---|
| `AppShell.tsx`, `BrandBar.tsx`, `TopBar.tsx` | AppShell (evolved ResponsiveShell), MobileHeader |
| `.card-tap`, `.card-hover`, `.card-elevated`, `.stat-tile`, `.row`, `.rowline`, `.tk-ic`, `.sec-head` classes | Card variants, ListRow, Section |
| `StatTile.tsx`, `ui/MetricCard.tsx`, `ui/DashboardCard.tsx`, HeroStat, TargetCell | Metric |
| `TaskRow.tsx`, dashboard ClientRow/AttentionRow, ThreadRow, the two `Row` helpers | ListRow |
| `.seg`, workspace underline rail, chip tabs | SegmentedControl, Tabs |
| `BannerHost`, `SubscriptionBanner`, `ReminderBanner`, `CoachPlanBanner`, `CoachTrialBanner`, `ClientCapBlocked`, usage strip | Banner + BannerRegion |
| `SyncStatusBadge`, `SyncStatusIndicator` | SyncStatus |
| `ImageViewer`, `VideoPopup`, `VideoPlayerSheet` | MediaViewer |
| FloatingActionMenu, ManageSheet, `QuickActions`, `NavMenuSheet` (per IA 16), `LanguageToggle` dropdown | ActionMenu (+ IA changes) |
| `NumberStepper`, `NumericCell`, raw numeric inputs | NumericInput |
| `RowCheckbox`, ad-hoc check toggles | Checkbox / toggle check |
| `DayNav`, `WeekStrip`, `CoachDayNav` | DateNavigator |
| `Icon.tsx`, `FormaMark.tsx`, `/forma-logo.webp` in headers | website icon set, wordmark |
| `WhatsAppFab` | Help row in You / Me (IA 16) |
| `OfflineBanner` (fixed) | BannerRegion offline notice + OfflineState |
| `.btn-sm`, `.btn-lg`, `.btn-light`, undefined `.h3 .bd .bd-s .num .thin .tbl-wrap .hdr` | Button sizes, type roles |
| `ResponsiveGrid`, `PageContent`, `FormSection`, `Spark`, `PermissionState` (if not adopted) | — (unused today) |

## Suggested build order (direction)

1. **Foundations:** colour roles, type roles with Arabic variants, size/hit-area, hairlines, z-layers, focus, motion, the formatting service, the status vocabulary. This fixes the root causes in VS-01/02/04/05/06, RTL-01..06 and AX-04.
2. **Primitives:** Button, IconButton, Icon, Field, NumericInput, Switch/Checkbox, StatusChip, CountBadge, Metric, ListRow, Section, Card.
3. **Containers and overlays:** AppShell (task-flow mode, bottom-stack manager, BannerRegion), Mobile/Desktop/EntityHeader, Tabs/SegmentedControl, Sheet/Dialog updates, ActionMenu, Toast, state kit (Empty/Error/Skeleton/Offline), SyncStatus.
4. **Domain:** DateNavigator, ExerciseCard, FoodRow/MealSection, ExerciseRow, MediaViewer, MessageBubble/Composer, ProgressChart/Progress.
5. **Screens, rebuilt on the kit in IA-16 order:** client Today → session → nutrition; coach Today triage → client space → editors. Run the EN + ar-eg probes from `14` on every screen.

## Governance (keep it coherent after Phase B)

- `docs/DESIGN_SYSTEM.md` is regenerated from this inventory; the current one contradicts the code (VS-03).
- Each component documents its RTL behaviour, sizes, states and the website anchor it follows.
- The route probes in 14 (small targets, tiny text, nested cards, Latin on RTL pages, mixed numerals) become a release check.
