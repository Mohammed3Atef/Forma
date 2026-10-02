# Phase-3 results — agent B (specs 20–23)

Final combined run: `E2E_RUN_ID=b-15` (ports 5202/5302, chromium-1440). It ran 28 tests: 24 passed and 4 failed. Three of the failures are product defects. The fourth is a load flake: it passed on its own in `b-5` and again in a confirmation rerun `b-16` (3/3).
Evidence: `e2e-out/b-15/report/index.html` (screenshots, `console-network.json`, traces for failures).
Shared helpers: `e2e3/specs/_b-helpers.ts`.

## Results

| Journey | spec:test | Result | Evidence (`e2e-out/…`) | Notes |
|---|---|---|---|---|
| Legacy-assessment editor probe | 20:`E-B-1 probe` | **FAIL** | b-15 report → `01-workout-editor-legacy-assessment`, pageerror in console-network.json | The workout editor crashes for a client whose assessment has no `health` section (the seed shape). Finding E-B-1. |
| Invite → anon claim → roster | 20:`invite → anonymous claim…` | PASS | b-15 → `01-dashboard`…`05-coach-roster-has-invited` | Claim lands on the assessment wizard; DB invite `claimed`, user `assignedCoachId`, relationship active. The roster updates without a reload, but only after a tab `visibilitychange` once the 60 s staleTime has passed (65.7 s here). A window `focus` alone does not refetch. Finding E-B-4. |
| Add Existing (clientFree) | 20:`Add Existing…` | PASS | b-15 → `01-existing-detail`, `02-roster-has-free` | Shows the assign panel, not the transfer panel. DB: `assignedCoachId`, 1 active relationship, subscription active at 900, `activeClientCount` = real count (2). |
| Workout plan save/reload | 20:`workspace: workout plan…` | PASS | b-15 → `01-workout-built`, `02-workout-after-reload` | Day, section and exercise added through the PlanBuilder; the plan persists in the DB and after reload. The quick-create picker stays open after adding (E-B-6). |
| Nutrition save/reload | 20:`workspace: nutrition…` | PASS | b-15 → `01/02-nutrition-*` | |
| Cardio save/reload | 20:`workspace: cardio…` | PASS | b-15 → `01/02-cardio-*` | |
| Note visible after reload | 20:`workspace: note…` | PASS | b-15 → `01-note-after-reload` | |
| Check-in request → client sees it | 20:`workspace: request a check-in…` | PASS | b-15 → `01-coach-requested`, `02-client-sees-checkin` | |
| Subscription extend/freeze/unfreeze | 20:`workspace: subscription…` | PASS | b-15 → `01-extended`, `02-frozen`, `03-unfrozen` | Extend moves `endAt` by exactly 30 days; status pill updates without reload. |
| History tab | 20:`workspace: history…` | PASS | b-15 → `01-history` | |
| Release invited client | 20:`release the invited client…` | PASS | b-15 → `01-release-confirm`, `02-roster-after-release` | Relationship ended (`released`), `assignedCoachId` cleared, counter 2→1. |
| Transfer happy path | 21:`transfer: coachB requests clientA…` | **FLAKY** | b-15 failure trace (`Approve & release` still disabled after 10 s); PASS in b-5 and b-16 → `01`…`05-*` | Under parallel-agent load the approve mutation took more than 10 s. When it passes: success toast, no error dialog, roster 0/2 vs 2/2, exactly 1 active relationship (coachB), old one `ended`/`transferred`, counters −1/+1, request `accepted`. |
| Transfer failure (destination full) | 21:`transfer failure…` | PASS | b-15 → `02-coachA-error`, `03-coachA-unchanged` | Error dialog shown ("Destination coach: …"); source relationship still active; counters unchanged; request back to `pending`. |
| Starter library ×2 + idempotent | 22:`starter library…` | PASS | b-15 → `01`…`05-*` | coachA loaded it from Library, coachB from the Templates empty state. No duplicate-key error. Counts are equal per coach (909 / 84 / 10 / 10 / 9), all 909 exercise ids are shared, and a re-run left the counts unchanged. |
| Library → template → client sync | 22:`library sync: template follows…` | **FAIL** | b-15 → `03-template-follows-library`…`06b-*`, failure screenshot | Template follows the library name and video while keeping 5×5 programming. The client plan is unchanged until "Update from library", which refreshes it and keeps programming. But the propagation writes `null` into 9 fields, after which the template can no longer be saved (raw Zod error). Finding E-B-2. |
| Override → no propagate → reconnect | 22:`library sync: override on a fresh…` | PASS | b-15 → `01-override-not-propagated`, `02-reconnected` | Editing the name turns `librarySyncEnabled` off and keeps `libraryExerciseId`. Library edits then don't propagate; Reconnect restores sync and later edits propagate again. |
| Unsaved: sidebar | 23:`unsaved guard: sidebar…` | PASS | b-15 → `01-sidebar-guard`…`03-reopened` | Cancel keeps the edit; Leave navigates and discards it. |
| Unsaved: top-bar avatar | 23:`unsaved guard: top-bar avatar…` | PASS | | |
| Unsaved: editor/workspace back arrows + tab rail | 23:`unsaved guard: editor back arrow…` | PASS | b-15 → `01-editor-back-guard`, `02-after-leave` | |
| Unsaved: browser Back | 23:`unsaved guard: browser Back…` | PASS (records known gap) | b-15 → `01-after-browser-back` | In-app browser Back leaves the editor with no prompt. The draft is restored when the editor is reopened. Finding E-B-5. |
| Unsaved: after Save no warning | 23:`unsaved guard: after Save…` | PASS | b-15 → `01-no-warning` | |
| History: list → client → tabs → back/fwd | 23:`history: Clients → client…` | PASS | b-15 → `01-notes-tab`, `02-back-to-clients` | Tabs use `replace`, so the back arrow goes to Clients; browser Back/Forward agree. |
| History: deep link `/notes` | 23:`history: deep link to /notes…` | **FAIL** (vs brief) | b-15 → `01-deeplink-after-refresh`, `02-after-back` | Refreshing keeps the page, and back stays on the site, but it lands on `/coach/clients`, not the client overview. Finding E-B-3. |
| Messages back behaviour | 23:`history: messages…` | PASS | b-15 → `01`…`03-*` | Workspace → thread → back returns to the workspace. A deep-linked thread (also after refresh) → back goes to `/coach/messages`. On desktop, clicking a thread row keeps the URL at `/coach/messages` (split pane). |

Each spec restores the seed state it changed in a final `restore seed state` test. This is not done in `afterAll`, because Playwright runs `afterAll` on every worker restart after a failure, which tore down state mid-file in early runs.

## Findings

- **E-B-1 (P1)**: The coach plan editors crash for a client with a legacy or partial assessment.
  - Repro: a client whose `clientProfiles.assessment` has no `health` section (the shared seed: `{status:'submitted', completed:true, basic:{fullName}}`). Open `/coach/client/<id>/workout`, `/nutrition` or `/cardio`.
  - Result: `TypeError: Cannot read properties of undefined (reading 'noInjuries')`. The editor never renders, so the coach cannot edit the plan.
  - Evidence: b-15 `E-B-1 probe` (pageerror, `01-workout-editor-legacy-assessment`).
  - Suspected cause: `src/components/coach/ClientContextPanel.tsx:20-24` (also `src/components/AssessmentView.tsx:29,97`). The code reads `assessment.health.*` and `assessment.nutrition.*` without guards, even though `types/index.ts` says legacy docs are supported.
  - Specs 20, 22 and 23 work around this by patching their client to a complete assessment as setup. The seed itself was not changed.
- **E-B-2 (P1)**: After a library edit syncs into a template, the template can no longer be saved.
  - Repro: library exercise (name and video only) → add it to a template → save → edit the library exercise → reopen the template → change anything → Save.
  - Result: save fails with a raw Zod error (`exercises.<id>.images: Expected array, received null`, and the same for `sourceCategory`, `muscles`, `secondaryMuscles`, `equipmentList`).
  - Cause: the propagation `$set`s every synced field from the library doc, so fields the library doesn't have are written as `null`. In the DB: `videoId, category, equipment, equipmentList, imageUrl, images, muscles, secondaryMuscles, sourceCategory` are all null.
  - Suspected files: `api/coach-assets/_lib/exerciseSync.ts:88` (`set[...] = doc[f]` for undefined values). `api/_trpc/routers/clientPlans.ts:74` uses the same pattern for "Update from library"; the client plan still saved in this run, but it has the same nulls. The template schema `api/coach-assets/_lib/schemas.ts:44-48` is `.optional()`, not `.nullable()`.
  - Also P3: the raw Zod JSON is shown to the coach (`src/pages/coach/CoachWorkoutTemplateEditor.tsx:99`).
  - Evidence: b-15 `library sync: template follows…` (annotation `template-null-fields-after-sync`, failure screenshot).
- **E-B-3 (P3)**: From a deep link (`/coach/client/<id>/notes`, fresh context), the workspace back arrow goes to `/coach/clients` instead of the client overview. It does stay on the site.
  - Cause: the fallback is hard-coded in `src/components/coach/CoachClientWorkspaceLayout.tsx:81` (`useBack('/coach/clients')`), and tabs use `replace`.
  - Evidence: b-15 `history: deep link…` (`02-after-back`, annotation `deeplink-back-landed`).
- **E-B-4 (P3)**: The coach roster does not pick up a newly claimed invite on return to the tab until the 60 s staleTime has passed (65.7 s observed). A window `focus` event alone never refetches.
  - Cause: React Query v5's focus manager listens only to `visibilitychange`. The comment in `src/services/platform/queryClient.ts:17-23` says side-by-side windows (`focus`) are covered; they are not.
  - Nothing invalidates `myClients` / `coachDashboard` when the Add-client sheet closes (`src/pages/coach/CoachClients.tsx` `Sheet onClose`).
  - Evidence: b-15 `invite…` (annotations `window-focus-refetch:false`, `roster-refresh-ms:65681`).
- **E-B-5 (P2, known)**: Browser/hardware Back from a dirty workout editor leaves with no confirmation. The local draft is restored when the editor is reopened, so no data was lost in this run.
  - Cause: documented in `src/hooks/useUnsavedGuard.ts:20-24` (no data router, so no `useBlocker`). A full-document Back does trigger the native `beforeunload` prompt.
  - Evidence: b-15 `browser Back…` (annotations).
- **E-B-6 (P3)**: The exercise picker's quick-create adds the exercise but leaves the picker sheet open, covering the editor. The doc comment says it "adds+closes immediately".
  - Location: `src/components/workout/ExercisePickerSheet.tsx:107-111` (no `onClose()`).
  - Evidence: b-15 workout test `00-picker-still-open-after-quick-create`.
- **E-B-7 (P3)**: After "Update from library" in the client workout editor, the change is already persisted server-side, yet the editor shows "Unsaved changes" and arms the leave guard.
  - Location: `src/components/workout/PlanBuilder.tsx:187-190` updates local state, which is then dirty against the baseline.
  - Evidence: b-15 annotation `unsaved-after-update-from-library:true`.

## Environment notes (not product defects)

- **C: drive full.** Partway through, C: filled up (about 50 stale `%TEMP%\mongo-mem-*` dirs from all agents' runs, about 10 GB). New stacks then failed to boot (`mongod fassert`), and a running one returned 500s on `coachPlanRequests.get`. I removed only dirs idle for more than 20 minutes, which freed about 4 GB. The 500 did not reproduce afterwards. The harness should clean these up when a run ends.
- **Machine load.** Four parallel stacks make first loads slow (10–15 s splash) and keep `networkidle` from settling. My specs use `appReady(page, marker)` in `_b-helpers.ts` instead of the fixtures' `ready()`.
