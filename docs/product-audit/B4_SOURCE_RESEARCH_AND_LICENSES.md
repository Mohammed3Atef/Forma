# B4 — Source research and licences (exercise and food data)

**Date verified:** 2026-10-22.

**Method:**
- Every source was checked against its own current licence and terms pages, the item-level licence fields where they exist, and the actual data (API samples, bulk files).
- Quotes and URLs are in the research notes summarised below.
- This is engineering due diligence, **not legal advice**. Items marked *owner / counsel* need a decision before production.

**Rule applied throughout (owner brief):**
- An asset is used only when its commercial-use licence, attribution duty and provenance are established.
- The licence on a repository's *code* says nothing about the *media* in it.

## 1. Recommendation at a glance

| Source | Metadata / text | Images | Videos | Verdict | Used in B4 for |
|---|---|---|---|---|---|
| **USDA FoodData Central** (SR Legacy 2018-04, FNDDS 2021-2023, Foundation 2026-04) | CC0 1.0 | — | — | **Approved** | Every food value and household portion weight in the catalog |
| **wger** (wger.de, API v2) | CC BY-SA 3.0 / 4.0 per item | CC BY-SA 3.0 / 4.0 per image | CC BY-SA 4.0 (all 78) | **Conditional** | Exercise identity (wger id) and reviewed demonstration media only. No wger text is copied. |
| Everkinetic (via wger) | CC BY-SA | CC BY-SA, by Everkinetic | — | **Conditional** (attribution) | Most accepted images are Everkinetic line art, credited to Everkinetic |
| **Forma-written content** | © Forma | — | — | **Approved** (own work) | All names, Arabic and Egyptian aliases, instructions, classification, food naming, portion choice and recipes |
| michael-lemarec/free-exercise-db-api (317 exercises / 593 videos) | MIT (code); metadata partly from ExerciseDB | Rights unresolved | **Rights unresolved** | **Rejected** for production media | Nothing |
| yuhonas/free-exercise-db, wrkout/exercises.json | Unlicense (factual fields) | Scraped (Bodybuilding.com / ExRx suspected) | — | Metadata conditional; **images Rejected** | Nothing (the legacy library's GitHub images come from here, see §6) |
| ExerciseDB / AscendAPI (incl. free tier), MuscleWiki, datasets derived from them | Proprietary, revocable, no storage | Same | Same | **Rejected** | Nothing |
| RepDB free tier | Proprietary licence | Proprietary | Paid | Conditional (written confirmation needed) | Nothing |
| Wikimedia Commons | Per file | Per file | Per file (WebM / OGV) | Conditional, impractical at scale | Nothing |
| Pexels / Pixabay / Mixkit stock | — | Licence terms | Licence terms (no redistribution, no competing service, no logos) | Conditional (hand-curated gap filler only) | Nothing |
| **Open Food Facts** (and wger's ingredient feed, an ODbL extract of it) | ODbL (database), DbCL (contents) | CC BY-SA | — | **Rejected for bulk import**; *conditional* as an isolated, attributed, user-initiated lookup | The existing per-food lookup, now attributed (§5) |
| Egypt National Nutrition Institute tables (1996, 2006) | Print-only, no reuse terms | — | — | Conditional (written licence from NNI needed) | Nothing |
| FAO / INFOODS tables (WAFCT 2019, Near East 1982 …) | CC BY-NC-SA 3.0 IGO / all rights reserved | — | — | **Rejected** (non-commercial) | Nothing |
| Kaggle "Egyptian Food" (copy of NNI 2006) | Third-party CC BY label, no NNI authorisation | — | — | **Rejected** | Nothing |
| Ismail et al. 2021, *Nutrients* (fat of Egyptian foods) | CC BY | — | — | Approved as a cross-check only | Not imported |

## 2. Exercise sources

### 2.1 wger (Candidate A) — Conditional, used

**Size:**
- 932 exercises (`/api/v2/exerciseinfo/`), all with an English name.
- **48** with Arabic.
- 383 images over 279 exercises: 88 under CC BY-SA 3.0, 295 under CC BY-SA 4.0. 104 have no author.
- 78 videos covering 46 exercises, all CC BY-SA 4.0, all by "Goulart".

**Licences:**
- Code is AGPL-3.0. Data is "Creative Commons (see individual entries)".
- Every exercise, translation, image and video carries its own `license` and `license_author`.

**Commercial use:**
- Allowed under CC BY-SA, with attribution: author, licence (linked) and source (linked), and "modified" where it applies.
- A translation is an *adaptation*: an Arabic translation of wger text would itself have to be CC BY-SA. **Forma therefore copies no wger text**; all instructions are written by Forma.
- Showing unmodified CC BY-SA media alongside Forma content is a *collection*, not an adaptation. The rest of the app is unaffected.
- EU database-right note (CC BY-SA 4.0 §4(b)): the wger-derived media layer is kept separate and labelled per item, and Forma claims no database right over it (*owner / counsel*).

**Video:** 54 of 78 are HEVC (`.MOV`), 21 are H.264 in `.MOV`, and **3 are H.264 MP4**. Only browser-safe H.264 MP4 is served. The rest need a transcode or remux plus re-hosting, which is an owner media step (`B4_MEDIA_RIGHTS_AND_QA.md`).

**Image provenance is uneven.** Item-level review found:
- AI-generated art, one with a generator watermark;
- images whose own wger record names a commercial derivative source (fitnessvolt.com, workoutguru.fit);
- commercial-library 3D renders and magazine or studio photos.

All of these are rejected (§4).

**API:**
- No key needed; exercise endpoints are not throttled.
- Syncing is encouraged (official sync commands).
- Our pull: about 15 cached requests, bounded and resumable (`scripts/catalog/fetch-wger.mjs`).

### 2.2 Free Exercise DB with Videos (Candidate B) — Rejected for media

- The MIT licence covers code by the original author (Arham Wani).
- The README says the videos were *bought from an unknown seller through an Instagram ad* ("use with caution"). An earlier README claimed "the maintainer's rights", and the marketing copy says "filmed for this project". These contradict each other.
- No licence from the seller and no model releases.
- The original repository, account and demo site are gone (404 / 410). Videos are served from an anonymous Cloudflare R2 bucket.
- Metadata partly comes from ExerciseDB (the mapper strips ExerciseDB assets).
- **Verdict:**
  - videos and thumbnails: **Rejected** (rights unresolved);
  - text: used only as a reference, never imported.

### 2.3 Other exercise datasets (Candidate C)

- **ExerciseDB / AscendAPI:**
  - "exclusive property of AscendAPI";
  - the licence is "revocable … limited to the subscription period";
  - content "cannot be stored … in cache beyond … 1 hour";
  - the free tier is for exploration only.
  - **Rejected**, including its derivatives and MuscleWiki.
- **yuhonas / wrkout:**
  - the Unlicense covers the JSON;
  - the images were "scrapped off the internet … would advise against using them in commercial projects" and have been traced to Bodybuilding.com / ExRx.
  - **Images rejected.**
- **Everkinetic:**
  - CC BY-SA 4.0, about 300 line-art entries;
  - many of the wger images Forma accepted are Everkinetic, credited to Everkinetic.
- **Stock video (Pexels / Pixabay):**
  - usable only as hand-curated, edited, logo-free clips;
  - no redistribution or competing service;
  - not a dataset.
- **Arabic exercise names:** no open, usable glossary exists; Wikidata's labels are literal and sparse. Forma wrote its own MSA names and Egyptian gym aliases.

**Finding:** no source offers catalog-scale, commercially reusable H.264 demonstration video. Video coverage needs one of:
- commissioned or filmed footage (work-for-hire plus model releases);
- a vendor licence with a storage right;
- the owner's transcode of the wger CC BY-SA videos.

Tracked in `B4_MEDIA_RIGHTS_AND_QA.md`.

## 3. Food sources

### 3.1 USDA FoodData Central — Approved, used

**Licence:** "in the public domain … CC0 1.0 Universal". USDA requests, but does not require, attribution: "list FoodData Central as the source". Forma shows "Source: USDA FoodData Central" and uses no USDA logo or endorsement wording.

**Data types used:**

| Data type | Records | Status | Used for |
|---|---:|---|---|
| SR Legacy | 7,793 | Final release April 2018 | Breadth, and household measures (14,449 weights) |
| FNDDS 2021-2023 | 5,432 | Released October 2024 | Survey dishes (lentil soup, basbousa, stuffed grape leaves) |
| Foundation | 394 | v15, 2026-04-30 | Records with no SR Legacy equivalent (raw chicken breast without "added solution") |

Branded and Experimental foods are excluded.

**Energy basis:**
- kcal is taken from nutrient 1008, else 2048 (Atwater specific), else 2047 (Atwater general).
- Carbohydrate is taken by difference (1005), else by summation (1050).
- Foundation records lack 1008. This is handled, and the energy source is stored per food.

**Portions:**
- Taken only from the record's own portion table, as USDA weight ÷ USDA amount.
- FNDDS "Quantity not specified" is dropped.

**Bulk files:** about 11 MB zipped, fetched once with a recorded SHA-256 (`scripts/catalog/fetch-usda.mjs`). No API key, no scraping.

### 3.2 Open Food Facts — Rejected for bulk import; isolated lookup conditional

**Terms:**
- ODbL database, DbCL contents, CC BY-SA images.
- Commercial use is allowed, with attribution and share-alike of derivative databases.
- OFF's FAQ: combining OFF with other databases means "the resulting database must be released as open data as well".

**Bulk import:**
- Importing OFF into Forma's proprietary food collection would create a *Derivative Database* (ODbL §4.4(b)).
- Using it publicly in the app would trigger §4.4 / 4.6: offer it under ODbL, with a machine-readable copy.
- **Rejected.**

**Existing use:**
- The app's "search food database" queries wger's ingredient API, which **is an ODbL extract of OFF**: `license: 5` = ODbL, `source_name: "Open Food Facts"`.
- Before B4 it showed the wrong credit ("Exercise data provided by wger.de (CC BY-SA)") and kept no provenance on picked foods.

**B4 fix (FD-03):**
- the ODbL notice with links to Open Food Facts and the ODbL;
- the source and licence kept on every row a pick creates;
- servings computed with the shared rule.

It stays a **user-initiated, per-food lookup**, never pooled into a Forma or coach catalog.

**Owner / counsel decisions:**
- Whether many OFF-derived rows across plans could amount to a "substantial" extraction.
- Whether to keep the lookup once the Forma catalog is on.

**API rules:** product reads 15 per minute per IP; search 10 per minute; no search-as-you-type against OFF; a custom User-Agent.

**Egypt coverage is thin:**
- About 2.3–4.5 k products.
- About 46 % of them have complete nutrition.
- About 7 % have Arabic names.

### 3.3 Egyptian foods

No commercially usable Egyptian food-composition table was found:
- **NNI:** print-only, no terms;
- **FAO tables:** non-commercial or all rights reserved;
- **Kaggle copy:** unauthorised.

So Egyptian foods are covered without inventing numbers:

1. **Direct USDA matches.** Ful (fava, boiled), lentils, chickpeas, jute leaves (molokhia leaves), taro (qolqas), okra, guava, dates, tahini, hummus, falafel, stuffed grape leaves (FNDDS), basbousa (FNDDS) and more.
2. **Nearest-match estimates** (`proxy-estimate`, visibly labelled with the match note). There are 8:
   - baladi bread ← whole-wheat pita;
   - fino ← plain soft roll;
   - ta'ameya ← chickpea falafel;
   - Domiati ← feta;
   - areesh ← dry-curd cottage cheese;
   - laban rayeb ← cultured buttermilk;
   - renga ← kippered herring;
   - Egyptian lentil soup ← FNDDS lentil soup.
3. **Recipe estimates** (`recipe-estimate`, 5): ful with oil, koshary, molokhia with broth, stuffed zucchini (mahshi), rice with vermicelli.
   - Computed only from catalog ingredients at as-served weights (no assumed yields). Added fat is counted in full.
   - The only portion is the dish as composed.
   - Pending dietitian review.
4. **Gaps left honestly open** (no published item):
   - halawa (tahini halva);
   - sugarcane juice;
   - fiteer;
   - crisp-fried onion;
   - lean "beef" (unspecified cut);
   - labneh.

**Upgrade path (owner):**
- request a commercial licence from NNI;
- commission AOAC proximate analysis for the top 20–30 dishes.

## 4. Media review policy (as applied)

**Process:**
- A person looked at every image. The writers' reviews were spot-checked and corrected by the lead.
- Every video was played in real Chrome with frames captured (`scripts/catalog/check-videos.mjs`).
- Decisions are recorded per file in `scripts/catalog/curation/media-review*.json`.

**Accepted:**
- **Everkinetic line art**, credited to Everkinetic even when re-uploaded by another wger user. A frame of an Everkinetic series is credited the same way when wger left its author field empty.
- **A named contributor's own photo or video** that correctly shows the exercise.

**Rejected:**
- anonymous uploads (no traceable author);
- any image whose wger record names a commercial derivative source;
- commercial-library 3D renders;
- watermarks, copyright notices or generator marks;
- AI-generated or decorative art;
- magazine or studio photos that cannot be the uploader's own;
- the wrong exercise.

Counts are in `B4_MEDIA_RIGHTS_AND_QA.md` §3 and `data/catalog-reports/exercises-build.json`.

## 5. Attribution shown in the product

| Where | What the reader sees |
|---|---|
| Catalog exercise preview, client exercise page | Per media file: "Image / Video: «author» · CC BY-SA 3.0/4.0 (link) · wger.de (link to the source page)". Plus "Instructions written by Forma." |
| Catalog food picker, food rows from the catalog | "Values: USDA FoodData Central". Estimates are marked "Estimate", with their note. |
| Open Food Facts lookup | "Packaged-food values from Open Food Facts (via wger), available under the ODbL." Links to Open Food Facts and the ODbL. The ODbL source is kept on the saved row. |
| Datasets | Per-item `sources[]` (provider, id, URL, licence, the source's own description); per-media licence, author and source page; dataset-level source list with versions and retrieval dates. |

## 6. Legacy content still in production (not changed by B4)

The pre-B4 starter dataset `public/data/exercise-library.json` has 909 wger exercises:
- 46 hotlinked wger videos, mostly HEVC;
- 273 images;
- a hard-coded "CC BY-SA 3.0" credit.

Older coach libraries may still carry pre-wger rows with GitHub-hosted images of the rejected provenance (§2.3).

**B4 changes nothing in production.** The mapping, the archive candidates and the owner decision are in `B4_IMPORT_AND_MIGRATION_PLAN.md`.
