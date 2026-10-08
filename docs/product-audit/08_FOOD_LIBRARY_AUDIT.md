# 08 — Food library audit (data, search, portions, images)

**Bottom line**

- The 84 starter foods are good, fully bilingual reference data with plausible nutrition values. **Fix the pipeline around them, not the data itself.**
- **Arabic names are lost whenever a coach picks or edits a food in the nutrition editor**, so Arabic clients get English names for coach-authored plans (FD-01).
- **External food search is effectively unusable.** It exact-matches the whole name against Open Food Facts product names, returns identically named rows with conflicting calories, returns nothing in Arabic, and drops brand, serving and licence data (FD-02).
- **There is no portion model.** A quantity is free text: coaches multiply macros by hand, and clients can't log "2 eggs instead of 1" (FD-04).
- **There are no food images anywhere**, and no image field in the data model (FD-06).
- The image strategy in §11 resolves each image in this order: self-hosted (owned or CC0, served from Bunny), then a gated cached copy (CC BY-SA branded-product photos only, with attribution), then the hotlinked source (search preview only), then a bundled fallback (category illustration plus monogram), which ships first and covers 100% of foods.

Audit date 2026-10-04, HEAD `e7663ab`. Every file cited is identical in production RC2 `cf3a5d9`. External checks were read-only GET requests to the wger API.

---

## 1. Records

| Source | What it is | Count | Where |
|---|---|---|---|
| Starter foods | Static seed copied into each coach's `coachFoods` by "Load starter library" | **84** | `api/coach-assets/_lib/starterLibraryData.ts` (live). `src/lib/starterLibrary.ts` is an identical copy that nothing imports |
| Starter food groups | Approved-alternative sets | **10** | Same file |
| Starter supplements | Separate collection | **10** | Same file |
| Coach custom foods | Created in Library › Foods | per coach | `api/_trpc/routers/coachAssets.ts:245-252`, form at `src/pages/coach/CoachExerciseLibrary.tsx:268-415` |
| Plan items | Snapshots inside the client's meal plan | per plan | `src/pages/coach/CoachNutritionEditor.tsx:176-198` |
| Client custom foods / extras / replacements | Logged by the client | per day | `src/pages/Nutrition.tsx:133-160`, `src/stores/nutritionStore.ts` |
| External search | Live proxy to wger's ingredient endpoint (Open Food Facts products) | ~20 per query | `api/_trpc/routers/foodSearch.ts`, `src/components/workout/FoodSearchPicker.tsx` |

Starter foods by category: Protein 16 · Carbs 16 · Fruits 11 · Healthy fats 10 · Vegetables 9 · Breakfast 6 · Snacks 6 · Drinks 5 · Supplements 5.

## 2. Nutrition data quality (starter foods)

| Check | Result |
|---|---|
| Arabic names | **84/84 bilingual**, in natural Egyptian usage (عيش بلدي, طعمية, جبن قريش, فول مدمس) |
| Calories vs 4P + 4C + 9F | **6 foods deviate more than 15%**: broccoli −20.6%, spinach −22.3%, cucumber −17.1%, green beans −16.2% (expected: total carbs include fibre); black coffee +66.7% (2 vs 1.2 kcal) and electrolytes +25% (10 vs 8 kcal), both trivial in absolute terms. 17 foods deviate more than 10%. **No implausible entries**; values match common reference tables |
| Quantity formats | 64 plain grams or ml ("100 g") · 15 "unit (grams)" ("1 large (50 g)", "1 scoop (30 g)", "1 tbsp (14 g)", "1 medium (118 g)", "2 pieces (24 g)") · 5 with no grams ("1 cup", "1 tablet", "1 capsule", "1 serving") |
| Quantity language | English free text only ("1 large", "1 medium", "g"). Arabic UI shows "g 60" (BV-26, `evidence/client-fuel-390-ar.png`) |
| Zero-macro items | 4 "foods" with 0/0/0/0: creatine, multivitamin, vitamin D3, green tea |

## 3. Duplicates

| Duplicate | Evidence |
|---|---|
| Pasta (cooked) = Macaroni (plain, cooked) | Identical 131 kcal / 5 P / 25 C / 1.1 F per 100 g. The slug `macaroni-bechamel` contradicts the name |
| Supplements stored twice | Whey, Creatine, Omega-3, Multivitamin, Vitamin D3 and Electrolytes are foods in the "Supplements" category **and** supplements in their own collection, so coaches see them in two tabs |
| Starter vs custom vs external | No dedup or provenance link. A searched product, a starter food and a coach's custom food for the same item coexist as unrelated free-text snapshots. The search result's `sourceId` is dropped on pick (`FoodSearchPicker.tsx:45`) |
| Dead code copy | `src/lib/starterLibrary.ts` duplicates the server seed and is not imported anywhere |

## 4. Search

| Surface | Behaviour | Evidence |
|---|---|---|
| Coach library › Foods | Substring match on English name, category and tags; 25 per page | `CoachExerciseLibrary.tsx:277-282` |
| Nutrition editor "choose from your foods" | Substring match on English, or exact substring on Arabic; first 40 shown; **picks copy only the English name** | `CoachNutritionEditor.tsx:472-492` |
| External database ("Search food database") | Debounce 400 ms, minimum 2 characters, 20 results; shows name + "100 g · kcal · P C F" | `FoodSearchPicker.tsx:28-39,84-98` |

External search semantics, checked live against wger on 2026-10-04:

| Query | Result |
|---|---|
| `chicken` | 14 rows **all named "chicken"**, 106–188 kcal per 100 g, indistinguishable |
| `rice` | 4 rows named "rice", 102–356 kcal (raw and cooked indistinguishable) |
| `banana` | 3 rows, **one with 0 kcal** |
| `chick` (partial word) | 0 rows. The proxy uses `?name=`, an exact whole-name match (`foodSearch.ts:93`) |
| `أرز` (language=ar) | **0 rows** |

The rows are Open Food Facts **products** with barcodes and brands (e.g. "Dole"), licence ODbL (wger licence id 5) and `license_author` lists. The proxy keeps only name, kcal, P, C and F (`foodSearch.ts:63-82`), so brand, barcode, serving units, fibre, source URL and licence are all lost.

## 5. Images

None. No image field exists in the food schema (`api/coach-assets/_lib/schemas.ts:139-151`) or `FoodItem` (`src/types/index.ts`). There are 0 `<img>` in `Nutrition.tsx`, `CoachNutritionEditor.tsx`, `FoodSearchPicker.tsx` and the Foods tab. Plans render as text rows (`evidence/client-fuel-390-full.png`, `evidence/coach-client-nutrition-editor-390-full.png`). The strategy is in §11.

## 6. Food groups (approved alternatives)

- 10 starter groups of 3–6 foods (rice, bread, breakfast carbs, protein, snack, healthy fats, fruits, vegetables, pre-workout, post-workout). **41 of 84 starter foods are in no group** (salmon, eggs, Greek yogurt, potato, lentils …).
- Group names are English-only strings (the `FoodGroup.name` type is not localised).
- The coach picks members from a wall of chips that lists every food (`CoachExerciseLibrary.tsx:504-520`).
- A group is snapshotted onto a plan item as `allowedAlternatives` (`CoachNutritionEditor.tsx:190`). Bilingual names survive this path, unlike the main item (FD-01).

## 7. Custom coach foods

- Schema (`api/coach-assets/_lib/schemas.ts:139-153`): `name {en, ar}`, `quantity` (free text, max 100), P/C/F/kcal numbers, optional `category` and `tags`. There is no image, source, licence, base grams or unit model.
- The form has one name field and saves it as **`{en: name, ar: name}`** (`CoachExerciseLibrary.tsx:326`). Editing a starter food overwrites its Arabic name.
- Calories are typed by hand; nothing checks them against the macros.
- Numbers go through `parseDecimal` (Arabic digits and comma decimals are handled).

## 8. Portion scaling and macro calculation

| Path | What happens | Evidence |
|---|---|---|
| External search result | Per-100 g base scaled by grams: `factor = grams / 100`, kcal rounded, macros to 1 decimal. **Correct for gram servings** (150 g of 165 kcal / 31 g P per 100 g gives 248 kcal / 46.5 g P) | `src/services/platform/foodSearchApi.ts:28-32` |
| Library or starter food with a unit serving ("1 large (50 g)") | **No scaling.** The quantity is display text and nothing parses it. To prescribe 2 eggs the coach types the doubled macros by hand. The seeded plan shows "Whole Egg · 2 large (100 g) · 156 kcal", a hand-doubled copy of "1 large (50 g) · 78 kcal" | `evidence/coach-client-nutrition-editor-390-full.png`; FD-04 |
| Client eats a different amount | No portion control. The client can only remove or replace the item, or add a custom food | `Nutrition.tsx:133-160` |
| Client custom food | kcal **recomputed** as 4P + 4C + 9F, discarding the searched item's kcal. Inputs parsed with `Number()`, so Arabic digits and commas become 0. Name saved as `{en, ar: en}` | `Nutrition.tsx:135-147` |
| Daily consumed totals | Sum of every item in meals ticked as eaten, with per-item replacements, removals and extras, plus custom foods. A meal is all or nothing; no partial portions | `src/stores/nutritionStore.ts:38-65` |
| Coach "Planned vs target" | Sum of plan items vs targets; values are whatever was typed | `evidence/coach-client-nutrition-editor-390-full.png` |

## 9. External dependency

- Every database search proxies to wger.de (`foodSearch.ts:93`). There is no rate limiting on the proxy.
- The timeout is 5 s, and an upstream failure returns `[]`, which the UI shows as "No results" instead of an error (`foodSearch.ts:95-104`, `FoodSearchPicker.tsx:83`).
- Results are cached in memory per warm serverless instance only (10 minutes, 200 keys; `foodSearch.ts:58-60`).
- **Licence:** results come from Open Food Facts under ODbL. The code itself marks the licence as unverified (`foodSearch.ts:13-18`). The credit shown under food results is the exercise line, "Exercise data provided by wger.de (CC BY-SA)" (`FoodSearchPicker.tsx:97`).

## 10. Local persistence

| Data | Where | Action |
|---|---|---|
| Client's assigned meal plan | Mirrored into IndexedDB on sync (`src/services/platform/clientSync.ts:97-104`); readable offline | KEEP |
| Nutrition logs (ticks, replacements, extras, custom foods) | Local-first IndexedDB with background sync (`nutritionStore.ts`) | KEEP |
| Coach food library, groups, supplements | Server only (React Query cache) | KEEP (moves to the global catalog with EX-07) |
| External search | No client cache. Offline shows an error; upstream failure shows "No results" | REDESIGN (FD-09) |

### Element classification

| Element | What it is | Action | Why |
|---|---|---|---|
| Starter food data | 84 bilingual foods with credible values | KEEP (move into the shared catalog, FD-07) | The best-quality content in the food area |
| Library › Foods tab | List or table, single-name form, manual kcal | REDESIGN | Loses Arabic (FD-01); no serving model (FD-04); no images (FD-06) |
| Food groups tab | Groups built from a chip wall of all foods | REDESIGN | 41 starter foods ungrouped; chip wall doesn't scale |
| Nutrition editor food sheet | Library picker + database search + manual form | REDESIGN | Three ways to the same form, English-only copy (FD-01), hand-scaled macros (FD-04) |
| External database search | wger/Open Food Facts exact-name proxy | REBUILD | Results unusable for generic foods; no Arabic (FD-02) |
| Client "Add food" sheet | The same search plus a manual form | REDESIGN | `Number()` parsing (FD-05); recomputed kcal (FD-11) |
| Client Fuel meal rows | Text rows with a red ✕ each (BV-39) | REDESIGN | No visual identity; destructive control on every row |
| `src/lib/starterLibrary.ts` | Unused duplicate seed | REMOVE | Dead code that diverges silently |

## 11. Food image strategy (production-safe)

**Principle:** every food always has an image, starting with a free bundled fallback. Better images come only from sources Forma has the right to store, served from infrastructure Forma controls.

### 11.1 The four image states, in resolution order

| Resolution order | State | Applies to | Storage and URL | Licence gate | Performance |
|---|---|---|---|---|---|
| 1 | **Self-hosted** | (a) Curated catalog foods (the 84 starter foods first, then the curated generic set). (b) Coach-uploaded food photos | Bunny CDN under a catalog path, e.g. `catalog/foods/{slug}@{128\|256\|512}.webp`: square, EXIF stripped, immutable with long max-age and service-worker cache-first. Coach photos go to a new `food` media category under `Forma/{coachId}/foods/…`, downscaled on upload | Owned (commissioned illustrations or photos), CC0 or public domain, or the coach's own photo. **CC BY / BY-SA** only with author, licence and source stored and a visible credit; BY-SA derivatives stay BY-SA | Fastest; offline-capable |
| 2 | **Cached** | Branded packaged products (with barcode) that a coach saves from external search | Re-hosted on Bunny, e.g. `catalog/off/{barcode}@{size}.webp`, with the original URL, author list and licence stored; refreshed if the source changes | Open Food Facts product images are **CC BY-SA** (attribution plus share-alike). Packaging and logos remain third-party trademarks: use only to identify that product, never as the image for a generic food | Fast once cached |
| 3 | **Source (hotlink)** | Transient preview inside search results only | The provider URL as-is | Only where the provider permits hotlinking, with a credit beside the image. Never stored on a plan item | Third-party latency; exposes client IP; never offline |
| 4 | **Fallback** (ships first) | Every food without a better image, plus loading and offline states | Bundled: 9 category illustrations in the app's own style (Protein, Carbs, Fats, Vegetables, Fruits, Breakfast, Snacks, Drinks, Supplements) and a **monogram** (first character of the *localised* name, Arabic-aware, on a category-tinted tile) | Owned | Zero network; 100% coverage on day one |

### 11.2 Provider licensing summary

| Provider | Nutrition data | Images | Fit |
|---|---|---|---|
| **USDA FoodData Central** | Public domain | **None** | Best base for generic foods (replacement for FD-02); images come from the curated set or fallbacks |
| **Open Food Facts** (also what wger proxies) | ODbL database: attribution, and share-alike for derived databases | Per-image CC BY-SA, plus third-party packaging and trademark rights | Good for branded or barcode items; poor for generic foods ("chicken breast", "rice") |
| wger ingredient images (`/api/v2/ingredient-image/`, 231,456 images) | — | Mirrors of Open Food Facts photos (CC-BY-SA 3, per-image author), often small (e.g. 126×400) | Same as Open Food Facts; adds nothing |
| Commercial APIs (Nutritionix, Edamam, FatSecret, Spoonacular) | Contract terms | Usually display-only with "powered by" attribution; caching or re-hosting typically prohibited or time-limited (check each contract) | Not compatible with "serve from Forma's own CDN" |
| Wikimedia Commons | — | Per-file CC0, CC BY or CC BY-SA, with variable quality | Acceptable for the curated set **only** with stored per-file credit |
| Scraped web images (search engines, recipe or brand sites) | — | Copyrighted | **Never** |

### 11.3 Data and rendering rules

- Give each catalog or library food an image object holding the self-hosted URL, cached URL, source URL, licence, author, attribution URL, and the kind (catalog, coach, external, none).
- Plan items snapshot only the resolved display URL and the credit text, never a third-party URL.
- The fallback is computed on the device from category and localised name, so it costs nothing to store and works offline.
- Credits appear in a details view or an info sheet, not on every row ("less UI").

---

## 12. Findings

### FD-01 — Picking or editing a food in the nutrition editor erases its Arabic name
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach → client · `/coach/client/:id/nutrition` → client `/nutrition` in `ar` / `ar-eg`
- **Evidence:**
  - Opening an existing plan item loads only `name.en` (`src/pages/coach/CoachNutritionEditor.tsx:245`). Picking a library food copies only `f.name.en` (`:486`). Saving writes `{ en: name, ar: name }` (`:183`).
  - The library food form does the same (`CoachExerciseLibrary.tsx:326`), as does the client custom food (`Nutrition.tsx:142`).
  - The display path itself works: a seeded bilingual plan shows "شوفان (جاف)" (`evidence/client-fuel-390-ar.png`).
- **Steps / scenario:** Coach opens "Rolled Oats (dry) · 60 g" → changes it to 80 g → Save. The client reads Fuel in Arabic.
- **Expected vs actual:**
  - Expected: the Arabic client still sees "شوفان (جاف)".
  - Actual: they see "Rolled Oats (dry)". Every food added from the library arrives English-only.
- **Why it matters:** All 84 starter foods are bilingual, yet no coach-authored plan can deliver Arabic food names. The library copy is untouched, so P1 rather than P0.
- **Direction:** Carry both languages through pick and edit. Show and allow editing of the Arabic name only when the coach asks for it, keeping the form light.
- **Verified:** CODE-CONFIRMED (display path BROWSER-VERIFIED with seeded data)

### FD-02 — External food search returns ambiguous, unusable results
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach and client · "Search food database" in `/coach/client/:id/nutrition` and the client "Add food" sheet · 390
- **Evidence:**
  - The proxy uses `api/_trpc/routers/foodSearch.ts:93` (`/ingredient/?name=`, an exact whole-name match) and maps only name and macros (`:63-82`).
  - Live, 2026-10-04:
    - "chicken" → 14 rows all named "chicken" (106–188 kcal per 100 g).
    - "rice" → 4 rows (102–356 kcal).
    - "banana" → 3 rows including 0 kcal.
    - "chick" → 0 rows; Arabic "أرز" → 0 rows.
  - The results list shows name and macros only (`FoodSearchPicker.tsx:87-95`).
- **Expected vs actual:**
  - Expected: typing "chick" lists a few distinguishable generic and branded options with servings.
  - Actual: exact-word matching and identical names with conflicting values; nothing in Arabic.
- **Why it matters:** Wrong numbers flow straight into plans and logs, and Arabic users get nothing.
- **Direction:** A curated generic-food base (public-domain USDA data plus regional Egyptian foods, bilingual), prefix and alias search, and an optional barcode lookup for branded items that shows brand and serving and keeps provenance.
- **Verified:** CODE-CONFIRMED + live API responses

### FD-03 — Food data attribution is missing or wrong
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach and client · food search results
- **Evidence:**
  - The credit under food results is the exercise line, "Exercise data provided by wger.de (CC BY-SA)" (`FoodSearchPicker.tsx:97`).
  - Results are Open Food Facts products under ODbL with contributor lists, all dropped (`foodSearch.ts:63-82`). The licence question is flagged as open in code (`foodSearch.ts:13-18`).
- **Expected vs actual:**
  - Expected: the correct Open Food Facts / ODbL credit where that data is shown, and the source kept on saved foods.
  - Actual: the wrong credit, and no source kept.
- **Why it matters:** Licence compliance for a commercial product.
- **Direction:** Correct the attribution and record source and licence on every saved external food (pairs with FD-02 and FD-11).
- **Verified:** CODE-CONFIRMED

### FD-04 — No portion model: servings can't be scaled
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach and client · `/coach/client/:id/nutrition`, client `/nutrition` · 390
- **Evidence:**
  - Quantity is a free-text string (`api/coach-assets/_lib/schemas.ts:79-89`) and nothing parses "1 large (50 g)". Only external search results scale by grams (`foodSearchApi.ts:28-32`).
  - The seeded plan's "Whole Egg · 2 large (100 g) · 156 kcal" is a hand-doubled copy of the library's "1 large (50 g) · 78 kcal" (`evidence/coach-client-nutrition-editor-390-full.png`).
  - The client can only remove or replace an item, or add a custom food (`Nutrition.tsx:133-160`).
- **Steps / scenario:** Coach wants 3 eggs; client ate 2 eggs instead of the planned 1.
- **Expected vs actual:**
  - Expected: choose a count or grams and the macros recalculate.
  - Actual: the coach types every number by hand; the client can't adjust a portion.
- **Why it matters:** Manual arithmetic is the most error-prone step in plan building, and logs drift from reality.
- **Direction:** A structured serving model: a gram or ml base plus named units with gram weights. Portion = amount × unit, scaled from the base, and the same model for coach and client.
- **Verified:** CODE-CONFIRMED + screenshot

### FD-05 — Arabic digits or comma decimals silently become zero
- **Priority:** P2      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · grams field in "Search food database"; client custom-food form · `ar` / `ar-eg`
- **Evidence:**
  - `FoodSearchPicker.tsx:41` uses `Number(grams)`; `Nutrition.tsx:135-137` uses `Number(form.protein) || 0` and the same for carbs and fats.
  - The app already has `parseDecimal` (`src/lib/calc.ts:182-190`), which handles Arabic-Indic digits and "," and is used elsewhere (`CoachNutritionEditor.tsx:56`, library forms), but not here.
- **Expected vs actual:**
  - Expected: "١٥٠" g reads as 150 g; "12,5" reads as 12.5.
  - Actual: 0 g gives 0 kcal, saved without warning.
- **Why it matters:** Silent wrong data for exactly the users the product targets.
- **Direction:** One shared numeric parser for every nutrition input, and visible validation instead of silent zero.
- **Verified:** CODE-CONFIRMED (which digits each device keyboard produces is INFERRED)

### FD-06 — Foods have no images anywhere
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · `/nutrition`, nutrition editor, Library › Foods, food search · 390 and 1440
- **Evidence:**
  - No image field in the food schema (`schemas.ts:139-151`) or the `FoodItem` type.
  - No `<img>` in the four nutrition surfaces. `evidence/client-fuel-390-full.png` shows text-only rows.
- **Expected vs actual:**
  - Expected: each food recognisable at a glance.
  - Actual: text only.
- **Why it matters:** Clients scan meals quickly. Images (even fallbacks) speed recognition and make swaps easier to understand.
- **Direction:** Follow §11: bundled fallback first (S effort), then curated self-hosted images for the starter and catalog foods, then gated caching for branded items.
- **Verified:** CODE-CONFIRMED + screenshots

### FD-07 — Starter foods are copied into each coach account and never updated
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** coach · `/coach/library?tab=foods`
- **Evidence:** `coachAssets.ts:335-355` inserts 84 foods and 10 groups per coach, insert-only, never updated (BV-10).
- **Expected vs actual:**
  - Expected: shared reference foods that improve for everyone.
  - Actual: frozen per-coach copies.
- **Why it matters:** Image, translation and serving fixes (FD-01, FD-04, FD-06) can't reach existing coaches.
- **Direction:** Merge into the shared catalog alongside exercises (EX-07), with per-coach custom foods and overrides on top.
- **Verified:** BROWSER-VERIFIED (BV-10) + CODE-CONFIRMED

### FD-08 — Starter seed hygiene: duplicates, supplements stored as foods, ungrouped foods, dead copy
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** MERGE
- **Who / where:** coach · Library › Foods, Food groups, Supplements
- **Evidence:**
  - Pasta and Macaroni have identical macros (slug `macaroni-bechamel` vs the name "plain").
  - Six supplements are both foods and supplements.
  - Four foods have all-zero macros. 41 of 84 foods are in no group.
  - `src/lib/starterLibrary.ts` is unused.
- **Expected vs actual:**
  - Expected: each item once, in the right collection.
  - Actual: duplicates across tabs.
- **Why it matters:** Small, but it makes the library look careless.
- **Direction:** Merge Pasta and Macaroni; keep supplements only in Supplements; review group coverage; delete the dead copy.
- **Verified:** CODE-CONFIRMED

### FD-09 — Food search relies on a third-party proxy with no rate limit and hides failures
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach and client · "Search food database"
- **Evidence:**
  - Signed-in callers can hit it without a rate limit (`foodSearch.ts:85-109`). The timeout is 5 s.
  - An upstream failure returns `[]`, shown as "No results" (`FoodSearchPicker.tsx:83`).
  - The cache is in memory per warm instance only (`foodSearch.ts:58-60`).
- **Expected vs actual:**
  - Expected: resilient search with a clear "source unavailable" state.
  - Actual: silent empty results, and every keystroke burst reaches wger.de.
- **Why it matters:** It looks like "no such food" when the source is down, and can hammer a volunteer service.
- **Direction:** Serve search from Forma's own catalog (FD-02). If an external lookup remains, add a rate limit, a shared cache and an honest error state.
- **Verified:** CODE-CONFIRMED

### FD-10 — Quantities and units are English free text
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/nutrition` · `ar` / `ar-eg`
- **Evidence:**
  - BV-26: kcal, ml, g and P/C/F untranslated, with bidi order "g 60" (`evidence/client-fuel-390-ar.png`).
  - Starter quantities such as "1 large (50 g)" and "1 medium (118 g)" are English strings with no unit field (`starterLibraryData.ts`).
- **Expected vs actual:**
  - Expected: "٦٠ جم" or "60 g" rendered correctly for the locale.
  - Actual: mixed-direction English fragments.
- **Why it matters:** The most-read numbers in the app look broken to Arabic users.
- **Direction:** Store amount and unit key (from FD-04's model) and format per locale.
- **Verified:** BROWSER-VERIFIED (BV-26)

### FD-11 — Calories follow two different rules, and provenance is dropped
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach and client · food forms
- **Evidence:**
  - Coaches type calories by hand with no check against macros (`CoachExerciseLibrary.tsx:328`, `CoachNutritionEditor.tsx:185`). Client custom foods recompute 4P + 4C + 9F (`Nutrition.tsx:147`), discarding label or database values (e.g. broccoli is 34 kcal; the formula gives 42.8).
  - Picking a search result passes only name, quantity and macros; `sourceId` and provider are dropped (`FoodSearchPicker.tsx:45`).
- **Expected vs actual:**
  - Expected: one rule, with the original value and source kept.
  - Actual: two rules and no source.
- **Why it matters:** Small discrepancies between what the coach planned and what the client sees, and saved foods can't be traced or credited.
- **Direction:** Keep the source value as the truth and flag large mismatches; store the source on saved foods.
- **Verified:** CODE-CONFIRMED
