# 07 — Exercise library audit (data, discovery UX, video and image playback)

**Bottom line**

- "Videos don't play" has two independent causes:
  1. **95% of exercises have no video, but every exercise shows a video button.** On those exercises the button does nothing (EX-01).
  2. **76% of the videos that do exist are HEVC (H.265) QuickTime files hotlinked from wger.de**, 13–88 MB each, at a median 22 Mbps. Chrome with hardware HEVC plays them. Edge and Chromium builds without it show a black player with no error, and Firefox throws a decode error (EX-02).
- The client player has no failure state. A bad link (Drive, Vimeo, Instagram) or an unsupported codec leaves a dead player at 0:00 (EX-03, EX-04).
- Fixes cannot reach anyone today:
  - The starter library is copied into each coach account once and never updated (EX-07).
  - Client plans are snapshots that library edits never touch (EX-05).
  - Any edit through the exercise form silently cuts the library link and overwrites the Arabic notes (EX-06).
- Dataset: 909 wger records. 46 have video (5%), 273 have images (30%), **620 have neither (68%)**. Equipment, primary muscle and category are unreliable. Ten names are in Spanish or German. There are no Arabic names. Clients never see images (EX-09, EX-12, EX-13).
- **Quality gate (computed, nothing deleted): PUBLISHED 244 · LIMITED 625 · HIDDEN-INCOMPLETE 40.** Under a strict policy that requires a video every browser can play, only **9** exercises qualify.
- **Phase B direction:**
  - Build one shared, curated catalog (EX-07, EX-10). Re-encode and self-host its media as H.264 with posters and attribution (EX-02, EX-18, EX-19).
  - Show media only where it exists, and show it the same way to coach and client (EX-01, EX-13, EX-14).
  - Make the player fail gracefully (EX-03).

Audit date 2026-10-04, HEAD `e7663ab`. Every file cited here is identical in production RC2 `cf3a5d9`, except `vite.config.ts`: HEAD added a website cache rule. Its media rules are unchanged, but the cited line numbers sit about 10 lines earlier in RC2. The wger dataset (commit `1b28e4a`, 2026-09-21) is in RC2.

**Method.**

- Offline audit of `public/data/exercise-library.json`.
- HTTP probe of **all 46 video URLs and all 374 distinct image URLs**: read-only HEAD and Range GET requests to wger.de, sent one at a time. Each probe parsed the MP4/QuickTime box structure (ftyp brand, codec, `moov` position, dimensions, duration).
- Headless playback tests on this Windows 11 PC in Google Chrome 153, Microsoft Edge 154, Playwright Chromium (open-source build) and Playwright Firefox.
- Browser evidence BV-07, BV-08, BV-09, BV-10, BV-17, BV-18, BV-25 and BV-36 from the isolated stack.

Probe scripts and raw results live in the audit scratchpad and are not committed. File sizes use MB = 10⁶ bytes.

---

## 1. Dataset at a glance (`public/data/exercise-library.json`)

| Metric | Count | Share | Notes |
|---|---|---|---|
| Records | 909 | 100% | All `sourceProvider: "wger"`, ids `wger-<n>`. The previous dataset (`2cb5e86`, 2026-06-25) was **91 free-exercise-db records with 0 videos** and different ids |
| With `videoUrl` | 46 | 5.1% | 46 distinct URLs, all `https://wger.de/media/exercise-video/…`: 44 `.MOV`, 2 `.MP4` |
| With an image | 273 | 30.0% | 374 distinct image URLs. `imageUrl` is always `images[0]` |
| Video and image | 30 | 3.3% | |
| Video only | 16 | 1.8% | 12 of these are HEVC with no image: wger-46, 82, 205, 222, 294, 341, 374, 477, 575, 584, 590, 802. In Firefox or Edge they have no usable media |
| Image only | 243 | 26.7% | Images are shown only in the coach's library sheet (EX-13) |
| **Neither** | **620** | **68.2%** | e.g. wger-9 "2 Handed Kettlebell Swing", wger-20 "Arnold Shoulder Press" |
| `videoId` set | 0 | 0% | `videoId` only matters to the legacy local-video system (EX-21) |
| Images per record | 0: 636 · 1: 202 · 2: 53 · 3: 12 · 4: 4 · 5: 1 · 9: 1 | | |

## 2. Media reachability: broken, unreachable, MIME

### Videos (all 46 probed)

| Check | Result |
|---|---|
| Status | **46/46 `200`**, no redirects, server `Caddy`. Range requests return **206** with `Accept-Ranges: bytes` |
| Broken / unreachable | **0 / 0** |
| Hotlink protection | None: the same `200` with `Origin`/`Referer: https://useforma.fit/` |
| CORS | **No `Access-Control-Allow-Origin` on 46/46.** Files cannot be fetched into Cache Storage or IndexedDB; only `<video src>` works |
| Caching headers | **No `Cache-Control` on 46/46** (ETag and Last-Modified only) |
| Content-Type | `video/quicktime` ×44, `video/mp4` ×2. `canPlayType('video/quicktime')` returns `""` in every Chromium build tested, but Chromium still plays H.264 `.MOV` by sniffing. **The MIME type is not the failure; the codec is** |
| Container + codec | **35 (76%): QuickTime (`ftyp` brand `qt  `) + HEVC `hvc1` + AAC, `moov` index at the END** (the player must fetch the file tail before the first frame). **11 (24%): `mp42` + H.264 `avc1` + AAC, `moov` at the start** |
| H.264 ids | wger-73, 75, 194, 211, 245, 246, 537, 538, 655, 659, 803 |
| Resolution / duration | 1920×1080 ×45, 640×352 ×1 (wger-73). Duration 7.6–34.7 s (median 15.1 s) |
| Size | **1.54 GB total.** HEVC 13.4–87.5 MB (median 35.3, mean 42.1). H.264 1.1–11.8 MB (median 5.4). ≥50 MB ×11 · 20–50 MB ×23 · 5–20 MB ×7 · <5 MB ×5 |
| Bitrate | **HEVC 10.7–26.2 Mbps (median 22.4)** · H.264 0.6–4.0 Mbps (median 3.0) |
| Same file reused | wger-475 "Pull-ups" and wger-477 "Pull Ups on Machine": identical 54.5 MB, 18.77 s |

### Images (all 374 distinct URLs probed)

| Check | Result |
|---|---|
| Status | **374/374 reachable** (206 to a Range request). **0 broken** |
| Content-Type | png 256 · jpeg 76 · webp 36 · gif 5 · avif 1 |
| Bytes actually are | png 230 · jpeg 98 · webp 40 · gif 5 · avif 1. **38 MIME/byte mismatches**: e.g. `.png` served as `image/png` but JPEG bytes (wger 50, 81, 94, 146, 158 …); `.jpg` holding WebP (1744, 1801, 1835). Browsers sniff images, so they display, but a re-hosting pipeline must not trust extensions |
| Weight | **226 MB total.** 50 files ≥1 MB, largest **10.6 MB** (PNG, wger-1634). <50 KB ×141 · 50–200 KB ×110 · 200 KB–1 MB ×73 · ≥1 MB ×50 |
| Dimensions | Width p10 / median / p90 = 375 / 800 / 1920 px. **15 images under 200 px** on one side (e.g. 117×107 wger-1582; 144×144 wger-1573) |
| CORS / caching | None / none. Median latency 80 ms |

## 3. Duplicates

Names were normalised: lowercased, accents and punctuation stripped, plurals and spellings unified (pushups/push-ups, flyes/fly, curls/curl), stop-words removed.

| Level | Groups | Records | Examples |
|---|---|---|---|
| Exact same name | **0** | 0 | — |
| True duplicate (same normalised name and same equipment) | **1** | 2 | wger-331 "Kettlebell Swings" (target **Glutes**) vs wger-960 "Kettlebell Swing" (target **Shoulders**, has an image). They disagree even on target muscle |
| Variant families (equipment words stripped). These are legitimate variants that should be grouped, not removed | **48** | 112 | Biceps curl ×5 (wger-91 barbell, 92 dumbbell, 94 SZ-bar, 95 cable, 1424 machine) · Crunches ×4 (167/172/173/1415) · Triceps extension ×4 (50/211/659/660) · Shoulder press ×3 (543/566/567) · Lateral raise ×3 (348/1654/2658) · Hack squat (43/1414) |
| Same media file | 1 pair | 2 | wger-475 / wger-477 share one video |
| Old and new starter rows side by side | — | 91 + 909 | Coaches who seeded before 2026-09-21 hold 91 free-exercise-db rows (ids like `3_4_Sit-Up`). Re-seeding adds the 909 wger rows alongside them (`scripts/resetTestExerciseLibrary.mjs:5-9`; only the E2E coaches were reset) |

## 4. Low-quality records

| Issue | Count | Examples |
|---|---|---|
| Foreign-language names | **10** | Spanish: wger-1119 "Remo maquina agarre estrecho", 1120, 1143 "Back extensión", 1702 "Jalón al pecho con agarre ancho", 1707 "Elevación lateral polea", 1718 "Remo alto polea alta", 1719 "Jalon caballero unialteral", 2452 "Curl De Muñeca Con Barra". German: 418 "Military Press mit SZ-Bar", 1574 "Schwimmen". Cause: the importer falls back to whatever translation comes first (`scripts/importWgerExercises.mjs:111`) |
| Instructions don't match the name | ≥1 | wger-2452 (Spanish for "barbell wrist curl") has instructions for the **incline bench press**. wger-1119 and 1143 have Spanish text in `notes.en` |
| Not a single exercise | 2 | wger-1949 "Limber 11" (an 11-step warm-up routine), wger-1592 "Guided or free meditation" |
| Name formatting | 2 + 2 + 17 | Double space (wger-1666 "Curl  - With Shoulder Elevated"), trailing colon (wger-1734); trailing numbers ("Bear Walk 2", "Limber 11"); 17 names start lowercase ("box jumps", "commando pull-ups") |
| ALL CAPS / numbers-only / test entries | 0 / 0 / 0 | — |
| Very short names | 4 | "Dips" (fine), "Row", "Run" (ambiguous), "YWTs" |

## 5. Missing instructions, equipment and muscles

| Field | Finding | Evidence |
|---|---|---|
| Instructions (`notes.en`) | **23 empty, 17 more under 40 characters (40 total).** Median 221 chars, max 1,751 | Empty: wger-56, 71, 139, 165, 208, 258, 259, 341, 346, 510, 687 "Overhead Press" … Short: wger-205 is just "."; wger-354 "Lean Back, Pull into chest" |
| Instruction artefacts | 4–5 records with import debris (wger-12 ends in ".b"). 25 records say "see picture 1/2" while clients see no pictures. The client "How to perform" splitter (`src/pages/ExerciseDetail.tsx:62-65`) produces junk steps in **13** records (wger-12 gets a step "b"; wger-957 gets steps "2", "3", "4", "5") and more than 12 steps in **16** | EX-11 |
| Equipment | **"Body Only" on 504 (55%)**; 483 are wger records with no equipment listed. **At least 66 have names that clearly imply equipment** (wger-371 "Leg Press", 543 "Shoulder Press, on Machine", 598 "Smith Machine Close-grip Bench Press", 135 "Butterfly"). **No "Machine" value exists** (`importWgerExercises.mjs:61-74`). "Other" on 55 (bench, mat) | EX-09 |
| Primary muscle | The importer takes the first entry of wger's unordered primary-muscle list and **drops the other primaries** (`importWgerExercises.mjs:116-121`). All three "front squat" records say **Glutes** (BV-08 screenshot); wger-960 Kettlebell Swing says Shoulders | EX-09 |
| Muscle list | Missing on **146 (16%)**; their `tags` are empty too | |
| Category | `category` is a copy of `targetMuscle` on **909/909** (`importWgerExercises.mjs:143`). The coach table header calls it "Category (e.g. Compound)" | EX-09, EX-15 |
| Muscle vs wger category | Contradict on **125 (13.8%)**: Back→Shoulders 15, Back→Biceps 12, Arms→Shoulders 11, Chest→Shoulders 8 … e.g. wger-9 "2 Handed Kettlebell Swing" is Abs → Hamstrings; wger-683 "Power Clean" has target **Chest** | EX-09 |
| `level` | Absent on all 909. Starter templates sort by it (EX-20) | |

## 6. Translations (Arabic)

| Item | Coverage |
|---|---|
| Arabic exercise names | **0/909**. There is no `name.ar` field |
| Arabic instructions (`notes.ar`) | **48/909 (5.3%)**, e.g. Burpees, Crunches, Jumping Jacks. Editing any of them through the coach form overwrites the Arabic with English (EX-06) |
| Muscle labels | `src/i18n/ar.json` → `muscles` has no `abdominals` (102 records), `traps` (20) or `other` (18), so **140 exercises show an English label** in Arabic (`src/lib/muscle.ts:31-38` falls back to the raw value) |
| Equipment and category labels | Never localised; the coach library shows raw English strings |
| `public/data/exercise-taxonomy-ar.json` | **Unused** (no reference in src, api or scripts). It holds the old free-exercise-db vocabulary |
| Lost in the dataset swap | The June dataset carried `muscleAr`, `equipmentAr`, `categoryAr` and Arabic tags; the wger import has none |

## 7. Thumbnails

- 636/909 (70%) have no image.
- No record has a video poster.
- Images are hotlinked originals with no derivatives: up to 10.6 MB rendered into a 176 px-high box (`src/components/workout/ExerciseView.tsx:51`).
- The service-worker image rule still targets `raw.githubusercontent.com`, the old dataset's host (`vite.config.ts:145-155`), so wger images are never cached.

## 8. Discovery UX (coach)

| Element | What it is | Action | Why |
|---|---|---|---|
| "Load starter library" (text button beside search; also in empty states) | Copies 909 exercises + 84 foods + 10 food groups + 10 supplements + 9 templates into the coach's own collections (BV-10; `api/_trpc/routers/coachAssets.ts:320-383`) | REMOVE (after REBUILD of the catalog, EX-07) | New coaches start with an empty library and must find a text button. The copy never receives fixes |
| Empty state "Create your first exercise" | Shown at 390 and 1440 with no action (`evidence/coach-library-empty-390.png`, `coach-library-1440.png`) | REDESIGN | It tells a coach to author exercises one by one while 909 exist |
| Search | Substring match on name, muscle, category, equipment and tags (`src/pages/coach/CoachExerciseLibrary.tsx:95-108`). The picker version skips equipment (`src/components/workout/ExercisePickerSheet.tsx:50-61`) | REDESIGN | No synonyms ("DB", "pushup"), no Arabic, results not ranked, and the two searches disagree |
| Muscle chips | 12 chips in a horizontal scroller; the only filter (`CoachExerciseLibrary.tsx:194-201`) | REDESIGN | Chips are based on the unreliable primary muscle (EX-09). There is no equipment, has-media or quality filter |
| Sort | Name only, server-side (`coachAssets.ts:185`) | REDESIGN | No relevance, quality or recently-used ordering. BV-08: the media-rich "Front Squats" is listed last of 3 |
| Pagination | 25 per page → 37 pages (`CoachExerciseLibrary.tsx:156`). The picker shows at most 50 rows (`ExercisePickerSheet.tsx:68-69`) | REDESIGN | Browsing 909 rows 25 at a time is impractical; the picker hides the rest |
| List row | Name plus "muscle · category · equipment" text, a checkbox, and a delete ✕ on every row (`:228-238`) | REDESIGN | No thumbnail or media indicator. The muscle appears twice (category = muscle). A destructive control sits on every row |
| Desktop table | Columns Exercise · Muscle · "Category (e.g. Compound)" · "Equipment (e.g. Barbell)" · Sets/Reps · Tags (`:168-178`; `evidence/coach-library-1440.png`) | REDESIGN | Placeholder text used as column headers. The Category column duplicates Muscle. Tags are Latin anatomy ("biceps femoris") |
| View sheet (`ExerciseView`) | Video (`<video>` or YouTube `<iframe>`) or image, chips, programming table, English notes, tags (`ExerciseView.tsx:27-93`) | KEEP (concept) / REBUILD the player | The only place media is visible before use. It inherits EX-02 and EX-03 |
| Exercise form | Name, muscle, category, equipment, presets, sets/reps/rest, video URL (free text) + "Upload video", notes, progression, tags (`src/components/workout/ExerciseForm.tsx:96-160`) | REDESIGN | No image field, no EN/AR split (EX-06), no link validation or preview (EX-04) |
| Exercise picker (workout builder) | Search, "Quick create", "apply same sets/reps/rest", multi-select list of names (`ExercisePickerSheet.tsx`; `evidence/coach-exercise-picker-390.png`) | REDESIGN | No thumbnail, media indicator or preview (BV-08). Adding one exercise and saving takes 10 taps (BV-09) |
| 🎬 marker in the builder | Appended to the sets/reps line when `videoUrl` is set (`src/components/workout/PlanBuilder.tsx:267`) | MERGE into a real thumbnail | The only media cue in the builder; tapping the row opens the edit form, not a preview |
| Attribution line | "Exercise data provided by wger.de (CC BY-SA)" under the Exercises tab (`CoachExerciseLibrary.tsx:257`) | REDESIGN | Not per-work attribution (EX-19), and reused under food search (see 08) |
| Data payload | `coachAssets.exercises.list` returns the whole library, **835 KB**, with no paging. It refetches after 60 s and on tab focus (BV-25; `coachAssets.ts:92-101`; `src/services/platform/queryClient.ts:14,24`) | REDESIGN | 4.8 s to the first row on Slow 4G (BV-25) |

## 9. Who sees which media

| Question | Answer | Evidence |
|---|---|---|
| Can the coach see media before adding an exercise to a plan? | **Only in the library view sheet.** The picker used while building shows names only; no thumbnail, indicator or preview | BV-08, `ExercisePickerSheet.tsx:172-194` |
| Can the coach preview the video? | In the library sheet: yes, with EX-02/EX-03 failures. In the builder: no; a 🎬 marker appears after adding | `ExerciseView.tsx:27-49`, `PlanBuilder.tsx:267` |
| Does the client see the same media? | **Videos only**, via a popup. **Images: never** (generic dumbbell icon in plan, routine, detail and session). 243 image-only exercises therefore show the client nothing | BV-17, `evidence/client-routine-390-full.png`, `client-exercise-detail-390-full.png`. `imageUrl` is rendered only at `ExerciseView.tsx:15,51` (coach) |
| Does the client see the same instructions? | The same English text: split into "steps" on the detail page, truncated on the routine page. Arabic only for 48 records | `ExerciseDetail.tsx:62-65`, `src/pages/RoutineDetail.tsx:93` |
| Does the client see attribution? | No | — |

## 10. Playback by surface

| Surface (route) | What renders | No `videoUrl` (863/909) | wger H.264 `.MOV`/`.MP4` (11) | wger HEVC `.MOV` (35) | YouTube | Bunny-hosted mp4 | Drive / Vimeo / Instagram link |
|---|---|---|---|---|---|---|---|
| Coach library sheet (`/coach/library`) | `<iframe>` for YouTube, else `<video preload=metadata>`, else `<img>` | Image or nothing | Plays | Chrome with hardware HEVC: plays. Edge/Chromium: **black, no error, so no fallback**. Firefox: error → falls back to image + "Watch video" link | Plays | Plays | Error fires → image + link fallback (coach only) |
| Workout builder (`/coach/client/:id/workout`, `/coach/templates/:id/edit`) | 🎬 marker; no player | — | — | — | — | — | — |
| Client plan / routine (`/workout/routine/:dayId`) | Small video icon if `videoUrl` is set; generic dumbbell tile | — | — | — | — | — | — |
| Workout session (`/workout/session`) | Camera button on every card → `VideoPopup` | **Tap does nothing** (BV-07) | Plays (BV-07: Bench Press 640×352, 1.1 MB) | Device-dependent; black or error with **no message** | Plays (BV-07) | Plays (BV-07) | **Dead player at 0:00, `MEDIA_ELEMENT_ERROR: Format error`, no message** (BV-07, `evidence/client-video-drive-link-dead-player.png`) |
| Exercise detail (`/workout/exercise/:exId`) | Camera button in the header → same popup | Tap does nothing | as session | as session | as session | as session | as session |
| Client "Exercise library" (`/workout/library`) | List of plan exercises with best weights | No media | — | — | — | — | — |

## 11. Request / response / playback evidence

Representative probe rows, all with `Server: Caddy`, no `Access-Control-Allow-Origin` and no `Cache-Control`:

| Exercise | Request | Response | Container / codec | Notes |
|---|---|---|---|---|
| wger-12 Seated Hip Adduction | HEAD; GET `Range: bytes=0-262143` | 200 `video/quicktime`, 60,138,928 B, `Accept-Ranges: bytes`, ETag, Last-Modified 2023-12-06; 206 `bytes 0-262143/60138928` | `ftyp qt  ` → `wide` → `mdat` (60.1 MB); **`moov` only in the last 256 KB**; `hvc1` + `mp4a`; 1920×1080; 20.86 s | wger API: `codec: "hevc"`, licence CC-BY-SA 4, author "Goulart" |
| wger-507 Romanian Deadlift | same | 200 `video/quicktime`, 38,136,083 B | `qt  `, moov at end, `hvc1`, 1920×1080, 13.0 s (23.5 Mbps) | The 38 MB file in BV-07 |
| wger-294 Hip Thrust | same | 200 `video/quicktime`, 87,548,125 B | `qt  `, moov at end, `hvc1`, 30.19 s | Largest file: 87.5 MB per view |
| wger-73 Bench Press | same | 200 `video/quicktime`, 1,108,545 B | `ftyp mp42` → `moov` (6 KB) → `mdat`; `avc1` + `mp4a`; 640×352; 15.93 s | wger lists 3 H.264 videos for this exercise, incl. a 1080p `.MP4`; the importer took this one (`importWgerExercises.mjs:127`) |
| wger-194 Dips | same | 200 `video/mp4`, 5,424,928 B | `mp42`, moov first, `avc1`, 1920×1080, 12.75 s | |

Playback, headless on this PC. `<video muted playsinline>` + `play()`, success = first decoded frame via `requestVideoFrameCallback`:

| Browser | HEVC decode support (`mediaCapabilities`) | HEVC `.MOV` (wger-82, 222, 543, 802, 12) | H.264 `.MOV` (73, 75, 655) | H.264 `.MP4` (194, 246) |
|---|---|---|---|---|
| Google Chrome 153 | supported, smooth (hardware HEVC on this PC) | **5/5 played** (metadata in 0.28–1.5 s) | 3/3 | 2/2 |
| Microsoft Edge 154 (same PC) | **not supported** | **0/2**: `loadedmetadata` → `playing`, the audio clock runs to the end, **0×0, no frames, no `error` event** | 1/1 | 1/1 |
| Playwright Chromium (open-source) | not supported | **0/2**, same silent black | 1/1 | 1/1 |
| Playwright Firefox | — | **0/2, `error.code 3` "Failed to decode media"** | 1/1 | 1/1 |

BV-07 (real Chrome 153 on the isolated stack) confirms the Chrome row. Real-device checks on iOS Safari (expected to play `hvc1`) and on Android Chrome or the Capacitor WebView (plays only where the device has an HEVC hardware decoder) are **still needed**.

## 12. Root cause: "exercises that supposedly contain video don't display or play"

The data path is intact. `videoUrl` is copied from library → plan → client mirror without loss:

`pickFromLibrary` (`src/lib/workoutPresets.ts:85-87`) → passthrough plan save (`api/_trpc/routers/clientPlans.ts:18,34-42`) → `loadCoachAssignedContent` writes it to IndexedDB (`src/services/platform/clientSync.ts:88-95`) → `openVideo` (`src/pages/WorkoutSession.tsx:191-201`, `ExerciseDetail.tsx:67-76`).

`videoId` vs `videoUrl` is not the bug. `videoId` is null everywhere and only feeds the legacy local path.

The failures, ranked:

| Rank | Cause | Share of the problem | Finding |
|---|---|---|---|
| 1 | **There is nothing to play, but the button is always there.** 863/909 starter exercises (95%) have no `videoUrl`, and coaches seeded before 2026-09-21 have 0 videos at all. The button falls back to a local video store that is never filled for platform users, so the tap does nothing | Most taps | EX-01, EX-07 |
| 2 | **Codec.** 35/46 videos are HEVC QuickTime at ~22 Mbps with the index at the end: silent black (Edge/Chromium without hardware HEVC) or a decode error (Firefox); 13–88 MB per view where they do play | Most of the exercises that "have" video | EX-02 |
| 3 | **No failure handling.** The popup is a bare `<video>`, so every failure looks like a frozen 0:00 player | Every failure | EX-03 |
| 4 | **Unplayable links accepted.** Drive, Vimeo and Instagram links are saved as-is and fed to `<video>` | Coach-pasted links | EX-04 |
| 5 | **Updates never propagate.** Per-coach starter copies, plan snapshots, and the edit form that detaches library sync | Any fix made later | EX-05, EX-06, EX-07 |
| 6 | **Coach uploads stored raw.** iPhone HEVC `.MOV` reproduces cause 2. In production, uploads currently fail (Bunny 401, release report 2026-10-03) | Coach uploads | MD-05, MD-01 (see 12) |
| 7 | **No offline playback.** No service-worker rule for wger.de or Bunny, and wger has no CORS | Gym without signal | EX-18, MD-08 |

## 13. Quality gate (proposal; nothing deleted)

Signals, computed per record. The per-record list is in the audit scratchpad (`dataset-tiers.json`).

| Signal | Rule | Records failing |
|---|---|---|
| Not a duplicate | Not the weaker record of a true-duplicate pair (keep: video > image > longer instructions) | 1 (wger-331) |
| Good name | ≥3 characters; not foreign-language; not a routine or meditation; not mismatched; no trailing punctuation | 13 |
| Muscle | Target muscle set; cardio "Other" accepted | 0 |
| Equipment known | Not "Other" ("Body Only" accepted although unreliable) | 55 |
| Instructions | `notes.en` ≥ 40 characters | 40 |
| Usable media | An image that loads, or a video that loads | 620 |
| Consistent | Target muscle compatible with wger's category | 125 |

How many records survive under each policy:

| Policy | Remaining | Share |
|---|---|---|
| **Strict:** not duplicate + good name + muscle + equipment + instructions ≥40 + usable media + consistent | **225** | 24.8% |
| Strict, media must render in every browser (image, or H.264 video) | 219 | 24.1% |
| Strict, equipment optional | 271 | 29.8% |
| Strict + a video every browser can play (H.264) | **9** | 1.0% |
| **Medium:** not duplicate + good name + muscle + equipment + instructions ≥40; media optional | **804** | 88.4% |
| Medium, equipment optional | 857 | 94.3% |
| **Lenient:** not duplicate + good name + muscle | **895** | 98.5% |
| Minimal: not duplicate + any name ≥3 characters | 908 | 99.9% |

Proposed tiers:

| Tier | Rule | Records | With video | With image | Shown to |
|---|---|---|---|---|---|
| **PUBLISHED** | Good name, muscle, instructions ≥40, usable media, consistent category, not a duplicate | **244 (26.8%)** | 35 | 234 | Coaches by default; full media for clients |
| **LIMITED** | Good name and muscle, plus instructions OR media | **625 (68.8%)** | 11 | 33 | Coaches, with a quiet "no demo yet / incomplete" marker. Usable in plans. Reasons: no media 586 · muscle/category conflict 119 · instructions under 40 characters 12 |
| **HIDDEN-INCOMPLETE** | Duplicate, OR bad/foreign/mismatched name, OR (instructions <20 characters and no media) | **40 (4.4%)** | 0 | 6 | Hidden from search by default. A coach can open, complete or unhide. Reasons: no instructions and no media 14 · bad name 13 · duplicate 1 |

Notes for Phase B:

- About 8 of the 40 hidden records need only a rename or translation (wger-418, 1734, 1119, 1120, 1143, 1707, 1718, 1719).
- Staples like wger-687 "Overhead Press", wger-346 "Landmine press" and wger-683 "Power Clean" are hidden only for missing instructions. A curated pass over the ~150 most-used movements, with owned instructions, Arabic text and an H.264 demo, would move them to PUBLISHED.
- The tiers should drive catalog visibility (EX-07), not delete data.

---

## 14. Findings

### EX-01 — "Watch video" is a dead tap for 95% of exercises
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · `/workout/session`, `/workout/exercise/:exId` · 390
- **Evidence:**
  - The button renders unconditionally: `src/components/ExerciseCard.tsx:78-85`, `src/pages/ExerciseDetail.tsx:84-88`.
  - With no URL, the code falls back to `useVideos.byExercise` (`src/stores/videoStore.ts:32-34`). That store is seeded only in local-only mode (`src/data/bootstrap.ts:66-69`) and is wiped for platform users (`src/services/platform/clientSync.ts:41`).
  - `VideoPlayerSheet` then returns `null` for a null asset (`src/components/VideoPlayerSheet.tsx:70`).
  - The E2E suite already records this as "0/0 = silent no-op" (`e2e3/specs/30-client.spec.ts:60-66`). BV-07.
  - 863/909 starter records have no `videoUrl`.
- **Steps / scenario:** Client starts a workout → taps the camera icon on an exercise without `videoUrl`.
- **Expected vs actual:**
  - Expected: a demo plays, or no video control is shown.
  - Actual: nothing happens: no sheet, no popup, no message.
- **Why it matters:** The control sits on every exercise card and detail header. It works for 5% of starter exercises, and for 0% of coaches still on the June library. Users conclude video is broken.
- **Direction:** Show a media control only when a playable rendition exists. Otherwise show the image or numbered steps in place. Remove the legacy local-video fallback from platform builds (EX-21).
- **Verified:** BROWSER-VERIFIED (BV-07) + CODE-CONFIRMED

### EX-02 — 35 of the 46 starter videos are HEVC files many browsers can't show
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach · `VideoPopup` (session, exercise detail) and the coach library sheet · all viewports
- **Evidence:**
  - §2 and §11. 35/46 are QuickTime + `hvc1` + `moov` at the end, 1920×1080, 10.7–26.2 Mbps, 13.4–87.5 MB.
  - Edge 154 and open-source Chromium decode 0 frames and fire no `error`; Firefox fails with `error.code 3`; Chrome 153 plays only because this PC has hardware HEVC (consistent with BV-07).
  - The importer takes `ex.videos?.[0]` (`scripts/importWgerExercises.mjs:127`), ignoring wger's `codec: "hevc"` field and existing H.264 alternatives (exercise 73 has three).
- **Steps / scenario:** Open "Seated Hip Adduction" (wger-12) in Edge, or on a phone without an HEVC decoder.
- **Expected vs actual:**
  - Expected: the demo plays within about a second on mainstream browsers and phones.
  - Actual: a black frame whose timeline advances (Edge/Chromium) or a decode error (Firefox). Where it does play, it costs 13–88 MB per view on mobile data.
- **Why it matters:** These are the only videos most coaches have. The failure is silent and device-dependent, so it is reported as "videos don't work" without a pattern.
- **Direction:** Re-encode every demo to H.264 MP4 (720p, `faststart`, about 2 Mbps), with a poster frame, self-hosted. Prefer wger's existing H.264 variants. Mark an exercise "has video" only when a verified playable rendition exists.
- **Verified:** BROWSER-VERIFIED (Chrome, Edge, Chromium, Firefox on desktop). Real-device iOS and Android checks still needed.

### EX-03 — The client video player fails silently
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · video overlay on `/workout/session` and `/workout/exercise/:exId` · 390
- **Evidence:**
  - `src/components/VideoPopup.tsx:62` is a bare `<video controls autoPlay playsInline>`: no `onError`, no first-frame timeout, no poster, no fallback.
  - BV-07: Drive, Vimeo and Instagram links leave the player at 0:00 with `MEDIA_ELEMENT_ERROR: Format error` and no message (`evidence/client-video-drive-link-dead-player.png`).
  - For HEVC in Edge/Chromium no `error` event fires at all, so even the coach sheet's `onError` (`ExerciseView.tsx:46`) never triggers.
- **Expected vs actual:**
  - Expected: a clear "can't play this here" state, plus the written steps or image, and an option to open the original.
  - Actual: a dead black player at 0:00 over the workout.
- **Why it matters:** Mid-set, the user can't tell loading from broken, and there is no way forward.
- **Direction:** Give the player explicit states (loading → playing → failed). Add a first-frame watchdog, a poster, and a fallback to steps or image. Check playability before showing the control.
- **Verified:** BROWSER-VERIFIED (BV-07, headless Edge)

### EX-04 — Coaches can save video links that can never play
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · exercise form in `/coach/library`, the workout builder and the template editor · all viewports
- **Evidence:**
  - Free-text URL field: `src/components/workout/ExerciseForm.tsx:137`.
  - Any string passes the server schema: `api/coach-assets/_lib/schemas.ts:45`.
  - Only YouTube is recognised (`src/services/video/VideoStore.ts:26-29`); everything else goes to `<video src>` (`VideoPopup.tsx:51-62`).
  - BV-07: Drive, Vimeo and Instagram links produce a dead player.
- **Expected vs actual:**
  - Expected: the form accepts only links Forma can play (or converts them) and previews the result before saving.
  - Actual: any string is saved and shipped to every client on the plan.
- **Why it matters:** Drive and Instagram are how many coaches already share demos. Each one becomes a broken player for every client on the plan.
- **Direction:** Classify and validate links at save time (supported embeds, uploaded files), with an inline preview. Warn about or refuse share-page links.
- **Verified:** BROWSER-VERIFIED (BV-07) + CODE-CONFIRMED

### EX-05 — Library edits never reach clients' assigned plans
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach → client · `/coach/library` → `/coach/client/:id/workout` → client `/workout`
- **Evidence:**
  - Library changes propagate only to templates: `api/coach-assets/_lib/exerciseSync.ts:56-103`.
  - Assigned plans are snapshots (`api/_trpc/routers/clientPlans.ts:34-42`) with a manual per-exercise "Update from library" (`clientPlans.ts:59-85`, `src/components/workout/PlanBuilder.tsx:184-205`).
- **Steps / scenario:** Coach adds a demo video to "Bench Press" in the library. Clients already on a plan with Bench Press still have the old copy.
- **Expected vs actual:**
  - Expected: media and name fixes reach every plan that uses the exercise, or one action applies them.
  - Actual: each plan and each exercise must be updated by hand.
- **Why it matters:** Any media fix (EX-02 re-encode, new uploads) will not reach the clients who reported the problem.
- **Direction:** Plans should reference the catalog or library exercise for identity and media, and copy only programming fields (sets, reps, rest). Offer a bulk "apply to assigned plans".
- **Verified:** CODE-CONFIRMED

### EX-06 — Any edit through the exercise form silently unlinks it from the library and overwrites Arabic notes
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · exercise form in the workout builder, template editor and `/coach/library`
- **Evidence:**
  - `src/components/workout/ExerciseForm.tsx:90` always saves `notes: { en: text, ar: text }`.
  - `PlanBuilder.tsx:166-172` compares synced fields, including `notes`, and sets `librarySyncEnabled: false` with a "custom override" warning toast.
  - Every starter record has `notes.ar ≠ notes.en` (861 empty, 48 Arabic), so every save trips it.
- **Steps / scenario:** Open any starter exercise in a template → change working sets from 3 to 4 → Save.
- **Expected vs actual:**
  - Expected: the library link and the Arabic text are kept.
  - Actual: the copy is detached (later video or name fixes stop arriving), and `notes.ar` becomes the English text.
- **Why it matters:** Library sync and the only Arabic instructions are lost silently, and the toast blames the coach for an override they didn't make. The Arabic is recoverable from the starter data, so P1 rather than P0.
- **Direction:** Keep separate EN and AR fields. Detach only when a synced field was actually changed by the coach.
- **Verified:** CODE-CONFIRMED

### EX-07 — The starter library is copied into every coach account and never updated
- **Priority:** P1      **Effort:** L      **Impact:** TRANSFORMATIVE
- **Action:** REBUILD
- **Who / where:** coach · `/coach/library` ("Load starter library")
- **Evidence:**
  - `api/_trpc/routers/coachAssets.ts:320-383` inserts by id only and never updates: 909 exercises + 84 foods + 10 groups + 10 supplements + 9 templates per coach (BV-10).
  - The June dataset (`2cb5e86`, 91 rows, 0 videos) used different ids, so re-seeding adds 909 rows beside the old ones. The repo says so itself (`scripts/resetTestExerciseLibrary.mjs:5-9`, "doubling the library"); only E2E coaches were reset.
- **Expected vs actual:**
  - Expected: one maintained catalog every coach sees, plus their own additions and overrides.
  - Actual: frozen per-coach copies. Coaches seeded before 2026-09-21 have 91 exercises with no video. Re-loading doubles the library.
- **Why it matters:** No fix to videos, translations or metadata can reach existing coaches, and data grows by about 0.8 MB of exercises per coach.
- **Direction:** A shared global catalog with quality tiers (§13), plus a per-coach layer for favourites, overrides and custom exercises. One migration to fold existing copies back into the catalog.
- **Verified:** BROWSER-VERIFIED (BV-10) + CODE-CONFIRMED

### EX-08 — A new coach's library is empty and the starter action is easy to miss
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/library` · 390 and 1440
- **Evidence:**
  - BV-10. At 390, `evidence/coach-library-empty-390.png` shows the search field squeezed to "Searc", a text button "LOAD STARTER LIBRARY", and an empty state "Create your first exercise" with no action. Same at 1440 (`evidence/coach-library-1440.png`).
  - Code: `CoachExerciseLibrary.tsx:182-193,220-225`.
- **Expected vs actual:**
  - Expected: a usable library on day one.
  - Actual: an empty table asking the coach to author exercises one by one.
- **Why it matters:** The first impression of the content tools, and the reason some coaches never discover the 909 exercises.
- **Direction:** Make the catalog available by default (EX-07) and remove the load step.
- **Verified:** BROWSER-VERIFIED

### EX-09 — Exercise metadata is unreliable (equipment, primary muscle, category)
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach (filters, picker meta line, templates) and client (muscle label and colour) · all exercise surfaces
- **Evidence:**
  - §5. Equipment is "Body Only" on 504; at least 66 of those names imply machine, cable, barbell, dumbbell, band or ball, and there is no "Machine" value (`importWgerExercises.mjs:61-74`).
  - The primary muscle is the first of an unordered list, with other primaries dropped (`importWgerExercises.mjs:116-121`). All "front squat" records say Glutes (BV-08, `evidence/coach-exercise-picker-390.png`).
  - 125 target-muscle/category conflicts; `category` duplicates `targetMuscle` on 909/909 (`importWgerExercises.mjs:143`); 146 have no muscle list.
- **Expected vs actual:**
  - Expected: filtering by "Machine" or "Quadriceps" returns the right movements.
  - Actual: machine exercises file under Body Only, and front squats under Glutes.
- **Why it matters:** Filters, starter templates (EX-20) and client muscle labels are all built on these fields.
- **Direction:** Hand-curate the ~150 staple movements. Re-import keeping all primary muscles and the full equipment list. Add Machine. Drop the duplicate category field.
- **Verified:** CODE-CONFIRMED (data audit) + BROWSER-VERIFIED (BV-08 shows Glutes)

### EX-10 — No quality gate: incomplete, foreign-language and mismatched records sit alongside good ones
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/library`, exercise picker
- **Evidence:**
  - §1, §4, §5: 620 with no media, 40 with instructions under 40 characters (23 empty), 10 foreign-language names (`importWgerExercises.mjs:111`).
  - wger-2452 has a wrist-curl name with bench-press instructions; "Limber 11" is a routine; there is a meditation entry; one true duplicate disagrees on muscle (wger-331/960).
- **Expected vs actual:**
  - Expected: complete, trustworthy records first, and incomplete ones clearly marked.
  - Actual: all 909 rendered identically.
- **Why it matters:** Coaches can't tell good records from broken ones and assign exercises the client can't follow.
- **Direction:** Adopt the tiers in §13 (PUBLISHED 244 / LIMITED 625 / HIDDEN-INCOMPLETE 40). Never delete; let coaches complete records.
- **Verified:** CODE-CONFIRMED

### EX-11 — Instructions render badly for clients
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · `/workout/exercise/:exId`, `/workout/routine/:dayId` · 390
- **Evidence:**
  - `src/pages/ExerciseDetail.tsx:62-65` splits prose on `.`, `;` and newline, giving junk steps in 13 records (wger-12 gets step "b"; wger-957 gets steps "2", "3", "4", "5") and more than 12 steps in 16.
  - `src/pages/RoutineDetail.tsx:93` and `ExerciseView.tsx:67-72` always show `notes.en`.
  - 25 notes refer to pictures the client never sees. `evidence/client-exercise-detail-390-full.png`.
- **Expected vs actual:**
  - Expected: short numbered cues in the user's language.
  - Actual: sentence fragments, English everywhere.
- **Why it matters:** Clients read these mid-set on a phone.
- **Direction:** Store steps as an ordered list per language in the catalog instead of splitting prose at render time.
- **Verified:** CODE-CONFIRMED + screenshot

### EX-12 — The exercise library has almost no Arabic
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach · every exercise surface · `ar` / `ar-eg`
- **Evidence:**
  - §6: 0/909 Arabic names; Arabic instructions on 48/909 (5.3%).
  - 140 exercises show an English muscle label (`src/i18n/ar.json` → `muscles` lacks abdominals, traps, other; `src/lib/muscle.ts:31-38`).
  - The Arabic taxonomy file is unused, and the June dataset's Arabic fields were dropped. EX-06 overwrites the 48.
- **Expected vs actual:**
  - Expected: the Arabic UI shows Arabic names, steps and labels.
  - Actual: English names and steps for 95%+ of records.
- **Why it matters:** An Arabic-first coaching product; clients follow these instructions while training.
- **Direction:** Catalog i18n: name, search aliases and steps per language, starting with the curated staples. Complete the muscle label map. Remove the unused taxonomy file.
- **Verified:** CODE-CONFIRMED

### EX-13 — Clients never see exercise images
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client · `/workout/routine/:dayId`, `/workout/exercise/:exId`, `/workout/session` · 390
- **Evidence:**
  - BV-17; `evidence/client-routine-390-full.png` and `client-exercise-detail-390-full.png` show a generic dumbbell icon.
  - `imageUrl` is rendered only in the coach sheet (`ExerciseView.tsx:15,51`). 273 records have images; 243 of them have no video.
- **Expected vs actual:**
  - Expected: the demo media the coach saw when choosing the exercise.
  - Actual: a generic icon.
- **Why it matters:** For 243 exercises an image is the only demo that exists, and the client never gets it.
- **Direction:** One media area at the top of the exercise detail (poster → play). Small thumbnails in routine and session lists, sized for 390.
- **Verified:** BROWSER-VERIFIED (BV-17)

### EX-14 — Coaches can't see or preview media while choosing an exercise
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** coach · exercise picker in `/coach/client/:id/workout` and `/coach/templates/:id/edit` · 390
- **Evidence:**
  - BV-08 (`evidence/coach-exercise-picker-390.png`): "front squat" returns Double Kettlebell Front Squat, Dumbbell Front Squat, Front Squats, alphabetically. No thumbnail, indicator or preview. The only one with a video and 2 images (wger-257) is listed last.
  - Code: `ExercisePickerSheet.tsx:172-194`; the builder shows only a 🎬 marker after adding (`PlanBuilder.tsx:267`).
  - BV-09: 10 taps to add one exercise and save.
- **Expected vs actual:**
  - Expected: see which result has a demo, and preview it before adding.
  - Actual: names only, in alphabetical order.
- **Why it matters:** Coaches build plans blind to what the client will (or won't) see.
- **Direction:** Thumbnail plus a quiet media indicator per result, preview on tap, results ranked by relevance and quality tier.
- **Verified:** BROWSER-VERIFIED (BV-08, BV-09)

### EX-15 — Browsing doesn't scale to 909 exercises
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/library`, picker · 390 and 1440
- **Evidence:**
  - §8. Substring search; muscle chips are the only filter (`CoachExerciseLibrary.tsx:93-108,194-201`).
  - 25 rows per page, 37 pages (`:156`); the picker shows at most 50 (`ExercisePickerSheet.tsx:68-69`) and its search skips equipment (`:50-61`).
  - The desktop table uses placeholder text as column headers ("Category (e.g. Compound)") for a column that duplicates Muscle (`:168-178`, `evidence/coach-library-1440.png`). There is a delete ✕ on every row (`:228-238`).
- **Expected vs actual:**
  - Expected: find "dumbbell incline press" or "ضغط" in one search, and filter by equipment or "has demo".
  - Actual: exact substrings, one filter, paging.
- **Why it matters:** Plan building is the coach's most frequent content task.
- **Direction:** One search with synonyms and Arabic aliases; equipment, muscle and has-media filters; a virtualised list; delete moved into an overflow menu.
- **Verified:** CODE-CONFIRMED + screenshots

### EX-16 — The whole library downloads on every open (835 KB)
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** coach · `/coach/library`, picker · mobile networks
- **Evidence:**
  - BV-25: 4.8 s to the first row on Slow 4G; `coachAssets.exercises.list` is 835 KB.
  - No paging or projection (`coachAssets.ts:92-101`). The data goes stale after 60 s and refetches on tab focus (`src/services/platform/queryClient.ts:14,24`).
- **Expected vs actual:**
  - Expected: the first screen of results in well under a second.
  - Actual: the full library on every visit.
- **Why it matters:** Coaches work from phones between sessions.
- **Direction:** Server-side search with paging and a slim list shape (id, name, muscle, equipment, thumbnail, has-video, tier). Cache the shared catalog.
- **Verified:** BROWSER-VERIFIED (BV-25)

### EX-17 — Exercise images are unprocessed originals up to 10.6 MB, with no thumbnails
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach · library sheet (and every client surface once EX-13 is fixed)
- **Evidence:**
  - §2: 226 MB across 374 images; 50 are ≥1 MB, the largest 10.6 MB; 15 are under 200 px; 38 have a MIME type that doesn't match the bytes.
  - Rendered into a 176 px-high box (`ExerciseView.tsx:51`). wger sends no cache headers.
- **Expected vs actual:**
  - Expected: small thumbnails in lists and an appropriately sized detail image.
  - Actual: the original file every time.
- **Why it matters:** Slow lists and mobile data cost the moment images reach clients.
- **Direction:** Self-hosted derivatives (thumbnail and detail sizes, correct MIME), plus poster frames for videos.
- **Verified:** CODE-CONFIRMED (HTTP probe)

### EX-18 — All exercise media is hotlinked from wger.de
- **Priority:** P2      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach · every exercise media request
- **Evidence:**
  - §2: 46 videos (1.54 GB) and 374 images are served by wger.de with no CORS and no `Cache-Control`. No hotlink protection today, but no service agreement either.
  - The service worker has no rule for wger.de (`vite.config.ts:98-162`). Every view sends the client's IP to a third party.
- **Expected vs actual:**
  - Expected: media served from Forma's own CDN, cacheable and available offline for the current plan.
  - Actual: live dependency on a volunteer-run server; impossible to cache.
- **Why it matters:** Availability (wger can block or move files at any time), offline use in gyms, and cost-shifting to an open-source project.
- **Direction:** Re-host the processed renditions (EX-02, EX-17) with licence metadata (EX-19).
- **Verified:** CODE-CONFIRMED (HTTP probe)

### EX-19 — Licences and attribution for exercise data and media are not honoured
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** client and coach · every exercise surface
- **Evidence:**
  - `importWgerExercises.mjs:156` hard-codes `"wger.de (CC BY-SA 3.0)"` and drops `license` and `license_author`. wger's own licence table shows items under CC-BY-SA 3, CC-BY-SA 4, CC-BY 4 and CC0; e.g. exercise 12's video is CC-BY-SA 4 by "Goulart", and the bench-press images are by "Everkinetic".
  - The only credit is one generic line under the coach Exercises tab (`CoachExerciseLibrary.tsx:257`). Clients see none.
  - `api/coach-assets/_lib/exerciseLibrary.ts:7` still calls the data "public domain".
- **Expected vs actual:**
  - Expected: author, licence and source credited wherever a work is shown.
  - Actual: no per-work credit anywhere.
- **Why it matters:** CC BY and BY-SA require per-work credit, and derivatives (re-encodes, edited instructions) must stay BY-SA. Re-hosting (EX-18) makes Forma the distributor.
- **Direction:** Store licence, author and source per text and per media item. Show a compact credit in the player and on the detail page. Get legal review before re-hosting.
- **Verified:** CODE-CONFIRMED

### EX-20 — Starter workout templates are filled alphabetically
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach · `/coach/templates` after loading the starter library
- **Evidence:**
  - `api/coach-assets/_lib/starterLibraryBuild.ts:48-65` orders by `level`, then name. wger records have no `level`, so picks are alphabetical. The Middle Back, Lower Back, Adductors and Forearms buckets don't exist in the data.
  - Running the shipped algorithm on the shipped data gives:
    - Push: 4-count burpees, 45° lateral raises, Barbell Triceps Extension, Bench Press, Arch Hang, Bench Press Narrow Grip.
    - Legs: Abduction while standing, 1 Leg Box Squat, 90/90 Hip Switches, ankle dorsiflexion rocks, Adductor Rock Backs, 2 Handed Kettlebell Swing.
- **Expected vs actual:**
  - Expected: credible starter programs.
  - Actual: alphabetical lists of random movements.
- **Why it matters:** A coach who assigns a starter template sends this to a paying client.
- **Direction:** Hand-curated templates referencing curated catalog ids.
- **Verified:** CODE-CONFIRMED (shipped algorithm run on shipped data)

### EX-21 — Legacy offline-video tools still ship to clients
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** client · Settings › Tools › Video manager (`/settings/videos`), Import data (`/settings/import`) · 390
- **Evidence:**
  - BV-18; `evidence/client-video-manager-390.png` shows an empty page with no empty state.
  - Entry points: `src/pages/Settings.tsx:431-435`, `src/apps/ClientApp.tsx:172-173`. The data is seeded only in local-only mode (`bootstrap.ts:66-98`).
  - `public/exercise_videos/` (30 mp4, 131 MB) is deployed (`dist/exercise_videos`) with its own service-worker rule (`vite.config.ts:120-131`) and cache header (`vercel.json`).
  - The legacy player is `VideoPlayerSheet` (with `videoStore` / `CacheVideoStore`); it serves this path and the dead fallback in EX-01.
- **Expected vs actual:**
  - Expected: no developer tools in the client app.
  - Actual: an empty "Video Manager" and a sheet-import tool.
- **Why it matters:** Confusing dead surfaces, plus deploy weight.
- **Direction:** Remove from platform builds; keep only if a local-only product mode is a goal.
- **Verified:** BROWSER-VERIFIED (BV-18)

### EX-22 — The client "Exercise library" is the plan's exercise list, not a library
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** client · `/workout/library` · 390
- **Evidence:**
  - BV-36 (`evidence/client-exercise-library-390-full.png`).
  - `src/pages/ExerciseLibrary.tsx:39-46` lists only `plan.exercises`. Its "category" is the first word of a day title (`:26-37`). The content duplicates Progress › Strength.
- **Expected vs actual:**
  - Expected: one place for exercise history and bests.
  - Actual: a second list with a misleading name.
- **Why it matters:** Extra navigation with no new value.
- **Direction:** Merge into the plan or Progress views (per-exercise strength), or drop the entry point.
- **Verified:** BROWSER-VERIFIED (BV-36)

### EX-23 — Copy promises "many with video"
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach · library empty states and onboarding
- **Evidence:** `src/i18n/en.json:251`: "Load 900+ exercises (many with video)…". 46/909 (5.1%) have video; 11 play in every browser.
- **Expected vs actual:**
  - Expected: accurate claims.
  - Actual: overstated.
- **Why it matters:** It sets up the exact disappointment users report.
- **Direction:** State real coverage, or remove the claim until the catalog is curated.
- **Verified:** CODE-CONFIRMED

### EX-24 — Variants and duplicates aren't grouped
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** MERGE
- **Who / where:** coach · library, picker
- **Evidence:**
  - §3: 48 variant families covering 112 records (e.g. biceps curl ×5).
  - True duplicate wger-331 / wger-960 with conflicting muscles.
  - wger-475 and wger-477 share one 54.5 MB video.
- **Expected vs actual:**
  - Expected: one movement with equipment options.
  - Actual: unrelated-looking rows.
- **Why it matters:** Clutter, and conflicting data for the same movement.
- **Direction:** Group variants under a movement; merge the duplicate; attach the shared video to the right record.
- **Verified:** CODE-CONFIRMED
