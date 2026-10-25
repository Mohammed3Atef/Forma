# B4.3 — One shared library (architecture)

> **Owner direction (B4.3):** one canonical library for every coach — Forma's 1,343 exercises and
> 190 foods with their media — plus each coach's own content. Exercises and Foods each have
> **All · Favourites · Mine**. Items go into plans directly, with no "save to my library" first.
> Favourites are light references. Customised items are stored copies with "reset to Forma's
> version". No bulk duplication into coach records. No starter library.

## 1. Why the Foods tab showed 93 foods with no pictures (root cause)

- Library › Foods listed only the coach's own `coachFoods`. The 84 starter foods the coach had
  seeded with "Add the starter library", plus 9 of their own, made 93. Those starter foods have no
  picture fields.
- The 190 catalog foods were not in the Library at all. They were reachable only in the nutrition
  editor's "Forma foods" picker.
- That picker only showed where the B4 switch `FORMA_CATALOG` was on. It is not set in Vercel, and
  the switch defaulted to OFF in production. So production showed neither the catalog foods nor
  their pictures. Re-verified 2026-10-25: production runs `db19e96` (B0–B4.1); no `FORMA_CATALOG`
  variable is set.
- B4.2's remote pictures (Wikimedia renditions, no upload needed) existed only in the uncommitted
  tree. All 254 remote picture URLs answer 200 with an image (`e2e-out/b43-remote-image-check.json`).

**B4.3 removes the switch.** The catalog is the library, so deploying B4.3 turns it on in
production (approval item).

## 2. Data

| What | Where | Per coach? |
|---|---|---|
| Forma exercises (164 curated + 1,179 ExerciseDB) and foods (190) | `data/catalog/*.json`, versioned, read in memory (`api/catalog/_lib/dataset.ts`) | No. Shared, never copied |
| The coach's own exercises / foods (custom) | `coachExercises` / `coachFoods` (`{coachId, id}` unique) | Yes |
| The coach's version of a Forma item ("customised") | the same collections, `id: cat-<catalogId>`, `catalogId` set | Yes, one row per customised item |
| Favourites | `coachFavorites` `{coachId, id: '<kind>:<refId>', kind, refId, createdAt}` | Yes, references only |
| Plan / template items | full snapshot copies, as before. A Forma item keeps `catalogId` + `catalogRev`; the coach's own item is library-linked (`libraryExerciseId`) | — |

- A linked ExerciseDB id (one that resolves to a curated item) is stored as the curated id in
  favourites and overrides, so one movement never shows twice.
- Index: `coachFavorites.uniq_coachId_id`. It is in `scripts/indexes/manifest.mjs` and ensured at
  runtime like every coach-asset collection.

## 3. API (`api/_trpc/routers/library.ts`, coach role)

| Procedure | Input | Output |
|---|---|---|
| `library.exercises.list` | `q`, `scope` (all / favorites / mine), `muscle`, `equipment` (catalog ids), `demo`, `lang`, `limit` ≤ 50 (30), `offset` | `{ total, items: Row[] }` |
| `library.foods.list` | `q`, `scope`, `category`, `lang`, `limit`, `offset` | `{ total, items: Row[] }` |
| `library.favorites.set` | `kind`, `id` (catalog or own), `on` | `{ favorite }` |

How the lists work:

- **Rows.** `{kind:'shared', id, favorite, card}` (the light catalog card: name, muscles, media
  kind, light still / picture) or `{kind:'own', id, favorite, customized, catalogId, …}`.
- **Search.** Own items go through an on-the-fly index; shared items through the catalog index (EN,
  AR, Egyptian aliases, typos). They are merged and ranked by score, then by name in the reader's
  language. Own items get a small boost (0.4), so the coach's own ranks first among equals.
- **Customised items replace Forma's.** They are listed once, as the coach's version.
- **Own exercises map to catalog vocabulary.** Their free-text muscle and equipment are mapped to
  catalog ids (EN / AR labels), so one filter works on both.
- **"Has a demonstration"** follows the app's rule: a playable link or a picture. A Drive or Vimeo
  link is not one.
- **Food pictures on own rows.** An own food shows its own picture. A customised food without one
  shows Forma's.
- **Cost.** One request reads the coach's own rows (indexed by `coachId`) and their favourites, then
  searches in memory. A page of 30 rows is small; e2e records the byte size. The catalog is never
  sent whole.

The catalog API keeps what the app uses:

- `catalog.meta`: vocabulary, versions.
- `catalog.exercises.get` / `full`: open / add.
- `catalog.foods.search` / `get`: clients' custom food entry; open / add.

`catalog.exercises.search` and `byIds` were removed; the library list replaced them.

## 4. Client

- **Shared lists.** `components/library/LibraryExerciseBrowser` and `LibraryFoodBrowser`. Each has
  the All / Favourites / Mine switch (44 px), search, filters (muscle / equipment / demonstration;
  category), a count, server paging with "Show more", and a favourite star on every row. They have
  honest offline, error and empty states. A row says where it comes from (Mine / Customised badge),
  shows a light still or picture (never a GIF in a list) and shows its media kind.
- **Library › Exercises / Foods** (`ExercisesSegment`, `FoodsSegment`). The filters live in the URL.
  - **A Forma item** opens read-first: exercise demonstration, steps and credits; food picture with
    credit, per-100 g values, servings and source. It offers **Use in a client plan** and
    **Customise**.
  - **The coach's own item** offers Use / Edit / Delete. A customised item offers **Reset to
    Forma's version** (deletes the override; plans keep their copies).
  - ⌘K indexes what the lists have loaded and opens Forma items by catalog id.
- **Plan editors and templates.**
  - **Exercise picker** (`ExercisePickerSheet`): the same exercise list. You can multi-select across
    Forma and own items, preview Forma items, set shared sets / reps / rest, and "Create new".
  - **Nutrition editor food sheet** (its own lazy chunk, `NutritionFoodForm`): the same food list.
    A Forma food goes through the serving step (computed macros, source, picture); an own food is
    used as it is. Open Food Facts and typing are kept.
  - **Swap groups** pick from the same food list and keep a copy of each food.
- **"Use in a client plan"** hands over a catalog id (`fx_`, `edb_`, `ff_`) or an own id. The editor
  makes the same copy its own picker would make:
  - **Forma exercise:** snapshot (`libraryUse.exerciseForPlan`, unlinked).
  - **Own exercise:** library-linked.
  - **Forma food:** first household serving (else 100 g), with its source and picture
    (`foodUse.foodForPlan`).
  - **Own food:** as is.
- **Food picture customisation** (B4.1 / B4.2 editor). Upload, link, replace or remove a picture;
  **use Forma's picture** (restore); preview, cancel and retry. It is available in the Library form
  (own and customised foods) and on plan rows. The canonical catalog never changes.

## 5. What a new coach sees

Nothing to import. On the first visit:

- Library › Exercises lists 1,343 exercises and Foods lists 190, with pictures.
- Programs, Supplements and Swap groups say what goes there and offer to create the first one.
- No row is written for the coach until they favourite, customise or create something (pinned by
  API and e2e tests).

## 6. Decisions and limits

- **No client-side sort for the merged lists.** Order is relevance, then name in the reader's
  language. Sorting foods by calories / protein across Forma's (per 100 g) and the coach's own (per
  their serving) would compare different units.
- **Bulk delete (Select mode) is gone from Exercises and Foods.** Most rows are Forma's now (not
  deletable). Own items are deleted one at a time. Programs, Supplements and Swap groups keep Select
  mode.
- **"Recently used" in the picker is replaced by Favourites.** A favourite is server-side and
  follows the coach across devices.
- **Plans keep snapshots.** Editing or resetting a customised item never changes a client's plan.
  Library sync to templates works as before for the coach's own items, customised ones included.
- **Customised food numbers.** A customised food keeps its catalog link (for Reset and dedupe). If
  the coach types different numbers or a different serving, the per-100 g source claim is dropped,
  so a row never claims USDA values it does not have.
