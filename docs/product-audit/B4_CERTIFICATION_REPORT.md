# B4 — Certification report (exercise & food library + release hardening)

**Date:** 2026-10-23.
**Tree:** `development` at `82e00cc`, plus the uncommitted B4 working tree.
**Nothing was staged, committed, pushed or deployed. No production system was read or written.**

**Verdict:**
- The catalog is **certified locally, with the catalog off in production by default.**
- It is **not release-ready on its own.** The blockers in §7 — above all the unfixed production P0 and the absence of real-device checks — are unchanged by B4. B4 does not make them worse.

## 1. Scope certified

| Area | What was built | Docs |
|---|---|---|
| Rate limits (CP1) | Owner numbers unchanged. Quota is charged only after every refusal; the outbox honours `retryAfter`; broadcast reports a rate-limited recipient; counter keys are hashed; mailbox canonicalisation. | `B4_IMPLEMENTATION_LOG.md` §1.2 |
| P0 B39A-S01 (CP1) | Verified fixed locally and **still live in production**. Owner incident checklist written. | Log §1.3 |
| Indexes (CP1) | Declarative manifest, read-only preflight. The init script is now a dry run by default. | Log §1.4 |
| Sources (CP2) | Licence research. USDA approved; wger conditional; OFF bulk import, ExerciseDB and Free Exercise DB videos rejected. | `B4_SOURCE_RESEARCH_AND_LICENSES.md` |
| Exercise catalog (CP3) | 134 exercises, EN / MSA / Egyptian, Forma-written instructions, per-file licensed media; picker, library and client views | `B4_EXERCISE_LIBRARY_ARCHITECTURE.md`, `B4_MEDIA_RIGHTS_AND_QA.md` |
| Food catalog (CP4) | 190 USDA-based foods with evidence-based portions, one calculation, provenance on every row; editor and client flows | `B4_FOOD_LIBRARY_ARCHITECTURE.md` |
| Migration (CP5) | Inventory script, mapping, shadow comparison — stopped at the owner gate | `B4_IMPORT_AND_MIGRATION_PLAN.md` |
| Certification (CP6) | This report. Problems found and fixed during certification: log CP6, C1–C13. | — |

## 2. Test results (exact)

### 2.1 Unit, API and static checks (final tree)

| Check | Result |
|---|---|
| `npx vitest run` (all projects), final tree after C13 | **140 files, 1,283 / 1,283 passed.** The B3.9 baseline was 1,204; B4 adds 79. |
| Affected unit tests after the lazy-loading change (C10): `src/components/workout`, `src/pages/coach`, `src/pages/Nutrition`, `src/lib` | 45 files, 404 / 404 passed |
| `tsc -b` (in `npm run build`) | 0 errors |
| `node scripts/check-boundaries.mjs` | OK — no forbidden cross-role imports |
| `npm run build` (final tree) | OK |

**Mutation checks** (each new guard fails when its fix is removed):
- quota order: 4 counters charged at `82e00cc`;
- "catalog switched off" fails with the catalog on;
- B3-S11 fails without `source` in the schema;
- `FoodSearchPicker.test` fails at HEAD.

### 2.2 B4 browser spec — `e2e3/specs/98-b4-catalog.spec.ts` (6 tests)

**6 / 6 passed** in `b4-reg-2` and in `b4-full-1r` (final tree). In the full run, 5 passed and the coach test failed during a hotspot outage (§2.4).

| Test | Proves |
|---|---|
| Coach exercise | Egyptian search ("بنش") → preview (demonstration, instructions, credits) → add. The plan document holds a full copy with `catalogId`, `catalogRev`, `names`, `instructions` and `mediaCredits`. |
| Coach food | 2 × "1 cup" of cooked rice = 316 g = 411 kcal. The plan row keeps `per100g`, `portion`, `foodState`, `verification` and `source`. |
| Library copy | "Save to my library" creates `cat-<id>` once; the second time it opens the copy. |
| Offline | The catalog browser shows its offline state, never stale results. |
| Client, phone, Arabic | The copied exercise reads in Arabic with Forma's instructions and the media credits; the serving reads in Arabic; axe clean; no overflow. |
| Matrix | 390 / 768 / 1440 × EN / AR / AR-EG: picker, preview and serving editor. Horizontal overflow 0 px, axe (WCAG 2.1 A / AA) 0 violations, every control ≥ 44 px. |

Screenshots: `e2e-out/b4-cat-7/b4-visual/` and the full-run folder.

### 2.3 Regression runs during certification (honest record)

- **`b4-reg-1`** (specs 20, 22, 30, 89, 92, 96, 97, 98): **57 passed, 12 failed.** All 12 traced to the environment:
  - 9 in spec 20 and 1 in spec 89: source and i18n files were edited while the Vite dev server served the run. The symptoms were a blank page, "Failed to fetch dynamically imported module", and "Execution context was destroyed".
  - 2 in spec 97: a worker crash (0xC0000409) under memory pressure, then the machine suspended (`ERR_NETWORK_IO_SUSPENDED`).
- **`b4-reg-2`** (specs 20, 89, 97, 98, re-run with no edits in flight): **38 / 38 passed.**

### 2.4 Full e2e3 suite (`b4-full-1`, all 7 projects, 379 tests) and its re-run

**`b4-full-1`** (18:06–20:14): **345 passed, 28 failed, 1 skipped, 5 did not run.** Each failure was matched against the Windows WLAN log (`Microsoft-Windows-WLAN-AutoConfig/Operational`). This machine's internet is a phone hotspot.

- **26 failures fall inside two hotspot outages:** 18:24:16–18:38:36 (14 min) and 19:41:38–20:02:04 (20 min).
  - Chromium marks the app offline when the OS has no network, even though the test stack is on loopback.
  - The affected specs: 40-media (10), 42-errors (4), 98 (the wger video could not load), and the responsive composer and layout specs (11; "You're offline" disabled buttons, unsent messages).
- **The 5 "did not run"** were serial tests after those failures.
- **2 failures occurred with the network up**, and were fixed or explained:
  - **`10-auth` "login rate limit".** The test read the counter `_id` expecting the email in clear, which B4 hashes on purpose. Test updated (log C13).
  - **`30-client` "food search".** The public wger API did not answer within the proxy's 5 s, and the proxy turns that into an empty list (FD-09, "hides failures", pre-existing). The screenshot also exposed C12: the wrong empty-state text and the unlabelled, squeezed client search. Fixed.

**`b4-full-1r`** (20:19–20:56; **0 WLAN events in the window**) re-ran every spec with a failure or affected by C12 / C13, across all their projects:
- specs 10, 30, 40, 42, 89, 92 and 98;
- `33-composer-banner`, `45-layout` and `60-b0-coach-composer` (responsive) at 1280, 1024, 768, 430 and 390.

Result: **142 passed, 1 skipped (Google sign-in, approved), 0 failed.**

**Combined:** every test in the suite has passed on the B4 code: 345 in the full run, plus the 33 failed (28) or not-run (5) tests, all inside the re-run's specs, which passed there. That is 378 passed and 1 skipped, out of 379. The skip is the approved Google sign-in skip, the same as B3.9.

**Caveat:** the full run's passing tests ran before C12 / C13 (two strings, one label, one grid, one test). Every spec that exercises those surfaces was in the re-run.

## 3. Performance

**Server (dev machine; Node 22; esbuild bundle of the real modules):**

| Measure | Value |
|---|---|
| Datasets shipped with the function | `exercises.json` 469 KB + `foods.json` 260 KB. `@vercel/nft` trace of `dataset.ts`: exactly these two files (the reports were moved out — C5). |
| Cold start, read + parse | 17–26 ms |
| Cold start, build both search indexes | 88–141 ms (was 148–174 ms before C6). Once per warm instance. |
| Search latency, 214 mixed EN / AR / EG / typo queries × 5 | p50 about 2 ms, p95 about 4 ms (was about 14 ms). The shadow tests: exercises p95 1.4 ms, foods p95 2.6 ms. |
| Result identity after C6 | Identical ids, order, scores and totals for all 214 queries |
| Database reads per catalog request | **0.** The catalog router tests run with no database configured. |
| Response size | 20 exercise cards 7.1 KB (1.3 KB gzip); 50 cards 19.5 KB (3.2 KB gzip); full exercise 3.7 KB; 20 food cards 7.4 KB (1.7 KB gzip) |

**Client bundle** (`node scripts/bundle-report.mjs dist` on the final build, budgets from the B3.9 review, tolerance 0 %):

| Screen | B3.9 budget raw / gzip KB | B4 raw / gzip KB | Status |
|---|---|---|---|
| Entry | 501.99 / 161.88 | 503.94 / 162.57 | +0.4 % gzip (new catalog strings in the EN locale) |
| CoachApp chunk | 27.68 / 9.31 | 27.78 / 9.35 | +0.4 % |
| Coach shell | 153.86 / 53.87 | 153.60 / 53.87 | OK |
| Today / Clients / Workspace / Subscription / Business / Messages | — | +0.0–0.1 % | Within rounding: at most +0.01 KB gzip, +0.01 KB raw |
| Library | 32.35 / 13.91 | 32.43 / 13.95 | +0.2 % / +0.3 % |
| **Workout editor** | 91.40 / 35.33 | **99.49 / 38.50** | **+8.9 % / +9.0 %** |
| **Nutrition editor** | 78.40 / 30.05 | **87.32 / 33.63** | **+11.4 % / +11.9 %** |
| Client shell | 154.24 / 53.92 | 154.48 / 54.04 | +0.2 % / +0.2 % |

- Before C10 (lazy catalog UI), the editors were +17.7 % and +17.3 %.
- What remains is the editors' own new logic: the source switch and mixed selection, provenance and the serving editor, plus `catalogCopy` (3.3 KB) and `useCatalog` (2.6 KB).
- **Budgets were not changed.** Rebaselining is an owner decision (§8).

## 4. Offline and PWA (local production build + isolated stack; no deploy)

These checks ran on the build after C10 and before C12 / C13. Those changes touch two strings, one label, one grid row and one e2e test, none of which affects the service worker or the chunk graph. They were not re-run.

| Check | Result |
|---|---|
| `e2e3/pwa/b39-coach-offline-boot.mjs` (phone + desktop) | **PASS.** The signed-in coach relaunches offline. Today, Clients, Messages and Library render their offline notices. 57 JS chunks are served by the SW; none come from the network. |
| `e2e3/pwa/b1-client-offline-boot.mjs` | **PASS.** The signed-in client relaunches offline; the lazy runtime chunks come from the SW; a lazy screen opens offline. |
| `e2e3/pwa/pwa-check.mjs` | **PASS.** Identical to B3.9: installable, no manifest errors, offline reload from the precache, the banner shows and clears, and the update applies once the tab is hidden. |
| Page error "Unexpected token '<'" in the prod simulation | Pre-existing since B0 (`B1_CERTIFICATION_REPORT.md`: Vercel's analytics script path is answered by `index.html` locally). The same in the B3.0.1 and B3.4 runs. |

Catalog search needs the network by design and shows a dedicated offline state (e2e 98 "offline"). Plan copies are local, as before.

## 5. Visual, accessibility, RTL

- **e2e 98 matrix:** 0 px overflow, 0 axe violations, 44 px targets in EN, AR and AR-EG at 390 / 768 / 1440.
- **Visual review** of the screenshots by eye found and fixed:
  - the source chips were 34 px (C2);
  - Arabic readers saw English quantities (C3);
  - the no-demo tile was white, and variant names were cut at the same prefix (C4);
  - an empty food search said "No exercises match your search", and the client's Forma food search was unlabelled with its placeholder cut off (C12).
- **Line art** is shown in full (`object-contain`) on white, both in the coach preview and on the client exercise page.
- **Not done:** a design review by the owner of the new picker and serving-editor screens on real phones (§6).

## 6. Physical-device checklist (not run — Chromium emulation is not real-device certification)

Run on **iPhone (Safari + installed PWA)** and a **mid-range Android (Chrome + installed PWA)**. Record the device, OS and build for each row.

| # | Check |
|---|---|
| D-B4-1 | A catalog video (bench press) plays inline and loops in the coach preview and on the client exercise page. No HEVC file appears anywhere in the catalog. |
| D-B4-2 | Line-art images render crisp on white in dark mode; credits are readable and their links open. |
| D-B4-3 | The picker sheet in Arabic: the search field stays above the keyboard; filters and the source switch are usable with a thumb; the selected count is visible. |
| D-B4-4 | The serving editor: the numeric keypad appears; typing "1.5" and an Arabic-Indic "١٫٥" give the same grams. |
| D-B4-5 | Installed PWA, offline: open the plan editor and the Forma library. The lazy catalog chunk opens from the cache, and search shows the offline state (no blank sheet). |
| D-B4-6 | Client, Arabic: the copied exercise name, "How to do it" and servings read naturally (native speaker). |
| R-01 … R-17 | The existing real-device rows (B0 checklist), re-run on the B4 build |

## 7. Remaining blockers and risks

| # | Item | Severity | Owner action |
|---|---|---|---|
| 1 | **P0 B39A-S01 is live in production.** The reset and invite link is built from the request `Origin`. | Critical | Deploy the fix and run the incident checklist (log §1.3) |
| 2 | Nothing from B0–B4 is pushed. `development` on GitHub is `e7663ab`, and the SSH key is refused. | Release | Push and review (REL-01) |
| 3 | **B4-R1:** Preview and Production share `MONGODB_URI` | Release-blocking | A separate Preview database before pushing `development` |
| 4 | MD-01/02/03: uploads 401 in production; personal media public; deletes keep files | Release-blocking (owner-deferred) | `B4_MEDIA_RIGHTS_AND_QA.md` §5 |
| 5 | Real-device checks (§6, R-01…R-17) | Release-blocking | Run and sign |
| 6 | Catalog content and Arabic are `draft` (B4-CR1, CR2) | Before enabling the catalog | Appoint a coach, a dietitian and a native reviewer |
| 7 | Demonstrations: 3 videos, 92 items with no demo; media hotlinked from wger.de (B4-MV1, EX-18) | Product quality | Transcode / remux and re-host plan (media doc §4) |
| 8 | Bundle: workout and nutrition editors over budget (+8.9 % / +11.4 %) | Performance | Accept the rebaseline, or ask for a further split |
| 9 | Search quality measured on author-written queries (B4-S1) | Low | Review real query logs after launch |
| 10 | "Load starter library" still seeds the legacy 909 (B4-L1) | Product | Decide plan step F |

## 8. Owner decisions requested

1. **B4-R3:** keep the cross-coach per-address invite limit, or create the invite without the email once the limit is reached.
2. **Enabling the catalog:** when to set `FORMA_CATALOG=on`. Recommended after items 1, 3, 5 and 6 above.
3. **Migration:** run inventory step A and index preflight step B (both read-only); approve or decline steps E and F.
4. **Index builds:** approve `node scripts/mongo-init-indexes.mjs --apply` after the preflight.
5. **Open Food Facts lookup (B4-OFF):** keep it alongside the catalog, or retire it.
6. **Bundle budgets:** accept the editor rebaseline (§3).
7. **Media:** approve transcoding and re-hosting option A, and confirm the personality-rights position on the 3 Goulart videos.
8. **`coachLib.dataAttribution`** (unused; your Egyptian wording): remove it or keep it.

## 9. Proposed commit boundaries (for the owner; nothing was staged)

| # | Commit | Paths |
|---|---|---|
| 1 | `fix(security): rate-limit review — quota order, retryAfter, hashed keys, mailbox canonicalisation (B4 CP1)` | `api/_lib/rateLimit.ts`, `api/_trpc/routers/{messages,invites}.ts`, `api/_trpc/routers/b39Security.test.ts`, `src/lib/errorKind*.ts`, `src/data/outbox/outbox*.ts*`, `src/services/platform/messagesApi*.ts*` |
| 2 | `chore(db): index manifest + read-only preflight; init script dry-run by default` | `scripts/indexes/`, `scripts/index-preflight.mjs`, `scripts/mongo-init-indexes.mjs`, `vitest.config.ts` |
| 3 | `feat(catalog): Forma exercise & food catalog (off in production) + B4 docs` | Everything else, including `src/i18n/*.json`. The locale files hold the commit-1 broadcast string too; split them with `git add -p` if commits 1 and 3 must stay separate. |

---

# B4.1 — certification (2026-10-24)

**Scope:**
- Per-coach quotas and truthful invite email (Slice 1).
- Video rights, mapping and the licensed video set (Slice 2).
- Food pictures and coach photo uploads (Slice 3).
- Release hardening and the bundle pass (Slice 4).

**Nothing was staged, committed, pushed, deployed, uploaded or enabled.**

## B4.1-1. Static checks and unit tests (frozen tree)

| Check | Result |
|---|---|
| `tsc -b --noEmit` | Clean |
| `node scripts/check-boundaries.mjs` | OK: no forbidden cross-role imports |
| `npx vitest run` | **147 files, 1,338 / 1,338 passed** (B4 final: 140 files, 1,283) |

## B4.1-2. Browser checkpoints during the slices

| Run | Specs | Result |
|---|---|---|
| `b41-s3-1` | 98, 99 | 9 passed, 2 failed, both in test code: the B4 spec still expected a `<video>` before the tap (Slice 2 made demos lazy); the new spec passed a timestamp to a put-log index. Fixed in the specs |
| `b41-s3-2` | 98, 99 | **11 / 11 passed** |

**Product fix from these runs:** a 96 × 72 photo produced a 320 × 320 thumbnail (upscaled). The thumbnail is now never enlarged.

## B4.1-3. Full e2e3 suite

**Run `b41-full-1`** (2026-10-24, 21:04:54–22:26:12, 1 h 21 min):
- **Scope.** All 7 projects, **384 tests**: the B4 suite of 379 plus the 5 tests of spec 99. Frozen tree, `retries: 0`, no edits during the run.
- **Result.** **383 passed, 1 skipped, 0 failed, 0 did not run.** The skip is the approved Google sign-in skip (`10-auth`), as in B3.9 and B4.
- **Failures.** None, so none had to be classified as infrastructure or product. The hotspot outages that hit `b4-full-1` did not recur.
- **Catalog stand-in.** The isolated stack now sets `FORMA_CATALOG_MEDIA_URL` to a local stand-in serving only the manifest files. So every spec ran with Forma-hosted demos and food pictures on, including the B4 catalog spec.

| Project | Tests |
|---|---:|
| chromium-1440 (functional journeys) | 318 |
| chromium-1280 / chromium-1024 / tablet-768 (responsive) | 12 / 12 / 12 |
| mobile-430 / mobile-390 (responsive + touch) | 14 / 14 |
| webkit-iphone (touch) | 2 |

**Slowest files:** `97-b39-certification` (13.3 min) and `47-console-network` (6.7 min). **Log:** `e2e-out/b41-full-1.log`. **Artifacts:** `e2e-out/b41-full-1/`.

## B4.1-3b. Offline and PWA (local production build of the frozen tree + isolated stack; no deploy)

| Check | Result |
|---|---|
| `e2e3/pwa/pwa-check.mjs` (`e2e-out/b41-pwa`) | **PASS.** Line for line identical to B4: installable, no manifest errors, offline reload from the precache, banner shows and clears, the update applies once the tab is hidden |
| `e2e3/pwa/b39-coach-offline-boot.mjs` (phone + desktop, `e2e-out/b41-offline/coach`) | **PASS.** The coach relaunches offline; Today, Clients, Messages and Library render their offline notices. 58 JS chunks are served by the SW, none from the network, no lazy-chunk error |
| `e2e3/pwa/b1-client-offline-boot.mjs` (`e2e-out/b41-offline/client`) | **PASS.** The client relaunches offline; lazy chunks come from the SW |
| Page error "Unexpected token '<'" | The known local artefact since B0: Vercel's analytics path is answered by `index.html` |

## B4.1-4. Bundle pass (one pass; no budget raised)

Measured by `scripts/bundle-report.mjs` on `vite build` output. KB = 1000 B; gzip at level 6, per file. "Before" is the B4 + B4.1 tree before the pass (`e2e-out/b41-bundle-before.json`); "after" is the frozen tree (`b41-bundle-after.json`). First visit = the screen's chunks plus their static closure, minus the entry (and, for coach screens, CoachApp).

| Screen | Budget gz | Before raw / gz | After raw / gz | Δ gz | vs budget |
|---|---:|---:|---:|---:|---|
| Entry | 161.88 | 506.42 / 163.38 | 506.46 / 163.41 | +0.03 | +0.9 % |
| Coach shell | 53.87 | 154.20 / 54.05 | 154.20 / 54.17 | +0.12 | +0.6 % |
| Today | 23.62 | 60.26 / 23.62 | 60.29 / 23.66 | +0.04 | +0.2 % |
| Clients | 31.62 | 87.91 / 31.84 | 87.94 / 31.88 | +0.04 | +0.8 % |
| Workspace | 22.61 | 56.50 / 22.60 | 56.55 / 22.66 | +0.06 | +0.2 % |
| Package screen | 15.73 | 43.73 / 15.73 | 43.76 / 15.76 | +0.03 | +0.2 % |
| Business | 18.16 | 45.77 / 18.17 | 45.84 / 18.21 | +0.04 | +0.3 % |
| Library | 13.91 | 32.51 / 13.99 | 32.54 / 14.01 | +0.02 | +0.7 % |
| Messages | 35.59 | 98.11 / 35.60 | 98.17 / 35.64 | +0.04 | +0.1 % |
| **Workout editor** | 35.33 | 99.97 / 38.69 | **77.98 / 31.25** | **−7.44** | **within budget** (was +9.5 %) |
| **Nutrition editor** | 30.05 | 95.62 / 37.06 | **84.35 / 32.57** | **−4.49** | +8.4 % (was +23.3 %) |
| Client shell | 53.92 | 154.52 / 54.08 | 154.53 / 54.10 | +0.02 | +0.3 % |

**What changed:**
1. **`lib/catalogText`.** Display names, serving text and provenance keys moved out of `lib/catalogCopy`, so list and editor screens no longer load the copy machinery.
2. **`food/LazyFood`.** The photo editor (with on-device photo preparation) and the Open Food Facts search load when a food sheet opens.
3. **Exercise picker.** It loads on first open (`TrainingBuilder`, `lazy` + `Suspense`). The catalog copy code loads on the first catalog add or copy (dynamic `import()` inside the mutations).

**Other numbers:**
- **Small deltas on unrelated screens** (+0.02–0.12 KB). Rollup now emits `lib/image` (`downscaleImage`, 0.4 KB) as its own shared chunk instead of inlining it. That is a chunk-boundary change, not new code.
- **Still over budget** (`--strict` fails):
  - The nutrition editor (+8.4 %): catalog servings, provenance and food pictures.
  - The entry (+0.9 %): new EN strings since B3.9.
  - Ten screens at +0.1–0.8 %.
  - **No budget was raised.** Accepting a re-baseline within the blueprint's +20 % coach allowance, or funding a further split (the nutrition editor's food sheet as its own chunk), is the owner's decision (B41-P1).
- **Precache:** 217 entries, 2,572 KiB (213 entries, 2,569 KiB before the pass: the four new lazy chunks are precached like every other).

## B4.1-5. Blockers re-verified (read-only)

| Blocker | Verified 2026-10-24 | Status |
|---|---|---|
| Git / deploy (REL-01, REL-03) | GitHub over HTTPS: `main` = `ec38591`, `development` = `e7663ab`, both unchanged. SSH from this machine: `Permission denied (publickey)`. Local `development` = `82e00cc` + 97 uncommitted paths (B4 + B4.1). `vercel ls` / `inspect`: production = `dpl_H1LfEqNWKQCGdEhYbYE4VPbgupXo`, created 2026-10-04 22:35, aliases www.useforma.fit and `forma-git-main-…`, so still the Git deploy of `main` | Open: nothing pushed or deployed |
| P0 reset link (B39A-S01) | Fixed locally since B3.9 (`b39Security` / `appUrl` tests in the 1,338). Production runs the 2026-10-04 build, so **production is still exposed** until a deploy. `APP_BASE_URL` is not set in Vercel; the fix falls back to the fixed canonical host in production | Open in production |
| Preview / Prod DB (B4-R1) | `vercel env ls` (names only): one `MONGODB_URI` for Preview **and** Production. `E2E_*` test credentials are present for Production | Open |
| MD-01 / 02 / 03 | `BUNNY_*` unchanged (names only; one set for Preview and Production). Coach food uploads are built and tested against the local stand-in only | Open, owner-deferred |
| Index preflight | Not run: no environment was confirmed. The tool is ready (`scripts/index-preflight.mjs`, read-only) | Open, needs a confirmed target |
| PWA-06 | No change in B4.1 | Mitigated, owner to accept |
| REL-02 / REL-04 | No change | Open |
| Real devices (R-01…R-17) | Not run: Chromium emulation only | Open |
| `FORMA_CATALOG` | Not set in Vercel, so off in production. `FORMA_CATALOG_MEDIA_URL` not set either | As required |

**Function bundle.** B4.1 adds no runtime file read. The only `readFileSync` calls in `api/` are the two catalog datasets, the legacy starter file and the email templates, all as in B4. B4's `@vercel/nft` result (exactly the two dataset files) still holds.

## B4.1-6. Owner decisions requested

1. **Videos:**
   - Send, or drop, the rights-clearance request for the 593 videos (B41-V1, media doc §6.3).
   - Confirm the personality-rights position on the wger demonstration videos (B41-V2).
2. **Hosting:**
   - Create the public catalog zone and upload the two manifests.
   - Set `FORMA_CATALOG_MEDIA_URL` on Preview first (B41-F1).
3. **Bundle:** accept a re-baseline, or ask for a further split (B41-P1).
4. **Starter seed:** approve the retirement plan (implementation log B4.1 Slice 4) when the catalog is enabled.
5. **Carried from B4:** catalog enablement, migration inventory and preflight on a confirmed environment, index builds, Open Food Facts, MD-01/02/03, Preview database.

## B4.1-7. Proposed commit boundaries (nothing staged)

B4 and B4.1 are both uncommitted. Several files carry both (`src/i18n/*.json`, `src/types/index.ts`, `CoachNutritionEditor.tsx`, `invites.ts`), so splitting needs `git add -p`.

| # | Commit | Paths |
|---|---|---|
| 1 | `fix(security): per-coach quotas, atomic charging, truthful invite email (B4 CP1 + B4.1 slice 1)` | `api/_lib/{rateLimit,email}.ts`, `api/_trpc/routers/{messages,invites}.ts`, `api/coach-clients/_handlers/invites-types.ts`, `api/_trpc/routers/b39Security.test.ts`, `src/lib/errorKind*.ts`, `src/data/outbox/outbox*`, `src/services/platform/{messagesApi*,inviteApi}.ts`, `src/pages/coach/clients/AddClientSheet.tsx`, `e2e3/specs/10-auth.spec.ts`, invite / broadcast hunks of `src/i18n/*.json` and `src/types/index.ts` |
| 2 | `chore(db): index manifest + read-only preflight; init script dry-run by default` | `scripts/indexes/`, `scripts/index-preflight.mjs`, `scripts/mongo-init-indexes.mjs`, `vitest.config.ts` |
| 3 | `feat(catalog): Forma exercise & food catalog with reviewed demonstrations (off in production)` | `api/catalog/`, `api/_trpc/routers/catalog*.ts`, `api/_trpc/router.ts`, `api/coach-assets/_lib/{exerciseSync,schemas,types}.ts` (exercise hunks), `data/`, `scripts/catalog/`, `src/components/catalog/`, `src/components/video/VideoPlayer.tsx`, `src/components/workout/*`, `src/components/library/ExerciseInstructions.tsx`, `src/hooks/{useCatalog,useDebouncedValue}.ts`, `src/lib/{catalogCopy,catalogText,catalogNutrition}*`, `src/lib/{workoutPresets,foodFormat}.ts`, `src/services/platform/{catalogApi,foodSearchApi}.ts`, `src/pages/{ExerciseDetail,RoutineDetail,Workout,WorkoutSession}.tsx`, `src/components/ExerciseCard.tsx`, `src/components/coach/editor/TrainingBuilder.tsx`, `src/pages/coach/library/ExercisesSegment.tsx`, `vite.config.ts`, `e2e3/specs/98-b4-catalog.spec.ts`, catalog hunks of the locale files |
| 4 | `feat(food): food pictures: catalog images, coach uploads, sanitizer, ownership (B4.1 slice 3)` | `api/media/`, `api/_trpc/routers/{media,coachAssets,clientPlans}.ts` + tests, `api/coach-assets/_lib/foodImage*`, `api/coach-assets/_lib/{schemas,types}.ts` (image hunks), `src/components/food/`, `src/components/library/LibraryCollection.tsx`, `src/lib/{foodImageProcess,nutritionPlanModel,libraryHandoff}.ts`, `src/services/platform/mediaApi.ts`, `src/pages/{Nutrition}.tsx`, `src/pages/coach/{CoachNutritionEditor,CoachViewNutrition}.tsx`, `src/pages/coach/library/FoodsSegment.tsx`, `e2e3/{env/server.mjs,fixtures.ts,specs/99-b41-food-images.spec.ts}`, food-image hunks of the locale files |
| 5 | `docs: B4 + B4.1 implementation log, architecture, media rights, certification, backlog` | `docs/product-audit/B4_*.md`, `docs/product-audit/FORMA_MASTER_REMAINING_BACKLOG.md` |

`api/_lib/commercialReason.ts` (the B4 `CATALOG_DISABLED` reason code) belongs to commit 3.
