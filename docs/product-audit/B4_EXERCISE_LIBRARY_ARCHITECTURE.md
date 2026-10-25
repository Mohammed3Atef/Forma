# B4 — Exercise library architecture (the Forma catalog)

**Status (2026-10-23):** built and tested locally; **not committed, not deployed, off in production** (`FORMA_CATALOG` gate, §7).

**Related docs:**
- sources and licences: `B4_SOURCE_RESEARCH_AND_LICENSES.md`;
- media: `B4_MEDIA_RIGHTS_AND_QA.md`;
- migration: `B4_IMPORT_AND_MIGRATION_PLAN.md`;
- evidence: `B4_CERTIFICATION_REPORT.md`.

## 1. What changed, in one paragraph

Before B4, every coach got a copy of a 909-exercise wger dump (`public/data/exercise-library.json`) seeded into their own library. Its problems:
- English-only names;
- a blanket "CC BY-SA 3.0" credit;
- HEVC videos that most browsers cannot play;
- search by substring.

B4 adds a **curated, versioned, Forma-owned catalog** that every coach searches on the server: 134 exercises, in English, MSA Arabic and Egyptian gym slang. Each one has:
- Forma-written instructions in EN and AR;
- a controlled vocabulary;
- per-file licensed media, or an honest "no demonstration".

Coaches still own their libraries. Picking from the catalog **copies** the exercise into the plan, or into "My library", together with its catalog link.

## 2. Data model

The dataset lives in `data/catalog/exercises.json` (version `2026.10.22-2`). The contract is in `api/catalog/_lib/schemas.ts`; a file that fails it is never served.

| Field | Meaning |
|---|---|
| `id` | `fx_<slug>`. Stable and never reused. |
| `rev` | Bumped by the build only when the item's content hash changes. |
| `status` | `published` \| `draft`. Only `published` items are indexed or served. |
| `name.en` / `name.ar` | Display names. Arabic is MSA. |
| `aliases.en` / `.ar` / `.eg` | Search vocabulary. Egyptian gym words (بنش، سكوات، باي، تراي، دامبل …) are in `eg`. All 134 items have Egyptian aliases. |
| `bodyPart`, `primaryMuscles` (1–3), `secondaryMuscles`, `equipment` (1–4), `pattern`, `mechanics`, `difficulty`, `laterality` | Controlled vocabulary from `api/catalog/_lib/taxonomy.ts`, with EN + AR labels. A muscle is primary or secondary, never both. |
| `instructions.en` / `.ar` | `setup` (1–6), `steps` (2–8), `cues` (1–5), `mistakes` (1–5), `safety` (0–3). **Forma-written.** No third-party prose is copied, so no share-alike licence reaches it. |
| `media[]` | Up to 6 files. Each carries `kind`, `url`, `format`, a licence (`CC0-1.0` / `CC-BY-SA-3.0` / `CC-BY-SA-4.0`), `author`, `sourcePage`, `source {provider, id}` and `verified`. A video must be **H.264 MP4** (schema refine). `cdnPath` is reserved for re-hosted files. |
| `sources[]` | Provenance: provider, id, URL, role (`media` / `identity`), licence. Every media file must trace to a listed media source. |
| `content` | `license: FORMA-PROPRIETARY`, `author: Forma`. Also `review: draft` and `translation: draft` until a coach or a native speaker signs off. All 134 are `draft/draft` today. |
| `variantOf` | Groups variations (60 items), e.g. close-grip → bench press. It is grouping only, never a merge. |
| `legacyIds[]` | The `wger-<n>` starter rows this item reviewably replaces. 180 links in total; a legacy id maps to at most one item. |

Dataset-level fields:
- `sources[]`: provider, version, retrieval date, licence, attribution.
- `excluded[]`: every source file considered and left out, with the reason. There are 137 entries — the audit trail of curation.

**Coverage today:**

| Body part | Count |
|---|---:|
| Chest | 16 |
| Back | 20 |
| Shoulders | 17 |
| Arms | 21 |
| Legs | 29 |
| Glutes | 6 |
| Core | 15 |
| Cardio | 5 |
| Full-body | 5 |

- Difficulty: 93 beginner, 38 intermediate, 3 advanced.
- Main equipment: bodyweight 30, dumbbell 29, bench 27, barbell 23, cable 17, machine 16.
- Media: 42 items have a demonstration: 3 with video (and images) and 39 with images only. 92 have none. That is 79 media files included and 137 excluded.

## 3. How the dataset is built (bounded, idempotent, resumable)

| Step | Script | Notes |
|---|---|---|
| Snapshot wger | `scripts/catalog/fetch-wger.mjs` | About 15 cached API requests (`e2e-out/.cache/catalog`). Re-runs resume from the cache. No scraping. |
| Curate | `scripts/catalog/curation/exercises/01-chest.mjs` … `08-mobility.mjs` | One entry per exercise: names, aliases, classification, instructions EN + AR, and the wger id used for identity and media. |
| Review media | `scripts/catalog/curation/media-review*.json` | Per-file decision (`ok`, or a rejection reason) with an optional credit override. The merge throws on conflicting decisions. |
| Fetch and check media | `fetch-media.mjs`, `check-videos.mjs` | Images looked at by a person. Videos played in real Chrome, with frames captured and `readyState` checked. |
| Build | `scripts/catalog/build-exercises.mjs` | Deterministic. `rev` bumps only on a content change. Refuses to write an invalid dataset. Report: `data/catalog-reports/exercises-build.json`. |

## 4. Search

The search code is in `api/catalog/_lib/normalize.ts` and `search.ts`, and runs on the server in memory.

**Normalization**
- **English:** lowercase; accents stripped; compounds joined (pull up / pull-up / pullup); abbreviations expanded (db, bb, kb, rdl, ohp, sldl, bss, trx, bw); plurals folded.
- **Arabic:**
  - diacritics and tatweel removed;
  - letter variants folded (أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي);
  - Arabic-Indic digits converted;
  - a leading ال / وال / بال / فال / كال / لل dropped, so "الدمبل" finds "دمبل".

**Matching**
- Every query word must match (AND).
- A word scores 1 for an exact match, 0.8 for a prefix, and 0.6 for one typo (two typos for words of 8+ letters; words of 4+ letters only). A typo inside a prefix scores 0.5.
- A joined form catches "benchpress".

**Ranking**
- Field weights: name 1, aliases 0.9, primary muscle / equipment 0.45, secondary / pattern / body part 0.3.
- Bonuses for an exact or leading full-phrase match.
- A small boost for items with media.
- Stable tie-break by English name.

**Filters:** muscle (primary or secondary), equipment, pattern, body part, difficulty, "with video".

**Cost**
- No database read, no index, nothing written.
- Read from disk and indexed once per warm serverless instance: about 90–140 ms on the dev machine.
- One search: p50 about 2 ms, p95 about 4 ms over 214 mixed queries.
- B4 memoised repeated labels and word pairs. A golden comparison showed identical results for all 214 queries.

**Payload**
- 20 cards = 7.1 KB (1.3 KB gzip). 50 cards = 19.5 KB (3.2 KB gzip).
- One full exercise = 3.7 KB.
- Cards carry no instructions. A session never downloads the catalog.
- The catalog UI is a lazy chunk (`src/components/catalog/LazyCatalog.tsx`). A coach who never opens the Forma library downloads none of it, and the service worker precaches it for offline use.

**Quality, measured on 95 shadow queries** (`api/catalog/_lib/searchQuality.test.ts`)

| | Overall | English | Arabic | Egyptian | Typos |
|---|---:|---:|---:|---:|---:|
| Correct exercise in the top 3, new search | 100 % | 100 % | 100 % | 100 % | 100 % |
| Same, old library | 44.2 % | 70.9 % | 0 % | 0 % | 30 % |

The test gates at ≥ 90 % overall, ≥ 85 % Arabic, and p95 < 15 ms. Caveat: the query set was written by the same team that wrote the aliases. It proves the intended vocabulary works, not that real coaches' phrasing does. Watch real query logs after launch.

## 5. API (`api/_trpc/routers/catalog.ts`)

| Procedure | Returns |
|---|---|
| `catalog.meta` | `{enabled:false}`, or the versions, counts, bilingual vocabulary, licence table and sources. Static, so the client caches it. |
| `catalog.exercises.search` | `{total, items: card[], version}`. `limit` 1–50 (default 20), `offset` ≤ 1000, query ≤ 80 characters. |
| `catalog.exercises.get` / `full` (≤ 30 ids) / `byIds` (≤ 50 ids) | A full item / full items / cards. Unknown or unpublished ids are absent, or `NOT_FOUND`. |

Every procedure needs an active account (`protectedProcedure`). With the catalog off, every read is refused with `PRECONDITION_FAILED` / `CATALOG_DISABLED`.

## 6. Coach and client experience

**Plan-editor exercise picker** (`src/components/workout/ExercisePickerSheet.tsx`)
- "Forma library" / "My library" switch with 44 px targets.
- Default: the coach's last choice, else "My library" if they have exercises, else "Forma library".
- Search uses EN / AR / EG with a 250 ms debounce. Filters: muscle, equipment, "with video".
- Rows show the thumbnail, or an honest no-demo tile, plus a demo-type icon.
- Info opens a preview: video, images or "no demonstration yet"; chips; instructions; credits; "Instructions written by Forma". The coach can select from the preview.
- Mixed selection across both libraries.
- "Add" fetches the full items (`full`) and copies them. A failed fetch keeps the selection and says so.
- Quick-create is always the last row.

**Coach library** (`src/pages/coach/library/ExercisesSegment.tsx`)
- The same switch. Default "My library".
- The Forma view browses the catalog. "Save to my library" stores a copy as `cat-<id>`. If a copy already exists, it opens that copy instead of saving a second one.

**What a plan stores** (`src/lib/catalogCopy.ts` `exerciseFromCatalog`)
- A full copy: English legacy fields (`name`, `targetMuscle`, `equipment` …), the image and video URLs, and `names` (EN + AR).
- `instructions`, `mediaCredits[]`, `catalogId`, `catalogRev`.
- Those five fields are part of `SYNCED_EXERCISE_FIELDS`, so a library edit propagates to plans the same way as before.
- **History stays readable whatever later happens to the catalog.**

**Client exercise page** (`src/pages/ExerciseDetail.tsx`) shows:
- the name in the reader's language — unless the coach renamed it, which keeps the coach's name (`exerciseDisplayName`);
- line art shown in full on white;
- "How to do it", with the structured instructions;
- the per-file credits, linked.

The workout, routine and session pages use the same display name.

**Offline**
- Plans are full copies, so the client's workout works offline as before.
- The service worker caches catalog images under the existing `exercise-images` rule, which now also covers `wger.de/media/exercise-images/`.
- Catalog search needs the network. Offline, the browser and pickers show a dedicated offline state. A paused new query never shows the previous query's results as its own.

## 7. Switch and rollout

| Setting | Behaviour |
|---|---|
| `FORMA_CATALOG=on` | Catalog on, any environment |
| `FORMA_CATALOG=off` | Catalog off, any environment |
| Not set, `VERCEL_ENV=production` | **Off.** Shipping the code is not switching the data. |
| Not set, elsewhere (Preview, local, tests) | On |

With the catalog off:
- every catalog surface is hidden;
- the pickers and the library behave exactly as before (`ExercisePickerSheet.catalog.test.tsx`, "catalog switched off");
- existing plans are untouched.

**Rollback** = `FORMA_CATALOG=off`. Plans keep their copies.

## 8. Deduplication and the legacy mapping

- **Inside the catalog:** names and ids are unique (`dataset.test.ts`). Variations are linked with `variantOf`, never merged.
- **Legacy starter (909 wger rows)** → `data/catalog-reports/legacy-mapping.{json,md}`:
  - 180 exact matches;
  - 105 *variant candidates*, which need per-item review;
  - 624 stay as the coach's own rows.
- **Nothing is remapped automatically.** A plan exercise is never silently switched to a different movement (owner rule). Applying the mapping is an owner-approved migration (`B4_IMPORT_AND_MIGRATION_PLAN.md`).

## 9. Known limits and next steps

- **Coverage:** 134 exercises cover the common gym. Gaps include more machines and strongman, and more glute and mobility work. Add items through the curation sheets; the build and the tests guard the contract.
- **Demonstrations:** only 3 videos are served (H.264 MP4). 92 items have no demonstration. The video plan is in `B4_MEDIA_RIGHTS_AND_QA.md`.
- **Review:** instructions and Arabic are `draft`. They need a qualified coach's and a native Egyptian speaker's sign-off, after which `content.review` / `translation` are flipped.
- **Media hosting:** images and videos are hotlinked from wger.de. Re-hosting on Forma's CDN (`cdnPath`) is an owner step.
- **Catalog growth (estimate, linear extrapolation, not measured):** at about 1,000 items the index would take about 0.3–0.5 s to build per cold instance and about 10 ms per search. Past a few thousand items, precompute the normalized index at build time or move search to a database text index.

## 10. B4.1: demonstrations (2026-10-24)

**Size.** 164 exercises (30 added). Variations are separate items linked by `variantOf`, never merged.

**Media item** (`MediaSchema`):
- `kind`, `url` and `hosting` (`source` = the original file at its licensed source; `forma-cdn` = Forma's public catalog zone at `cdnPath`).
- `role` (`primary` / `alternate`) and a bilingual `label` (camera angle).
- `mime`, `codec`, `durationSec`, `width`, `height` and `poster { cdnPath }`.
- Author, licence and source page.
- `rights`, `review` and `publication`. A refine allows `published` only when the rights are verified and a person approved the file.

**Serving** (`servedMedia`). Only published items are sent, primary first. A `forma-cdn` file is sent only when `FORMA_CATALOG_MEDIA_URL` is set, with `url` and `posterUrl` resolved on that host. Search boosts only exercises with published media.

**API.**
- Search cards carry `videoCount` and use a poster as the thumbnail.
- `get` and `full` return only served media.

**UI:**
- **Picker preview.** One video at a time, with a demo switcher when there are several.
- **Lazy video** (`VideoFilePlayer lazy`). A poster button first; a tap loads the video, muted, looping, `playsInline`.
- **Client exercise page.** The same inline demo for catalog copies with an MP4.
- **Copies.** A plan copy keeps `videoUrl`, `videoPosterUrl` and `mediaCredits`.

**Counts.**
- 36 published videos: 33 Forma-hosted, 3 at their source.
- Exercises with a video: 3 today, 24 once the zone is set.
- The 593 videos of the second source are blocked (`B4_MEDIA_RIGHTS_AND_QA.md` §6).

## 11. B4.2: the ExerciseDB V1 layer (2026-10-25)

**Two datasets, one catalog:**
- `data/catalog/exercises.json`: 164 curated items, the B4 contract.
- `data/catalog/exercisedb.json` (`edb-v1-<date>-<n>`, 1.83 MB): 1,285 ExerciseDB exercises (`EdbExerciseSchema`).
- `loadCatalog()` merges them into one entry list (`ExerciseEntry = FormaEntry | EdbEntry`). The merged catalog has **1,343** exercises.

**An ExerciseDB record holds only what the provider gives:**
- `sourceIds`, the English name and `sourceName`.
- Muscles, equipment and body part mapped to Forma ids, plus the provider's `terms` verbatim.
- English steps and GIF media.
- Arabic name + Egyptian aliases (draft).
- `formaId` (same movement as a curated item) and `variantOf`.

**Never invented:** no difficulty, pattern, mechanics, laterality or Arabic instructions. The API sends `null` and the UI omits them.

**Ids:**
- `edb_<first source id>`, reused on every re-import (the importer reads the previous file), so plans and library copies stay valid.
- An ExerciseDB id linked to a curated item resolves to that item (`get`, `full`, `byIds`).

**Media item** (`EdbMediaSchema`):
- GIF `url` (the provider's address, never re-hosted), `width` / `height` / `bytes` / `frames` / `sha256`.
- `thumb` (`/catalog/edb/<id>.webp`, the app's own list still) and `role`.
- **Served as:** `kind: image`, `format: gif`, `license: EXERCISEDB`, author "ExerciseDB (AscendAPI)", with `thumbUrl`.
- **On a curated item:** the linked GIFs come after its own videos and before its still images.

**API:**
- **Cards:** `origin`, `media: video | animation | image | none`, `demoCount`, `variantOf`, and a still thumbnail (never the GIF).
- **Full items:** one shape for both origins; `credit` for ExerciseDB.
- **Search filters:** `origin`, `demo`.
- **Paging:** offset up to 2,000.

**Search:**
- One index. Curated items carry a +0.2 boost (complete bilingual instructions); ExerciseDB items with a GIF +0.05.
- Measured: 27 ms parse + 102 ms index build per cold instance; p50 4 ms, p95 8.1 ms per query.

**Copies** (`exerciseFromCatalog`):
- `imageUrl` = the GIF (the exercise page); `thumbUrl` = the still (lists).
- `sourceMedia` = the original, restorable.
- `mediaCredits` with the AscendAPI credit.
- `instructions.ar` null when only English steps exist; the reader sees the English, labelled.

**Coach customisation and ownership:** see `B4_IMPLEMENTATION_LOG.md` §B4.2 Step 4 (`exerciseMedia.ts`, `sanitizeDemoImage`).

## 12. B4.3: the catalog is the shared library (2026-10-25)

- **The library.** The catalog is now the library every coach uses: All · Favourites · Mine, merged
  with the coach's own exercises on the server (`library.exercises.list`). The `FORMA_CATALOG`
  switch (§7) and `catalog.exercises.search` / `byIds` are retired. The legacy starter seed and its
  mapping (§8) are removed; so are the datasets' `legacyIds`.
- **Customising.** A coach customises a Forma exercise into their own version (`cat-<id>`), which
  is listed instead of Forma's. "Reset to Forma's version" deletes it.
- **Using in plans.** A Forma exercise goes into a plan as a snapshot, from the picker or from "Use
  in a client plan", with no "save to my library" first.

See `B43_UNIFIED_LIBRARY.md`.
