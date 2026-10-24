# B3 — Coach certification report

**Phase:** B3.0.1 → B3.9 (coach blueprint) · **Date:** 2026-10-22 · **Branch:** `development` (local)
**State certified:** the working tree after B3.9, which includes:
- the B3.8 completion, final review and finalization;
- the B39A-S01 / B36-R4 security hotfix;
- B3.9 C0–C7.

Nothing is committed or deployed (commit boundaries are proposed in §8).

## 1. Verdict

**CERTIFIED LOCALLY — PASS.** Every coach screen of the blueprint is built and covered by automated browser and API tests, accessibility and visual matrices, and an offline boot on the production build.

**Not certified here:**
- physical devices (the R-checks; R-17 must be re-run on this build);
- production.

Production still runs RC2 `cf3a5d9`, without the B39A-S01 fix: the P0 stays exposed there until the owner deploys and runs the incident checklist (§7).

## 2. Exit criteria (B3.9_AUDIT_AND_PLAN §7–§8, owner brief 2026-10-22)

| Criterion | Result | Evidence |
|---|---|---|
| Full e2e3 | **373 tests: 369 passed, 1 skipped** (the approved Google sign-in skip), **3 failed — all fixed and re-run green**:<br>• spec 21: the transfer wording, now the destination reasons;<br>• spec 97 axe: the browser context lost under the full run's memory pressure — not a violation;<br>• spec 97 tap targets: controls that only exist with full data.<br>Re-run on the final tree: specs 21, 85, 86, 87, 89, 92, 96, 97 → **84 passed + 1 fixed and re-run (tap) → 85 / 85** | runs `b39-full-1`, `b39-final-rerun`, `b39-tap-final` on the frozen copy `D:\Gym-b38cert` (isolated stack) |
| Unit + API | **1,204 / 1,204** (API 763 · UI 441; 129 files) | `npx vitest run` |
| Typecheck (app + api), architecture boundaries, production build | PASS | `tsc -b`, `lint:boundaries`, `vite build` |
| Journeys K, L, M | PASS | `e2e3/specs/96-b39-journeys.spec.ts` |
| axe matrix (390 / 768 / 1024 / 1440 / 1920 × EN / AR / AR-EG + error states) | **0 violations** (225 + 6 scans) | spec 97 |
| Visual matrix 360 → 1920 | **225 shots, 0 px overflow** | spec 97 → `e2e-out/<run>/b39-visual/` |
| Tap targets ≥ 44 × 44 px (390, 1440) | **PASS** (after two rounds of fixes: 14 control kinds on the seeded data, 6 more with full data — §VQA) | spec 97 |
| Coach offline boot (production build of the final tree, phone + desktop) | **PASS** — Today, Clients, Messages and Library render offline with their offline state; no endless skeleton; no chunk from the network | `e2e3/pwa/b39-coach-offline-boot.mjs` |
| Client offline boot (production build) | **PASS** | `e2e3/pwa/b1-client-offline-boot.mjs` |
| PWA (install, offline reload, deferred update) | **PASS** | `e2e3/pwa/pwa-check.mjs` |
| Bundle | every coach screen within +20 % of B3.8 (Today +18.8 %, others +2.9 – 7.4 %); entry 161.88 kB gzip (+1.5 %) | `scripts/bundle-report.mjs --strict` PASS on the reviewed baseline (§6) |
| Concurrency / integrity (real replica set) | PASS | `b39Integrity.test.ts` (17), `b39Security.test.ts` (15) |
| Physical devices | **not done** | R-checks open |

## 3. Quality

**Unit and API tests added in this phase:**
- `appUrl.test` (6) and `b39Security.test` (15);
- `b39Integrity.test` (17);
- `b38CoachP2` (+4) and `b38FinanceIsolation` (+3);
- `errorMessage.test` (8) and `ScreenState.test` (+4);
- `useFocusTrap.test` (6) and `SkipLink.test` (1);
- `coachWorkspace.test` (+2);
- `AdminSubscriptions.test` (3).

**Browser specs:**
- new: 96 (journeys K, L, M + keyboard) and 97 (the certification matrix);
- 89 (+ the version-history redirect; swap review removed);
- C0 robustness on 13 specs (Cairo dates, selectors, language waits).

**Test semantics changed with a product decision (none weakened):**
- spec 89: the swap-review switch is gone (owner D6);
- specs 20 / 22 / 81: toast titles are now outcomes (TS-06);
- `clientPayments` / `b301Ownership` / `certification`: owner B38F-R2 (admin reads no payments) and the server-side `fromCoachId` (B3-S09 family);
- `b34`: an answered check-in can't be deleted.

## 4. Coach journeys (blueprint §10.2)

| Journey | Specs |
|---|---|
| A First run · B Daily triage | 85, 86 |
| C Training · D Conflict · E Nutrition · F Cardio | 20, 89 |
| G Check-in | 20, 30, 86, 88 |
| H Messaging | 31, 90, 91 |
| I Library | 22, 92 |
| J Business / capacity | 50, 93, 94, 95 |
| **K Account isolation** | **96** — coach B sees none of coach A's clients, drafts or conversations; A's own draft is still A's |
| **L Arabic** | **96** — Today RTL; a target typed "٢٢٥٠" saves 2250; an Arabic message |
| **M Failure recovery** | **96**:<br>• a failed read → Retry recovers;<br>• a failed write reads "Forma had a problem on its side…", never the server's text;<br>• offline mid-session → offline notice, then refresh;<br>• a half-written message survives a reload.<br>Cold offline start → the production offline boot (§2). |

## 5. Audit status at the end of B3

`FORMA_MASTER_REMAINING_BACKLOG.md` (506 entries):
- **B3 phase: 0 open.**
- B3.9 closed 27 entries and 10 new B39A-R entries, and mitigated 19.
- Everything left of the B3 phase is carried **by ID**: 13 content items (EX / FD) to **B4**, 35 to **B5**.

Fixed in B3.9 (with tests):

| Area | IDs |
|---|---|
| Server integrity / privacy | B3-S09; B39A-R1 one active relationship; R2 `endRelationship` CAS; R3 plan versions per stint; R4 `decide` CAS; R5 hardening |
| Honest states | CO-18, VS-16, RM-32, B39A-R10 |
| Design system | VS-01, VS-02, VS-04, VS-10, VS-13, RM-33, AX-08, B33-R1 |
| Accessibility / RTL | AX-01, AX-03, AX-05, AX-11, B39A-R9, RTL-07, RTL-09, B32-R1, B39A-R7, B39A-R8 |
| Coach screens | CD-01, CD-04, CO-13, CO-19 / RM-67 (D6), CO-38, B39A-R6 (one weekly rule), TS-06 |
| Tests | B3-C07 |

**Mitigated (the remainder is carried to B5 by ID):**
- **Design system:** CD-02, RM-31, CD-03, VS-05, VS-06, VS-17, RM-49, CO-42, B2-R03.
- **Performance:** PF-07, RM-84, PF-12, PF-14 (D5 scope), PF-21, PF-22, B38F-R7.
- **RTL:** RTL-06, RTL-11.
- **Errors:** TS-02 (3 auth-screen paths need an auth-page change).

## 6. Engineering notes

- **Reviewed bundle baseline:** `scripts/bundle-budgets.json` keeps the B3.8 values in `previous`.
  - Today +18.8 % gzip: the desktop panel's client context.
  - Every other coach screen +2.9–7.4 %.
  - Entry +1.5 %: new English strings and the shared a11y code.
  - All are within the blueprint's +20 % allowance.
- **Two additive indexes** are in `scripts/mongo-init-indexes.mjs` and were **not built** against any database:
  - `notifications {clientId, forRole, seenAt}`;
  - `syncRecords {clientId, collection, data.finished, data.date}`.

  The `uniq_active_client` partial unique index has a duplicate preflight. Building indexes in production needs owner approval.
- **App-only CSS:** `useAppSurface` marks `<html data-surface="app">` in the signed-in app, so the 12 px floor for shared label classes, mono-in-Arabic and the Arabic interpolation isolation never reach the website or the auth pages.
- **Dev-only limit:** the dev server can't serve a not-yet-loaded lazy screen offline. Offline navigation is certified on the production build (the offline-boot scripts), not in dev e2e.

## 7. Release status (unchanged blockers)

- **B39A-S01 (P0)** and **B36-R4 (P1):** fixed locally, deploy pending. Incident checklist: `B3_IMPLEMENTATION_LOG.md` §Security hotfix (deploy; optionally set `APP_BASE_URL`; invalidate outstanding reset tokens; review Resend / Vercel logs; revoke affected sessions; record in REL-02).
- **MD-01 / 02 / 03:** owner-deferred media.
- **PWA-06:** mitigated, accept or close.
- **REL-01 – 04:** commits, security review, production config, clean launch.
- **Physical-device checks:** R-01 – 04, 06, 08, and **R-17 re-run on this build**.

## 8. Proposed commit boundaries (nothing staged or committed)

1. **B3.8 final** — snapshot `e2e-out/.tmp/commit-boundaries/01-b38-final.*` (135 tracked + 50 untracked; certified by `b38fin-full-1`: 364 passed, 1 approved skip).
2. **Security hotfix** — `api/_lib/appUrl.ts` (+ test), `api/_trpc/routers/b39Security.test.ts`, `auth.ts`, `email.ts`, `rateLimit.ts`, `trpc.ts` (`retryAfter`). Also these hunks of shared files:
   - `commercialReason.ts`: `RATE_LIMITED` and the `retryAfter` option;
   - `messages.ts`: `MESSAGE_SEND_LIMIT` and its two `enforceRateLimit` calls;
   - `invites.ts`: `INVITE_CREATE_LIMIT` and the trusted-origin links.
3. **B3.9** — everything else in the tree, including the docs:
   - `B3.9_AUDIT_AND_PLAN.md`;
   - this report;
   - the log, backlog, visual QA and route migration updates.

## 9. Next

Owner review and approval of the commits, the deploy of the security fix with the incident checklist, the physical-device checks, then B4 (content) / B5 per the carried IDs.
