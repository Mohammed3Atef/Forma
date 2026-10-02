# Phase-3 E2E — Agent D results (media, errors, cache, layout/RTL, a11y, network)

Ports 5204/5304. The final runs are `e2e-out/d-20/` (all chromium-1440 files) and `e2e-out/d-21/` (responsive matrix). Earlier per-file runs, also cited below, are d-1 (41), d-5/d-6/d-7 (40), d-8 (42), d-11/d-12 (43), d-13/d-15 (46) and d-16 (47).
Each run folder holds `report/` (HTML, with every screenshot and JSON attachment), `results.json`, `artifacts/` (traces and videos of failures) and `bunny-puts.json`.
Spec files: `e2e3/specs/40-47*.spec.ts`. The helpers are in `_d-helpers.ts`. The layout checks shared by 44 and 45 are in `_d-layout.ts`.

## Results

| check | spec:test | project | result | evidence | notes |
|---|---|---|---|---|---|
| Avatar, client | 40:avatar (clientA) | 1440 | PASS | d-20 | Pick, crop, then save. One PUT `Forma/e2e-client-a/avatar/*.webp`; `users.photoUrl` = cdn URL; the image renders after reload. Remove clears `photoUrl` and the image stays gone after reload. |
| Avatar, coach | 40:avatar (coachA) | 1440 | PASS | d-20 | Same as the client, at `/coach/settings`. |
| Avatar >2 MB | 40:oversized avatar | 1440 | PASS | d-20 | A 5.9 MB PNG is cropped/downscaled on the device to 117 KB webp. No error is shown and nothing oversized is stored. The 2 MB cap cannot be reached from the UI. |
| Avatar SVG | 40:SVG avatar | 1440 | PASS | d-20 | The SVG is rasterised to webp (1 KB). No SVG content-type or path is stored. |
| Progress photo | 40:progress photo | 1440 | PASS | d-20 | One PUT `Forma/e2e-client-a/*.webp`, and the image loads. The `cdnUrl` only reached the server after **~117 s** (background sync); see E-D-9. |
| Assessment photo | 40:assessment photo | 1440 | PASS | d-7, d-20 | Path: Edit assessment, then 7×Next to the photos step. One PUT under `/assessment/`; `clientProfiles.assessment.progressPhotos.front` = URL. Needed a complete assessment, because the seed stub crashes the view (E-D-8). |
| Check-in photo + bad type + too large | 40:check-in photo | 1440 | PASS | d-20 | The coach requests through the UI, the client opens it from the Home card. An `.html` file shows "Unsupported file type…" inline and a 6 MB JPEG shows "Image is too large (max 5 MB)." inline, with no request and no PUT. The valid photo gives one PUT `Forma/e2e-client-a/checkin/<weekStart>/*.webp`, and `checkIns.progressPhotos.front` = URL. |
| Exercise video ≤4 MiB | 40:exercise video single | 1440 | PASS | d-20 | Only `/api/media/upload` is called. PUT bytes equal the file size. Served `video/mp4`. Saved on `coachExercises.videoUrl`. |
| **Chunked 9 MiB video** | 40:exercise video 9 MiB | 1440 | PASS | d-20 | Calls were `init → chunk ×3 → finalize`. PUT bytes = 9 437 184 = file size; served bytes are identical. `mediaUploads` and `mediaUploadChunks` are empty afterwards. **No % progress, no progressbar, no cancel control** (M-12 confirmed). |
| Wrong type (exercise .html) | 40:wrong type | 1440 | PASS | d-20 | The dialog says "Unsupported file type…", no PUT, and the button recovers. |
| Cancel the file picker | 40:cancel picker | 1440 | PASS | d-20 | No `/api/media` request. |
| Message attachment | 40:message attachment | 1440 | PASS | d-20 | One PUT `Forma/e2e-client-a/messages/*.webp`. The image renders (naturalWidth>0) in the client and coach threads. The `messages` doc has the attachment URL. |
| Message SVG / >5 MB | 40:message SVG & big | 1440 | PASS | d-20 | Friendly dialogs ("Unsupported file type", "too large"), no PUT, no stuck "Uploading…". |
| Abort a message upload mid-flight | 40:cancel mid-flight | 1440 | PASS | d-20 | Cancel removes the pending bubble and restores the draft. No PUT, no message doc, no spinner, no error dialog. |
| Network failure, then retry | 40:network failure | 1440 | PASS | d-20 | "Upload failed. Please try again." plus "Couldn't send". After unroute, Retry gives one PUT and the image renders. |
| No storage credential from the browser | every 40 upload test (`expectClean`) | 1440 | PASS | d-20 | No browser request carried an `AccessKey` header, the stub key, or a `/storage/` URL. |
| Client uploads category=exercise | 41 | 1440 | PASS | d-1, d-20 | 403 on both upload and init. |
| coachB uploads into clientA's thread | 41 | 1440 | PASS | d-1, d-20 | 403. Control: coachB into its own client's thread → 200 at `Forma/e2e-client-b/messages`. |
| Plain admin message upload | 41 | 1440 | PASS | d-1, d-20 | 403. |
| `../` in clientId / checkInId | 41 | 1440 | PASS | d-1, d-20 | 400 for all 5 variants, including an encoded one and one via init. |
| Forged clientId on a self category | 41 | 1440 | PASS | d-1, d-20 | progress, avatar, assessment and checkin all landed under `Forma/e2e-client-a/`. |
| No session / forged bearer | 41 | 1440 | PASS | d-1, d-20 | 401 on upload, init, chunk and finalize. |
| Another user's upload session | 41 (extra) | 1440 | PASS | d-1, d-20 | coachB chunk/finalize on coachA's uploadId → 404. |
| Server-side type and size limits | 41 (extra) | 1440 | PASS | d-1, d-20 | svg, html and `evil.html` as octet-stream → 415; avatar >2 MB and image >5 MB → 413. |
| `media.listImages` | 41 | 1440 | PASS | d-1, d-20 | Admin → 403 FORBIDDEN; super → array. The `/admin/media` gallery renders. |
| CoachRevenue on 500 | 42 | 1440 | FAIL-permanent-spinner | d-8, d-20 | E-D-1 |
| Client Messages on 500 | 42 | 1440 | FAIL-permanent-spinner ("Working…" forever) | d-8, d-20 | E-D-2 |
| Coach Messages on 500 | 42 | 1440 | FAIL-misleading-empty ("No clients yet") | d-8, d-20 | E-D-3 |
| Coach Clients on 500 | 42 | 1440 | FAIL-misleading-empty ("No clients yet") | d-8, d-20 | E-D-3 |
| Admin Coaches on 500 | 42 | 1440 | FAIL-permanent-spinner | d-8, d-20 | E-D-1 |
| Admin Plans on 500 | 42 | 1440 | FAIL-misleading-empty ("No plans yet.") | d-8, d-20 | E-D-4 |
| My Plan on 500 | 42 | 1440 | FAIL-misleading-empty ("0 / —") | d-8, d-20 | E-D-4 |
| Client Home on 500 | 42 | 1440 | FAIL-misleading-empty ("Waiting for your coach to assign your plan.") | d-8, d-20 | E-D-5. Control with a healthy backend showed the plan. |
| Plain admin `/admin/subscriptions` | 42 | 1440 | PASS | d-20 | Redirects to `/admin`, no spinner, no super-only queries fired. |
| Coach edits plan → client refocus | 43 | 1440 | PASS | d-12, d-20 | Fresh **289 ms** after refocus, 0 navigations. |
| Admin suspends coach → coach refocus | 43 | 1440 | PASS | d-11, d-20 | Suspended screen **316 ms** after hidden→visible. A window `focus` alone does nothing within 5 s (E-D-7). |
| Coach requests check-in → client refocus | 43 | 1440 | FAIL | d-11, d-20 | Took **44.2 s / 33.3 s** (the 60 s poll, not focus). E-D-6. |
| Layout EN, all roles | 44 / 45 | 1440, 1280, 1024, 768, 430, 390 | PASS | d-2, d-21 | No horizontal overflow on any page. Bottom nav below 768 and sidebar from 768 up for coach/admin; the client shell always has the bottom nav (by design). No clipped nav labels. |
| Add-client sheet on screen | 44 / 45 | all | PASS | d-2, d-21 | The panel and its last control are inside the viewport. There is no footer element (the sheet passes none). |
| Arabic via the real UI control | 44 / 45 | all | PASS | d-2, d-21 | `dir=rtl`; nav labels and the Add-client aria-label are not English. The `/progress` chart has `dir=ltr` and its points run oldest→newest (68→69→69.86). Back chevrons are mirrored on the workspace and the thread. |
| ar-eg (client home + coach dashboard) | 44 / 45 | all | PASS (1440: FLAKY) | d-2, d-21; d-20 timeout | rtl with no English leakage. At 1440 it passed in d-2 and hit the 180 s timeout under machine load in d-20. |
| Anon landing/login overflow | 44 / 45 | all | PASS (768: FLAKY) | d-21 | Overflow is OK. In d-21 the 768 run failed only on an env "Failed to fetch dynamically imported module" (see E-D-14); it passed in d-4. |
| axe scans | 46 | 1440 | PASS (no critical) | d-13, d-20 | landing: 6 serious (`list`/`listitem`); login: 0; client home: 0; coach dashboard: 0; admin accounts: 8 serious (`nested-interactive`). **X-13 (`label`) not flagged on any page.** admin-accounts went FLAKY in d-20 on the env dynamic-import error. |
| Login Tab order + focus ring | 46 | 1440 | PASS | d-20 | email → password → submit order holds, focus rings are visible, and Enter submits. |
| Sheet focus trap / Escape / restore | 46 | 1440 | PASS | d-20 | Focus moves into the sheet, 12 Tab/Shift-Tab presses stay inside, Escape closes, and focus returns to the trigger. |
| Ctrl+K palette | 46 | 1440 | PASS (FLAKY once) | d-14 fail, d-15, d-20 | Arrows move `aria-selected` and Enter on "Aya" opens the client. One run lost an early Escape; see E-D-12. |
| Icon buttons have accessible names | 46 | 1440 | PASS | d-20 | Every visible button and link in the sidebar and top bar has a name. |
| Network: client | 47 | 1440 | FAIL | d-16, d-20 | `messages.list` at 36/120 s and duplicate in-flight batches (E-D-10). |
| Network: coach | 47 | 1440 | FAIL | d-16, d-20 | `notifications.list` at 8–10/120 s, double poller (E-D-11). |
| Network: super | 47 | 1440 | PASS (with the corrected sync.pull budget) | d-16 | — |

## FINDINGS

- **E-D-1 (P2) Permanent skeleton on a failed query: CoachRevenue and Admin Coaches.**
  - Repro: route `coachClients.dashboardSummaries|listMyClientUsers|list` or `adminCoaches.list` to 500.
  - Result: the cards skeleton stays forever, with no error and no retry.
  - Evidence: `e2e-out/d-20/report` (42 coach-revenue / admin-coaches `*-failing.png`).
  - Code: `src/pages/coach/CoachRevenue.tsx:30-31` (`!d` → LoadingState, no error branch); `src/pages/admin/AdminCoaches.tsx:233-234`.
  - Impact: the business screen looks like it is still loading, but the user cannot act.
- **E-D-2 (P2) Client Messages shows "Working…" forever when `messages.list` fails.**
  - Cause: poll errors are swallowed and the thread never leaves its loading state. The composer is still shown, so a client can type into a thread that never loaded.
  - Evidence: d-8 / d-20 `client-messages-failing.png`.
  - Code: `src/services/platform/messagesApi.ts:103-105`; `src/components/MessageThread.tsx:677-678`.
- **E-D-3 (P1-misleading) Coach Clients and Coach Messages say "No clients yet" (with the Add-client CTA) when `coachClients.listMyClientUsers` fails.**
  - Impact: a coach with paying clients is told they have none and is invited to add more. This is a core journey made misleading.
  - Code: `src/pages/coach/CoachClients.tsx:144-160, 265-268`; `src/pages/coach/CoachMessages.tsx:104-160`.
- **E-D-4 (P2) Admin Plans shows "No plans yet." and My Plan shows "0 / —" on a 500.**
  - Admin Plans: `tiers = q.data ?? []` (`src/pages/admin/AdminPlans.tsx:55, 175-178`). A super admin could recreate tiers that already exist.
  - My Plan: renders `—` as if the coach had no plan (`src/pages/coach/CoachPlan.tsx:86-99`).
- **E-D-5 (P1-misleading) Client Home says "Waiting for your coach to assign your plan" when the plan fetch fails, on a fresh device.**
  - Repro: `workoutPlan.get` etc. return 500 while the coach has assigned a plan. The control run with a healthy backend shows the plan.
  - Code: `src/services/platform/clientSync.ts:71-72` swallows the error; `src/pages/Home.tsx:198` shows WaitingForCoach.
  - Impact: the client believes the coach did nothing.
- **E-D-6 (P2) A requested check-in does not appear on refocus.**
  - Measured: it appeared on client Home only after 44 s and 33 s (the 60 s `refetchInterval`), never on the focus refetch.
  - Cause: the global `staleTime: 60_000` suppresses `refetchOnWindowFocus` for queries fetched under a minute ago.
  - Code: `src/hooks/useActiveCheckIn.ts:14-19`; `src/services/platform/queryClient.ts:13-23`.
  - Evidence: d-20 43 `checkin.json`.
- **E-D-7 (P3) Suspension is only picked up on `visibilitychange`.**
  - A window `focus` (switching back to an already-visible window, for example on a multi-monitor setup) does not re-check `auth.me`. The coach kept the full app for at least 5 s, until a hidden→visible transition.
  - Code: `src/App.tsx:63-70`.
- **E-D-8 (P3) Assessment views crash on a partial assessment record.**
  - Errors: `TypeError: Cannot read properties of undefined (reading 'hasMedicalConditions' / 'noInjuries')`.
  - Where: the client `/assessment` view, and the coach workout editor's context panel. The editor crashed until a complete assessment was seeded.
  - Code: `src/components/AssessmentView.tsx:28-29`; `src/components/coach/ClientContextPanel.tsx:20-23`.
  - Repro: the seed's `{basic:{fullName}}` stub. It only matters if legacy or migrated records can lack `health`, but these views have no guard or error boundary.
- **E-D-9 (P2) A progress photo's CDN URL reaches the server only after the next background sync.**
  - Measured: 117 s in this run (cycles every 120 s; visibility sync is throttled to 60 s). Until then the coach cannot see the photo.
  - Code: `src/stores/photoStore.ts:34-37` (local `dirty` only); the SyncEngine cadence.
- **E-D-10 (P3) The client fires the plan-content batch as duplicate concurrent requests, and `messages.list` runs faster than documented.**
  - Duplicates: the `workoutPlan.get,nutritionPlan.get,coachTargets.get,profile.get` batch was sent while an identical one was still in flight, 11 times in one session. The mount, `visibilitychange` and `focus` listeners all fire.
  - Code: `src/apps/ClientApp.tsx:81-126`.
  - Rate: `messages.list` ran 36 times in 120 s idle on `/messages` (one every 3.3 s), against 24 + 6 expected for the 5 s thread poll plus the 20 s badge.
- **E-D-11 (P3) Coach notifications are polled 8–10 times per 120 s instead of about 5 (25 s cadence).**
  - Suspected cause: two NotificationBell instances are both mounted, the mobile BrandBar (`md:hidden`) and the DesktopTopBar.
  - Code: `src/components/shell/ResponsiveShell.tsx:241` plus `DesktopTopBar`.
- **E-D-12 (P3) The command palette's Escape only works when the input has focus.**
  - On reopen the input is focused after a 10 ms timeout, so an immediate Escape is lost (one failing run, d-14).
  - Code: `src/components/ui/CommandPalette.tsx:94-109` (keydown is on the input only) and `:45`.
  - Also: coach Ctrl+K has no plain page destinations (Revenue, Clients, …), only actions and entities.
- **E-D-13 (P2 perf) `/Forma-logo.png` is 979 KB and loads on every app start.**
  - It is the largest single asset in every role's first load. It is shown at `h-8` or `w-48` in BrandBar, Sidebar and Splash.
  - File: `public/Forma-logo.png`.
- **E-D-14 (harness, not product) Intermittent "Failed to fetch dynamically imported module (AdminApp/CoachApp.tsx)" under machine load.**
  - It comes from Vite dev, plus mongod `fassert` boot failures while C: had about 3.6 GB free (two d-9/d-10 boots failed). These caused the FLAKY results above.
  - Also: the `setLanguage` fixture calls `window.__formaSetLocale`, which does not exist in `src/`, so it is a silent no-op. My specs switch language through the real UI instead.
- **Observation (M-12 confirmed):** the exercise video upload shows only "Uploading…" with no percentage, no progress bar and no cancel, even for the 9 MiB chunked upload.

## Performance numbers (d-16 / d-20, chromium-1440, Vite dev, so script sizes are unbundled)

| role | 120 s idle page | idle calls per procedure | first load |
|---|---|---|---|
| client | `/messages` | messages.list 36, notifications.list 4, sync.pull 8 (one cycle × 8 collections), sync.singletonGet 2, sync.deletionsPull 1 | 175–177 requests, 4.7 MB (script 3.6 MB, image 979 KB) |
| coach | `/coach/messages/e2e-client-a` | messages.list 24, coachThreadsSummary 6, notifications.list 8–10, coachPlanRequests.get 2, sync.pull 8 | 202–213 requests, 5.4–5.5 MB (script 4.3 MB, image 1.17 MB incl. forma-mark.png 192 KB) |
| super | `/admin` | sync.pull 8, sync.singletonGet 2, sync.deletionsPull 1 (nothing else polls) | 184 requests, 5.0 MB |

- **Heaviest assets:** `Forma-logo.png` 979 KB; Vite dep chunk 910 KB; react-router-dom 205 KB; forma-mark.png 192 KB; @trpc/client 148 KB; react-query 130 KB.
- **4xx/5xx during the sessions:** none apart from the expected `auth.refresh` probes.
- **Session totals for the client** (5 pages + 2 min): sync.pull 56, messages.list 64, workoutPlan.get 18, banners.forViewer 12.
- **Coach/admin also run the client SyncEngine:** 56 sync.pull calls for a super admin with no client data (P3 waste).
- **Time-to-fresh:** workout plan 289 ms; suspension 316 ms; check-in 33–44 s (E-D-6).
- **Progress photo cdnUrl server-side:** about 117 s.
- **Chunked 9 MiB upload:** init, 3 chunks and finalize completed in about 4 s (with an injected 700 ms per chunk).
