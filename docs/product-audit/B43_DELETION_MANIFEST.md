# B4.3 deletion manifest

Every removal below was checked for reachability before it was made. The checks were: references
across `src/`, `api/`, `scripts/` and `e2e3/` (an exported-symbol scan plus a targeted `grep` for
each name), the route and procedure tables, lazy `import()` targets, the PWA precache patterns
(`vite.config.ts`: js / css / html / svg / png / woff2 — no JSON) and `package.json` scripts. After
each batch, `tsc -b`, the full unit / API suite and the build were run.

Nothing here touched production data, storage or configuration. All files remain in git history.

## 1. Files deleted

| File | What it was | Why it is dead |
|---|---|---|
| `src/pages/coach/library/StarterPanel.tsx` | First-run "Add the starter library" panel | Its only users were the five segments' empty states, now `FirstItemPanel` |
| `src/pages/coach/library/starterSignal.ts` | Context that demoted the header button while the panel showed | Used only by `CoachLibrary` and `StarterPanel` |
| `src/pages/coach/library/useStarterLibrary.ts` | Hook that ran the seed and showed its result dialog | Used only by `CoachLibrary` (menu) and `StarterPanel` |
| `src/services/platform/starterLibraryApi.ts` | Client for `coachAssets.seedStarterLibrary` | Its only caller was the hook |
| `api/coach-assets/_lib/exerciseLibrary.ts` | Loaded `public/data/exercise-library.json` | Used only by the seed procedure |
| `api/coach-assets/_lib/starterLibraryData.ts` | `STARTER_FOODS` / `FOOD_GROUPS` / `SUPPLEMENTS` / `TEMPLATES` | Used by the seed, a search-quality baseline test and the legacy-mapping script (all removed) |
| `api/coach-assets/_lib/starterLibraryBuild.ts` | Starter template builder | Used only by the seed |
| `public/data/exercise-library.json` (909 exercises) | The legacy starter exercise set | Read by the seed, the catalog build scripts and a test. Not precached; no client fetch |
| `scripts/importWgerExercises.mjs` | Regenerated the legacy JSON | Its output is gone |
| `scripts/resetTestExerciseLibrary.mjs` | Re-seeded test coaches from the legacy JSON (production-pointing, `.env` E2E accounts) | Obsolete, and production-pointing tooling |
| `scripts/catalog/legacy-mapping.mjs`, `data/catalog-reports/legacy-mapping.{json,md}` | Old → new id mapping report (B4 migration step D) | The legacy rows it mapped are retired. Test data is disposable, so no remap is applied |
| `src/components/catalog/CatalogExerciseBrowser.tsx` | The Forma-only exercise browser (Library "Forma library" tab and picker) | Replaced by the unified `LibraryExerciseBrowser`. Its lazy wrapper is removed too |

## 2. Server code removed

| Removed | Where | Reachability before removal |
|---|---|---|
| `coachAssets.seedStarterLibrary` (+ `existingIds`, `runSeedStep`) | `api/_trpc/routers/coachAssets.ts` | Called only by `starterLibraryApi`. A test now pins its absence |
| `coachAssets.nutritionTemplates` router, `NutritionTemplateBody(Patch)Schema`, `CoachNutritionTemplateDoc`, `coachNutritionTemplatesCol()`, its entry in the index list, the orphan scan and the inventory count | `coachAssets.ts`, `coach-assets/_lib/{schemas,types,db,foodImageOrphans}.ts`, `scripts/indexes/manifest.mjs`, `scripts/catalog/inventory.mjs` | No screen ever called it. Its only client function (`listNutritionTemplates`) had no caller. The collection is class E in the reset plan |
| `catalog.exercises.search` | `api/_trpc/routers/catalog.ts` | Its callers (`CatalogExerciseBrowser`) are gone. Coach exercise search is `library.exercises.list`; its tests moved there |
| `catalog.exercises.byIds` | same | Its only client (`catalogExerciseCards`) had no caller |
| The `FORMA_CATALOG` switch: `catalogEnabled()`, `assertEnabled()`, `meta.enabled`, `CommercialReason 'CATALOG_DISABLED'` | `api/catalog/_lib/dataset.ts`, `catalog.ts`, `api/_lib/commercialReason.ts` | The catalog IS the shared library now. With the switch off there would be no library at all |
| `worksMuscle` / `DELTS` copy in `catalog.ts` | `catalog.ts` | Only the removed search used it. `library.ts` has the one copy |
| Catalog `legacyIds` (164 exercises, 190 foods) — schema fields, dataset values, builder output, `fedb-mapping` "legacy match" column | `api/catalog/_lib/schemas.ts`, `data/catalog/{exercises,foods}.json`, `scripts/catalog/{build-exercises,build-foods,fedb-mapping}.mjs` | Read only by tests and the legacy-mapping report. The rows they pointed at are retired |

## 3. Client code removed

| Removed | Where | Note |
|---|---|---|
| "Add the starter library" (Library menu `lib-more`, first-run panel), the header button's demotion | `CoachLibrary.tsx`, `parts.tsx` | The menu held only this item, so `ActionMenu` left the header |
| Exercises / Foods desktop tables with column sort, Select mode and bulk delete; the "Forma library / My library" switches; "Copy to my exercises" / "Open my copy" | `ExercisesSegment.tsx`, `FoodsSegment.tsx` | Replaced by one server-paged list each (All · Favourites · Mine), Customise / Reset to Forma's version |
| Picker "Forma library / My library" switch, "Recently used" (`forma.recentExercises.v1.*`) and the remembered source (`forma.pickerSource.v1.*`, localStorage) | `ExercisePickerSheet.tsx` | Favourites replace recents. Stale localStorage keys are inert |
| Nutrition editor's separate catalog picker and coach-food list | `CoachNutritionEditor.tsx` | One list (`LibraryFoodBrowser`) with the serving step. Open Food Facts kept |
| `listExercises`, `listFoods`, `bulkDeleteExercises`, `bulkDeleteFoods`, `listNutritionTemplates` | `coachAssetsApi.ts` | No callers after the rewrite (`listFoods` was only mocked in tests) |
| `catalogExerciseCards`, `searchCatalogExercises`, types `CatalogExerciseQuery` / `CatalogExerciseCard` | `catalogApi.ts` | No callers |
| `LazyCatalogExerciseBrowser`, `DemoBadge`, `ToggleFilter` | `LazyCatalog.tsx`, `ExerciseDemo.tsx`, `parts.tsx` | No callers |
| `demoRank`, `hasPlayableVideo` | `lib/libraryMedia.ts` | Tests only |
| `filterExercises`, `sortExercises`, `muscleOptions`, `equipmentOptions`, `filterFoods`, `sortFoods`, exercise and food sort keys | `lib/libraryModel.ts` | Search, filters and order are server-side now |
| `NutritionTemplate` type | `src/types/index.ts` | No users |
| ⌘K reading `['exerciseLibrary']` / `['foods']` caches, and the invalidations of those keys | `CommandHost.tsx`, segments, picker, `SyncIssuesNotice.tsx` | Those caches are no longer filled. ⌘K now indexes the library lists already loaded |
| Unused helpers: `listMessages`, `coachUnreadCount`, `ensureUploadConfig`, `cloudStatus`, `isStoragePersisted`, `isConnectivityError`, `isRtlLanguage`, `recordDeletions`, `clearAllTombstones`, `ackedMessage`, `transferClient` | `messagesApi`, `mediaApi`, `cloudStore`, `storage`, `errorKind`, `format`, `tombstones`, `outbox/handlers`, `coachClientsApi` | Zero references anywhere (exported-symbol scan + `grep`). `transferClient` was documented as unused (the wizard calls `transferClientWithMode`) |

## 4. Translation keys removed (48 per locale; EN, AR, AR-EG)

`starter.*` (7: load, loading, confirm, loadedTitle, loaded, loadedWithErrors, confirmCta) ·
`library.more` · `library.caption.exercises` · `library.caption.foods` ·
`library.col.{exercise,muscle,equipment,demo,defaults,food,calories}` · `library.filter.hasVideo` ·
`library.starter.{title,body,honesty,includes.programs,includes.exercises,includes.foods,includes.supplements}` ·
`catalog.{formaLibrary,myLibrary,source,searchExercises,withVideo,videoCount,saveToMine,savedToMine,saveFailed,openCopy}` ·
`catalog.foods.changeServing` ·
`coachEditor.{sectionCount,searchLibrary,searchFoods,hasMedia,libraryLoadFailed,recentlyUsed,allExercises,foodLibraryFailed}` ·
`coachFoods.{search,addFoodsFirst}` · `coachLib.{search,empty}`.

How they were found: the key was not referenced as a string literal anywhere in `src/`; no dynamic
prefix (`` `a.b.${x}` ``) covers it; and no parent object is passed whole. Plural forms went with
their base key, and emptied objects were pruned. Only these keys were removed. No existing wording
was changed. 30 new keys were added (`library.scope.*`, `library.badge.*`, `library.first.*`,
favourite / customise / reset strings).

## 5. Tests removed or replaced

- **Starter seed (API).** `coachAssets.test` lost 4 seed tests. They became 2: "no starter
  procedure; a new coach owns no copied rows" and "two coaches customise the same Forma exercise".
  In `certification.test`, the concurrent-seed test became a concurrent-customise test.
- **Nutrition-template round-trip** removed from `coverage.test`.
- **Search-quality** keeps its gates. The legacy old-vs-new comparison was dropped.
- **`dataset.test`.** The `legacyIds` uniqueness checks were dropped.
- **Moved.** `catalog.test` exercise-search cases now live in `library.test` (EN / AR / EG first
  hit, typo, light rows, page cap, ExerciseDB still, both shoulder vocabularies). `media.test` reads
  the card directly.
- **Removed with their helpers.** The `libraryModel` and `libraryMedia` unit tests for removed
  helpers.
- **Rewritten.** `CoachLibrary.test`, `ExercisePickerSheet.catalog.test` and the
  `CoachNutritionEditor` (catalog, hand-off) tests now cover the unified lists.
- **E2E specs updated:**
  - 22: shared library, no import;
  - 89: the picker filters by catalog muscle;
  - 92: unified Library, favourites, swap groups from the one list;
  - 96;
  - 98: customise / reset;
  - 99;
  - 100: customise, restore, upload.
- **New spec:** 101, the B4.3 acceptance.

## 6. Kept on purpose (verified reachable, or an owner decision)

| Kept | Why |
|---|---|
| `CatalogFoodPicker` / `ServingEditor` / `CatalogExercisePreview` | The client's custom-food entry (`pages/Nutrition.tsx`), the plan rows' serving editor, and the read-first exercise page |
| `catalog.foods.search`, `catalog.exercises.get / full`, `catalog.meta` | Client food search; full items on open or add; vocabulary |
| `coachAssets.exercises.list` / `foods.list` (generic CRUD) | Part of the per-resource API, used by API tests and fixtures. Harmless and cheap |
| `LibraryCollection`, `useBulkDelete`, `Toolbar`, `ListBody`, `usePaged` | Programs, Supplements, Swap groups and Business still use them |
| `scripts/catalog/fedb-mapping.mjs` + its curation sheet | The B4 free-exercise-db research report (legacy column removed) |
| `data/catalog-reports/shadow-*` | B4 certification evidence (generated before the legacy set was retired) |
| `scripts/seed-demo-*.mjs`, old `e2e/` suite + `playwright.config.ts` | Production-pointing tooling, flagged as OPS-01 / RM-14. **Removal is an owner decision** (`FORMA_CLEAN_LAUNCH_PLAN.md` §6) |
| Type-only exports without users (`CoachPlanTierDoc`, `ExerciseLogFields`, `CapacityPlanView`, `ReactionValue`, `ColorToken`, `CheckInTrendPoint`, taxonomy id types, `CatalogPortion`, `InstructionSet`, `CatalogExerciseFull`, `PlanEditor`) and test seams (`setCatalogForTests`, `__resetOutboxForTests`, `ensureCoachPlan`, `resetAppUrlWarningForTests`) | No runtime cost. They document contracts or exist for tests |
| `syncRecords` legacy branches, legacy freeze / notes / message shapes | Listed in `FORMA_CLEAN_LAUNCH_PLAN.md` §8. **Removal waits for the reset and the owner's OK** |
