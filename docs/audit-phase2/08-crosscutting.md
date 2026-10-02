# Phase 2 — Slice 08: Cross-cutting static checks

Scope: `src/` (React 18 + TS), read-only. Evidence is `file:line`. Helper scripts (read-only) were run from the OS scratchpad: `i18n-parity.mjs`, `a11y-scan.mjs`, `qm-scan.mjs`, `dist-scan.mjs`. `npm run build` was run once (exit 0, PWA precache 153 entries) to produce `dist/` for the secret scan.

Severity: P0 security/cross-user · P1 core action broken · P2 important edge case / misleading state · P3 polish/consistency.

---

## 1. §33 Frontend security sanity

### 1a. `import.meta.env` references (5 refs, all static + allow-listed)

| Ref | file:line | Verdict |
|---|---|---|
| `import.meta.env.VITE_GOOGLE_CLIENT_ID` | `src/components/GoogleSignInButton.tsx:46`, `:69` | OK — static, allow-listed |
| `import.meta.env.VITE_ANALYTICS_SRC` | `src/components/SiteAnalytics.tsx:21` | OK — static, allow-listed |
| `import.meta.env.DEV` | `src/components/SiteAnalytics.tsx:22` | OK — Vite built-in boolean |
| `import.meta.env.VITE_ANALYTICS_DATA` | `src/components/SiteAnalytics.tsx:29` | OK — static, allow-listed |
| comment only | `src/vite-env.d.ts:7`, `SiteAnalytics.tsx:18` | n/a |

No bare `import.meta.env` object, no dynamic `[key]` access. `dist/` contains 0 occurrences of the string `import.meta.env`.

### 1b. HTML sinks

| Sink | file:line | Content source | Verdict |
|---|---|---|---|
| `w.innerHTML = html` | `src/pages/experience/forma/ui.ts:337` | `PANELS` = static template functions in the same file (`ui.ts:320-329`) | OK — constant, no user data |
| `b.innerHTML = \`<span…>${c.label}\`` | `src/pages/experience/forma/director.ts:80` | `CHAPTERS` constant | OK |
| `chlabelEl.innerHTML = want` | `director.ts:532` | index + `ch.label` constant | OK |
| `railRoot.innerHTML = ''` | `director.ts:595` | clear | OK |
| `dangerouslySetInnerHTML` / `insertAdjacentHTML` / `DOMParser` / `srcdoc` / `eval` / `new Function` | — | 0 matches in `src/` | OK |

### 1c. User-controlled `href` / `src` / `window.open` / `navigate`

| Element | file:line | Value origin | Validation | Verdict |
|---|---|---|---|---|
| `<a href={b.ctaHref} target="_blank" rel="noreferrer">` | `src/components/BannerHost.tsx:91` | Admin-entered (`AdminBanners.tsx:178`, `TextInput type="url"` only — HTML `type=url` accepts `javascript:` URLs) | none at render | **X-1 (P2)** |
| `<a href={ex.videoUrl} target="_blank" rel="noopener noreferrer">` | `src/components/workout/ExerciseView.tsx:90`; `<video src={ex.videoUrl}>` `:41` | Coach-entered exercise `videoUrl` | none (`youtubeEmbed` only used for iframe) | **X-2 (P2)** |
| `<a href={asset.sourceUrl} target="_blank" rel="noreferrer">` | `src/components/VideoPlayerSheet.tsx:106`; `<video src={url}>` `src/components/VideoPopup.tsx:62` | same field via video store | none | **X-2** |
| `<iframe src={embed}>` | `VideoPopup.tsx:53-54`, `ExerciseView.tsx:29-31`, `VideoPlayerSheet.tsx:81` | `youtubeEmbed()` `src/services/video/VideoStore.ts:26-28` extracts exactly `[\w-]{11}` and rebuilds `https://www.youtube.com/embed/<id>` | safe — fixed origin, id charset restricted | OK (no open redirect / no `javascript:`) |
| `window.open(target.message.attachment!.url, "_blank", "noopener")` | `src/components/MessageThread.tsx:640`; `<a href={url} target="_blank" rel="noreferrer">` `:1252` | Server-returned upload URL (`mediaApi.ts:202-210 toResult(json.url)`), persisted in message doc | trusts backend | OK (backend-owned URL; add `noopener`, see X-3) |
| `<a href={img.url} target="_blank" rel="noreferrer">` | `src/pages/admin/AdminMedia.tsx:98` | `trpc.media.listImages` | trusts backend | OK / X-3 |
| `href={\`tel:${coach.phone}\`}` | `src/components/CoachInfoCard.tsx:71`, `CoachClientDetail.tsx:122` | phone string | scheme fixed | OK |
| `window.open(\`https://wa.me/?text=${encodeURIComponent(text)}\`)` | `src/pages/coach/CoachClients.tsx:440` | encoded | OK |
| `whatsappUrl()` / `emailUrl()` | `LandingFooter.tsx:37,40`, `WhatsAppFab.tsx:30`, `Experience.tsx:374-449` | constants | OK |
| `navigate(n.route ?? '/coach')` | `src/pages/Notifications.tsx:131,137,142`, `src/components/NotificationBell.tsx:76,90` | Server-written notification `route` | none; react-router `navigate()` is same-origin only (cannot leave origin) | OK (note) |
| `navigate(item.to)` / `navigate(to)` | `CoachChecklist.tsx:68`, `NavMenuSheet.tsx:27`, `CommandHost.tsx:41`, `BottomNav.tsx:24` | static route tables | OK |

### 1d. `target="_blank"` rel audit (9 occurrences)

| file:line | rel | Verdict |
|---|---|---|
| `LandingFooter.tsx:37`, `WhatsAppFab.tsx:31`, `ExerciseView.tsx:90` | `noopener noreferrer` | OK |
| `BannerHost.tsx:91`, `MessageThread.tsx:1252`, `VideoPlayerSheet.tsx:106`, `AdminMedia.tsx:98` | `noreferrer` only | **X-3 (P3)** — `noreferrer` implies `noopener` in current browsers, but spec asks for explicit `noopener` |

### 1e. Tokens / storage

| Item | file:line | Verdict |
|---|---|---|
| Access token in module memory only | `src/services/platformApi.ts:18-26` | OK |
| Refresh via httpOnly cookie, `credentials: 'include'`, raw fetch to `/api/trpc/auth.refresh` | `platformApi.ts:36-53` | OK |
| `sessionStorage` | `BannerHost.tsx:18,27` (dismissed banner ids), `ErrorBoundary.tsx:34-36` + `main.tsx:63` (chunk-reload guard) | OK — non-sensitive |
| `localStorage` | `MessageThread.tsx:492,500` (`forma.micPrimed`), `PresenceTracker.tsx:18-19` (per-day presence flag), `sidebarStore.ts:6` (UI pref) | OK — non-sensitive |
| `localforage` (IndexedDB) | `src/data/**` (local-only data layer), coach editor drafts `CoachCardioEditor.tsx:25`, `CoachNutritionEditor.tsx:27`, `CoachWorkoutTemplateEditor.tsx:18`, `CoachWorkoutEditor.tsx:23`, `AssessmentWizard.tsx:31`, `clientSync.ts:8` | OK — plan/assessment drafts, no credentials |
| Upload transport sends bearer from memory + `withCredentials` | `mediaApi.ts:120-157` | OK |

### 1f. Media

| Check | Result |
|---|---|
| `VITE_BUNNY*` / `bunnyUploadApi` / `BUNNY_` / `storage.bunnycdn` / `b-cdn` in `src/` | 0 code refs (2 doc comments: `mediaApi.ts:15`, `:97`) |
| Frontend constructs storage path | No — `mediaApi.ts:189-194` sends only `category` (+ `checkInId` / `clientId`); path derived server-side |
| `src/services/platform/bunnyUploadApi.ts` | deleted (git status `D`) |

### 1g. `dist/` secret scan (142 files, 3.2 MB scanned: js/html/css/json/webmanifest)

| Needle | Count |
|---|---|
| `VITE_BUNNY` | 0 |
| `BUNNY_API` | 0 |
| `BUNNY_STORAGE` | 0 |
| `AccessKey` | 0 |
| `MONGODB_URI` | 0 |
| `JWT_ACCESS` / `JWT_REFRESH` | 0 / 0 |
| `RESEND_API` | 0 |
| `CRON_SECRET` | 0 |
| `GOOGLE_CLIENT_SECRET` | 0 |
| `sk_live` | 0 |
| `mongodb+srv://` | 0 |
| `storage.bunnycdn.com` | 0 |
| `import.meta.env` | 0 |

`VITE_*` NAMES present in `dist/`: `VITE_ANALYTICS_SRC` only (name string; values not inspected).

### 1h. Security headers

| Source | What exists |
|---|---|
| `vercel.json:5-15` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, `Cache-Control: no-cache…` on `/(.*)`; asset/SW cache rules `:17-35` |
| `index.html` | No `<meta http-equiv="Content-Security-Policy">`; `lang="en"` static (runtime-updated by `src/i18n/index.ts:60-61`); Google Fonts preconnect/stylesheet `:21-26` |
| Not present | `Content-Security-Policy`, `Strict-Transport-Security` (Vercel adds HSTS on its own domains; not declared here). Note: `Permissions-Policy` sets `microphone=()` while `MessageThread` has a voice-note recorder (`MessageThread.tsx:487-500`, `:782`) — verify at runtime; reported only, no redesign proposed. |

---

## 2. §34 i18n interaction audit

### 2a. Parity (`i18n-parity.mjs`; no repo script exists in `scripts/`)

| Metric | en | ar | ar-eg |
|---|---|---|---|
| Leaf keys | 1966 | 1966 | 1966 |
| Missing vs en | — | 0 | 0 |
| Extra vs en | — | 0 | 0 |
| Empty values | 0 | 0 | 0 |
| Non-string values | 3 (`admin.permissionInfo.*.dangerous: true` — booleans by design) | 3 | 3 |
| `{{placeholder}}` mismatches vs en | — | 0 | 0 |
| Identical to en (possible untranslated) | — | 1 (`timeline.range` = `"{{from}} – {{to}}"`, format-only) | 1 (same) |
| ar-eg identical to ar | — | — | 901 / 1966 (46%) — inherited MSA, acceptable |

Note: the brief said 2129 keys; the files contain 1966 leaf keys each (parity holds either way).

### 2b. Hardcoded English on interactive controls (`a11y-scan.mjs`)

| Kind | file:line | Text | Verdict |
|---|---|---|---|
| `aria-label` | `src/components/DayNav.tsx:24` | `"previous day"` | **X-6 (P2)** |
| `aria-label` | `src/components/DayNav.tsx:38` | `"pick date"` | **X-6** |
| `aria-label` | `src/components/DayNav.tsx:52` | `"next day"` | **X-6** |
| `placeholder` | `src/pages/admin/AdminPlans.tsx:210` | `"growth"` (tier key example) | acceptable (example token) |
| `placeholder` | `src/pages/RoleAccount.tsx:121` | `"Africa/Cairo"` (IANA tz example) | acceptable |
| `placeholder` | `src/pages/VideoManager.tsx:122` | `"https://…/video.mp4"` | acceptable |
| button text | `src/components/workout/FoodSearchPicker.tsx:88-91`, `src/pages/coach/CoachExerciseLibrary.tsx:375-377`, `src/pages/coach/CoachNutritionEditor.tsx:241-246`, `:480-488`, `src/pages/Nutrition.tsx:762` | `"{cal} kcal · P{p} C{c} F{f}"` | **X-9 (P3)** — Latin macro abbreviations + `kcal` under Arabic UI |
| default prop | `src/components/charts.tsx:60,151,310` `emptyLabel = 'Not enough data yet'` | reached by `src/pages/admin/dashboard/OverviewPanel.tsx:141` (`<BarChart data={growth.data.signupSeries} />` — no `emptyLabel`, no `locale`) | **X-10 (P3)** |
| Link/NavLink text | — | 0 hardcoded | OK |

Hardcoded-control-string count (real): 4 attrs (3 aria-label + 1 default prop) + 6 macro-string buttons = 10; 3 placeholders judged acceptable.

### 2c. Backend enum rendered raw

| file:line | Expression | Verdict |
|---|---|---|
| `src/pages/admin/AdminAudit.tsx:104` | `t(log.action, { defaultValue: log.action.replace(/\./g, ' ') })` | **X-11 (P3)** raw action id shown whenever no key exists; also `:105` `toLocaleString()` without locale |
| `src/pages/admin/AdminCoachDetail.tsx:195`, `src/pages/coach/CoachPlan.tsx:126` | `t(\`coachPlan.hist.${h.action}\`, { defaultValue: h.action })` | fallback to raw enum only on unknown action — acceptable |
| `src/pages/coach/CoachViewPhotos.tsx:39`, `src/pages/ProgressPhotos.tsx:51` | `alt={p.pose}` / `alt={photo.pose}` | **X-11** raw enum in `alt` (`progress.${pose}` key exists, used at `ProgressPhotos.tsx:46`) |
| All `status`/`accountStatus`/`role`/`kind`/`type`/`state`/`goal`/`unit`/`placement`/`segment` renders (≈70 sites) | routed via `t(\`…${v}\`)` maps (e.g. `CoachClients.tsx:290`, `AdminAccounts.tsx:396`, `Settings.tsx:395`, `RoutineDetail.tsx:117`) | OK |
| `Cardio.tsx:193`, `CoachViewCardio.tsx:42` `{s.frequency}`; `ExerciseView.tsx:14` `ex.category/equipment`; `*.reason` | free text, not enums | OK |

Raw-enum count: 0 hard cases; 3 fallback/alt sites (X-11).

### 2d. Interpolation

| Check | Result |
|---|---|
| `t('literal.key')` keys missing from `en.json` | 0 |
| `t(key, {…})` where provided vars ≠ key placeholders | 1 — `src/pages/Settings.tsx:281` `t('gt.memberSince', { date })` but `en.json:661` = `"Member since {{date}} · {{unit}}"` → renders literal `{{unit}}` in all 3 languages → **X-7 (P2)** |
| keys with placeholders called without options | 0 |
| Cross-language placeholder mismatch | 0 (see 2a) |

### 2e. `LocalizedText` rendered as `.en` instead of `useLocalized()`

| file:line | Audience | Verdict |
|---|---|---|
| `src/pages/RoutineDetail.tsx:93` `ex.notes.en` | client | **X-8 (P2)** |
| `src/components/workout/ExerciseView.tsx:67-70` `ex.notes.en` | coach (view sheet) | X-8 |
| `src/pages/coach/ClientActivityView.tsx:176` `repl.name.en` | coach | X-8 (P3 part) |
| `src/pages/coach/CoachNutritionEditor.tsx:246,271,488` `f.name.en` / `meal.label.en` | coach | X-8 (P3 part) |
| `src/pages/coach/CoachExerciseLibrary.tsx:307,376,511,607` `f.name.en`, `s.dose.en`, `s.timing?.en` | coach | X-8 (P3 part) |
| `src/components/CommandHost.tsx:64` `f.name.en` | coach ⌘K | X-8 (P3 part) |
| `useLocalized()` used correctly | `ExerciseCard.tsx:36`, `Nutrition.tsx:26`, `CoachViewNutrition.tsx:16`, `ExerciseDetail.tsx:22`, `TrainingGuideSheet.tsx:63`, `CoachPlan.tsx:26`, `AdminCoachDetail.tsx:38`, `CoachPlanBanner.tsx:26`, `Pricing.tsx:17` | OK |

---

## 3. §29 Accessibility statics (`a11y-scan.mjs`, `src/**/*.tsx` excluding `experience/` and tests)

| Category | Count | Top files | Notes |
|---|---|---|---|
| Icon-only `<button>` without `aria-label`/`title`/text | 1 | `src/components/MessageThread.tsx:1240` (image attachment button; `<img alt={name ?? ""}>`) | **X-14 (P3)** |
| Raw `<input|select|textarea>` without `id`/`aria-label`/`aria-labelledby`/wrapping `<label>` | 94 | `Settings.tsx` (11), `coach/CoachSubscriptionPanel.tsx` (9), `onboarding/AssessmentWizard.tsx` (6), `workout/ExerciseForm.tsx` (5), `auth/AcceptInvite.tsx` (5), `workout/ExercisePickerSheet.tsx` (4), `Cardio.tsx` (4), `coach/CoachExerciseLibrary.tsx` (4) | **X-13 (P2)** — placeholder-only; shared `ui/Field.tsx` (`TextInput`/`SelectField`/`TextAreaField`/`SearchField`, lines 63-155) already wires `htmlFor`/`id`/`aria-describedby`/`aria-invalid`/`role="alert"` |
| `<div|span|img onClick>` without `role`+`tabIndex`+key handler | 10 | backdrops: `DialogHost.tsx:63`, `Sheet.tsx:104`, `VideoPopup.tsx:34`, `CommandPalette.tsx:114`, `ImageViewer.tsx:41` (all have Escape handlers → acceptable); `LanguageToggle.tsx:39` backdrop (no Escape → **X-16**); `ToastHost.tsx:54` (`role="status"` + onClick, no tab/key → **X-12 (P2)**); `ImageViewer.tsx:64` img zoom, `CoachViewPhotos.tsx:39`, `ProgressPhotos.tsx:51` img open (**X-17 (P3)**) |
| `<a onClick>` without `href` | 0 | | OK |
| `target="_blank"` without `noopener` | 4 | see 1d | X-3 |
| `aria-disabled` usage | 0 (all `disabled`) | consistent; offline-disabled buttons rely on `title` tooltips (`AdminCoaches.tsx:160`, `AdminCoachDetail.tsx:209,224`) which keyboard/touch users never see | note |
| Sheet without `title` (→ dialog without accessible name) | 0 | `Sheet.tsx:100-103` sets `aria-labelledby` only when `title` | OK |
| Dialog primitives | `DialogHost.tsx:55-62` `role="alertdialog" aria-modal aria-labelledby aria-describedby` + focus trap + restore (`:20-50`); `Sheet.tsx:98-103` `role="dialog" aria-modal` + trap (`:63-93`); `CommandPalette.tsx:113` `role="dialog" aria-modal aria-label` + Tab trap (`:57-75`) | OK |
| Overlays without dialog role | 2 — `VideoPopup.tsx:34-38`, `ImageViewer.tsx:41-52` (`fixed inset-0`, Escape handled, no `role="dialog"`/`aria-modal`/focus trap) | **X-18 (P3)** |
| Menus / popovers keyboard | `CommandPalette.tsx:94-109` ↑/↓/Enter/Esc ✓; `MessageThread` `FloatingActionMenu` Esc + outside click (`:1189-1209`) ✓ but no arrow-key roving; `LanguageToggle.tsx:26-52` no Esc, no `aria-expanded`/`aria-haspopup`/`aria-controls` (**X-16 (P3)**); `DesktopTopBar.tsx` has no menus (avatar is `Avatar` → `<button aria-label={name}>` `Avatar.tsx:40`) ✓ |
| ARIA structure | `CommandPalette.tsx:130-155` `<ul role="listbox">` → `<li>` (no role) → `<button role="option">`; input lacks `aria-controls`/`aria-activedescendant` (**X-15 (P3)**) |
| Form errors associated | `ui/Field.tsx:44-48,74-75` ✓; raw inputs (X-13) have none; `Settings`/`AcceptInvite` errors are free `<p>` |
| `Switch` | `ui/Switch.tsx:18-22` `role="switch" aria-checked aria-label` ✓ |
| `Tabs` | `ui/Tabs.tsx:52-64` `role="tablist"/"tab" aria-selected` ✓ (no arrow-key roving — P3 note) |
| Charts | `charts.tsx:83-87,224-228` sr-only lists; bars `tabIndex=0 role="img" aria-label` (`:109-111`) ✓ |
| Toast live region | `ToastHost.tsx:55-56` `role="status" aria-live="polite"` on the item itself (created already populated; host `:25` has no live region) | **X-27 (P3)** |

---

## 4. §28 RTL logic (static)

| Item | file:line | Mechanism | Verdict |
|---|---|---|---|
| `<html dir>` | `src/i18n/index.ts:25,56-62` (`RTL = ['ar','ar-eg']`, `html.dir`, `html.lang`) | ✓ | OK |
| Global CSS | `src/index.css:36-46` `html[dir='rtl']` font/letter-spacing | ✓ | OK |
| BarChart chronology | `src/components/charts.tsx:95-101` wrapper `dir="ltr"`; last bar = "now" | explicit LTR, oldest→newest regardless of page dir | OK |
| LineChart | `charts.tsx:216-221` wrapper `dir="ltr"`; x from date when all points dated (`:182-187`), else index | explicit; not re-sorted by date (path would zigzag if caller passes unsorted) | OK (P3 note: sort by date inside when `hasDates`) |
| DonutChart / ProgressRing / Spark | `charts.tsx:326` `rotate(-90deg)`, `ProgressRing.tsx:35 -rotate-90` | rotation symmetric | OK |
| Chart callers | `Home.tsx:354`, `Progress.tsx:294,366,435`, `CoachViewProgress.tsx:44`, `ExerciseDetail.tsx:182`, `AdminAnalytics.tsx:84`, admin `OverviewPanel.tsx:141` | pass arrays in data-layer order; `Progress.tsx:146` treats `weightLogs` as ascending | OK |
| Measurements tables | `Measurements.tsx:74,109`, `CoachViewMeasurements.tsx:61`, `CoachViewProgress.tsx:61` `dir="ltr"` on numeric grids | ✓ | OK |
| Back chevron (TopBar) | `TopBar.tsx:28,47,56` `rtl ? 'rotate-180'` | ✓ | OK |
| DayNav / CoachDayNav / ClientActivityView arrows | `DayNav.tsx:20-25,54`, `CoachDayNav.tsx:16,29`, `ClientActivityView.tsx:58,71` `i18n.dir()` | ✓ | OK |
| Sheet back chevron, Pagination | `Sheet.tsx:117`, `Pagination.tsx:46,61` `rotate-180 rtl:rotate-0` / `rtl:rotate-180` | ✓ | OK |
| Row chevrons (`rtl:rotate-180`) | `Home.tsx:193,326,383`, `Settings.tsx:423-459`, `CoachClientDetail.tsx:187,209,228,449`, `NavMenuSheet.tsx:51`, `TaskRow.tsx:55`, `ExerciseLibrary.tsx:99`, `Workout.tsx:99`, `WorkoutSession.tsx:398,407`, `CheckIn.tsx:119,212`, `CoachCheckInsOverview.tsx:186`, `coach/dashboard/parts.tsx:74`, `OverviewPanel.tsx:73`, `CoachClientWorkspaceLayout.tsx:110` | ✓ | OK |
| Search icon/padding | `ExerciseLibrary.tsx:66,69`, `WorkoutSession.tsx:512,516` `left-3 rtl:left-auto rtl:right-3`, `pl-10 rtl:pl-4 rtl:pr-10` | physical + overrides (works) vs `SearchField` logical `start-3 ps-10` (`Field.tsx:140,148`) | **X-19 (P3)** consistency |
| Sidebar collapse chevron | `shell/SidebarNav.tsx:110` `chevronLeft` + `collapsed ? 'rotate-180'` — no RTL flip | points wrong way when sidebar is on the right | **X-20 (P3)** |
| Nutrition "reset swap" chevron | `Nutrition.tsx:424-428` `rotate-180` no rtl variant | directional (undo) icon not flipped | X-20 |
| StatTile / MetricCard delta arrow | `StatTile.tsx:35`, `ui/MetricCard.tsx:60` `arrowUp` + `rotate-180` for down | vertical | OK |
| PlanBuilder move buttons | `PlanBuilder.tsx:466-469` `arrowUp` rotate for down | vertical | OK |
| Centered fixed bars | `ui/BulkActionBar.tsx:24`, `Hero.tsx:13`, `FinalCta.tsx:11` `left-1/2 -translate-x-1/2` | symmetric | OK |
| ChartTooltip | `charts.tsx:38-39` `left:%` + `-translate-x-1/2` inside `dir="ltr"` wrapper | OK |
| Message context menu | `MessageThread.tsx:1162-1176` resolves logical `align` to physical `left` using `document.dir` | ✓ | OK |
| ImageViewer | `ImageViewer.tsx:23-27` `ArrowRight → next`, `:46-50` swipe `dx<0 → next`; prev/next buttons `start-2`/`end-2` with un-flipped `chevronLeft`/`chevron` (`:73-78`) | not mirrored: in RTL the "previous" button sits at the physical right with a left-pointing icon; ArrowRight still means "next" | **X-21 (P3)** |
| Horizontal scroll containers | `ui/Tabs.tsx:55`, `CoachViewLayout.tsx:66`, `CoachExerciseLibrary.tsx:192` `overflow-x-auto` (no `scrollLeft` math anywhere: grep 0) | browser-native | OK |
| Swipe handlers | only `ImageViewer.tsx:45-51` (see X-21); `AvatarCropper.tsx:60,95` pointer drag (direction-neutral) | OK |
| AR inputs | `AdminPlans.tsx:150,286,290` `dir="rtl"`; phone/tz/url inputs `dir="ltr"` (`Settings.tsx:305`, `RoleAccount.tsx:117,121`, `AdminBanners.tsx:178`, `Login.tsx:127`, …) | ✓ | OK |
| Toast host | `ToastHost.tsx:26` `sm:end-4 sm:items-end`, `border-s-4` | logical | OK |

RTL issues: 3 (X-19, X-20, X-21), all P3.

---

## 5. §23 Empty states

`<EmptyState` occurrences: 80 across 32 files (incl. definition `ui/EmptyState.tsx:8`, wrappers `OfflineState.tsx:12`, `PermissionState.tsx:22`, `PlanBuilder.tsx:474`). Component API: `ui/EmptyState.tsx:8-41` (`title`, `message?`, `action?`, `tone`, `testId`).

### 5a. Inventory (page usages)

| file:line | Title key | Message key | Action → handler | Role / when | Verdict |
|---|---|---|---|---|---|
| `admin/AdminAccounts.tsx:301-306` | `admin.noAccounts` | `admin.noAccountsMessage` | Clear filters → reset search/role/status | admin, filtered | OK |
| `admin/AdminAssignments.tsx:246-251` | `admin.noClients` | `admin.noClientsMessage` | Clear filters | admin | OK |
| `admin/AdminAssignments.tsx:312` | `admin.noCoaches` | `admin.noCoachesMessage` | — | admin (assign sheet) | OK (nothing to do) |
| `ClientSubscriptionSection.tsx:52-57` | `subscription.noneTitle` | `noneBodyHasCoach`/`noneBodyNoCoach` | — | client | OK (coach-driven) |
| `admin/AdminBanners.tsx:78-83` | `adminBanners.loadFailed` | `…Message` | Retry → `q.refetch()` | admin, error | OK |
| `admin/AdminBanners.tsx:85` | `adminBanners.empty` | `emptyHint` | — (header "+" exists) | admin | OK |
| `admin/AdminAudit.tsx:90-95` | `admin.auditLoadFailed` | `…Message` | Retry → `audit.refetch()` | admin, error | OK |
| `admin/AdminAudit.tsx:112` | `admin.noLogs` | — | — | admin | OK |
| `admin/AdminCoaches.tsx:196` | `adminCoaches.none` | `noneMessage` | — | super_admin | OK |
| `admin/AdminMembers.tsx:197` | `adminMembers.noMembers` | — | — | admin, filtered | P3: no Clear-filters CTA (filters exist `:89-98`) |
| `admin/AdminSubscriptions.tsx:103,113` | `admin.noRequests` | — | — | super_admin | OK |
| `admin/AdminSubscriptions.tsx:146,156` | `adminPlans.none` | — | — | super_admin | OK |
| `admin/dashboard/OverviewPanel.tsx:79` | `admin.nothingToReview` | — | — | admin | OK (but see X-25: shown on fetch error) |
| `admin/dashboard/OverviewPanel.tsx:135` | `admin.noLogs` | — | — | admin | OK |
| `admin/AdminMedia.tsx:77` | `upload.notConfigured` | — | — | super_admin | OK |
| `admin/AdminMedia.tsx:81-86` | `adminMedia.loadFailed` | `…Message` | Retry → `images.refetch()` | error | OK |
| `admin/AdminMedia.tsx:88` | `adminMedia.empty` | `emptyMessage` | — | | OK |
| `CheckInHistory.tsx:39` | `checkin.noCheckins` | — | — | client | **X-23 (P3)** no message/CTA (coach initiates; say so) |
| `ExerciseLibrary.tsx:81-85` | `exerciseLibrary.noResultsTitle` | `noResultsMessage` | Clear filters (only when filtered) | client | OK |
| `PlanBuilder.tsx:256,353,388` | `coachEditor.emptyExercises/emptySections/emptyDays` | — | — (add buttons live in toolbar) | coach editor | OK |
| `coach/CoachMessages.tsx:145-149` | `coach.noClientsTitle` | `noClientsMessage` | Add client → `/coach/clients` | coach | OK |
| `coach/CoachMessages.tsx:155-159` | `search.noResults` | `messages.noResultsMessage` | Clear filters | coach | OK |
| `coach/CoachExerciseLibrary.tsx:218-222` (exercises) | `coachLib.empty` / `noResults` | — | Clear filters only when searching; **no CTA when truly empty** | coach | **X-22 (P2)** |
| `coach/CoachExerciseLibrary.tsx:365-369` (foods) | `coachFoods.empty` | — | `LoadStarterLibraryButton` | coach | OK |
| `coach/CoachExerciseLibrary.tsx:490` (groups) | `coachFoods.noGroups` | `noGroupsMessage` | `LoadStarterLibraryButton` | coach | OK |
| `coach/CoachExerciseLibrary.tsx:594-598` (supps) | `coachSupps.empty` | — | `LoadStarterLibraryButton` | coach | OK |
| `coach/CoachTemplates.tsx:66` | `starter.emptyTitle` | `emptyHint` | `LoadStarterLibraryButton` | coach | OK (header "+" `:57`) |
| `coach/CoachTemplates.tsx:84-88` | `coachLib.noResults` | — | Clear filters | coach | OK |
| `coach/CoachTemplatePreview.tsx:57` | `workoutTemplate.empty` | — | — | coach | OK |
| `coach/dashboard/AnalyticsPanel.tsx:42`, `OverviewPanel.tsx:117` | `coachDash.noRenewals` | — | — | coach | OK |
| `coach/dashboard/ClientsPanel.tsx:30,42`, `OverviewPanel.tsx:82` | `coachDash.allGood/allActive` | — | — | coach (positive) | OK |
| `coach/dashboard/ReportsPanel.tsx:93` | `coachDash.noClients` | — | — | coach | P3: no Add-client CTA |
| `coach/CoachCheckInsOverview.tsx:149-153` | `coachDash.noClients` | `noClientsCheckinsMessage` | Add client → `/coach/clients` | coach | OK |
| `coach/CoachCheckIns.tsx:68` | `checkin.noCheckins` | `noCheckinsCoachMessage` | — (Request button at `:59`) | coach | OK |
| `coach/CoachClientNotes.tsx:49` | `coach.noNotes` | — | Add note → open sheet | coach | OK |
| `coach/CoachClients.tsx:144-153` | `coach.noClientsTitle` / filtered variant | messages | Add client (`openAdd`) / Clear filters | coach | OK (see X-25 for error case) |
| `Messages.tsx:33` | `clientCoach.noCoachTitle` | `noCoachMessage` | — | client | OK (cannot self-assign) |
| `ProgressPhotos.tsx:202` | `progressPhotos.emptyTitle` | `emptyMessage` | — (capture UI above) | client | OK |
| `ui/OfflineState.tsx:12-16` | `state.offlineTitle` | `offlineBody` | retry action prop | any | OK |
| `ui/PermissionState.tsx:22-26` | `state.permissionTitle` | `permissionBody` | optional | any | OK |

### 5b. Ad-hoc empty branches (text without the component) — 18

`Cardio.tsx:264` (`cardio.noLogsYet`), `History.tsx:138` (`progress.noData`), `Workout.tsx:105` (`workout.dayEmpty`), `Measurements.tsx:118-120`, `Progress.tsx:377,516`, `Notifications.tsx:155`, `MessageThread.tsx:668` (`messages.noMessages`, composer present → OK), `coach/AddExistingClient.tsx:177-178`, `coach/CoachAdherence.tsx:76` (`coach.noClients`, no CTA), `coach/CoachAssessments.tsx:59` (`coachDash.noClients`, no CTA), `admin/AdminPlans.tsx:176`, `coach/CoachSubscriptionPlans.tsx:84`, `coach/CoachViewPhotos.tsx:27`, `coach/CoachViewProgress.tsx:76`, `coach/CoachViewMeasurements.tsx:88`, `coach/CoachViewCardio.tsx:29,56`, `coach/ClientSwitcherSheet.tsx:51`, `coach/CoachMessages.tsx:116`, `coach/CoachClients.tsx:466` (`invite.none`), `TransferWizard.tsx:165`, `AssignTemplate.tsx:46,58`, `ui/CommandPalette.tsx:132`, `ui/DataTable.tsx:81-83` (`empty` string prop). → **X-24 (P3)**.

Spec list check: no clients ✓ (CTA), no plan — client `Workout.tsx` only has per-day `workout.dayEmpty`; no plan-level empty found in `Workout/Nutrition/Cardio` (client cannot act → informational only; not flagged), no messages ✓, no library items ✗ (X-22), no foods ✓, no templates ✓, no check-ins ~ (X-23), no progress (plain text, `CoachViewProgress.tsx:76`) X-24, no reports (`ReportsPanel.tsx:93` no CTA) X-24, no pending payments — no such surface (`CoachRevenue.tsx` reuses `AnalyticsPanel`; `admin.noRequests` covers plan requests). CTAs a role cannot use: none found (all CTAs navigate within the same role's routes).

---

## 6. §24/§25 Loading / error / retry & toast patterns

### 6a. Global counts (`qm-scan.mjs`)

| Metric | Count |
|---|---|
| `useQuery(` instances | 140 (73 files) |
| Query instances whose `isError`/`error`/`status` is never read in the file | **131** |
| Files reading `isError`/`.error`/`<ErrorState>` | 20 files / 35 refs |
| Queries rendering `isLoading`/`isPending` with no error branch (spinner-then-nothing / spinner-then-empty) | **54** |
| QueryClient defaults | `src/services/platform/queryClient.ts:9-15` staleTime/gcTime only — no `QueryCache.onError`, no `throwOnError` (grep 0) |
| `useMutation(` instances | 92 (37 files) |
| Mutations without `onError`/`onSettled` | 24 flagged; 14 surface errors via `x.isError` rendering (`ClientSubscriptionSection.tsx:89,113`, `CheckIn.tsx:210`, `VersionActions.tsx:95`, `CoachCardioEditor.tsx:209`, `CoachNutritionEditor.tsx:308`, `CoachWorkoutEditor.tsx:110`, `CoachWorkoutTemplateEditor.tsx:98`, `CoachSubscriptionPanel.tsx:251,265,274,285`) or a caller try/catch (`MeasurementForm.tsx:81-88` for `CoachViewMeasurements.tsx:27`); `AdminCoaches.tsx:85` is a scanner false positive (`onError` at `:96`) |
| **Silent mutations** (no `onError`, no `isError` render, no try/catch) | **10** — `coach/CoachClientAssessment.tsx:45` (`saveNotes`), `:46` (`review`), `:47` (`reopen`); `coach/CoachClientDetail.tsx:52` (`release`), `:362` (add note `mut`); `coach/CoachViewLayout.tsx:46` (`addNote`); `coach/CoachSubscriptionPlans.tsx:41` (`save`), `:56` (`remove`); `coach/PlanVersionHistory.tsx:51` (`restore`, also no success feedback); `workout/ExercisePickerSheet.tsx:105` (`create`) → **X-26 (P2)** |
| `mutateAsync` without catch | 0 |
| Success toast/state fired before resolution | 0 (all toasts live in `onSuccess`; `release` navigates in `onSuccess` `CoachClientDetail.tsx:54-59`) |
| Duplicate toasts (same key in `onSuccess` + after await) | 0 |

### 6b. `showToast(` inventory — 68 real calls (+1 doc comment `stores/toastStore.ts:6`)

| Variant | Count | Notes |
|---|---|---|
| `success` | 62 | |
| `warning` | 3 | `PlanBuilder.tsx:171`, `CoachExerciseLibrary.tsx:117,138` |
| `info` | 1 | `NotificationBell.tsx:80-92` (deep-link toast, `key: n.id` dedupe) |
| dynamic | 2 | `AdminAccounts.tsx:196`, `AdminCoaches.tsx:116` (bulk done: variant from result) |
| `danger` | 0 | errors go through `alertDialog` / inline `isError` — consistent |

Toast store: `stores/toastStore.ts:50-71` dedupe by `key`, stack capped at 4. ToastHost countdown: `src/components/ToastHost.tsx:15` `AUTO_DISMISS_MS = 5000`; timer `:42-45`; visual countdown bar `:63-67` (`.toast-timer`, `animationDuration: 5000ms`, `aria-hidden`). No pause-on-hover/focus; clickable toasts are `<div role="status" onClick>` (`:54-62`) → X-12 / X-27.

### 6c. Outliers

| Pattern | file:line | Verdict |
|---|---|---|
| Permanent spinner on error | `coach/CoachRevenue.tsx:30-31` `!d ? <LoadingState/>` (also when `coachId` missing) | **X-25 (P2)** |
| Error rendered as "empty + CTA" | `coach/CoachClients.tsx:265-268` (→ "No clients yet / Add client"), `coach/CoachTemplates.tsx:63-66` (→ "Load starter library"), `coach/CoachExerciseLibrary.tsx:199-222`, `coach/CoachMessages.tsx:144-149`, `admin/AdminMembers.tsx:196-197`, `CheckInHistory.tsx:38-39`, `coach/CoachAdherence.tsx:75-76`, `coach/CoachAssessments.tsx:58-59` | X-25 |
| Error rendered as "healthy" | `admin/dashboard/OverviewPanel.tsx:37-42,51` (`planReqs`/`transferReqs`/`coaches` errors → `needsReview=[]` → `admin.platformHealthy`; `:79` "nothing to review") | X-25 |
| Multi-query detail pages with zero error handling | `coach/CoachClientDetail.tsx:63-108` (8 queries), `admin/AdminClientDetail.tsx:25-29` (5), `admin/AdminCoachDetail.tsx:48-57` (5), `hooks/useCoachClientHeader.ts:29-33` (5) | X-25 |
| Good patterns (reference) | `admin/AdminBanners.tsx:78-83`, `admin/AdminAudit.tsx:90-95`, `admin/AdminMedia.tsx:80-86`, `admin/AdminAnalytics.tsx:94,108` (`isError` → retry/`errorGeneric`) | OK |

---

## FINDINGS

| ID | Sev | file:line | Defect | Proposed fix |
|---|---|---|---|---|
| X-1 | P2 | `src/components/BannerHost.tsx:91`; `src/pages/admin/AdminBanners.tsx:178` | Admin-entered `ctaHref` rendered into `<a href>` with no scheme check (`type="url"` accepts `javascript:`/`data:`); admin-authored XSS/phishing surface shown to all clients/coaches | Add `isSafeHttpUrl(u)` (`^https?://` or `/`-relative) in `src/lib/`; validate in the banner form (block save) and skip rendering the link in `BannerHost` when invalid; `rel="noopener noreferrer"` |
| X-2 | P2 | `src/components/workout/ExerciseView.tsx:41,90`; `src/components/VideoPlayerSheet.tsx:106`; `src/components/VideoPopup.tsx:62` | Coach-entered `videoUrl`/`sourceUrl` used raw in `href`/`<video src>` — `javascript:` href possible; only YouTube ids are sanitised (`VideoStore.ts:26-28`) | Extend `detectKind()` (`VideoStore.ts:17-23`) to return `'unknown'` for non-`http(s)` schemes and gate the anchor/video on `kind !== 'unknown'`; validate in `ExerciseForm` on save |
| X-3 | P3 | `BannerHost.tsx:91`, `MessageThread.tsx:1252`, `VideoPlayerSheet.tsx:106`, `AdminMedia.tsx:98` | `target="_blank"` with `rel="noreferrer"` only | `rel="noopener noreferrer"` |
| X-6 | P2 | `src/components/DayNav.tsx:24,38,52` | Hardcoded English `aria-label`s ("previous day", "pick date", "next day") on the date navigator used by every client day page | `t('common.previous')` / new `daynav.pickDate` / `t('common.next')` (keys exist at `ImageViewer.tsx:73,76`) |
| X-7 | P2 | `src/pages/Settings.tsx:281`; `src/i18n/en.json:661` (+ar/ar-eg) | `t('gt.memberSince', { date })` but key is `"Member since {{date}} · {{unit}}"` → literal `{{unit}}` rendered in the profile header in all languages | Drop `· {{unit}}` from the three JSON files (or pass `unit`) |
| X-8 | P2 | `src/pages/RoutineDetail.tsx:93` (client); `src/components/workout/ExerciseView.tsx:67-70`; `ClientActivityView.tsx:176`; `CoachNutritionEditor.tsx:246,271,488`; `CoachExerciseLibrary.tsx:307,376,511,607`; `CommandHost.tsx:64` | `LocalizedText` rendered as `.en` regardless of locale (Arabic client sees English exercise notes; Arabic coach sees English food/supplement names) | Use `useLocalized()` (`src/hooks/useLocalized.ts:5`) — P2 for `RoutineDetail`, P3 for coach lists |
| X-9 | P3 | `FoodSearchPicker.tsx:88-91`, `CoachExerciseLibrary.tsx:375-377`, `CoachNutritionEditor.tsx:241-246,480-488`, `Nutrition.tsx:762` | Macro line `"{cal} kcal · P{p} C{c} F{f}"` hardcoded (Latin abbreviations under Arabic UI) | Single `t('nutrition.macroLine', {cal,p,c,f})` key + `common.kcal` |
| X-10 | P3 | `src/components/charts.tsx:60,151,310`; `src/pages/admin/dashboard/OverviewPanel.tsx:141` | English default `emptyLabel='Not enough data yet'` and default `locale='en'` reach the admin growth chart (no `emptyLabel`/`locale` passed) | Pass `emptyLabel={t('progress.noData')} locale={i18n.language}`; make the prop required |
| X-11 | P3 | `src/pages/admin/AdminAudit.tsx:104-105`; `CoachViewPhotos.tsx:39`; `ProgressPhotos.tsx:51` | Raw backend action id used as i18n key with raw fallback; `toLocaleString()` without locale; raw `pose` enum in `alt` | Map via `audit.actions.<id>` with generic fallback; `toLocaleString(i18n.language)`; `alt={t(\`progress.${pose}\`)}` |
| X-12 | P2 | `src/components/ToastHost.tsx:54-62`; `src/components/NotificationBell.tsx:88-91` | Clickable toast (deep-link to the notification) is a `<div role="status" onClick>` — no `tabIndex`/key handler → mouse-only | Render an inner `<button>` (or `role="button" tabIndex={0}` + Enter/Space) for `toast.onClick` |
| X-13 | P2 | 94 sites; top: `Settings.tsx` (11), `coach/CoachSubscriptionPanel.tsx` (9), `onboarding/AssessmentWizard.tsx` (6), `workout/ExerciseForm.tsx` (5), `auth/AcceptInvite.tsx` (5), `workout/ExercisePickerSheet.tsx` (4), `Cardio.tsx` (4), `coach/CoachExerciseLibrary.tsx` (4) | Raw `<input|select|textarea>` with placeholder-only labelling (no `id`/label/`aria-label`); errors not associated | Migrate to `TextInput`/`SelectField`/`TextAreaField`/`SearchField` (`src/components/ui/Field.tsx`) or add `aria-label`; client-facing auth/onboarding first |
| X-14 | P3 | `src/components/MessageThread.tsx:1240-1242` | Image-attachment button has no accessible name when `name` is empty | `aria-label={t('messages.openAttachment')}` |
| X-15 | P3 | `src/components/ui/CommandPalette.tsx:119-127,130-155` | `role="listbox"` contains role-less `<li>` wrapping `role="option"` buttons; input lacks `aria-controls`/`aria-activedescendant`/`aria-expanded` | `role="presentation"` on `<li>`, ids on options, `aria-activedescendant` on the input |
| X-16 | P3 | `src/components/LanguageToggle.tsx:26-52` | Language menu: no Escape close, trigger lacks `aria-expanded`/`aria-haspopup`, backdrop is a bare `<div onClick>` | Add keydown Escape + `aria-expanded`/`aria-haspopup="menu"`; `role="menu"`/`menuitem` |
| X-17 | P3 | `src/components/ImageViewer.tsx:64-69`; `src/pages/coach/CoachViewPhotos.tsx:39`; `src/pages/ProgressPhotos.tsx:51` | `<img onClick>` (zoom / open viewer) not keyboard reachable | Wrap in `<button type="button" aria-label=…>` |
| X-18 | P3 | `src/components/VideoPopup.tsx:34-38`; `src/components/ImageViewer.tsx:41-52` | Full-screen overlays without `role="dialog"`/`aria-modal`/focus trap (Escape works) | Add `role="dialog" aria-modal="true" aria-label`, move focus in/out like `Sheet.tsx:63-93` |
| X-19 | P3 | `src/pages/ExerciseLibrary.tsx:66-69`; `src/pages/WorkoutSession.tsx:512-516` | Search icon/padding use physical `left-3 rtl:right-3` / `pl-10 rtl:pr-10` instead of the logical pattern in `SearchField` | Use `SearchField` or `start-3`/`ps-10` |
| X-20 | P3 | `src/components/shell/SidebarNav.tsx:110`; `src/pages/Nutrition.tsx:424-428` | Directional chevrons (`chevronLeft` collapse toggle; swap-reset arrow) rotated with no RTL variant | `rtl:rotate-0`/`rtl:rotate-180` or `i18n.dir()` conditional as in `TopBar.tsx:47` |
| X-21 | P3 | `src/components/ImageViewer.tsx:23-27,45-51,73-78` | Prev/next not mirrored in RTL: ArrowRight = next, swipe-left = next, prev button at `start-2` shows left chevron | Flip key/swipe direction and icon rotation when `document.dir === 'rtl'` |
| X-22 | P2 | `src/pages/coach/CoachExerciseLibrary.tsx:217-222` | Exercises tab true-empty state has no CTA (foods/groups/supps tabs at `:368,:490,:597` offer `LoadStarterLibraryButton`); new coach lands on a dead end | `action={<><LoadStarterLibraryButton variant="ghost"/><button onClick={() => setEditing(blankExercise())}>{t('coachLib.newExercise')}</button></>}` |
| X-23 | P3 | `src/pages/CheckInHistory.tsx:39` | Client "no check-ins" has no message (coach-initiated flow) | Add `message={t('checkin.noCheckinsClientMessage')}` (new key ×3) |
| X-24 | P3 | 18 ad-hoc `<p>` empty branches (5b), notably `coach/CoachAdherence.tsx:76`, `coach/CoachAssessments.tsx:59` (no Add-client CTA), `coach/dashboard/ReportsPanel.tsx:93`, `coach/CoachViewProgress.tsx:76`, `admin/AdminMembers.tsx:197` (no Clear-filters) | Inconsistent empty states / missing CTAs | Replace with `<EmptyState>` + the same CTA used in `CoachMessages.tsx:149` |
| X-25 | P2 | `coach/CoachRevenue.tsx:30-31`; `coach/CoachClients.tsx:265-268`; `coach/CoachTemplates.tsx:63-66`; `coach/CoachExerciseLibrary.tsx:199-222`; `coach/CoachMessages.tsx:144-149`; `admin/AdminMembers.tsx:196-197`; `CheckInHistory.tsx:38-39`; `admin/dashboard/OverviewPanel.tsx:37-51`; `coach/CoachClientDetail.tsx:63-108`; `admin/AdminClientDetail.tsx:25-29`; `admin/AdminCoachDetail.tsx:48-57` (131/140 queries never read `isError`; 54 spinner-with-no-error-branch) | Fetch failures render as permanent skeleton, as "empty + CTA" ("No clients — Add client", "Load starter library"), or as "Platform healthy" | Add `isError` → `<ErrorState onRetry={refetch}>` branch before empty checks (pattern: `AdminBanners.tsx:78-83`); consider a `QueryCache.onError` toast in `queryClient.ts:9` as a global backstop |
| X-26 | P2 | `coach/CoachClientAssessment.tsx:45-47`; `coach/CoachClientDetail.tsx:52,362`; `coach/CoachViewLayout.tsx:46`; `coach/CoachSubscriptionPlans.tsx:41,56`; `coach/PlanVersionHistory.tsx:51`; `workout/ExercisePickerSheet.tsx:105` | 10 mutations with no `onError`, no `isError` render, no try/catch — failure is silent (button re-enables, sheet stays open, nothing else) | Add `onError: (e) => alertDialog({ title, message: e.message ?? t('common.errorGeneric') })` (pattern `AdminMembers.tsx:86`); `restore` also needs a success toast |
| X-27 | P3 | `src/components/ToastHost.tsx:25-29,42-45,55-56` | Auto-dismiss 5 s with no pause on hover/focus; live region created already populated (host lacks `aria-live`) | Pause timer on `mouseenter`/`focusin`; put `aria-live="polite"` on the persistent host container |

(IDs X-4 / X-5 intentionally unused: storage and headers reviewed with no defect.)
