# 11 — PWA, cache, offline and sync audit

## Bottom line

- **Offline is broken for signed-in clients (P0, PWA-01).** Any failed session check signs the client out. In HEAD, reopening or returning to the installed app offline crashes it to "Something went wrong" (BV-03/04). In RC2 it shows a login form that can't work offline. The workout data on the phone survives (BV-05) but can't be reached.
- **Silent data loss comes from the identity/sync layer, not from offline use (P0):** account switching wipes or crosses data (PWA-02/03/05); coach/admin run the client sync engine (PWA-04); day-level records overwrite each other across devices (PWA-06); live cardio and rest timers only exist in memory (PWA-07). Signing out while offline doesn't sign out (PWA-08).
- **"The new version doesn't appear" is how the update flow is built (PWA-09/10).** The old build stays for the whole foreground session and swaps silently on the first backgrounding (BV-06a). There is no update UI (BV-06b). First-visit tabs never swap (BV-06d).
- **"Stale data" (PWA-11/15/18):** 60 s React Query staleness with no persistence; client data not mirrored for offline; a "Synced" chip that stays green while changes are pending (BV-05).
- **Phase B:** keep the session alive offline; a database per user with an outbox (operation IDs, server acks, conflict checks) and finer-grained records; apply updates at a safe point; one quiet sync status instead of three badges.

---

## Scope and evidence

- **Code:** repo HEAD `e7663ab` on `development` (audit date 2026-10-04). Production (www.useforma.fit) runs RC2 `cf3a5d9`, per project notes; this was not re-verified. Anything that exists only in HEAD is marked **(HEAD only)**.
- **Browser evidence** (BV-xx in `DOC_SPEC`) came from a production build served with headers equivalent to `vercel.json`, with the service worker active and the API proxied to an isolated stack (in-memory Mongo, local Bunny stand-in). Chrome 153 at 390×844. Nothing touched production.
- **Verified labels:**
  - BROWSER-VERIFIED: reproduced in that build.
  - CODE-CONFIRMED: traced end-to-end in code.
  - INFERRED: needs a device or production check.
- **Line numbers** refer to HEAD. Library versions: vite-plugin-pwa 0.21.2, workbox 7.4.1, @tanstack/react-query 5.101.0, @trpc/client 11.18.0, localforage 1.10.0.
- **Owned by other docs** (cross-referenced, not re-counted here):
  - coach editor wipes the plan after a failed load: coach doc, BV-11
  - "Reset all data" deletes server history: client doc
  - media files never deleted from Bunny: media doc
  - performance side, in 13_PERFORMANCE_NETWORK_AUDIT (BV-25, BV-29): boot waterfall (PF-01), missing timeouts (PF-02), login chunk not precached (PF-03), coach/admin sync cost (PF-04), resume storm (PF-09), token refresh race (PF-10), sync pass cost (PF-16), precache bloat (PF-18), coach screens starting empty (PF-21), SW check every minute (PF-27)
  - messenger offline send and drafts: 09_MESSENGER_AUDIT (MS-07)
  - false empty states while offline: client and coach docs

---

## §20 Cache audit

### 20.1 Every cache layer

| Layer | What / why | TTL | Invalidation | Account isolation | On logout | On focus | On reconnect | On deploy |
|---|---|---|---|---|---|---|---|---|
| **Browser HTTP cache** (`vercel.json:5-35`) | Everything `no-cache, no-store` (`:13`); `/assets/*` `immutable` 1 y (`:28-31`); `sw.js`, `workbox-*.js` no-store (`:16-23`); manifest `no-cache` (`:24-27`); `/exercise_videos/*` 1 d (`:32-35`) | as listed | Hashed names | n/a | Kept | n/a | n/a | New hashes. A missing old asset is answered with **index.html (200) + the immutable header** via the SPA rewrite (`vercel.json:3`) — PWA-21 |
| **Vercel edge** | Static files of the current deployment | per deploy | Purged on deploy | n/a | n/a | n/a | n/a | Old chunks disappear immediately |
| **Bunny CDN** (media) | Avatars, progress/check-in/message files, exercise videos; random file names | Effectively immutable | **Never deleted** (media doc) | Unguessable URL only | Kept | n/a | n/a | n/a |
| **Service-worker precache** | App shell: 159 entries, 2.39 MB raw (§21.3). **Every navigation is answered from here** (`NavigationRoute(createHandlerBoundToURL('/index.html'))`, `vite.config.ts:79-82`) | Until the next SW activates | The new SW's activate step deletes entries not in its manifest. `cleanupOutdatedCaches` (`:97`) only removes caches from older Workbox versions. | Shared (no user data) | Kept | n/a | n/a | **The reason the old build stays visible** (§20.2) |
| **Service-worker runtime caches** (`vite.config.ts:98-163`) | `landing-images`, `website-images` (stale-while-revalidate, 30 d); `exercise-videos` (cache-first, 180 d, legacy seed videos only); Google Fonts CSS (SWR, **no expiry**) and font files (cache-first, 1 y); `exercise-images` from raw.githubusercontent (cache-first, 180 d); `app-data` `/data/*.json` (SWR, 30 d; the 1 MB exercise-library.json) | as listed | Expiry only. Cache-first never revalidates. | Shared | Kept | n/a | n/a | Survives deploys |
| **App Cache Storage** | None. `CacheVideoStore` actually stores in IndexedDB (`CacheVideoStore.ts:47-48`). Only "Update the app" touches `caches` (deletes all; `Settings.tsx:241-254`). | — | — | — | — | — | — | — |
| **React Query** (memory) | Coach/admin server state, plus the client's server-authored widgets. 137 `useQuery`, 97 `useMutation`, 119 `invalidateQueries`, 0 `setQueryData`/`placeholderData` | `staleTime` 60 s, `gcTime` 10 min, `retry` 1 (`queryClient.ts:8-27`); overrides 0–300 s | Mutation `onSuccess` invalidation; refetch on return only if stale | uid in most keys | **Cleared** (`sessionStore.ts:143`) | Refetches stale queries on `visibilitychange` | `refetchOnReconnect`. `onlineManager` starts online and only flips on browser events, so a cold start offline errors instead of pausing. | **Lost on every reload**, including update reloads. Skeletons everywhere. |
| **Pollers** (memory) | Thread 5 s, badges 20 s (`messagesApi.ts:20-32`); notifications ~25 s; SyncEngine 120 s (`cloudStore.ts:119-121`); SW check 60 s (`main.tsx:40`); several 60 s/15 s `refetchInterval`s | — | — | per uid | Unmounted | Hidden tabs skip ticks | Sync forced on `online` | — |
| **Zustand stores** (memory) | Workout (`active` session), nutrition, cardio (**live timer**), timer (**rest timer**), measurements, habits, photos, settings, day, session, cloud | Until reload | `load()` re-reads IndexedDB at boot, on every client focus (`ClientApp.tsx:86-123`) and after a pull (`cloudStore.ts:47-83`) | **Not reset on sign-out** (PWA-14) | Kept in memory | Reloaded | After a pull | Lost on reload |
| **localStorage** | `forma.sidebarCollapsed`; `forma.micPrimed`; `forma:active:<date>` (one per day, forever, `PresenceTracker.tsx:16-19`) | Forever | Never | Not user-scoped | Kept | — | — | Kept |
| **sessionStorage** | Chunk-reload guard (`ErrorBoundary.tsx:3,34-37`); dismissed banners (`BannerHost.tsx:16-31`) | Tab | — | Not user-scoped | Kept | — | — | — |
| **IndexedDB `gym-tracker`** (one database per *device*) | Stores: `profile`, `settings`, `workoutPlans`, `workoutLogs`, `mealPlans`, `nutritionLogs`, `cardioLogs`, `weightLogs`, `measurementLogs`, `videoAssets`, `progressPhotos`, `dailyChecklists`, `reminders` (`LocalDataSource.ts:23-35`); `blobs` (full-size photo originals, `blobStore.ts:8-12`); `deletions` (tombstones, `tombstones.ts:16`); `meta` (seed version, `localOwnerUid`, `pullCursorV3:<uid>:<coll>`, coach editor drafts keyed by clientId, assessment draft keyed by uid) | Forever (`navigator.storage.persist()` requested, `App.tsx:92`) | `dirty` flag cleared after push; pulls overwrite by last-write-wins | **Device-wide.** Wiped when a *different client* signs in (`clientSync.ts:26-50`), but **`blobs`, `deletions` and the V3 cursors are not cleared**, and coach/admin never scope it | **Nothing cleared** | Re-read on every focus | Synced on `online` | Survives |
| **Refresh cookie `forma_rt`** | httpOnly, SameSite=Strict, Path=/, 30 d, rotated on every use with **no grace window** (`tokens.ts:7-9,105-123`) | 30 d | Rotation | Per browser profile | Cleared **only if `auth.logout` reaches the server** (`auth.ts:145-149`) — PWA-08 | — | — | — |
| **Access token** (memory) | JWT, 15 min (`tokens.ts:7`, `platformApi.ts:18-26`) | 15 min | 401 → per-request refresh, no single-flight (`trpc.ts:26-28`) | — | Nulled | — | — | Lost on reload |

### 20.2 Reproduce "the old version remains visible after a deploy"

**BROWSER-VERIFIED (BV-06a):** build A was open, the app was closed, B was deployed, and the app was reopened. It showed **build A** at reopen, at +8 s (B now *waiting*), and at +73 s (the 60 s poll had fired; still A). It switched to **build B only after the first backgrounding**. No "update available" UI appeared at any point (BV-06b).

Steps for the team (local production build, or a preview deployment — never production):
1. Build A, serve it with the `vercel.json` headers, and open it until the SW controls the page (Application ▸ Service Workers shows "activated and running").
2. Close the tab or app. Build and deploy B with a visible marker.
3. Reopen. You see **A**: the precached `index.html` is served by the NavigationRoute, and the `no-store` header on HTML never takes effect.
4. Within seconds the Application panel shows B "waiting to activate". It stays waiting while the page is visible (`skipWaiting:false`, `vite.config.ts:96`). `onNeedRefresh` defers to "hidden" (`main.tsx:23-33`).
5. Press F5. Still **A**: a waiting worker never activates while a page it would replace is still open, and on reload `onNeedRefresh` defers again.
6. Switch tab or app (hidden). `updateSW(true)` sends SKIP_WAITING, B activates and claims the page, and the page reloads in the background. Return: **B**.

So in practice:
- every user sees the old build for the rest of the session after a deploy;
- installed phone users usually see the new build on their *next* session;
- a coach tab that stays visible (dual monitor) can run old JS for days.

### 20.3 Why data looks stale

| Cause | Evidence | Who notices |
|---|---|---|
| A return to the tab refetches only queries older than 60 s | `queryClient.ts:14,24`; earlier E2E E-A-3/E-B-4/E-D-6 | Coach sees another role's change up to 60 s late, or only on the next poll |
| No persisted React Query cache | `queryClient.ts` (no persister) | Every coach cold start or reload, including update reloads, starts from skeletons (PF-21) |
| Client server-authored data isn't mirrored to IndexedDB (cardio plan, coach notes, check-ins, messages, subscription) | `Cardio.tsx:113-117`, `ClientNotesProvider.tsx:16`, `CheckIn.tsx:46` | Offline client sees blanks or "not found" (PWA-15) |
| The "Synced" chip stays green while changes are pending or the device is offline | `cloudStore.ts:30-36,142`; BV-05 | Client believes data is backed up (PWA-11) |
| Long cache-first runtime caches | `vite.config.ts:121-155` | A replaced seed video or exercise image with the same name stays stale up to 180 d (PWA-21) |
| Old JS keeps running after a deploy | §20.2 | Anyone with a long-lived tab |

---

## §21 PWA audit

### 21.1 Manifest and installability

| Item | Current (`vite.config.ts:40-71`, `dist/manifest.webmanifest`, `index.html`) | Assessment |
|---|---|---|
| Install criteria | HTTPS, manifest with 192/512 icons, SW with a fetch handler | Installable |
| `name`/`short_name`/`theme_color`/`background_color` | Forma / Forma / `#0B0C0F` / `#0B0C0F` | OK |
| `display` / `orientation` | `standalone` / **`portrait`** | Portrait lock also applies to coaches who install on Android tablets (PWA-23) |
| `start_url` / `scope` | `/` / `/` | An anonymous standalone user is redirected to `/login` (`AnonymousApp.tsx:55`), which in **HEAD** is the non-precached website chunk (PWA-01) |
| Icons | 192, 512 and "maskable" 512 | **`icon-maskable-512.png` is byte-identical to `icon-512.png`** (same md5 `b2f72ccb…`): a light tile with wide margins, not a full-bleed maskable icon, so it shows as a small tile inside the launcher shape (PWA-23) |
| Screenshots | Two 1536×1024 marketing images (`landing_page/*`), one marked `wide`; not precached | A landscape marketing image is the "mobile" screenshot (PWA-23) |
| Shortcuts | "Dashboard" → `/coach`, "Today" → `/workout`, shown to **every** role | A client sees a coach shortcut and vice versa; each lands on the other app's catch-all redirect (PWA-23) |
| iOS | `apple-mobile-web-app-capable`, black-translucent status bar, `apple-touch-icon` (`index.html:15-19`); no startup images | iOS home-screen apps keep storage and cookies separate from Safari, so a user who started in Safari must sign in again and any unsynced Safari data stays behind (INFERRED) |

### 21.2 Service-worker configuration

`registerType:'prompt'`, `injectRegister:false` (registered manually in `main.tsx:17-45`), `clientsClaim:true`, `skipWaiting:false`, `cleanupOutdatedCaches:true`, `navigateFallback:'/index.html'` with denylist `/api/` (`vite.config.ts:37-38,79-97`).

The generated `dist/sw.js` contains:
- a `message` listener that calls `skipWaiting()` on `{type:'SKIP_WAITING'}`
- `clientsClaim()`
- `precacheAndRoute([...159])`
- `cleanupOutdatedCaches()`
- a NavigationRoute bound to `/index.html`
- 7 runtime routes

**No route covers `/api/*`.** tRPC goes straight to the network.

### 21.3 Precache size and composition (`dist/sw.js`, parsed)

| Group | Bytes (raw) | Notes |
|---|---|---|
| Total | **2,509,461 (2.39 MB), 159 entries** | ≈1.2 MB transferred compressed (PF-18) |
| JS | 1,571,813 | Entry `index-CIivkq9d.js` 475,120. Role apps, lazy pages, and `ar`/`ar-eg` locales (220 KB, both shipped to everyone) |
| PNG | 740,670 | **`/experience/forma-mark.png` 225 KB, `forma-lockup.png` 213 KB, `forma-wordmark.png` 149 KB — used only by the marketing film**; icons (192/512 ×2) |
| CSS | 160,373 | `index-*.css` 133,623; **`Experience-*.css` 26,750 (marketing, precached because `globIgnores` only excludes `Experience-*.js`)** |
| Other | 36,605 | html, svg, webp logos, manifest |
| **Excluded** | `SitePages-*.js` 233,368 + `.css` 11,355; `Experience-*.js` 569,123; `/landing_page/**`; `/website/**` (`vite.config.ts:78`) | **(HEAD only)** `SitePages` now contains the `/login` form (`SitePages.tsx:81-90`), so the installed app's login can't load offline (PWA-01; PF-03) |

### 21.4 Runtime caching

| Route | Strategy | Expiry | Assessment |
|---|---|---|---|
| `/landing_page/*`, `/website/*` | Stale-while-revalidate | 12 entries, 30 d | OK (web visitors) |
| `/exercise_videos/*` | Cache-first + range requests | 40 entries, 180 d | Serves only legacy seed videos; platform clients never get these assets (`bootstrap.ts:69`). Effectively dead. |
| `fonts.googleapis.com` | SWR | **none** | Unbounded (small) |
| `fonts.gstatic.com` | Cache-first | 20 entries, 1 y | OK |
| `raw.githubusercontent.com` (exercise images) | Cache-first | 300 entries, 180 d | Fine for content-addressed paths. Images are rarely shown to clients anyway (BV-17). |
| `/data/*` | SWR | 12 entries, 30 d | `/data/*.json` is `no-store` at HTTP level, so each revalidation re-downloads the 1 MB library JSON (PWA-21) |
| Bunny media, YouTube, `/api/*` | **none** | — | Coach videos, message media and avatars are online-only |

### 21.5 Update lifecycle (as built)

1. **Detect.** The browser soft-updates on navigation (sw.js is no-store), and `registration.update()` runs on `visible` and every 60 s **only if `navigator.onLine`** (`main.tsx:35-44`). There is no app-driven check at launch.
2. **Download.** The new SW precaches in the background while the old build is in use.
3. **Wait.** `skipWaiting:false` keeps the new SW in *waiting*.
4. **Prompt.** vite-plugin-pwa (prompt mode) calls `onNeedRefresh`. In the same step it installs a `controlling` listener that calls `window.location.reload()` **only when `event.isUpdate`** — that is, when the tab already had a controller when it registered (workbox-window `_isUpdate`).
5. **Defer.** `main.tsx:23-33`: if visible, wait for the next `hidden`; if hidden, activate now.
6. **Activate.** `updateSW(true)` → `SKIP_WAITING` → activate (old precache entries deleted) → `clientsClaim()` → `controllerchange` in every open tab.
7. **Reload.**

| Tab type | What happens on `controllerchange` | Verified |
|---|---|---|
| Controlled when it loaded (every normal returning-user tab) | Reloads immediately — **including a visible tab**, when a *different* tab's `hidden` triggered the activation | Single tab reloads on its own backgrounding: BV-06c. Multi-tab visible reload: CODE-CONFIRMED (`register.js` `showSkipWaitingPrompt`; `workbox-window.dev.mjs:445-462`). |
| **First-visit tab** (no controller when it loaded) | **No reload.** The new SW takes control and the page keeps running the old JS. The next lazy chunk is gone from the precache and the server, and the server answers index.html. | BV-06d |

> **Correction to my earlier notes.** I had said "every other tab reloads instantly". Only tabs that were SW-controlled when they loaded reload. First-visit tabs never reload (BV-06d). Both behaviours come from the same `isUpdate` gate, and both are unsafe (PWA-10).

**Recovery net.** The `ErrorBoundary` reloads once on stale *JS* chunk errors (`ErrorBoundary.tsx:8-11,33-45`). Its pattern does **not** match Vite's *CSS* preload failure ("Unable to preload CSS for …", BV-03), and no `vite:preloadError` handler exists (grep `src`: 0). A missing CSS chunk therefore ends on "Something went wrong" with no recovery.

**Manual escape.** Client Settings › Tools › "Update the app" unregisters every SW and deletes **all** Cache Storage (`Settings.tsx:241-254`). Its copy says downloaded videos are kept (`en.json:492`). Coaches and admins have no equivalent. The client doc marks this tool for removal (BV-18).

### 21.6 Offline fallback

| Situation | Result | Verified |
|---|---|---|
| Signed-in client, app already open, goes offline and stays in the foreground | Works from IndexedDB; global offline banner | CODE-CONFIRMED; offline workout logging in BV-05 |
| Same client, app goes to background and returns while offline | `refreshAccount` fails → anonymous → **HEAD: crash "Something went wrong"**; RC2: login form | **BV-04** |
| Installed app cold-started offline | Shell from precache → `auth.refresh` fails → anonymous → **HEAD: crash** (CSS preload of `SitePages`); RC2: login form | **BV-03**, `evidence/client-offline-reopen-crash.png` |
| Signed-out web visitor offline | Website chunk not precached → dark fallback or crash | CODE-CONFIRMED |
| Coach/admin offline | Cached queries shown until gcTime (10 min); otherwise empty or error states; a few actions disabled with `useOnlineStatus` (10 screens: 6 admin, 3 coach, the transfer wizard) | CODE-CONFIRMED (coach doc covers the false empty states) |

### 21.7 API behaviour offline

- tRPC is never cached by the SW. Requests fail fast offline, or hang on a connection that is up but passes no data. **No request has a timeout** (`trpc.ts:16-30`, `platformApi.ts:38-43`).
- React Query: if the browser fired `offline` during the session, queries and mutations **pause**. Paused queries report `isLoading=false`, so screens fall to empty states (coach and client docs). Paused mutations show "Saving…" until the network returns and are discarded on reload. On a cold start offline, `onlineManager` still says online, so queries error after one retry.
- Custom pollers swallow errors and keep the last state (`messagesApi.ts:105-108`).
- The SyncEngine returns early when `!navigator.onLine` (`SyncEngine.ts:183`) **without changing the status** (`cloudStore.ts:142`), so the chip still says "Synced".

### 21.8 Media offline

| Media | Offline | Evidence |
|---|---|---|
| Own progress photos on the device that took them | Yes: the IndexedDB blob is shown first (`photoStore.ts:101-105`) | CODE-CONFIRMED |
| Progress photos on another device, or in the coach's view | No: Bunny URL, not cached | CODE-CONFIRMED |
| Coach exercise videos (Bunny/YouTube URLs in the plan) | **No**: streamed through `VideoPopup`. Offline it shows a black player with no message (`VideoPopup.tsx:30-60`, `WorkoutSession.tsx:191-197`) | CODE-CONFIRMED; the same dead-player UX is browser-verified online for unsupported links (BV-07) |
| Exercise images (raw.githubusercontent) | Yes, after first view (cache-first) | CODE-CONFIRMED |
| Message attachments, voice notes, avatars | No (Bunny). Attach and record buttons are **hidden** offline because `useUploadConfigured()` is false (`mediaApi.ts:81-105`, `MessageThread.tsx:863,875`) | CODE-CONFIRMED |
| Uploads (all kinds) | Online-only, no queue, except progress photos (blob kept, upload retried on the next `usePhotos.load()`). In production all uploads currently fail (Bunny 401, per the release report). | CODE-CONFIRMED |

### 21.9 Auth expiry while offline

- The access token lasts 15 minutes and lives in memory. The refresh token lasts 30 days in an httpOnly cookie and is **rotated on every use with no grace window** (`tokens.ts:7-8,105-123`).
- **Offline, the session ends** on the first resume or cold start (PWA-01). Nothing in the anonymous state retries on `online`, and the crashed page stays crashed (BV-05: nothing reached the server for 45 s after reconnect).
- **After reconnect,** the first 401 triggers a refresh. Requests that 401 at the same time each trigger their own refresh. The losers get 401, and if the loser is `auth.me` the user is signed out (PWA-01).
- **Queued local writes survive** (dirty flag). They sync after the *same* user signs back in. If a *different* user signs in, they are wiped (PWA-02).
- **Refresh token expired** (30 days unused) or revoked (password change): the user must sign in again. Local data is kept if it's the same user.

### 21.10 Background and resume

On `visibilitychange → visible`, all of the following fire at once, with no coordination:
- SW update check (`main.tsx:41-43`)
- `refreshAccount` → `auth.me` (`App.tsx:63-70`)
- SyncEngine (60 s throttle, `cloudStore.ts:113-115`)
- ClientGate refresh: scope check + 4 plan reads + reload of 6 stores from IndexedDB (`ClientApp.tsx:115-123`; also fires on `focus`)
- React Query refetch of stale queries
- day rollover (`dayStore.ts:27-36`)
- presence ping
- wake-lock re-acquire

BV-29 measured about 11 procedures per resume (PF-09 covers the cost).

On `hidden`, the only handler is the SW update activation, which **reloads the app in the background** (BV-06c).

Consequences:
- Offline resume crashes (BV-04).
- An update reload destroys in-memory state: the rest timer is gone (BV-06c); the live cardio timer, composer and check-in form are lost the same way (PWA-07, PWA-12).
- `useWorkout.load()` on each resume re-points the active log to *today* (`workoutStore.ts:131,135-142`). A session being edited for another day, or one that crosses midnight, is detached until `WorkoutSession` re-selects it (`WorkoutSession.tsx:119-129`). P3, noted under PWA-07.

---

## §22 Offline capability matrix

Class: MUST WORK OFFLINE · READ-ONLY OFFLINE · QUEUE FOR SYNC · ONLINE REQUIRED · NOT WORTH SUPPORTING OFFLINE.

`*` = works only until the next resume or cold start offline, which ends the session (PWA-01, BV-03/04).

| Operation | Current behaviour (evidence) | Works offline today | Recommended class | Finding |
|---|---|---|---|---|
| *Stay signed in* | Any `auth.me`/`auth.refresh` failure sets anonymous (`App.tsx:63-70`, `sessionStore.ts:80-91,147-166`) | **No.** Crash (HEAD) or login (RC2). BV-03/04 | MUST WORK OFFLINE | PWA-01 |
| View today's workout | Plan mirrored to IndexedDB (`clientSync.ts:88-95`); logs local | Yes* | MUST WORK OFFLINE | PWA-01 |
| Log workout set | Memory first, IndexedDB 300 ms later (`workoutStore.ts:99-101,213-228`); `dirty` → SyncEngine | Queued* | MUST WORK OFFLINE | PWA-06, PWA-07 |
| Complete workout | `finishSession` awaits the IndexedDB write (`workoutStore.ts:367-400`); synced ~1.4 s after the next online start (BV-05) | Queued* (BV-05) | MUST WORK OFFLINE | PWA-11 (no pending state) |
| View nutrition plan | Meal plan + targets mirrored (`clientSync.ts:97-121`) | Read-only* | READ-ONLY OFFLINE | — |
| Log meal/food | UI first, then `await put`, no catch (`nutritionStore.ts:123-292`); food search online-only | Queued* (search fails) | QUEUE FOR SYNC (search ONLINE REQUIRED with a clear message) | PWA-06, PWA-07 |
| View progress history | Weights, measurements, workouts local; check-in history online-only (`CheckInHistory.tsx:29`) | Partial* | READ-ONLY OFFLINE | PWA-05, PWA-15 |
| Add measurement | `put`, then UI; id = date (`measurementStore.ts:23-43`) | Queued* | QUEUE FOR SYNC | PWA-06 |
| Add progress photo | Original blob + record to IndexedDB; CDN upload best-effort, retried on the next `load()` (`photoStore.ts:44-91`) | Queued* (upload deferred) | QUEUE FOR SYNC | PWA-12 |
| Create/submit check-in | Online `useQuery`/`useMutation`; form in React state (`CheckIn.tsx:46-59`); offline read shows "not found" | **Fails** (misleading) | QUEUE FOR SYNC (persisted draft + queued submit) | PWA-12, PWA-15 |
| Send text message | Online only; failed bubble + Retry held in component state (`MessageThread.tsx:150,395-461`); composer cleared on send (`:480-481`) | **Fails loudly**, then lost on navigation or reload | QUEUE FOR SYNC (server already dedupes by `clientMsgId`) | PWA-12 |
| Send photo | Attach hidden offline (`MessageThread.tsx:863`) | **Fails** (control disappears) | QUEUE FOR SYNC | PWA-12 |
| Send voice note | Record hidden offline (`:875`); recording kept in memory | **Fails** | QUEUE FOR SYNC | PWA-12 |
| Read messages | Polling only, no local cache; failed first load shows error + Retry (`MessageThread.tsx:704-710`) | **Fails** (cold) / stale (warm) | READ-ONLY OFFLINE (last N per thread) | PWA-15 |
| Coach: view clients | React Query memory cache (10 min); Add disabled offline (`CoachClients.tsx:64,230`) | Session cache only | READ-ONLY OFFLINE (persisted, with "as of" time) | PWA-18 |
| Coach: edit workout plan | Draft autosaved to IndexedDB; save pauses offline; **opening the editor after a failed or paused load shows an empty plan, and Save overwrites the real one** (coach doc, BV-11) | **Fails, destructively** | ONLINE REQUIRED (editor only after an authoritative load; keep the local draft) | coach doc (BV-11) |
| Coach: create nutrition plan | Same as above (`CoachNutritionEditor.tsx:96-118`) | as above | ONLINE REQUIRED | coach doc |
| Subscription/payment actions | Online; disabled offline in `CoachSubscriptionPanel`/`CoachSubscriptionPlans` | Disabled | ONLINE REQUIRED | — |
| Admin/commercial actions | Online; `useOnlineStatus` gating in 6 admin views; other mutations pause silently | Disabled or paused | ONLINE REQUIRED | PWA-18 |
| Login / session refresh offline | Login needs the network (correct); an existing session **ends** on a failed refresh | **Fails** | Login: ONLINE REQUIRED. Existing session: MUST WORK OFFLINE | PWA-01 |
| App cold start offline | HEAD: crash (BV-03); RC2: login form | **Fails** | Client: MUST WORK OFFLINE. Coach: READ-ONLY OFFLINE | PWA-01 |
| *Watch exercise video (coach URL)* | Streams from Bunny/YouTube; black player offline | Fails silently | READ-ONLY OFFLINE for the active plan (pre-cache), or NOT WORTH SUPPORTING with a clear message | PWA-15 |
| *Rest timer / live cardio timer* | Memory only (`timerStore.ts:14,45-75`; `cardioStore.ts:14,43-49`) | Yes, until a reload or OS kill, then **lost** | MUST WORK OFFLINE (persisted) | PWA-07 |
| *Delete a log or photo* | Local remove + tombstone | Queued* | QUEUE FOR SYNC | PWA-03 |
| *Profile/settings/language* | Local singleton, synced last-write-wins | Queued* | QUEUE FOR SYNC | PWA-19 |

---

## §23 Offline write safety

### 23.1 Per write path

| Write path | Durable before "saved"? | Client ID | Retry | Server dedup | Ack | Conflict detection | Recovery |
|---|---|---|---|---|---|---|---|
| Workout sets (`workoutStore.ts:213-365`) | **No:** UI first, IndexedDB after 300 ms; no flush on hide | **Date** (one log per day, `:85-96`) | SyncEngine: 120 s visible, focus (60 s throttle), `online` (`cloudStore.ts:112-121`); no backoff | Upsert by `uid__collection__id` (`sync.ts:28-41`) | Only the `dirty` flag, cleared by compare-and-set on `updatedAt` (`SyncEngine.ts:91-99`) | Client: last-write-wins on the **device clock** (`:110`). **Server: none — unconditional overwrite.** | `dirty` survives restarts. **Not** an account switch (PWA-02) or a coach session (PWA-04). |
| Finish workout | Yes (awaited, `:367-400`) | date | same | same | same | same | No catch around save |
| Discard workout / delete cardio / delete photo | Yes (remove + tombstone) | date / uid | same | Deletion marker upsert, then **unconditional delete** (`sync.ts:61-77`) | Tombstone cleared after flush | Client: edit wins over delete (`SyncEngine.ts:157-170`). **Server: delete always wins.** | Tombstone **leaks to the next account** (PWA-03) |
| Nutrition, water, supplements (`nutritionStore.ts:123-292`) | **No:** `set`, then `await put`, no catch | date | same | same | same | Whole-day last-write-wins | Write failure → UI shows a change that reverts on the next reload |
| Cardio, steps (`cardioStore.ts:64-98`) | Yes | `uid('cardio')`, unique | same | same | same | Per record | — |
| Weight, measurements | Yes | date | same | same | same | Whole-day last-write-wins | — |
| Live cardio timer | **Never persisted** (`cardioStore.ts:14,43-49`) | — | — | — | — | — | **Lost on reload or OS kill** |
| Progress photo (`photoStore.ts:67-91`) | Yes (blob + record) | `uid('photo')` | CDN upload on add and on each `load()`, no in-flight guard | Record yes; CDN no (each retry = new file) | `cdnUrl` patch → dirty | Last-write-wins | CDN copy never deleted (media doc) |
| Profile/settings singletons | Yes | n/a | SyncEngine | Server rejects stale (`sync.ts:98-112`); **the client ignores `stale:true`** (`SyncEngine.ts:121-122`) | none | Last-write-wins (two sources, PWA-19) | Self-heals next pass |
| Messages (`MessageThread.tsx:395-461`) | **No** (online only) | `uid('msg')` → `clientMsgId` | Manual Retry | **Yes** (`messagesApi.ts:124-150`) | Server echo | n/a | **Pending/failed list lives in component state** |
| Check-in submit (`CheckIn.tsx:51-59`) | No (online) | weekStart | none | **No:** retry after success returns FORBIDDEN (`clientCheckIns.ts:115-122`) | React Query | Status gate | Form not persisted |
| Coach plan save | Online; draft in IndexedDB | plan id | Paused offline | Full replace (`clientPlans.ts:33-41`) | React Query | **None** (no `ifUpdatedAt`) | Draft survives; empty-base overwrite (coach doc, BV-11) |
| Coach/admin other mutations | Online | — | Paused offline, **dropped on reload** | Varies | React Query | None | None |
| Server side of `sync.push` | — | — | — | Accepts **any** collection name ≤60 chars and **any** record shape (`sync.ts:20-21`); no size or count limits | — | — | Invalid production data already exists (BV-28) |

### 23.2 Every silent-loss scenario (all P0)

| # | Scenario | Trigger | Finding |
|---|---|---|---|
| S1 | The previous user's unsynced logs are wiped when another client signs in on the same device | Sign-out with pending data (offline, or sync stuck), then a different client signs in | PWA-02 |
| S2 | Records just pulled for the new user are deleted by the old user's wipe; the cursor has already moved past them, so they are never pulled again | Sign-in race: sync starts before the wipe | PWA-02 |
| S3 | The new user's same-date workout, meals, weight or measurements are deleted on the server and on their other devices | Previous user's pending tombstones flushed under the new account | PWA-03 |
| S4 | A client's unsynced data is pushed into the coach's or admin's namespace and marked synced; the client and the coach never see it | Coach/admin signs in on a device holding unsynced client data | PWA-04 |
| S5 | After an A→B→A switch, A's older history is missing; A's new write for an existing date overwrites the server copy | Cursors not reset | PWA-05 |
| S6 | A second device's same-day entry replaces the first device's whole day | Two devices, no pull in between | PWA-06 |
| S7 | A stale device's delete removes a newer edit on the server | Delete vs edit across devices | PWA-06 |
| S8 | A device with a fast clock wins every conflict | Clock skew | PWA-06 |
| S9 | A live cardio session being timed disappears | Reload (update), OS kill | PWA-07 |
| S10 | A logged set, or a nutrition tap shown as saved, is not persisted | Kill within 300 ms; IndexedDB write failure (quota made worse by full-size photo originals, `photoStore.ts:70`) | PWA-07 |
| S11 | The coach saves an "empty" plan over the client's real plan, with no version kept | Editor opened after a failed or paused read | coach doc (BV-11, P0) |
| S12 | "Reset all data" deletes the client's server history behind copy that says "local data" | Client action | client doc (P0) |

**Not silent (P1):** a message, voice note or check-in that fails offline shows "Couldn't send" or an error, but the content is then lost on navigation or reload (PWA-12). The offline banner's "Changes sync when you reconnect" (`en.json:709`) makes users assume otherwise (PWA-11).

---

## §24 Sync UX — proposal

**Today there are three badges and a banner, and none of them tells the truth about pending work:**
- client Home chip (`Home.tsx:174`)
- Settings badge ×2 (`Settings.tsx:282,476`)
- coach desktop indicator (`DesktopTopBar.tsx:26`), which tracks the irrelevant client engine (PWA-04)
- offline banner (`App.tsx:119`), which promises sync for things that don't sync

On top of that, "Saved" toasts after local writes imply the server has the data.

**Direction: one sync status, silent when healthy, visible only when the user needs to know.**

| State | Shown when | Copy (EN, short) | Where |
|---|---|---|---|
| (nothing) | Online, 0 pending, last sync OK | — | — |
| Saved on this phone | Offline and ≥1 pending change | "Offline · 3 changes saved on this phone" | Replaces the offline banner text (client only) |
| Waiting to sync | Online, pending older than ~2 min (backing off) | "3 changes waiting to sync" | Shell header status slot (the current chip position) |
| Syncing | Only if a sync runs longer than ~2 s, with pending > 0 | Spinner in the same slot | Same |
| Sync failed | Retries exhausted, or a payload/version error | "Sync failed · Retry" (tap for details) | Same slot; one actionable banner after N minutes |
| Sign in to sync | Server says the session is invalid; **data stays on the device** | "Sign in to sync 3 changes" | Same slot → re-auth sheet that never wipes |
| Needs review | Server rejected a write as a conflict | "1 change needs review" | Same slot → conflict sheet |

- **One status slot.** The client shell header gets one slot. Settings › Account shows the same model in detail: pending list, last sync time, Retry.
- **Unsynced records in History** get a small cloud-off glyph. No new cards.
- **Coach/admin:** no sync chip, because the client engine shouldn't run there. Forms show their own save state ("Couldn't save — Retry"). The offline banner says "Offline — changes can't be saved until you reconnect".
- **No toast spam.** No toasts for routine sync. One toast or banner only for a transition that needs action (failed for more than N minutes, sign-in needed, conflict). Local writes confirm inline (a checkmark on the row), not with "Saved" toasts.
- **Sign-out guard.** If anything is pending: "3 changes haven't synced. [Sync now] [Sign out and discard]". Discard needs a deliberate second confirm.

| Element | What it is | Action | Why |
|---|---|---|---|
| `SyncStatusBadge` on Today | Always-on "Synced" chip | REDESIGN | Silent when healthy; shows real pending/failed state (BV-05, BV-16) |
| `SyncStatusBadge` ×2 in Settings | Duplicate chips | MERGE | One "Sync & storage" row in Settings › Account |
| `SyncStatusIndicator` (coach desktop) | Client-engine status for coaches | REMOVE | Meaningless for coach data (PWA-04) |
| `OfflineBanner` | Global offline strip | REDESIGN | Role-aware copy plus the pending count; no false promise |
| "Update the app" (client Tools) | Unregister SW + delete caches | REMOVE | Replaced by §25 (client doc BV-18 agrees) |
| Message pending/failed bubbles | Per-message state | KEEP | Back them with the outbox (PWA-12) |
| "Saved" toasts after local writes | Toasts | REMOVE | Inline confirmation instead |

---

## §25 Deterministic update UX — proposal

**Principle: update available → download → wait for a safe point → activate → reload.** Never destroy unsynced or in-progress work. Most users should never see any update UI.

1. **Detect.**
   - At launch, and on resume throttled to ≥30 min. Drop the 60 s poll (PF-27).
   - The server also returns the minimum supported build on API responses, so old clients are detected even without a navigation.
2. **Download.** Let the new SW precache quietly. Shrink the precache first (PF-18).
3. **Choose a safe point instead of "hidden".** A safe point is:
   - (a) **Cold start.** If a waiting SW exists before first render, activate it behind the splash and reload once, before any state exists. This removes the "one session late" problem (BV-06a).
   - (b) A **route change between top-level screens**, when nothing is in progress: no active workout or cardio timer, no dirty editor or form, no upload or send in flight, outbox flushed, no open sheet.
   - (c) An **explicit restart.** Only for sessions older than ~8 h, or for coach/admin desktop tabs: one line in the account menu or a slim banner, "Update ready — Restart". No modal, no toast.
4. **Activate.**
   - Before reloading, flush the outbox and persist in-progress state (timers, composer, check-in draft).
   - Coordinate tabs with a BroadcastChannel: only the tab at a safe point reloads; other tabs reload at *their* own safe point.
   - **Never reload a visible tab with unsaved state.**
   - Treat first-visit tabs the same as returning ones, so no tab is left on old JS (BV-06d).
5. **Critical updates.** If the running build is older than the server's minimum: flush, persist, then a short blocking "Updating Forma…" step. No other path forces a reload.
6. **Recovery.**
   - Handle `vite:preloadError` and CSS preload failures as stale chunks (one guarded reload).
   - Make a missing `/assets/*` return 404, not `index.html`.
   - If recovery fails, show "Restart Forma", not "Something went wrong".
7. **Version contract.** Send the build ID on every API call. Have the server reject unsupported builds with a typed error that drives step 5. Consider Vercel Skew Protection so in-flight old clients still reach their own API version.

---

## §26 Future offline, sync and update architecture

**Must support**
- The server is authoritative online.
- Every client workout and nutrition flow works offline, including cold start and resume.
- Writes sync safely on reconnect.
- **Data never disappears without explicit consent.**
- Accounts are isolated on shared devices.
- Coach/admin are online apps with honest offline states and persisted read caches.
- Updates are deterministic.

**1. Identity and storage**
- One IndexedDB database per user (`forma-<uid>`: entities, blobs, outbox, cursors, drafts), plus a small device registry `{uid, lastSeen, pendingCount}`. Switching accounts opens a different database: nothing is wiped, nothing crosses accounts, and there is no race.
- The client sync engine runs only for the client role.
- A database with pending operations is never deleted. "Remove my data from this device" is explicit and runs only after sync, or with a typed confirm.

**2. Offline session**
- Persist the last verified identity (uid, role, account status, name, verifiedAt). Boot renders local data immediately and verifies in the background.
- **Only an explicit 401/revoked response from `auth.refresh` or `auth.me` ends a session.** Network errors, timeouts and 5xx keep it, with an offline / "can't reach Forma" status.
- Request timeouts (10–15 s); a single-flight token refresh; a server-side grace window for the just-rotated refresh token.
- Logout revokes on the server and deletes the cookie. If offline, it's queued, and the app must not auto-restore a session the user signed out of.

**3. Outbox with operation IDs**
- Every write is **one IndexedDB transaction**: the entity change plus `{opId, entity, entityId, baseVersion, op, payload, createdAt, attempts, nextAttemptAt, lastError}`. The UI confirms only after the commit.
- Finer-grained entities replace day documents:
  - a workout session ID (not the date), with sets inside it
  - nutrition entries with their own IDs, and meal checkmarks as fields
  - weight and measurement values per date and field
- The drain worker:
  - runs in order per entity, in batches ≤1 MB
  - backs off exponentially with jitter
  - runs on `online`, resume and a timer
  - isolates failures per collection
  - sends poison ops to "needs review" and never drops them
- Messages, voice notes, photos and check-ins use the same outbox. Media upload comes first, then the metadata op with the returned URL.

**4. Server sync contract**
- `sync.apply(ops[])`:
  - idempotent by `opId` (a ledger of processed ops with a TTL)
  - per-collection **schema validation** and size/count limits
  - **conditional writes** (`ifVersion`) with server-assigned `version`/`syncedAt`
  - per-op acks: `applied | duplicate | conflict(serverDoc)`
- Deletes carry `baseVersion`: a stale delete never removes a newer edit.
- Pulls are paginated and resumable, and never advance past unapplied pages. Cursors live in the per-user database.

**5. Server state for coach/admin**
- Persisted React Query cache per user, invalidated by build ID and cleared on logout.
- `offlineFirst` reads. Authoritative keys (subscription, capacity, payments, account status, plan before edit) use `staleTime: 0` and show an "as of" time when cached; actions are disabled until fresh.
- Editors render only after a successful authoritative read. Save sends `ifUpdatedAt` and auto-versions.

**6. Updates:** §25.

**7. Tests that must exist before Phase B ships**
- Signed-in offline resume and cold start.
- Account switch: A has pending data → B signs in → nothing lost or crossed; A→B→A gives a full history.
- No `sync.*` calls from coach/admin sessions.
- Two devices editing the same day.
- Two-tab update with a dirty form.
- First-visit tab update.
- `vite:preloadError` recovery.
- Server schema rejection for invalid collections or shapes.

---

## Findings

### PWA-01 — Any network failure ends the client's session: offline resume and cold start crash the installed app (HEAD) or show an unusable login (RC2)
- **Priority:** P0      **Effort:** M      **Impact:** TRANSFORMATIVE
- **Action:** REDESIGN
- **Who / where:** Client · any route (reproduced on `/workout/session` and on cold open) · installed PWA, 390
- **Evidence:**
  - `App.tsx:63-70`: `refreshAccount` runs on every `visibilitychange`.
  - `sessionStore.ts:147-166`: any error → `phase:'anonymous'`, token cleared, query cache cleared.
  - `sessionStore.ts:80-91` + `platformApi.ts:36-53`: a failed `auth.refresh` means "no session".
  - `trpc.ts:16-30` and `platformApi.ts:38-43`: no timeouts.
  - `AnonymousApp.tsx:55,76` + `vite.config.ts:78` **(HEAD only):** login is in the non-precached `SitePages` chunk.
  - `ErrorBoundary.tsx:8-11` doesn't recognise "Unable to preload CSS".
  - BV-03 (`evidence/client-offline-reopen-crash.png`), BV-04, BV-05, BV-25.
  - Performance side of the same code paths: PF-01 (waterfall), PF-02 (timeouts), PF-03 (login chunk), PF-10 (refresh race).
- **Steps / scenario:** Start a workout online → go offline → lock the phone or switch apps → return. Or: close the app, reopen it offline.
- **Expected vs actual:**
  - Expected: the workout and today's data stay usable, with an offline status.
  - Actual: "Something went wrong" (HEAD) or a login form that can't work offline (RC2). After reconnecting, nothing syncs until the app is relaunched online (BV-05: 45 s with no server write).
- **Why it matters:** The local-first data layer is unreachable in exactly the place clients train: gyms with poor signal. The same path signs out online users on any `auth.me` 5xx, or when a refresh race is lost after the 15-minute token expiry. A connection that is up but passes no data leaves the splash spinning forever.
- **Direction:**
  - The session survives everything except an explicit 401/revoked response.
  - Boot renders local data first and verifies in the background.
  - Add request timeouts and a single-flight refresh.
  - Precache the login.
  - From an anonymous state, retry the session on `online`.
- **Verified:** BROWSER-VERIFIED (offline resume and cold start, BV-03/04/05) · CODE-CONFIRMED (5xx, refresh race, hung connection)

### PWA-02 — Switching accounts on a device destroys the previous user's unsynced data, and the switch races the first sync
- **Priority:** P0      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Client (shared phone or tablet, gym or family device) · sign-out → sign-in
- **Evidence:**
  - `clientSync.ts:26-50`: `scopeLocalToUser` clears 11 stores when the owner differs.
  - `sessionStore.ts:136-145`: sign-out has no final sync and no pending check.
  - `Settings.tsx:496-507`: the confirm says only "Sign out of Forma on this device?" (`en.json:788`).
  - `cloudStore.ts:100-108`: `syncNow` starts on account change, **before** ClientGate's wipe (`ClientApp.tsx:86-90`).
  - `clientSync.ts:13-16`: the wipe deletes by the IDs it read, which are dates.
- **Steps / scenario:**
  1. A logs a workout offline (BV-05 shows it stays only on the device).
  2. A signs out; B signs in on the same device.
  3. A's workout is deleted forever.
  4. Separately: B's freshly pulled records for the same date can be removed by A's in-flight wipe after B's cursor has already advanced.
- **Expected vs actual:**
  - Expected: pending data is synced or protected, and the user is warned.
  - Actual: a silent permanent wipe, and a race that can drop the new user's records.
- **Why it matters:** This is silent loss of the data the product exists to hold. Coaches never see those sessions.
- **Direction:** A database per user, a sign-out guard with a pending count, and never deleting a database with pending ops. Remove the wipe-on-switch model.
- **Verified:** CODE-CONFIRMED

### PWA-03 — The previous user's pending deletions are applied to the next user's account
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Client · shared device · sync
- **Evidence:**
  - `tombstones.ts:16-26`: the `deletions` store is not cleared by `scopeLocalToUser` (`clientSync.ts:30-42`).
  - `SyncEngine.ts:190`: deletions are flushed first.
  - `sync.ts:61-77`: the server deletes `uid__collection__id` unconditionally and writes a marker that the user's other devices apply.
  - Record IDs are dates: `types/index.ts:1071,1180,1226,1260,1336`.
- **Steps / scenario:** A deletes today's workout (or clears a day) offline → signs out → B signs in → B's workout, nutrition log, weight or measurements for that date are deleted on the server and on B's other devices.
- **Expected vs actual:**
  - Expected: deletions apply only to their owner.
  - Actual: they apply to whoever signs in next.
- **Why it matters:** Cross-account data destruction, silent, with a high collision rate because IDs are calendar dates.
- **Direction:** Per-user storage, with tombstones as user-scoped outbox ops. The server should refuse a delete whose `baseVersion` it doesn't hold.
- **Verified:** CODE-CONFIRMED

### PWA-04 — Coach and admin sessions run the client sync engine and can capture a client's unsynced data
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REMOVE (client sync for non-client roles)
- **Who / where:** Coach/Admin signing in on a device a client used (coach helping on the client's phone, shared studio tablet) · boot
- **Evidence:**
  - `App.tsx:88` + `cloudStore.ts:94-122,133-152`: the engine starts for any account.
  - `SyncEngine.ts:87-99`: it pushes dirty records under the signed-in uid, then marks them clean.
  - `clientLogs.ts:22-38`: the coach's view reads by `clientId`.
  - BV-25: the coach boot calls `sync.deletionsPull`, `sync.singletonGet`, `sync.pull`.
- **Steps / scenario:** A client logs offline → signs out → the coach signs in on that device → the client's records, tombstones and profile are pushed into the **coach's** namespace and marked synced → the client's own account never gets them, and the coach's client view never shows them.
- **Expected vs actual:**
  - Expected: coach/admin never touch client storage.
  - Actual: the full client sync runs every 2 minutes for every coach and admin tab.
- **Why it matters:** Silent loss for the client, plus pointless requests and a meaningless sync indicator for coaches (PF-04 covers the cost).
- **Direction:** Start the client engine only for the client role; with per-user databases the capture becomes impossible.
- **Verified:** BROWSER-VERIFIED (engine runs on coach boot, BV-25) · CODE-CONFIRMED (capture path)

### PWA-05 — Sync cursors survive an account switch: history is never re-downloaded, then new writes overwrite the server copy
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD (cursor management)
- **Who / where:** Client · shared device, after an A→B→A switch
- **Evidence:**
  - `clientSync.ts:46` removes the legacy `pullCursorV2:${uid}`, but the engine uses `pullCursorV3:${uid}:${coll}` (`SyncEngine.ts:71-73,198-206`).
  - `sync.ts:27-41`: unconditional upsert.
  - The earlier audit `docs/audit-phase2/07-services-cache.md:385` marks this as reset — **incorrect**.
- **Steps / scenario:** A uses the device → B signs in (wipe) → A signs in again (wipe) → the incremental pull starts from A's old cursor, so older records never return → A logs an entry for a date that exists on the server → the push replaces the server record.
- **Expected vs actual:**
  - Expected: a full re-pull after a wipe.
  - Actual: the history looks empty, and the next write destroys the server copy.
- **Why it matters:** Looks like data loss, then becomes real data loss.
- **Direction:** Cursors live in the per-user database and reset whenever local data is cleared. The server enforces version checks.
- **Verified:** CODE-CONFIRMED

### PWA-06 — Cross-device writes silently overwrite each other: whole-day documents, device-clock last-write-wins, no server conflict check
- **Priority:** P0      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD (data model and sync contract)
- **Who / where:** Client with two devices (phone and tablet or desktop) · nutrition, workout, measurements, weight, checklist
- **Evidence:**
  - IDs are dates: `nutritionStore.ts:67-83`, `workoutStore.ts:85-96`.
  - Pull applies last-write-wins on the client clock: `SyncEngine.ts:103-116`.
  - Server upsert ignores `updatedAt`: `sync.ts:27-41`.
  - Server delete ignores edit-wins: `sync.ts:61-77`.
  - `updatedAt` is "the device's own clock": `api/sync/_data.ts:20`.
- **Steps / scenario:** Phone logs breakfast and lunch (synced) → tablet, before its first pull, logs water → the tablet's water-only day is newer and is pushed → the phone pulls it and loses breakfast and lunch. Also: a stale device's delete wins on the server; a device with a fast clock wins every conflict.
- **Expected vs actual:**
  - Expected: changes to different items merge, and true conflicts are detected.
  - Actual: the whole day is silently replaced.
- **Why it matters:** Silent loss for any multi-device client.
- **Direction:** Entity-level records (§26.3) and conditional writes with server versions.
- **Verified:** CODE-CONFIRMED (mechanism) · INFERRED (frequency; run a two-device test)

### PWA-07 — In-progress activity isn't crash-safe: the live cardio timer, rest timer and recent edits are lost on any reload or OS kill
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Client · `/cardio` live session, `/workout/session`, Fuel taps · mobile, backgrounded app
- **Evidence:**
  - `cardioStore.ts:13-16,43-49`: `liveStart` is memory only.
  - `timerStore.ts:14,45-75`: the rest timer is memory only (its comment claims it survives reloads).
  - `workoutStore.ts:99-101`: 300 ms debounce, with no `pagehide` or hidden flush anywhere in `src`.
  - `nutritionStore.ts:133-135`: UI first, IndexedDB write with no catch.
  - `main.tsx:23-33`: the update reload fires exactly when the app is backgrounded.
  - `App.tsx:72-99`: boot has no error handling.
  - BV-06c: after the background update reload the workout survived, but the rest timer was gone.
- **Steps / scenario:** Start a live treadmill timer → switch to a music app → iOS kills the PWA, or a deploy triggers the background reload → return: no timer, nothing logged.
- **Expected vs actual:**
  - Expected: timers and taps survive a reload.
  - Actual: the live cardio session is silently lost; ≤300 ms of set edits or a failed nutrition write vanish.
- **Why it matters:** Silent loss of the activity being recorded, triggered by ordinary phone behaviour.
- **Direction:**
  - Persist timer start and end timestamps and the exercise index.
  - Flush on hide.
  - Confirm writes only after the IndexedDB commit (via the outbox).
  - Re-select the in-progress session after a midnight rollover.
- **Verified:** BROWSER-VERIFIED (in-memory timer lost on update reload; workout survives, BV-06c) · CODE-CONFIRMED (cardio, debounce, nutrition)

### PWA-08 — Signing out while offline doesn't sign out: the next online moment restores the previous account
- **Priority:** P0      **Effort:** S      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Any role · shared device · Settings › Sign out
- **Evidence:**
  - `mongoAuth.ts:67-70`: `auth.logout` failure is swallowed, so the httpOnly cookie stays valid (it can only be cleared server-side: `auth.ts:145-149`, `tokens.ts:139-141`).
  - `App.tsx:63-70`: `refreshAccount` runs even in the anonymous state. The 401 triggers a refresh with the surviving cookie and the user is signed back in. Cold start does the same (`sessionStore.ts:80-91`).
- **Steps / scenario:** A signs out in the gym offline and hands the phone over → later, online, the app is opened or brought forward → A is signed in again, with full access to A's health data, messages and photos.
- **Expected vs actual:**
  - Expected: sign-out is final.
  - Actual: it is undone silently.
- **Why it matters:** A privacy and security failure on shared devices.
- **Direction:** Record a "signed out" state locally that blocks automatic restore until an explicit sign-in. Revoke on the server at the next opportunity. Never auto-refresh from the anonymous state.
- **Verified:** CODE-CONFIRMED

### PWA-09 — After a deploy the old build stays visible for the whole session; there is no update UI, and refresh doesn't help
- **Priority:** P1      **Effort:** M      **Impact:** TRANSFORMATIVE
- **Action:** REDESIGN
- **Who / where:** All roles · installed and web · every route
- **Evidence:**
  - `vite.config.ts:37,79,95-97`: prompt mode, NavigationRoute, `skipWaiting:false`.
  - `main.tsx:17-45`: check on visible or every 60 s; activate only when hidden.
  - `dist/sw.js` NavigationRoute.
  - BV-06a: old build served at +0, +8 s and +73 s; new build only after backgrounding. BV-06b: no update UI.
  - Release report §18: deployed SW update "NOT RUN".
- **Steps / scenario:** §20.2.
- **Expected vs actual:**
  - Expected: a new deploy reaches users at the next safe moment, predictably.
  - Actual: users are always a session late. Desktop tabs that stay visible run old JS indefinitely. F5 does nothing. Old JS keeps calling the new API (PWA-17).
- **Why it matters:** Fixes don't reach users. Support can't tell users how to update. Old-client and new-server mismatches become routine.
- **Direction:** §25: activate at cold start, otherwise at a safe point; one quiet restart affordance for long sessions; build-version contract.
- **Verified:** BROWSER-VERIFIED (BV-06a/b)

### PWA-10 — Update activation is unsafe either way: visible tabs reload mid-edit, first-visit tabs never reload, and CSS stale-chunk errors aren't recovered
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** All roles · multi-tab desktop (coach/admin), first-session users · any route
- **Evidence:**
  - vite-plugin-pwa `register.js` (`showSkipWaitingPrompt` adds a `controlling` → `reload()` listener gated by `event.isUpdate`); workbox-window `_isUpdate` comes from the controller at registration (`workbox-window.dev.mjs:445-462`).
  - `main.tsx:27-31`: the deferral never re-arms.
  - `ErrorBoundary.tsx:8-11`: no match for "Unable to preload CSS"; no `vite:preloadError` handler in `src`.
  - `vercel.json:3`: a missing chunk is answered with index.html.
  - BV-06d: first-visit tab, `controllerchange` fired, no reload, old JS under the new SW.
  - BV-03: the CSS preload failure surfaced as "Something went wrong".
- **Steps / scenario:**
  - (a) A coach has two tabs. Tab 1 is hidden, so the update activates and tab 2 (visible, mid-form) reloads immediately.
  - (b) A new user's first tab gets an update and keeps old JS; the next lazy route fails.
  - (c) A stale page loads a route whose CSS changed and shows "Something went wrong".
- **Expected vs actual:**
  - Expected: every tab moves to the new build at its own safe point.
  - Actual: some reload with unsaved input; others never move.
- **Why it matters:** Lost form input (message composers, subscription sheets, admin forms). Coach plan editors keep IndexedDB drafts. Broken navigation after deploys.
- **Direction:** Replace the plugin's reload with a coordinated, safety-aware activation (§25.4) and recover CSS/JS preload errors once (§25.6).
- **Verified:** BROWSER-VERIFIED (b, c: BV-06d, BV-03) · CODE-CONFIRMED (a, re-arm)

### PWA-11 — The sync status misleads: "Synced" with changes pending, a coach indicator for the wrong engine, and an offline banner that promises sync
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Client Today and Settings, coach desktop top bar, global offline banner · all viewports
- **Evidence:**
  - `cloudStore.ts:30-36`: the status is "synced" whenever `lastSync` is set.
  - `cloudStore.ts:142`: an offline pass returns without changing state.
  - `SyncStatusBadge.tsx:14-21`; `Home.tsx:174`; `Settings.tsx:282,476`; `DesktopTopBar.tsx:26`.
  - `en.json:485,701-709`.
  - BV-05: "Synced" stayed while a finished workout was pending; BV-16 / `evidence/client-today-390.png`; BV-26: "Synced" reads "الزامن" in ar-eg.
- **Expected vs actual:**
  - Expected: users know when something hasn't reached the server.
  - Actual: everything looks backed up; errors show raw strings.
- **Why it matters:** False confidence leads directly to PWA-02-style losses (signing out or switching devices with pending data).
- **Direction:** §24: one status model, silent when healthy, pending counts, a sign-out guard; remove the coach indicator.
- **Verified:** BROWSER-VERIFIED (BV-05) · CODE-CONFIRMED

### PWA-12 — No durable outbox outside the sync engine: messages, voice notes, photos and check-ins are lost on navigation or reload
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD (shared outbox)
- **Who / where:** Client and coach · Messages, check-in, progress photos · mobile
- **Evidence:**
  - `MessageThread.tsx:147-150` (pending list in state), `:480-481` (composer cleared on send), `:863,875` (attach and record hidden offline).
  - `messagesApi.ts:124-150`: the server already dedupes by `clientMsgId`.
  - `CheckIn.tsx:50-59`: form in state; online mutation.
  - `clientCheckIns.ts:115-122`: submit not idempotent.
  - `photoStore.ts:44-65`: CDN retry only on `load()`, no in-flight guard.
  - Messenger detail: MS-07.
- **Steps / scenario:** Offline, type a message (or record a voice note) and send → "Couldn't send · Retry" → switch to Train → return: the message is gone.
- **Expected vs actual:**
  - Expected: queued, sent automatically on reconnect, survives navigation and reload.
  - Actual: a manual Retry button that disappears with the screen.
- **Why it matters:** The content is lost after the user believed the app had it, and the banner promises sync. It is loud at first (hence P1, not P0).
- **Direction:** One outbox for all user-originated writes (§26.3); idempotent endpoints (check-in submit by op ID); show pending items wherever they belong.
- **Verified:** CODE-CONFIRMED

### PWA-13 — The sync contract is unvalidated and brittle: the server accepts any collection and shape; one failure blocks the whole pass
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD (server contract)
- **Who / where:** Backend `sync.*` · every client · coach oversight views
- **Evidence:**
  - `sync.ts:20-21`: `collection: z.string().min(1).max(60)`, `data: z.record(z.string(), z.unknown())`, no size or count limits.
  - BV-28: the production demo seeder (`scripts/seed-demo-history.mjs:141`) pushed invalid cardio types, now shown as raw i18n keys.
  - `SyncEngine.ts:182-210`: a throw in any collection aborts the rest.
  - `SyncEngine.ts:121-122`: `stale:true` is ignored.
  - Unpaginated pull vs Vercel's 4.5 MB cap (PF-16).
- **Expected vs actual:**
  - Expected: the server validates what it stores, and failures are isolated and visible.
  - Actual: any authenticated user can store arbitrary collections or records that coach views will render; one bad collection stalls all sync.
- **Why it matters:** Data integrity and abuse risk. Silent stalls lengthen the window for PWA-02/04 losses.
- **Direction:** A per-collection schema and allow-list, size and count limits, per-op acks and isolation, paginated pulls (§26.4).
- **Verified:** BROWSER-VERIFIED (invalid data accepted, BV-28) · CODE-CONFIRMED

### PWA-14 — On shared devices the previous user's data stays visible in memory and on disk after sign-out
- **Priority:** P1      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Client · shared device · sign-out → next sign-in
- **Evidence:**
  - `sessionStore.ts:136-145`: clears only the token and React Query.
  - Zustand stores keep the previous user's profile, plan and logs until `ClientGate.refresh` completes (`ClientApp.tsx:86-102`).
  - `blobStore.ts:8-31` + `clientSync.ts:30-42`: full-size progress-photo originals (`photoStore.ts:70`) are never removed, even after another client signs in.
  - All history stays in IndexedDB after sign-out.
- **Expected vs actual:**
  - Expected: the next user sees nothing of the previous one.
  - Actual: a brief flash of the previous client's name, plan and today's logs; body photos remain on the device.
- **Why it matters:** Health data and body photos exposed on shared devices.
- **Direction:** Per-user databases; reset in-memory stores on identity change; an explicit "remove data from this device" after sync.
- **Verified:** CODE-CONFIRMED

### PWA-15 — Coach-authored data the client needs offline isn't mirrored: cardio plan, coach notes, check-ins, messages, exercise videos
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Client · Cardio, Your coach, Check-ins, Messages, exercise video button · offline
- **Evidence:**
  - `Cardio.tsx:113-117` and `ClientNotesProvider.tsx:16`: online React Query only.
  - `CheckIn.tsx:81-94`: offline shows "not found".
  - Messages are polling only (`messagesApi.ts:79-122`).
  - `VideoPopup.tsx:30-60`: black player offline.
  - Contrast: workout and meal plans and targets are mirrored (`clientSync.ts:88-121`).
- **Expected vs actual:**
  - Expected: what the coach assigned is readable offline.
  - Actual: blanks, "not found", or a dead player.
- **Why it matters:** The gym is exactly where clients need the cardio plan and the exercise videos.
- **Direction:** Mirror coach-authored client data into the per-user store with an "as of" time; pre-cache the active plan's videos (opt-in on cellular); cache the last N messages per thread.
- **Verified:** CODE-CONFIRMED

### PWA-16 — Boot has no error handling: one IndexedDB or locale-chunk failure leaves the splash spinning forever
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** All roles · cold start
- **Evidence:** `App.tsx:72-99`: the sequential `await` chain has no try/catch; `ready` stays false and `useSession.init()` never runs. `settingsStore.ts:24-34`: `applyLocale` awaits a dynamic import.
- **Expected vs actual:**
  - Expected: a recoverable error with Retry, and the session still restored.
  - Actual: an endless splash.
- **Why it matters:** WebKit IndexedDB failures and quota errors happen in the field. Users can only kill the app.
- **Direction:** Each boot step is independently guarded with a visible recovery path.
- **Verified:** CODE-CONFIRMED

### PWA-17 — No client/API version contract: old JS talks to the new API for as long as it stays open
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** All roles · every API call after a deploy
- **Evidence:** `trpc.ts:32-39`: no build header, no skew handling. BV-06a shows an old build stays active for a whole session; desktop tabs can stay old for days (PWA-09).
- **Expected vs actual:**
  - Expected: incompatible clients are detected and updated safely.
  - Actual: changed procedures fail with generic errors; sync shows "Sync error" until a reload.
- **Why it matters:** Every backend change risks breaking the users who are using the app at that moment.
- **Direction:** Build ID on every request; server minimum-version response; safe forced update (§25.5); Vercel Skew Protection.
- **Verified:** CODE-CONFIRMED

### PWA-18 — Coach/admin server state is memory-only: cold skeletons after every reload, stale authoritative data, offline saves that pause and vanish
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Coach/Admin · all screens · desktop and mobile
- **Evidence:**
  - `queryClient.ts:8-27`: no persister, no `networkMode`.
  - 0 `placeholderData` (key changes flash skeletons).
  - Capacity cached 300 s (`CoachDashboard.tsx:35`, `RoleAccount.tsx:34`).
  - Offline mutations pause with "Saving…" and are dropped on reload.
  - `useOnlineStatus` gating in only 10 screens; the plan editors aren't gated.
  - PF-21 (skeletons); coach doc (false empty states).
- **Expected vs actual:**
  - Expected: an instant warm start, freshness labels on authoritative data, honest offline saves.
  - Actual: skeletons every launch, including update reloads; actions taken on stale capacity or subscription data; endless "Saving…".
- **Why it matters:** The coach app feels slow and unreliable on every return.
- **Direction:** §26.5.
- **Verified:** CODE-CONFIRMED

### PWA-19 — Three sources of truth for the client profile, reconciled by last-write-wins in two places
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** Client profile (name, body stats, locale) · coach views
- **Evidence:**
  - The `users` doc via `auth.updateProfile`.
  - `clientProfiles` via `profile.get`, applied in `clientSync.ts:78-86`.
  - `syncSingletons/profile` via `SyncEngine.ts:119-126`.
  - Earlier audit C-6 (`users.displayName` never updated by the client name field).
- **Expected vs actual:**
  - Expected: one profile record.
  - Actual: three that drift, so the coach and client see different values.
- **Why it matters:** Confusing names and stats; extra sync paths.
- **Direction:** One server-owned profile entity, edited through the outbox.
- **Verified:** CODE-CONFIRMED

### PWA-20 — The PWA and offline behaviour was certified without testing it
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD (test suite)
- **Who / where:** QA / release gate
- **Evidence:**
  - `e2e3/pwa/pwa-check.mjs:47,58-65`: the offline check loads anonymous `/login` and asserts only `root.children.length > 0`, which an error screen or Suspense fallback also satisfies.
  - No signed-in offline, account-switch, multi-tab or first-visit update tests.
  - No unit tests in `src/data/sync/`.
  - Release report §18: SW update on a real deploy "NOT RUN".
  - The earlier storage audit marks PWA-03/04/05 behaviour as OK (`07-services-cache.md:383-389`).
- **Expected vs actual:**
  - Expected: release gates cover the risks in this doc.
  - Actual: they pass while the installed app crashes offline (BV-03).
- **Why it matters:** False confidence at the release gate.
- **Direction:** Add the tests in §26.7 as gating checks.
- **Verified:** CODE-CONFIRMED

### PWA-21 — Cache configuration hygiene
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Hosting and SW config
- **Evidence:**
  - `vercel.json:3,28-31`: a missing hashed asset is answered with index.html (200) plus the 1-year immutable header, so stale pages hit MIME errors instead of a 404.
  - `vercel.json:13` + `vite.config.ts:157-161`: `/data/*.json` is no-store under SWR, so each revalidation re-downloads 1 MB.
  - Google Fonts stylesheet cache has no expiry (`:132-136`).
  - `exercise-videos` cache-first for legacy seed videos only (`:120-131`, `bootstrap.ts:69`).
  - Precache bloat and SW polling cost: PF-18, PF-27.
- **Expected vs actual:**
  - Expected: each cache has a clear owner, revalidation and expiry.
  - Actual: several leftovers and wrong defaults.
- **Why it matters:** Wasted bytes; confusing failure modes after deploys.
- **Direction:**
  - Exclude `/assets/` from the SPA rewrite.
  - Cache `/data` with ETags.
  - Drop dead routes.
  - Put expiry on every runtime cache.
- **Verified:** CODE-CONFIRMED

### PWA-22 — Device-level keys aren't user-scoped
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Shared devices · coach editors, banners, presence
- **Evidence:**
  - Coach plan drafts are keyed `workoutDraft:${clientId}` without the coach (`CoachWorkoutEditor.tsx:37`; same in the nutrition and cardio editors).
  - Dismissed banners in sessionStorage are not scoped (`BannerHost.tsx:16-31`).
  - The presence key is per day and per device (`PresenceTracker.tsx:16-19`).
- **Expected vs actual:**
  - Expected: per-user state stays per-user.
  - Actual: a second coach inherits drafts; dismissals and presence leak between users.
- **Why it matters:** Small but confusing; skews DAU.
- **Direction:** Move into the per-user database (§26.1).
- **Verified:** CODE-CONFIRMED

### PWA-23 — Manifest polish: maskable icon is a copy of the regular icon; role-specific shortcuts shown to everyone; portrait lock; marketing screenshots
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Install surface (Android/desktop) · all roles
- **Evidence:**
  - `public/icons/icon-maskable-512.png` is byte-identical to `icon-512.png` (md5 `b2f72ccb…`).
  - `vite.config.ts:67-70`: shortcuts "Dashboard" → `/coach` and "Today" → `/workout` for all roles.
  - `:46`: `orientation: 'portrait'`.
  - `:63-66`: both screenshots are 1536×1024 landscape marketing images.
- **Expected vs actual:**
  - Expected: a proper maskable icon, role-neutral shortcuts, tablet landscape allowed for coaches.
  - Actual: a boxed icon, a wrong-role shortcut for half the users, portrait-locked tablets.
- **Why it matters:** The install looks unpolished; the coach tablet use case is blocked by the orientation lock.
- **Direction:**
  - Design a real maskable icon.
  - Drop the role shortcuts, or make them role-agnostic (e.g. "Messages").
  - Remove the orientation lock, or restrict it to phones.
  - Use real app screenshots.
- **Verified:** CODE-CONFIRMED

---

## Cross-references and device checks

**Owned elsewhere** (do not double count):

| Topic | Owning doc |
|---|---|
| Coach editor wipes plan after a failed load (BV-11) | coach doc |
| "Reset all data" deletes server history | client doc |
| Bunny media never deleted | media doc |
| Boot waterfall, timeouts, login chunk, coach/admin sync cost, resume storm, token refresh race, sync pass cost, precache bloat, cold coach screens, SW polling (BV-25, BV-29) | 13_PERFORMANCE_NETWORK_AUDIT: PF-01/02/03/04/09/10/16/18/21/27 |
| Messenger offline send and draft persistence | 09_MESSENGER_AUDIT: MS-07 |
| False empty states while offline | client and coach docs |

**Needs a real device or a preview deployment (INFERRED items):**
- iOS standalone: does the hidden-time activation finish before suspension, or does the reload fire on resume?
- iOS: persistence and eviction behaviour for home-screen versus Safari-tab users.
- Vercel's response for an old `/assets/*.js` after a real deploy.
- A two-device same-day conflict run (PWA-06).
