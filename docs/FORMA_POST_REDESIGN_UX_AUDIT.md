# Forma — Post-Redesign Product UX Audit

Audit date: 2026-09-18 · Scope: the real Forma app (Client, Coach, Admin/Super Admin) after the three-role visual
redesign · Method: full read of the source (routes, pages, components, stores, API layer, i18n, PWA config) by six
parallel exploration passes plus direct verification of every P0 in code. No browser-based visual capture was
available in this environment, so viewport findings are derived from the actual breakpoints in code
(`ResponsiveShell` switches chrome at 768px; every data layout switches at 1024px via `useIsDesktop`; the client shell
is a fixed `max-w-md` column). 430px behaves as 390px, 1440px behaves as 1280px, and 768–1023px is its own tier.

This is a product audit, not a prototype-conformance check. Where the prototype itself creates friction, it is
called out. The prototype was the design target; the product is what is judged here.

**ID prefixes:** `X` cross-role/systemic · `C` client · `K` coach · `A` admin/super admin · `N` navigation/back ·
`M` messenger · `P` PWA/device · `Y` accessibility · `F` performance · `V` charts.
**Categories:** BUG · UX ISSUE · RESPONSIVE ISSUE · ACCESSIBILITY · PRODUCT IMPROVEMENT · PERFORMANCE · MISSING STATE ·
NAVIGATION ISSUE · DEVICE/PWA ISSUE.
**Priority:** P0 blocks a task / broken / data risk · P1 major friction · P2 meaningful improvement · P3 polish.
**Viewport column:** `all` · `≤767` (phone; 390/430) · `768–1023` (tablet) · `≥1024` (desktop; 1280/1440) · a specific
width when the finding is width-specific.

---

## 1. Executive summary

The redesign landed the visual system consistently across all three roles: one token set, one card/row/pill/button
vocabulary, real split-panes on desktop, and every screen reads as one product. The visual layer is not the problem.
The product layer underneath it still has the shape of an app that grew feature by feature: **feedback is
write-only, back buttons guess where you came from, commands are 34px chips, several one-tap actions are
irreversible, and the primitives that would fix most of this already exist in the codebase but are bypassed.**

### The 12 P0s (blocking / broken / data risk)

| ID | Role | What | Where |
|---|---|---|---|
| C13 | Client | "Forgot password" says a reset link was sent; production never sends it and no reset page exists → permanent lockout | `api/_trpc/routers/auth.ts:177-207`, `AnonymousApp.tsx:27-40` |
| C14 | Client | Any client without an assigned coach is walled on Home/Workout/Nutrition/Cardio by the subscription gate, whose only CTA lands on "Sign in to see updates from your coach" | `lib/subscription.ts:34`, `useSubscription.ts:17`, `SubscriptionGate.tsx`, `Messages.tsx:26` |
| C1 | Client | Finish-workout sheet's "Discard" deletes the whole session on one tap, no confirm | `WorkoutSession.tsx:478,193-197` |
| K12 | Coach | Assigning a template overwrites the client's live plan on one row tap, no confirm, no version snapshot | `AssignTemplate.tsx:52`, `coachAssetsApi.ts:121-138` |
| K13 | Coach | One-tap irreversible: transfer Approve (releases your client), "+30 days" Extend, Release-from-search, section/exercise/food/session delete, "Send reminders" to everyone | see §16 |
| K14 | Coach | Nutrition and Cardio editors have no draft, no dirty flag, no exit guard and no back button — any tab or back loses the whole plan | `CoachNutritionEditor.tsx:59-103`, `CoachCardioEditor.tsx:31-70` |
| K11 | Coach | The mobile client list is a phonebook (name/email/status) because the dashboard query is desktop-only; the command palette has zero clients on mobile | `CoachClients.tsx:85`, `CommandHost.tsx:29-37` |
| K16 | Coach | ~5 taps per exercise when building a day (picker closes after every pick, no inline sets/reps) | `ExercisePickerSheet.tsx:81`, `PlanBuilder.tsx:210` |
| A7 | Admin | Transfer wizard defaults to the destructive "Fresh Start" mode, labelled "Recommended", no final confirm | `TransferWizard.tsx:41,159-199` |
| A8 | Admin | Accounts search/filters only cover the pages already loaded by infinite scroll → false "No accounts found" | `AdminAccounts.tsx:85-101` |
| P1 | All | Service worker `skipWaiting:true` + no update prompt + no error boundary → blank screen after a deploy when a stale lazy chunk 404s | `vite.config.ts:16,59-60`, `main.tsx:16-44` |
| Y1 | All | `text-earth-subtle` (#7C726C) fails WCAG AA on every surface (3.8–4.2:1) and is used ~264 times at 10–13px | `theme/colors.ts:18`, `index.css` |

Also P0 by scale: **F1** (all three locale JSONs — ~246KB — inlined in the eager entry bundle), **F2** (`listMyClients`
is an N+1 that backs four screens; coach inbox runs one poller per client thread).

### Five systemic themes

1. **Feedback is write-only.** A full toast system, `LoadingState`, `EmptyState`, `Field.error`, `Sheet.footer` and
   `SubmitButton`-shaped patterns exist; almost nothing uses them. Saves grey a button and then nothing happens. ~50
   screens show the *button label* "Working…" as their page loader.
2. **Commands are 34px.** `.chip` (34px) is the control for Suspend/Reactivate/Renew/Set limit/feature-flag toggles;
   `.btn-sm` is 34px; `.icon-btn` has no intrinsic size and is used at 32–36px; `.sec-link` is bare text. Only `.btn`
   (48px) meets 44px.
3. **Back buttons guess.** Seventeen screens hard-code their back target regardless of how they were reached, so
   in-app back and browser back diverge; workspace tabs push history; the client `*` route never redirects.
4. **One tap is irreversible** in at least nine places across coach and admin (approve transfer, extend term,
   assign template, delete section, toggle a global feature flag, clear an end date…).
5. **The prototype's mobile IA was imported literally where it hurts:** an 11-tab horizontal rail, a 5-card
   Quick-Actions grid, a three-KPI hero followed by a six-KPI grid of the same numbers, a Home screen that describes
   the same week three times.

### One honest note

**A6** — the admin redesign round (commit `6738692`) deleted `GrowthPanel` and lost real data that nothing renders
any more: client-subscription MRR (and the coach+client total), the "client subscriptions ending within 7 days" list
with urgency, and the members week-over-week delta. It is listed as a P1 regression with a safe fix (restore the
sections in `AdminSubscriptions` from the already-fetched `fetchGrowth`).

---

## 2. Overall product UX assessment

**Client.** The daily loop (Today → Train → log a set; Fuel → tick a meal) is short and mostly good: planned-meal
logging is two taps, the live set grid has 44px inputs and haptics, the check-in wizard is a real wizard. The
problems are at the edges: onboarding is 8 steps / ~30 fields before any value; every "no coach / no subscription
/ lockout" state is a dead end; error branches render "Not enough data yet" with no header or back; Home repeats the
same week three times; and the session screen can discard a workout on one tap. Non-technical clients will get stuck
in exactly the states the app doesn't handle.

**Coach.** Desktop is genuinely strong (client list + preview split, workspace shell, builders with list/detail
panes, view-as-client). Mobile is not: the client list carries no coaching signal, the 11-tab rail hides seven tabs,
there is no client switcher, and the core job — building a plan — costs ~5 taps per exercise with no draft/publish
model and (for nutrition/cardio) no protection against losing work. Several one-tap actions are irreversible.

**Admin/Super Admin.** Powerful and mostly complete; the risks are operational: destructive defaults (Fresh Start),
unconfirmed global toggles, search that only covers loaded pages, and two near-identical account consoles. Detail
screens lack "who/when/why" context.

**What the prototype got wrong for the product** (kept because it matched; should change):
the 11-tab rail on phones; the Quick-Actions card grid on phones; PageHeader hero stats + a MetricCard grid of the
same numbers; Home's ring + "Today's plan" rows + weekly ring + "This week" tiles + volume trend all describing one
week; the coach "Growth" chart of nested cumulative buckets; admin Analytics donut and bar of the same three
numbers; a single-line truncating title next to up to three right-slot actions.

---

## 3. Client audit

| ID | Route | Viewport | Category | Current | Expected / recommended | Sev | Pri | Suggested fix | Files |
|---|---|---|---|---|---|---|---|---|---|
| C13 | `/login` | all | BUG | "Password reset link sent to {email}" but production stores a token and `console.warn`s "no email provider is configured"; `confirmPasswordReset` exists only in the service layer, no page consumes it | A real reset email + `/reset/:token` page, or honest copy ("Ask your coach/admin to reset your password") with a working contact link | Blocking | **P0** | Wire an email provider (Resend) + add `ResetPassword` page; until then change copy + add wa.me/mailto | `api/_trpc/routers/auth.ts:177-207`, `src/services/auth/mongoAuth.ts:76-81`, `src/apps/AnonymousApp.tsx`, `src/pages/auth/Login.tsx:53-66` |
| C14 | `/`, `/workout`, `/nutrition`, `/cardio`, `/workout/session` | all | BUG | `subscriptionAccess('none') → 'limited'`; `useSubscription` is disabled with no `assignedCoachId`, so every coachless client (admin-created, released, local-only) sees "Subscription pending — your coach is setting up…" on Home; its CTA → `/messages` → "Sign in to see updates from your coach" | A coachless client gets a "You don't have a coach yet — an admin will assign one" state with the rest of the app usable; `none` should not gate | Blocking | **P0** | Return `'full'` (or a new `'nocoach'`) for `none`; give `Messages`/`CoachInbox` a real no-coach empty state | `src/lib/subscription.ts:32-36`, `src/hooks/useSubscription.ts:17`, `src/components/SubscriptionGate.tsx`, `src/pages/Messages.tsx:26-27`, `src/pages/CoachInbox.tsx:18-19` |
| C1 | `/workout/session` | all | BUG | Finish sheet "Discard" (`btn-danger`) calls `discardActive()` immediately | Confirm dialog naming the session; discard is destructive | Data loss | **P0** | `confirmDialog({danger:true})` before `doDiscard` | `src/pages/WorkoutSession.tsx:193-197,478` |
| C15 | `/login`, `/invite/:code` | ≤767 | UX ISSUE | Signup only offers "Coach" under a generic "Create a new account" CTA → clients create coach accounts; empty Sign-in submit does nothing; no show/hide password; invite submit `disabled={!valid}` with no reason across 5 fields; raw `e.message` errors; expired invite has no "ask coach" path | Clients told to use their coach's link; inline per-field errors; eye toggle; mapped error copy | Major | P1 | Hide signup for non-coach or add explainer; enable submit + validate on submit; add toggle | `src/pages/auth/Login.tsx:17,26,40,77-100`, `src/pages/auth/AcceptInvite.tsx:73-76,110,122-149` |
| C16 | assessment gate | ≤767 | UX ISSUE | 8 steps / ~30 fields, `fixed inset-0`, no exit/sign-out; only steps 0 and 4 validate — defaults auto-pass (Next×6 = fabricated data); no height/weight range check; done screen has no turnaround expectation | Let the client in after step 4; "finish later" for nutrition tags/motivation/photos; require explicit choice on goal/activity; sane ranges; "your coach usually replies within N days" | Major | P1 | Split wizard; add validation; add sign-out | `src/pages/onboarding/AssessmentWizard.tsx:31,80-98,224-244,251-315` |
| C17 | pending/suspended/complete-account gates | all | NAVIGATION ISSUE | AccountSuspended "contact support" has no link; CompleteAccount has no sign-out; AccountPending has no ETA/contact; first-launch `Onboarding` still offers a second sign-in form | Every gate has a working contact + sign-out | Major | P1 | Add links/buttons; gate `Onboarding` to local-only | `src/pages/auth/AccountSuspended.tsx:15-18`, `CompleteAccount.tsx:30-60`, `AccountPending.tsx:27-35`, `src/pages/Onboarding.tsx:38-41,103-140` |
| C18 | `/workout/routine/:id`, `/workout/exercise/:id`, `/workout/library` | all | MISSING STATE | Unknown/missing entity renders `t('progress.noData')` ("Not enough data yet") with no TopBar and no back | An error state with header, explanation and "Back to Workout" | Major | P1 | Render TopBar + `EmptyState` with action in those branches | `src/pages/RoutineDetail.tsx:27-33`, `ExerciseDetail.tsx:46-48`, `ExerciseLibrary.tsx:44,70` |
| C19 | `/workout/routine/:id`, all gated pages | all | UX ISSUE | Read-only subscription turns Start buttons into the bare status word ("Expired"); `SubscriptionBanner` isn't tappable; client never sees days-left before a term lapses | "Subscription expired — message your coach" button; tappable banner; "N days left" warning ≤7 days | Major | P1 | Copy + navigate; add days-left chip on Home/Subscription | `src/pages/RoutineDetail.tsx:125-127`, `src/components/SubscriptionBanner.tsx:12-24`, `src/components/ClientSubscriptionSection.tsx` |
| C2 | `/workout/session` | all | NAVIGATION ISSUE | Exit targets inconsistent: minimize→`/workout`, discard→`/`, save Done→`/`, read-only Done→`/workout`; minimize silently discards an unstarted draft | One exit model: Done/minimize return to where the session was opened (`navigate(-1)`), discard confirms | Major | P1 | See N8 | `src/pages/WorkoutSession.tsx:156-159,196,223,290` |
| C3 | `/` → `/workout/session` | all | UX ISSUE | "Start workout" creates a draft and navigates; header then shows "Not started" + a second Start; unstarted drafts vanish on refresh | One Start; timer begins when the first set is logged or on the single Start | Major | P1 | Call `beginTimer` on entry from Home/Workout, or persist drafts | `src/pages/Home.tsx:130-140`, `WorkoutSession.tsx:111-114,307-321` |
| C4 | `/` | ≤767 | UX ISSUE | Home is ~6 screens tall: date shown twice; hero ring "N tasks left" duplicates the "Today's plan" rows; weekly-goal ring + "This week" 4 tiles + volume trend all describe one week; "Start empty" goes to `/workout` | Above the fold: today's hero + tasks; one weekly block (ring + 2 stats); trend and recent behind "See progress" | Major | P1 | Merge/condense sections; rename or remove "Start empty" | `src/pages/Home.tsx:156-388` |
| C5 | `/check-in/:id` | all | MISSING STATE | No error state on submit failure; X discards answers with no confirm; sliders pre-filled 80/5 so an untouched form submits plausible defaults | Inline error + retry; confirm on close with answers; unset sliders until touched | Major | P1 | Render `submit.isError`; confirm; use null defaults | `src/pages/CheckIn.tsx:43-51,118,201-204` |
| C6 | `/progress` | all | NAVIGATION ISSUE | Tabs are local state while `/progress/measurements` and `/progress/photos` are routes → "+ Log" returns to the Weight tab | Tab in URL (`?tab=`) and sub-pages return to their tab | Major | P1 | `useTabParam('tab','weight')`; sub-page back → `/progress?tab=measure` | `src/pages/Progress.tsx:53,464`, `Measurements.tsx:52`, `ProgressPhotos.tsx:208` |
| C20 | `/progress/photos`, `/settings/subscription` | all | MISSING STATE | Photo save errors swallowed with no UI; freeze request has no success/error; Subscription page renders a blank body when status is `none` | Toast + retry; success/error; "No subscription yet — your coach sets this up" | Major | P1 | Add branches | `src/pages/ProgressPhotos.tsx:97-107`, `src/stores/photoStore.ts:80-88`, `src/components/ClientSubscriptionSection.tsx:38-44,97-99` |
| C27 | check-in photos, assessment photos | ≤767 | DEVICE/PWA ISSUE | `capture="environment"` forces the rear camera and removes gallery on many Androids — for *self* photos | Gallery/Camera two-button pattern (already in ProgressPhotos) | Major | P1 | Remove static `capture`; adopt the ProgressPhotos pattern | `src/components/PosePhotoPicker.tsx:41`, `src/pages/onboarding/AssessmentWizard.tsx:612` |
| C7 | `/nutrition` | ≤767 | UX ISSUE | `!log || !targets` renders bare text with no TopBar; add-food editor has placeholder-only name/quantity, no validation, defaults to hardcoded "Custom food"; "+ Add food" is a `text-xs` link; per-item icons 32px; `EntityNotes` under every food, meal, water and supplement; custom-foods card titled "Add food" | Header always; labelled fields; 44px targets; notes collapsed to a count chip | Meaningful | P2 | Use `TextInput`; `btn-tonal btn-sm` for add; collapse notes | `src/pages/Nutrition.tsx:62,121,503-511,662-726` |
| C8 | `/settings` | all | BUG | Identity card reads "Member since Sep 2026 · kg" (`gt.memberSince` = "… · {{unit}}", passed `common.kg`) | "Member since Sep 2026" | Meaningful | P2 | Drop the suffix | `src/pages/Settings.tsx:189`, `src/i18n/*.json` `gt.memberSince` |
| C9 | `/settings` | ≤767 | UX ISSUE | Name saves per keystroke with no indicator; reminders row (time + select + Add) crowds at 390px; "Cloud sync"/"Force update"/"Storage persisted" jargon; danger zone in Account tab; Sign out is a ghost button inside the Cloud card; `SyncStatusBadge` twice | Debounced save + "Saved" tick; stacked reminder form; plain-language labels; prominent Sign out; danger zone collapsed | Meaningful | P2 | Restructure Account tab | `src/pages/Settings.tsx:205,291-316,363-403` |
| C10 | `/progress` | all | UX ISSUE | Weight sheet closes silently on invalid input; charts have no dates; PR rows navigate away | Inline validation; x-axis dates; period chips | Meaningful | P2 | See V3/V4 | `src/pages/Progress.tsx:186-190` |
| C21 | `/check-ins`, `/notifications`, `/cardio`, CoachInfoCard | all | MISSING STATE | Loading = "Working…", failed fetch looks like empty; CoachInfoCard returns null on loading/error; check-ins are coach-initiated and the screen never says so | Skeletons, distinct error, explanatory empty ("Your coach starts check-ins") | Meaningful | P2 | `LoadingState`/`EmptyState` | `src/pages/CheckInHistory.tsx:32-35`, `Notifications.tsx:150-153`, `Cardio.tsx:172`, `src/components/CoachInfoCard.tsx:50,85` |
| C22 | Home, cards | ≤767 | UX ISSUE | WaitingForCoach has no action; Coach cards use the info icon for "Message"; TaskRow circle looks like a checkbox but isn't tappable; WeekStrip future days disabled with no cue; RestTimerBar pause is an undiscoverable tap on the readout; ExerciseCard info button no-ops when empty | Message-coach CTA; chat icon; non-checkbox dot; dimmed future days; explicit pause button; hide empty info | Meaningful | P2 | Small component edits | `WaitingForCoach.tsx:8-14`, `CoachCard.tsx:19`, `CoachInfoCard.tsx:50,85`, `TaskRow.tsx:41-47`, `WeekStrip.tsx:46-49`, `RestTimerBar.tsx:22-35`, `ExerciseCard.tsx:99-109` |
| C23 | `/cardio`, `/progress/measurements`, `/progress/photos`, `/workout/library` | ≤767 | UX ISSUE | Cardio start always interrupts with speed/incline; measurement columns "A / B / Δ"; photo dates raw ISO; library categories = first word of coach day titles | Start immediately; "Then / Now / Change"; `shortDate`; muscle-group filter | Meaningful | P2 | Copy + flow tweaks | `src/pages/Cardio.tsx:56-66`, `Measurements.tsx:74-96`, `ProgressPhotos.tsx:152-157,179,197`, `ExerciseLibrary.tsx:22-33` |
| C24 | `/workout/session` | 390 | RESPONSIVE ISSUE | ExerciseCard Prev column ≈68px truncates "100×12"; done button 40px; three 32px header icons 4px apart | Prev as a subtitle under the set number; 44px done; 40px icons with 8px gaps | Meaningful | P2 | Grid rework | `src/components/ExerciseCard.tsx:21-22,49,153-184` |
| C25 | video sheet | all | BUG | "Video unavailable" flashes while the URL resolves | Loading branch | Meaningful | P2 | Add `loading` state | `src/components/VideoPlayerSheet.tsx:89-104` |
| C26 | various | all | ACCESSIBILITY | EntityNotes coach notes 12.5px low-contrast; TrainingGuideSheet copy hardcoded EN/AR + off-token colours; hardcoded aria-labels (History month nav, BannerHost, ReminderBanner); AvatarPicker change affordance hover-only | 14px/AA; i18n; translated labels; always-visible camera badge | Meaningful | P2 | See §12 | `EntityNotes.tsx:106-113`, `TrainingGuideSheet.tsx:7-90`, `History.tsx:71,80`, `BannerHost.tsx:81`, `AvatarPicker.tsx:58` |
| C11 | `/workout`, session picker | all | UX ISSUE | Empty day uses `progress.noData`; picker empty state renders "—" | Purpose-written empties | Polish | P3 | Copy | `src/pages/Workout.tsx:105`, `WorkoutSession.tsx:519` |
| C12 | `/nutrition` | ≤767 | ACCESSIBILITY | Supplement check 36px; item action icons 32px; water −250 icon-only | 44px; labelled | Polish | P3 | Sizes + aria | `src/pages/Nutrition.tsx:229,393-430,612` |

**Client journey tap counts (invited client, 390px):** first open → first logged set ≈ 25 taps minimum, 35–45
realistic (invite form 5 + assessment ≥16 + start 1 + log 3) and *blocked entirely* if the coach hasn't assigned a
plan or subscription; log a planned meal 2 taps; custom food ≈8; send a check-in ≈9 and only when the coach requests
it (3 taps just to reach the list from the menu).

---

## 4. Coach audit

| ID | Route | Viewport | Category | Current | Expected / recommended | Sev | Pri | Suggested fix | Files |
|---|---|---|---|---|---|---|---|---|---|
| K11 | `/coach/clients` | ≤1023 | UX ISSUE | Dashboard query `enabled: isDesktop` → phone list shows name/email/account status only; palette sources clients from `['coachDashboard']` → empty on mobile; palette is ⌘K-only | Mobile rows carry adherence · days-left · last active · attention dot; a search icon in BrandBar; palette reads `['myClients']` | Blocking | **P0** | Enable the dashboard query everywhere (or a lighter list endpoint) | `src/pages/coach/CoachClients.tsx:85,198-208`, `src/components/CommandHost.tsx:29-37`, `BrandBar.tsx` |
| K12 | `/coach/templates/:id` → assign | all | BUG | Row tap = `mut.mutate(c.id)` → `saveClientWorkoutPlan` replaces the live plan; no confirm, no version snapshot; looks multi-select but isn't; preview shows day titles only | Confirm naming the plan being replaced; auto-snapshot a version; real multi-select "Assign to N"; exercise list in preview | Data loss | **P0** | Confirm + snapshot in `AssignTemplate`; extend preview | `src/components/coach/AssignTemplate.tsx:52`, `src/services/platform/coachAssetsApi.ts:121-138`, `src/pages/coach/CoachTemplatePreview.tsx:66-75` |
| K13 | clients, workspace, editors | all | BUG | No confirm on: transfer Approve (releases client), "+30 days" Extend chip, Release from existing-client search (same action IS confirmed in CoachClientDetail), section delete + exercise delete (day delete IS confirmed), food/session delete via bare minus, "Send reminders" to all | Confirm every irreversible action; undo toast for deletes; count in bulk labels | Data loss | **P0** | `confirmDialog` + undo | `IncomingTransferRequests.tsx:58-64,93`, `CoachSubscriptionPanel.tsx:162-164`, `AddExistingClient.tsx:296-302`, `PlanBuilder.tsx:108-137`, `CoachNutritionEditor.tsx:193`, `CoachCardioEditor.tsx:101`, `CoachCheckInsOverview.tsx:60-81` |
| K14 | `/coach/client/:id/nutrition`, `/cardio` | all | BUG | No draft persistence, no dirty tracking, no exit guard, no back button; Workout editor has all four but only on its own back — the layout back, all 11 tabs, header buttons and browser back bypass it | Shared `useUnsavedGuard(dirty)` (`useBlocker` + `beforeunload`) at the layout level; drafts for all three editors | Data loss | **P0** | Port the workout editor's draft + dirty logic; add a router blocker | `CoachNutritionEditor.tsx:59-103`, `CoachCardioEditor.tsx:31-70`, `CoachWorkoutEditor.tsx:41-76`, `CoachClientWorkspaceLayout.tsx` |
| K15 | workout editor | all | UX ISSUE | "Save assigned" / "Save as version" / "Save as template" — no draft→publish, no explanation; both saves hit the live plan; save always navigates away with no toast | Draft → Publish model; "Save" stays in place with "Saved · hh:mm"; "Publish new version" | Blocking | **P0** | Product decision + `VersionActions` rework | `CoachWorkoutEditor.tsx:68,118`, `VersionActions.tsx:50-71`, `CoachNutritionEditor.tsx:93`, `CoachCardioEditor.tsx:66` |
| K16 | workout editor | ≤767 | UX ISSUE | Picker closes after every pick and adds library defaults → Add → search → pick → tap row → edit → Save per exercise (~40 taps for 8); reorder ↑↓ only; duplicate uses `plus`, delete uses `minus`; five 36px row actions | Multi-select picker with inline sets/reps/rest and "Add N"; drag reorder; correct icons; ↑↓ + overflow | Blocking | **P0** | Rebuild `ExercisePickerSheet`; dnd-kit | `ExercisePickerSheet.tsx:81`, `PlanBuilder.tsx:198-210,337-342`, `ExerciseForm.tsx:117` |
| K17 | nutrition editor, all editors | all | MISSING STATE | Meal macros are never totalled against the typed targets; client goal/injuries/allergies never shown inside editors | Live per-meal and plan-vs-target totals with delta chips; a collapsible "Client context" strip in every editor header | Blocking | **P0** | Compute totals; reuse `AssessmentView` data | `CoachNutritionEditor.tsx:252-264`, `AssessmentView.tsx:104-109` |
| K18 | add-client sheet | ≤767 | UX ISSUE | Invite ends at a raw code + Copy (no Web Share/WhatsApp, expiry, or client-facing preview); un-copied invites silently revoked on close; Copy/Revoke identical 32px ghost chips; `SubscriptionPlanPicker` auto-selects the first plan | Share button (Web Share → WhatsApp), expiry text, preview; revoke only on explicit discard; placeholder "Choose a plan…" | Blocking | **P0** | Rework `InvitePanel`; picker default | `CoachClients.tsx:328-333,357-392`, `SubscriptionPlanPicker.tsx:58-61` |
| K19 | workspace, check-ins | all | MISSING STATE | No client switcher / prev-next in the workspace; no check-in review queue with "Next" | Name-tap switcher sheet with search + ◀/▶; review queue | Blocking | **P0** | New header control; queue mode in `CoachCheckIns` | `CoachClientWorkspaceLayout.tsx:77-96`, `CoachCheckIns.tsx` |
| K1 | `/coach/dashboard` | ≤767 | UX ISSUE (requested) | Five Quick-Action cards in a 2-col grid (3 rows) on Overview + five more on the Content tab | Compact "+" `icon-btn` (≥44px) at the header's end opening a Sheet action menu (icon + title + supporting text); desktop keeps the grid | Major | P1 | New `ActionMenuSheet`; see §18 | `dashboard/OverviewPanel.tsx:84-92`, `ContentPanel.tsx:22-26`, `parts.tsx:19-28`, `CoachDashboard.tsx:62-66` |
| K2 | `/coach/dashboard` | ≤767 | UX ISSUE | `PageHeader stats` (active/renewals/revenue) + 6 MetricCards repeating clients & revenue + checklist + trial banner + headline + hero + quick actions + 2 lists + renewals ≈ 6 screens before "Needs attention" | Headline → featured hero → needs-attention → 4 KPIs → renewals; header stats OR grid, not both | Major | P1 | Remove `stats` from PageHeader or the grid; reorder | `CoachDashboard.tsx:67-75`, `OverviewPanel.tsx:75-82` |
| K6 | `/coach/client/:id/*` | all | NAVIGATION ISSUE | Back hard-coded to `/coach/clients` from dashboard hero/rows, adherence, reports, assessments, check-ins overview, palette, thread title | Return to origin (`navigate(-1)` with fallback) | Major | P1 | See N1 | `CoachClientWorkspaceLayout.tsx:77` |
| K7 | workspace tabs | all | NAVIGATION ISSUE | Tabs `navigate(to)` push → browser Back walks every visited tab | `replace: true` | Major | P1 | One-line fix (applied) | `CoachClientWorkspaceLayout.tsx:107` |
| K8 | workspace rail | ≤767 | RESPONSIVE ISSUE | 11 uppercase-mono 11px tabs, hidden scrollbar, no fade, active tab not scrolled into view, header not sticky; ~4 visible at 390px; Progress/Messages/versions unmount the shell | 5 primary tabs + "More" sheet on mobile; edge fade + `scrollIntoView`; sticky header; keep Progress/versions inside the layout | Major | P1 | Rail rework + route nesting | `CoachClientWorkspaceLayout.tsx:98-117`, `CoachApp.tsx:101-104` |
| K20 | overview, check-ins, subscription tabs | all | UX ISSUE | Overview KPIs are vanity counters (recent workouts of last 10 logs, last weight, note count, plan count); "Manage" sheet lists Workout/Nutrition/Cardio which are already tabs; Check-ins leads with "Request" even when one awaits review; "Mark reviewed" allowed with empty feedback, then permanently read-only; Subscription panel 9 controls / 5 destructive in one column; term/price sheets init state once (stale — suspected) | Overview: adherence 7d, last active, open check-in/assessment, days-left; Manage = Note + Release; newest submitted check-in auto-expanded; warn on empty feedback + allow edit; Billing/Account split; key sheets on `open` | Major | P1 | Tab reworks | `CoachClientDetail.tsx:123-141,266-280`, `CoachCheckIns.tsx:43-51,95-109`, `CoachSubscriptionPanel.tsx:104-213,296,339` |
| K21 | editors, adherence, reports | ≤767 / ≥1024 | RESPONSIVE ISSUE | Nutrition editor renders every meal fully expanded on mobile; `CoachAdherence` mobile rows are non-clickable divs while desktop navigates; Reports mobile leaderboard drops assessment/last-active; Supplements tab lacks the desktop table; non-fullBleed pages stretch one column to ~1200px at 1280 | Mobile drill-down; clickable rows; second line; table branch; `max-w-[720px]` reading columns | Major | P1 | Per-page fixes | `CoachNutritionEditor.tsx:278-299`, `CoachAdherence.tsx:92-107`, `ReportsPanel.tsx:88-105`, `CoachExerciseLibrary.tsx:496-525`, `ResponsiveShell.tsx:41` |
| K22 | adherence, assessments, check-ins overview | all | PERFORMANCE | One query per client via `useQueries` (30 logs each for adherence) — 40 parallel reads per page open | Server aggregate (the `coachDashboard` doc already exists) | Major | P1 | Backend | `CoachAdherence.tsx:32-38`, `CoachAssessments.tsx:38-44`, `CoachCheckInsOverview.tsx:40-42` |
| K23 | exercise form, plan builder | all | MISSING STATE | Video is a raw URL field — coach cannot upload/pick a demo video (VideoManager + Bunny only wired into the client app); empty plan has no "apply template / copy from client"; `ExerciseForm` saves with 0 sets / empty rep range | Bunny upload + library picker for coaches; empty-state actions; validate sets ≥1 | Major | P1 | Reuse `VideoManager` upload; validation | `ExerciseForm.tsx:42-43,107,117`, `PlanBuilder.tsx:277-278` |
| K3 | `/coach/dashboard` tabs | all | UX ISSUE | "Clients" tab duplicates `/coach/clients`; "Content" is 5 link cards; "Engagement" = 5 KPIs + one mis-typed chart | Overview + Engagement only (or fold Engagement into Reports) | Meaningful | P2 | Remove two tabs | `CoachDashboard.tsx:44-51`, `ClientsPanel.tsx`, `ContentPanel.tsx` |
| K4 | dashboard | all | UX ISSUE | "Send broadcast" navigates to the plain inbox — no broadcast composer | Rename to "Open inbox" or build a broadcast sheet | Meaningful | P2 | Copy or feature | `OverviewPanel.tsx:90`, `CommandHost.tsx:53` |
| K5 | dashboard | all | UX ISSUE | Check-ins MetricCard is warn-toned but not clickable while its neighbours are | `onClick → /coach/checkins` | Meaningful | P2 | One prop | `OverviewPanel.tsx:79` |
| K9 | workspace header | ≤639 | ACCESSIBILITY | Message / Edit-plan buttons icon-only on mobile (`hidden sm:inline`) with no aria-label; same for dashboard "+ Add client" | `aria-label` | Meaningful | P2 | Add labels | `CoachClientWorkspaceLayout.tsx:90-95`, `CoachDashboard.tsx:63-65` |
| K10 | `/coach/revenue` | all | UX ISSUE | 13 metric cards on one screen; "Growth" chart plots Today ⊂ Week ⊂ Month as comparable bars | Featured MRR + 4 KPIs + renewals; real weekly new-clients series or no chart | Meaningful | P2 | See V9 | `dashboard/AnalyticsPanel.tsx` |
| K24 | library, templates, history, reports, plan, checklist | mixed | UX ISSUE | Library mobile toolbar crushes search with a text "Load starter library" button; Groups tab no search, all foods as chips; bulk = delete only; Templates no search, floating checkbox over title; History tab = ownership timeline only; version Compare is a count summary; CSV export no range/columns/feedback (blob download risky in iOS PWA); CoachPlan upgrade blocked until a reason is typed and tiers show caps not price; CoachChecklist never shows on mobile (`/coach` → clients); clients-used/cap shown in 4 places, revenue in 3 | Overflow menu for import; searchable multi-select; richer bulk; template search; unified timeline; per-day diff; export options + toast; optional reason + prices; checklist on mobile list; one home per KPI | Meaningful | P2 | Per-screen | `CoachExerciseLibrary.tsx:139-150,389-439`, `CoachTemplates.tsx:67-80`, `PlanVersionHistory.tsx:91`, `ReportsPanel.tsx:20-75`, `CoachPlan.tsx:157`, `CoachApp.tsx:50` |
| K25 | cardio editor | all | BUG | `frequency: '3×/week'` hardcoded literal saved into plan data | Structured number + unit or i18n | Polish | P3 | Data model tweak | `CoachCardioEditor.tsx:29` |

**Coach tap counts (390px):** invite a client 4 taps then leave the app to share; add an existing client 6–7; add
one exercise with 3 sets 8 (10 from an empty plan, +5 per additional exercise); review one check-in with feedback 6
(×30 clients ≈ 180 taps + 30 list round-trips); assign a template 6 (and it silently overwrites the live plan).

---

## 5. Admin / Super Admin audit

| ID | Route | Viewport | Category | Current | Expected / recommended | Sev | Pri | Suggested fix | Files |
|---|---|---|---|---|---|---|---|---|---|
| A7 | `/admin/assignments` → transfer | all | BUG | `useState(canFreshStart ? 'fresh_start' : 'keep_plans')`, described as "Recommended"; Next×3 archives plans/notes/messages/check-ins; final button plain primary, no confirm, no `onError`; step-3 subscription options have empty descriptions | Default `keep_plans`; explicit pick on step 2; `btn-danger` + confirm for fresh start; error surface; filled descriptions | Data loss | **P0** | Change default; add confirm/error | `src/components/coach/TransferWizard.tsx:41,136-138,159-199` |
| A8 | `/admin/accounts` | all | UX ISSUE | Search + role/status filters run over the pages already loaded (`fetchUsersPage(25)` infinite scroll) → false "No accounts found"; bulk bar count = all selected but action = `filtered ∩ selected` | Server-side search/filter params; selection cleared on filter change or "12 selected (4 in view)" | Blocking | **P0** | Backend query params; selection reset | `src/pages/admin/AdminAccounts.tsx:85-101,148-161,281-285` |
| A6 | `/admin/subscriptions`, `/admin` | all | BUG (regression) | `GrowthPanel` deletion dropped client-subscription MRR (and coach+client total), "client subscriptions ending ≤7 days", `subBreakdown`, WoW members delta — nothing renders them now | Restore in AdminSubscriptions from the already-fetched `fetchGrowth` | Major | P1 | Safe fix (applied) | `AdminSubscriptions.tsx`, `services/platform/adminGrowthApi.ts` |
| A1 | `/admin/coaches` | ≤1023 | RESPONSIVE ISSUE | 7-column `DataTable` rendered on phones (`{table}` in the non-desktop branch); Accounts/Members correctly pair with a mobile list | `MobileCardList` rows below 1024 | Major | P1 | Add mobile branch | `AdminCoaches.tsx:185-195` |
| A2 / A10 | coach detail, governance, assignments, members, accounts | all | BUG | Unconfirmed/no-feedback dangerous actions: renew, extend-trial (+15d hardcoded), set limit, set/clear end date (clear = unlimited term); plan-request approve = 3 sequential writes, no transaction; reject-transfer no confirm/reason; flag toggle = one-click global kill switch with no confirm/undo/"last changed by", no edit/delete; reactivate unconfirmed; delete copy contradicts itself ("Permanently… can't be undone" vs "Removes the identity record only"), no type-to-confirm; role-change confirm lists no consequences | Confirm with consequences; toast on every mutation; server transaction for approve; type-to-confirm for hard delete; flag audit line | Major | P1 | `confirmDialog` + `showToast`; backend transaction | `AdminCoachDetail.tsx:75-86,116-117,164-179`, `AdminAssignments.tsx:185-187`, `AdminGovernance.tsx:37-71`, `AdminMembers.tsx:86-91`, `AdminAccounts.tsx:363-392`, `en.json:1539-1549` |
| A9 | `/admin/accounts` vs `/admin/members` | all | UX ISSUE | Two near-identical consoles in the Manage group; Members loads/renders all members unpaginated | Merge into one "People" page (KPIs + segments + bulk + create) or rename + cross-link; paginate | Major | P1 | IA decision | `AdminAccounts.tsx`, `AdminMembers.tsx:62,73-83`, `config/nav.ts:173-180` |
| A11 | `/admin/clients/:id`, `/admin/coaches/:id` | all | MISSING STATE | Client detail renders "No plan assigned" and "—" while 5 queries load; no status/coach/subscription/joined/last-active; coach plan history has no actor | Skeleton; header context strip; actor + time | Major | P1 | `LoadingState`; add fields | `AdminClientDetail.tsx:18-41`, `AdminCoachDetail.tsx:133-148` |
| A12 | `/admin/assignments`, `/admin/banners` | all | UX ISSUE | Coach picker unsearchable, name-only, no capacity (data is on the same page) → can assign into a full coach; banners have no live/scheduled/ended derivation, no filter/search; `endAt > startAt` unvalidated; date inputs unlabelled | `n/max` per row + disable at cap + search; derived "Live / Scheduled / Ended / Off" filter; validation | Major | P1 | Per-page | `AdminAssignments.tsx:267-284`, `AdminBanners.tsx:63-81,140-141` |
| A13 | shell, palette | ≤767 | NAVIGATION ISSUE | Palette trigger only in `DesktopTopBar`; admin entity search = cached coaches only; admin commands not permission-gated; plain admin hitting super-only URLs gets a silent redirect; controls hidden not disabled-with-reason (`PermissionState` exists unused) | Search icon in BrandBar; include users/members; `useCan` filter; `PermissionState` screens | Major | P1 | Shell + palette | `CommandHost.tsx:71-79`, `BrandBar.tsx`, `AdminCoachDetail.tsx:93`, `AdminMedia.tsx:47`, `AdminAccounts.tsx:359-361` |
| A3 | `/admin/assignments` | all | PERFORMANCE | 3× `fetchUser` per pending transfer request | Denormalize names server-side | Meaningful | P2 | API change | `AdminAssignments.tsx:56-82` |
| A4 | `/admin/coaches`, `/admin/audit` | all | UX ISSUE | Pane-b "View audit log" → unfiltered list (no per-coach filter server-side); audit category chips are raw action prefixes | `?target=` filter on audit; translated category labels | Meaningful | P2 | Backend param + i18n map | `AdminCoaches.tsx:178`, `AdminAudit.tsx:12-14,53-60` |
| A14 | media, governance, notifications, accounts | mixed | UX ISSUE | Gallery unpaginated, click opens raw CDN URL (no lightbox; `ImageViewer` exists), `fetchByRole('client', 500)` caps names; permission matrix no sticky first column; admin feed = pending plan requests only, unseen-forever; Accounts mobile rows hand-rolled, no sort/joined column | Paginate + lightbox; sticky column; transfer requests + expiring subs in feed; `MobileCardList` + sort | Meaningful | P2 | Per-page | `AdminMedia.tsx:25-29,76-90`, `AdminGovernance.tsx:81-108`, `useNotifications.ts:44-50`, `AdminAccounts.tsx:170-180,249-274` |
| A5 | admin pages | all | UX ISSUE | Eyebrows inconsistent (`platform.superAdmin` vs nav-group labels) | One convention (nav group) | Polish | P3 | Strings | `AdminGovernance.tsx:20`, `AdminCoaches.tsx:145`, `AdminPlans.tsx`, `AdminAssignments.tsx` |

---

## 6. Mobile / responsive audit

Breakpoints in code: shell chrome at **768** (`ResponsiveShell`), data layouts at **1024** (`useIsDesktop`), client
shell fixed `max-w-md`. Findings by requested width:

| Width | What happens | IDs |
|---|---|---|
| **390 / 430** | Commands at 32–36px (X1); TopBar/PageHeader/Sheet titles single-line next to up to 3 right actions (X10); StatTile/MetricCard uppercase labels wrap to 3 lines in Arabic (X10); chip rows show scrollbars or no edge cue (X11); Sheet forms scroll their primary button off-screen and are capped at 88% height with no safe-area bottom (X8); BottomNav padding is a magic `pb-28` and `BulkActionBar` ignores the safe area (X9); ExerciseCard Prev column truncates (C24); 11-tab rail shows ~4 tabs (K8); AdminCoaches renders a 7-column table (A1); nutrition editor fully expanded (K21); WhatsApp FAB (`bottom-24 end-3`, 20px dismiss) collides with the bulk bar zone and editor footers (X16) | X1 X8 X9 X10 X11 X16 C24 K8 K16 A1 |
| **768–1023** | Dead tier: icon sidebar (72px) + mobile single-column lists at ~700px width; stat grids only `md:grid-cols-3`; no tablet card grid anywhere | X2 |
| **1024 exactly** | Split-panes gate on `lg` with a fixed `w-80` pane-b → table pane ≈380px for 5–6 columns; `DetailPanel sticky top-4` slides under the z-20 top bar | X3 X9 |
| **1280 / 1440** | Non-fullBleed pages stretch one column to ~1200px (K21); Revenue shows 13 metric cards (K10); Admin Analytics renders two charts of the same data (V12); otherwise desktop is the strongest tier | K21 K10 V12 |

| ID | Viewport | Category | Current | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|---|
| X1 | ≤767 | RESPONSIVE | `.chip` 34px used as commands; `.btn-sm` 34px; `.icon-btn` no intrinsic size (32–42px callers); `.seg button` 36px; `.sec-link` bare text | Every interactive control ≥44px hit area (visual size may stay smaller via `::after` extender) | P1 | Token pass on `.chip/.btn-sm/.icon-btn/.seg/.sec-link`; stop using `.chip` for commands | `src/index.css:141-176,206-245` |
| X2 | 768–1023 | RESPONSIVE | Mobile layouts at tablet width | `md:grid-cols-2` card lists; DataTable at `md` with fewer columns; 2-col stat grids → 4 | P1 | Add a tablet tier | `ResponsiveShell.tsx:31-41`, list pages |
| X3 | 1024 | RESPONSIVE | `w-80 shrink-0` pane-b beside `flex-1` table at `lg`; no shared `.split` utility (only in comments) | Gate on `xl` or shrink pane-b to `w-72`; extract `SplitPane` | P1 | New primitive | `CoachClients.tsx:216`, `AdminCoaches.tsx:165`, `CoachMessages.tsx:94` |
| X8 | ≤767 | RESPONSIVE | Sheet: primary buttons in the scrolling body; `size` no-op on mobile; no full-height variant; `pb-8` no safe-area; no `visualViewport` | `footer` for every form's primary action; `size="full"`; safe-area padding; keyboard-aware | P2 | Sheet + call sites | `Sheet.tsx:87,103`, forms |
| X9 | ≤767 | RESPONSIVE | `pb-28`, `bottom-[88px]`, TopBar sticky offset hard-coded (8px off), DetailPanel `top-4` | CSS vars `--brandbar-h`, `--bottomnav-h`, `--topbar-h`; `env(safe-area-inset-bottom)` | P2 | Tokens | `ResponsiveShell.tsx:41`, `AppShell.tsx:27`, `BulkActionBar.tsx:26`, `TopBar.tsx:39`, `DetailPanel.tsx:23` |
| X10 | ≤767 | UX | ~130 `truncate`, 2 `line-clamp`; PR muscle label `w-24 truncate`; titles single-line; `whitespace-nowrap` on a translated action button | `line-clamp-2` for titles; flex labels; never nowrap an action label; drop uppercase/tracking on `.stat-label` in `ar` (already done for `.eyebrow`) | P2 | Sweep | `Progress.tsx:435`, `TopBar.tsx:32`, `PageHeader.tsx:33`, `Sheet.tsx:97`, `CoachExerciseLibrary.tsx:144`, `StatTile.tsx:33` |
| X11 | ≤767 | UX | Two chip-row styles (hidden scrollbar + bleed vs visible scrollbar, no cue) | One `ChipScroller` with `-mx-5 px-5` bleed, hidden scrollbar, end fade mask | P2 | New primitive | `AdminAccounts.tsx:201,213`, `CoachClients.tsx:165`, `CoachViewLayout.tsx:64` |
| X13 | ≤1023 | UX | `DataTable` documented desktop-only; AdminCoaches renders it on phones | Pair with `MobileCardList` | P1 | See A1 | `DataTable.tsx:26-30`, `AdminCoaches.tsx` |
| X16 | ≤767 | UX | `WhatsAppFab` fixed `bottom-24 end-3 z-40`, 20px dismiss; hides only on `/messages` | Hide when a bulk bar / sticky footer is present; 32px+ dismiss; or move into Settings/Help | P2 | Component | `src/components/WhatsAppFab.tsx:28,46` |

Per-check summary for every screen (390px): horizontal overflow — none found in page bodies (tables scroll inside
cards); clipped/truncated text — X10; bad wrapping — StatTile labels (X10); tiny targets — X1/C12/C24/K16/K18;
crowded headers — TopBar with 3 right actions (X10), workspace header (K8); actions off-screen — Sheet forms (X8);
sheet sizing — X8; table usability — A1/X13; sticky elements — TopBar offset, DetailPanel (X9), workspace header not
sticky (K8); keyboard overlap — M4/P10; bottom-nav overlap — X9 (FAB rises 32px over content); safe-area — X9,
M4, P4; sidebar — X2; content hidden behind fixed elements — X9/X16.

---

## 7. Navigation / back-flow audit

### Route maps

**Client** (`ClientApp.tsx:116-139`, flat routes under `AppShell`): `/` Home · `/coach-notes` · `/notifications` ·
`/check-in/:id` · `/check-ins` · `/assessment` · `/messages` · `/workout` · `/workout/routine/:dayId` ·
`/workout/library` · `/workout/exercise/:exId` · `/workout/session` (hideNav) · `/nutrition` · `/cardio` · `/progress` ·
`/history` · `/progress/photos` · `/progress/measurements` · `/settings?tab=` · `/settings/app` (→ redirect) ·
`/settings/subscription` · `/settings/videos` · `/settings/import` · `*` → renders Home **without redirect**.

**Coach** (`CoachApp.tsx:73-115`, `ResponsiveShell`): `/coach` (→ dashboard on ≥768, clients on phone) ·
`/coach/dashboard?tab=` · `/coach/clients` · `/assessments` · `/checkins` · `/reports` · `/revenue` · `/plan` ·
`/subscription-plans` · **layout** `/coach/client/:id` { index, `assessment`, `checkins`, `workout`, `nutrition`,
`cardio`, `notes`, `subscription`, `history` } · **outside the layout:** `/coach/client/:id/activity`, `/view`,
`/view/:tab`, `/versions/:kind` · `/coach/library` · `/templates`(+new/:id/edit/:id) · `/adherence` · `/messages` ·
`/messages/:clientId` · `/notifications` · `/settings` · `*` → `/coach` (replace).

**Admin** (`AdminApp.tsx:46-62`, flat): `/admin` · `/accounts` · `/members` · `/banners` · `/clients/:id` ·
`/assignments` · `/governance` · `/analytics` · `/coaches` · `/coaches/:id` · `/plans` · `/subscriptions` · `/audit` ·
`/media` · `/notifications` · `/settings` · `*` → `/admin` (replace).

Nav configs (`config/nav.ts`) were verified against the route tables — no dead or redirecting nav targets.

### Back-target matrix (in-app back ≠ browser back)

| ID | Screen | Current back target | Reached from | Correct behaviour |
|---|---|---|---|---|
| N1a | Coach client workspace | `/coach/clients` | dashboard hero/rows, adherence, reports, assessments, check-ins overview, palette, thread title | origin |
| N1b | ExerciseLibrary | `/workout` | nav menu (from any page) | origin |
| N1c | RoutineDetail | `/workout` | notification/note deep link (`noteTarget.ts:32`) | origin (notifications) |
| N1d | Notifications | role root | bell on every page | origin |
| N1e | Messages (client) | `/` | bottom nav, menu, SubscriptionGate/CoachInfoCard CTAs, notification | origin |
| N1f | CoachMessageThread | `/coach/messages` | workspace Messages tab/header, client detail, dashboard, client preview | origin (workspace) |
| N1g | AdminCoachDetail | `/admin/coaches` | Subscriptions ×4, Assignments, Members, Overview ×3, palette (8 of 9 entries) | origin |
| N1h | AdminClientDetail | `/admin/accounts` | Members | origin |
| N1i | VideoManager, ImportData | `/settings` | Preferences tab Tools group | `/settings?tab=preferences` |
| N1j | MyAssessment | `/settings` | Account tab | `/settings?tab=account` |
| N1k | History, Measurements, ProgressPhotos | `/progress` | Progress tabs | `/progress?tab=…` |
| N1l | CheckInHistory, CoachInbox | `/` | menu | origin |
| N1m | CoachViewLayout, PlanVersionHistory | client overview | workspace Progress tab, editors | origin tab |

Correct precedents already in the codebase: `ExerciseDetail.tsx:71`, `CheckIn.tsx:66-94` (steps the wizard first),
`ClientSubscriptionPage.tsx:16`, the Add-Client sheet's context-aware back (`CoachClients.tsx:253-261`).

| ID | Category | Current | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|
| N1 | NAVIGATION | 17 hard-coded back targets (matrix above) | `navigate(-1)` when `location.key !== 'default'`, else the parent route | P1 | A `useBack(fallback)` hook; replace call sites | listed above |
| N2 | NAVIGATION | Workspace tabs push history | `replace: true` | P1 | Applied | `CoachClientWorkspaceLayout.tsx:107` |
| N3 | NAVIGATION | Two back chevrons 40px apart with different targets inside the workspace (layout + child TopBar) | One back, owned by the layout | P1 | Remove child `onBack` | `CoachWorkoutEditor.tsx:116`, `CoachClientAssessment.tsx:62` |
| N4 | NAVIGATION | Unsaved guard only on the workout editor's own back; every other exit bypasses it | Router-level blocker | P1 | See K14 | editors, layout |
| N5 | NAVIGATION | `/coach/library?tab=` ignored (local state) | `useTabParam` | P2 | Swap hook | `CoachExerciseLibrary.tsx:51` |
| N6 | BUG | Dead palette destinations (`/admin?tab=…`, `/coach/dashboard?tab=reports`) | Real routes | P2 | Applied | `CommandHost.tsx:55,73-75` |
| N7 | BUG | Client `*` renders Home without redirect | `<Navigate to="/" replace />` | P2 | Applied | `ClientApp.tsx:139` |
| N8 | NAVIGATION | `/workout/session` carries no state; Home/History mutate the global day then navigate; refresh hits "no active session"; minimize → `/workout` | `/workout/session/:date`; `navigate(-1)` for minimize | P1 | Route param | `Home.tsx:142-145`, `History.tsx:59-62`, `WorkoutSession.tsx:136-159` |
| N9 | UX | WeekStrip non-done tap mutates the global day with no URL change | `?day=` or a visible "Today" reset | P2 | Small | `Home.tsx:176` |
| N10 | NAVIGATION | `?new=1`/`?q=` read only as lazy `useState` initialisers; no Sheet pushes history (Android back closes the page, not the sheet) | React to param changes; push a history entry when a sheet opens on mobile | P2 | Hook | `CoachClients.tsx:61-65`, `Sheet.tsx` |
| N11 | UX | NavMenuSheet `startsWith` marks `/workout` active on `/workout/library` | `end` match for parents | P3 | Cosmetic | `NavMenuSheet.tsx:25` |

**Tab/query-param model:** `useTabParam` and `Settings` use `replace` (correct — no history pollution; the JSDoc claim
"back-button friendly" is false in the sense that Back leaves the page, which is the desired behaviour). Route-based
tabs (workspace rail, `CoachViewLayout /view/:tab`) push. Proposed rule set: query-param and route tabs both `replace`;
in-app back = origin with parent fallback; sheets/dialogs push one history entry on mobile so hardware back closes
them; deep links (notifications, notes, messages) always have a parent fallback; the `*` route redirects.

---

## 8. Messenger / media / permissions audit

| ID | Area | Viewport | Category | Current | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|---|---|
| M1 | Uploads | all | MISSING STATE | Single `fetch(PUT)`; attach/mic icon swaps to a timer glyph; no %, cancel or ETA (also avatar, check-in, assessment, progress photos) | XHR `upload.onprogress` → pending bubble with progress + cancel | P1 | Shared uploader | `bunnyUploadApi.ts:125-149`, `MessageThread.tsx:146-162` |
| M2 | Send | all | MISSING STATE | Text send clears the input; nothing renders until the 5s poll; failure silently restores the text | Local pending bubble; failed bubble with Retry; toast | P1 | Optimistic state | `MessageThread.tsx:129-142`, `messagesApi.ts:21` |
| M3 | Errors | all | BUG | Blocking `alertDialog`; `upload.tooLarge` = "Image is too large (max 5 MB)" reused for voice (10 MB), video (50 MB), file (25 MB) | Per-kind strings with the real limit; inline error | P1 | Applied (strings + mapping) | `en/ar/ar-eg.json upload.*`, `bunnyUploadApi.ts:129` |
| M4 | Composer | ≤767 | RESPONSIVE | Zero `visualViewport`/`interactive-widget`; composer in a `100dvh` column, BottomNav `fixed`; no safe-area bottom padding; Enter sends unconditionally on touch (no newlines) | Keyboard-aware `--kb` var; safe-area padding; Enter = newline on touch | P1 | Composer rework | `MessageThread.tsx:238,301`, `Messages.tsx:19`, `index.html:6-9` |
| M5 | Scrolling | all | UX | No "jump to latest / N new" pill; threads hard-capped at 200 with no load-older; loading = "Working…" | Pill; reverse cursor + infinite scroll at top; bubble skeletons | P2 | Feature | `MessageThread.tsx:93-112,181`, `messagesApi.ts:48-52` |
| M6 | Realtime | all | PERFORMANCE | Polling never pauses on hidden/offline; coach inbox + BottomNav badge each poll every thread (full 200 msgs) every 20s → ~100 requests/20s for 50 clients | `messages.unreadSummary` endpoint; one shared subscription; pause on `visibilitychange` | P0/P1 | Backend + hook | `messagesApi.ts:59-201`, `CoachMessages.tsx:53-58`, `BottomNav.tsx:10` |
| M7 | Thread list | all | UX | Rows have no timestamp; `metaMap` starts empty so every row flashes "No messages yet" and re-sorts; mobile uses numbered pagination | Relative time; skeleton rows until meta loads; infinite scroll | P2 | List rework | `CoachMessages.tsx:131-188` |
| M8 | Edge states | all | MISSING STATE | Coachless client gets one bare sentence; attach/mic vanish silently without Bunny; typing during a long upload is wiped by `setBody('')` | No-coach CTA; disabled buttons with reason; snapshot body at upload start | P2 | Small fixes | `Messages.tsx:26-27`, `MessageThread.tsx:146-162,269,281` |
| M9 | Audio | all | DEVICE/PWA | See flow below | Full permission + recording flow | P1 | `useVoiceRecorder` rework | `hooks/useVoiceRecorder.ts:39-106`, `MessageThread.tsx:170-172,239-292` |

**Implemented well:** read receipts (Sent/Seen) exist; textarea autosize; Safari `audio/mp4` mime handled;
image downscaling to 1600px WebP.

### Audio — observed vs desired flow

Observed: mic button renders only if `isBunnyConfigured() && voice.supported`; `supported` = `getUserMedia` exists +
a MediaRecorder mime is available. Unsupported, insecure-context and old-iOS cases all **hide the button silently**.
`navigator.permissions.query` and `isSecureContext` are never used. `getUserMedia` errors are swallowed (`catch {}`),
so `NotAllowedError` (denied), `NotFoundError` (no mic), `NotReadableError` (device busy) and `SecurityError` all
collapse into "Microphone unavailable. Check your browser permissions and try again." No priming before the OS
prompt, no recovery steps after denial, no level meter (no proof it is recording), stop == send (no preview or
re-record), no maximum duration (fails after the fact with the wrong 5 MB image copy), no interruption handling,
playback is a raw `<audio controls>` at `w-60` with no duration in the bubble.

Desired state machine:

1. **Capability check** on mount — `!navigator.mediaDevices?.getUserMedia || !MediaRecorder` → show the mic button
   disabled with a tooltip/sheet "Voice notes aren't supported in this browser"; `!window.isSecureContext` → "Voice
   notes need a secure (HTTPS) connection".
2. **Permission state** via `navigator.permissions.query({name:'microphone'})` where available (Chrome/Edge; Safari
   returns unsupported → treat as `prompt`):
   - `granted` → start recording immediately.
   - `prompt` → **priming sheet** ("Forma needs your microphone to record a voice note. You'll see a browser prompt
     next.") → Continue → `getUserMedia`.
   - `denied` → **recovery sheet** with per-platform steps: Chrome Android (lock icon → Permissions → Microphone),
     iOS Safari (Settings → Safari → Microphone / aA menu → Website Settings), installed PWA (system app
     settings). Offer "Send a text instead".
3. **Error mapping** from `getUserMedia`: `NotAllowedError` → recovery sheet; `NotFoundError` → "No microphone found";
   `NotReadableError`/`AbortError` → "Your microphone is in use by another app — close it and try again";
   `SecurityError` → HTTPS message; everything else → generic with Retry.
4. **Recording**: visible level meter/waveform from an `AnalyserNode`; elapsed time; hard cap 5:00 with a warning at
   4:00; Cancel (confirm if > 10s); Stop → **review** state.
5. **Review**: play/pause with scrubber and duration; Re-record; Send.
6. **Uploading**: pending audio bubble with progress %, Cancel; failure → bubble with Retry / Delete (no modal).
7. **Interruptions**: `visibilitychange → hidden`, `pagehide`, or the MediaStream track `ended` → auto-stop into
   review (never lose the take); unmount cleanup stops tracks.
8. **Playback bubble**: duration, play state, playback speed 1×/1.5×, "played" tick.

### Image/photo flows

`capture="environment"` on the pose/assessment pickers forces the rear camera and removes gallery access on many
Androids (C27/P3 — fixed by removing the attribute). HEIC photos fail `createImageBitmap` → the *original* file is
sent → `badType`/`tooLarge` dead end (`lib/image.ts:6-27`). Photo CDN upload failures are swallowed
(`photoStore.ts:83-88`) so local-only photos look identical and the coach never sees them — add a "local only /
syncing" chip and a retry.

---

## 9. Form audit

| Form | Labels | Validation | Required | Keyboard | Submit loading | Success | Unsaved guard | Sticky action | Should become | IDs |
|---|---|---|---|---|---|---|---|---|---|---|
| Login | placeholders only | none (empty submit no-ops) | — | ok | yes | n/a | — | — | labelled fields + eye toggle | C15 |
| AcceptInvite | ok | boolean → disabled button, reasons hidden | — | ok | yes | n/a | — | — | validate-on-submit with per-field errors | C15 |
| AssessmentWizard (8 steps) | ok | steps 0 & 4 only; no ranges | defaults pass | ok | yes | good done screen | draft autosave ✓ | footer ✓ | split after step 4; "finish later" | C16 |
| CheckIn wizard (4 steps) | ok | none; defaults 80/5 | — | ok | yes | summary view | none (X discards) | footer ✓ | null defaults; error state; confirm close | C5 |
| Settings profile/preferences | ok | none | — | ok | per-keystroke autosave, no indicator | none | n/a | — | debounced save + "Saved" tick | C9 |
| Nutrition add-food | placeholder name/qty | none | — | ok | no | closes | — | body | `TextInput` + footer | C7 |
| Weight log sheet | ok | silent close on invalid | — | ok | no | closes | — | body | inline error | C10 |
| Freeze request | ok | — | — | ok | yes | none | — | — | toast + error | C20 |
| ChangePasswordSheet | placeholders | policy hint only | — | ok | yes | blocking alert | — | body | `TextInput` + toast | X6 |
| Coach InvitePanel / plan picker | ok | — | plan auto-selected | ok | yes | code shown | revoke-on-close | body | Share flow; explicit plan choice | K18 |
| AddExistingClient | ok | boolean disable | — | ok | yes | closes | — | body | per-field errors | X6 |
| TransferWizard (4 steps) | mixed (3 unlabelled) | — | — | ok | yes | closes | — | footer ✓ | safe default; error surface; consequence copy | A7 |
| PlanBuilder / ExerciseForm (12 fields) | ok | name only (0 sets passes) | — | ok | grey only | navigates away | workout only, own back only | body | footer Save; validation; draft→publish | K14 K15 K23 |
| CoachNutritionEditor | ok | none; no totals | — | ok | grey only | navigates away | none | body | drill-down on mobile; totals; guard | K14 K17 |
| CoachCardioEditor | ok | none | — | ok | grey only | navigates away | none | body | guard | K14 |
| CoachSubscriptionPanel sheets | ok | — | — | ok | grey only | none | — | body | Billing/Account split; confirm extend | K20 |
| AdminAccounts create | ok (1 `error=`) | boolean disable; policy in static hint | 1 | ok | yes | closes | — | body | per-field errors | X6 |
| AdminPlans | ok (1 helper) | `maxClients ≥ 0` hidden | — | ok | grey only | none | — | body | footer; toast | X5 |
| AdminBanners | ok except dates | none (`endAt > startAt` unchecked) | 1 | ok | grey only | none | none | body | Content / Targeting / Schedule sections; validation | A12 |
| AdminGovernance flag | `label` without `htmlFor` | — | — | — | immediate | none | — | — | confirm on global toggle | A10 |
| AdminCoachDetail inline | placeholder-only | none | — | ok | none | none | — | — | proper fields + confirm | A10 Y4 |

Systemic: `Field.tsx` has the full API (`useId`, `htmlFor`, `aria-describedby`, `aria-invalid`, `required`, `helper`,
`error`) and it is used for `error` exactly once (X6); 59 `<label>` without `htmlFor` + 21 `div/p/span.label` (Y4);
no form in the app has an unsaved-changes guard except the workout editor's own back (X4); no form shows a success
toast (X5); only two forms pin their submit (X8).

---

## 10. Charts / data-visualization audit

| ID | Chart | Question it answers | Type verdict | Verdict | Insight text | Period filter | Files |
|---|---|---|---|---|---|---|---|
| V1 | Home "Volume trend" 8-week bars | Am I training more than before? | Bar ✓ (weekly comparison) | Keep; labels `-7w…now` are cryptic → week-start dates; add the one-line insight Progress already has | add | no | `Home.tsx:340-349` |
| V2 | Home hero ring + weekly ring | What's left today? / this week? | Ring ✓ | Keep one representation of today (ring **or** task rows, not both) | ok | — | `Home.tsx:201-285,292-327` |
| V3 | Progress Weight line | Is my weight moving toward the goal? | Line ✓ | Keep; add x-axis dates, goal line, 30/90/all chips; compare to 30d not first-ever | ok | add | `Progress.tsx:249-253`, `charts.tsx:59-128` |
| V4 | Progress Strength e1RM line | Is my top lift improving? | Line ✓ | Keep; add dates | ok | add | `Progress.tsx:320-324` |
| V5 | Progress weekly-volume bars + muscle split bars | Where does my work go? | Bar ✓ | Keep; fix `w-24 truncate` labels | ok | — | `Progress.tsx:398-451` |
| V6 | ExerciseDetail "1RM trend" **bars** labelled `1..N, now` | How has this lift trended? | **Wrong type** — trend over time as categorical bars with session indices | Change to `LineChart` with dates | add | — | `ExerciseDetail.tsx:155-165` |
| V7 | Nutrition ring + 3 macro bars | How much is left today? | Ring + progress ✓ | Keep | ok | — | `Nutrition.tsx:164-199` |
| V8 | Coach Engagement top-8 clients bars | Who is (not) training? | Categorical bars with a time-series "last bar highlighted" style; names sliced to 12 chars | **Remove** from dashboard; the Reports leaderboard already answers it (or a ranked horizontal bar list with a threshold line) | — | — | `EngagementPanel.tsx:13-39`, `charts.tsx:32` |
| V9 | Coach Revenue "Growth" Today/Week/Month bars | Are we gaining clients? | **Misleading** — nested cumulative buckets shown as comparable bars | Replace with an 8-week new-clients series (needs a coach `signupSeries` endpoint) or drop the chart and keep the 3 KPIs | add | add | `AnalyticsPanel.tsx:15-19,80-92` |
| V10 | Coach Reports adherence-by-pillar / vs-retention | Which pillar slips and does it cost retention? | Bar / bar | Keep; add written insight | add | add | `ReportsPanel.tsx` |
| V11 | Admin Overview "Account growth" 8-week bars | Is the platform growing? | Bar ✓ | Keep; add WoW delta line in the members tile (A6) | add | — | `admin/dashboard/OverviewPanel.tsx:139-143` |
| V12 | Admin Analytics role **donut + bar of the same 3 numbers** | Who uses the platform? | Donut ✓ (composition) — the bar is redundant | Keep the donut; drop the bar or make it a per-role 8-week stacked signup series | — | — | `AdminAnalytics.tsx:62-75` |
| V13 | Admin Analytics DAU/WAU/MAU tiles + "Active users (8 days)" bars | Is usage healthy? | Bar ✓ | Keep; add WAU/MAU ratio insight | add | — | `AdminAnalytics.tsx:48-60` |
| V14 | Admin Subscriptions tier-mix + plan-usage bars | Where is revenue / who is near cap? | Bar-as-list ✓ | Keep | ok | — | `AdminSubscriptions.tsx:120-152` |
| V15 | `BarChart` primitive | — | Always highlights the last bar as "now" | Add a `highlightLast` prop (default true) so categorical charts can opt out; `motion-reduce` on the height transition | — | — | `charts.tsx:18-56` |

**Missing charts that would help decisions (do not add for empty space):** a client adherence heat-map calendar
(History already has a month grid — reuse it on the coach overview); a coach-side per-client adherence trend line
(needs a 7-day series per client from the backend, currently only `workouts7d`). Nothing else is missing; the coach
Revenue and Engagement screens have too many, not too few, visual elements.

---

## 11. PWA / device audit

| ID | Area | Category | Current | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|---|
| P1 | Update flow | DEVICE/PWA | `registerType:'autoUpdate'` + `skipWaiting:true` + `clientsClaim:true` → new SW claims immediately while old JS runs; no "new version" prompt; no `ErrorBoundary` → stale lazy chunk = blank screen | `registerType:'prompt'`, non-blocking toast with Reload, top-level boundary that reloads once on a dynamic-import error | **P0** | Config + boundary | `vite.config.ts:16,59-60`, `main.tsx:16-44`, `src/App.tsx` |
| P2 | Push | DEVICE/PWA | No Web Push; local reminders only while a tab is open | VAPID push + `push`/`notificationclick` handlers for messages, check-in requests, plan updates | P1 | Backend + SW | `reminderStore.ts:170-189` |
| P3 | Camera | DEVICE/PWA | `capture="environment"` rear-camera-only on self photos; HEIC dead end; CDN failure invisible | Gallery/Camera buttons; HEIC message; sync chip | P1 | Applied (attribute); rest pending | `PosePhotoPicker.tsx:41`, `AssessmentWizard.tsx:612`, `image.ts:6-27`, `photoStore.ts:83-88` |
| P4 | Offline | DEVICE/PWA | Banner `pointer-events-none`, no retry/dismiss, no safe-area top; `navigator.onLine` only; composer stays enabled offline | Safe-area; Retry; treat repeated tRPC failures as offline; queue/disable sends | P2 | Component | `OfflineBanner.tsx:11-24`, `MessageThread.tsx` |
| P5 | Install / manifest | DEVICE/PWA | No `beforeinstallprompt` CTA or iOS instructions; manifest lacks `id`, `display_override`; forces `orientation:'portrait'` on tablets/desktop; `theme_color` mismatch (`#0B0C0F` vs `#000000`); body safe-area top only | Install card in Settings + iOS hint; `id`, `display_override`; drop hard orientation; unified theme colour; left/right insets in landscape | P2 | Config | `vite.config.ts:19-50`, `index.html:10` (applied), `index.css:19` |
| P6 | Force update / caching | DEVICE/PWA | Force update only in client Settings, no version string, doesn't clear React Query/IDB; no runtime cache for Bunny CDN attachments | Version shown next to the button (all roles); CacheFirst rule for the CDN origin with an entry cap | P2 | Settings + workbox | `Settings.tsx:144-158`, `vite.config.ts:62-117` |
| P7 | Keyboard | DEVICE/PWA | No `visualViewport` handling anywhere (composer, long forms) | Global `--kb-inset` var or `interactive-widget=resizes-content` | P1 | Shell | `index.html:6-9`, `MessageThread.tsx`, `AssessmentWizard.tsx` |
| P8 | Orientation | DEVICE/PWA | Manifest portrait only; `100dvh` chat untested in landscape | Verify landscape or lock at runtime on phones only | P3 | Check | — |
| P9 | Security (out of UX scope, noted) | — | `VITE_BUNNY_API_KEY` ships in the bundle (self-documented) | Signed-URL endpoint behind tRPC | — | — | `bunnyUploadApi.ts:1-10` |

---

## 12. Accessibility audit

| ID | Area | Category | Current | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|---|
| Y1 | Contrast | ACCESSIBILITY | `text-earth-subtle` #7C726C = 4.21:1 on `bg-surface` #0C0A09, 4.01 on card #141110, 3.80 on raised #1B1714 — fails AA everywhere, used ~264× across 98 files at 10–13px; `text-earth-faint` #564E49 = 2.2–2.4:1 | `earth.subtle` ≈ #948A83 (≈5.3:1 on card); `earth.faint` ≈ #6F6660 (placeholder-only) | **P0** | Two token values | `theme/colors.ts:18`, `index.css` |
| Y2 | Dialogs | ACCESSIBILITY | `Sheet`/`DialogHost`: role + Escape + scroll lock ✓; no focus trap (Tab escapes behind), no `aria-labelledby`/`describedby`, no focus restore; DialogHost initial focus on the wrapper not Cancel; `CommandPalette` suspected same | Trap + labelled + restore; initial focus on the safe action | P1 | One fix for every modal | `Sheet.tsx:76-87`, `DialogHost.tsx:30-50`, `CommandPalette.tsx:85` |
| Y3 | Names | ACCESSIBILITY | 4 icon-only buttons without labels (`Nutrition.tsx:229,612`, `Cardio.tsx:245`, `ProgressPhotos.tsx:185`); `<img onClick>` non-focusable (`ProgressPhotos.tsx:49`, `CoachViewPhotos.tsx:39`); hardcoded English labels (TopBar "Back", Sheet "back"/"close", NumberStepper, ReminderBanner, TagInput, WorkoutSession "minimize", VideoManager "play", History month nav, BannerHost) | Translated `aria-label`s; buttons wrapping images | P1 | Applied for the listed labels; images pending | see files |
| Y4 | Forms | ACCESSIBILITY | 59 `<label>` without `htmlFor` (51 `.label`) + 21 `div/p/span.label` as labels; placeholder-only inputs (`AdminCoachDetail.tsx:114,173,177`, Login, ChangePasswordSheet) | `ui/Field` primitives (already wire ids) | P1 | Migration | forms |
| Y5 | Colour-only status | ACCESSIBILITY | `AdminAccounts` bespoke `StatusBadge` text-tint only (suspended vs disabled same red); `.prog` bars have no `role=progressbar`/`aria-valuenow`; `AdminMembers` days-left severity by hue only | `Pill` with dot + text; progressbar roles; threshold text | P2 | Small | `AdminAccounts.tsx:325-334`, `index.css:251-254`, `AdminMembers.tsx:166` |
| Y6 | Live regions | ACCESSIBILITY | Toast/LoadingState/ErrorState/Offline have roles ✓; inline mutation errors are plain `<p class=text-danger>` | `role="alert"` on inline errors | P2 | Sweep | `AdminAccounts.tsx:401,513`, others |
| Y7 | Motion | ACCESSIBILITY | Reduced-motion block covers anim classes and buttons ✓; `charts.tsx:42` bar `transition-[height]` lacks it | `motion-reduce:transition-none` | P2 | One class | `charts.tsx:42` |
| Y8 | RTL | ACCESSIBILITY | Strong (logical props). `Nutrition.tsx:403` unconditional `rotate-180`; two `left-3 rtl:…` pairs should be `start-3` | Fix three sites | P3 | Small | `Nutrition.tsx:403`, `ExerciseLibrary.tsx:55-58`, `WorkoutSession.tsx:487-491` |
| Y9 | Touch targets | ACCESSIBILITY | See X1, C12, C24, K16, K18 | ≥44px | P1 | Token pass | `index.css` |
| Y10 | Keyboard | ACCESSIBILITY | Clean: `DataTable` rows have role/tabIndex/Enter-Space; `.row/.rowline` are real buttons; backdrops are the only non-focusable click targets (Escape wired) | — | — | — | — |

Contrast table (WCAG 2.1 relative luminance, computed): `earth` 16.3–18.1 ✓ · `earth-muted` #ABA19B 7.0–7.8 ✓ ·
**`earth-subtle` 3.8–4.2 ✗** · **`earth-faint` 2.2–2.4 ✗** · `brand` 7.6–8.4 ✓ · `success` 6.7–7.4 ✓ · `warn`
8.8–9.8 ✓ · `danger` 4.8–5.4 ✓ (AA normal; borderline on raised) · `info` 5.5–6.1 ✓. `DialogHost.tsx:34` uses the
legacy `text-slate-300` token.

---

## 13. Performance UX audit

| ID | Area | Category | User-visible impact | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|---|
| F1 | Bundle | PERFORMANCE | All three locale JSONs (~246KB raw) statically imported into the eager entry chunk (index 544KB); every user downloads two languages they never use | Dynamic `import()` per locale in `applyLocale`; remove dead deps (`recharts`, `gsap` are in `package.json` and imported nowhere) | **P0** | i18n loader | `src/i18n/index.ts:4-6`, `package.json` |
| F2 | N+1 | PERFORMANCE | `listMyClients` = relationships then `Promise.all(rels.map(fetchUser))` — 61 requests for 60 clients on every cold load of CoachClients / CoachMessages / Notifications / AdminCoachDetail; CoachClients also runs a per-row relationship query; coach inbox runs one poller per thread | Batched `users.byIds` or server join; `threads.summary` | **P0** | Backend | `coachApi.ts:51`, `CoachClients.tsx:423`, `messagesApi.ts:130-201` |
| F3 | Precache | PERFORMANCE | `Experience-*.js` (556KB three.js landing film) is lazy but precached by `globPatterns **/*.js` → every PWA install downloads WebGL nobody signed-in runs | `globIgnores` | P1 | Applied | `vite.config.ts:52-55` |
| F4 | Layout shift | PERFORMANCE | `return null` while loading → blank then full content (Settings, three coach editors, template editor, WorkoutSession, AcceptInvite, Login); AdminClientDetail shows *wrong* "no plan" then swaps; ExerciseLibrary renders the entire library with remote images | `LoadingState` skeletons; pagination | P1 | Migration | `Settings.tsx:120`, `CoachWorkoutEditor.tsx:78`, `CoachNutritionEditor.tsx:103`, `CoachCardioEditor.tsx:70`, `AdminClientDetail.tsx`, `ExerciseLibrary.tsx:73` |
| F5 | Polling | PERFORMANCE | `CoachViewNutrition` refetches every 15s regardless of visibility; reminders 30s, cloud sync 120s, SW check 60s, messages 5s/20s — none visibility-gated; battery + data on phones | Pause on `visibilitychange → hidden`; 15s → 60s | P1 | Hooks | `CoachViewNutrition.tsx:33`, `reminderStore.ts:173`, `cloudStore.ts:116`, `main.tsx:39`, `messagesApi.ts` |
| F6 | Images | PERFORMANCE | No `<img>` has intrinsic width/height; logos shift on first paint; three photo grids lack `loading="lazy"`; marketing LCP images lack `fetchpriority`/dimensions | Dimensions + lazy + priority | P2 | Attributes | `Splash.tsx:5`, `Login.tsx:71`, `AcceptInvite.tsx:118`, `Onboarding.tsx:65`, `ProgressPhotos.tsx:49`, `AssessmentView.tsx:127`, `PosePhotoPicker.tsx:40`, `marketing/sections/Hero.tsx:62` |
| F7 | Per-client queries | PERFORMANCE | See K22 (40 parallel reads per page) and A3 (3× fetchUser per request) | Aggregates | P1/P2 | Backend | — |
| F8 | Long lists | PERFORMANCE | AdminMedia gallery, AdminMembers, ExerciseLibrary render everything | `usePagination` (already used elsewhere) | P2 | Pagination | `AdminMedia.tsx:76-90`, `AdminMembers.tsx:73-83`, `ExerciseLibrary.tsx:73` |

Positive: React Query defaults are sound (`staleTime 60s`, `gcTime 10m`, `retry 1`, `refetchOnWindowFocus:false`);
SVG charts are cheap and memoised; audit log and history are paginated/scoped.

---

## 14. Consistency audit

| Surface | State | Notes / IDs |
|---|---|---|
| Cards | Consistent (`.card`/`.card-featured`/`.rowline`/`.row`) | Nutrition uses ad-hoc `border-earth-subtle/10` list borders (C7) |
| Buttons | Hierarchy defined (`primary/secondary/tonal/ghost/danger`) but `.chip` doubles as a command (X1); `btn-ghost` used for destructive actions (Copy/Revoke, Release) without `danger` (K13/K18) | Enforce: destructive = `btn-danger` + confirm |
| Icons | Fixed enum ✓; misuse: info icon for "Message" (C22), `plus`/`minus` for duplicate/delete (K16), `timer` for force-update, `chevron rotate-180` for reset (Nutrition:403) | Icon audit |
| Tabs | Two history models: query tabs `replace`, route tabs push (N2, applied); Progress tabs local state (C6); `?tab=` ignored on Library (N5) | One rule |
| Back | 17 hard-coded targets (N1); two chevrons in the workspace (N3) | `useBack(fallback)` |
| Dialogs / sheets | One `Sheet` + one `DialogHost` ✓; confirm usage inconsistent — same action confirmed in one place and not another (Release, delete day vs section, suspend vs everything else) (K13, A10) | Rule: every irreversible action confirms |
| Tables | `DataTable` + `MobileCardList` pairing correct on Accounts/Members, missing on Coaches (A1); Supplements lacks the table (K21); Governance/Audit hand-roll tables | Pair everywhere |
| Status pills | `Pill` ✓ except `AdminAccounts.StatusBadge` (Y5) and `CoachStateBadge` (separate component) | Consolidate |
| Page headers | Three header components (`TopBar`, `PageHeader`, custom sticky headers in Session/CheckIn); eyebrows inconsistent in admin (A5) | Keep two (TopBar mobile-first, PageHeader desktop) with one eyebrow rule |
| Action menus | None exist; Quick Actions are a grid, "Manage" is a sheet, admin uses inline chips | Introduce `ActionMenuSheet` (§18) |
| Search | Palette desktop-only; per-page search inputs styled 3 ways (`input ps-10` + absolute icon vs `SearchField`) | Use `SearchField` everywhere; BrandBar search icon |
| Filters | Two chip-row styles (X11) | `ChipScroller` |
| Empty states | `EmptyState` exists; ~15 high-traffic empties use bare text or `progress.noData` (X7, C18, C21) | Migrate with purpose-written copy |
| Loading | `LoadingState` exists; ~50 sites show "Working…" (X7) | Migrate |
| Destructive actions | See K13, A10, C1 | Confirm + undo toast |

---

## 15. Bugs

| ID | Role | Route | Viewport | Current | Expected | Pri | Fix | Files |
|---|---|---|---|---|---|---|---|---|
| C13 | Client | `/login` | all | Reset "sent" but never delivered; no reset page | Real reset or honest copy + contact | P0 | see §3 | `auth.ts:177-207`, `AnonymousApp.tsx` |
| C14 | Client | gated pages | all | Coachless clients walled; CTA dead-ends | `none` not gated; real no-coach state | P0 | see §3 | `subscription.ts:34`, `Messages.tsx:26` |
| C1 | Client | `/workout/session` | all | One-tap discard | Confirm | P0 | **applied** | `WorkoutSession.tsx` |
| K12 | Coach | template assign | all | Live plan overwritten unconfirmed | Confirm + snapshot | P0 | pending approval | `AssignTemplate.tsx:52` |
| K13 | Coach | several | all | Unconfirmed irreversible actions | Confirm | P0 | **applied** for Approve + Release; rest pending | see §4 |
| K14 | Coach | nutrition/cardio editors | all | Work lost on any navigation | Draft + guard | P0 | pending | editors |
| A7 | Admin | transfer wizard | all | Destructive default | Safe default | P0 | pending approval | `TransferWizard.tsx:41` |
| P1 | All | shell | all | Blank screen after deploy | Prompt + boundary | P0 | pending | `vite.config.ts`, `main.tsx` |
| A6 | Admin | `/admin/subscriptions` | all | Real data lost in redesign | Restored | P1 | **applied** | `AdminSubscriptions.tsx` |
| A8 | Admin | `/admin/accounts` | all | Search over loaded pages only | Server search | P0 | pending | `AdminAccounts.tsx:85-101` |
| M3 | All | messenger | all | Wrong size-limit copy | Per-kind | P1 | **applied** | i18n + `bunnyUploadApi.ts` |
| N6 | Coach/Admin | palette | all | Dead `?tab=` destinations | Real routes | P2 | **applied** | `CommandHost.tsx` |
| N7 | Client | `*` | all | No redirect | `<Navigate replace>` | P2 | **applied** | `ClientApp.tsx:139` |
| C8 | Client | `/settings` | all | "· kg" suffix | Removed | P2 | **applied** | i18n, `Settings.tsx` |
| C25 | Client | video sheet | all | "Unavailable" flash | Loading branch | P2 | pending | `VideoPlayerSheet.tsx:89-104` |
| K25 | Coach | cardio editor | all | Hardcoded `'3×/week'` | Structured | P3 | pending | `CoachCardioEditor.tsx:29` |
| C15 | Client | `/login` | all | Empty submit no-ops; signup creates coach accounts | Validation; role guard | P1/P2 | pending | `Login.tsx` |
| K20 | Coach | subscription sheets | all | Stale initial state (suspected) | Reset on open | P1 | pending | `CoachSubscriptionPanel.tsx:296,339` |
| A10 | Admin | accounts | all | Delete copy contradicts itself | One consequence list | P1 | pending | `en.json:1539-1540` |

---

## 16. UX issues

Consolidated list of the non-bug friction items by role (details in §3–§5): **Client** C3 C4 C7 C9 C10 C16 C17 C19
C22 C23 C24 · **Coach** K1 K2 K3 K4 K5 K8 K10 K11 K15 K16 K17 K18 K19 K20 K21 K24 · **Admin** A1 A9 A11 A12 A13 A14 ·
**Cross-role** X1 X2 X3 X8 X9 X10 X11 X13 X16.

One-tap irreversible actions (the "K13/A10 set"), all needing a confirm and, where possible, an undo toast:

| Action | File:line | Confirmed today? |
|---|---|---|
| Discard workout session | `WorkoutSession.tsx:478` | **now yes** |
| Approve incoming transfer (releases client) | `IncomingTransferRequests.tsx:93` | **now yes** |
| Release client from existing-client search | `AddExistingClient.tsx:299` | **now yes** (already confirmed in `CoachClientDetail:291`) |
| Assign template (overwrites live plan) | `AssignTemplate.tsx:52` | no |
| Extend subscription +30 days | `CoachSubscriptionPanel.tsx:162-164` | no |
| Delete section / exercise in plan | `PlanBuilder.tsx:108-137` | no (day delete is) |
| Delete food / cardio session | `CoachNutritionEditor.tsx:193`, `CoachCardioEditor.tsx:101` | no |
| Send reminders to every client | `CoachCheckInsOverview.tsx:60-81` | no |
| Admin renew / extend / set limit / clear end date | `AdminCoachDetail.tsx:164-179` | no (suspend is) |
| Approve plan-change request (3 writes) | `AdminCoachDetail.tsx:116-117` | no |
| Reject transfer request | `AdminAssignments.tsx:185-187` | no |
| Toggle global feature flag | `AdminGovernance.tsx:64-71` | no |
| Fresh-start transfer (final step) | `TransferWizard.tsx:186-199` | no |
| Reactivate member | `AdminMembers.tsx:86-91` | no |

---

## 17. Missing states

| Where | Loading | Empty | Error | Success | IDs |
|---|---|---|---|---|---|
| ~50 sites | "Working…" text instead of `LoadingState` | — | — | — | X7 |
| RoutineDetail / ExerciseDetail / ExerciseLibrary | — | — | `progress.noData`, no header/back | — | C18 |
| CheckIn wizard | ok | n/a | **none** | summary | C5 |
| CheckInHistory / Notifications / Cardio plan / CoachInfoCard | text / null | generic | **none** (looks empty) | — | C21 |
| ProgressPhotos / freeze request / photo CDN sync | "Uploading…" | `progress.noData` | **swallowed** | none | C20 P3 |
| `/settings/subscription` when `none` | — | **blank body** | — | — | C20 |
| Messages (no coach) | — | wrong copy | — | — | C14 M8 |
| Nutrition `!log` | — | bare text, no header | — | — | C7 |
| Messenger send / upload | icon swap only | ok | modal / silent | none | M1 M2 |
| AdminClientDetail | **wrong data shown** | — | — | — | A11 |
| CoachClients / AdminGovernance / CoachCardioEditor / AddExisting / CoachMessages / CoachSubscriptionPlans | — | bare text, no CTA | — | — | X7 |
| Every mutation (saves, toggles, approvals) | grey button | — | inline `<p>` or nothing | **none** | X5 |
| Editors on navigation | — | — | — | — (no unsaved guard) | X4 K14 |
| Voice recorder | — | button hidden | one generic string | — | M9 |
| Offline | banner ✓ | — | no retry | — | P4 |

Good examples to copy: the assessment done screen, `EmptyState` on the coach dashboard "All good", the transfer
wizard review step, ProgressPhotos' Gallery/Camera buttons, the Add-Client sheet's context-aware back.

---

## 18. Recommended improvements

### 18.1 Quick Actions → "+" action-menu pattern (requested)

- Mobile (≤767): remove the Quick-Actions card grid from the coach dashboard Overview and Content tabs. Add a
  compact `icon-btn` (≥44px hit area, `plus` icon, `aria-label`) at the **end** of the page header's action slot.
- Tapping it opens a `Sheet` (`size="sm"`, title "Quick actions") listing every action as a `.rowline`: icon chip
  (`tk-ic`) + title + optional one-line supporting text (e.g. "Add client — invite link or existing account"),
  chevron. Permission/plan gating stays exactly as today (`canWrite`, `useCan`, at-limit states render the row
  disabled with the reason as supporting text).
- Tablet/desktop (≥768): keep the visible grid where space allows; the "+" may remain as a secondary trigger.
- Reuse the same `ActionMenuSheet` on: `CoachClients` (already a "+" opening a sheet — the precedent), Templates,
  Exercise Library (add / import starter / bulk), Admin Accounts (create / export), Admin Banners (new), Admin Plans
  (add), client Nutrition (add food / add water / add supplement), client Cardio (start type).
- Files: new `src/components/ui/ActionMenuSheet.tsx`; `dashboard/OverviewPanel.tsx`, `ContentPanel.tsx`,
  `CoachDashboard.tsx` header; call sites above.

### 18.2 Navigation rules
`useBack(fallback)` hook (origin-aware); all tabs `replace`; sheets push a history entry on mobile; deep links carry a
parent; `/workout/session/:date`; workspace owns the only back chevron; Progress/versions inside the layout route.

### 18.3 Feedback layer
Adopt `showToast` on every mutation success; `SubmitButton` (pending label + spinner + offline title); migrate
`LoadingState`/`EmptyState`; `useUnsavedGuard(dirty)` with `useBlocker` + `beforeunload`; `Field.error` on submit.

### 18.4 Tokens
`.chip/.btn-sm/.icon-btn/.seg button/.sec-link` ≥44px hit areas; `earth.subtle`/`earth.faint` lightened;
`--brandbar-h/--bottomnav-h/--topbar-h` CSS vars; `.split/.pane-a/.pane-b` utilities; `ChipScroller`; `line-clamp-2`
titles; `.stat-label` uppercase off in `ar`.

### 18.5 Simplifications
Home: one "today" representation, one "this week" block, move trend/recent behind Progress. Coach dashboard: header
stats **or** KPI grid; Overview + Engagement only; remove the Growth chart. Admin: merge Accounts/Members; keep the
donut, drop the duplicate role bar. Workspace: 5 tabs + More on mobile.

### 18.6 Dashboards — first-viewport answers
- **Client Today:** "What do I do now?" → hero (start/resume) + 3 task rows + check-in card. ✓ after C4.
- **Coach:** "Who needs me today?" → headline + featured at-risk client + needs-attention list with CTAs, then 4 KPIs.
  Currently pushed below checklist/banner/header stats/6 KPIs/quick actions (K2).
- **Admin:** "Is anything waiting on me and is the platform healthy?" → headline + needs-review list + 6 KPIs + growth.
  ✓ structurally; add the lost client-MRR/ending-soon data (A6) and WoW delta.

---

## 19. Priority roadmap

**Pass A — safety & dead-ends (P0, ~1 week):** C13 C14 C1✓ K12 K13 (rest) K14 A7 A8 P1 Y1 F1 F2.
**Pass B — back-flow & history (P1, 2–3 days):** N1 (`useBack`), N3 N4 N8 K6 K8-routing C6 C2.
**Pass C — mobile ergonomics & tokens (P1, ~1 week):** X1 X2 X3 X8 X9 X10 X11 X16 A1 C24 K16-targets Y2 Y3 Y4.
**Pass D — feedback states & primitives adoption (P1–P2, ~1 week):** X5 X6 X7 X4 C5 C18 C20 C21 A11 F4 M1 M2.
**Pass E — coach editor workflow (P0/P1, 2 weeks, product decisions):** K15 K16 K17 K19 K20 K23 V8 V9 K1 K2 K3 K11.
**Pass F — admin ops hardening (P1, ~1 week):** A2/A10 A9 A12 A13 A14 A3 A4.
**Pass G — messenger & device (P1–P2, 2 weeks):** M4 M5 M6 M7 M8 M9 P2 P4 P5 P6 P7 C27-rest.
**Pass H — performance (P1–P2, ~1 week):** F3✓ F4 F5 F6 F7 F8 K22.
**P3 polish** at the end: C11 C12 K25 A5 N11 Y8 V15 chart labels.

---

## 20. Quick wins (≤1 hour each, no product decision)

Applied in this audit pass (see the commit): C1 discard confirm · C8 memberSince suffix · C7 "Custom food" i18n ·
Y3 four aria-labels + all hardcoded English aria-labels → i18n · N6 dead palette routes · N7 client `*` redirect ·
N2 workspace tabs `replace` · X9 BulkActionBar safe-area · C5 CheckIn submit error state · M3 per-kind upload size
strings · P3 remove static `capture="environment"` · P5 `theme_color` unified · F3 Experience chunk out of precache ·
A6 client-MRR + client "ending soon" restored on Admin Subscriptions · K13 confirms on transfer Approve and
Release-from-search.

Still open, same size: `motion-reduce` on chart bars (Y7) · `Nutrition.tsx:403` rtl rotate (Y8) · dead `openThread`
key + `stopRecording` → `sendRecording` rename (M) · `frequency` literal (K25) · `progress.noData` → purpose-specific
empties on Workout/Library/Photos/Cardio (C11 C23) · K5 make the check-ins KPI clickable · `CoachViewNutrition` 15s →
60s (F5) · `loading="lazy"` on the three photo grids (F6) · `role="alert"` on inline errors (Y6) · manifest `id` +
`display_override` (P5) · `VideoPlayerSheet` loading branch (C25) · A5 eyebrow convention · `BarChart highlightLast`
prop (V15) · `ExerciseDetail` bars → line (V6) · Progress tab in URL (C6) · `ExerciseLibrary` `?tab` (N5) · WeekStrip
disabled styling (C22) · RestTimerBar explicit pause (C22).

---

## 21. Larger UX projects

| Project | Goal | Scope | Key files | Risk |
|---|---|---|---|---|
| Client onboarding & lockout repair | No client can be permanently stuck | Password reset (email + page), coachless state, assessment split at step 4 with "finish later", gate screens with contact + sign-out, invite validation | `auth.ts`, `AnonymousApp.tsx`, `subscription.ts`, `SubscriptionGate.tsx`, `AssessmentWizard.tsx`, `Login.tsx`, `AcceptInvite.tsx` | Backend email provider; assessment data contract unchanged |
| Coach workspace v2 | Review 30 clients without 30 round-trips | Client switcher + ◀/▶, 5 tabs + More, sticky header, `replace` history, Progress/versions inside the layout, layout-level unsaved guard, real overview KPIs, check-in review queue | `CoachClientWorkspaceLayout.tsx`, `CoachApp.tsx`, `CoachClientDetail.tsx`, `CoachCheckIns.tsx` | Route nesting changes affect e2e specs |
| Plan-editor workflow | Build a day in a third of the taps, never lose work | Multi-select picker with inline sets/reps/rest, drag reorder, correct icons, draft → publish, save-in-place + toast, client-context strip, macro totals, confirm/undo on deletes, coach video upload, empty-state actions | `PlanBuilder.tsx`, `ExercisePickerSheet.tsx`, `ExerciseForm.tsx`, `CoachWorkoutEditor.tsx`, `CoachNutritionEditor.tsx`, `CoachCardioEditor.tsx`, `VersionActions.tsx` | Product decision on draft/publish semantics |
| Tablet tier + SplitPane | Make 768–1023 a real layout and fix the 1024 squeeze | `SplitPane` primitive, `md:grid-cols-2` lists, DataTable at `md` with fewer columns, pane-b sizing | `ResponsiveShell.tsx`, `index.css`, list pages | Visual regression on desktop e2e |
| Tap-target & contrast token pass | Every control ≥44px; AA everywhere | `.chip/.btn-sm/.icon-btn/.seg/.sec-link`, `earth.subtle/faint`, `.stat-label` in `ar`, CSS layout vars | `index.css`, `theme/colors.ts`, `tailwind.config` | Global visual shift; review dense admin tables |
| Feedback layer | Every action visibly succeeds or fails | Toast adoption, `SubmitButton`, `LoadingState`/`EmptyState` migration, `Field.error`, `useUnsavedGuard`, `role=alert` | `toastStore`, forms, ~50 loaders | Mechanical but wide |
| Messenger v2 | Chat that feels live on a phone | Pending/failed bubbles, XHR progress, `unreadSummary` endpoint + one poller, visibility-gated polling, keyboard-aware composer, load-older, jump-to-latest, full audio flow (§8) | `MessageThread.tsx`, `messagesApi.ts`, `useVoiceRecorder.ts`, backend | Backend endpoint; iOS keyboard testing on device |
| Admin ops hardening | Powerful without being dangerous | Server-side search, People merge, confirmations with consequences + transactions, capacity-aware assignment, banner live-state, actor on history, permission-aware palette + BrandBar search, `PermissionState` screens | `AdminAccounts.tsx`, `AdminMembers.tsx`, `AdminCoachDetail.tsx`, `AdminAssignments.tsx`, `AdminBanners.tsx`, `CommandHost.tsx`, `BrandBar.tsx` | IA decision on Accounts vs Members |
| PWA hardening | Never a blank screen; notified on the device | Prompt-based SW update + error boundary, Web Push, install CTA + iOS hint, locale code-splitting, N+1 removal, CDN runtime cache, keyboard var | `vite.config.ts`, `main.tsx`, `App.tsx`, `i18n/index.ts`, `coachApi.ts`, SW | Push needs VAPID + backend |
