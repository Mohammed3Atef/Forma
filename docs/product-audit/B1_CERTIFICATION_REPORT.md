# B1 — Product Foundation & P1 Hardening: certification report

> 2026-10-08 · branch `development` (B0 = `f1151c0`; B1 changes are uncommitted, awaiting review) · nothing deployed, no production data touched, no credentials changed, no migration writes.
>
> **Detail lives in:**
> - `B1_P1_TRIAGE.md`: every P1, its target phase and its status;
> - `B1_IMPLEMENTATION_LOG.md`: root cause, files, fix and test per item;
> - `B1_FOUNDATION_SPEC.md`: the 24 contracts B2–B4 build on.

## P1 classification

| | Count |
|---|---:|
| **P1 TOTAL FROM PHASE A** | **92** |
| P1 CLASSIFIED B1 | 25 |
| P1 CLASSIFIED B2 | 13 |
| P1 CLASSIFIED B3 | 16 |
| P1 CLASSIFIED B4 | 15 |
| P1 CLASSIFIED B5 | 2 |
| P1 DEFERRED (owner decision, MD-04) | 1 |
| P1 ALREADY FIXED (by B0) | 20 |

## B1 P1 outcome (the 25 B1-class P1s)

| Outcome | Count | IDs |
|---|---:|---|
| **B1 P1 FIXED** | **18** | RTL-04, RTL-03, RTL-01, EX-06, FD-01, PWA-12, CL-34, PWA-11, PWA-13, AR-02, PF-01, PF-02, PWA-10, JR-04, NAV-K01, NAV-K03, AX-02, VS-11 |
| **B1 P1 MITIGATED** | **7** | MS-02 (provider half is the owner's, MD-01), AR-01 (push / persisted cache is B5), AX-01, AX-03, VS-04, VS-19, VS-20 (foundation done; screens adopt it in B2/B3) |
| **B1 P1 BLOCKED** | **0** | — |

**Why the 7 are mitigated, not fixed.** Each one's remaining work is the screen migration that B2/B3 own, plus MS-02's provider credentials, which the owner deferred (MD-01). Every mitigation is explicit in the triage and the log.

## Components

- **CANONICAL COMPONENTS CREATED (16):**
  - `Button`, `IconButton` (label required), `LinkButton`, `CountBadge`;
  - `StatusChip`, `SegmentedControl`, `Banner`, `BannerRegion`;
  - `ScreenState`, `OfflineState`, `StaleNotice`, `ConflictState`;
  - `MediaViewer`, `SyncStatus`, `NumericField`, `SecondLanguageField`.
- **CANONICAL COMPONENTS EVOLVED (12):**
  - `SubmitButton` (now `Button`) and `Pill` (now `StatusChip`);
  - `Tabs` (+ `SegmentedControl`) and the `Field` family (`TextInput` keeps email / phone / URL / password left-to-right);
  - `Icon` (auto-mirror + `cloud`) and `ErrorBoundary` (shared stale-chunk reload);
  - `useBack` (navigation contract) and `AppShell` / `ResponsiveShell` (banner region + inset contract);
  - `BrandBar` (single top inset), `SyncConflictNotice` (region slot over `ConflictState`), `NotificationBell` + `Notifications` (taxonomy + one target resolver), `MessageThread` (outbox).
- **DUPLICATE COMPONENTS REMOVED (8):**
  - `SyncStatusBadge`, `shared/SyncStatusIndicator`;
  - `NumberStepper`, the inline `NumericCell`;
  - `ImageViewer`, `VideoPopup`, `imageViewerStore`, `videoPopupStore`.

  Each was removed only once its canonical replacement existed, every reference had migrated and tests covered it.

## Areas

| Area | Status | Evidence |
|---|---|---|
| **OUTBOX** | PASS | Per-account durable queue for messages, check-ins and progress photos. FIFO per scope, dependencies, dedupe, idempotent server replay, backoff, account isolation. `outbox.test.tsx` (13), `outboxIdempotency.test.ts` (6), `CheckIn.test.tsx`, `photoUploadHonesty.test.tsx` |
| **SYNC CONTRACT** | PASS | Server allow-list + per-record rejection reasons + `sv`; client pull validation and 200-record batches; rejected records counted. "Synced" only when nothing is unacknowledged. `syncContract.test.ts` (7), `contract.test.tsx` (12), `syncTruth.test.tsx` (13) |
| **NOTIFICATIONS** | PASS | One taxonomy (client = server list), one target resolver (NAV-K03 fixed, even for old rows), one bell count (messages counted once), single `markRead`. `notificationTaxonomy.test.tsx` (8), `NotificationBell.test.tsx` |
| **NAVIGATION CONTRACT** | PASS | Semantic parents, validated `returnTo`, role-owned paths, workspace push/replace (NAV-K01). `navContract.test.tsx` (6); e2e `23-nav-unsaved` |
| **ARABIC FOUNDATION** | PASS | One formatting service, Latin digits, local day keys; `NumericField` reads Arabic-Indic digits; bilingual edits never overwrite a real translation; type roles with an Arabic path; icon auto-mirror; LTR for email / phone. `format.test.ts`, `localizedText.test.tsx`, `NumericField.test.tsx`, `arabicNumbers.test.tsx`; showcase AR at 5 widths |
| **MEDIA SEAM** | PASS (foundation) | `MediaRef` + pure resolver; uploads return `path`; one viewer with honest states. `MediaViewer.test.tsx` (5); showcase. The provider itself remains MD-01 (owner) |
| **CACHE POLICY** | PASS | Owner in every per-user key; cache cleared on any account change (incl. cross-tab); one query definition per key; open thread feeds its badge. `sessionStore.test.tsx` (+2), `messagesApi.test.ts` |
| **ACCESSIBILITY** | PASS (foundation) / screens B2–B3 | `IconButton` label required; AX-02 buttons named; 19 critical fields labelled (69 → 50); `hit-44` ≥ 44 px. The showcase spec asserts every visible control is named and hit areas are ≥ 44 px at every width |
| **PERFORMANCE / UPDATE** | PASS | Entry 158.6 → 141.8 KB gz (client runtime, outbox, Capacitor lazy); no `auth.me` after refresh; Mongo timeouts; cross-tab-safe updates |

## Checks

| Check | Result |
|---|---|
| **TYPECHECK** (`tsc -b --noEmit`) | PASS — 0 errors |
| **BUILD** (`npm run build`) | PASS — showcase absent from `dist`; new runtime chunks precached |
| **UNIT/API TESTS** (`vitest run`) | PASS — 67 files / 522 tests (B0 baseline 53 / 413; B0 tests unchanged except retargets noted in the log) |
| **BOUNDARIES** (`lint:boundaries`) | PASS |
| **BROWSER — foundation** (`e2e3/specs/70-b1-foundation.spec.ts`) | PASS — EN + AR × 390 / 430 / 768 / 1024 / 1440 |
| **BROWSER — prod-build PWA** (`e2e3/pwa/pwa-check.mjs`) | PASS — same as the B0 baseline: offline reload, offline banner, update deferred while visible, applied once hidden |
| **BROWSER — prod-build signed-in offline boot** (`e2e3/pwa/b1-client-offline-boot.mjs`) | PASS — lazy runtime chunks served by the SW, zero network fetches, client home + lazy screen offline |
| **B0 REGRESSION** (full `e2e3` suite, 219 tests) | **PASS** on the final code. **218 passed, 1 skipped** (Google sign-in, unchanged since B0), 0 failing. B0 specs `60-b0-coach-composer` and `61-b0-trust` are green. **Run 1:** 9 failures, triaged as 2 real B0-parity regressions in attachment errors (fixed) and 7 specs relying on old DOM shape or mixed numerals (locator / parse fixes only, no assertion weakened). **Run 2:** 11 failures, all inside a logged Wi-Fi outage (18:39–18:55); every one passed on re-run (78/78). See the log's regression section |

**REAL DEVICE: PENDING.** No physical phone was used. All browser evidence is desktop Chromium with emulated mobile viewports.

## Exit criteria

| # | Criterion | Met |
|---:|---|---|
| 1 | Every P1 triaged to a target phase | ✔ 92 / 92 |
| 2 | Every B1-class P1 fixed, mitigated or explicitly blocked | ✔ 18 / 7 / 0 |
| 3 | Shared token system documented | ✔ spec §1–7 |
| 4 | Canonical primitives exist | ✔ spec §8 |
| 5 | Responsive shell contract exists | ✔ spec §9 |
| 6 | One safe-area / keyboard layout contract | ✔ spec §10 |
| 7 | Durable outbox for approved operations | ✔ spec §12 |
| 8 | Sync status is truthful | ✔ spec §13 |
| 9 | Sync payloads validated | ✔ spec §14 |
| 10 | Arabic numeric/date foundation centralised | ✔ spec §15 |
| 11 | Arabic translations not silently destroyed by editing | ✔ EX-06 / FD-01 |
| 12 | Notification architecture has one source of truth | ✔ spec §16–17 |
| 13 | Semantic navigation contract | ✔ spec §18 |
| 14 | Media UI no longer assumes permanent public URLs everywhere | ✔ spec §19 (seam + `path`; per-screen adoption B4) |
| 15 | Cache/query ownership documented | ✔ spec §20–21 |
| 16 | Foundation showcase passes mobile/desktop EN/AR | ✔ |
| 17 | B0 regression tests remain green | ✔ |
| 18 | Full build/tests pass | ✔ |

## Known limits and deviations

- **Main-content bottom padding kept (B0 wins).** The certified Messages composer cancels exactly that value. B2 replaces it with the keyboard-aware layout (`--shell-keyboard` already exists).
- **Resume refresh not throttled.** e2e spec 43 requires a coach's edit to be visible on the client's next refocus. Push replacement is B5.
- **ActionMenu / FilterControl not built yet.** They are built with the screens that own the seven menu-like implementations (B2/B3), not as unused infrastructure.
- **Tokens and primitives are adopted per screen in B2/B3** (spec §24). The legacy palette and `Pill` keep rendering until then.
- **The prod-sim page error "Unexpected token '<'"** is also in the B0 baseline run. The likely source is Vercel's analytics script path, which the local static server answers with `index.html`.
