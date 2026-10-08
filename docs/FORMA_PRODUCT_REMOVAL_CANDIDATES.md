# Forma: product removal candidates (Phase A)

Audit 2026-10-04 · repo `development` @ `e7663ab` (website work committed today) · production runs RC2 `cf3a5d9` (from project notes; not re-verified).
**Nothing was deleted, moved or changed in Phase A.** This is the single deletion map for Phase B. Every candidate cites file:line or browser evidence (BV-xx, see `docs/product-audit/` and DOC_SPEC).

## Bottom line
1. There are **88 candidates**:
   - **24** are safe deletions with no user impact.
   - **54** need a product decision.
   - **4** should be kept for technical reasons.
   - **6** need investigation first.
2. **Two P0s should not wait for the redesign.**
   - Client **"Reset all data"** deletes the client's synced history on the server, which is everything the coach reads. The copy promises "local data" (RM-56).
   - **Coach and admin sessions run the client sync engine**, which can push a client's unsynced logs into the coach's account (RM-81).
3. **The old single-user tracker still ships to paying clients:** Video manager (always empty), Import data, "Update the app", local reminders titled "Gym Tracker", sync badges, a hard-coded training guide, an onboarding overlay, demo seed data, and 131 MB of mp4 files in every deploy (RM-56 to RM-65).
4. **Duplication causes most of the clutter.** The same KPI appears up to 3× with different labels. The adherence ranking appears 5×, plan status 5×, and subscription UI 3×. A second "view as client" layout sits beside the client workspace, and two hamburger menus repeat the bottom bars.
5. **Dead code to delete:** 14 unreachable modules, about 35 dead service stubs, 24 `cloudAvailable()` and 21 `'local-user'` checks that are always true, at least 240 unused i18n keys in each of 3 locales, and 11 API procedures with no live caller.
6. **Keep:** the stale-chunk reload guard, the deferred service-worker update (until a safe-point update UX replaces it), the `gym-tracker` IndexedDB name and the `coachPlanTiers` collection name.

## How to read this
- **Header line of each candidate:** Priority · Effort · Impact · Action · Certainty · Verified.
- **Certainty tags:**
  - **SAFE TO REMOVE**: nothing user-visible depends on it.
  - **LIKELY REMOVE — PRODUCT DECISION**: it is visible, or it encodes a product choice.
  - **KEEP FOR TECHNICAL REASON**
  - **UNKNOWN — INVESTIGATE**: needs prod data or the owner.
- **Priority:** P0 = data loss, security or an unusable critical flow; P1 = major damage to normal use; P2 = important UX, performance or hygiene; P3 = minor.
- **Effort:** S <1 day, M 1–3 days, L 1–2 weeks, XL >2 weeks.
- **Owners:** other Phase A docs that own the user-facing detail are cited as CO (03 coach), EX (07), FD (08), MS (09), NT/TS (10), PWA (11), PF (13), JR (15). The client audit (CL) is cited by evidence, not ID.
- **Out of scope:** the public website (`src/pages/website`, its routes in `AnonymousApp.tsx`, `public/website`). It is never proposed for removal. The old landing (`/landing-v1`) and `/experience` are in scope.
- **Method:**
  - Import graph of all `src/ api/ scripts/ e2e*/` files, parsed with the repo's TypeScript compiler and covering static, type-only, dynamic and `vi.mock` imports.
  - Route ↔ link matrix.
  - i18n key audit.
  - tRPC procedure ↔ caller scan.
  - The HEAD build in `dist/` (`sw.js` precache, entry-chunk contents).
  - Browser evidence from the isolated stack. Raw numbers are in the appendix.

## Counts
| Section | All | SAFE | LIKELY/PRODUCT | KEEP | UNKNOWN | P0 | P1 | P2 | P3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Safe code deletion (incl. repo hygiene) | 16 | 13 | 2 | 0 | 1 | 0 | 0 | 1 | 15 |
| B. Duplicate product functionality | 17 | 0 | 17 | 0 | 0 | 0 | 4 | 13 | 0 |
| C. Navigation to remove/merge | 7 | 1 | 6 | 0 | 0 | 0 | 3 | 3 | 1 |
| D. Low-value cards/metrics | 10 | 0 | 10 | 0 | 0 | 0 | 2 | 6 | 2 |
| E. Legacy commercial UI | 5 | 1 | 2 | 1 | 1 | 0 | 0 | 1 | 4 |
| F. Dead components/routes (incl. legacy tracker features) | 16 | 4 | 10 | 0 | 2 | 1 | 2 | 4 | 9 |
| G. Old cache/PWA workarounds | 9 | 2 | 3 | 3 | 1 | 0 | 1 | 3 | 5 |
| H. Duplicate data/state systems | 8 | 3 | 4 | 0 | 1 | 1 | 0 | 3 | 4 |
| **Total** | **88** | **24** | **54** | **4** | **6** | **2** | **12** | **34** | **40** |

## Do first (top 10)
| # | ID | Why first |
|---|---|---|
| 1 | RM-56 | P0. "Reset all data" wipes the coach-visible server history with one confirm. |
| 2 | RM-81 | P0. The client sync engine runs for coach and admin, and can capture a client's queued data. 11 wasted calls every 2 min. |
| 3 | RM-57 | The legacy video library is visible and empty, sits behind the dead video tap, and adds 131 MB to every deploy. |
| 4 | RM-41 + RM-17 | The coach dashboard: 22 cards across 4 tabs, a dead "Quick actions" section on phones, and a checklist shown to a 10-client coach (BV-24). |
| 5 | RM-44 | Client Today: the date 4×, tonnage tiles, a duplicate chart, a fake "Start empty workout" (BV-16). |
| 6 | RM-20 | "View as client" is a second client layout with colliding tab names. |
| 7 | RM-21 | The client's coach relationship is spread over about 7 surfaces (BV-19, BV-33). |
| 8 | RM-34 | Two hamburger menus repeat every tab. |
| 9 | RM-67 | UI that promises features that don't exist. |
| 10 | RM-72 | 614 KB of marketing images and CSS in every install precache. |

---

## A. SAFE CODE DELETION

### RM-01 — Unreachable modules and unused design-system primitives
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** 14 modules (545 lines) that nothing imports:
  - `components/ui/{DashboardCard,OfflineState,PermissionState,Page,ResponsiveGrid}.tsx`
  - `lib/starterLibrary.ts`
  - `pages/RolePlaceholder.tsx`
  - `theme/{index,breakpoints,elevation,motion,radius,spacing,typography}.ts`

  Also unused tokens: `spacing.touch`, `btn-light`, and the `gold/teal/violet/rose` class tokens. Keep `theme/colors.ts`, which has 9 importers.
- **Why remove:** No app, test, script or api file imports them. `starterLibrary.ts` is the orphaned original of `api/coach-assets/_lib/starterLibraryData.ts`, whose header says "keep in sync by hand" (`:4-8`).
- **User impact:** none. **Technical impact:** −545 lines and one hand-sync rule. No bundle change (already tree-shaken).
- **Risk:** none. **Dependencies:** `scripts/check-boundaries.mjs:33`; `docs/DESIGN_SYSTEM.md:6,16,36-38`; `docs/ARCHITECTURE.md:100-102`.
- **How to verify:** `tsc -b`; re-run the import graph; `git grep` each name. **Recommendation:** delete and update the docs. Adopt Offline/Permission states in RM-32 rather than keep dead files.

### RM-02 — Local-only-mode branches that can never run
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - `cloudAvailable()` always returns `true` (`data/dataSource.ts:26-28`). It has 24 calls in 21 files.
  - The session uid is always a server id (`sessionStore.ts:110,123,133,150`), so the 21 `'local-user'` checks never fire.
  - Dead blocks:
    - `App.tsx:50,64`
    - `ClientApp.tsx:83-84`
    - the seed branch `bootstrap.ts:46-104`
    - `Settings.tsx:323-353` (age/weight/height/goal/activity editors), `:199-201`, `:35-36`, `:478-479` ("Add Firebase keys")
    - the Onboarding sign-in mode `:25-27,62-71,114-152`
    - the deprecated cloudStore `signIn`/`signOut` and the `'local'` status (`cloudStore.ts:21-32,124-131`)
- **Why remove:** constant-true guards. Code readers think a local-only product still exists.
- **User impact:** none. **Technical impact:** about 150 lines of dead JSX and logic; simpler hooks.
- **Risk:** low. Keep `enabled: !!uid` guards. **Dependencies:** `SubscriptionGate.test.tsx:8` mocks `cloudAvailable`.
- **How to verify:** replace with `true`, then let tsc and `noUnusedLocals` flag the leftovers; run vitest and e2e3 30-client. **Recommendation:** one commit that removes the helper and every check.

### RM-03 — Firestore-era service stubs (about 35 dead functions)
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** exported functions that nothing imports. Several are explicit no-ops or always throw:
  - `coachApi.ts` "assigned plans & templates (legacy — no backend route)" `:265-299`, plus `saveClientProfile:116`, `fetchClientCardioLogs:201`, `broadcastAnnouncement:261`, `get/setCoachTargets:303,309`
  - `coachAssetsApi.ts:275,279,284` (nutrition-template CRUD)
  - `coachClientsApi.ts:58,78,107,200,263` (`archiveAndClearCoachData` no-op)
  - `coachPlanApi.ts:35,41,47` (`markTrialNotified` and `bumpActiveClientCount` no-ops)
  - `inviteApi.ts:53,154` (always throws), `:168` (no-op), `:185`
  - `notificationsApi.ts:34` (`notify` no-op), `:92,146`
  - `messagesApi.ts:190`, `checkInApi.ts:98`, `starterLibraryApi.ts:34`
  - types `AssignedPlan`/`PlanTemplate` (`types/index.ts:838,869`)
- **Why remove:** misleading API surface ("kept for signature compatibility"). The palette and dashboard mentions of `createTemplate` are i18n keys, not calls.
- **User impact:** none. **Technical impact:** about 400 lines.
- **Risk:** low (tsc catches callers). **Dependencies:** comment `notificationsApi.ts:21-31`.
- **How to verify:** `git grep "<name>("`. **Recommendation:** delete per file. Coach-set targets and nutrition templates go to the build-or-drop decision in RM-67.

### RM-04 — The trial-expiry reminder chain is a pure no-op
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** `checkTrialExpiry()` runs on every coach dashboard mount (`CoachDashboard.tsx:13,36-38`). It calls `markTrialNotified()` and `notify()`, both of which have empty bodies (`coachPlanApi.ts:41-44`, `notificationsApi.ts:34-36`). Also `CoachPlan.trialNotified` (`types/index.ts:193`, `api/coach-plans/_data.ts:77,269`).
- **Why remove:** no notification is ever produced. `trial_expiring` is never created (NT-08).
- **User impact:** none. Product gap: Forma has no trial reminders today. **Technical impact:** −56 lines and one fallback fetch.
- **Risk / deps:** none. **How to verify:** read the two empty bodies. **Recommendation:** delete. If reminders are wanted, build them in `api/cron/daily-maintenance.ts`.

### RM-05 — Unused exports, helpers and declaration-only types
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - src: `lib/utils.ts` (`dowOf:25`, `clamp:79`, `sum:145`, `parseRestInput:156`), `lib/password.ts:14`, `services/auth/permissions.ts:31` (`useFlag`), `roles.ts:53,56`, `config/nav.ts:227` (`NAV`), `components/Sheet.tsx:137` (`ResponsiveDialog`), `components/charts.tsx:365` (`Spark`)
  - api: `api/admin/_lib/db.ts:13`, `api/client/_lib/db.ts:34`, `api/coach-assets/_lib/access.ts:23`, `api/coach-plans/_capacity.ts:162`, `api/coach-clients/_service.ts:105`
  - 9 types used only where declared (`types/index.ts:804,1320,1410`, `api/client/_lib/types.ts:321-363`, …)
  - About 60 more exports that are used only locally, where only the `export` keyword can go (appendix)
- **Why / user / tech:** dead surface. No user impact; a smaller API for readers. **Risk:** none.
- **How to verify:** `unused-exports` re-run; tsc. **Recommendation:** delete or un-export.

### RM-06 — Dead store actions and unused derived state
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - Store actions with no UI caller: `nutritionStore.setCreatine` (`:18,168`), `cardioStore.addSteps` (`:28,82`), `settingsStore.add/removeMeasurementPart` (`:15-16,64,73`), `habitStore.toggle` (`:22`).
  - `habitStore` computes 5 streaks, but the UI reads only `streaks.workout` (`Home.tsx:317`).
- **Why remove:** the streak recompute scans the full history on every meal or cardio tap and on every load (PF-23).
- **User impact:** none. **Technical impact:** less code and less CPU per tap.
- **Risk:** none. **Dependencies:** `refreshStreaks` callers `habitStore.ts:90,141`.
- **How to verify:** grep the callers. **Recommendation:** delete the actions; compute only the workout streak.

### RM-07 — Undefined CSS class names in JSX (prototype leftovers)
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** classes that generate no CSS:
  - `h3` (`SubscriptionHistory.tsx:50`, `WorkoutSession.tsx:455`)
  - `bd`/`bd-s` (`CheckIn.tsx:143-192`)
  - `num` (`WeekStrip.tsx:63`, `Cardio.tsx:162`, `Nutrition.tsx:199,213`)
  - `thin` on `.prog` (6 files)
  - `tbl-wrap` (`AdminGovernance.tsx:112`), `hdr` (`Progress.tsx:503`), `ring-1.5` (`History.tsx:114`)

  Found by the visual audit's Tailwind compile.
- **Why remove:** they do nothing, and readers assume styling that isn't there. For example, the Nutrition hero number renders in Poppins.
- **User impact:** none from removal. **Technical impact:** honest markup.
- **Risk:** none. **Dependencies:** the visual-system type roles.
- **How to verify:** recompile Tailwind with the repo config. **Recommendation:** remove, and restore intent with real type roles in the VS rebuild.

### RM-08 — Unreferenced data files
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** `src/data/seed/videoLinks.json` (3 KB) and `public/data/exercise-taxonomy-ar.json` (1.5 KB, deployed to `/data/`). Neither is referenced (`git grep`).
- **Why / user / tech:** dead files; no user impact. **Risk / deps:** none.
- **How to verify:** `git grep` both names. **Recommendation:** delete. Fold any Arabic taxonomy into the catalog i18n (EX-12).

### RM-09 — Unused i18n keys and obsolete copy
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** at least **240 of 2,218** keys are unused in each locale (720 entries).
  - Largest groups: `adminPlans` 33/33, `admin` 32/138 (incl. 7 `admin.tabs.*`), `coachPlan` 30/34, `coach` 18/53, `adminCoaches` 15/42, `landing` 14/87, `coachDash` 13/105.
  - No keys are missing; en/ar/ar-eg are at full parity.
  - Obsolete strings:
    - `settings.localOnly` ("Add Firebase keys…"; dead branch)
    - `landing.features.secure.desc` ("Built on Firebase", shown on `/landing-v1`; **false**)
    - `video.missingFile` ("add a matching .mp4 to public/exercise_videos/")
- **Why remove:** translator load, and wrong claims.
- **User impact:** none. **Technical impact:** `en.json` (102 KB) ships in the entry chunk, so this is about 11% of it.
- **Risk:** low. Keys used through template prefixes were counted as used, so 240 is a lower bound. **Dependencies:** RM-51, RM-62.
- **How to verify:** re-run the i18n audit after pruning; vitest. **Recommendation:** prune one namespace per PR.

### RM-10 — Stale Firebase/Firestore comments
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** 97 mentions in 41 code files, all comments. There is no `firebase` dependency and no `firestore.rules` file.
  - Misleading: `services/auth/permissions.ts:10` ("Firestore rules enforce the real boundary"; it is actually `api/_lib/rbac.ts`), `types/index.ts:52,69,72`, `services/video/VideoStore.ts:5`.
  - "live via onSnapshot" (`useCoachMessageUnread.ts:8`, `useNotifications.ts:35`); it is polling now.
  - api comments that point at a non-existent `firestore.rules` (`_lib/rbac.ts:8`, `client/_lib/access.ts:7`, `coach-clients/_data.ts:62`).
- **Why / user / tech:** they mislead maintainers about security and realtime. No user impact. **Risk / deps:** none.
- **How to verify:** `git grep -i firestore -- src api`. **Recommendation:** rewrite the ~12 misleading comments; trim the rest when touched.

### RM-11 — API procedures with no live caller
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** of 145 procedures:
  - **Never called from src:** `coachNotes.update`/`delete` (`clientCoachNotes.ts:67,80`), `checkIns.delete` (`clientCheckIns.ts:157`), `measurements.get`/`delete` (`:166,211`), `logsCardio.get` (`clientLogs.ts:47`).
  - **Called only from dead wrappers:** `coachPlans.createTrial` (`coachPlans.ts:21`, "kept for legacy callers"), `profile.save` (`clientProfile.ts:34`), `coachTargets.set`.
  - **Keep:** `health.ping`, and `auth.refresh` (raw fetch at `platformApi.ts:38`).
- **Why remove:** dead attack and maintenance surface. Some are latent features (coach edits or deletes a note; coach sets step and cardio targets).
- **User impact:** none today. **Technical impact:** smaller router and test surface.
- **Risk:** api tests cover them (`coverage.test.ts`, `client.test.ts`); remove those tests with them. **Dependencies:** RM-03, RM-67.
- **How to verify:** `git grep "trpc.<ns>.<proc>"`. **Recommendation:** remove `createTrial` now. Decide build vs drop for the note and target procedures.

### RM-12 — Legacy one-off scripts
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - The Google-Sheet import chain for the local tracker: `scripts/importSheet.ts` (re-implements `sheetParser.parseCsv`; `package.json:16 import:sheet`), `extractFromXlsx.mjs` (hard-coded Sheet ID `:8`; sole user of the `fflate` devDependency) and `extractVideoLinks.gs` ("for the Gym Tracker app's Import screen").
  - `smoke.mjs` (`package.json:18 test:smoke`) visits `/workout` and `/settings/videos` without login, so it now only exercises the login page.
  - `makeIcons.mjs` writes **green dumbbell** icons over the brand icons.
- **Keep:** mongo index/migration/reconcile/seed-admin, wger importer, `resetTestExerciseLibrary`.
  - Wire `check-boundaries.mjs` into an npm script: docs say it "runs in the gate", but nothing runs it.
  - Flag the demo seeders (`seed-demo-*.mjs`), which call the **production** API with self-signed JWTs.
- **Why / user / tech:** dead tooling, plus one script that destroys brand assets. No user impact. **Risk:** none.
- **Dependencies:** `package.json:16,18`, `fflate`, `.claude/settings.local.json:7`, `AUDIT_REPORT.md:135-136`, `docs/QA.md:14-18`.
- **How to verify:** `git grep` the script names. **Recommendation:** delete the 5 and their npm scripts.

### RM-13 — Tracked repo clutter at the root
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where (all tracked in git):**
  - `gym tracker (1)/`: 110 files, 8.1 MB design export. It is in `.vercelignore` but not `.gitignore`.
  - `AUDIT_REPORT.md` and `FIXES.md` (June, Firebase era) and `FORMA_AUDIT_REPORT.md` (Sept 10), all superseded by `docs/audit-phase2` and `docs/FORMA_FINAL_*`.
  - `CLEANUP_COMMAND*.ps1`: **destructive one-shot scripts.** Re-running deletes `e2e/` and `playwright.config.ts` (`CLEANUP_COMMAND.ps1:6-7,27`).
  - `competitor-analysis/` (4 Office files).
  - Three `*.tsbuildinfo` files, rewritten by every `tsc -b`.
  - `.claude/settings.local.json`.
  - `docs/phase1-coach-onboarding.patch` (97 KB).
- **Why / user / tech:** noise, risky re-runs, churn in every diff. No user impact. **Risk:** none (archive elsewhere if wanted).
- **How to verify:** `git ls-files`. **Recommendation:** `git rm`; add `*.tsbuildinfo` and `gym tracker (1)` to `.gitignore`.

### RM-14 — The old `e2e/` suite and `playwright.config.ts` target production
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** 48 files. `baseURL: 'https://www.useforma.fit'` (`playwright.config.ts:19`) is the default config for a bare `npx playwright test`.
  - The specs **mutate production**: banners (`e2e/admin/banners.spec.ts:10`), library items and templates (`e2e/coach/library.spec.ts:12-189`), message deletes (`e2e/messages/messenger-v3.spec.ts:118`).
  - Stale assertions: `e2e/coach/client-activity.spec.ts:33` expects the `/activity` URL; a "demo_test_tier" test targets the removed multi-tier UI.
  - Local production session files sit in `e2e/.auth/*.json` (gitignored).
- **Why remove:** one careless command writes to production. The isolated `e2e3/` harness replaces it (`e2e3/README.md`).
- **User impact:** none. **Technical impact:** one fewer test system.
- **Risk:** losing coverage that is not ported. **Dependencies:** `playwright.local.config.ts` (runs `e2e/navigation/**` locally).
- **How to verify:** diff coverage against e2e3 specs. **Recommendation:** port anything unique (e.g. navigation) to e2e3, then delete `e2e/`, `playwright.config.ts` and `e2e/.auth`.

### RM-15 — Stale architecture and QA docs
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - `docs/ARCHITECTURE.md:46-60`: bundle table with a "firebase 574 KB" chunk.
  - `docs/QA.md`: "PLANNED / NOT YET IMPLEMENTED", `e2e/fixtures/firestore.ts`.
  - `docs/features/design-system.md:25-26`: names tests that no longer exist.
  - `docs/DESIGN_SYSTEM.md:16,36-38`: unused primitives.
  - `docs/BETA_READINESS_PLAN.md`, `PHASE1_SUMMARY.md` (June).
  - `README.md:3,13,158-179`: "Capacitor-ready".
- **Why / user / tech:** they misdirect Phase B. No user impact. **Risk:** none.
- **How to verify:** read each against HEAD. **Recommendation:** archive to `docs/archive/`, or rewrite after Phase B.

### RM-16 — Untracked local clutter and stale git worktrees
**P3 · S · LOW · REMOVE · UNKNOWN — INVESTIGATE · CODE-CONFIRMED**
- **What / where (not in git):**
  - `e2e-out/` **15 GB**
  - 30 × `test-results*/` (207 MB)
  - `e2e-report/` 6 MB
  - `.vercel/` 172 MB
  - `.kilo/worktrees/brazen-servant`: a full stale copy (157 MB) that pollutes repo-wide greps
  - `design_handoff_gym_tracker/`
  - `git worktree list`: `/tmp/fadmin`, `/tmp/forma-admin`, `/tmp/forma-phase1`, `/tmp/fu` (locked), `D:/forma-rc1`, `.kilo/…`
- **Why / user / tech:** disk use and search noise. No user impact. **Risk:** the owner may still need a worktree.
- **How to verify:** `git worktree list`; `du -sh`. **Recommendation:** the owner prunes these. It is outside history and safe once confirmed.

---

## B. DUPLICATE PRODUCT FUNCTIONALITY

### RM-17 — Coach dashboard "Clients / Engagement / Content" tabs repeat other destinations
**P1 · M · HIGH · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-24)**
- **What / where:** `/coach/dashboard?tab=` (`CoachDashboard.tsx:44-49`).
  - `ClientsPanel` (5 cards + Pending assessments + Inactive lists) repeats `/coach/clients` and `/coach/assessments`.
  - `EngagementPanel` (5 cards + an "Adherence overview" section whose only content is a sentence saying the ranking moved, `:29-35`) repeats Reports.
  - `ContentPanel` uses 4 "MetricCards" whose value is a word (`:24-25`), plus quick actions that repeat Library and Templates.
  - The tabs overflow at 390 px (BV-24).
- **Why remove:** 22 cards across 4 tabs. Three tabs are navigation or vanity, and one section exposes development history.
- **User impact:** a coach loses nothing they can't reach in one tap. **Technical impact:** −3 panels (~250 lines).
- **Risk:** low. **Dependencies:** `e2e3` dashboard specs; `?tab=` deep links; CO-17.
- **How to verify:** list each panel's items against their destinations. **Recommendation:** remove the tabs. The Overview attention list becomes the seed of the Today queue (RM-41).

### RM-18 — The workout-adherence ranking exists in 5 places
**P2 · S · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - `/coach/adherence` (`CoachAdherence.tsx`, its own 2 queries; mobile rows are dead `<div>`s `:86-97`; menu `nav.ts:117`)
  - the Reports ranking (`ReportsPanel.tsx:18,77-106`)
  - the Clients desktop "Adherence" column
  - ClientsPanel "Inactive this week"
  - the Engagement stub
- **Why remove:** same sort, same number, five places (CO-34, CO-35).
- **User impact:** one fewer menu item. **Technical impact:** −1 route, −1 page (~120 lines), −2 queries.
- **Risk:** low; `/coach/adherence` has no other inbound link. **Dependencies:** `nav.ts:117`, `CoachApp.tsx:39,115`.
- **How to verify:** routes matrix (appendix). **Recommendation:** keep one sortable "Adherence 7d" column on Clients; delete the page and the Reports ranking.

### RM-19 — Check-ins overview and Assessments list are filtered rosters; the check-in review UI is built twice
**P1 · M · HIGH · MERGE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-31)**
- **What / where:**
  - `/coach/checkins` (`CoachCheckInsOverview.tsx`: queue sheet `:199-234`, bulk reminders) and `/coach/assessments` (`CoachAssessments.tsx`) are menu-only.
  - The per-client tab has its own review row (`CoachCheckIns.tsx:82-137`), so the review mutation and feedback UI exist twice.
  - The dashboard "Check-ins to review" card is a dead end (`OverviewPanel.tsx:110`).
- **Why merge:** the best mechanic (the sequential review queue) is buried, and review behaves differently in two places (BV-31: "Request" is primary while a submitted check-in waits).
- **User impact:** reviews happen from one queue. **Technical impact:** −2 pages; one review component.
- **Risk:** medium (IA change). **Dependencies:** notification routes `clientCheckIns.ts:138`, `clientProfile.ts:154`; CO-13.
- **How to verify:** journey J1 (find and review a pending check-in). **Recommendation:** make the queue the Today primitive, with one review sheet used everywhere, and remove the two pages.

### RM-20 — "View as client" layout duplicates the client workspace
**P1 · L · TRANSFORMATIVE · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - `CoachViewLayout.tsx:20,63-87`: its own TopBar plus 6 chips (activity, nutrition, cardio, measurements, photos, progress).
  - The workspace has 11 tabs, and its Progress tab escapes into this layout (`CoachClientWorkspaceLayout.tsx:39-59`).
  - "Nutrition" and "Cardio" mean *plan editor* in the workspace but *client logs* here.
  - Routes `CoachApp.tsx:107-108`; entry "View activity" (`CoachClientDetail.tsx:153-155`).
- **Why merge:** two shells for one client. The header, switcher and tabs vanish mid-task, Back differs per tab, and names collide (CO-08, CO-20).
- **User impact:** one client place. **Technical impact:** −1 layout and chip rail; fold 6 views into a Progress segment.
- **Risk:** medium-high (navigation rebuild). **Dependencies:** EntityNotes add-note sheet; old-suite specs on `/view/*`.
- **How to verify:** trace Back from each tab. **Recommendation:** fold into a client "Progress" segment (log timeline + body) and redirect `/view/*`.

### RM-21 — The client's coach relationship is split across about 7 surfaces
**P1 · M · HIGH · MERGE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-19, BV-33)**
- **What / where:**
  - "Your coach" `/coach-notes` (`CoachInbox.tsx`): a Messages link `:25-29`, the full subscription/freeze form `:32`, a targets grid `:35-46` and notes `:49-76`.
  - The bell plus `/notifications` (every row titled with the coach's name, BV-33).
  - Two adjacent Home coach cards (`Home.tsx:295-296`).
  - Check-ins (menu only).
  - Assessment and coach feedback under Settings › Account.
  - Inline notes.
- **Why merge:** one relationship lives in 7 places, and one message gives 3 signals (RM-30). `assessment_reviewed` lands on `/coach-notes`, where the review isn't shown (`clientProfile.ts:184`).
- **User impact:** one Coach destination. **Technical impact:** −1 page, −2 cards.
- **Risk:** medium. **Dependencies:** server deep links to `/coach-notes` (`clientCheckIns.ts:277`, `clientProfile.ts:184`) need a redirect for stored notifications; NT-12.
- **How to verify:** journey "what did my coach say/ask". **Recommendation:** one Coach destination (chat + pinned to-dos + notes feed); delete the page body and one card.

### RM-22 — Client subscription UI shown on two pages and linked from three places
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-19)**
- **What / where:** `ClientSubscriptionSection` renders in full on `/settings/subscription` (`ClientSubscriptionPage.tsx:17`) **and** `/coach-notes` (`CoachInbox.tsx:32`). It is also linked from the menu (`nav.ts:74`) and the Settings › Account card (`Settings.tsx:467`).
- **Why remove:** the same status card, pause form and history twice (BV-19).
- **User impact:** one home under "You". **Technical impact:** −1 embed.
- **Risk:** low. **Dependencies:** RM-21.
- **How to verify:** screenshots `client-your-coach-390-full.png`, `client-subscription-390-full.png`. **Recommendation:** remove the embed and keep one link.

### RM-23 — The client "Exercise library" destination duplicates Progress › Strength
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-36)**
- **What / where:** `/workout/library` (`ExerciseLibrary.tsx`, menu `nav.ts:52`).
  - It lists only the plan's exercises with an estimated best (BV-36).
  - Its category chips are the first word of each day title (`:24-37`).
- **Why remove:** it isn't a library, and it repeats the PR list (EX-22).
- **User impact:** keep exercise detail, reached from Train and Progress. **Technical impact:** −1 route and page.
- **Risk:** low. **Dependencies:** `ExerciseDetail` back fallback `useBack('/workout/library')` (`ExerciseDetail.tsx:21`).
- **How to verify:** compare with Progress › Strength. **Recommendation:** remove the destination, repoint the back fallback, and keep the detail page.

### RM-24 — Client body/progress data spread over Progress tabs and 3 more routes
**P2 · M · HIGH · MERGE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-37)**
- **What / where:**
  - Progress has Weight/Strength/Measure/Photos segments (`Progress.tsx:38,248`).
  - Measurements is a separate route (`/progress/measurements`, with its own DayNav; BV-38).
  - Photos has a standalone wrapper (`/progress/photos`).
  - History is a separate route.
  - Today repeats week stats and the volume chart; check-in weight and photos never reach Progress.
- **Why merge:** the same metrics in 4 places, and logging body data is spread across 3 routes plus the check-in.
- **User impact:** one Progress (Body · Strength · Consistency). **Technical impact:** −2 routes.
- **Risk:** medium. **Dependencies:** `noteTarget.ts:11-12`; notification `measurement_added`.
- **How to verify:** BV-37 screenshot. **Recommendation:** merge into Progress segments with one "Log body update" flow.

### RM-25 — Coach plan, trial and capacity status: 5 places, 3 different counts
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - `CoachPlanBanner` on every page (`CoachPlanBanner.tsx:44-52`)
  - `CoachTrialBanner` on the dashboard (`CoachTrialBanner.tsx:12`, reads the legacy `plan.plan`, RM-52)
  - the RoleAccount capacity card (`RoleAccount.tsx:65-89`, counts disabled clients)
  - the Clients capacity strip (`CoachClients.tsx:240-249`)
  - My Plan (`activeClientCount`)

  A lapsed-trial coach sees two banners for one state.
- **Why merge:** contradictory numbers and duplicate nags (CO-32).
- **User impact:** one status; a banner only when blocked. **Technical impact:** −1 banner, −1 card.
- **Risk:** low. **Dependencies:** RM-52, RM-55.
- **How to verify:** set a trial near expiry and count the surfaces. **Recommendation:** use one plan status in Me › Forma subscription and keep app-wide banners for blocking states only.

### RM-26 — The coach subscription tab offers 3 ways to extend, 2 to price and 2 terminal actions
**P2 · M · HIGH · MERGE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-35)**
- **What / where:** `CoachSubscriptionPanel.tsx`:
  - "Set term" vs "Renew" (the same sheet) vs "Extend +30d" (`:199-217`)
  - "Set price" (free-text currency `:355`) vs the price inside Set term
  - "End subscription" vs "Cancel" (`:220-227`)

  BV-35 counts 7 competing actions.
- **Why merge:** decision overload, and "Cancel" reads as dismiss (CO-14).
- **User impact:** one "Renew / change term" sheet with presets, plus one "End".
- **Technical impact:** −2 sheets. **Risk:** medium (data semantics; stale prefill and UTC dates are tracked in CO-14/CO-15).
- **How to verify:** J5 renewal journey. **Recommendation:** merge into one renew/change sheet and one terminal action with a reason.

### RM-27 — Templates as a separate destination, plus a read-only preview step
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `/coach/templates` (menu "Content") sits beside the Library. Opening a template goes through `/coach/templates/:id`, a preview that shows only day titles and counts (`CoachTemplatePreview.tsx:59-88`). Assigning a template is only possible from that side (`AssignTemplate` is imported only by the preview).
- **Why / user:** an extra destination and an extra step that previews nothing (CO-39). Coaches open a template straight into its editor or read view, and can apply it from inside a client's plan.
- **Technical impact:** −1 route. **Risk:** low. **Dependencies:** palette entries `CommandHost.tsx:49,67`.
- **Verify / do:** count the taps to assign a template. Make Templates a Library segment and remove the preview route.

### RM-28 — Add-client chooser: two flows for one intent
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** the Clients "+" sheet forces "Create new client" (invite) or "Add existing" (search Forma) (`CoachClients.tsx:317-372`; `AddExistingClient.tsx`).
- **Why / user:** the coach rarely knows whether the client already has a Forma account (CO-37). Replace the choice with a single flow: enter email or phone, then assign, request a transfer or invite.
- **Technical impact:** one flow. **Risk:** medium. The search exposure is a P0 owned by CO-03.
- **Verify / do:** journey "add a client". Merge the two flows and use exact-match lookup only.

### RM-29 — Client Nutrition has three "Add food" paths
**P2 · S · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - a per-meal "+ Add food" text link (`Nutrition.tsx:530-538`)
  - a custom-foods card headed "Add food" (`:552-605`)
  - a global "Add food" button (`:606-614`)

  Meal extras count only if the meal is ticked; custom foods always count (`nutritionStore.ts:49-61`).
- **Why / user:** two semantics behind one label. A single flow should ask "which meal?".
- **Technical impact:** −1 path. **Risk:** low.
- **Verify / do:** add the same food via each path and compare the totals. Merge into one flow.

### RM-30 — One message, three signals; the notification feed duplicates the inbox
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-33)**
- **What / where:**
  - Every chat message creates a `message_received` notification (`api/_trpc/routers/messages.ts:132-141`), giving a bell badge, an inbox badge and a toast.
  - The coach bell repeats the inbox and the work queues.
  - The client feed shows 12 unread items titled with the coach's name (BV-33).
- **Why / user:** double counting and toast bursts (NT-05, NT-12, CO-33). Message alerts should live in Messages only, and the feed should carry events.
- **Technical impact:** fewer notifications written and polled. **Risk:** medium. **Dependencies:** NT-01 (replay).
- **Verify / do:** send one message and count the signals. Stop creating message notifications for the feed, or exclude them from the bell.

### RM-31 — Five KPI-tile implementations
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - `StatTile` (9 importers)
  - `ui/MetricCard` (10)
  - `ui/DashboardCard` (0, RM-01)
  - local `HeroStat` (`CoachDashboard.tsx:99`), `TargetCell` (`CoachClientDetail.tsx:327`), `Cell` (`CoachInbox.tsx:83`)
  - marketing `StatTile` (`Benefits.tsx:41`)
- **Why / user:** different sizes, labels and units for one concept (visual audit V-03). One `Metric` component should have inline, tile and hero sizes.
- **Technical impact:** −4 components. **Risk:** low (visual change).
- **Verify / do:** grep the components. Rebuild them as one component in the VS phase.

### RM-32 — Ad-hoc loading, empty and error states instead of the standard ones
**P2 · S · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - The button label "Working…" is used as the page loader in 19 coach files (CO-18).
  - A local `function EmptyState` shadows the shared one (`components/workout/PlanBuilder.tsx:474`); `EmptyCard` (`ClientActivityView.tsx:228`); inline `<p>{t('…no…')}</p>` empties.
  - `OfflineState` and `PermissionState` are never used.
- **Why / user:** errors and offline states render as "empty". One state boundary should distinguish empty, error, offline and loading.
- **Technical impact:** one primitive set. **Risk:** low. **Dependencies:** RM-01.
- **Verify / do:** go offline on 5 coach screens. Merge into a shared query-state boundary.

### RM-33 — Duplicate UI primitives: 4 page headers, 4 tab rails, ad-hoc initials avatars
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - Page headers: `TopBar` (53 importers), `ui/PageHeader` (6), the workspace header, `ThreadHeader` (`CoachMessages.tsx:197`).
  - Tab rails: `ui/Tabs` (4 pages), Settings `.seg` (`Settings.tsx:296`), Progress `.seg` (`Progress.tsx:248`), CoachViewLayout chips (`:66-78`), the workspace rail.
  - Initials avatars drawn by hand (`AssignTemplate.tsx:69`, `AdminAssignments.tsx:293`, `CoachAdherence.tsx:89`) instead of `Avatar`.
- **Why / user:** inconsistent chrome and accessibility (only `Tabs` has the tab roles).
- **Technical impact:** one primitive each. **Risk:** low.
- **Verify / do:** grep the primitives. Consolidate them in the VS phase and replace the hand-drawn avatars with `Avatar`.

---

## C. NAVIGATION TO REMOVE / MERGE
Route-level duplicates that are already covered elsewhere: `/coach/adherence` → RM-18; `/coach/checkins` and `/coach/assessments` → RM-19; `/view/*` → RM-20; `/workout/library` → RM-23; `/coach/templates/:id` → RM-27; `/coach/client/:id/activity` → RM-61.

### RM-34 — Hamburger "Menu" sheets that repeat the bottom bars, and a centre FAB that is only a link
**P1 · L · HIGH · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (`evidence/coach-navigate-menu-390.png`)**
- **What / where:** `NavMenuSheet.tsx` from `BrandBar`.
  - Client: 13 rows in 4 groups that repeat all 5 tabs (`nav.ts:44-78`).
  - Coach: 13 items in 5 groups, 4 of which repeat the bar (`nav.ts:103-142`).
  - The client centre "Train" FAB has no visible label and is just a link (`BottomNav.tsx:35-51`).
- **Why remove:** three navigation systems, and 8+ client screens never light a tab.
- **User impact:** one predictable map (target IA, doc 16). **Technical impact:** −1 component; it also mounts a closed-sheet unread poller (RM-82).
- **Risk:** high without the IA rebuild. **Dependencies:** destinations that are only in the menu (Cardio, History, Check-ins, Adherence, Reports, Client Plans, My Plan).
- **How to verify:** tap paths for every destination. **Recommendation:** remove after the IA rebuild gives every destination a home.

### RM-35 — The coach workspace Overview repeats the tab rail as buttons
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (`evidence/coach-client-overview-390-full.png`)**
- **What / where:** `CoachClientDetail.tsx`:
  - "View activity" plus a "Manage plan" sheet that relists the Workout/Nutrition/Cardio editors and hides Release client (`:151-168,273-286`)
  - Messages, Assessment and Check-ins cards (`:170-230`)
  - the header "Edit plan" button, which duplicates the Workout tab (`CoachClientWorkspaceLayout.tsx:129-133`)
- **Why / user:** 3 routes to the same editor and a destructive action under a mislabelled sheet (CO-09, CO-40). Overview should become a client summary with open items.
- **Technical impact:** −1 sheet, −3 cards. **Risk:** low.
- **Verify / do:** count the entry points. Remove the duplicates and move Release into the header overflow menu.

### RM-36 — Client Cardio and History are separate destinations reachable only from the menu
**P2 · M · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `/cardio` (`nav.ts:51`; coach cardio plan + live timer + log) and `/history` (calendar, `nav.ts:60`, also from Home and Progress). History repeats Home "Recent".
- **Why / user:** coach-prescribed cardio sits away from training, and the history is duplicated. Move the cardio plan and session into Train, steps into the Today checklist, and the calendar into Train or Progress.
- **Technical impact:** −2 destinations. **Risk:** medium. **Dependencies:** RM-24, RM-34; `noteTarget.ts:9`.
- **Verify / do:** do these journeys from tabs only. Merge them.

### RM-37 — RoutineDetail is an orphan route that holds the coach's exercise notes
**P1 · M · HIGH · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `/workout/routine/:dayId` (`RoutineDetail.tsx`) is reached only through `clientNoteRoute` deep links (`lib/noteTarget.ts:26-33`). Train rows can't be tapped (`Workout.tsx:107-131`).
- **Why:** the only screen showing sections, rest and coach notes per exercise is unreachable in normal use (client audit #6).
- **User impact:** coach intent reaches the gym floor. **Technical impact:** route consolidation.
- **Risk:** low. **Dependencies:** notification deep links.
- **Verify / do:** try to reach it from Train. Merge it into Train as the day-detail screen.

### RM-38 — Revenue is a primary coach tab; Reports, Client Plans and My Plan sit in the main menu
**P1 · M · HIGH · MOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `COACH_NAV` puts Revenue at #4 (`nav.ts:87-92`), while check-ins are only in the menu. The Business and You groups (`nav.ts:127-141`) hold Reports, Client Plans and My Plan.
- **Why / user:** a weekly concern takes a daily slot (CO-16). Move Business, Packages and the Forma subscription behind the avatar ("Me").
- **Technical impact:** nav config only. **Risk:** medium (habit). **Dependencies:** RM-34, RM-42.
- **Verify / do:** compare usage frequency. Move them.

### RM-39 — Plan version history is a separate page outside the workspace
**P2 · S · MEDIUM · MOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `/coach/client/:id/versions/:kind` (`CoachApp.tsx:109`; `PlanVersionHistory.tsx`), reached by the editor's "History" chip through an unguarded `navigate` (`VersionActions.tsx:73`). Its back fallback is the overview, not the editor.
- **Why / user:** it leaves the workspace and bypasses the unsaved guard. It belongs in a sheet inside the editor.
- **Technical impact:** −1 route. **Risk:** low.
- **Verify / do:** open History with unsaved edits. Move it into the editor.

### RM-40 — Legacy and duplicate deep-link routes: `/settings/app`, `/progress/photos`
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - `/settings/app` → `ClientSettings.tsx` is only a `<Navigate to="/settings?tab=preferences">` (`ClientApp.tsx:47,170`). Nothing links to it in the app; the old e2e suite does (`e2e/client/settings.spec.ts:43`).
  - `/progress/photos` wraps the Progress Photos tab (`ProgressPhotos.tsx:207-217`, `ClientApp.tsx:167`). The only link is `noteTarget.ts:12`.
- **Why / user / tech:** redundant routes. No user impact if `noteTarget` points at `/progress?tab=photos`. **Risk:** old bookmarks fall to the `*` redirect.
- **Verify / do:** routes matrix. Delete both and update `noteTarget`.

---

## D. LOW-VALUE CARDS / METRICS

### RM-41 — Coach dashboard Overview is filler around one useful list
**P1 · M · HIGH · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-24)**
- **What / where:** `CoachDashboard.tsx:58-80` and `OverviewPanel.tsx`.
  - A greeting H1.
  - 3 hero stats: "Active" counts accounts; "Renewals" means *ending*.
  - `CoachTrialBanner`.
  - A "Get started 1/3" checklist shown to a 10-client coach.
  - An "At risk" hero that repeats the first attention row.
  - **"Quick actions" renders as an empty titled section with only a "+" on phones** (`QuickActions.tsx:38,84`; screenshot).
  - 5 MetricCards. "Check-ins to review" is not clickable (`:110`).
- **Why remove:** 2.8 screens on mobile (BV-24). The attention list and the renewals are the only actionable blocks (CO-17).
- **User impact:** the coach gets straight to triage. **Technical impact:** −~300 lines; no dashboard aggregate on load.
- **Risk:** medium (IA). **Dependencies:** RM-17, RM-25, RM-43.
- **How to verify:** `evidence/coach-dashboard-390-full.png`. **Recommendation:** keep attention and renewals as Today queue groups, move counts into the group headers, and remove the rest.

### RM-42 — Coach Revenue: 17 cards for about 5 facts
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-23)**
- **What / where:** `CoachRevenue.tsx:37-42` and `AnalyticsPanel.tsx`.
  - The "This month" hero repeats the first KPI card.
  - 6 status tiles repeat the donut legend.
  - "Retention (30d)" is 100 − churn over all relationships ever (`coachDashboardApi.ts:188-191`).
  - Renewal rows can't be tapped.
  - An expired client appears only as "1 EXPIRED", with no name.
- **Why / user:** repetition, and no action on the thing that matters. Replace with one month summary (booked, due, lost) and a tappable renewal list.
- **Technical impact:** −10 cards. **Risk:** low.
- **Verify / do:** `evidence/coach-revenue-390-full.png`. Remove the duplicates and drop or relabel the miscomputed metrics.

### RM-43 — Workspace Overview stat tiles are misleading or vanity
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-22)**
- **What / where:** `CoachClientDetail.tsx:111-148`.
  - "Workouts (7d)" is finished sessions among the last 10 logs, with no date window, so it shows 10 for about 4 a week (BV-22).
  - "Last weight".
  - A Notes count and a Plans count (0–2, ignores cardio).
- **Why / user:** a wrong headline number and counts of the coach's own artifacts (CO-09). Replace with adherence vs plan (7d/28d), last workout and weight trend.
- **Technical impact:** −4 tiles. **Risk:** low.
- **Verify / do:** compare with the client's logs. Remove them and replace with real summary facts.

### RM-44 — Client Today: repeated and low-value blocks
**P1 · M · HIGH · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-16)**
- **What / where:** `Home.tsx`.
  - The date appears 4× (DayNav, eyebrow `:161`, WeekStrip, hero eyebrow).
  - The `SyncStatusBadge` `:174` (RM-46).
  - The weekly ring "0/5" while the coach plan is 4 days.
  - 4 "This week" StatTiles with tonnage `:337-345`.
  - A volume-trend chart `:348-363`, an exact duplicate of `Progress.tsx:421-442`.
  - Recent sessions `:366-396`, which duplicate History.
  - Two coach cards `:295-296` (RM-21).
  - **"Start empty workout" `:399-401`, which only opens the routines list.**
- **Why remove:** 2.8 screens (2,388 px at 390), and START WORKOUT sits barely above the nav (BV-16).
- **User impact:** today's task becomes obvious. **Technical impact:** −~150 lines.
- **Risk:** medium (habit). **Dependencies:** RM-24, RM-21.
- **How to verify:** `evidence/client-today-390-full.png`. **Recommendation:** one adaptive hero, a compact checklist, and at most one actionable coach item.

### RM-45 — Tonnage as a headline metric, and card-per-number tiles
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-30, BV-37)**
- **What / where:**
  - "x.xt" tonnage headlines on Today, the History header ("5.0t", "1 workouts"), the session summary and the progress bar.
  - Progress: 4 all-time StatTiles (`Progress.tsx:443-466`) and a "Current" tile that repeats the header value (`:309-334`, BV-37).
  - RoutineDetail: 2 StatTiles (`:106-109`).
- **Why / user:** tonnage means nothing to most clients, and the tiles repeat values already on screen.
- **Technical impact:** −8 tiles. **Risk:** low.
- **Verify / do:** screenshots `client-history-390.png`, `client-progress-390.png`. Remove the tiles; lead with PRs and consistency instead.

### RM-46 — Sync chips and the "Cloud backup & sync" card
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-16, BV-26, BV-05)**
- **What / where:**
  - `SyncStatusBadge` on client Home (`Home.tsx:174`) and twice on Settings (`Settings.tsx:282,476`).
  - `SyncStatusIndicator` in the coach/admin top bar (`DesktopTopBar.tsx:26`). It reports the *client* engine, which is irrelevant there (RM-81).
  - Settings card `:473-514`: email, last sync, "Sync now", and Sign out hidden inside it.
  - "Synced" shows even with changes pending (BV-05, PWA-11). In ar-eg it reads "الزامن" (BV-26).
- **Why / user:** an implementation detail that lies. Show sync only when the user has to act (pending/failed), and give Sign out its own place.
- **Technical impact:** −2 components. **Risk:** low. **Dependencies:** PWA-11's honest sync model.
- **Verify / do:** log a set offline and watch the chip. Remove them and replace with an actionable pending/failed state.

### RM-47 — Coach client list shows and filters the admin account state
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-20)**
- **What / where:** `CoachClients.tsx:54,213-221,304`. Every row carries an "ACTIVE" account pill, including frozen, expired, cancelled, trial and pending clients. The All/Active/Frozen/Trashed chips are account states that coaches can't change. These are leftovers from the pre-RBAC era.
- **Why / user:** noise, plus a false "Frozen" (CO-07). Replace with coaching filters: Needs you · Check-in due · Expiring · No plan · Frozen (subscription).
- **Technical impact:** −1 pill, chips replaced. **Risk:** low.
- **Verify / do:** `evidence/coach-clients-390-full.png`. Remove and replace them.

### RM-48 — The WhatsApp support FAB covers content, and is shown to admins
**P2 · S · MEDIUM · MOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-20)**
- **What / where:** `WhatsAppFab.tsx:28` is mounted in `ResponsiveShell.tsx:48` for coach **and** admin. It covers row chevrons (BV-20). Its dismissal lasts only the session (`:12`).
- **Why / user:** support isn't a primary action, and admins are the support (CO-28). Move it to Me › Help for coaches and drop it for admins.
- **Technical impact:** −1 global overlay. **Risk:** low.
- **Verify / do:** screenshot. Move it.

### RM-49 — Decorative eyebrows
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (screenshots)**
- **What / where:** "COACH PORTAL" on about 10 pages (e.g. `CoachClients.tsx:227`), "FORMA" over "Your coach" (`CoachInbox.tsx:18`), "ATHLETE" on Settings, "Nutrition" over "Nutrition", "BUSINESS", "CONTENT".
- **Why / user:** about 20 px of chrome that says nothing (CO-42). **Technical impact:** copy only. **Risk:** none.
- **Verify / do:** screenshots. Remove them, or keep only where the eyebrow adds context.

### RM-50 — Admin: coach-status counts repeated on 3 pages (cross-check)
**P3 · S · LOW · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** trial, active and expired coach counts appear on `AdminCoaches.tsx:253-255`, `AdminSubscriptions.tsx:102-104` and `admin/dashboard/OverviewPanel.tsx:71-73`. `conversionRate` appears twice.
- **Why / user / tech:** repetition across admin pages. **Risk:** none.
- **Verify / do:** grep the components. Keep them in one place (Subscriptions) and link to it.

---

## E. LEGACY COMMERCIAL UI

### RM-51 — Multi-tier plan copy left in i18n
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** unused keys for the removed tier editor and upgrade flow:
  - `adminPlans.*` 33/33
  - `coachPlan.*` 30/34 ("Request upgrade", "Desired plan", "a higher tier…", `hist.tier`)
  - `adminCoaches.tier.{trial,starter,pro,enterprise,none}`, `changeTier`, `setLimit`
  - `admin.{revenueByTier,approveRequest,rejectRequest,snapshotStale,…}`
  - `invite.sub{Trial,1m,3m}`, which the `SubscriptionPlanPicker.tsx:27-31` doc still promises as presets
  - `landing.pricing*` (14)
- **Why / user / tech:** dead copy that describes a product that no longer exists. **Risk:** none. **Dependencies:** RM-09.
- **Verify / do:** i18n audit. Delete them and fix the picker doc comment.

### RM-52 — Code still reads the legacy tier field `plan.plan`
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `CoachTrialBanner.tsx:12` (`plan.plan !== 'trial'`), `AdminSubscriptions.tsx:55` (the "revenue by source" variable is still named `byTier` `:53`), `coachPlanApi.ts:64`, and the fallbacks in `lib/formaFormat.ts:22,39`. The type says to read `phase` instead (`types/index.ts:113-121`; `CoachPlanTier = string`).
- **Why / user:** two sources of truth for "is trial". Pre-refactor rows answer differently.
- **Technical impact:** one field. **Risk:** low. **Dependencies:** RM-53 (migration).
- **Verify / do:** grep `.plan ===`. Switch to `phase` and drop the fallbacks after the migration.

### RM-53 — Legacy plan-request types and API compatibility code
**P3 · M · LOW · REMOVE · UNKNOWN — INVESTIGATE · CODE-CONFIRMED**
- **What / where:**
  - `api/coach-plans/_data.ts:13,59` (old tier keys), `:71` (deprecated cap flag), `:132-135,163` (`LegacyPlanRequestType`), `:202-219` (drops the legacy index on first use)
  - `coachPlans.createTrial` "kept for legacy callers" (`coachPlans.ts:21`)
  - the "Forma subscription (legacy)" labels for `new_signup/trial_upgrade/plan_change` rows in the My Plan history (`en forma.requestType.*`)
  - `scripts/migrate-forma-single-plan.mjs:2-3`: **"NOT run against production"**
- **Why:** this compatibility code is dead weight once the data is migrated. **User impact:** legacy labels may be visible.
- **Risk:** removing it before the migration breaks old rows. **How to verify:** run the migration script in report mode against prod (read-only).
- **Recommendation:** migrate first, then delete the compatibility paths and hide legacy rows.

### RM-54 — `coachPlanTiers` naming for the single Forma configuration
**P3 · S · LOW · KEEP · KEEP FOR TECHNICAL REASON · CODE-CONFIRMED**
- **What / where:** the router `coachPlanTiers` (`public/get/save` of the `coachPlanTiers/forma` doc), `coachPlanTiersApi.ts`, and the dead accessor `coachPlanTiersCol` (`api/admin/_lib/db.ts:13`).
- **Why keep:** the Mongo collection name is data, and renaming it means a migration. **User impact:** none.
- **Recommendation:** keep the collection; rename the code-level router and service when convenient (RM-88); delete the dead accessor (RM-05).

### RM-55 — My Plan: a "Product = Forma" card and 4 KPI cards for a single product
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `CoachPlan.tsx:122-135`: MetricCards for Product phase, State, Ends and Price, plus explanation blocks.
- **Why / user:** "Product: Forma" adds nothing in a single-product world (CO-32). Replace with one status card (state, end date, price, Renew) and a capacity line.
- **Technical impact:** −3 cards. **Risk:** none.
- **Verify / do:** screen review. Simplify it.

---

## F. DEAD COMPONENTS / ROUTES (incl. legacy single-user tracker features)

### RM-56 — "Reset all data" and "Clear this day's data" in client Settings
**P0 · S · HIGH · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** Settings › Account › Data (`Settings.tsx:221-239,257-275,516-527`). `resetAll` calls `cloudState.wipeCloud()`, then `trpc.sync.wipe` (`cloudStore.ts:153-168`, `SyncEngine.ts:173-179`, `api/_trpc/routers/sync.ts:114-122`), which deletes **all** of the client's `syncRecords`, deletions and singletons.
- **Steps / expected vs actual:**
  1. Settings › Account › Reset all data.
  2. Confirm once.
  - Expected: local data is cleared, as the copy says ("erases ALL local data and restores the default plan").
  - Actual: the client's entire server history is deleted, and the coach's views read exactly that store (`clientLogs.ts:5-70`, `coachClients.ts:155`).
- **Why remove:** irreversible loss of coaching history behind wrong copy. "Clear this day" deletes the hidden selected day's logs and photos.
- **User impact:** loses a destructive control nobody needs. Account deletion should be support-mediated.
- **Technical impact:** −2 actions and `data/reset.ts` paths. **Risk:** none from removal.
- **Dependencies:** the `sync.wipe` procedure (keep it for admin/support only, or delete it).
- **How to verify:** in e2e3, reset as clientA, then open the coach's view of clientA. **Recommendation:** hotfix-remove now; do not wait for Phase B.

### RM-57 — Legacy local video library: Video manager, Import data, local video store, 131 MB of mp4
**P1 · S · HIGH · REMOVE · SAFE TO REMOVE · BROWSER-VERIFIED (BV-18, BV-07)**
- **What / where:**
  - Pages: `pages/VideoManager.tsx` (`/settings/videos`) and `pages/ImportData.tsx` (`/settings/import`), routes `ClientApp.tsx:49-50,172-173`, Settings rows `Settings.tsx:431-440`.
  - Code: `services/sheetParser.ts`, `stores/videoStore.ts` (loaded at boot, `App.tsx:81`), `services/video/CacheVideoStore.ts`, `IVideoStore`/`detectKind` (keep `youtubeEmbed`), `components/VideoPlayerSheet.tsx`, the fallback branches `ExerciseDetail.tsx:72-73` and `WorkoutSession.tsx:199-200,557`, the `videoAssets` repo (`LocalDataSource.ts:32`, `repositories.ts:52`, `reset.ts:17`, `clientSync.ts:41`), `data/seed/videoAssets.seed.ts`, i18n `video.*` and `import.*`.
  - Assets: **`public/exercise_videos/` (30 mp4, 131 MB, tracked, copied into every deploy).**
- **Why remove:** assets are created only in the dead local-only branch (`bootstrap.ts:69-98`) and are wiped on first sign-in (`clientSync.ts:41`). For every real client the list is empty (BV-18) and Import can never match. The fallback is why the video tap does nothing for 863 of 909 exercises (BV-07, EX-01, EX-21).
- **User impact:** two dead screens disappear. **Technical impact:** −~1,050 lines, −131 MB repo and deploy, −1 store load at boot.
- **Risk:** low. Devices keep an orphan IndexedDB store and cache; a boot cleanup can drop them. **Dependencies:** RM-73, RM-12, EX-01 (render the video button only when media exists).
- **How to verify:** `evidence/client-video-manager-390.png`, `client-import-data-390.png`; `git grep exercise_videos`. **Recommendation:** delete in one PR.

### RM-58 — "Update the app" (manual service-worker unregister and cache wipe)
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-18)**
- **What / where:** Settings › Tools (`Settings.tsx:241-255,441-445`), client only. Its copy says videos are kept, but it deletes all caches.
- **Why / user:** a support workaround exposed as a product feature. Remove it once the update UX exists (PWA-09, PWA-10). Meanwhile it is the only manual escape hatch.
- **Technical impact:** −1 row. **Risk:** low after the update UX ships.
- **Verify / do:** BV-18 screenshot. Remove it with the update-UX work, or move it to a hidden support screen.

### RM-59 — Local reminders ("Gym Tracker" OS popups, dead triggers path, banner in every shell)
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - Store and timer: `services/reminders/reminderStore.ts` (194 lines; started for **every role** at `App.tsx:85-86`; 30 s timer `:173`).
  - UI: the Settings reminders editor (`:165-171,401-426`), `ReminderBanner` (client `AppShell.tsx:26` **and** coach/admin `ResponsiveShell.tsx:40`), and the "Notifications" switch, which only controls these reminders.
  - Data: `SEED_REMINDERS` ("Creatine", "Mag White"), synced as the `reminders` collection.
- **Why remove:**
  - OS notifications are titled **"Gym Tracker"** (`:72,89,96`).
  - The "fires while closed" path uses the Notification Triggers API, which never shipped (`:29-36,57-82`).
  - Reminders fire late, all at once, on the first open of the day (NT-09).
- **User impact:** clients lose an in-app reminder list that mostly fires late. **Technical impact:** −~250 lines, −1 timer, −1 synced collection.
- **Risk:** some clients may use it (no usage data). **Dependencies:** NT-04 (no push channel).
- **How to verify:** set a 08:00 reminder and open the app at 20:00. **Recommendation:** remove until server push exists. If kept, rebrand to Forma and scope it to clients.

### RM-60 — Demo seed plan, meals and reminders shipped in the entry chunk
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** `data/seed/workoutPlan.seed.ts` ("M3E — Push / Pull / Legs" with Arabic cues), `nutritionPlan.seed.ts`, `SEED_REMINDERS`, the SEED_VERSION logic and the 1815-kcal default targets (`bootstrap.ts:22-30,61`). The entry chunk `dist/assets/index-CIivkq9d.js` contains "Incline dumbbell press" and the `/exercise_videos/` URL builder (PF-30). Keep `SEED_PROFILE`/`SEED_SETTINGS` (used by `clientSync.ts:4,45-46`).
- **Why / user / tech:** seeded only in the dead branch, yet parsed by every visitor including the website. About 5.5 KB of entry code. **Risk:** none. **Dependencies:** RM-02.
- **Verify / do:** grep the built entry chunk. Delete with RM-02.

### RM-61 — Orphan route `/coach/client/:id/activity`
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** `CoachApp.tsx:23,102-106`, `CoachClientActivity.tsx` (17 lines). No in-app link and no server route points here; the button now opens `/view` (`CoachClientDetail.tsx:153-155`). Keep `ClientActivityView` (used by `CoachViewLayout.tsx:81` and `AdminClientDetail.tsx:73`).
- **Why / user / tech:** a duplicate legacy day view. No user impact. **Risk:** a bookmark falls to the `*` redirect. **Dependencies:** `e2e/coach/client-activity.spec.ts:33` (already broken).
- **Verify / do:** routes matrix. Delete it, or redirect to `/view/activity`.

### RM-62 — Old marketing landing at `/landing-v1`
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - Code: `src/pages/marketing/**` (14 files, 774 lines incl. `hooks/useReveal.ts`), imported **eagerly** by `AnonymousApp.tsx:5` (~19.5 KB of a 28 KB chunk), the `NoIndex` route `:23-33,60-67`, and `Pricing.test.tsx`.
  - Copy: i18n `landing.*` (87 keys ×3, incl. the false "Built on Firebase").
  - Assets: `public/landing_page/` (6 PNG, **8.3 MB**, deployed).
- **Why / user:** a hidden noindex draft that nothing links to (the website doesn't). No user impact.
- **Technical impact:** −774 lines, −8.3 MB deploy, a smaller anonymous chunk.
- **Risk:** low. **Dependencies:** the manifest screenshots `vite.config.ts:64-65` (`landing_page/hero-dashboard.png`, `showcase-mobile.png`) need moving; `e2e3/specs/51-website.spec.ts:108-128` navigates to `/landing-v1` and should switch to another non-website route.
- **Verify / do:** `git grep landing-v1`. Delete after product sign-off.

### RM-63 — Three.js film at `/experience`
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `src/pages/experience/**` (7 files, **4,420 lines**), lazy chunk `Experience-*.js` **569 KB**, `public/experience/*.png` (584 KB), deps `three` + `@types/three` (only these files import them), route `AnonymousApp.tsx:11,68-75`. It has 9 `href="#"` links (`FORMA_FINAL_FRONTEND_INTERACTION_AUDIT.md:176`).
- **Why / user:** not linked from the website or the app, yet its images and CSS are **precached for every install** (RM-72). No user impact.
- **Technical impact:** −4,420 lines, −1 dependency, −614 KB of precache. **Risk:** low. **Dependencies:** `vite.config.ts:78`.
- **Verify / do:** `git grep "/experience"`. Delete it (or move it to a demo repo) after sign-off.

### RM-64 — Onboarding overlay (legacy first-launch local profile and dead inline sign-in)
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `components/Onboarding.tsx` (156 lines), mounted at `ClientApp.tsx:148`. Its origin is `FIXES.md` Round 2 ("set up a local profile, or sign in inline").
  - The sign-in mode can't render inside ClientApp and calls the no-op `cloud.signIn`.
  - The profile mode duplicates the mandatory assessment, which collects name, age, weight and height (`clientProfile.ts:10-18,144-147`).
- **Why / user:** a legacy gate; at worst a surprise overlay. **Technical impact:** −156 lines.
- **Risk:** clients with a submitted assessment but weight or height of 0. **How to verify:** count them in prod (read-only).
- **Recommendation:** remove the sign-in mode now, and the overlay after verification.

### RM-65 — `TrainingGuideSheet`: one coach's methodology hard-coded for every client
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `components/TrainingGuideSheet.tsx` (98 lines; "Coach's reference info from the sheet"), with fixed bilingual text (Egyptian Arabic for both ar and ar-eg). Opened from the Train info icon (`Workout.tsx:54-63`).
- **Why / user:** every client of every coach sees another coach's rules ("increase weight after ~5 extra reps"). Replace with inline RIR/RPE explanations, or coach-authored plan notes.
- **Technical impact:** −98 lines. **Risk:** low.
- **Verify / do:** open it as any client. Remove it, or rebuild as coach content.

### RM-66 — A feature-flag system with no consumer
**P2 · S · MEDIUM · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** admins create, toggle and target flags (`AdminGovernance.tsx:37-110,163-200`; `api/_trpc/routers/flags.ts`; collection `featureFlags` via `api/banners/_handlers/flags-lib.ts`). **Nothing reads them:** `useFlag` is never called (`permissions.ts:31`). The per-user `featureFlags` is always `{}` and has no writer (`adminUsers.ts:120,233`, `auth.ts:88`, `invites.ts:242`). It is still serialized in user records (seen in BV-13 responses).
- **Why / user:** admins flip switches that do nothing, which is misleading governance. **Technical impact:** −1 router, −1 collection, −1 user field.
- **Risk:** low. **Dependencies:** `flags.manage` permission; audit action `flag.update`.
- **Verify / do:** `git grep useFlag`. Remove it, or wire one real flag if the team wants flags.

### RM-67 — UI that promises features that don't exist
**P1 · M · HIGH · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - "Flag custom swaps for review" has no review flow (`CoachNutritionEditor.tsx:378-385`; "Needs review" pills with no action, `CoachViewNutrition.tsx:189-199`).
  - The cardio editor hint says targets are "set under Targets", but no UI sets them (`setCoachTargets` has no caller).
  - The nutrition-template API has no UI (`coachAssetsApi.ts:271-284`).
  - The palette's "Send broadcast", "New exercise" and "New food" only open pages (`CommandHost.tsx:51-53`).
  - "900+ exercises (many with video)", but 5% have video (EX-23).
- **Why / user:** broken promises erode trust (CO-19). **Technical impact:** copy plus dead APIs.
- **Risk:** low. **Dependencies:** RM-03, RM-11.
- **Verify / do:** follow each promise. Remove the promise, or build it in the new IA.

### RM-68 — Notification types that are never produced
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** 9 of 18 front-end types are never created. Examples: `plan_assigned`, `subscription_updated`, `plan_decided`, `coach_assigned`, `client_released`, and `trial_expiring` (a no-op chain, RM-04). Sources: `types/index.ts:706-750`, `Notifications.tsx:36-38`; the producer table is in NT-08.
- **Why / user / tech:** a taxonomy that implies events users never get. **Risk:** none.
- **Verify / do:** grep the producers. Remove the unused types, or build them deliberately.

### RM-69 — The coach onboarding checklist reads flags that nothing writes
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** `CoachChecklist.tsx:36-39` falls back to `account.onboarding.*`, but the API never sets it (`adminUsers.ts:234` sets `undefined`; type `api/_lib/types.ts:29-31,61`). It is also shown to a 10-client coach (BV-24) and fetches every template just to count them (RM-84).
- **Why / user / tech:** dead fallback. **Risk:** none.
- **Verify / do:** `git grep onboarding api`. Delete the flag reads; show the checklist only as the new-coach empty state (RM-41).

### RM-70 — Capacitor / Android shell
**P3 · S · LOW · REMOVE · UNKNOWN — INVESTIGATE · CODE-CONFIRMED**
- **What / where:** `android/` (53 tracked files, **touched only in the first commit**, db0fc5b 2026-06-15), `capacitor.config.ts`, `lib/native.ts` (static import at `App.tsx:16`, so `@capacitor/core` sits in the entry chunk, ~9 KB), `package.json:13-15` (`cap:*`), plus 5 Capacitor packages.
- **Why:** never shipped (`docs/FORMA_PATH_TO_1.md:19` "PWA (Android scaffolded)"). If shipped as-is, the relative API URLs would break (PWA-21).
- **User impact:** none. **Risk:** roadmap item A3 ("native store listings").
- **Verify / do:** owner decision. Delete now and re-scaffold later, or at minimum lazy-load `native.ts`.

### RM-71 — `SiteAnalytics` env-script injector
**P3 · S · LOW · REMOVE · UNKNOWN — INVESTIGATE · CODE-CONFIRMED**
- **What / where:** `components/SiteAnalytics.tsx:16-33` injects a script from `VITE_ANALYTICS_SRC/DATA`, which is not in the local `.env`. Vercel `<Analytics/>` is the primary analytics. i18n `adminUsage.siteTraffic*` is unused.
- **Verify / do:** check the Vercel env. If it is unset, delete the injector.

---

## G. OLD CACHE / PWA WORKAROUNDS

### RM-72 — `/experience` images and CSS are precached on every install
**P2 · S · MEDIUM · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:** `dist/sw.js` precaches `experience/forma-mark.png` (225 KB), `forma-lockup.png` (213 KB), `forma-wordmark.png` (149 KB) and `Experience-*.css` (27 KB). That is 614 KB of 2.43 MB (25%), and about 49% of the compressed install transfer (PF-18). Only `**/Experience-*.js` is ignored (`vite.config.ts:78`).
- **Why / user:** slower installs and updates on mobile data, for a hidden marketing page. **Risk:** none.
- **Verify / do:** parse `dist/sw.js`. Delete with RM-63, or add `**/experience/**` and `**/Experience-*.css` to globIgnores now.

### RM-73 — Dead runtime-cache rules and headers
**P3 · S · LOW · REMOVE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - `exercise-videos` (`vite.config.ts:120-131`) and the `/exercise_videos` header (`vercel.json:33-34`), dead with RM-57.
  - `app-data` `/data/*` (`:156-162`): the browser never fetches `/data/` (`fetchStarterExercises` has zero callers, `starterLibraryApi.ts:34`). The server reads the JSON from disk (`exerciseLibrary.ts:32`), so **keep the file**.
  - `landing-images` (`:98-109`), dead with RM-62.
- **Why / user / tech:** configuration noise. **Risk:** none.
- **Verify / do:** grep the URL patterns in src. Delete the rules.

### RM-74 — The exercise-image cache rule points at the old GitHub dataset; none exists for wger.de
**P2 · S · MEDIUM · REDESIGN · UNKNOWN — INVESTIGATE · CODE-CONFIRMED**
- **What / where:** `vite.config.ts:145-155` targets `raw.githubusercontent.com`. `public/data/exercise-library.json` has **693 wger.de image URLs and 0 GitHub ones**. Coaches who seeded before 2026-09-21 may still hold the old 91 GitHub rows (`resetTestExerciseLibrary.mjs:5-9`).
- **Why / user:** images aren't cached offline in the gym (EX-18). **Risk:** dropping the rule early breaks old rows offline.
- **Verify:** count `coachExercises` image URLs on raw.githubusercontent (read-only). **Recommendation:** retarget to wger.de, or self-host (EX-18); keep the GitHub rule while legacy rows exist.

### RM-75 — Blanket `no-store` on every path; the SPA rewrite answers missing assets with HTML
**P2 · S · MEDIUM · REDESIGN · KEEP FOR TECHNICAL REASON · CODE-CONFIRMED**
- **What / where:**
  - `vercel.json:6-14` sets `no-cache, no-store` on `/(.*)`: images, `/data`, icons, `/website`. Only `/assets/*` is overridden (`:29-30`).
  - The rewrite `:3` serves `index.html` (200, with the immutable header) for a missing `/assets/*.js` (PWA-21).
- **Why keep:** it protects against stale HTML while the service-worker lifecycle is fragile. **Risk:** narrowing it wrongly brings back stale shells.
- **Recommendation:** narrow `no-store` to `/`, `index.html`, `sw.js`, `workbox-*` and the manifest; exclude `/assets/` from the rewrite. Verify with e2e3 `43-cache-freshness`.

### RM-76 — The service-worker update check runs every 60 s per tab
**P3 · S · LOW · REDESIGN · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `main.tsx:37-43` checks every 60 s and on every visible event. `sw.js` and `workbox-*` are no-store (PF-27), which costs about 180–600 KB/hour per open app.
- **Recommendation:** check on launch, on visible, and every 15–30 min (PWA-09).

### RM-77 — Deferred "reload when hidden" update flow
**P1 · M · HIGH · KEEP · KEEP FOR TECHNICAL REASON · BROWSER-VERIFIED (BV-06)**
- **What / where:** `main.tsx:17-45` and `vite.config.ts:37,95-97` (`registerType:'prompt'`, `skipWaiting:false`).
- **Why keep:** without it, a deploy reloads mid-workout. **Known cost:** the old build shows for the whole session, and visible tabs reload (BV-06, PWA-09, PWA-10).
- **Recommendation:** keep it until a safe-point update UX replaces it. Then retire it together with RM-58.

### RM-78 — Lora web font for about 4 uses
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `index.html:21-25` loads 5 families and 25 styles, render-blocking. Lora (4 styles) is used only by the 3 hand-drawn initials avatars (RM-33), one italic word (`WorkoutSession.tsx:248`) and `experience.css:364`. (IBM Plex Sans Arabic is website-only; out of scope, noted.)
- **Verify / do:** grep `font-serif`. Drop Lora from the app.

### RM-79 — PWA manifest shortcuts point at the wrong roles and routes
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `vite.config.ts:67-70`. "Dashboard" opens `/coach` for every user (a client is redirected). "Today" opens `/workout`, which the app calls "Train" (`nav.ts:30-32`). See PWA-23.
- **Recommendation:** remove them, or make one role-neutral "Today" → `/`.

### RM-80 — Keep list: the stale-chunk reload guard and the `gym-tracker` IndexedDB name
**P3 · S · LOW · KEEP · KEEP FOR TECHNICAL REASON · CODE-CONFIRMED**
- **What / where:**
  - The guard `ErrorBoundary.tsx:3-46` and `main.tsx:57-67`: still needed whenever old tabs reference deleted hashes.
  - The DB name `gym-tracker` (`LocalRepository.ts:15,52`, `blobStore.ts:9`, `bootstrap.ts:32`, `SyncEngine.ts:33`, `tombstones.ts:16`, editor draft stores). Renaming it orphans unsynced local data.
- **Recommendation:** keep both. Migrate the DB explicitly if the per-user DB redesign happens (PWA-02).

---

## H. DUPLICATE DATA / STATE SYSTEMS

### RM-81 — The client sync engine, tracker stores and reminders run for coach, admin and anonymous sessions
**P0 · S · HIGH · REMOVE · SAFE TO REMOVE · BROWSER-VERIFIED (BV-25)**
- **What / where:** `App.tsx:72-99` runs `bootstrapData()`, 6 IndexedDB store loads, habits, reminders and `useCloud.init()` **before role routing**. `cloudStore.ts:100-121` syncs any account. `sync.*` accepts any role (`api/_trpc/routers/sync.ts:2,17`).
- **Expected vs actual:**
  - Expected: only clients sync tracker data.
  - Actual: coach boot calls `sync.deletionsPull`, `singletonGet` and `pull` (BV-25), with 56 `sync.pull` calls per admin session (e2e3 RESULTS-d:130).
  - If a client's unsynced records are on the device, the coach's engine pushes them into the **coach's** namespace and marks them clean. The client never gets them (PWA-04).
- **Why remove:** data capture (P0), about 11 wasted calls every 2 min, and a meaningless sync indicator.
- **User impact:** none for coach or admin. **Technical impact:** a lighter boot for every non-client.
- **Risk:** low. **Dependencies:** RM-46; AR-02 in doc 01.
- **How to verify:** network log of a coach session (no `sync.*`). **Recommendation:** gate the engine and stores to clients now, and make `sync.*` client-only on the server.

### RM-82 — Duplicate pollers from chrome that is mounted twice
**P2 · S · MEDIUM · MERGE · SAFE TO REMOVE · BROWSER-VERIFIED (BV-29)**
- **What / where:**
  - `ResponsiveShell.tsx:32-46` mounts `BrandBar` (md:hidden) **and** `DesktopTopBar`, and `BottomNav` **and** `SidebarNav`. That gives 2 NotificationBells and 2 feed pollers. The comment "no duplicate DOM nodes" is wrong.
  - The client runs two unread loops on the same thread (`BottomNav.tsx:14` and the closed `NavMenuSheet.tsx:24`): `messages.list` 6×/min on Today (BV-29, PF-06).
- **Recommendation:** render chrome by breakpoint (not CSS), or hoist each poller into one provider.

### RM-83 — The client profile lives in three server places
**P2 · M · MEDIUM · MERGE · UNKNOWN — INVESTIGATE · CODE-CONFIRMED**
- **What / where:**
  - the sync singleton `profile` (`SyncEngine.ts:193`), edited in Settings
  - `clientProfiles.profile`, written on assessment submit (`clientProfile.ts:144-147`) and read by the coach (`coachApi.ts:74`) and by `clientSync.ts:79-87`
  - `users.displayName/photoUrl` (`Settings.tsx:190-197`)
- **Why:** coach and client may see different values (PWA-19). **Verify:** edit the profile on the client, then compare the coach view. **Recommendation:** pick one source of truth in the Phase B data model.

### RM-84 — The same data under several query keys and fetchers
**P3 · S · LOW · MERGE · SAFE TO REMOVE · CODE-CONFIRMED**
- **What / where:**
  - coach notes as `['coachNotes']` and `['myCoachNotes']`
  - coach targets mirrored to IndexedDB (`clientSync.ts:110-124`) and also fetched as `['myCoachTargets']`
  - `['coachPlan']` defined 4× with staleTime 60/300 s (`CoachPlanProvider.tsx:30`, `CoachDashboard.tsx:35`, `RoleAccount.tsx:34`, `CoachClients.tsx:108`) despite `useCoachPlan()`
  - `['coachDashboard']` 3× (300/60/300 s)
  - the roster fetched twice per Clients load
  - `CoachChecklist` downloads every template body to count them (`:28-33`) though `templatesCreated` exists

  See PF-07.
- **Recommendation:** shared hooks per resource; one key; derive counts.

### RM-85 — The client refresh storm
**P2 · S · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · BROWSER-VERIFIED (BV-29)**
- **What / where:**
  - `ClientApp.tsx:81-130` runs on mount, `visibilitychange` **and** `focus` (in-flight guard only). It runs twice per launch because its deps flip when `submitted` resolves.
  - It triggers 4 reads, 6 full IndexedDB reloads and a streak recompute.
  - Resume fires about 11 procedures (BV-29), with duplicate in-flight batches (e2e3 E-D-10, PF-09).
- **Recommendation:** single-flight with a throttle; refresh only what changed.

### RM-86 — Hand-mirrored domain types (`src/types` ↔ `api/*/types`)
**P3 · L · MEDIUM · MERGE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** at least 25 duplicated names "kept in sync BY HAND" (`api/coach-clients/_types.ts:9`): CoachPlanStatus, FreezeRequestStatus, SetType, CheckInStatus, Goal, Locale, FoodItem, MealSlot, BannerStyle, and more. The front end already imports `AppRouter` (`services/trpc.ts:2`).
- **Recommendation:** derive types via `inferRouterOutputs`, or use a shared types package.

### RM-87 — `DataSource` abstraction with a single adapter
**P3 · S · LOW · REMOVE · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:** `getDataSource()` always returns LocalDataSource (`dataSource.ts:14-18`); `kind: 'local'` is never read (`repositories.ts:41-43`).
- **Recommendation:** simplify after RM-02, or fold into the per-user DB redesign (PWA-02).

### RM-88 — Naming collisions among the plan-related services
**P3 · S · LOW · REDESIGN · LIKELY REMOVE — PRODUCT DECISION · CODE-CONFIRMED**
- **What / where:**
  - `coachPlanApi.ts` = the coach's Forma subscription (router `coachPlans`)
  - `coachPlansApi.ts` = client packages (router `coachAssets.billingPlans`)
  - `coachPlanTiersApi.ts` = the Forma configuration
  - `coachPlanRequestsApi.ts`
  - `planApi.ts` = training plans
  - `planVersionsApi.ts`

  "Plan" means 4 things (CO-36).
- **Recommendation:** rename the code to match the IA nouns (Forma subscription, packages, plans).

---

## Appendix — raw evidence
- **Unreachable src modules (import graph; entries `src/main.tsx` + tests + scripts + api):** DashboardCard, OfflineState, Page, PermissionState, ResponsiveGrid, `lib/starterLibrary`, RolePlaceholder, and `theme/{breakpoints,elevation,index,motion,radius,spacing,typography}`. No module is reachable only from tests. Every non-test api file is reachable from the 3 Vercel entries. src→api is type-only (`services/trpc.ts:2`).
- **Unused exports (excluding the website):** 322 (136 value, 186 type). Declaration-only values in src: 33.
- **tRPC:** 145 procedures in 42 namespaces. 8 have no src call site; 3 are reachable only through dead wrappers.
- **i18n:** 2,218 keys/locale; ≥240 unused (lower bound); 0 missing; parity 100%.
- **Routes with no in-app link:** `/coach/client/:id/activity`, `/settings/app`, `/landing-v1`, `/experience`. Deep-link only: `/workout/routine/:dayId`, `/progress/photos`.
- **Dead branches:** `cloudAvailable()` 24 calls in 21 files; `'local-user'` 21 checks in 21 files.
- **Build (HEAD `dist/`):**
  - Entry `index-CIivkq9d.js` is 475 KB raw / 150 KB gz and contains the seed plan, the video-seed URL builder, reminders ("Gym Tracker", Triggers API), `@capacitor/core` and en.json.
  - Precache: 2.43 MB across 159 entries; `/experience` is 614 KB of it.
  - Deployed but not precached: `exercise_videos` 131 MB, `landing_page` 8.3 MB, `Experience-*.js` 569 KB.
- **Dependencies freed:** `three` + `@types/three` (RM-63); `fflate` (RM-12); 5 `@capacitor/*` packages (RM-70).
