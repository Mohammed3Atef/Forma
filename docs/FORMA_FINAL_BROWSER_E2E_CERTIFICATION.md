# Forma — Final Browser E2E / Device Certification (Phase 3)

Date: 2026-10-02 · Scope: real-browser certification of every critical journey before release-gate work. Real DOM, real history, focus, keyboard, scroll, touch and long-press, uploads, microphone, responsive layout, RTL, error/retry, cache refresh and cross-role journeys. Nothing was deployed and no production data was written.

> **Act now, outside this phase.** The live site (`www.useforma.fit`) still serves the pre-blocker-pass bundle. `/assets/index-DTUQe2NL.js` still contains `VITE_BUNNY_API_KEY` (checked read-only; only variable **names** were printed) and the lazy chunk `bunnyUploadApi-*.js` sends `AccessKey`. The storage key is therefore **still public right now**. Rotating it, swapping the Vercel env vars and deploying (blocker-pass steps 1–2) remain the most urgent items.

## 1. Environment (safety gate)

The existing `e2e/` suite and `playwright.config.ts` target **production** (live site + the Atlas DB in `.env`), so they were **not used** for Phase 3. A separate isolated harness was built instead (`e2e3/`, `playwright.e2e3.config.ts`, `e2e3/README.md`):

| Item | Value | How it is guaranteed |
|---|---|---|
| Base URL | `http://127.0.0.1:<port>` (Vite dev, full API in-process: `/api/trpc`, `/api/media`, `/api/cron/daily-maintenance`) | `e2e3/env/server.mjs` |
| Database | fresh **in-memory MongoDB replica set** per run (`forma_e2e`), files under `e2e-out/<run>/mongo-data` | every env var set explicitly; `.env` cannot override |
| Isolation proof | `00-env.spec`: 0 non-`@e2e.test` users exist; a coach that only exists in this DB signs in and sees seed-only data | PASS in every run |
| Test accounts | `super`, `admin` (plain), `coachA`, `coachB` (Trial 1/2), `coachPro` (Pro 0/25), `clientA`, `clientB`, `clientFree` (`e2e3/env/seed-data.mjs`) | disposable; die with the run |
| Uploads | local **Bunny-compatible stand-in** (PUT / list / GET, AccessKey checked); files in `e2e-out/<run>/bunny-stub/`, served at `…/cdn/…` | server-only `BUNNY_STORAGE_ENDPOINT` (new override, unset in prod; never in the bundle) |
| Email | disabled (`RESEND_API_KEY=""`, every send a logged no-op) | explicit env |
| Frontend config | `VITE_GOOGLE_CLIENT_ID` / analytics blanked for the isolated stack | explicit env |
| Sessions | real refresh tokens minted through a localhost-only control API (avoids the per-account login rate limiter); the login UI itself is tested separately | `e2e3/fixtures.ts` |
| **Real Bunny zone** | **BLOCKED.** The only zone is production, whose key is exposed and not yet rotated; uploading test files there was not approved | needs a test zone + approval |

**Infrastructure fixes (§37):**
- Every run writes only to `e2e-out/<runId>/` (artifacts, HTML report, `results.json`, server log, stub uploads, DB files). No shared `test-results/` or `e2e-report/`.
- Parallel runs use distinct port pairs and per-port Vite caches.
- Vite's watcher ignores `e2e-out/`. Concurrent runs' trace files had been reloading pages (H-1).
- Database files moved off the OS temp dir. Leaked `mongo-mem-*` folders had filled C: to 68 MB free; I cleaned them up (E-C-6).
- Sessions are minted per context, so storage-state files are never shared.

## 2. Matrix

| Axis | Covered |
|---|---|
| Desktop Chromium | 1440 (all functional journeys), 1280, 1024 (layout/RTL) |
| Tablet | 768 (Chromium, touch) |
| Mobile | 430, 390 (Chromium, real CDP touch) |
| WebKit | iPhone 14 emulation (touch / long-press / sheets) |
| Languages | English (all journeys); Arabic via the real language control on every role's key pages at every viewport; Arabic-Egyptian on 2 pages |
| Roles | anonymous, client ×3, coach ×3, super admin, plain admin — separate browser contexts per user |

## 3. Results

Final evidence runs: `e2e-out/final-1` (the full run reached 129/180 before the 30-min tool limit), `final-2`…`final-8` and `fix-1…3` (the rest of the matrix, plus re-runs after each fix). Per-agent run history and detail: `e2e3/RESULTS-a.md` … `RESULTS-d.md`. Every run folder has `report/index.html` with screenshots, traces and videos on failure, and a `console-network.json` per test.

| # | Journey | Result | Evidence / notes |
|---|---|---|---|
| §5 | Login (coach / client / super) + role redirects; wrong password; logout → next user sees no previous data; refresh keeps session; revoked session → login, no loop; rate limit (11th → friendly 429); forgot password (generic); reset link → new password works, token single-use; signed-in `/invite` and `/reset` interstitials | **PASS** | final-6 |
| §5 | Google sign-in | **BLOCKED** | needs real Google |
| §6 | Landing → live pricing (Trial 15 d / 2, Pro 499 / 25) → Start Trial → signup → Trial active, 0 requests | **PASS** | final-6 |
| §7 | Paid selection | **PASS (adapted)** | Marketing has one CTA and `?plan=` is intentionally dead, so the flow is signup → Trial → request Pro on My Plan. Snapshot {pro, 499, 25}; cap stays 2; card shows price (E-A-1 fixed); super confirms → Pro/25, term starts at confirmation |
| §8 | Request past deadline → cron → expired; Trial + account unchanged; correct copy | **PASS** | final-8 |
| §9 | Pro → re-request = `renewal`, Pro stays active; reject → untouched | **PASS** | final-8 |
| §10 | Tier price edited to 599 while pending → marketing shows 599, request keeps 499, confirm applies the snapshot; price restored | **PASS** | final-8 |
| §11 | Coach: invite → anon claim → roster; Add Existing; workout / nutrition / cardio save + reload; note; check-in request → client sees it; subscription extend / freeze / unfreeze; history; release | **PASS** | fix-2 |
| §11/20 | Transfer request → current coach approves → exactly one move, counters −1/+1, request accepted; destination-full failure → rollback intact | **PASS** (happy path FLAKY under 4-way load, PASS on clean runs) | final-6 |
| §12/13 | Client: workout session (log sets, rest timer, video, next/prev, **reload mid-session resumes**, finish, history); nutrition + food search ×1.5, no NaN; search failure → manual entry; cardio; check-in wizard; measurements incl. **clearing a value**; progress photo; rename → coach sees it; Arabic; sign out | **PASS** | fix-2 / fix-3. Workout journey FLAKY once when run right after the coach-core spec (data ordering); PASS alone |
| §14 | Messenger desktop: text both ways; image / video / audio / PDF; attachment + caption = 2 rows; edit/delete within 2 min; after 2 min hidden/rejected; reactions (no flicker over 2 ticks); seen; load older (260 msgs, anchor kept, survives polling); scrolled-up view doesn't jump + new-message indicator; menu in viewport, outside click, Escape | **PASS** (2-min case FLAKY under load) | final-4 |
| §14 | Messenger touch: long-press opens sheet; moving press doesn't; no text selection; release does **not** tap the sheet (E-C-1 fixed); react; composer visible | **PASS** on mobile-430, mobile-390 (real CDP touch), webkit-iphone | final-3 |
| §15 | Voice: record → stop → review → remove; **cancel leaves no draft**; record → send; denial → "Microphone unavailable…" (not "unsupported") | **PASS** | final-4. A real permission-denied *prompt* is BLOCKED (fake-UI flag auto-grants; denial emulated at `getUserMedia`) |
| §16 | Uploads through the real UI: avatar (client + coach, remove), progress, assessment, check-in, exercise video, message; wrong type, too large, picker cancel, mid-flight abort, network failure → retry | **PASS** | final-6 |
| §16 | **Chunked 9 MiB video** browser → `/api/media/init` → 3 × chunk → finalize → PUT exactly 9,437,184 bytes → served URL; staging emptied; no credential from the browser | **PASS** against the local stand-in | Real-zone leg **BLOCKED** (§1) |
| §17 | Security from browser sessions: client → exercise 403; coachB → clientA thread 403; plain admin message 403; `../` ids 400; forged clientId lands in caller's own folder; no / forged session 401; another user's upload session 404; svg/html 415, oversize 413; `media.listImages` admin FORBIDDEN / super OK | **PASS** | final-6 |
| §18 | Super admin: all 12 admin destinations render, no stuck spinner, no 5xx; accounts search / filters / sheet; coaches → detail; banners (https CTA shown to coach, deleted; `javascript:` refused with a readable message — E-A-2 fixed) | **PASS** | final-7 |
| §19 | Plain admin: no Coaches / Plans / Subscriptions / Media in sidebar, bottom nav, menu or ⌘K; deep links redirect to `/admin`; allowed pages with **zero 403s** | **PASS** | final-7 |
| §21 | Starter library coachA + coachB: both succeed, 909 shared exercise ids, equal counts (909/84/10/10/9), re-run idempotent | **PASS** | fix-1 |
| §22 | Library sync: template follows identity/media, keeps programming; client plan unchanged until "Update from library"; override keeps link, no propagate; reconnect propagates; template **saves** after sync (E-B-2 fixed) | **PASS** | fix-1 |
| §23 | Food search: debounce, results, 100 g → 150 g scaling, save, reload; failure → manual entry | **PASS** | fix-2 (live wger, read-only) |
| §24 | Error states under injected 500s: Coach Revenue, client Messages, coach Messages, Coach Clients, Admin Coaches, Admin Plans, My Plan, Client Home — all show a **real error + Retry**, and recover | **PASS** (all 8 FAILed before fixes) | fix-2 |
| §25 | Unsaved changes: sidebar, top-bar avatar, editor + workspace back arrows confirm; Cancel keeps edits; Leave discards; after Save no warning | **PASS** | final-7 |
| §25 | Browser **Back** from a dirty editor | **Known limitation (P2)** | leaves without a prompt (no data router → no `useBlocker`); the local draft is restored on reopen, nothing lost |
| §26 | History: clients → client → tabs → back / forward; deep link `/notes` → back → client overview (E-B-3 fixed); messages list ↔ thread; refresh on deep links | **PASS** | final-7 |
| §27 | Cross-context freshness on tab return: plan edit 289 ms; suspension 316 ms; check-in request **14 ms** (staleTime fix) | **PASS** | final-8 |
| §28 | PWA (local production build): SW controls page; offline reload renders + offline banner, clears on reconnect; new build detected, reload **deferred while visible**, happens when hidden | **PASS** | `e2e-out/pwa-1`. Headless can't hide a tab, so hidden was emulated. Deployed new-deploy detection BLOCKED (no deploy) |
| §29 | Live cache headers: `/`, `/index.html`, `/sw.js` = `no-cache, no-store, must-revalidate`; hashed asset = `public, max-age=31536000, immutable`; manifest `no-cache`; `/api/*` is not the SPA shell | **PASS** | read-only `curl -I` of www.useforma.fit |
| §30/31 | Layout EN + Arabic (+ ar-eg) at 1440 / 1280 / 1024 / 768 / 430 / 390 for anon, client, coach, super: no horizontal overflow, correct nav per breakpoint, no clipped labels, sheets on screen, `dir=rtl`, no English on nav/CTAs, charts `dir=ltr` oldest → newest, back chevrons mirrored | **PASS** (1 FLAKY hang in a long batch; PASS alone) | final-4, final-5 |
| §32 | Keyboard / a11y: login tab order + visible focus; sheet focus trap, Escape, focus return; Ctrl+K palette arrows + Enter; icon buttons named; axe: **0 critical** (serious: landing 6 list/listitem, admin accounts 8 nested-interactive; login, client home, coach dashboard 0) | **PASS** | final-6 |
| §33/34 | Console / network over 2 min idle per role | **PASS** for super; client and coach flag P3 polling/duplicates (E-D-10/11) | final-2 |

**Final totals across the evidence runs:** every critical journey ends PASS, except the BLOCKED items (Google sign-in, real-Bunny leg, real permission-prompt denial, deployed SW update) and the documented FLAKY-under-load cases, each of which PASSes on a clean run. No unexplained 5xx and no uncaught page error remained in any final run; the only expected 4xx is the anonymous `auth.refresh` probe.

## 4. Fixes made in Phase 3

| ID | Sev | Defect (found in browser) | Fix |
|---|---|---|---|
| E-B-1 / E-D-8 | **P1** | Coach plan editors and assessment views crashed (`reading 'noInjuries'`) for a client whose assessment record lacks sections | `normalizeAssessment` at both fetch boundaries (`src/lib/assessment.ts`); unit tests |
| E-B-2 | **P1** | After a library edit synced into a template, the template could never be saved (sync wrote 9 fields as `null`) | Both sync paths `$unset` missing fields (`exerciseSync.ts`, `clientPlans.ts`); schema tolerates legacy nulls (`nullAsAbsent`); integration tests |
| E-C-1 | **P1** | Mobile long-press: lifting the finger tapped the sheet just opened (closed it, or ran **Edit**) | Swallow only the synthetic release click: within 350 ms of lift-off, at that point. iOS often fires none, so a wider window ate the next real tap — caught on WebKit |
| E-D-3 | **P1** | Coach Clients / Messages said "No clients yet" when the roster failed to load | Real error + Retry (retries roster and dashboard) |
| E-D-5 | **P1** | Client Home said "Waiting for your coach…" (and the onboarding overlay asked an existing client to re-onboard) when the plan/profile read failed | Sync outcome recorded (`coachContentStore`); Home shows error + Retry; onboarding only after a successful server read |
| E-D-1/2/4 | P2 | Permanent spinner on Revenue, Admin Coaches, message thread; "No plans yet" / "0 / —" on Admin Plans / My Plan when loading failed | Error states with Retry; thread error + Retry, clears on the next good poll |
| E-D-6 | P2 | Requested check-in only appeared on the 60 s poll | `staleTime: 0` on the active check-in → refetch on tab return (14 ms) |
| E-A-1 | P2 | Coach's request card had no price | Shows the snapshot price |
| E-C-2 | P2 | Coach roster kept a client's old name after a rename | Assessment name only replaces a missing / email-prefix name |
| E-A-2 | P3 | Banner error showed raw zod JSON | Human messages |
| E-B-3 | P3 | Back from a deep-linked client tab went to the client list | Falls back to the client overview |
| H-1/H-2/E-C-6 | harness | Pages reloaded by trace writes; real Google id / analytics leaked into the isolated stack; temp DB dirs filled C: | Watcher ignores, explicit env, DB files per run |

Two dev-only enablers were added: the local API plugin now also mounts `/api/media` and `/api/cron`, and `BUNNY_STORAGE_ENDPOINT` is an optional server-only override. Neither appears in the production bundle (scanned).

**Gates after all fixes:** `tsc -b --noEmit` clean · `npm run build` OK · **27 files / 257 tests passing** (unit + integration; 4 new tests) · production bundle scan: `VITE_BUNNY` 0, `AccessKey` 0, `MONGODB_URI` 0, `JWT_ACCESS` 0, `BUNNY_STORAGE_ENDPOINT` 0.

## 5. Remaining issues (none P0/P1)

| ID | Sev | Issue | Classification |
|---|---|---|---|
| E-B-5 | P2 | Browser Back from a dirty editor doesn't prompt (draft restored on reopen) | acceptable pre-launch; data-router migration later |
| E-D-9 | P2 | Progress photo URL reaches the server only on the next background sync (~2 min); until then the coach can't see it | defer; push after upload |
| M-12 | P2 | Exercise video upload has no progress / cancel (9 MiB took ~4 s) | acceptable pre-launch |
| E-D-13 | P2 perf | `public/Forma-logo.png` is 979 KB, shown at ~32 px, loaded on every start | **must-fix before launch** (asset swap, no code risk) |
| M-11 | P2 | Deleted progress photos stay on the CDN | defer (needs `media.delete`) |
| P-28 | P2 | Reactivating a trial-expired coach is re-pended by the cron | acceptable (route via payment confirmation); product decision |
| E-D-10/11 | P3 | Client duplicate concurrent plan batch on mount + focus; coach notifications polled twice (two bells mounted); admin runs the client sync engine | defer |
| E-B-4 / focus | P3 | Plain window `focus` (two side-by-side windows) does not refetch; tab switching does | documented in `queryClient.ts` |
| E-C-3/4/5, E-B-6/7, E-D-12 | P3 | video button no-op without a video; attach picker excludes audio; voice error reason; picker stays open after quick-create; "unsaved" after Update-from-library; palette Escape race | polish |
| Phase-2 open P2 re-check (§35) | — | query error→empty: **fixed** for the critical screens; badge staleness, broadcast partial failure, desktop-only row actions, LocalizedText.en, mobile adherence rows: unchanged | acceptable pre-launch / defer, as in the Phase-2 report |

**BLOCKED, and required before or at release:**
1. One real upload round-trip against a **test** Bunny zone (or the rotated production zone with your approval).
2. Google sign-in with a real account.
3. Service-worker update detection on a real deployment.
4. A real-device iOS / Android long-press and microphone-prompt check (emulation passed).

## 6. Data created

All test data lived in each run's in-memory DB and stub folder and disappeared with the run. No shared or production system was written. Nothing is marked `KEEP_FOR_MARKETING`. Local evidence remains under `e2e-out/` (git-ignored).

## VERDICT

**BROWSER E2E CERTIFIED WITH NON-BLOCKING LIMITATIONS**

Every critical journey passes in real browsers, including real WebKit and real touch. Auth, plan/payment state, uploads (including the chunked path), the messenger core flow and tenant/media security all hold. All P0/P1 defects found in the browser are fixed and re-verified, and there are no unexplained 500s. The limitations are the P2/P3 items in §5 and the BLOCKED real-world legs listed there, which must be closed at the release gate. Separately, the exposed Bunny key on the live site must be rotated and the fixed build deployed.

STOP — Phase 4 not started; nothing deployed.
