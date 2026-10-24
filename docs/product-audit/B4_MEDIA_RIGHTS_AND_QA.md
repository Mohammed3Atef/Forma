# B4 — Media rights, quality review, and the media-security plan (MD-01 / 02 / 03)

**Status (2026-10-23):**
- Catalog media reviewed and built locally.
- **No file uploaded or re-hosted. No Bunny key, zone or setting touched. No private client media downloaded.**
- MD-01/02/03 remain owner-deferred; §5 is the plan.

## 1. Rights rules (as applied)

1. A file is served only when its **licence allows commercial use** and its **author and source page are known**. The licence must be CC0, CC BY-SA 3.0 or CC BY-SA 4.0, at the item level.
2. The licence of the repository *code* that holds a file says nothing about the file. Hence Free Exercise DB with Videos is rejected: its videos were "bought from an unknown seller", with no licence chain and no model releases (sources doc §2.2).
3. **Uploader ≠ author.**
   - An anonymous upload, or one whose own wger record names a commercial derivative source, is rejected.
   - The same goes for a studio, magazine or commercial-library look, watermarks, generator marks, AI art or decorative art.
   - **Exception:** Everkinetic line art is credited to Everkinetic even when another wger user uploaded it, because the series is recognisable and Everkinetic-licensed.
4. **Never another exercise's demonstration.** A file must show *this* exercise, as checked by a person (`verified: visual`). An item with no acceptable file shows "no demonstration yet". Nothing is substituted.
5. **Served formats:** PNG / JPG / WEBP / GIF images, and **H.264 MP4** video (schema-enforced). HEVC and `.MOV` are excluded with a reason. `.jfif` is excluded.
6. **Attribution shown to the reader, per file:**
   - "Image / Video: «author» · CC BY-SA x.0 (link) · wger.de (link to the source page)", on the coach preview and the client exercise page;
   - plus "Instructions written by Forma".
   - The plan copy carries `mediaCredits[]`, so the credit travels with the copy.
7. **Not modified.** Files are shown as published. A future trim or crop would make an adaptation, so the credit would then say "modified" and share-alike would apply to that file. A transcode or remux is a format change, which CC BY-SA 4.0 §2(a)(4) says "never produces Adapted Material".
8. **Personality rights are not licensed by CC** (CC BY-SA 4.0 §2(b)(1)). The 3 served videos show a person who appears to be the uploader filming himself ("Goulart"). Owner / counsel: accept, or ask wger / the author for confirmation.

## 2. Review process and tooling

| Step | Tool | Evidence |
|---|---|---|
| Candidate list | `scripts/catalog/lib/curation.mjs` `candidateMedia` / `selectedMedia` | Only files of the 133 wger exercises the catalog uses |
| Fetch (bounded, cached) | `scripts/catalog/fetch-media.mjs --sheets= --videos --max=` | `e2e-out/.cache/catalog` |
| Image review | A person looked at every file. The writer groups' decisions were spot-checked and corrected by the lead (4 overturned). | `scripts/catalog/curation/media-review*.json`: one decision per file; the merge throws on conflict |
| Video playback | `scripts/catalog/check-videos.mjs`: real Chrome (Playwright `channel: chrome`), a file:// harness per video, `readyState` check, frames captured | The 3 served videos play; HEVC files do not play in Chromium |
| Build gate | `build-exercises.mjs` + `dataset.test.ts` "media: every file is licensed, credited, reviewed, traceable; videos are H.264 MP4 only" and "every source excluded from the media is recorded with a reason" | `data/catalog-reports/exercises-build.json`; dataset `excluded[]` |

## 3. Results

### 3.1 Totals

| | Files |
|---|---:|
| Candidate files for the catalog's exercises | 216 |
| **Included** | **79**: 76 images (62 CC BY-SA 3.0, 14 CC BY-SA 4.0) and 3 videos (CC BY-SA 4.0) |
| Excluded, format | 54: HEVC 34, H.264 in `.MOV` 17, `.jfif` 3 |
| Excluded, rights or quality | 83 (breakdown below) |

**Rights / quality rejections (grouped from the per-file reasons):**
- anonymous upload (often with AI or render traits): 37;
- commercial-library 3D render: 21;
- wrong or doubtful movement: 6;
- studio frames from professional video, identifiable model (lead review): 4;
- duplicates of a rejected file: 3;
- third-party illustration series or web illustration: 3;
- editorial / magazine studio photo: 2;
- AI-generated or decorative: 2;
- commercial derivative source named in the record (fitnessvolt.com): 1;
- frame grabbed from a third-party video: 1;
- watermarked commercial illustration: 1;
- © HOIST Fitness product photo: 1;
- stock vector with highlighted muscles: 1.

### 3.2 Exercise coverage (134)

| Demonstration | Exercises |
|---|---:|
| Video (and images) | 3 |
| Images only | 39 |
| None — "no demonstration yet" | 92 |

### 3.3 Credits on included files

- Everkinetic: 72 (60 direct, 12 re-uploaded by wger users and credited to Everkinetic).
- Named contributors' own work: Goulart 3 videos, utkb 2, clafal 1, Davidgj32 1.

### 3.4 Served videos

All three are H.264 MP4, CC BY-SA 4.0, by Goulart, and are hotlinked from wger.de:
- bench press;
- chest dip;
- EZ-bar skullcrusher.

## 4. Plan for more demonstrations (owner)

| Option | Gives | Cost / risk | Recommendation |
|---|---|---|---|
| **A. Transcode / remux the excluded wger videos** | Up to 51 more files (17 remux, 34 HEVC → H.264). Coverage depends on which exercises they show, roughly 25–30 items. | Low. Same licence, credit unchanged, no edits. | **Do first** |
| B. Commission footage | Every catalog item, consistent style, Arabic-speaking coach on camera | Budget; needs a work-for-hire contract **and model releases** | Best long-term |
| C. Licensed stock | Gap filler | Per-clip terms: no redistribution, logos, "competing service" clauses | Case by case |
| D. Vendor dataset (ExerciseDB etc.) | Coverage | **Rejected:** revocable, no storage, 1-hour cache limit | No |

**Option A procedure (owner-run, local; nothing automated by B4):**

```
# H.264 already, wrong container: no re-encode
ffmpeg -i in.MOV -c copy -movflags +faststart -an out.mp4
# HEVC: re-encode for browsers
ffmpeg -i in.MOV -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

- Audio is dropped (`-an`): demonstrations are silent, and dropping audio avoids any music-rights question.
- No trimming, cropping or overlays, so the files stay unmodified works.

**Then:**
1. Play-check with `scripts/catalog/check-videos.mjs`.
2. Upload to a **public catalog path** on Forma's CDN (`catalog/…`), separate from personal media (§5).
3. Record `cdnPath`, `bytes`, `width` / `height` and `codec: h264` in the curation data.
4. Rebuild. The `rev` of each changed item bumps.

Re-hosting also removes the dependency on hotlinking wger.de, which is better for availability and fairer to wger's servers. It is recommended before launch even for the 76 images.

**Content to add when filming (option B):** match the curated instruction steps; front and side angles; neutral background; no logos; 4–8 s loops; 1080p H.264, about 1–2 MB.

## 5. Media-security plan (MD-01 / MD-02 / MD-03) — provider work, owner-held

Today:
- Uploads go server-side through `/api/media/*` (`api/media/_lib/bunny.ts`), so the zone password never reaches the browser.
- Files are served from the public pull zone (`BUNNY_CDN_URL`).
- There is no delete function.

### MD-01 — production uploads fail (Bunny 401)

**Cause (from the Phase-4 gate):** the `BUNNY_API_KEY` set in Vercel Production does not match the storage zone password. The old key also shipped to browsers as `VITE_BUNNY_API_KEY` before B0, so it must be considered leaked.

**Owner steps:**
1. Bunny → storage zone → FTP & API access → **reset the password**.
2. Vercel → Production (and a separate Preview zone, see B4-R1): set `BUNNY_API_KEY` (sensitive). Confirm that `BUNNY_STORAGE_ZONE`, `BUNNY_CDN_URL` and `BUNNY_STORAGE_REGION` match the zone. Remove any `VITE_BUNNY_*`.
3. Redeploy, then check:
   - `media.status` → `{configured: true}`;
   - upload a photo, an attachment, a voice note and an exercise video from a test account;
   - each plays or loads.

**Evidence:** a screenshot of each upload, plus the deployment id.

### MD-02 — personal media on public, permanent URLs

**Target design:**
- **Two zones:**
  - a *private* storage zone for personal media (body photos, message attachments, voice notes, progress media);
  - the existing *public* zone for public content (catalog demos, coach exercise videos the coach chooses to publish).
- **Private pull zone with Token Authentication.** Bunny signs URLs with an HMAC-SHA256 token and an expiry.
- **The database stores the object path, never a URL.** A new authenticated procedure (`media.signedUrl`) checks the caller may see the object — owner, the owner's active coach, or an admin with the gallery permission (MD-04) — and returns a URL valid for about 10 minutes.
- The service worker never caches signed personal media past its expiry.

**Migration:** under the clean-launch direction (REL-04: all current data is disposable test data), launch on the new private zone and skip copying old objects. Otherwise, copy objects zone-to-zone and rewrite stored URLs to paths, with an approved script that is a dry run first.

**Test (non-production zone):**
- a signed URL works until its expiry, then returns 403;
- an unsigned URL returns 403;
- another account's request for a path is refused;
- a browser upload → view → expiry check.

### MD-03 — deleting media never deletes the file

**Target design:**
- `deleteObject(path)` in `bunny.ts` (Storage API `DELETE`).
- A **media ledger** (`mediaObjects`: path, ownerId, kind, attachedTo, createdAt, deletedAt), written on upload.
- **Deleting a photo, a message or an account** marks its objects deleted and removes them. A **reaper** in the existing daily-maintenance cron retries failures and removes orphans: uploads never attached within 24 h.
- **CDN purge** for public-zone deletions. This needs the account API key, which is a separate owner-held secret.

**Test (non-production zone):**
1. Upload → the provider listing shows the object.
2. Delete in the app → the listing no longer shows it.
3. The CDN URL returns 404 after the purge.
4. The reaper removes an orphan.

**Order:** MD-01 first (uploads must work). Then MD-02 and MD-03 together, because the ledger and the private zone share the path-not-URL change. All three gate REL-02 and the clean launch (REL-04).

---

# B4.1 additions (2026-10-24)

**Status:**
- Nothing uploaded, hosted or published.
- No Bunny key, zone or setting touched; no Vercel setting changed.
- The coach food-photo upload path is built and tested locally against the e2e stand-in only. In production it depends on MD-01 (Bunny 401).

## 6. `michael-lemarec/free-exercise-db-api`: 593 videos, BLOCKED

### 6.1 Evidence

| Check | Finding |
|---|---|
| Repository licence | MIT: covers code and metadata, not the media |
| README | The videos were bought from a seller. No name, no licence, no redistribution or commercial-reuse terms, no model releases |
| File metadata (ffprobe, samples) | No copyright, author or licence tags. Re-encoded files carrying a drop-frame timecode, consistent with cuts from commercial footage |
| Upstream | The hosting links return 404 and the demo site returns 410: no live source to cite or verify against |

**Decision:** rights unverified, so **no video is imported, hosted, published or streamed.** Only ids and names are kept, as references in the mapping.

### 6.2 Blocked-asset list

All 317 source exercises and their **593** videos are blocked. Every row in `data/catalog-reports/fedb-mapping.json` (readable table: `fedb-mapping.md`) carries `videoLicense: "blocked — rights unverified …"` with its video count:

| Confidence | Exercises | Videos |
|---|---:|---:|
| exact | 97 | 184 |
| variant | 109 | 208 |
| none | 111 | 201 |

### 6.3 Rights-clearance request (draft — for the owner to send; nothing has been sent)

> **To:** the maintainer of github.com/michael-lemarec/free-exercise-db-api
> **Subject:** Licence for the exercise videos in free-exercise-db-api
>
> We would like to use some of the exercise demonstration videos in your repository inside Forma, a commercial coaching app (web and mobile; Egypt and the region). Your repository is MIT-licensed, but the README says the videos were bought from a seller, so we can't tell what rights come with them. Could you tell us:
> 1. Who produced the videos, and from whom you bought them (seller and product or licence name)?
> 2. Does that licence let you, or a third party, redistribute the files and use them commercially inside an app? Can you share the licence text or a receipt?
> 3. May the files be re-encoded (format and resolution only) and hosted on our own CDN, with credit shown next to each video?
> 4. Did the people shown sign model releases that cover commercial use?
> 5. What credit line should we show?
>
> Until we hear back, we are not using any of the videos.

**What would unblock them:** a licence document covering commercial redistribution and re-hosting, plus model releases. Each video would then still go through the §7 review before publication.

## 7. The licensed alternative: wger videos (CC BY-SA 4.0)

**Candidates:** 51 videos of the catalog's wger exercises.
- 46 converted to 720p H.264 MP4 with a WebP poster (`scripts/catalog/convert-videos.mjs`). This is a format change, not an adaptation (rule 7).
- 5 skipped: over 100 MB at source.

**A person reviewed every converted file** (contact strips; `curation/media-review.video.json`):

| Outcome | Videos | Reasons |
|---|---:|---|
| Approved | 33 | Each with an angle label |
| Rejected: recognisable bystander faces | 6 | Faces near the camera (`vid 12, 26, 49, 53, 57, 60`) |
| Rejected: licence plates | 1 | `vid 20` |
| Rejected: advertising poster with faces | 1 | `vid 71` |
| Rejected: duplicate camera angle | 3 | `vid 19, 76, 77`: one clip kept per angle |
| Rejected: a different variation | 2 | `vid 15` (stairs calf raise), `vid 54` (cable preacher curl) |
| Re-attributed | 2 (of the 33) | `vid 2, 3` show the dumbbell Romanian deadlift: attached to that exercise only |

**Result:** 36 published videos (33 to be Forma-hosted + 3 already served from the source), covering **24 of 164 exercises once hosted.**

**Personality rights (rule 8 applies again).** CC BY-SA licenses copyright only. The demonstrators' image rights are not covered. Before hosting, the owner or counsel accepts this, or asks wger or the authors to confirm consent.

## 8. Food pictures

**Rules (as applied):**
- Wikimedia Commons files only, under CC0, public domain, CC BY 2.0–4.0 or CC BY-SA 2.0–4.0: all of them allow commercial use. Author, licence, licence link and source page are kept per file.
- No Google Images, no random product photography, and nothing that implies a brand.
- A raw-looking photo never stands for a cooked food, and an Egyptian dish must look like that dish.

**Coverage (190 foods):**

| Status | Foods |
|---|---:|
| Approved | 125 |
| Needs replacement (shown, flagged) | 2: `ff_ful_with_oil`, `ff_whey_protein` |
| Rejected as misleading | 3: `ff_chickpeas_boiled`, `ff_egg_white_raw`, `ff_potato_boiled` |
| Missing (placeholder, never filled with a wrong photo) | 60 |
| Pending review | 0 |

**Variants:** `card` (640 px WebP, q72) and `thumb` (160 px square WebP, q70), processed locally from Commons' 1024 px renditions.

**Coach photos are private to that coach's foods folder.** They are sanitized on the device and again on the server (§3.4 of the implementation log). They can never point at client media, because the save-time check refuses any picture outside the coach's own `foods` folder or the catalog zone.

## 9. Hosting step (owner; nothing done)

**One-time steps:**
1. Create a **public catalog zone**, separate from the personal-media zone (MD-02).
2. Upload each `localFile` to its `cdnPath`:
   - `data/catalog-reports/catalog-media-upload.json`: 66 files (33 MP4 + 33 posters), 99 MB.
   - `data/catalog-reports/catalog-media-upload-foods.json`: 254 files, 4.55 MB.

   Every entry has its `sha256`. The files are in this machine's build cache (`e2e-out/.cache/catalog/…`; `build-food-images.mjs` and `convert-videos.mjs` regenerate them).
3. Set `FORMA_CATALOG_MEDIA_URL` for the environment that should show them. Until then nothing Forma-hosted is served (`servedMedia` / `servedFoodImage`).
4. `FORMA_CATALOG` stays off in production until the owner enables it.

**Orphaned coach food photos.**
- Super admin `media.foodImageOrphans` lists photos no document references, older than 14 days.
- Deleting them is part of MD-03 (ledger + reaper) and needs approval.
