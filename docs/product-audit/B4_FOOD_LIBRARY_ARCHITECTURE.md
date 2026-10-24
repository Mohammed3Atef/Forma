# B4 — Food library architecture (the Forma food catalog)

**Status (2026-10-23):** built and tested locally; **not committed, not deployed, off in production** (`FORMA_CATALOG`, same switch as exercises).

**Related docs:** sources, licences and the Egyptian-food decision are in `B4_SOURCE_RESEARCH_AND_LICENSES.md` §3; the migration plan is `B4_IMPORT_AND_MIGRATION_PLAN.md`.

## 1. What changed

Before B4, food came from two places:
- an 84-row seeded starter list, with hand-typed macros per "1 loaf (90 g)" or "1 scoop";
- a lookup that searched wger's ingredient feed — an ODbL extract of Open Food Facts. It was credited to the wrong source and kept nothing about where its numbers came from.

A coach typed or edited macros freely. A changed amount meant re-typing the numbers.

B4 adds a **curated food catalog** of 190 foods. Values are per 100 g of the food **in the state named** — raw, cooked, dry, prepared or as sold — and come from a **named USDA FoodData Central record**, or from a labelled Forma estimate. Household portions have **food-specific gram weights**. A serving is computed, never typed, and the plan row keeps **where its numbers came from**.

## 2. Data model

The dataset is `data/catalog/foods.json` (version `2026.10.22-4`); the contract is `CatalogFoodSchema` in `api/catalog/_lib/schemas.ts`.

| Field | Meaning |
|---|---|
| `id` / `rev` / `status` | `ff_<slug>`. `rev` bumps on a content change. `published` \| `needs-review` (only `published` is served). |
| `name`, `aliases.en/.ar/.eg` | Bilingual names. Egyptian words (عيش، طعمية، فول، رز …) are aliases. |
| `category` / `state` / `preparation` | 17 categories. State is `raw` / `cooked` / `dry` / `prepared` / `as-sold` (today: 43 / 53 / 7 / 16 / 71). |
| `per100g` | kcal, protein, carbs, fat (+ fiber). Schema bounds: macros ≤ 100 g per 100 g. |
| `energySource` | Which USDA energy value was used: 1008, else 2048, else 2047, else `recipe-sum`. |
| `portions[]` (≤ 8) | `{id, label EN/AR, grams, source, ref}`. The `source` is a USDA SR weight, an FNDDS portion, a Foundation portion, or a recipe yield. `ref` names the record and sequence. 23 foods have no household portion and are weighed in grams only. |
| `verification` | `source-values` (177): the record **is** this food. `proxy-estimate` (8): the nearest record, always with a visible `matchNote`. `recipe-estimate` (5): computed from catalog ingredients. |
| `sources[]` | Provider, FDC id, URL, role (`nutrients` / `portions` / `recipe-ingredient`), licence, and the USDA description kept verbatim for audit. |
| `recipe` | Recipe estimates only: ingredients (catalog food id + grams as served) and a bilingual note. |
| `content` | `FORMA-PROPRIETARY`; `review: draft`; `translation: draft`. All 190 await a dietitian's and a native speaker's sign-off. |
| `legacyIds[]` | Starter rows this food reviewably replaces (72 links). |

**Coverage by category:**

| Category | Foods |
|---|---:|
| Vegetables | 31 |
| Fruits | 25 |
| Grains | 16 |
| Legumes | 15 |
| Nuts and seeds | 13 |
| Cheese | 11 |
| Seafood | 10 |
| Meat | 9 |
| Dairy | 8 |
| Sweets | 8 |
| Bread | 7 |
| Dishes | 7 |
| Drinks | 7 |
| Eggs | 6 |
| Poultry | 6 |
| Condiments | 6 |
| Fats and oils | 5 |

**Sources:** SR Legacy 181, FNDDS 3, Foundation 1, recipe 5.

## 3. Rules the data obeys (each enforced by a test)

| Rule | Where enforced |
|---|---|
| Raw and cooked are never mixed. The name states the state the values describe. A USDA "raw" record is never stored as cooked, and vice versa. | `dataset.test.ts` "raw and cooked are never mixed" |
| No portion without food-specific evidence. A "cup", "slice" or "piece" exists only where the USDA record lists it. When USDA lists two "slice" rows, both are kept and named ("slice, large" / "slice, thin"). | Schema (`source`, `ref` required); build refuses otherwise |
| Values are from the named record. Some are pinned (an extraction bug would move them). | "a few values are pinned to their USDA records" |
| Energy agrees with the macros (Atwater) within USDA's own spread | "values are plausible" |
| A recipe's values are exactly its ingredients recomputed. No typed numbers, no assumed cooking yields. Added fat counts in full. | "a recipe's values are exactly its catalog ingredients recomputed" |
| Estimates are labelled. A proxy says what it was matched to. Nothing typed by hand is called "source values". | "estimates are labelled" |
| No branded product posing as a generic ingredient | Curation: Branded Foods are excluded from the source pull |
| No composite dish with invented macros | Only the five recipe estimates. Halawa, fiteer, labneh, sugarcane juice, crisp onion and "lean beef" are left out (gap list in the sources doc). |

## 4. The calculation (one method, deterministic)

The server copy is `api/catalog/_lib/nutrition.ts`; the client mirror is `src/lib/catalogNutrition.ts`. The two are kept identical by `catalogNutritionParity.test.ts`.

1. **Serving → grams.** grams = amount × the portion's grams, or the amount itself for plain grams, rounded to 0.1 g.
2. **Grams → nutrients.** Each nutrient = per100g × grams / 100, **rounded once**: kcal to a whole number, macros to 0.1 g.
3. **Rounding.** `roundTo` rounds half away from zero, immune to binary noise (1.005 → 1.01).
4. **Totals** add the rounded rows, so a total always equals the sum of the rows a reader sees.

Example from the e2e spec: 2 × "1 cup" of cooked white rice (158 g a cup) = 316 g → **411 kcal**.

## 5. What a plan row stores (`FoodProvenance`, on `FoodItem` and coach `FoodFields`)

| Field | Purpose |
|---|---|
| `catalogId`, `catalogRev` | Which catalog food and revision |
| `per100g`, `foodState` | The basis for recomputing a new amount |
| `portion {id, amount, grams, label}` | The serving the numbers were computed from |
| `verification`, `sourceNote` | Shown as "Estimate" with the note |
| `source {provider, license, attribution, url?}` | `forma-catalog` (USDA, CC0) or `open-food-facts` (ODbL) |

The legacy fields (`name`, `quantity` in English, `calories`, `protein`, `carbs`, `fats`) are still written, so older app builds and every existing view keep working. `quantityText()` shows a catalog serving in the reader's language with its grams, e.g. "1 كوب (158 جم)". Rows without a portion show their stored text, exactly as before.

**Historical plans stay readable.** Nothing is rewritten. A row without provenance renders as it always did.

## 6. Coach and client experience

**Coach nutrition editor** (`src/pages/coach/CoachNutritionEditor.tsx`)
- "Forma foods" search (EN / AR / EG, category filter).
- Rows show the state, kcal per 100 g, and an "Estimate" pill where applicable.
- Choosing a food opens the serving chooser: portion with grams, amount, live macros, and "Use this food". A proxy shows its match note; a recipe estimate shows what it assumes (plate size, oil). The source line reads "Values: USDA FoodData Central", or "Values: Forma recipe estimate from USDA FoodData Central ingredients" for recipes. Fixed during B4 certification: recipe notes were in the dataset but not shown.
- A row from the catalog shows a **serving editor** instead of a free quantity field. Changing the portion or amount recomputes from `per100g`.
- **Typing a macro by hand** removes the provenance (the numbers are no longer USDA's), and the editor says so: "Values entered by hand".
- **Open Food Facts lookup** (existing feature): now carries the ODbL notice, with links, and stores `source: open-food-facts / ODbL-1.0` with the wger ingredient URL on every row it creates.

**Client custom food** (`src/pages/Nutrition.tsx`)
- The same catalog search and serving chooser.
- A typed value clears the provenance.
- A source line is shown.
- Planned items show the serving in the client's language.

**Coach client view** (`CoachViewNutrition.tsx`): servings in the coach's language.

**Offline:** catalog search needs the network and shows a dedicated offline state. Plans and logged foods are local copies, unchanged.

## 7. Search and API

Search is the same engine as exercises (`B4_EXERCISE_LIBRARY_ARCHITECTURE.md` §4). Field weights: name 1, aliases 0.9, category / state / preparation 0.35. Records with `source-values` get a small boost, so verified records rank first among equals.

| Procedure | Returns |
|---|---|
| `catalog.foods.search` `{q, category?, limit ≤ 50, offset}` | Cards with `per100g`, portions, `matchNote` and `recipeNote` — enough to add a serving without another request. 20 cards = 7.4 KB (1.7 KB gzip). |
| `catalog.foods.get` | The full item, with sources and recipe |

Any active account may search; clients log custom foods.

**Quality** (95 shadow queries, top-3 relevant):

| | All | English | Arabic | Egyptian | Typos |
|---|---:|---:|---:|---:|---:|
| New search | 100 % | 100 % | 100 % | 100 % | 100 % |
| Old starter list | 63.2 % | 72.7 % | 80 % | 48 % | 0 % |

Same caveat as for exercises: the query set was written by the authors.

## 8. Legacy foods

The 84 starter rows map as follows (`data/catalog-reports/legacy-mapping.md`):
- **72** map to a catalog food. 14 of them need per-item review because the values differ (e.g. canned tuna −30 kcal / 100 g; whey −48) or the target is an estimate.
- **12** have no match and stay as the coach's own foods: supplements, branded items, labneh, lean beef (unspecified cut), ground turkey, mixed salad, protein pancakes, corn flakes.

Nothing is remapped automatically. A food is never silently swapped for a nutritionally different one.

## 9. Known limits

- **Egyptian dishes:**
  - 8 proxies and 5 recipe estimates;
  - six common items deliberately missing.
  - Lab-quality data needs an NNI licence or commissioned analysis (owner).
- **Review:** all values are USDA's, but naming, state choice, portions and recipes are `draft` until a registered dietitian signs off. Arabic needs native review.
- **Packaged foods** are only reachable through the per-food Open Food Facts lookup (ODbL; no bulk import, by decision).
- **Micronutrients** are not carried. The data model would allow them later.

## 10. B4.1: food pictures (2026-10-24)

**Catalog** (`FoodImageSchema`, at most 4 per food):
- `variants.thumb` / `variants.card` (`cdnPath`, width, height, bytes) and bilingual `alt`.
- Author, licence, licence link and source page.
- `role`, `rev`, `review` (`approved` / `pending` / `needs-replacement`) and `publication`. A published picture must be rights-verified and not pending.
- **Storage.** Files live in the public catalog zone; Mongo and the dataset hold only paths.
- **Serving** (`servedFoodImage`). The primary picture's thumbnail and card URLs, with credit, only when `FORMA_CATALOG_MEDIA_URL` is set.
- **Coverage.** 127 of 190 foods have a picture.

**What a row stores** (`FoodImageRef` on library foods, group foods, template and plan items):
- **A copy.** `source` (`upload` / `forma-catalog`), `url`, `thumbUrl`, size, `alt`, `catalogFoodId`, credit, `rev` and `uploadedAt`.
- **Catalog picks.** `foodPickFromCatalog` copies the served picture.
- **Edits.** `applyFoodEdit` treats `image` like provenance: `undefined` keeps it, `null` removes it, a value replaces it.
- **Alternatives and library hand-offs** keep it.

**Upload path:**
1. **Device** (`lib/foodImageProcess`): photo at most 1600 px, thumbnail at most 320 px, re-encoded to WebP (JPEG on Safari).
2. **Server** (`POST /api/media/upload?category=food`): coaches only; JPEG / PNG / WebP at most 4 MB; type sniffed from the bytes; metadata stripped; animation and odd dimensions refused.
3. **Storage:** `Forma/<coachId>/foods/`.

**Who may save which picture** (`assertFoodImagesAllowed`, every save):
- The saving coach's own uploads.
- An approved picture of that same catalog food.
- Pictures already in the stored document.

**Client logs never carry a picture.**

**UI pieces:**
- `FoodThumb` (xs / sm / md, placeholder on missing or broken).
- `FoodCardImage` (4:3, or a compact fixed band in sheets, with credit).
- `FoodImageEditor` (add / replace / remove / use the Forma photo, progress, cancel, retry). It loads lazily with the food sheet (`food/LazyFood`).
