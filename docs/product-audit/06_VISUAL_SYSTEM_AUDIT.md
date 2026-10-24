# 06 — Visual system & card audit (client + coach)

> Phase A · Discovery only · 2026-10-04 · HEAD `e7663ab` (`development`); production runs RC2 `cf3a5d9`. None of the styling files cited here differ between RC2 and HEAD unless noted, so findings apply to production.
> Sources: a full read of `tailwind.config.ts`, `src/index.css`, `src/theme/*`, `docs/DESIGN_SYSTEM.md`, `src/components/**`, and the client/coach pages. Supporting checks: a TypeScript-AST scan of 344 in-scope files (website, marketing, experience and tests excluded), and a compile of the repo's own Tailwind config to find classes that generate no CSS. Browser data comes from per-route probes on the isolated stack (client 390 EN/AR, 360/375/430, coach 390 EN/AR, coach 1440), plus screenshots in `evidence/`.
> The approved public website (`src/pages/website`) is the brand reference only. It is not audited here.

## Bottom line

- **The app has tokens but no system.** The visual layer is a set of utilities each screen re-assembles: about 21 font sizes, 16 letter-spacings, 13 radii, 35 border colours and 57 background tokens. Some of the system's own primitives don't work:
  - `.btn-sm`/`.btn-lg` are dead CSS (VS-01).
  - The global focus rule squares off every rounded control (VS-02).
  - Eight prototype classes are used but never defined (VS-03).
- **Everything is a box, and every box looks the same.** `.card` = border + fill + two-layer shadow. Probes count 18 cards on client Today (8 nested), 19 on Cardio, 15 on the coach dashboard and Revenue. Importance is expressed by adding boxes, not by hierarchy (CD-01, CD-04).
- **Orange carries every meaning**: action, info, selection, decoration (VS-05). The website's quieter language isn't used: translucent hairlines, tinted pills, amber accent text, gold highlight, a lighter icon stroke and IBM Plex Sans Arabic (VS-19).
- **Client and coach feel like two products** (VS-20):
  - 4 page-header systems and 4 tab systems.
  - The same unread count is orange in one nav and red in the other.
  - Client screens are mono-heavy at 11.5/15px; coach screens are sans at 12/13px.
- **Patterns are re-invented per screen:** 7 destructive styles, 4 status-chip implementations with 18 copied tone maps, 15 banner treatments, 4 KPI-tile components, and loading/empty/error each rendered 4–6 ways.
- **Direction for Phase B:**
  - Rebuild a small component kit on the website's tokens: one Button, one Metric, one ListRow, one StatusChip, one Banner region.
  - Default to unboxed content.
  - Keep one hero per screen.
  - Reserve orange for "act here".
  - The inventory is in `17_TARGET_DESIGN_SYSTEM.md`; accessibility and Arabic are in `14_ACCESSIBILITY_RTL_AUDIT.md`.

---

## Part A — Visual system (brief §10)

### A.1 Foundations as they exist

| Layer | Where | What it defines | Problem |
|---|---|---|---|
| Tailwind tokens | `tailwind.config.ts:18-148` | 6 surface tiers, 6 brand, 4 text (earth), 3 line, status, 3 data colours, 16 `site.*`, a legacy warm `slate`, 7 gradients, 6 font families, radius `xl2/hero/sheet`, 8 shadows, spacing `touch` | Three surface tiers have the same value (`surface.card` = `sunken` = `panel` = #141110). Legacy `slate-*` is used 23×. `gold` is used 0× as a class, `teal/violet/rose` 0×, `spacing.touch` 0×. |
| Component classes | `src/index.css:113-356` | `.card*`, `.btn*`, `.icon-btn`, `.input/.label`, `.stat-*`, `.sec-*`, `.row/.rowline/.tk-ic`, `.chip`, `.seg`, `.prog`, `.pill*` | Button size modifiers are inert (VS-01). The focus rule overrides radius (VS-02). Prototype classes are missing (VS-03). |
| JS mirrors | `src/theme/*.ts` | colours, radius, spacing, typography, elevation, motion, breakpoints | Names drift: `colors.textMuted` = Tailwind `earth.subtle` while `textSecondary` = `earth.muted` (`colors.ts:17-18`); `radius.md` = Tailwind `rounded-xl`; `elevation.modal` says `shadow-deep` but DialogHost uses Tailwind's `shadow-2xl` (`DialogHost.tsx:64`). |
| Rules | `docs/DESIGN_SYSTEM.md` | conventions | Out of date: icon-btn "square" (it is round, `:13`); icon sizes `xs…lg` (0 uses, `:46`); `OfflineState`/`PermissionState` mandatory (0 uses, `:36-38`). |

### A.2 How far usage has drifted (class tokens in 344 in-scope files)

| Dimension | Count | Notes |
|---|---|---|
| Font sizes | ~21 distinct; 17 arbitrary `text-[Npx]` (500 uses) + 8 scale sizes | 9 sizes are ≤11.5px. Smallest: 8px (`charts.tsx:349`), 8.5px (`Nutrition.tsx:212`, `charts.tsx:288`), 9px (`WeekStrip.tsx:58`), 9.5px nav labels (`BottomNav.tsx:80`). |
| Text <12px in the browser | 474 visible text nodes on 25 client routes; 538 on 32 coach routes (390px) | Today 49, client Inbox 51, coach thread 52, nutrition editor 47 (probe). |
| Letter-spacing | 12 utility values + 8 in classes ≈ 16 | `tracking-wide` 13× in coach only; custom em values elsewhere. |
| Heading styles | 110 headings in **32 class combinations** | Section titles are 16px/600, 16px/700 and 18px/600 depending on the file. |
| Radius | 18 `rounded-*` tokens; ≈13 distinct values | Card-like surfaces use 12/16/18/20/30px. |
| Borders | 35 border colours; 5 styles for the row divider | `divide-line-soft`, `border-line-soft`, `border-earth-subtle/10` (`Nutrition.tsx:343`), `border-white/5` (`Settings.tsx:413`), `bg-line-soft` hairline. |
| Backgrounds | 57 distinct tokens; 240 alpha modifiers | Includes non-token `sky-*`, `slate-600`, `#25D366`. |
| Shadows | 10 explicit (incl. 3 raw-rgba arbitrary) + implicit on every `.card` | `.card` → `shadow-card` (two layers) at 1.3:1 visibility on #0C0A09. |
| z-index | 9 values, no scale | Dialog and OfflineBanner share `z-[60]`; BrandBar and ReminderBanner both stick to top 0. |
| Icons | 43 glyphs; 18 numeric sizes (10–40px); stroke fixed at 2 | The documented `xs/sm/md/lg` sizes are used 0×. |
| Dead CSS | 8 undefined classes, ~21 call sites | `.h3 .bd .bd-s .num .prog.thin .tbl-wrap .hdr ring-1.5` (VS-03). |
| Buttons | 5 variants, `icon-btn`, 84 interactive chips, ≥67 buttons with no system class | `btn-light` 0 uses; `btn-sm` 49, `btn-lg` 11 — both inert (VS-01). |

### A.3 Concept-by-concept inventory

| Concept | What exists today | What is wrong (evidence) | Direction | ID |
|---|---|---|---|---|
| Spacing | Page stacks `space-y-3/4/5/6`; section heads `.sec-head` (mt-7), `h2 mb-2 mt-6`, DashboardSection `mb-3`; row insets px-3/4/5 | Same structure, three rhythms (Home `space-y-4`, Workout `space-y-3`, coach Overview `space-y-6`). Rows inside `p-0` cards pad themselves 12/16/20px (`CoachClients.tsx:490`, `.rowline`, `Home.tsx:257-261`). | One spacing scale with named page, section, row and inset values. | VS-06 |
| Radius | `.card` 18px, `.stat-tile` 16px, `.input` 12px, banners 12/16/18px, Sheet 30px, set cells 10px, logo 8px | KPI tiles on one coach page use 16px (StatTile) and 18px (MetricCard). | ~4 radii: control, card, sheet, pill. | VS-06 |
| Borders | `border-line` (69), `line-soft` (36), 30 alpha variants | Every card is outlined *and* shadowed *and* filled. The website uses three translucent hairline tiers and no card shadow (`mock.tsx:17-35`). | Hairline tiers; one boundary method per surface. | VS-06 |
| Shadows | card, elevated, featured, glow, deep + Tailwind `shadow-2xl` | Shadows are invisible on near-black but add weight. The dialog uses an off-token shadow. | Elevation only for overlays (sheet, dialog, menu, toast). | VS-06 |
| Surface hierarchy | bg → card → raised → hover → strong | card = sunken = panel. Inputs (`raised` #1B1714) on cards (#141110) differ by ~1.1:1. Chat uses 3 tiers in one view (`Messages.tsx:65`). | Page, raised, overlay; inputs distinguished by border, not by fill. | VS-06 |
| Typography | `.h1` 30/700, `.h2` 18/600, `.eyebrow`, `.ui-label`, `.label`, `.stat-*` + ad hoc | 21 sizes, 16 trackings, 32 heading styles. The prototype roles `.h3 .bd .bd-s .num` were never ported. | 6–8 type roles with Arabic variants and a 12px floor. | VS-04, VS-03 |
| Headings | TopBar, PageHeader, workspace h1, Home's double `.h1` | 4 systems; two `<h1>` on workspace sub-pages (probe: "Nour Hassan / Nutrition plan"). | MobileHeader / DesktopHeader / EntityHeader only. | VS-13 |
| Labels | `.eyebrow` (orange 0.14em), `.ui-label`, `.label` (mono 11px caps), `.stat-label` 10.5px, ad-hoc caps | Form labels are mono-uppercase 11px. Website form labels are sentence-case 14px (`form.tsx:26-38`). Eyebrow on every page title (53 TopBar files). | Eyebrows only where they add context; sentence-case field labels. | VS-04 |
| Muted text | earth-muted (315), earth-subtle (332), slate-* (22) | Two tiers are used interchangeably for the same role (row secondary line: `CoachClients.tsx:302` muted, `parts.tsx:157` subtle). | Two text tiers with defined roles. | VS-04 |
| Icons | `Icon.tsx` 43 glyphs, stroke 2 | Missing glyphs force wrong meanings: × = delete 14×, − = delete 3×, `info` = "Message" and phone, `list` = copy and menu, `chevron` = send, an undo arrow spun as a spinner. 18 sizes. | Website icon set (1.75 stroke, has trash/copy/send/filter/dots/phone); named sizes; RTL-mirror flag. | VS-07 |
| Buttons | primary 96, ghost 100, tonal 28, secondary 6, danger 9, icon-btn 63, chips as buttons 84, ad hoc ≥67 | Size modifiers dead. Ad-hoc pills at `WorkoutSession.tsx:281`, `RestTimerBar.tsx:17,44`, `DayNav.tsx:43`. The same action appears twice on one page (`Nutrition.tsx:535` link vs `:610` button). | One Button (variant × size × icon), one IconButton. | VS-01, VS-15 |
| Destructive actions | 7 styles | `btn-danger`, ghost+red, icon+red, chip+red, bare red icon, row+red, and `btn-primary bg-danger` which renders orange. Red × on every planned food row (BV-39). | One destructive pattern. | VS-08, VS-09 |
| Status chips | `<Pill>` 41, raw `.pill` 7, `.chip`+tone 27, hand-rolled spans | 18 tone maps that drift. Unread badge orange in BottomNav (`:71`), red in Sidebar (`:88`) and Bell (`:109`). | One StatusChip + one status vocabulary per domain. | VS-10 |
| Cards | `.card`, `-tap`, `-featured`, `-elevated`, `-hover`, `.stat-tile`, MetricCard, StatTile, boxed states | See Part B. | Unboxed by default. | CD-01…09 |
| Tables | DataTable (10), MobileCardList (3), raw `<table>` (3), flex pseudo-tables | 3 header styles (`DataTable.tsx:74`, `CoachNutritionEditor.tsx:326`, `PaymentRequestsTab.tsx:109`). Desktop clients table cut at "ADHERENC…" (BV-21). A/B/Δ pseudo-table duplicated client/coach (`Measurements.tsx:77-91`, `CoachViewMeasurements.tsx:66-80`). | Table + MobileDataList pair (see the TB findings for behaviour). | VS-06 |
| List rows | `.row`, `.rowline`, TaskRow, ClientRow, AttentionRow, ThreadRow, MobileCardList row, 2 components both called `Row` | 8 row shapes, 3 insets, 2 chevron rules. | One ListRow. | VS-15 |
| Forms | Field primitives (120 uses) vs raw inputs (87) | ~70 raw inputs have no programmatic label. Session cells and steppers have their own styles (`ExerciseCard.tsx:49`, `NumberStepper.tsx:60`). | Field everywhere (AX-03). | VS-15 |
| Sheets | `Sheet.tsx` (47 uses): forms, menus, pickers, viewers, confirms | Good primitive; misused for confirms and menus; cards placed inside (CD-03). | Keep Sheet; ActionMenu for menus. | VS-15 |
| Dialogs | DialogHost confirm/alert (61/53) | Off-token shadow. 43 of 53 alerts are error messages that block the flow. | Dialog for decisions only. | VS-16 |
| Empty states | EmptyState (49, always a card), WaitingForCoach, ≥15 plain `<p>`, `—` rows | Boxed empty states nest inside list cards (CD-03). | Unboxed EmptyState. | VS-16 |
| Skeletons / loading | LoadingState (34), 24 "Working…" texts, 7 spinners | Same wait, 3 looks. | Skeleton everywhere. | VS-16 |
| Errors | ErrorState 11, inline red text 16, blocking alertDialog 43, danger toast 0 | Recoverable errors interrupt with modals. | Inline + page ErrorState. | VS-16 |
| Banners | 15 treatments (A.4) | Global mounting, stacking, composer pushed under nav (BV-14). | One Banner region. | VS-11 |
| Notifications / sync | NotificationBell badge, SyncStatusBadge vs SyncStatusIndicator | Same state in two colours. "Synced" shown while work is pending (BV-05). | One quiet SyncStatus. | VS-18 |
| Toasts | ToastHost (`card-elevated`, 4 variants) | `info` is orange (`ToastHost.tsx:9`). Old toasts replay and cover the top ~400px (BV-01; see NT-01). | Toast tokens; max 1–2 visible. | VS-05 |
| Charts | Bar/Line/Donut, ProgressRing, `.prog` | Raw rgba, 8–9.5px labels, own gradient, red for good news (BV-37). | Chart tokens. | VS-17 |
| Filters | chips | Chips are also tabs, commands, toggles, status and bulk delete. | Chips = filters only. | VS-15 |
| Search | SearchField (10) vs 9 hand-rolled | Placeholder-only; physical RTL overrides (`WorkoutSession.tsx:520-524`). | SearchField only. | VS-15 |
| Action menus | none | 7 menu-like implementations (FloatingActionMenu, ManageSheet, QuickActions sheet, More sheet, NavMenuSheet, LanguageToggle, message Sheet). | One ActionMenu (AX-06). | VS-15 |

### A.4 Banners and notices that can stack at the top

| # | Component | Mounted | Style | CTA / dismiss |
|---|---|---|---|---|
| 1 | OfflineBanner (`shared/OfflineBanner.tsx:19`) | app root, `fixed top-0 z-[60]`, overlays the header | solid warn bar, 12px, no radius | – |
| 2 | BannerHost (`BannerHost.tsx:78-80`) | app root, above every shell, **every route** although named "client_home"/"coach_dashboard" | `rounded-xl` tint 5–10% | link / × 32px |
| 3 | ReminderBanner (`ReminderBanner.tsx:13`) | both shells, `sticky top-0 z-40` (BrandBar is `sticky top-0 z-30`) | `rounded-xl2` accent ring | × 32px |
| 4 | SubscriptionBanner (`SubscriptionBanner.tsx:20`) | client `<main>` | `rounded-xl` 13px, no icon | – |
| 5–7 | CoachPlanBanner ×≤3 (`CoachPlanBanner.tsx:30-52`) | every coach route (`CoachApp.tsx:66`) | `rounded-2xl` + icon | ghost button (h-9, inert) |
| 8 | CoachTrialBanner (`CoachTrialBanner.tsx:21`) | coach dashboard | `rounded-2xl` | – |
| 9 | ClientCapBlocked (`ClientCapBlocked.tsx:16`) | invite sheet | `rounded-xl` warn | tonal |
| 10 | Usage strip (`CoachClients.tsx:241`) | clients list | `rounded-xl` line-soft | link |
| 11 | Check-in request (`Home.tsx:187`) | Today | `card-tap` warn tint | whole card |
| 12 | Undo bar (`WorkoutSession.tsx:372`) | session | raised box | text button |
| 13 | Coach note (`EntityNotes.tsx:109`) | inline under items | `rounded-lg` brand tint | – |
| 14 | CoachChecklist / IncomingTransferRequests | dashboard / clients | full `.card` | rows |
| 15 | SubscriptionGate / CoachPlanGate | gated routes | full page | primary |

Worst cases:
- **Client Today:** 1 + 2 (N) + header + 3 + 4 + day navigator + week strip + 11, all before the hero.
- **Coach dashboard:** 1 + 2 (N) + 3 + 5–7 + header with 3 hero stats + 8 + 14 — about 7 notice blocks before content. The "Get started 1/3" checklist still shows for a coach with 10 clients (BV-24).

### A.5 Why there is no coherent Forma identity

The approved website already has a precise, calmer language. The authenticated app uses the same tokens with none of the discipline.

| Brand element | Website (approved) | App today |
|---|---|---|
| Hairlines | 3 translucent tiers `site.line/line2/line3` (.09/.14/.22); mock cards use the softest, no shadow (`mock.tsx:17-35`) | solid `border-line` + fill + 2-layer shadow on every card (`index.css:115-117`) |
| Status pills | borderless tint + dot (`MPill`, `mock.tsx:84-104`) | bordered tint (`.pill`, `index.css:331-355`), or chips abused as badges |
| Accent text | amber `brand-hover` (28×) for eyebrows, active tab, pill text; gradient only for actions | orange `brand` text everywhere; info = orange |
| Highlight | gold-gradient italic "Piv" in headlines (`type.tsx:11-16`) | `gold` 0×; a Lora-serif orange italic in one place (`WorkoutSession.tsx:248`) |
| Eyebrow | mono 12px .09em amber **with an 18px gradient dash** (`type.tsx:25-26`) | mono 11px .14em orange, no dash, on every page |
| Form fields | 52px, radius 14, translucent border, sentence-case 14px label, help + error with icon (`form.tsx:11-55`) | 48px `.input`, mono-caps 11px `.label`, often unassociated |
| Icons | 1.75 stroke, 18px default, full set incl. trash/copy/send/filter/dots/phone/alert (`website/components/Icon.tsx:17`, `icons.tsx`) | 2.0 stroke, 43 glyphs, meanings bent to fit |
| Arabic | IBM Plex Sans Arabic; every mono class drops caps and tracking in RTL (`type.tsx:26,32,40`, `SiteButton.tsx:17`) | Cairo; only 6 classes are neutralised; mono labels keep their tracking (RTL-01) |
| Logo | wordmark `/website/forma-wordmark.webp` (`SiteNav.tsx:10,79`) | raster `/forma-logo.webp` with `rounded-[8px]` (`BrandBar.tsx:35-37`), plus `forma-mark-128.webp` and a CSS "F" tile (`FormaMark.tsx:11`) — 4 treatments |
| Motion and focus | single reduced-motion kill-switch; amber focus outline offset 3px (`site.module.css:14,44`) | partial gating; focus rule changes element radius (VS-02) |
| Phone tab bar | solid surface with a hairline top border and amber active label (`frames.tsx:83-127`) | gradient fade, orange label, 9.5px mono labels |

Three root causes:
1. Every screen re-applies utilities instead of composing a small kit (A.2).
2. There is no "quiet" level, so emphasis is added with boxes and orange.
3. The brand's signature, mono labels, is unsystematised and disappears in Arabic.

### A.6 Client vs coach: two products

| Dimension | Client | Coach | Evidence |
|---|---|---|---|
| Shell | `AppShell` phone column (`max-w-md` at every width), BrandBar, 5-tab BottomNav with centre button | `ResponsiveShell`: mobile BrandBar + 4 tabs; ≥md sidebar + DesktopTopBar; WhatsApp FAB | `AppShell.tsx:24`; `ResponsiveShell.tsx:31-48` |
| Page header | TopBar (30px h1 + orange eyebrow) | 21 coach pages reuse the *mobile* TopBar on desktop; Dashboard/Plan use PageHeader; the workspace has its own 18px h1 | `evidence/coach-clients-1440.png`; `CoachClientWorkspaceLayout.tsx:119` |
| Tabs | `.seg` gradient segments | `Tabs` pills, underline rail, chip tabs | VS-14 |
| Density | mono 11.5/15px meta, 34px numbers | sans 12/13px meta (`text-[12px]` 76×), `tracking-wide` | A.2 |
| Data display | featured heroes (8), StatTile, rings | MetricCard grids (58), tables, chips (51), dividers (34) | A.2 |
| Unread badge | gradient + ink (`BottomNav.tsx:71`) | red + white (`SidebarNav.tsx:88`) | — |
| Motion | `anim-rise` on 29 sites | 5 sites | — |
| Eyebrow class | 16 uses | 1 use | — |

Coach desktop is the client's mobile header and tiles stretched across a sidebar layout. The client is a phone mock at every width. Neither has the website's identity.

### A.7 Findings — visual system

### VS-01 — Button size modifiers are dead CSS
- **Priority:** P2      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** all roles · every compact button (49 `btn-sm`, 11 `btn-lg`, ~26 `h-*` on `.btn-*`) · all viewports
- **Evidence:**
  - `index.css:181-234`: `.btn-sm` is emitted before the variants, and each variant `@apply btn` re-emits padding 1.5rem, 13px and `min-height:3rem`. Same specificity, so the later rule wins.
  - Shipped bundle `dist/assets/index-BdmSntFA.css`: `.btn-sm{` @10525 comes before `.btn-primary{` @10779.
  - `min-height` also beats `h-8/h-9` (`CoachPlanBanner.tsx:38`, `CoachClients.tsx:197,502-515`).
  - Workaround in the wild: `btn-tonal btn-sm min-h-0` (`Progress.tsx:507`).
  - Visible: the workspace Message / Edit-plan `btn-sm` render as 48px pills (`evidence/coach-client-overview-390-full.png`).
- **Expected vs actual:** a compact ~34px pill · a 48px pill with a 13px label and 24px side padding.
- **Why it matters:** button hierarchy can't be expressed, so every row and header grows, and call sites pile on overrides (`!px-4`, `min-h-0`, `h-[42px]`).
- **Direction:** one Button whose size wins by construction; delete the per-call-site height hacks.
- **Verified:** CODE-CONFIRMED (compiled CSS + shipped bundle)

### VS-02 — Keyboard focus squares off every pill and round control
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** keyboard users, all roles · buttons, icon buttons, chips, tabs, avatar buttons · desktop mainly
- **Evidence:** `index.css:103-107` sets `:focus-visible { outline; border-radius:5px }`. The rule comes after the utilities (compiled CSS: line 3516 vs `.rounded-full` at 2379; bundle @99915 vs @51425), at equal specificity.
- **Expected vs actual:** the ring follows the control's shape · the control turns into a 5px-radius rectangle while focused.
- **Why it matters:** the focus state reads as a glitch on the most-used controls.
- **Direction:** a focus-ring token (outline or shadow) that never changes the element's geometry, defined per component.
- **Verified:** CODE-CONFIRMED

### VS-03 — Dead styling: undefined classes, unused primitives, an out-of-date DS doc
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** all roles · Fuel hero, session "Up next", check-in steps, Progress, admin
- **Evidence:**
  - Classes that generate no CSS:
    - `num`: `Nutrition.tsx:199,213`, `Cardio.tsx:162,172`, `WeekStrip.tsx:63`
    - `h3`/`bd-s`: `WorkoutSession.tsx:455-456`, `SubscriptionHistory.tsx:50,54`
    - `bd`: `CheckIn.tsx:143-192`
    - `prog thin`: ×6
    - `hdr`: `Progress.tsx:503`
    - `tbl-wrap`: `AdminGovernance.tsx:112`
    - `ring-1.5`: `History.tsx:114`
  - Visible: the Fuel hero "1900" renders in Poppins while every other metric is DM Mono (`evidence/client-fuel-390-full.png`).
  - Unused primitives, 0 call sites each: `OfflineState`, `PermissionState`, `DashboardCard`, `ResponsiveGrid`, `FormSection`, `PageContent`, `Spark`.
  - Unused tokens: `spacing.touch`, `gold`.
  - `docs/DESIGN_SYSTEM.md:13,36-38,46` contradicts the code.
- **Expected vs actual:** every class used maps to a defined role · ~21 call sites render unstyled defaults.
- **Why it matters:** silent visual bugs, and a design-system doc that misleads the people who will build Phase B.
- **Direction:** replace with real type roles in the new kit; delete the dead primitives; regenerate the doc from `17_TARGET_DESIGN_SYSTEM.md`.
- **Verified:** CODE-CONFIRMED

### VS-04 — Typography has no scale; text that carries meaning is 8–11px
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach · every route · 390 especially
- **Evidence:**
  - A.2: 21 sizes, 16 trackings, 32 heading styles.
  - Browser probe at 390: 474 text nodes <12px on 25 client routes and 538 on 32 coach routes.
  - Samples:
    - 9px week-strip days
    - 8.5px Fuel macro labels
    - 9.5px bottom-nav labels
    - 8.5–9px coach progress-chart labels
    - 10px "AT RISK" badge
  - Field labels are 11px caps (`index.css:253-255`).
- **Expected vs actual:** 6–8 roles with a 12px floor for meaningful text · 21 sizes; nav labels 9.5px, macro labels 8.5px.
- **Why it matters:** gym use means glances at arm's length. Hierarchy is noise, and every page invents its own sizes.
- **Direction:**
  - Define type roles: display, title, section, body, meta, label, numeric. Each role gets its Arabic variant (RTL-01).
  - Mono only for numbers and short tags.
  - Sentence-case field labels, as on the website.
- **Verified:** BROWSER-VERIFIED (route probes)

### VS-05 — Orange means everything; info blue and gold are unused
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** both apps · every screen
- **Evidence:**
  - Orange is used for every page eyebrow (`index.css:166`), info toasts (`ToastHost.tsx:9`), info banners (`BannerHost.tsx:8`), the plan banner (`CoachPlanBanner.tsx:33`), selected chips, icon chips, rings, charts and badges.
  - `text-info` has 6 uses; `gold` 0.
  - Today's first screen shows 10+ orange/amber accents competing with START WORKOUT (`evidence/client-today-390.png`).
  - The website uses amber text accents and keeps the gradient for actions.
- **Expected vs actual:** orange = act here · orange = action, info, selected, decoration.
- **Why it matters:** the primary action does not stand out, and status colour stops carrying meaning.
- **Direction:** colour roles (action gradient, accent amber, info blue, success/warn/danger, neutral) and a rule of one orange action per view.
- **Verified:** CODE-CONFIRMED (illustrated in the screenshots)

### VS-06 — Surfaces, borders, shadows and radii have no hierarchy
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** both apps · all screens
- **Evidence:**
  - `.card` = border + fill + 2-layer shadow (`index.css:115-117`).
  - 35 border colours and 5 divider styles (A.2).
  - Surface tiers collapse to one value (`tailwind.config.ts:22-32`).
  - ≈13 radius values; an off-token dialog shadow (`DialogHost.tsx:64`).
  - Inputs sit ~1.1:1 against cards.
- **Expected vs actual:** 3 surface levels, each with one boundary method · every container uses all three.
- **Why it matters:** with no quiet level, hierarchy can only be added with more boxes (CD-01).
- **Direction:** page / raised / overlay levels; 3 hairline tiers (website `site.line*`); ~4 radii; shadows only for overlays.
- **Verified:** CODE-CONFIRMED

### VS-07 — The icon set is too small, so icons carry the wrong meaning
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** both apps · rows, editors, composer, contact cards
- **Evidence:**
  - `Icon.tsx:4-96`: 43 glyphs, stroke fixed at 2 (`:134`).
  - Delete is shown as ×/`close` 14× and −/`minus` 3×. Copy = `list` (`MessageThread.tsx:671`). Send = `chevron` (`:913`). Spinner = an undo arrow (`SubmitButton.tsx:63`). "Storage at risk" = `flame` (`Settings.tsx:519`).
  - "Message" and phone both use `info`: "(i) MESSAGE" (`evidence/client-assessment-390-full.png`), phone (`CoachClientDetail.tsx:126`).
  - 18 sizes.
  - The website set (`website/icons.tsx`) has the missing glyphs, at a 1.75 stroke.
- **Expected vs actual:** one glyph per meaning · × means close, delete, cancel and remove.
- **Why it matters:** an ambiguous icon on a destructive action invites mistakes, and it looks unfinished.
- **Direction:** adopt the website icon set and stroke; named sizes; a meaning dictionary; a per-glyph RTL mirror flag.
- **Verified:** CODE-CONFIRMED

### VS-08 — Destructive actions: 7 styles, and red × on every planned food row
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:**
  - client · `/nutrition` · 390
  - coach · library, editors, subscription
  - client · Settings
- **Evidence:**
  - Seven styles: `btn-danger` 9 · `btn-ghost text-danger` 14 · `icon-btn text-danger` 8 · `chip text-danger` 10 · bare red icon 15 (`CoachExerciseLibrary.tsx:176,235`) · red row 1 · `btn-primary bg-danger` (VS-09).
  - Fuel shows a red × on all 13 planned food rows (BV-39; probe "Delete 32x32"; `Nutrition.tsx:447-457`).
  - Sign-out is styled as a danger confirm (`Settings.tsx:502`).
  - "Clear day" is ghost while "Reset all" is danger, next to each other (`Settings.tsx:522,526`).
- **Expected vs actual:** destructive actions are rare, secondary and consistent · they scream in read mode and whisper elsewhere.
- **Why it matters:** clients are invited to delete their coach's plan item by item. Coaches can't tell routine actions from irreversible ones.
- **Direction:**
  - One destructive pattern: an edit mode or overflow menu, a trash glyph, and confirm or undo.
  - Never repeated per row in read mode.
- **Verified:** BROWSER-VERIFIED (BV-39)

### VS-09 — The "Release client" confirmation renders as an orange primary button
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach · `/coach/client/:id` → Manage → Release · all
- **Evidence:** `CoachClientDetail.tsx:310` `btn-primary w-full bg-danger`. The variant's `background-image` gradient paints over the `bg-danger` background colour. The trigger is `btn-ghost text-danger` (`:493`). The screen-level instance is CO-40.
- **Expected vs actual:** a red destructive confirm · identical to every Save.
- **Why it matters:** the most consequential relationship action looks routine.
- **Direction:** a destructive Button variant; the confirmation names the client and the consequence.
- **Verified:** CODE-CONFIRMED

### VS-10 — Status chips: 4 implementations and 18 copied tone maps that drift
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** both apps · lists, workspace, assessments, subscriptions, admin
- **Evidence:**
  - Four implementations: `<Pill>` 41; raw `.pill` 7 (`Workout.tsx:98`); `.chip`+tone as a badge 27 (`CoachClients.tsx:495`, `CoachPlan.tsx:176,235,268`, `AdminCoaches.tsx:177,232-233`); hand-rolled (`AdminGovernance.tsx:131`, `VideoManager.tsx:20,82`).
  - Drift: `updated_after_review` is `brand` in `CoachAssessments.tsx:18` but `warn` in 5 files. `ClientSubscriptionSection.tsx:13` lacks trial/pending/expired.
  - Consequence: the client list shows ACCOUNT status ("ACTIVE" for frozen and expired clients) (BV-20, BV-21; CO-07).
- **Expected vs actual:** one status → one look everywhere · the colour depends on the file.
- **Why it matters:** status is how coaches triage; inconsistent colour means re-reading every chip.
- **Direction:** one StatusChip fed by a single status vocabulary per domain (subscription, account, assessment, check-in, plan).
- **Verified:** CODE-CONFIRMED

### VS-11 — Fifteen banner treatments, mounted globally, stacking above content
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach · every route · 390 worst
- **Evidence:**
  - A.4.
  - BannerHost is mounted at the app root (`App.tsx:124`) with no route filter (`BannerHost.tsx:42-97`).
  - Up to 3 CoachPlanBanners on every coach route (`CoachApp.tsx:66`).
  - Consequences:
    - A plan banner pushes the coach thread composer under the nav (BV-14; MS-01, CO-04).
    - The "Get started" checklist sits above the triage list (BV-24).
    - Banners also render on full-height task screens (CO-30).
- **Expected vs actual:** at most one contextual notice in a reserved region · up to ~7 stacked blocks before content.
- **Why it matters:** notices push the actual task below the fold and break fixed-height layouts.
- **Direction:**
  - One Banner component and one region per shell.
  - Priority order, max one visible; the rest go to notifications.
  - Task screens (thread, session, check-in) show none.
- **Verified:** BROWSER-VERIFIED (BV-14, BV-24)

### VS-12 — Floating chrome collides with content
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MOVE
- **Who / where:**
  - coach · every route except messages · 390 and 1440 (FAB)
  - all roles · reminders and offline bar
- **Evidence:**
  - WhatsApp FAB (`WhatsAppFab.tsx:28`, mounted in `ResponsiveShell.tsx:48`) covers list chevrons and REVIEW buttons (BV-20; `evidence/coach-clients-390-full.png`, `coach-dashboard-1440.png`, `coach-revenue-390-full.png`). Its dismiss button is 20×20 on 20 coach routes (probe).
  - ReminderBanner `sticky top-0 z-40` sits over BrandBar `sticky top-0 z-30` (`ReminderBanner.tsx:13`).
  - OfflineBanner `fixed top-0 z-[60]` overlays the header with no offset (`OfflineBanner.tsx:19`).
  - Dialog and OfflineBanner share `z-[60]`.
  - Screen-level instance: CO-28.
- **Expected vs actual:** chrome never covers actions · support FAB and sticky bars cover rows and headers.
- **Why it matters:** hidden actions; the product feels unfinished.
- **Direction:** support moves to Account / Help (no FAB); z-index layer tokens; banners in flow.
- **Verified:** BROWSER-VERIFIED

### VS-13 — Four page-header systems; mobile headers on desktop; two h1 per workspace page
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** coach (desktop and mobile), admin, client · all pages
- **Evidence:**
  - Four systems:
    - `TopBar` in 53 files, incl. 21 coach and 10 admin pages, on desktop too (`evidence/coach-clients-1440.png`).
    - `PageHeader` on 6 pages.
    - A hand-rolled workspace header (`CoachClientWorkspaceLayout.tsx:109-135`, h1 18px).
    - Home's two 30px headings (`Home.tsx:162,223`).
  - Probe h1 on workspace sub-pages: "Nour Hassan / Nutrition plan", ".../ Workout plan", ".../ Client assessment".
- **Expected vs actual:** one header per context · four, with duplicated h1s.
- **Why it matters:** the coach desktop reads as a stretched phone. Titles, back affordances and actions sit in different places on every page.
- **Direction:** MobileHeader, DesktopHeader and EntityHeader only (17).
- **Verified:** BROWSER-VERIFIED (probe h1 lists)

### VS-14 — Four tab systems, and rails that overflow
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** coach dashboard, client workspace, view-as-client, library · client Progress, Settings · 390
- **Evidence:**
  - Four systems:
    - The accessible `Tabs` is used on 2 pages only (CoachDashboard, AdminPlans).
    - `.seg` (`Progress.tsx:247`, `Settings.tsx:296,371`).
    - An underline rail (`CoachClientWorkspaceLayout.tsx:136-168`).
    - Chips as tabs (`CoachExerciseLibrary.tsx:66-72`, `CoachViewLayout.tsx:73`).
  - Overflow in the probes:
    - dashboard tabs 492/358px (BV-24)
    - workspace rail 393/350px, MORE off-screen (BV-32)
    - view-as-client chips 602/350px
    - Progress range chips 346/316px, "Al…" clipped (BV-37)
- **Expected vs actual:** one Tabs and one SegmentedControl, both fitting · four styles, three of them overflowing.
- **Why it matters:** sections are hidden off-screen, with no affordance that more exist.
- **Direction:** Tabs (≤4–5 visible, overflow into More) and SegmentedControl (2–4 options); chips are filters only.
- **Verified:** BROWSER-VERIFIED

### VS-15 — Controls used for the wrong job
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach subscription, nutrition editor, library; client session, Fuel, Settings · all
- **Evidence:**
  - Chips serve as:
    - commands: Set price / Freeze / Extend (`CoachSubscriptionPanel.tsx:207-214`; BV-35)
    - toggles: "Allow client substitutions" (`evidence/coach-client-nutrition-editor-390-full.png`)
    - pagination (`Pagination.tsx:44`)
    - bulk delete (`CoachExerciseLibrary.tsx:242`)
    - status (27 spans)
  - ≥67 buttons with no system class.
  - 8 list-row shapes.
  - 9 hand-rolled search boxes vs 10 `SearchField`.
  - 7 menu-like implementations and no ActionMenu.
  - The same action twice on one screen (`Nutrition.tsx:535` vs `:610`).
- **Expected vs actual:** each control type has one job · chips, rows and buttons are interchangeable.
- **Why it matters:** users can't predict what tapping does; every screen looks different.
- **Direction:**
  - A control taxonomy: Button (act), Switch (setting), Chip (filter), StatusChip (read-only), ListRow (navigate), ActionMenu (secondary actions).
- **Verified:** BROWSER-VERIFIED (screenshots)

### VS-16 — Loading, empty and error states each rendered 4–6 ways
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** both apps · every data screen
- **Evidence:**
  - Loading: skeleton `LoadingState` 34, plain "Working…" text 24 (`CoachClients.tsx:280`, `CoachExerciseLibrary.tsx:203`, `Notifications.tsx:153`, `MessageThread.tsx:706`), spinners 7.
  - Empty: `EmptyState` 49 (always boxed), ≥15 plain `<p>`, WaitingForCoach, `—` rows.
  - Errors: ErrorState 11, inline red text 16, blocking `alertDialog` 43; danger toast 0.
  - Related: CO-18 (states that lie).
- **Expected vs actual:** one state kit · every screen improvises.
- **Why it matters:** inconsistent waits and modal interruptions for recoverable errors.
- **Direction:** Skeleton, EmptyState and ErrorState (inline + page), plus OfflineState; dialogs only for decisions.
- **Verified:** CODE-CONFIRMED

### VS-17 — Charts and progress: off-token colours, tiny labels, colour that contradicts the goal
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client Today, Progress · coach progress, revenue · 390
- **Evidence:**
  - Raw rgba series and track colours (`charts.tsx:9-10`).
  - Labels at 8–9.5px (`charts.tsx:119,127,288,349`); probe "8.5px:10 Aug", "9px:79 kg".
  - ProgressRing uses its own gradient (`ProgressRing.tsx:39-40`).
  - Today shows two rings + a bar chart + four 0-value tiles (BV-16).
  - "↓ 2kg this month" in red for a fat-loss client (BV-37).
  - "Volume trend: Down 20.3t" on day 2 of the week (BV-16).
  - Calves muscle colour #5C3A2A at 1.87:1 (`lib/muscle.ts:11-12`).
- **Expected vs actual:** chart tokens, readable labels, delta colour relative to the client's goal · ad-hoc colours and good news shown in red.
- **Why it matters:** charts are where clients see progress; red on success erodes trust.
- **Direction:** chart tokens (series, track, grid, label ≥11px); semantic delta colour; one progress visual per question.
- **Verified:** BROWSER-VERIFIED (BV-16, BV-37)

### VS-18 — Sync status shown twice, in two colour schemes, and optimistically
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** client Today, Settings · coach desktop top bar
- **Evidence:**
  - Same state, two colour schemes: `SyncStatusBadge` shows synced as brand-light (`SyncStatusBadge.tsx:5-11`); `SyncStatusIndicator` shows it as success green (`SyncStatusIndicator.tsx:5-11`).
  - The client chip appears 3 times: `Home.tsx:174`, `Settings.tsx:282,476`.
  - "Synced" stays while a finished workout is pending upload (BV-05).
  - BV-26 flags the Arabic chip text.
  - The local-only state uses a weighing-scale icon (`SyncStatusBadge.tsx:6`).
- **Expected vs actual:** silent when healthy, explicit when pending/failed · a permanent "Synced" pill that can be wrong.
- **Why it matters:** decoration that occasionally lies.
- **Direction:** one SyncStatus: hidden when healthy, a quiet pending/failed indicator, detail in Settings.
- **Verified:** BROWSER-VERIFIED (BV-05, BV-16)

### VS-19 — No coherent Forma identity: the app doesn't speak the approved website's language
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REDESIGN
- **Who / where:** every user · every screen
- **Evidence:** A.5. The app ignores the website's:
  - hairline tiers and borderless tinted pills
  - amber accent text and gold highlight
  - eyebrow dash
  - sentence-case form labels
  - 1.75-stroke icon set
  - IBM Plex Sans Arabic
  - wordmark
  - Four logo treatments are in use.
- **Expected vs actual:** the signed-in product continues the brand the user just saw on the website · a different, louder product.
- **Why it matters:** the premium positioning is set on the site and lost after sign-in.
- **Direction:** Phase B builds the app on the website's tokens and motifs (`17_TARGET_DESIGN_SYSTEM.md` → Brand anchors).
- **Verified:** CODE-CONFIRMED (+ screenshots)

### VS-20 — Client and coach are two products
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** coaches who also open the client view; anyone switching roles · all viewports
- **Evidence:** A.6: two shells, 4 header systems, 4 tab systems, two type densities, opposite badge colours, motion on one side only.
- **Expected vs actual:** one family of components with density variants · two unrelated kits that share only colour tokens.
- **Why it matters:** double maintenance; coach desktop inherits mobile patterns; neither side feels designed.
- **Direction:** one shell and one kit with comfortable (client) and compact (coach desktop) densities; shared type roles, icons and states.
- **Verified:** CODE-CONFIRMED

---

## Part B — Card audit (brief §11)

### B.1 How boxed each screen is

| Screen (390 unless noted) | Length | Probe card boxes (nested) | Static surfaces in code | Notes |
|---|---|---|---|---|
| Client Today | 2.8 screens | 18 (8) | 14 + 7 week-strip boxes + day-nav pill | Date shown 4×; four "0" tiles; START WORKOUT just above the nav (BV-16) |
| Client Cardio | 2.7 | 19 (0) | 4 + entry rows | 25/32 controls <44px |
| Client Fuel | 2.6 | 11 (0) | 12 + 1 per meal | Macro mini-cards inside the hero; red × per food (BV-39) |
| Client Progress (Strength tab) | — | — | 3 `card-featured` + 6 tiles | "Current" tile repeats the header (BV-37) |
| Client Assessment | 2.4 | 9 | 7 key/value cards | Raw key; "8/10" one char per line (BV-27) |
| Coach Dashboard | 2.8 (2.1 @1440) | 15 (21 @1440) | 14 | Checklist above triage; AT RISK hero (BV-24) |
| Coach Revenue | 2.6 | 15 (16 @1440) | 19 | 17 cards; hero repeated; tiles repeat donut (BV-23) |
| Coach client overview | 1.7 | 3 + 4 tiles + 3 nav cards | 10 | "10 WORKOUTS (7D)" wrong metric (BV-22) |
| Coach nutrition editor | 4.3 | 9 | 10 + 1 per meal | 62/91 controls <44px (BV-40) |
| Coach My Plan | 1.9 | 10 | — | — |

### B.2 Card types: inventory

| Card type (file) | Purpose · importance | Density · interaction · mobile | Hierarchy problem |
|---|---|---|---|
| Generic `.card` (`index.css:115`) | everything · — | — | border + fill + shadow on every container |
| Hero `.card-featured` (`index.css:132`): Today, Fuel, Progress ×3, Revenue, Settings identity | the one thing to do · high | medium · CTA · full width | overused; used for identity and secondary charts |
| KPI tiles: StatTile, MetricCard, HeroStat, TargetCell (DashboardCard unused) | a number · low–medium | 1 number + label · rarely tappable · 2-column grid | 4 implementations; same weight as tasks; zero/weak values |
| Today's plan + TaskRow (`Home.tsx:256-291`) | 3 pillars · high | good · rows tappable | duplicates the hero ring and its "N left" (`:220` vs `:259`) |
| Coach info + Coach note (`Home.tsx:295-296`) | coach contact, latest note · medium | 1 line each · tappable | two cards about one person; `info` icon as the affordance |
| Weekly goal (`Home.tsx:299-334`) | goal ring + streak · medium | low · tappable | second ring on the screen; goal 0/5 vs a 4-day plan (BV-16) |
| Week strip + day navigator (`WeekStrip.tsx`, `DayNav.tsx`) | date choice · medium | 7 boxed days + pill | two date controls; strip scrolls at 360/375px (probe) |
| Meal card (`Nutrition.tsx:300-546`) | log meals · high | high · many 32–40px icons | red × per row, edit/swap per row, notes per row |
| ExerciseCard (`ExerciseCard.tsx:52`) | live set logging · highest | high · inputs + toggles | nested notes box; 32px header icons; done = colour only |
| Coach attention list (`OverviewPanel.tsx:80-95`) | triage · highest | good · row + CTA | 5 of 6 rows say the same thing (BV-24) |
| QuickActionsGrid (`QuickActions.tsx:26-55`) | shortcuts · low | 1 label per card | duplicates the header CTA and nav |
| Coach overview nav cards (`CoachClientDetail.tsx:170-229`) | links · low | 2 lines · tappable | duplicate the workspace tabs (`evidence/coach-client-overview-1440.png`) |
| Boxed states (`EmptyState.tsx:30`, `ErrorState.tsx:18`, `WaitingForCoach.tsx:8`) | state · — | 1 line in py-10/12 | nest inside list cards; a huge box for one sentence |
| Settings row groups (`Settings.tsx:369,430`) | grouped settings · medium | rows | sound pattern (grouped list) |
| DetailPanel (`DetailPanel.tsx:27`) | desktop preview · medium | — | empty "Select a client" takes ~320px and pushes the table into overflow (BV-21) |

### B.3 Classification

| Element | What it is | Action | Why |
|---|---|---|---|
| `.card` default | container on every block | REDESIGN | → plain content on the page canvas; a box only to group rows or for one interactive object |
| Today hero | workout + ring + CTA | KEEP | the one hero; absorb today's-plan rows; drop the repeated date eyebrow |
| Today's plan card | 3 task rows | MERGE | → list rows inside the hero |
| This-week tiles (4) | weekly numbers | REMOVE | → one compact metric row, or nothing when zero |
| Coach info + coach note | two cards | MERGE | → one coach row (avatar, latest note, chat) |
| Weekly goal card | ring + streak | REDESIGN | → compact metric in the hero or Progress |
| Week strip + day navigator | two date pickers | MERGE | → one date control (see IA doc 16) |
| Revenue KPI tiles (13) + hero | money + status counts | MERGE | → hero + one breakdown list naming clients to act on (CO-16) |
| Dashboard metric grids (per tab) | repeated KPIs | REMOVE | → each KPI once, inline |
| QuickActionsGrid | shortcut cards | REMOVE | primary action in the header; the rest in menus |
| Coach overview nav cards | links to tabs | REMOVE | tabs already exist |
| Coach overview StatTiles | workouts, weight, notes, plans | REDESIGN | → compact metrics that answer a question; drop notes/plans counts |
| Meal cards | meal + foods + actions | REDESIGN | → section header + list rows; actions in edit mode |
| ExerciseCard | logging object | REDESIGN | → interactive card (the one legitimate card on the screen) |
| EmptyState / ErrorState cards | states | REDESIGN | → unboxed inline states |
| Settings identity hero | avatar + name | REDESIGN | → EntityHeader row |
| Settings row groups | grouped lists | KEEP | the grouped-list pattern is right |
| Attention list | triage rows | KEEP | → ListRow with one contextual action |

### B.4 Card rules for Phase B
1. The page canvas is the default container. A box must group ≥2 related rows, be an interactive object, or be the screen's single hero.
2. A container never contains another bordered container, including inside sheets and dialogs.
3. Each surface gets one boundary method: hairline *or* fill *or* elevation.
4. A number earns a tile only if it answers a question the user has on that screen. Zero states are one sentence.
5. Navigation never looks like content. Each destination has one route.

### B.5 Findings — cards

### CD-01 — Everything is a box: 10–19 bordered, shadowed surfaces per screen
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REDESIGN
- **Who / where:** client and coach · Today, Fuel, Cardio, Progress, Settings, Dashboard, Revenue, workspace · 390 and 1440
- **Evidence:**
  - Probe card counts (B.1): Today 18, Cardio 19, Dashboard 15 (21 @1440), Revenue 15.
  - `.card` = border + fill + 2-layer shadow (`index.css:115-117`).
  - Long screens: Today 2.8 screens (BV-16), dashboard 2.8 (BV-24).
- **Expected vs actual:** hierarchy from space, type and a few grouped containers · every element in its own outlined box.
- **Why it matters:** scanning means reading every box; key tasks compete with decoration and fall below the fold.
- **Direction:** apply the card rules (B.4); unboxed content by default; one hero.
- **Verified:** BROWSER-VERIFIED

### CD-02 — Four KPI-tile components and the same KPI in several places
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** MERGE
- **Who / where:** coach dashboard, Revenue, workspace; client Today, Progress, session summary · all
- **Evidence:**
  - Components: StatTile, MetricCard, HeroStat (`CoachDashboard.tsx:99-107`), TargetCell (`CoachClientDetail.tsx:327-345`); DashboardCard unused.
  - Revenue: 17 cards; the first KPI repeats the hero; 6 status tiles repeat the donut legend (BV-23; `AnalyticsPanel.tsx:28-31,70-91`; `CoachRevenue.tsx:37-42`).
  - Repeated KPIs:
    - Revenue is also in the dashboard header (`CoachDashboard.tsx:72`).
    - Check-ins and unread appear on both the Overview and Engagement tabs (`OverviewPanel.tsx:110-111`, `EngagementPanel.tsx:25-26`).
    - Adherence appears 3×.
- **Expected vs actual:** one Metric component; each KPI lives in one place · 4 components; KPIs repeated 2–3×.
- **Why it matters:** repetition and noise; the coach can't tell where the source of truth is.
- **Direction:** a Metric with inline-row, tile and hero variants; one home per KPI; status breakdown as one list that names the clients.
- **Verified:** BROWSER-VERIFIED (BV-23)

### CD-03 — Cards inside cards, and cards inside sheets
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client Fuel, session, Progress · coach lists, sheets · admin
- **Evidence:**
  - Fuel macro mini-cards inside the hero (`Nutrition.tsx:211`; BV-39).
  - 22 direct nestings found by AST scan, e.g.:
    - `ExerciseCard.tsx:101`
    - `ErrorState.tsx:19`
    - `AdminSubscriptions.tsx:102-105`
    - EmptyState inside MobileCardList (`ReportsPanel.tsx:93`, `AdminCoaches.tsx:214`)
  - Cards inside sheets: `Nutrition.tsx:763`, `CoachClientDetail.tsx:454`, `CoachClients.tsx:356,363`, `NavMenuSheet.tsx:73`.
  - Two cards glued together with `-mt-3 rounded-t-none` (`Progress.tsx:503-513`).
  - A double border (`CoachSubscriptionPanel.tsx:314`).
- **Expected vs actual:** inner grouping by spacing and dividers · boxes within boxes.
- **Why it matters:** visual weight doubles while content stays the same.
- **Direction:** rule 2 of B.4; the sheet is the surface.
- **Verified:** BROWSER-VERIFIED (BV-39, probe nesting)

### CD-04 — Equal visual weight for unequal importance
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client Today · coach dashboard and client overview · 390
- **Evidence:**
  - Today gives check-in, hero, plan, coach info, coach note, weekly goal, four zero tiles, chart and recent list the same box. START WORKOUT sits just above the nav (BV-16; `evidence/client-today-390-full.png`).
  - The dashboard puts the "Get started 1/3" card above "10 clients need you today". 5 of 6 attention rows are identical "Assessment awaiting your review" + REVIEW (BV-24; `evidence/coach-dashboard-390-full.png`).
  - Nav cards look like content (`CoachClientDetail.tsx:170-229`).
- **Expected vs actual:** the one task first, secondary compact · everything equal.
- **Why it matters:** the core loops (start the workout, triage clients) lose to decoration.
- **Direction:** one primary task per screen at the top; secondary info compact; triage grouped by reason.
- **Verified:** BROWSER-VERIFIED (BV-16, BV-24)

### CD-05 — Cards that hold one weak, zero or wrong number
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** client Today, Progress · coach client overview, Content tab, Revenue
- **Evidence:**
  - Four tiles on Today showing 0 / 0 / 0.0t / 0m (`Home.tsx:340-345`).
  - "1 NOTES" and "2 PLANS" tiles (`CoachClientDetail.tsx:142-147`).
  - "10 WORKOUTS (7D)", which counts the last 10 logs (BV-22).
  - A "Current 74.6kg" tile that repeats the header (BV-37).
  - MetricCards whose value is a text label, "Exercises"/"Foods" (`ContentPanel.tsx:24-25`).
  - Six "1" status tiles (BV-23).
- **Expected vs actual:** metrics only when they answer a question · tiles filled for symmetry.
- **Why it matters:** noise; wrong numbers erode trust in all numbers.
- **Direction:** remove; zero states as one sentence; correct metrics move to Metric rows.
- **Verified:** BROWSER-VERIFIED

### CD-06 — Big boxes with little in them
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client Settings, empty states · coach Quick actions, desktop clients
- **Evidence:**
  - A hero card for avatar + name (`Settings.tsx:286`; `evidence/client-settings-390-full.png`).
  - Boxed empty states with py-10/12 for one sentence (`EmptyState.tsx:30`, `WaitingForCoach.tsx:8`).
  - One-label QuickActions cards (`QuickActions.tsx:40-52`).
  - An empty "Select a client" panel of ~320px that pushes the table into overflow (BV-21; `evidence/coach-clients-1440.png`).
- **Expected vs actual:** containers sized to their content · large boxes for a line of text.
- **Why it matters:** wasted space on phones; an overflowing table on desktop.
- **Direction:** size to content; collapse empty side panels; inline empty states.
- **Verified:** BROWSER-VERIFIED (BV-21)

### CD-07 — Navigation disguised as cards (duplicate routes)
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** coach client overview · client Today, Settings
- **Evidence:**
  - Messages / Assessment / Check-in cards duplicate the workspace tabs (`CoachClientDetail.tsx:170-229`; `evidence/coach-client-overview-1440.png`).
  - Three routes to plan editing: View activity + Manage plan + Edit plan (`CoachClientDetail.tsx:151-167`, `CoachClientWorkspaceLayout.tsx:131`).
  - Two coach cards on Today (`Home.tsx:295-296`).
  - Legacy Tools cards (BV-18).
- **Expected vs actual:** one route per destination · several card links to the same place.
- **Why it matters:** visual clutter, plus decision cost on every visit.
- **Direction:** remove; the overview shows summaries with inline actions, per the IA doc 16.
- **Verified:** BROWSER-VERIFIED

### CD-08 — Border and repetition overload makes long screens unscannable
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach nutrition editor · client Fuel · 390
- **Evidence:**
  - The editor is 4.3 screens. Every meal repeats a name field + 5 slot chips + delete; 91 controls, 62 of them <44px (BV-40; `evidence/coach-client-nutrition-editor-390-full.png`).
  - Every Fuel food row has a divider + red × + edit/swap icons (BV-39).
  - Chips are bordered too (`.chip`).
- **Expected vs actual:** progressive disclosure; metadata collapsed · every control visible on every row.
- **Why it matters:** the coach's highest-effort screen is the hardest to scan.
- **Direction:** list rows with an edit mode / overflow menu; the meal slot as one select; collapse meal settings.
- **Verified:** BROWSER-VERIFIED (BV-39, BV-40)

### CD-09 — The featured (hero) card is overused and misapplied
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client Progress, Settings · coach dashboard, RoleAccount
- **Evidence:**
  - 3 `card-featured` on Progress (`Progress.tsx:262,350,421`); 2 on RoleAccount; one for identity on Settings (`Settings.tsx:286`). `index.css:129-131` says one per screen.
  - The dashboard "AT RISK" hero shows a client whose only issue is an assessment awaiting review (BV-24; CO-06).
- **Expected vs actual:** the hero marks the screen's one primary task · heroes for charts, identity and false alarms.
- **Why it matters:** the strongest emphasis tool is diluted, and sometimes points at the wrong thing.
- **Direction:** one hero per screen, reserved for the primary task; never for identity or analytics.
- **Verified:** BROWSER-VERIFIED (BV-24)
