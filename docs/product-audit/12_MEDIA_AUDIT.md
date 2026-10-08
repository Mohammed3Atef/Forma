# 12 — Media audit (storage, delivery, playback, privacy)

**Bottom line**

- **Production uploads are down.** Every upload path (progress, assessment and check-in photos, avatars, message attachments, voice notes, coach exercise videos) fails with a Bunny 401, per the 2026-10-03 release report. Progress photos then fail silently: they stay on the phone and the coach sees "Not uploaded" (MD-01).
- **The most sensitive data in the product sits on a public CDN with permanent links.** That covers body photos (progress, assessment, check-in), private message attachments and voice notes: anyone holding a link can open it, forever (MD-02).
- **"Delete" never deletes the file.** The codebase has no Bunny delete call at all. Deleted photos and messages, replaced avatars, and the media of transferred clients all stay reachable (MD-03).
- **Pipelines are inconsistent:**
  - Photos are downscaled to WebP. Video and audio are stored exactly as recorded (iPhone HEVC `.MOV` included), with no transcoding or poster (MD-05).
  - No thumbnails exist anywhere (MD-06).
  - Failure handling differs per surface (MD-07).
  - Nothing on the CDN is cached for offline use (MD-08).
- **What is good and should stay:**
  - Upload authorisation is server-side and path-derived (`api/media/_lib/policy.ts`).
  - The storage key never reaches the browser.
  - Progress photos are kept on the device first.
- **Phase B direction:**
  - A private bucket with short-lived signed links for personal media; public CDN only for catalog and exercise media (MD-02).
  - A media record per file, with deletion and purge jobs (MD-03).
  - One upload queue with status and retry (MD-07).
  - Transcoding with renditions and posters for every video (MD-05).

Audit date 2026-10-04, HEAD `e7663ab`. Every cited file is identical in production RC2 `cf3a5d9`, except `vite.config.ts`: HEAD adds a website cache rule, so the media cache rules sit about 10 lines earlier in RC2. **Production was not contacted**; the Bunny 401 comes from the 2026-10-03 release report. Exercise and food media details: `07_EXERCISE_LIBRARY_AUDIT.md`, `08_FOOD_LIBRARY_AUDIT.md`.

---

## 1. Media map — summary

| Media | Source | Stored on | URL handed to the app | Who can open the URL | Thumbnail | Compression | Offline | When the user deletes it |
|---|---|---|---|---|---|---|---|---|
| Exercise video (starter) | wger.de | wger.de (hotlink) | `https://wger.de/media/exercise-video/{id}/{uuid}.MOV` | Anyone | None (no poster) | None: 35/46 are HEVC at ~22 Mbps, 13–88 MB | No (no CORS, no service-worker rule) | n/a (third party) |
| Exercise video (coach upload) | Coach's device | Bunny `Forma/{coachId}/exercises/{key}.{mp4\|mov\|webm}` | Public CDN URL, copied into every template and plan | Anyone with the URL | None | **None**; stored as recorded, ≤50 MB | No | **Never deleted** (replacing the URL orphans the file) |
| Exercise video (YouTube link) | YouTube | YouTube | `youtube.com/embed/{id}` iframe | Public | YouTube | YouTube | No | n/a |
| Exercise images | wger.de | wger.de (hotlink) | `https://wger.de/media/exercise-images/…` | Anyone | None; originals up to 10.6 MB | None | No | n/a |
| Food images | — | — | — | — | — | — | — | **Not implemented** (see 08 §11) |
| Progress photos | Client camera or gallery | **Device IndexedDB** (original file) + Bunny `Forma/{uid}/{key}.webp` | `cdnUrl`, a public CDN URL synced to the server | **Anyone with the URL** | None | WebP 1600 px, q 0.82 | Owner: yes (local copy). Coach: no | **Local copy only.** The CDN file stays forever |
| Avatars | User | Bunny `Forma/{uid}/avatar/{key}.webp` | `users.photoUrl` (public) | Anyone | — (stored at 512 px) | WebP 512 px, q 0.85, ≤2 MB | No | Replace or remove orphans the old file |
| Assessment photos | Client | Bunny `Forma/{uid}/assessment/{key}.webp` | Assessment document fields | Anyone with the URL | None | WebP 1600 px | No | Never deleted |
| Check-in photos | Client | Bunny `Forma/{uid}/checkin/{checkInId}/{key}.webp` | Check-in `progressPhotos.{front,side,back}` | Anyone with the URL | None | WebP 1600 px | No | "Remove" clears the field only |
| Message images | Client or coach | Bunny `Forma/{clientId}/messages/{key}.webp` | `messages.attachment.url` | Anyone with the URL | None | WebP 1600 px (mislabelled WebP when downscale falls back) | No | Soft delete hides it in the app; **the file stays** |
| Message videos and files | Client or coach | Same folder (`.mp4`, `.mov`, `.webm`, `.pdf` …) | Same | Anyone with the URL | None | None (video ≤50 MB, file ≤25 MB) | No | Never deleted |
| Voice notes | Microphone | Same folder (`.weba` / `.m4a`) | Same | Anyone with the URL | — | As recorded: Opus/WebM (Chrome, Android, Firefox) or AAC/MP4 (Safari), ≤5 min, ≤10 MB | No | Never deleted |
| Legacy local exercise videos | Repo | `public/exercise_videos/` (30 mp4, 131 MB, deployed) | `/exercise_videos/{name}.mp4` | Public | — | H.264 | Yes, but only in the local-only mode clients don't use | n/a (REMOVE: EX-21) |

`{key}` = 12 random base64url characters (72 bits) followed by a base-36 timestamp (`api/media/_lib/policy.ts:92-94,178`). The path also exposes the owner's user id.

## 2. Shared upload pipeline

| Step | What happens | Evidence | Verdict |
|---|---|---|---|
| Is the service configured? | The client asks `media.status` once and hides pickers until it confirms | `src/services/platform/mediaApi.ts:73-111`, `api/_trpc/routers/media.ts:13` | KEEP |
| Client pre-checks | Images limited to JPEG/PNG/WebP, ≤5 MB; video ≤50 MB; audio ≤10 MB; files ≤25 MB (instant feedback only) | `mediaApi.ts:52-71,241-254` | KEEP |
| Image processing | Canvas re-encode to WebP: 1600 px q 0.82 (photos, message images), 512 px q 0.85 (avatars). Strips EXIF. Falls back to the original file if decoding or encoding fails | `src/lib/image.ts:6-27`, `src/components/AvatarPicker.tsx:32-46` | KEEP (extend to derivatives, MD-06) |
| Video and audio processing | **None** | `src/components/workout/ExerciseForm.tsx:61-74`, `src/components/MessageThread.tsx:423-437` | REBUILD (MD-05) |
| Transport | Files ≤4 MiB: one `POST /api/media/upload`. Larger files: `init` → 4 MiB `chunk` requests → `finalize`, sent via XHR with progress and one retry after refreshing the session token | `mediaApi.ts:120-246`, `api/media/[action].ts:91-181` | KEEP the protocol; REDESIGN the staging (MD-11) |
| Authorisation | Session identity required; the account must be active. **The server derives the storage path**: clients cannot upload exercise media; message uploads require thread access; ids are pinned to `[A-Za-z0-9_-]`; HTML, SVG and script types are refused | `api/media/_lib/policy.ts:115-179`, `[action].ts:185-226` | **KEEP** (good) |
| Staging | Chunks stored as BSON Binary in Mongo (`mediaUploadChunks`, 1 h expiry), assembled in function memory, then one PUT | `api/media/_lib/staging.ts:18-68`, `[action].ts:166-181` | REDESIGN (MD-11) |
| Storage write | `PUT https://storage.bunnycdn.com/{zone}/{path}` with the zone password, held server-side only | `api/media/_lib/bunny.ts:71-83` | KEEP; fix the production key (MD-01) |
| URL returned | `${BUNNY_CDN_URL}/${path}`: **public, no expiry**. Stored verbatim in Mongo documents | `bunny.ts:82` | REBUILD for personal media (MD-02) |
| Deletion | **No delete function exists.** `bunny.ts` offers only `putObject` and `listAllImages` | `bunny.ts` (whole file) | REBUILD (MD-03) |
| Admin listing | Super-admin endpoint walks the whole `Forma/` tree and returns every image, grouped by client | `bunny.ts:128-158`, `api/_trpc/routers/media.ts:15-18`, `src/pages/admin/AdminMedia.tsx` | REDESIGN (MD-04) |
| Production status | Uploads fail: Bunny 401 on `BUNNY_API_KEY` (2026-10-03 release report); not re-verified | — | P0 (MD-01) |

## 3. Media map — detail by type

### 3.1 Exercise video

| Attribute | Starter (wger) | Coach upload (Bunny) | YouTube link |
|---|---|---|---|
| Source | Starter dataset; the importer takes the first wger video (`scripts/importWgerExercises.mjs:127`) | "Upload video" in the exercise form (`src/components/workout/ExerciseForm.tsx:61-74,144`) | Pasted into the free-text URL field (`ExerciseForm.tsx:137`) |
| Storage | wger.de (hotlink) | Bunny `Forma/{coachId}/exercises/` (`api/media/_lib/policy.ts:146-152`) | YouTube |
| Upload | — | Chunked proxy, ≤50 MB (`policy.ts:51`); coaches only (`policy.ts:149`) | — |
| URL | wger URL | Public CDN URL in `coachExercises.videoUrl`, copied into templates and plans (`src/lib/workoutPresets.ts:85-87`, `api/_trpc/routers/clientPlans.ts:34-42`) | Any string accepted (`api/coach-assets/_lib/schemas.ts:45`) |
| Read access | Public | Public: anyone with the URL | Public |
| Caching | No `Cache-Control`, no CORS, no service-worker rule | Bunny pull zone (configuration not verified); no service-worker rule | YouTube |
| Poster / thumbnail | None | None | YouTube's own |
| Compression | None: 35/46 HEVC at a median 22 Mbps, 13–88 MB (07 §2) | **None.** iPhone HEVC `.MOV` stored as-is (`policy.ts:67`) | YouTube adaptive |
| Playback | Client: bare `<video>` (`src/components/VideoPopup.tsx:62`). Coach: `src/components/workout/ExerciseView.tsx:37-49` | Same players | `<iframe>` (`VideoPopup.tsx:51-59`, `ExerciseView.tsx:27-36`) from `youtube.com`, not `youtube-nocookie.com` |
| Retry | No player error state (EX-03) | Upload: alert, retry by hand (`ExerciseForm.tsx:68-70`) | — |
| Offline | No | No | No |
| Deletion | n/a | **Never.** Replacing the URL orphans the file | n/a |

### 3.2 Exercise images and food images

| Attribute | Exercise images | Food images |
|---|---|---|
| Source | wger: 273 exercises, 374 files | **None exist** (strategy in 08 §11) |
| Storage / upload | Hotlinked. No coach upload UI: the policy allows images for the `exercise` category (`policy.ts:151`), but the form has no image field | — |
| URL / access | `imageUrl` and `images[]`; public | — |
| Caching | No CORS or cache headers. The service-worker image rule still targets the old host `raw.githubusercontent.com` (`vite.config.ts:145-155`) | — |
| Thumbnail / compression | None. Originals up to 10.6 MB; 50 files ≥1 MB; 38 MIME/byte mismatches (07 §2) | — |
| Rendered | Coach library sheet only (`ExerciseView.tsx:51`); **clients never see them** (BV-17, EX-13) | — |
| Offline / deletion | No / n/a | — |

### 3.3 Progress photos

| Attribute | Detail |
|---|---|
| Source | Client camera or gallery (`src/pages/ProgressPhotos.tsx`) |
| Storage | (1) **IndexedDB**: the original file, full resolution, EXIF intact, device only (`src/stores/photoStore.ts:70`). (2) Bunny `Forma/{uid}/{key}.webp` (`policy.ts:134-137`) |
| Upload | After the local save: best-effort downscale (1600 px WebP) → `uploadImage('progress')` (`photoStore.ts:28-38`). **Failures are swallowed** (`:85-90`) |
| URL | `cdnUrl` (the type itself says "Public Bunny CDN URL"), synced through the generic sync collection |
| Read access | In the app: owner, plus their coach via `photos.list` → `requireReadAccess` (`api/_trpc/routers/clientLogs.ts:66-74`); super-admin gallery (`AdminMedia.tsx`). On the CDN: **anyone with the URL** |
| Caching | Owner reads the local copy first, then the CDN (`photoStore.ts:103-105`); no service-worker rule |
| Thumbnail | None. The coach's 3-column grid loads 1600 px images (`src/pages/coach/CoachViewPhotos.tsx:38-39`) |
| Compression | WebP 1600 px, q 0.82; the canvas strips EXIF from the CDN copy |
| Rendered | `<img>`. The coach sees a "Not uploaded" tile when `cdnUrl` is missing (`CoachViewPhotos.tsx:40-44`), which is every new photo while production uploads fail (MD-01) |
| Retry | Silent retry pass on the next app load (`photoStore.ts:48-64`); the client is never told an upload failed |
| Offline | Owner: yes. Coach: no |
| Deletion | `remove()` deletes the local copy and the record, and writes a tombstone (`photoStore.ts:93-99`). **The CDN file is never deleted** |

### 3.4 Avatars, assessment photos, check-in photos

| Attribute | Avatars | Assessment photos | Check-in photos |
|---|---|---|---|
| Source | Any user: crop sheet → `src/components/AvatarPicker.tsx:32-46` | Assessment wizard (`src/pages/onboarding/AssessmentWizard.tsx:593-605`) | Weekly check-in form (`src/pages/CheckIn.tsx:201`, `src/components/PosePhotoPicker.tsx:20-35`) |
| Storage | `Forma/{uid}/avatar/` (`policy.ts:130-133`), ≤2 MB (`policy.ts:52`) | `Forma/{uid}/assessment/` (`policy.ts:138-141`) | `Forma/{uid}/checkin/{checkInId}/` (`policy.ts:142-145`) |
| Compression | 512 px WebP, q 0.85 | 1600 px WebP | 1600 px WebP |
| URL stored | `users.photoUrl`; the server accepts **any string** ≤2000 characters (`api/_trpc/routers/auth.ts:173`) | Assessment document | Check-in `progressPhotos` (`api/client/_lib/types.ts:214`); the server accepts **any string** per pose (`api/_trpc/routers/clientCheckIns.ts:112-135`) |
| Read access | Public | App: client and their coach (`src/components/AssessmentView.tsx:116-123`). CDN: anyone with the URL | App: client and their coach (`src/components/CheckInSummary.tsx`). CDN: anyone with the URL |
| Thumbnail | n/a | None | A 12×9 preview of the full image (`PosePhotoPicker.tsx:42`) |
| Retry | Inline error, retry by hand | Inline error, retry by hand | Inline error, retry by hand |
| Offline | No | No | No |
| Deletion | Remove clears the field; the old file stays | None | "Remove" only clears the field (`PosePhotoPicker.tsx:47-51`) |

### 3.5 Message attachments and voice notes

| Attribute | Images | Video and files | Voice notes |
|---|---|---|---|
| Source | Either party in the thread (`src/components/MessageThread.tsx:380-437`) | Same | Microphone via `src/hooks/useVoiceRecorder.ts` (format candidates at `:6`; 5-minute cap at `:27`) |
| Storage | `Forma/{clientId}/messages/` (`policy.ts:153-163`): **under the client's folder even when the coach sends** | Same | Same |
| Upload | Downscaled to WebP and **always labelled `image/webp`**, even when the downscale fell back to the original PNG or HEIC (`MessageThread.tsx:423-425`) | Raw; video ≤50 MB, file ≤25 MB; chunked above 4 MiB | Raw: Opus/WebM on Chrome, Android and Firefox; AAC/MP4 on Safari; ≤10 MB |
| URL | `messages.attachment {url, kind, name, size, mimeType}` | Same | Same |
| Read access | App: thread participants only (`authorizeThreadAccess`, `api/_trpc/routers/messages.ts:51,95,154,173`). CDN: **anyone with the URL** | Same | Same |
| Rendered | `<img>` (`MessageThread.tsx:1323`) | `<video controls>` with **no error state and no poster** (`:1328`); files as links | `<audio controls>`, no error state (`:1331`). Playback of Opus/WebM on older iOS Safari not verified |
| Thumbnail | None (full image in the bubble) | None | — |
| Retry | Pending → failed → retry or cancel (`MessageThread.tsx:395-470`): the best upload UX in the app | Same | Same |
| Offline | Not cached | Not cached | Not cached |
| Deletion | Soft delete hides body and attachment in the app (`api/messages/_data.ts:74-81`). **The URL stays in Mongo and the file stays on the CDN** | Same | Same |

## 4. Inconsistent pipelines

| Concern | Photos | Avatars | Message attachments | Coach exercise video | Starter exercise media | Food |
|---|---|---|---|---|---|---|
| Processing on upload | WebP 1600 | WebP 512 | Images WebP 1600; **video, audio and files raw** | **Raw** | Third-party originals (HEVC, PNGs up to 10.6 MB) | — |
| Thumbnails / posters | None | n/a | None | None | None | — |
| Failure UX | Progress: **silent** background retry. Check-in and assessment: inline error | Inline error | **Pending, failed, retry, cancel** | Alert | Player: none (EX-03) | — |
| Status visible to the user | No | Yes | Yes | Yes | — | — |
| Offline | Progress: owner only | No | No | No | No | — |
| Access model | Public CDN | Public CDN | Public CDN | Public CDN | Third-party public | — |
| Deletion | Never on the CDN | Never | Never | Never | n/a | — |

Additional mismatches:

- **Service-worker rules point at legacy origins.** They cache same-origin `/exercise_videos/` (the local-only seed) and `raw.githubusercontent.com` (the pre-September dataset), but neither wger.de nor Bunny (`vite.config.ts:98-162`).
- **Two video systems exist.** The legacy local system (`videoStore`, `CacheVideoStore`, `VideoPlayerSheet`, `public/exercise_videos/`) runs alongside the URL-based popup used by platform users (EX-21).
- **The same URL field means different things.** `videoUrl` can be a YouTube page, a Bunny file, a wger `.MOV` or any pasted string. Only YouTube and real files can ever play (EX-04).

## 5. Privacy and security

| # | Risk | Who is exposed | Evidence | Finding |
|---|---|---|---|---|
| 1 | **Personal media on a public pull zone with permanent links**: body photos (progress, assessment, check-in), message images, videos, documents and voice notes | Every client; coaches in threads | `bunny.ts:82`; `policy.ts:130-163`; the docs accept "public-but-unguessable… token auth would be a later hardening" (`docs/FORMA_PRE_PHASE2_BLOCKER_PASS.md:83`) | MD-02 |
| 2 | **Delete doesn't delete**: photos, messages, avatars, check-in photos, replaced exercise videos; transferred clients' media | Every user who deletes something; erasure requests | No delete function anywhere (`bunny.ts`); `photoStore.ts:93-99`; `api/messages/_data.ts:74-81` | MD-03 |
| 3 | **Links outlive relationships.** A former coach, or anyone a URL was forwarded to, keeps access after a transfer or release | Clients who change coach | URLs are permanent and stored in synced records (`clientLogs.ts:66-74`) | MD-02 |
| 4 | **The super-admin gallery browses every client's body photos**, grouped by name, with no purpose, audit trail or blur | All clients | `src/pages/admin/AdminMedia.tsx`; `bunny.ts:128-158` (also lists message and exercise images) | MD-04 |
| 5 | **Links are not guessable but are not secret.** 72 random bits per key, but the path also names the user id (`Forma/{uid}/…`), and links travel in documents, logs and browser history | All | `policy.ts:92-94,178` | MD-02 |
| 6 | **URL fields accept any string**: `photoUrl`, check-in photo URLs, `videoUrl`. A tracking pixel or external host can be planted in what the coach opens; a `javascript:` value reaches an `<a href>` in the coach's exercise view (the coach's own data, low exploitability) | Coaches | `auth.ts:173`, `clientCheckIns.ts:112-135`, `schemas.ts:45`, `ExerciseView.tsx:89-93` | MD-09 |
| 7 | **Third-party requests on every exercise view.** wger.de receives the client's IP (Referer is origin-only under `strict-origin-when-cross-origin` in `vercel.json`); YouTube embeds use `youtube.com` with cookies | Clients | 07 §2; `VideoPopup.tsx:51-59` | EX-18, MD-09 |
| 8 | **Original photos keep EXIF on the device.** IndexedDB holds the full original with EXIF (location possible); CDN copies are stripped by the canvas re-encode | Owner's device only | `photoStore.ts:70`, `src/lib/image.ts:6-27` | KEEP (note only) |
| 9 | **Upload authorisation is sound.** Server-derived paths, ids pinned, active account required, HTML, SVG and scripts refused, and the storage key never reaches the browser | — | `policy.ts:115-179`, `bunny.ts:1-16` | KEEP |

## 6. Element classification

| Element | What it is | Action | Why |
|---|---|---|---|
| `/api/media` upload function + `policy.ts` | Authenticated, path-deriving upload proxy | KEEP | Correct authorisation model; reuse it for private storage |
| Chunked upload protocol (XHR progress, session refresh) | Client transport | KEEP | Works around the 4.5 MB request limit with progress |
| Mongo chunk staging | 4 MiB BSON chunks with 1 h expiry, assembled in function memory | REDESIGN | Database write load and function memory per upload (MD-11) |
| Single public pull zone for all media | One zone serves catalog and personal media | REBUILD | Personal media needs private storage and signed links (MD-02) |
| Deletion | Absent | REBUILD | Media records plus purge jobs (MD-03) |
| Canvas WebP downscale (`image.ts`) | Client-side photo compression | KEEP | Cheap and effective; add derivative sizes (MD-06) |
| Video and audio handling | Stored raw | REBUILD | Transcoding to renditions plus posters (MD-05) |
| Super-admin media gallery | Browse every image by client | REDESIGN | Restrict to moderation with an audit trail (MD-04) |
| Progress-photo local-first store | Device copy plus best-effort upload | KEEP / REDESIGN | Keep the offline-first copy; show upload status and retry (MD-07) |
| Message upload queue (pending, failed, retry, cancel) | Per-message upload state | KEEP (and extend) | The model every other upload should use (MD-07) |
| Service-worker media rules | Rules for the legacy seed and the old dataset host | REDESIGN | Cache what clients actually use: posters, thumbnails, current-plan videos (MD-08) |
| Legacy local video system and `public/exercise_videos/` | Local-only offline videos | REMOVE | Dead for platform users; 131 MB per deploy (EX-21) |

---

## 7. Findings

### MD-01 — Production uploads fail (Bunny 401)
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** KEEP (fix the configuration; the pipeline itself is sound)
- **Who / where:** all roles · every upload: avatar; progress, assessment and check-in photos; message attachments; voice notes; coach exercise videos · production
- **Evidence:**
  - 2026-10-03 release report: Bunny 401 on `BUNNY_API_KEY`.
  - The only write path is `api/media/_lib/bunny.ts:71-83`; it fails as a 502 `failed` error.
  - Progress-photo failures are swallowed (`src/stores/photoStore.ts:85-90`), and the coach sees "Not uploaded" tiles (`src/pages/coach/CoachViewPhotos.tsx:40-44`).
- **Steps / scenario:** Any upload in production.
- **Expected vs actual:**
  - Expected: the file uploads.
  - Actual: messages show a failed bubble and pickers show an error. Progress photos stay on the phone with no error shown to the client.
- **Why it matters:** Attachments, photo check-ins and coach demo videos are broken for every production user, and coaches never receive progress photos.
- **Direction:** Rotate the zone password and set it in Vercel. Add a post-deploy upload smoke test that blocks the release. Show clients when an upload is still pending (MD-07).
- **Verified:** INFERRED (per the release report; production not contacted)

### MD-02 — Body photos and private messages are served from public, permanent URLs
- **Priority:** P0      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** client and coach · `/progress/photos`, `/assessment`, `/check-in/:id`, `/messages`, the coach photo and check-in views
- **Evidence:**
  - All categories share one pull zone under `Forma/{id}/…` (`api/media/_lib/policy.ts:130-163`).
  - The returned URL is `${BUNNY_CDN_URL}/${path}`, with no token or expiry (`bunny.ts:82`). The `ProgressPhoto` type itself says "Public Bunny CDN URL".
  - The project docs accept "public-but-unguessable" for now (`docs/FORMA_PRE_PHASE2_BLOCKER_PASS.md:83`).
  - Each key is the user id plus 72 random bits (`policy.ts:92-94,178`).
- **Steps / scenario:** Copy a progress photo's link from the coach view → open it in a private window, or after the client has moved to another coach.
- **Expected vs actual:**
  - Expected: only the client, their current coach and audited admins can open it, through links that expire.
  - Actual: anyone holding the link can open it, forever: forwarded links, logs, browser history, former coaches.
- **Why it matters:** Body photos and private conversations are the most sensitive data Forma holds.
- **Direction:** Move personal media to private storage, or use Bunny token authentication on a separate zone. Issue short-lived signed links after an access check. Keep the public CDN only for catalog and exercise media. Migrate existing objects and links.
- **Verified:** CODE-CONFIRMED

### MD-03 — Deleting media never deletes the file
- **Priority:** P0      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** all · deleting a progress photo, deleting a message, replacing or removing an avatar, removing a check-in photo, replacing an exercise video, client transfer or archive
- **Evidence:**
  - There is no delete call anywhere: `bunny.ts` exposes only `putObject` and `listAllImages`.
  - `photoStore.ts:93-99` removes the device copy, the record and a tombstone, not the CDN file.
  - Message soft delete hides content when read (`api/messages/_data.ts:74-81`), but the URL stays in Mongo and the file stays on the CDN.
  - "Remove" on a check-in photo only clears the field (`src/components/PosePhotoPicker.tsx:47-51`).
- **Expected vs actual:**
  - Expected: delete removes the file, or schedules it for purge.
  - Actual: the file stays reachable indefinitely.
- **Why it matters:** The delete button misleads users about their most private data, and erasure requests cannot be honoured.
- **Direction:** Keep a media record per file (owner, category, status). Run delete and purge jobs on user delete, message delete, replacement, account deletion and client transfer, per a written retention policy.
- **Verified:** CODE-CONFIRMED

### MD-04 — The super-admin gallery shows every client's body photos
- **Priority:** P1      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** super admin · `/admin/media` · desktop
- **Evidence:** `src/pages/admin/AdminMedia.tsx` (all images grouped by client name); `bunny.ts:128-158` walks the whole `Forma/` tree, including message and exercise images.
- **Expected vs actual:**
  - Expected: access to personal photos only for a stated purpose (support, moderation), audited.
  - Actual: browse-all access, with no audit trail and no blur.
- **Why it matters:** Broad internal access to sensitive images creates consent and compliance exposure.
- **Direction:** Remove the browse-all gallery, or limit it to moderation: blurred thumbnails, open on request, every view logged.
- **Verified:** CODE-CONFIRMED

### MD-05 — No video transcoding: uploads are stored exactly as recorded
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** coach (exercise demo upload in the library, builder and template editor); client and coach (message videos) · all viewports
- **Evidence:**
  - Uploads take any `video/*` (`src/components/workout/ExerciseForm.tsx:144`). The cap is 50 MB (`policy.ts:51`), and `video/quicktime` is stored as `.mov` (`policy.ts:67`).
  - There is no transcode or poster step (`api/media/[action].ts`). Playback is the original file (`src/components/MessageThread.tsx:1328`, `src/components/VideoPopup.tsx:62`).
  - An iPhone records HEVC `.MOV` by default, which fails on Edge, Firefox and Chromium without hardware HEVC (07 §11, EX-02).
- **Expected vs actual:**
  - Expected: every uploaded video plays on every client device, starts fast and shows a poster.
  - Actual: device-dependent black players and full-size downloads.
- **Why it matters:** Coach demo videos are the fix for the starter library's gaps, yet uploaded demos hit the same failure as the starter videos.
- **Direction:** Transcode on upload (e.g. Bunny Stream: H.264/HLS renditions plus a poster, with signed playback). Upload originals directly to storage with resumable uploads.
- **Verified:** CODE-CONFIRMED (codec behaviour BROWSER-VERIFIED in EX-02)

### MD-06 — No thumbnails or image derivatives anywhere
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** coach · client photos grid (`/coach/client/:id/view/photos`), message threads, library · 390
- **Evidence:**
  - The coach grid loads 1600 px originals (`CoachViewPhotos.tsx:38-39`), and message bubbles show the full image (`MessageThread.tsx:1323`).
  - Exercise images are originals up to 10.6 MB (EX-17).
  - No CDN image-transform parameters are used anywhere in `src/` or `api/`.
- **Expected vs actual:**
  - Expected: small thumbnails in grids and lists, full size on open.
  - Actual: full size everywhere.
- **Why it matters:** Slow grids and mobile data cost, which grow with every week of check-ins.
- **Direction:** Generate 2–3 sizes at upload, or use CDN image transforms (on private links for personal media), and render thumbnails in lists.
- **Verified:** CODE-CONFIRMED

### MD-07 — Upload and playback failures are handled differently on every surface
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client and coach · messages, progress photos, avatars, check-ins, assessment, exercise video
- **Evidence:**
  - Messages have pending, failed, retry and cancel (`MessageThread.tsx:395-470`).
  - Progress photos retry silently in the background (`photoStore.ts:48-64`).
  - Avatars, check-ins and assessment show a single inline error (`AvatarPicker.tsx:32-46`, `PosePhotoPicker.tsx:20-35`).
  - Video and audio in messages have no error state (`MessageThread.tsx:1328-1331`).
  - Voice notes are Opus/WebM on Chrome and Android (`src/hooks/useVoiceRecorder.ts:6`); playback on older iOS Safari is unverified.
- **Expected vs actual:**
  - Expected: one visible upload status with retry, and a clear "can't play" state.
  - Actual: silent failures in some places, alerts in others.
- **Why it matters:** Users can't tell whether the coach received their photo or voice note.
- **Direction:** One upload queue (status, retry, background completion) for every category. Players with error and fallback states. Record voice in a format every target plays, or transcode it.
- **Verified:** CODE-CONFIRMED (iOS voice-note playback INFERRED)

### MD-08 — No offline caching for any CDN media
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** client · training in a gym with poor signal · 390
- **Evidence:**
  - Runtime caching covers only `/exercise_videos/` (local-only seed), `raw.githubusercontent.com` (the old dataset host) and `/data/` (`vite.config.ts:98-162`).
  - There is no rule for Bunny or wger.de, and wger sends no CORS headers, so its files can't be cached (07 §2).
- **Expected vs actual:**
  - Expected: posters, thumbnails and the current plan's demos available offline.
  - Actual: nothing; every media view needs the network.
- **Why it matters:** The workout itself works offline (BV-05), but its demos don't.
- **Direction:** Cache catalog thumbnails and posters, and the current plan's videos, within a size budget, once media is self-hosted with CORS (EX-18).
- **Verified:** CODE-CONFIRMED

### MD-09 — Media URL fields accept any string
- **Priority:** P2      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** coach and client · profile photo, check-in photos, exercise video URL
- **Evidence:**
  - `photoUrl` accepts any string ≤2000 characters (`api/_trpc/routers/auth.ts:173`).
  - Check-in photos accept any string per pose (`api/_trpc/routers/clientCheckIns.ts:112-135`).
  - `videoUrl` accepts any string (`api/coach-assets/_lib/schemas.ts:45`) and is rendered as an `<a href>` (`src/components/workout/ExerciseView.tsx:89-93`).
  - The YouTube matcher accepts any URL containing `v=` plus 11 characters (`src/services/video/VideoStore.ts:26-29`). Embeds use `youtube.com`, which sets cookies.
- **Expected vs actual:**
  - Expected: only Forma media references, or validated embed providers.
  - Actual: arbitrary hosts, including tracking pixels, and `javascript:` values in the coach's own view.
- **Why it matters:** A low-severity injection surface, and part of why links that can never play are accepted (EX-04).
- **Direction:** Store media ids, not raw URLs. Validate embed providers on the server. Use privacy-enhanced embeds.
- **Verified:** CODE-CONFIRMED

### MD-10 — Message images can be mislabelled, and HEIC isn't handled
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** client and coach · `/messages` (image attachments)
- **Evidence:**
  - The downscaled blob is always wrapped as `image/webp` (`MessageThread.tsx:423-425`), even when `downscaleImage` fell back to the original file (`src/lib/image.ts:22-25`). Examples: PNG output from browsers that can't encode WebP, or HEIC from desktop or Android.
  - HEIC is not in the photo allow-list (`src/services/platform/mediaApi.ts:58`).
- **Expected vs actual:**
  - Expected: the stored type matches the bytes, and HEIC is converted.
  - Actual: `.webp` files that may contain PNG or HEIC.
- **Why it matters:** HEIC labelled as WebP won't render on Android or Chrome, and the metadata misleads any future processing.
- **Direction:** Label by actual output type, and convert or reject HEIC before upload.
- **Verified:** CODE-CONFIRMED (device behaviour INFERRED)

### MD-11 — Uploads are staged as binary chunks in MongoDB
- **Priority:** P3      **Effort:** M      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** server · `/api/media/init`, `/api/media/chunk`, `/api/media/finalize`
- **Evidence:** 4 MiB chunks are stored as BSON Binary in `mediaUploadChunks` with 1 h expiry (`api/media/_lib/staging.ts:18-68`), then assembled in function memory and PUT once (`api/media/[action].ts:147-181`). Up to 50 MB per upload passes through the database.
- **Expected vs actual:**
  - Expected: large files go straight to storage.
  - Actual: database writes and function memory proportional to file size.
- **Why it matters:** Cost and latency at scale; acceptable at today's volume.
- **Direction:** Resumable uploads directly to storage (e.g. Bunny Stream's resumable uploads, or presigned uploads on an S3-compatible private zone) as part of MD-02 and MD-05.
- **Verified:** CODE-CONFIRMED
