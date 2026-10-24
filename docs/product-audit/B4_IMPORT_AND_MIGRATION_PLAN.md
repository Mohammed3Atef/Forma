# B4 — Import and migration plan (rehearsed locally; stops at the owner gate)

**Status (2026-10-23):** every non-destructive step is done and tested locally. **Nothing here has touched production, and no step below is authorised by the B4 brief.** Each production step is marked **OWNER**, with the approval it needs.

## 0. Principles

- **Additive and switchable.** The catalog is versioned files, served read-only. Turning it on writes nothing to the database, and turning it off (`FORMA_CATALOG=off`) is the rollback.
- **Plans are copies.** Every plan, template and plan version stores full exercise and food copies, so historical plans stay readable whatever happens to a library or the catalog. B4 relies on this and does not change it.
- **No silent remap.**
  - A workout exercise is never switched to a different movement.
  - A food is never switched to a nutritionally different one.
  - A mapping is applied only per reviewed item, and only with approval.
- **Nothing is deleted.**
  - "Archive" means hidden from pickers, never removed.
  - Even archiving needs separate, explicit owner approval.
- **Bounded, idempotent, resumable.** Every script is safe to re-run. Every write script is a dry run by default.

## 1. What exists today (verified locally, not in production)

| Item | Where | Evidence |
|---|---|---|
| Versioned datasets | `data/catalog/exercises.json` (134 items, `2026.10.22-2`), `data/catalog/foods.json` (190 items, `2026.10.22-4`) | `api/catalog/_lib/dataset.test.ts` (14 contract and quality tests) |
| Deterministic builds | `scripts/catalog/build-exercises.mjs`, `build-foods.mjs` | Re-running gives "no change" and the same version |
| Legacy → catalog mapping | `data/catalog-reports/legacy-mapping.{json,md}` (`scripts/catalog/legacy-mapping.mjs`) | Generated from the legacy starter files |
| Shadow comparison (search) | `data/catalog-reports/shadow-{exercises,foods}.{json,md}` | `api/catalog/_lib/searchQuality.test.ts` |
| Read-only production inventory | `scripts/catalog/inventory.mjs` | `scripts/catalog/inventory.test.ts`: classifies rows and references, and changes nothing (document and index fingerprint) |
| Read-only index preflight | `scripts/index-preflight.mjs`, `scripts/indexes/*` | `scripts/indexes/indexManifest.test.ts` (5) |
| Production switch | `catalogEnabled()` | `catalog.test.ts`; `ExercisePickerSheet.catalog.test.tsx` "catalog switched off" |

## 2. Mapping results (legacy starter data → catalog)

| | Legacy rows | Exact / mapped | Needs per-item review | Keep as the coach's own |
|---|---:|---:|---:|---:|
| Exercises (`wger-<n>` starter) | 909 | 180 | 105 (variant candidates) | 624 |
| Foods (seeded starter) | 84 | 72 | 14 (values differ, or the target is an estimate) | 12 |

- The foods whose values differ are listed with per-100 g deltas in `legacy-mapping.md`. The largest are canned tuna (−30 kcal), whey (−48 kcal), cooked pasta (+27 kcal) and olive oil (+34 kcal per 100 g).
- An exact exercise match means the catalog item names that wger id as its identity (`legacyIds`), and the movement is the same.
- A *variant candidate* shares the family but may differ in grip, angle or equipment. It needs a person to decide.

## 3. Steps

### Step A — Inventory production (read-only) · OWNER runs

```
MONGODB_URI='<production uri>' MONGODB_DB=forma node scripts/catalog/inventory.mjs > b4-inventory-prod.txt
```

**What it reads:** counts and aggregates only. It prints no names, emails or plan contents, and no credentials. It does not read `.env`.

**What it reports:**
- coach library rows by class: seeded wger copies, pre-wger GitHub-image rows, catalog copies, the coach's own;
- seeded vs own foods;
- how plans, templates and plan versions reference exercises: embedded copies, `libraryExerciseId` links, `catalogId` links, wger provenance.

**Decides:**
- how many coaches would see a mapping offer;
- how many rows carry legacy media of rejected provenance (the GitHub images — see the sources doc §2.3 / §6).

### Step B — Index preflight (read-only) · OWNER runs

```
MONGODB_URI='<production uri>' MONGODB_DB=forma node scripts/index-preflight.mjs > index-preflight-prod.txt
```

- The catalog needs **no** index (in-memory search, no database read).
- The preflight covers the rest of the release:
  - the four `clientPayments` runtime indexes (B4-R2);
  - three script-only B3.9 indexes;
  - the `uniq_active_client` duplicate check.
- **Building** is a separate approval: `node scripts/mongo-init-indexes.mjs --apply`. It is a dry run without `--apply`, and never builds a unique index over duplicates.

### Step C — Ship the code with the catalog off · OWNER (deploy approval)

**Prerequisites:**
1. The P0 deploy and incident checklist (`B4_IMPLEMENTATION_LOG.md` §1.3).
2. **A separate Preview database (B4-R1).** Otherwise a push of `development` runs new code against production data.

**Effect in production:** with `FORMA_CATALOG` unset, the behaviour is unchanged, apart from fixes that apply regardless:
- the Open Food Facts attribution and provenance (FD-03);
- localized servings;
- rate-limit fixes;
- catalog-copy fields simply absent.

**Rollback:** redeploy the previous build. Plans written meanwhile stay readable by the older app, because legacy fields are always written.

### Step D — Turn the catalog on · OWNER (config approval)

1. **Preview first.** On the separate Preview database (unset = on in Preview), QA the coach picker, library, nutrition editor and client views in EN / AR / AR-EG on real phones (`B4_CERTIFICATION_REPORT.md` §5).
2. **Production:** set `FORMA_CATALOG=on` for Production. No database write.

**Rollback:** `FORMA_CATALOG=off`. Copies already in plans and libraries remain valid; they are ordinary exercises and foods.

### Step E — Reviewed mapping of legacy library rows · OWNER (per-batch approval) · *not built*

This is designed, not implemented. It is the only step that would write to coach data, so it waits for the inventory and an explicit decision.

| Class | Proposed action | Write |
|---|---|---|
| Exact exercise matches (180 ids) | **Offer**, don't apply: a "Forma version available" badge on the coach's own row. Accepting replaces the *library* row's content with the catalog copy (same id, so plans keep their `libraryExerciseId` link) and adds `catalogId`. Plans are only updated through the existing library-sync flow, which shows the coach the affected templates. | Per coach, per item, coach-initiated |
| Variant candidates (105) | Shown as "similar Forma exercises" in the library. Never mapped automatically. | None |
| Keep as legacy (624) | Untouched | None |
| Foods, mapped without value change (58) | Same offer pattern. Accepting stores catalog provenance and USDA values. | Coach-initiated |
| Foods, mapped with value change or estimate (14) | Offer with the value difference shown | Coach-initiated |
| Foods, unmatched (12) | Untouched | None |

**Before any build of step E, the owner approves:**
- the UI;
- the write path, with a dry-run count per coach;
- a rollback field (`replacedFrom` snapshot on the library row).

### Step F — Retire the legacy starter seed · OWNER (product decision)

- "Load starter library" (`coachAssets.seedStarterLibrary`) still copies all 909 legacy wger exercises into a coach's library. That includes HEVC videos most browsers cannot play, and a blanket "CC BY-SA 3.0" credit.
- **Recommendation:** once the catalog is on, stop seeding the 909 exercises (the catalog replaces them) and keep the starter templates, foods and supplements.
- **Not changed in B4.** It is a product decision, and existing coaches' seeded rows stay untouched either way.

### Archive candidates (for a later, separate approval — nothing archived)

- **Legacy library rows with GitHub-hosted images** of the rejected provenance (yuhonas / wrkout scrapes). The count is unknown until step A runs.
  - Proposal: hide the *image* from new picks, or replace it with "no demonstration". Keep the row.
- **The 46 hotlinked wger videos in the starter file** (mostly HEVC). They fail to play on most browsers.
  - Proposal: mark them `unplayable`, so the UI shows "no demonstration" instead of a broken player.
- **No user data, plan, assignment or storage object** is a candidate.

## 4. Validation gates (each must hold before the matching step)

| Gate | Check | Status |
|---|---|---|
| Dataset contract | `dataset.test.ts` (schema, licences, media rules, raw/cooked, recipes, pinned values) | Passing locally |
| Search quality | `searchQuality.test.ts`: top-3 ≥ 90 % overall and ≥ 85 % Arabic, p95 < 15 ms | Passing (100 % / 100 %, p95 ≈ 4 ms) |
| API | `catalog.test.ts` (switch, refusals, caps, cards, foods, recipes) | Passing |
| UI and browser | `98-b4-catalog.spec.ts` (6 tests incl. the 9-viewport × language matrix), unit UI tests | Passing (see the certification report) |
| Inventory changes nothing | `inventory.test.ts` fingerprint | Passing |
| Real devices | `B4_CERTIFICATION_REPORT.md` §5 | **Not done** |
| Content sign-off | Coach and dietitian review; native Egyptian review | **Not done** (all items `draft`) |

## 5. Owner approvals needed, in order

1. Deploy the P0 fix and run the incident checklist (B39A-S01).
2. Create a separate Preview database (B4-R1).
3. Run steps A and B (read-only) and share the outputs.
4. Approve deploying B0–B4 with the catalog off (step C).
5. Approve `FORMA_CATALOG=on` after Preview QA and real-device checks (step D).
6. Decide step F (starter seed) and whether to build step E.
7. Media: approve the transcode and re-host plan (`B4_MEDIA_RIGHTS_AND_QA.md`).
