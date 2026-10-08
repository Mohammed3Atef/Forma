# 13 — Performance & Network Audit

Audit date 2026-10-04 · Repo HEAD `e7663ab` (`development`) · Production runs RC2 `cf3a5d9` (per project notes; not re-verified) · Discovery only, no product code changed.

## Bottom line

- **The local-first client app waits on the network before it shows local data.** Every launch blocks the Splash on three API calls in sequence (`auth.refresh` → `auth.me` → `assessment.get`). Measured on a warm PWA: content at **1.0 s on Slow-4G** and **1.5 s on 3G**, while first paint is at ~0.18 s. The server here was local; production adds Vercel cold starts and the Atlas round trip. No request has a timeout, so on a connection that passes no data the Splash never ends. (PF-01, PF-02)
- **An idle app costs 13.5–25 HTTP requests a minute, all polling** (measured). That is 14/min on client Today, 21/min in a client thread, 13.5–14.5/min on coach screens and 25/min in a coach thread. Roughly a third of it is waste:
  - duplicate pollers;
  - the *client* sync engine running inside coach sessions;
  - two notification bells on coach screens;
  - full-history reads used to show one item. (PF-04 – PF-08, PF-22)
- **Some payloads are needlessly large.** The coach exercise library is **835 KB per fetch: 4.8 s to the first row on Slow-4G** (measured; local proxy, not compressed). It is refetched after every save. Coach saves never update the cache in place: 97 mutations, 0 optimistic writes, 119 invalidations. (PF-11, PF-12)
- **Server queries grow with all-time history.** Every coach tab aggregates every message ever every 20 s. The unread-notification count has no index. Index self-checks run on every request. Fine at today's data size; this is what will make production slow first. (PF-14, PF-15)
- **First visit is heavy.** The entry chunk is 150 KB gz (18% is English strings). About 44% of the render-blocking CSS belongs to the website. Five font families load. There is no HTML splash. Measured FCP: **3.5 s Slow-4G / 7.5 s 3G**. The PWA precache is 2.34 MiB, and about half of it is marketing images. (PF-17, PF-18)
- **Much of the "slow" feeling is presentation:**
  - a chrome-less skeleton on the first visit to every page;
  - a 450 ms fade on every page;
  - banners and cards that land after paint and push content down;
  - coach screens that start empty on every launch. (PF-19 – PF-21)
- **Phase B direction, in order:**
  1. A boot model that renders from local and cached data first and revalidates in the background, with timeouts.
  2. One realtime/poll channel per user, with an adaptive cadence.
  3. A persisted query cache plus cache-writing mutations on the coach side.
  4. Projected, paginated and indexed server reads.
  5. A slim entry bundle and a slim precache.

Counts: **31 findings — P0 0 · P1 7 · P2 18 · P3 6.** The offline-boot failure (BV-03/BV-04) is a P0, tracked in the PWA doc. PF-01 and PF-03 cover its performance and chunking side.

---

## 0. Scope, method and how to read the numbers

| Source | What | Caveat |
|---|---|---|
| Static analysis | Every `useQuery`/`useInfiniteQuery` call (140 sites in 82 files), every timer and poller, tRPC client, SyncEngine, service worker config, every hot tRPC procedure and the Mongo index script | — |
| Build analysis | `dist/` (HEAD build) plus a sourcemap rebuild in a scratch folder with **byte-identical chunk hashes**. Sizes come from node zlib (gzip -9 / brotli) | Transfer size in production depends on Vercel compression |
| Browser measurement (BV-25, BV-29, coach idle/resume runs) | Production build served with vercel.json-equivalent headers, API proxied to the **isolated local stack**. Google Chrome, Pixel 7 profile, **390×844**, CDP throttling: **Slow-4G** = 150 ms RTT, 1.6 Mbps down / 750 kbps up; **3G** = 300 ms RTT, 750 kbps / 250 kbps | **Server compute and latency are local**: no Vercel cold starts, no Atlas round trips, and the proxy does not compress API responses. Production will be slower on the server side and faster for large JSON if Vercel compresses it |
| Precache | Coordinator's build: **159 entries, 2,341.92 KiB** | Install transfer is estimated by compressing each file |

"Calls" means tRPC procedure executions on the server. "Requests" means HTTP requests. `httpBatchLink` merges calls issued in the same tick, so calls ≥ requests.

---

## 1. Measured baseline

### 1.1 Startup (BV-25)

| Scenario | Unthrottled | Slow-4G | 3G | Requests before content (API) |
|---|---|---|---|---|
| Client, first visit: FCP / Today content | 300 / **447 ms** | 3,512 / **4,832 ms** | 7,464 / **9,286 ms** | 32–38 (API 7–12) |
| Client, returning (SW warm): FCP / Today content | 180 / **345 ms** | 176 / **1,012 ms** | 184 / **1,512 ms** | 33–35 (API 8–10) |
| Coach, returning: FCP / first client row | 176 / **341 ms** | 176 / **1,001 ms** | 184 / **1,504 ms** | 46–49 (API 6–9) |
| Coach library (from Clients): first library row | — | **4,825 ms** (`coachAssets.exercises.list` = **835 KB**, response end 4,272 ms) | — | — |

**Returning client, API requests in start order before Today renders (measured):**
1. `auth.refresh` → `auth.me` → `banners.forViewer` → **`assessment.get`**
2. `workoutPlan.get, nutritionPlan.get, coachTargets.get, profile.get`
3. `sync.deletionsPull`
4. `notifications.list, adminUsers.get, messages.list, coachClients.get, coachNotes.list`
5. `sync.singletonGet`

`refresh → me → assessment` are dependent (each waits for the previous). The rest are concurrent but compete for the connection.

**Returning coach:** `auth.refresh` → `auth.me` → `banners.forViewer` → **`sync.deletionsPull`** → batch (`messages.coachThreadsSummary, notifications.list, coachClients.listMyClientUsers…`) → batch (`transfers.list, coachClients.listMyClientUsers, coachClients.dashboardSummaries…`) → **`sync.singletonGet` → `sync.pull`**. The coach boot runs the client sync engine (PF-04) and fetches the roster twice (PF-07).

**What the numbers say:** with the SW warm, first paint is ~0.18 s on every profile. The remaining **0.8–1.3 s** (Slow-4G / 3G) is Splash time spent waiting for the API chain, even though the client's plan, logs and targets are already in IndexedDB.

### 1.2 Idle polling, 120 s, tab visible (BV-29 + coach runs)

| Screen | HTTP req/min | Calls in 120 s |
|---|---|---|
| Client · Today | **14.0** | `messages.list` ×12 · `sync.pull` ×8 · `notifications.list` ×5 · `checkIns.list` ×2 · `sync.singletonGet` ×2 · `sync.deletionsPull` ×1 · `sync.push` ×1 |
| Client · thread (`/messages`) | **21.0** | **`messages.list` ×36** · `sync.pull` ×8 · `notifications.list` ×5 · `sync.singletonGet` ×2 · `sync.deletionsPull` ×1 · `sync.push` ×1 |
| Coach · dashboard (1440) | **13.5** | **`notifications.list` ×10** · `sync.pull` ×8 · `messages.coachThreadsSummary` ×6 · `coachPlanRequests.mine` ×2 · `sync.singletonGet` ×2 · `sync.deletionsPull` ×1 |
| Coach · clients (390) | **14.5** | same mix as the dashboard (29 calls) |
| Coach · thread (390) | **25.0** | **`messages.list` ×24** · `notifications.list` ×10 · `sync.pull` ×8 · `messages.coachThreadsSummary` ×6 · `coachPlanRequests.mine` ×2 · `sync.singletonGet` ×2 · `sync.deletionsPull` ×1 |

Every row above is expected from the code:
- **Client `messages.list`:** 6/min on Today = two separate 20 s badge loops on the *same* thread. 18/min in a thread = 12 from the thread's own 5 s loop + 6 from the two badge loops.
- **Coach `notifications.list`:** 5/min = two bells × one call every 25 s.
- **Sync:** one pass every 120 s = 11 calls, **including on coach screens**.
- **`checkIns.list`:** 1/min, returning the full check-in history.

### 1.3 Resume (hidden → visible + focus, measured)

| Screen | HTTP requests (6 s window) | Calls |
|---|---|---|
| Client · Today | 2 | `auth.me`, `assessment.get`, **`coachNotes.list` ×2**, **`coachTargets.get` ×2**, `workoutPlan.get`, `nutritionPlan.get`, `profile.get`, `adminUsers.get`, `coachClients.get`, `checkIns.list` (12 calls) |
| Client · thread | 3 | `auth.me`, `assessment.get`, `coachNotes.list`, `adminUsers.get`, `coachClients.get`, `workoutPlan.get`, `nutritionPlan.get`, `coachTargets.get`, `profile.get`, `messages.list` |
| Coach · dashboard | 1 | `auth.me`, `coachPlans.me`, `coachClients.listMyClientUsers`, `coachAssets.workoutTemplates.list` |
| Coach · clients | 1 | **`coachClients.listMyClientUsers` ×2**, `auth.me`, `coachPlans.me`, `coachClients.dashboardSummaries`, `coachClients.list`, `coachAssets.workoutTemplates.list`, `coachAssets.nutritionTemplates.list`, `messages.coachThreadsSummary`, `transfers.list` (11 calls) |
| Coach · thread | 2 | `auth.me`, `coachPlans.me`, `coachClients.listMyClientUsers`, `adminUsers.get`, `profile.get`, `assessment.get`, `coachClients.get`, `logsWeight.list`, `messages.list` |

These counts exclude work that does not show in a 6 s window right after an idle period:
- the sync pass, which is throttled to one per 60 s;
- the service worker update check, which is not an API call;
- the client-side IndexedDB work: 6 full store reloads plus a full-history streak recompute on every client resume (§4.3).

---

## 2. Journey timings — what is real cost and what only feels slow (brief §32)

| Moment | What the user waits for today | Measured / estimated | REAL cost | FEELS-SLOW factor | Findings |
|---|---|---|---|---|---|
| **Initial load (first visit)** | Blank dark page until a 150 KB gz entry + render-blocking CSS + Google Fonts CSS load and run. Then Splash until the API chain and the role chunk finish | **FCP 3.5 s / content 4.8 s Slow-4G; FCP 7.5 s / content 9.3 s 3G** | Entry 464 KB raw / 150 KB gz (en.json ≈ 84 KB raw of it). CSS 130 KB / 22 KB gz, ≈44% website-only. 25 font styles requested. A 2.34 MiB precache starts downloading during boot | No HTML splash, so nothing paints before the JS has run. The Splash has no progress meaning | PF-17, PF-18, PF-01 |
| **PWA reopen (returning)** | Splash until `auth.refresh` → `auth.me` → `assessment.get` | **345 ms / 1.0 s / 1.5 s** to content (local server); FCP ≈ 0.18 s | Three dependent round trips plus IndexedDB scans. Production adds cold start and Atlas latency. **No timeouts**: on a connection that passes no data, the Splash is endless. Offline: crash in HEAD (BV-03) / login screen in RC2 | 0.8–1.3 s of Splash showing data that is already on the device | PF-01, PF-02, PF-03 |
| **Route transitions** | Client pages are local and render immediately once their chunk is loaded. On the **first visit to each lazy page**, the whole shell (header and nav) is swapped for a 4-card skeleton. Every page fades in from opacity 0 over **450 ms**. Coach pages show skeletons whenever the in-memory cache is empty, which is every launch | Chunk from the precache: tens of ms. The fade adds 450 ms of visual latency on every tab switch | Small | High: chrome flash + fade + skeleton on every coach screen after each launch | PF-19, PF-21 |
| **Client detail (coach opens a client)** | Workspace header + Overview: **10 procedures in one batched request** (user, profile, assessment, relationship, last weight, last 10 workout logs, notes, workout/nutrition/cardio plans). Every procedure re-checks coach access | Static estimate: 1 RTT + the slowest procedure. The first open also flashes the lazy chunk | Full plan bodies fetched only to count "plans assigned". Each workspace tab fetches its own data, so each shows its own skeleton | Header stats render "0/—" while loading (CO doc) | PF-13, PF-12, PF-19 |
| **Library load** | `coachAssets.exercises.list` returns all 909 exercises with every field, no projection, no pagination | **4.8 s to first row on Slow-4G, 835 KB** (uncompressed in the test; production with gzip ≈ 140 KB, about 0.7 s on Slow-4G — verify). Refetched after every save, delete or seed, and when the picker opens on stale data | Mongo reads 909 docs per call. JSON parse cost on low-end phones | Empty list during the load. Every save reloads the whole library | PF-11, PF-12 |
| **Search latency** | Client list, exercise library and picker: in-memory filtering, instant once the data is loaded. **Food search**: 400 ms debounce + server proxy to wger.de + the external API. Existing-client search: a server round trip per submit. Coach ⌘K: cache-only | Food: debounce + external RTT (not measured). In-memory searches: instant | Food results can arrive out of order (no stale-response guard). The cache is per server instance only | The picker shows nothing until the 835 KB library has loaded | PF-29, PF-11 |
| **Message open** | Lazy `Messages` + `MessageThread` chunks (29 KB raw). The first poll fetches the last 200 messages. "Working…" shows until it lands | 1 RTT + chunk. New messages then arrive with **up to 5 s delay**; read receipts with up to 20 s | 12 thread polls/min, plus duplicate badge loops on the same thread (18 `messages.list`/min measured) | Send is optimistic (good). Incoming messages feel laggy | PF-05, PF-06, PF-08 |
| **Workout open** | Local data. Lazy `WorkoutSession` chunk (19.5 KB) | Instant after the chunk | Whole session page re-renders every second during a workout | First visit per session: chrome flash | PF-26, PF-19 |
| **Media start** | Exercise video = `<video preload="metadata">` on the original source file. No poster, no rendition chosen for the device | BV-07: wger `.MOV` files of **1.1 MB (640×352) up to 38 MB (1920×1080)**. Drive/Vimeo/Instagram links never start | Full-resolution originals over mobile data. **Production uploads fail (Bunny 401)**, so new coach videos cannot be added | Black box until the first frame. Dead player with no message on unsupported links | PF-25 |
| **Image load** | Clients never see exercise images (BV-17). Progress-photo grids load 1600 px originals. Avatars are uploaded at 512 px and shown at 32–40 px. The Splash logo is 960×640, shown at 288 px | Not measured | Several hundred KB per photo grid | Message images have no intrinsic size, so the layout jumps (compensated by scroll-to-bottom) | PF-28 |

---

## 3. Weight: bundles, CSS, fonts, precache, payloads

### 3.1 JavaScript and CSS (HEAD build)

| Asset | Raw | gzip | Notes |
|---|---|---|---|
| Entry `index-CIivkq9d.js` | 464 KB | **150 KB** | react-dom 28% · **en.json ≈ 18%** · i18next 10% · localforage 6% · React Query core 6% · tRPC client 5% · router 5% · Capacitor 2% (native only) · app code 16%, which includes **all client-only stores and demo seeds, loaded for every role** |
| Main CSS `index-BdmSntFA.css` | 130 KB | 22 KB | Rebuilt with app-only Tailwind content: 72 KB / 12.9 KB gz, so **≈ 9.5 KB gz (44%) is website, marketing and experience styles** that block every app render |
| `ClientApp` + static deps | ~110 KB | ~31 KB | Home is eager. Every other client route is lazy |
| `CoachApp` | 61.5 KB | 17 KB | + 21 shared chunks |
| `SitePages` (website **+ the app's login form** in HEAD) | 228 KB | 71 KB | **Not precached** (`vite.config.ts:78`) |
| `Experience` (three.js) | 556 KB | 146 KB | Lazy and not precached ✓, but its CSS and images *are* precached |
| `ar` / `ar-eg` | 109 / 106 KB | 32 / 32 KB | Lazy ✓. Both precached for every user |

No website, marketing or three.js **JavaScript** is in the entry ✓. The leaks are CSS, the precache, the login chunk (HEAD), and the legacy landing page that is eagerly bundled into the anonymous chunk (≈19.5 KB).

### 3.2 Fonts
`index.html` loads one render-blocking Google Fonts stylesheet requesting **Poppins (9 styles), DM Mono (4), Lora (4), Cairo (4) and IBM Plex Sans Arabic (4)**:
- IBM Plex Sans Arabic is used only by the website (`tailwind.config.ts:122-123`).
- Lora is used for client initials in three lists and one italic word.
- The fonts are not precached. The SW caches them at runtime, so an install that has never loaded them renders fallback fonts offline.

### 3.3 Precache (service worker install)
- **159 entries / 2,341.92 KiB** (measured build). About **1.21 MB on the wire** (gzip estimate).
- **≈ 592 KB (49%) is marketing-only**: `/experience/forma-mark.png` 225 KB, `forma-lockup.png` 213 KB, `forma-wordmark.png` 149 KB and `Experience-*.css` 27 KB. Only the three.js page uses `forma-mark.png`; lockup and wordmark are unreferenced.
- `icon-512.png` and `icon-maskable-512.png` are byte-identical (32 KB each).
- The SW registers with `immediate: true` (`main.tsx:17`), so on a first visit the whole precache downloads while the app is still booting.

### 3.4 Large responses

| Response | Size | When |
|---|---|---|
| `coachAssets.exercises.list` | **835 KB** measured (909 docs, every field) | Library open; picker open; after every library save, delete or seed |
| `coachAssets.workoutTemplates.list` / `nutritionTemplates.list` | Full template bodies (10 seeded templates with embedded days and exercises) | Every coach dashboard load, **only to show a count** (`coachDashboardApi.ts:81-82,215`) |
| `sync.pull` with `since=0` | Whole collection history, unpaginated | First sync on a new device, after an account switch, after a cursor reset. Vercel caps a function response at 4.5 MB |
| `messages.list` full window | Last 200 messages (≈60 KB raw estimate) | Every 4th tick of every thread or badge poller |
| `checkIns.list` | Full check-in history | Every 60 s on client Today, to read item `[0]` |
| `messages.coachThreadsSummary` | Small output, but **reads every message of every client** | Every 20 s per coach tab |

The 1 MB `public/data/exercise-library.json` is **not fetched by any client code**: `fetchStarterExercises` has no callers. The cost shows up as the per-coach copy described above.

---

## 4. Network behaviour by journey (brief §33)

### 4.1 Pollers (everything that repeats on its own)

| Poller | Interval | Mounted | Instances | Notes |
|---|---|---|---|---|
| Open thread `subscribeMessages` | **5 s** (full 200-message window every 4th tick) | `MessageThread` | 1 | `messagesApi.ts:20,32,79-122` |
| Client unread badge `subscribeThreadMeta` | 20 s | `BottomNav` **and** `NavMenuSheet` (mounted while closed) | **2, not shared** | `useClientMessageUnread.ts:21`, `BottomNav.tsx:14`, `NavMenuSheet.tsx:24`, `BrandBar.tsx:56` |
| Coach unread/inbox summary | 20 s | Sidebar, BottomNav, NavMenuSheet, Inbox | 1 (shared per coach ✓) | `messagesApi.ts:240-277` |
| Notifications feed `pollFeed` | 25 s | Each `NotificationBell` + `/notifications` | **coach: 2 (+1)**, client: 1 (+1) | `notificationsApi.ts:44,59-89`. Both coach bells stay mounted and are hidden with CSS (`ResponsiveShell.tsx:34-39`) |
| Client sync engine | 120 s + resume (60 s throttle) + `online` | App root, **all roles** | 1 | `cloudStore.ts:94-122` |
| Active check-in | 60 s, `staleTime 0` | Client Today | 1 | Full history (`useActiveCheckIn.ts:14-21`, `checkInApi.ts:44-47`) |
| Coach plan requests | 60 s | **Every coach page** | 1 | `CoachPlanBanner.tsx:21`; server runs 3 index checks one after another per call (PF-15) |
| Coach "view as client" nutrition | **15 s**, 5 procedures per tick | `CoachViewNutrition` | 1 | `CoachViewNutrition.tsx:27-33` → 20 calls/min |
| Coach My Plan / admin payment requests | 60 s | Those pages | 1 | `CoachPlan.tsx:36`, `PaymentRequestsTab.tsx:46-49` |
| SW update check | 60 s + every resume | App root | 1 | `main.tsx:37-43`. sw.js (and likely workbox) with `no-store` |

Pollers pause while the tab is hidden ✓. They do **not** back off on errors, idle, slow networks or low battery, and they never coalesce with each other.

### 4.2 Representative journeys

| Journey | Duplicates | Polling | Failed requests / retries | Large responses | Unnecessary refetch | Storms |
|---|---|---|---|---|---|---|
| **Client cold open → Today** | `coachNotes.list` + `coachTargets.get` fetched twice (two cache keys + the content sync). The content sync runs **twice per launch** (effect re-runs when `submitted` flips) | Thread meta ×2, notifications, check-in and sync start at once | No timeouts. If `auth.refresh` fails offline → signed out (BV-03). RQ `retry: 1` | — | `assessment.get` on every launch | Boot burst ≈ 20 calls in ~6 requests |
| **Client idle on Today** | `messages.list` ×2 loops | 14 req/min measured | Poll errors are swallowed and retried at the same rate (no backoff) | Full 200-message window every 4th badge tick; full check-in history each minute | Sync re-pulls the last 10 min of records every pass | — |
| **Client opens a thread** | Same thread polled by 3 loops | **21 req/min measured** (`messages.list` 18/min) | Same | 4–5 full 200-message windows/min | **`markRead` sent twice per 5 s tick** while any incoming message lacks `seenAt` in local state (up to ≈8 mutations per received message) | — |
| **Client logs water / meal / set** | — | Writes stay local until the next sync tick (≤2 min) | Sync errors leave records dirty and retry next pass ✓ | — | Each tap recomputes streaks from **full history** in IndexedDB (4 full scans, no debounce) | Rapid taps queue full scans back to back |
| **Client resume** | `coachNotes.list` ×2, `coachTargets.get` ×2 | — | After >15 min hidden the access token has expired. Parallel 401s → parallel `auth.refresh` with no single-flight against rotate-on-use refresh tokens → possible spurious sign-out (PF-10) | — | Content sync runs on **both** `focus` and `visibilitychange`, with no throttle | **12 calls in 2–3 requests (measured)**, plus 6 full store reloads, a streak recompute, a sync pass if >60 s, and the SW check |
| **Client reconnect** | — | Forced sync pass | RQ `refetchOnReconnect` refetches stale queries | — | Coach-assigned content is **not** refreshed on reconnect (stale until the next focus) | Sync burst (≥11 calls in sequence) |
| **Coach cold open → Clients** | Roster (`listMyClientUsers`) ×2; thread summary inside the dashboard *and* in the poller | Summary 20 s, notifications ×2, plan requests 60 s, **client sync** | No timeouts; skeleton forever on error on 12 screens (CO doc) | Full template bodies for counts | — | Batches of 10–14 calls held until the slowest one completes (PF-13) |
| **Coach idle (dashboard / clients)** | Notification bells ×2 | **13.5–14.5 req/min measured** | Swallowed errors, no backoff | — | Sync engine: 11 calls every 2 min that do nothing useful for a coach | — |
| **Coach in a thread** | — | **25 req/min measured** | Same | Full 200-message window every 4th tick | Double `markRead` per tick (same as the client) | — |
| **Coach opens the library** | — | — | Retry 1 | **835 KB** | Every save, delete or seed reloads the whole library | — |
| **Coach edits a plan and saves** | — | — | **Mutations: no retry; offline = endless "Saving…"** (CO doc) | Full plan bodies | Mutation → invalidate → refetch. 0 cache writes; dashboard aggregates (6 procedures) invalidated by 8 kinds of mutation | — |
| **Coach resume** | Roster ×2 on Clients | — | Same token race | Templates for counts | `staleTime` 60 s means most screens refetch on every resume | **4–11 calls in 1 request (measured)** |

### 4.3 The resume storm in detail (client)
Each return to the app runs:
1. React Query refetches every stale query on screen. `activeCheckIn` has `staleTime 0`, so it always refetches.
2. `ClientGate` re-runs the coach-content sync on both `visibilitychange` **and** `window.focus` (`ClientApp.tsx:115-123`): 4 reads, IndexedDB writes, **6 full store reloads**, and a full-history streak recompute.
3. `App.tsx:63-70` calls `auth.me`. A failure signs the user out (PWA doc).
4. `cloudStore.ts:113-115` runs a sync pass if the last one was >60 s ago: ≥11 calls in sequence plus 8 full IndexedDB scans.
5. `main.tsx:41-43` checks for a service-worker update.
6. A new account object re-renders the whole tree.

On desktop, clicking back into the window repeats steps 1–2.

### 4.4 Failed requests and retries (code)
- **Client fetch:** no `AbortController` or timeout anywhere (`trpc.ts:16-30`, `platformApi.ts:36-53`).
- **401:** refresh, then one retry, with no single-flight (`trpc.ts:26-28`).
- **Queries:** React Query `retry: 1` (`queryClient.ts:16`). Mutations get the default 0.
- **Pollers:** swallow every error and retry at full rate (`messagesApi.ts:105-108`, `notificationsApi.ts:78-80`). Badges go silently stale.
- **Server:** the Mongo client caches a **rejected** connect promise for the life of the instance, and uses the driver's default **30 s** server-selection timeout (`api/_lib/mongodb.ts:14-28`).

---

## 5. Server-side cost

| Procedure | Called | What it does | Problem | Evidence |
|---|---|---|---|---|
| `messages.coachThreadsSummary` | Every 20 s per coach tab + every dashboard load | `$match clientId ∈ all active` → `$sort createdAt` → `$group $last:$$ROOT` | **Reads every message ever, for every client, on every poll**. Grows without bound | `api/_trpc/routers/messages.ts:250-284` |
| `notifications.list` (coach) | 25 s × 2 bells | Active-client lookup + `$in` find (limit 50) + **`countDocuments({…, seenAt:null})`** | Index `{clientId, forRole, createdAt}` lacks `seenAt`, so the count fetches every coach-role notification ever. No TTL | `notifications.ts:16-28`, `notifications-data.ts:127-136`, `scripts/mongo-init-indexes.mjs:48` |
| `coachClients.dashboardSummaries` | Dashboard, Adherence, Assessments | Aggregates **all finished workout logs ever** (full docs with sets) for a 7-day count + latest date | Grows with history | `coachClients.ts:143-189` |
| `messages.list` | Thread 5 s, badges 20 s | Indexed find ✓ | **`createIndex` on every call** | `api/messages/_data.ts:95-102` |
| `coachPlanRequests.mine` | Every coach page, 60 s | find (limit 30) | **3 sequential `createIndex`** per call | `api/coach-plans/_data.ts:215-232` |
| Coach-asset lists (exercises, templates, foods…) | Library, dashboard, editors | `find({coachId})` with no projection | **7 parallel `createIndex` per accessor call**. 909-doc payloads | `api/coach-assets/_lib/db.ts:35-79`, `coachAssets.ts:92-100` |
| Capacity entitlements | Commercial screens | — | 4 sequential `createIndex` | `api/coach-plans/_capacity.ts:83-94` |
| `sync.pull` / `sync.push` / `deletionsPush` | Every sync pass | Unbounded find; one `updateOne` per record, in sequence | No pagination (4.5 MB cap). No bulk writes. `deletionsPull` filter `{clientId, syncedAt}` does not match index `{clientId, collection, syncedAt}` | `sync.ts:27-88`, `mongo-init-indexes.mjs:44` |
| `checkIns.list` | Client Today, every 60 s | Full history | Used for item `[0]` only | `clientCheckIns.ts:26-30` |
| Every procedure in a batch | — | Access check per procedure | ~10 repeated `coachClients` lookups per workspace batch (cheap individually) | `api/client/_lib/access.ts` |
| **Function topology** | All | One Vercel function hosts all 43 routers. It loads `mongodb`, `google-auth-library`, `resend`, `bcryptjs`, `jsonwebtoken`, and a traced 1 MB JSON | Every call, including 5 s polls, pays the largest possible cold start. No region or compute configuration in `vercel.json` | `api/trpc/[trpc].ts`, `api/_trpc/router.ts`, `api/_lib/google.ts:1`, `api/_lib/email.ts:4` |

**Idle load on the server:** about 900–1,600 calls per hour per open app (§1.2). Each call is ≥2–4 Mongo round trips: the context user lookup, any index check, and the query itself. Polling cost scales linearly with open apps. 500 open apps ≈ 7k–13k calls per minute before anyone does anything.

---

## 6. Rendering and main-thread work

| Hotspot | Evidence | Effect |
|---|---|---|
| Streak recompute from full history on every nutrition, cardio or workout change (13 call sites) and on every boot, resume and day change | `habitStore.ts:55-115`; `notifyHabitChange` calls in nutritionStore (9), cardioStore (3), workoutStore (1) | 4 full IndexedDB scans per tap, with no debounce. A user with one year of history scans ~1–1.5 MB (estimate). Grows forever |
| Repeated full scans at launch | `workoutLogs.getAll()` runs from App bootstrap, habits, the content sync (×2), sync push and the post-pull reload | ≈5–7 full scans of the largest store in the first seconds, on the main thread |
| Workout session re-renders every second | `WorkoutSession.tsx:80` (`useElapsed` at page level) | The whole page (header, current exercise, up-next) re-renders 1×/s for the whole workout |
| Each set edit replaces `logs` | `workoutStore.ts:213-227` | Every `logs` subscriber re-renders per keystroke. Persist is debounced ✓ |
| Rest timer bar subscribes to the whole store | `RestTimerBar.tsx:12`, `timerStore.ts:61-73` | 4 renders per second while resting |
| Pollers emit new arrays every tick | `notificationsApi.ts:74-77`, `messagesApi.ts:92-104` | Bell re-renders every 25 s. The thread effect re-runs every 5 s and forces a reflow (rows are memoized ✓) |
| New `account` object on every resume | `sessionStore.ts:150`, `App.tsx:47` | The whole role app re-renders on each foreground |
| Lists | Coach library and foods paginate (25), picker capped at 50, client list renders incrementally, threads limited to 200 rows with memoization | **No virtualization problem today.** The cost is network, not DOM |

---

## 7. Findings

### PF-01 — Client boot waits on three dependent API calls before showing local data
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** Client (and coach) · every app open · all viewports
- **Evidence:**
  - Code: `App.tsx:72-101` (session init starts only after all IndexedDB loads; Splash until `phase !== 'loading'`); `sessionStore.ts:80-91` (refresh, then `me`); `platformApi.ts:36-53`, which **discards the `user` that `auth.refresh` already returns** (`api/_trpc/routers/auth.ts:142`); `ClientApp.tsx:137` + `useAssessmentStatus.ts:15-21` (Splash until `assessment.get` on every launch, because the cache is not persisted).
  - Browser: BV-25 chain and timings.
- **Steps / scenario:** Reopen the installed PWA with a warm SW on Slow-4G.
- **Expected vs actual:**
  - Expected: Today paints from IndexedDB in ~0.2–0.4 s; identity and assessment revalidate in the background.
  - Actual: 1.0 s (Slow-4G) / 1.5 s (3G) to content with a local server. First paint is at 0.18 s, and the remaining time is Splash.
- **Why it matters:** This is the most frequent wait in the product, and it scales with real network and server latency. In production, add cold starts and the Atlas round trip. Offline it becomes the P0 sign-out/crash (BV-03/BV-04, PWA doc).
- **Direction:** Boot from a cached identity record (role, ids, status, assessment-submitted flag) and render the role app at once. Start session restore in parallel with the local load. Use the refresh response's user and drop the extra `auth.me`. Revalidate in the background. Demote the session only on a definitive 401 or suspension, never on a network error. Gate the client app on the assessment only when the cached status is "not submitted".
- **Verified:** BROWSER-VERIFIED

### PF-02 — No timeouts anywhere on the request path
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** All roles · boot, every query, mutation and poll · weak Wi-Fi or captive networks
- **Evidence:** `trpc.ts:16-30` and `platformApi.ts:36-53` (`fetch` with no `AbortController` or timeout); `api/_lib/mongodb.ts:14-28` (driver default 30 s server selection; a rejected `client.connect()` is cached forever, so one failed connect poisons that function instance).
- **Steps / scenario:** Open the app on a network that is up but passes no data (gym Wi-Fi, a captive portal, a dropping 3G cell).
- **Expected vs actual:**
  - Expected: Boot falls back to cached state within ~2–3 s; requests fail fast and say so.
  - Actual: The Splash waits until the browser gives up. Server calls can hang 30 s during an Atlas incident, and a poisoned instance fails every request until it is recycled.
- **Why it matters:** "The app is stuck on the logo" is the worst perceived-performance failure, and it happens exactly where this product is used.
- **Direction:** Set a per-request timeout budget (boot-critical calls short, others moderate). Use fast-fail Mongo client settings and reset the cached connection after a failure. Surface "offline / retrying" states instead of waiting forever.
- **Verified:** CODE-CONFIRMED

### PF-03 — In HEAD, the app's login screen lives in the non-precached website chunk
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** MOVE
- **Who / where:** Signed-out PWA users, and every client that drops to anonymous offline (BV-03) · `/login` · **HEAD only** (RC2 renders login from app code)
- **Evidence:** `AnonymousApp.tsx:14-18,76,79` (`/login` and `*` render `SiteAuth` from `SitePages`); `vite.config.ts:78` (`SitePages-*.{js,css}` excluded from the precache); `SitePages` = 228 KB raw / 71 KB gz + 11 KB CSS, of which the auth form is ~8 KB. BV-03: "Unable to preload CSS for /assets/SitePages-*.css" crash. `evidence/client-offline-reopen-crash.png`.
- **Steps / scenario:** Installed PWA → reopen offline, or sign out on a slow network.
- **Expected vs actual:**
  - Expected: A precached ~10 KB login screen that renders instantly, offline included.
  - Actual: The entire marketing site has to download first (71 KB gz). Offline, the app crashes.
- **Why it matters:** It turns a recoverable state (signed out) into a dead end, and it charges every logged-out app user for the website.
- **Direction:** Move the auth screens back into the app's own precached anonymous chunk. Keep the website out of the PWA.
- **Verified:** BROWSER-VERIFIED

### PF-04 — Coach and admin sessions run the client sync engine
- **Priority:** P1      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** Coach and admin · every screen
- **Evidence:** `cloudStore.ts:94-122` (sync starts for any signed-in account; there is no role check); `App.tsx:88`. Measured: coach boot chain includes `sync.deletionsPull`, `sync.singletonGet` and `sync.pull` (BV-25). Every coach idle run shows `sync.pull` ×8, `singletonGet` ×2, `deletionsPull` ×1 per 120 s (§1.2). The data-integrity side (a client's unsynced records pushed into the coach's namespace) is a P0 in the PWA doc.
- **Expected vs actual:**
  - Expected: Coaches never touch the client sync endpoints.
  - Actual: 11 calls in sequence at boot and every 2 min, plus 8 full IndexedDB scans.
- **Why it matters:** About 40% of a coach's idle traffic is useless, and the boot chain is longer than it needs to be.
- **Direction:** The sync engine belongs to the client role only. Coaches and admins should not load client stores or seeds at all (see PF-17).
- **Verified:** BROWSER-VERIFIED

### PF-05 — Polling is the only realtime channel: 13.5–25 requests/min per open app, with no backoff
- **Priority:** P1      **Effort:** L      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** All roles · all screens
- **Evidence:** §1.2 measurements; §4.1 inventory (`messagesApi.ts`, `notificationsApi.ts`, `cloudStore.ts`, `CoachPlanBanner.tsx:21`, `useActiveCheckIn.ts`, `CoachViewNutrition.tsx`). Errors are swallowed and retried at the same rate (`messagesApi.ts:105-108`, `notificationsApi.ts:78-80`).
- **Expected vs actual:**
  - Expected: One lightweight "anything changed?" channel per user (or push), with adaptive cadence: faster in an active thread, slow when idle, backing off on errors.
  - Actual: 5–7 independent loops on fixed timers. 900–1,600 calls per hour per open app. Messages arrive up to 5 s late and read receipts up to 20 s late.
- **Why it matters:** Server cost grows linearly with open apps, and battery and data drain on phones left open on a gym bench. The design also caps how real-time messaging can feel.
- **Direction:** Replace the pollers with a single change feed per user (a server-side cursor covering messages, notifications, plan, subscription and check-ins). Keep a fast cadence only while a thread is open and focused, and use push where available. Decide in Phase B architecture whether a realtime transport (SSE or a hosted pub/sub) is worth it on Vercel.
- **Verified:** BROWSER-VERIFIED

### PF-06 — Duplicate pollers on the same data
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** Client Today and thread · coach every screen
- **Evidence:**
  - The client thread meta is polled by `BottomNav.tsx:14` and by `NavMenuSheet.tsx:24`, which stays mounted while closed (`BrandBar.tsx:56`). It is not shared (`messagesApi.ts:200-213`).
  - The coach has two `NotificationBell`s mounted at once: `BrandBar.tsx:42` (hidden with CSS on desktop) and `DesktopTopBar.tsx:27` (hidden on mobile), via `ResponsiveShell.tsx:34-39`.
  - Measured: `messages.list` 6/min on Today (expected 3), 18/min in a thread (12 needed); coach `notifications.list` 5/min (2.4 needed).
- **Expected vs actual:**
  - Expected: One subscription per data source.
  - Actual: Client thread polled 2–3× over; coach notifications polled 2×.
- **Why it matters:** About a third of the client's idle message traffic and half of the coach's notification traffic is duplicate.
- **Direction:** Share subscriptions per data source the way the coach thread summary already does. Mount only one bell per breakpoint, and render the menu sheet only while it is open. Superseded by PF-05 if that ships.
- **Verified:** BROWSER-VERIFIED

### PF-07 — The same data fetched under different cache keys
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** MERGE
- **Who / where:** Client boot and resume · coach Clients
- **Evidence:**
  - `fetchMyCoachNotes` runs as `['coachNotes', uid]` (`ClientNotesProvider.tsx:16`) and as `['myCoachNotes', uid]` (`useCoachContent.ts:16`).
  - `fetchMyCoachTargets` runs in `clientSync.ts:66-71` and as `['myCoachTargets']` (`useCoachContent.ts:17`).
  - The roster runs as `['myClients']` and inside `getCoachDashboard` (`coachDashboardApi.ts:77-84`). The thread summary runs inside the dashboard and in the poller.
  - Measured on resume: `coachNotes.list` ×2, `coachTargets.get` ×2, `listMyClientUsers` ×2.
- **Expected vs actual:**
  - Expected: One canonical query per resource.
  - Actual: 2× fetches at every launch and resume.
- **Why it matters:** Wasted calls in the busiest moments (boot and resume). The duplicates also return slightly different shapes, so screens can disagree.
- **Direction:** One query-key registry per resource. Build the dashboard aggregate from the shared queries, or move it to a server endpoint.
- **Verified:** BROWSER-VERIFIED

### PF-08 — `markRead` is sent twice on every poll tick while an incoming message looks unseen
- **Priority:** P2      **Effort:** S      **Impact:** LOW
- **Action:** REBUILD
- **Who / where:** Client and coach · open thread
- **Evidence:** `MessageThread.tsx:347-353` (effect on every new `combined` array: `markThreadSeen` and `markMessageNotificationsSeen`, which both call `messages.markRead`, per `notificationsApi.ts:134-140`). `since` polls never refresh `seenAt` (`messagesApi.ts:24-32`), so the condition stays true until the next full refresh.
- **Steps / scenario:** Receive a message while the thread is open.
- **Expected vs actual:**
  - Expected: One `markRead` per newly seen message.
  - Actual: 2 mutations per 5 s tick for up to 4 ticks (≈8). Each one updates messages, looks up the coach roster and updates notifications.
- **Why it matters:** Wasted writes on the busiest collection, plus an avoidable reflow each tick.
- **Direction:** Track which message ids have already been marked seen and send one call. Update `seenAt` locally on success.
- **Verified:** CODE-CONFIRMED

### PF-09 — Resume storm on every foreground
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** Client (strongest) and coach · every return to the app
- **Evidence:** §1.3 (12 calls client, up to 11 calls coach, measured). `ClientApp.tsx:82-130`: the content sync runs on both `focus` and `visibilitychange` with no throttle, and **re-runs once per launch** because `submitted` is in the effect dependencies (`:130`). It ends with 6 full store reloads + a streak recompute. Also `App.tsx:63-70` (`auth.me`), `cloudStore.ts:113-115` (sync), `main.tsx:41-43` (SW check).
- **Expected vs actual:**
  - Expected: One coordinated, throttled freshness check per resume (one request), reloading only what changed.
  - Actual: 2–3 requests carrying 9–12 calls, plus heavy IndexedDB work on the main thread just as the user starts interacting.
- **Why it matters:** Phone users resume constantly between sets. The work lands at the moment the UI must feel responsive.
- **Direction:** A single resume coordinator (throttled to minutes) that asks the change feed (PF-05) "what changed since T" and reloads only affected stores.
- **Verified:** BROWSER-VERIFIED

### PF-10 — Token refresh can race itself and sign the user out
- **Priority:** P1      **Effort:** S      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** All roles · resume after >15 min in background, or any burst of 401s
- **Evidence:**
  - Access token TTL is 15 min (`api/_lib/tokens.ts:7`). Refresh tokens are rotated and the old one revoked on every use (`tokens.ts:105-116`, `auth.ts:133-143`).
  - `trpcFetch` refreshes on every 401 with no single-flight (`trpc.ts:26-28`).
  - The resume storm sends separate batches in different ticks (§4.3). A losing refresh gets 401. If the loser is `auth.me`, `refreshAccount` clears the session (`sessionStore.ts:151-164`).
- **Steps / scenario:** Leave the app in the background for more than 15 minutes, then reopen it on a normal network.
- **Expected vs actual:**
  - Expected: Exactly one refresh, after which every request continues.
  - Actual (inferred): Parallel refreshes. Depending on timing, one fails and the user lands on Login with valid credentials.
- **Why it matters:** Random sign-outs read as "the app is broken". Offline they are a hard stop.
- **Direction:** Single-flight the refresh. Refresh proactively before expiry. Give the server a short grace window for the just-rotated refresh token.
- **Verified:** INFERRED (needs device check: background >15 min, then watch for concurrent `auth.refresh` calls and a 401 on `auth.me`)

### PF-11 — The exercise library is an 835 KB payload, refetched on every change
- **Priority:** P1      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** Coach · `/coach/library`, exercise picker in plan and template builders · mobile networks
- **Evidence:**
  - `coachAssets.ts:92-100` (`find({coachId})`, all fields, no pagination). `coachAssets.ts:324-331`: seeding copies all 909 full objects into each coach's collection.
  - `CoachExerciseLibrary.tsx:91` and `ExercisePickerSheet.tsx:39` fetch it. Invalidated after save, delete and seed (`CoachExerciseLibrary.tsx:114,139,150,160`).
  - BV-25: **4.8 s to first row on Slow-4G, 835 KB**.
- **Expected vs actual:**
  - Expected: First rows in <1 s from a slim index (id, name, muscle, equipment, thumbnail flag); details on demand; edits patched into the cache.
  - Actual: The whole library on every open of stale data and after every save.
- **Why it matters:** The library and picker sit inside the coach's core job (building plans). On a phone this is a multi-second wait, repeated after every save.
- **Direction:** A server-side search and paginated list with a projection, plus a shared global catalogue instead of a 909-document copy per coach (EX doc). Update the cache from mutation results instead of refetching.
- **Verified:** BROWSER-VERIFIED (payload uncompressed in the test; production gzip would cut transfer to ~140 KB, but the server read and the parse stay)

### PF-12 — Coach saves never update the cache; every save waits for a write and a refetch
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REDESIGN
- **Who / where:** Coach and admin · every edit (plans, notes, subscriptions, library, clients)
- **Evidence:** 97 `useMutation` calls, **0 `onMutate`, 0 `setQueryData`, 119 `invalidateQueries`**. Most-invalidated keys: `coachDashboard` ×8 (6 procedures each), `coachAdmin` ×8, `coachDashboardSummaries` ×7, `workoutTemplates` ×5, `exerciseLibrary` ×4 (835 KB).
- **Expected vs actual:**
  - Expected: The UI reflects a save at once (optimistic, or written from the server's response); targeted background revalidation.
  - Actual: Spinner → write round trip → refetch round trip(s) of heavy aggregates.
- **Why it matters:** The coach app feels sluggish on every action, and each save multiplies server load.
- **Direction:** Mutations return the updated entity, and the client writes it into the cache. Use optimistic updates for toggles, notes and status changes. Narrow invalidation to what actually changed.
- **Verified:** CODE-CONFIRMED

### PF-13 — Batched requests wait for their slowest procedure
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** Coach screens (dashboard, clients, workspace) · client boot
- **Evidence:**
  - `trpc.ts:32-39` (`httpBatchLink`, no streaming, no split).
  - Measured: a coach resume sent 11 calls in **1** HTTP request (§1.3).
  - Batches mix cheap reads (roster, plan) with the heaviest aggregations (`coachThreadsSummary`, `dashboardSummaries`).
  - Identical calls in one batch are not deduplicated server-side.
- **Expected vs actual:**
  - Expected: Each result renders as soon as it is ready.
  - Actual: The client list waits for the message aggregation in the same batch.
- **Why it matters:** As the aggregations grow (PF-14), every screen in the batch gets slower, not just the one that needs the aggregate.
- **Direction:** Stream batch results (tRPC v11 supports this), or send pollers and heavy aggregates outside the batch.
- **Verified:** BROWSER-VERIFIED (batch composition) / INFERRED (production latency impact)

### PF-14 — Server queries that grow with all-time history
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** Coach (every tab, every 20–25 s) · client Today (every 60 s)
- **Evidence:** §5 table:
  - `messages.ts:250-284`: every message of every client, every 20 s.
  - `notifications.ts:25` with index `mongo-init-indexes.mjs:48`: unread count with no `seenAt` index, and no TTL.
  - `coachClients.ts:155-167`: all workout logs ever.
  - `clientCheckIns.ts:26-30`: full check-in history every 60 s.
- **Expected vs actual:**
  - Expected: Polled reads cost the same regardless of history size.
  - Actual: Cost grows with every message, notification and workout ever recorded.
- **Why it matters:** At today's seed data the latency is invisible. With real coaches after a year of use, these become the dominant database cost and the slowest item in every batch (PF-13).
- **Direction:**
  - Keep per-thread summaries (last message, unread counts) up to date on write.
  - Add partial indexes for unread items and expire old notifications.
  - Maintain a per-client "last activity / 7-day count" record.
  - Give each list endpoint a "latest" or limited variant.
- **Verified:** CODE-CONFIRMED (needs production-scale measurement)

### PF-15 — Index self-checks run on hot request paths
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** Server · messages, coach assets, coach plan requests, capacity
- **Evidence:**
  - `api/messages/_data.ts:95-102`: 1 per messages call, i.e. every 5 s poll.
  - `api/coach-assets/_lib/db.ts:35-79`: 7 in parallel per accessor call. The dashboard calls it twice, so 14 compete for a 10-connection pool.
  - `api/coach-plans/_data.ts:215-232`: 3 in sequence per `coachPlanRequests.mine`, which every coach page polls each minute.
  - `api/coach-plans/_capacity.ts:83-94`: 4 in sequence.
- **Expected vs actual:**
  - Expected: Indexes are ensured once (deploy or migration, or once per process).
  - Actual: Extra round trips to the primary on every request: 1 to 4 in sequence.
- **Why it matters:** This latency is invisible locally and real cross-region (tens of ms per round trip), on the most frequent calls.
- **Direction:** Ensure indexes at deploy time or migration, or memoize once per process. Keep the test-reset hook separate.
- **Verified:** CODE-CONFIRMED

### PF-16 — The client sync pass is long, sequential and full-scan
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** Client · every 2 min while visible, on resume and on reconnect
- **Evidence:**
  - `SyncEngine.ts:182-210`: deletions, then 2 singletons, then 8 collections, each pull → push, all in sequence (≥11 round trips).
  - `:75-101`: `getAll()` full scan per collection per pass to find dirty records.
  - `:39`: 10-minute overlap re-downloads recent records every pass.
  - `sync.ts:46-59`: unpaginated pull (4.5 MB response cap).
  - `sync.ts:27-42`: one `updateOne` per record, in sequence.
  - Measured cadence: `sync.pull` ×8 + `singletonGet` ×2 + `deletionsPull` ×1 per 120 s.
- **Expected vs actual:**
  - Expected: One request per sync, with dirty records tracked in a queue, paginated pulls and bulk writes.
  - Actual: ≈1.6–2.8 s (4G) / 4–6 s (3G) of sequential requests every 2 min, plus 8 full scans.
- **Why it matters:** Battery, data and main-thread time on the client. A long-history user on a new device may never complete a first sync.
- **Direction:** One sync request carrying all collections, driven by a dirty queue and a server cursor, paginated, with bulk upserts. Sync on write (debounced) instead of on a timer. The PWA doc covers conflict and integrity rules.
- **Verified:** BROWSER-VERIFIED (cadence) / CODE-CONFIRMED (structure)

### PF-17 — First visit is heavy: entry, critical CSS, fonts, no HTML splash
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** Every new client (invite link) and coach, and every web user without a warm SW · 390 · slow networks
- **Evidence:** BV-25: **FCP 3.5 s / content 4.8 s on Slow-4G; FCP 7.5 s / 9.3 s on 3G**. The entry is 150 KB gz:
  - en.json ≈ 84 KB raw is compiled into the JS (`src/i18n/index.ts:4,13-16`);
  - all client-only stores and demo seeds are bundled and run for every role (`App.tsx:72-99`; `bootstrap.ts:3-6`, and seeds never apply on the platform because `dataSource.ts:26-28` is always true);
  - Capacitor is bundled for web.

  Render-blocking CSS: 22 KB gz, about 44% website-only (`tailwind.config.ts:14` scans all of `src`). Google Fonts requests 25 styles across 5 families (`index.html`). `index.html` has an empty `#root`.
- **Expected vs actual:**
  - Expected: Something branded on screen in ≤1 s on Slow-4G (an HTML splash), and an entry under ~100 KB gz.
  - Actual: A blank screen for 3.5 s (Slow-4G) / 7.5 s (3G).
- **Why it matters:** A client's first experience is opening the invite link, often on mobile data.
- **Direction:**
  - Inline a minimal HTML/CSS splash.
  - Load strings as data (per locale, precached), not as JS.
  - Move client stores and the IndexedDB bootstrap into the client app only.
  - Separate the website's CSS from the app's.
  - Request only the font faces the app uses; consider self-hosted, precached fonts.
- **Verified:** BROWSER-VERIFIED (timings) / CODE-CONFIRMED (composition)

### PF-18 — Precache bloat, and the SW downloads it during first boot
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REMOVE
- **Who / where:** Every install and update · first visit
- **Evidence:** 159 entries / 2,341.92 KiB. **≈ 592 KB (49%) of the transfer is `/experience/*` PNGs + `Experience-*.css`**: `vite.config.ts:73,78` excludes only `Experience-*.js`; `src/pages/experience/forma/parts.ts:375` is the only user; lockup and wordmark are unreferenced. Duplicate 512 icon. Both Arabic chunks are precached for everyone. `registerSW({ immediate: true })` (`main.tsx:17`).
- **Expected vs actual:**
  - Expected: About 0.6 MB of app-only precache, downloaded after the first screen is interactive.
  - Actual: About 1.2 MB, half of it marketing images, downloading while the app boots.
- **Why it matters:** It doubles install data and competes with the first session's requests on slow networks.
- **Direction:** Precache only what the app shell needs. Runtime-cache optional locales. Register the SW after first meaningful paint.
- **Verified:** CODE-CONFIRMED

### PF-19 — Route changes flash a chrome-less skeleton, and every page fades in over 450 ms
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Client, coach, admin · first visit to each lazy page in a session; every page change
- **Evidence:**
  - One `Suspense` around all routes, outside each route's own shell: `ClientApp.tsx:149`, `CoachApp.tsx:76`, AdminApp `:47`.
  - `BrowserRouter` has no transition support (`main.tsx:50`, react-router 6.30), so the header and nav disappear while a chunk resolves.
  - `.anim-rise` = opacity 0→1 over 450 ms on 44 page wrappers (`index.css:384-414`).
- **Expected vs actual:**
  - Expected: Chrome stays put. The old page stays until the new one is ready. Content appears at once.
  - Actual: The nav blinks out to a 4-card skeleton, and every page then takes 0.45 s to become fully visible.
- **Why it matters:** Even with local data, every navigation looks slow.
- **Direction:** Keep the shell outside the loading boundary. Use transition-based navigation. Warm route chunks during idle time. Reserve motion for meaningful changes (≤150 ms).
- **Verified:** CODE-CONFIRMED (the flash lasts only tens of ms from the precache; confirm on a low-end device)

### PF-20 — Late banners and cards push content down on every launch
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Client Today and every client route · coach every page
- **Evidence:**
  - `App.tsx:124` + `BannerHost.tsx:85-107`: an in-flow banner **above the whole shell, on every route**, after a network read on each launch.
  - `AppShell.tsx:26-28`: subscription and reminder banners. `CoachApp.tsx:64-69` + `CoachPlanBanner.tsx:44-52`: up to 3 banners on every coach page.
  - `Home.tsx:182`: the check-in card lands above the hero. `Home.tsx:295-296`: coach cards render null until loaded.
  - `CoachDashboard.tsx:67-78`: hero stats and trial banner pop in.
  - BV-14: the coach thread composer hidden under the nav when a banner shows (`evidence/coach-thread-composer-under-nav.png`).
- **Expected vs actual:**
  - Expected: Stable layout from the first paint; status known from cache.
  - Actual: The layout jumps 1–3 times in the first second. Fixed-height layouts break.
- **Why it matters:** Mis-taps and a "still loading" feel. Already caused a shipped bug (BV-14).
- **Direction:** Render status from cached state on first paint. Banners belong inside page content (or as contextual inline notices), never above the shell. Reserve space for async cards, or place them below stable content.
- **Verified:** BROWSER-VERIFIED (BV-14) / CODE-CONFIRMED

### PF-21 — Coach screens start empty on every launch; error and loading states hide cached truth
- **Priority:** P2      **Effort:** M      **Impact:** HIGH
- **Action:** REBUILD
- **Who / where:** Coach and admin (every screen after each launch); client on a fresh device
- **Evidence:**
  - `queryClient.ts:8-27`: the cache is not persisted.
  - Twelve network-backed screens render `!data → <LoadingState/>` with no error branch, so an error shows a skeleton forever (e.g. `CoachDashboard.tsx:83`, `CoachReports.tsx:33`; full state matrix in the CO doc).
  - `coachContentStore.ts:20` (`'idle'`) + `Home.tsx:198-205` / `Nutrition.tsx:64-71`: "Waiting for your coach…" while content is still loading on a fresh device.
- **Expected vs actual:**
  - Expected: The last-known data renders immediately and refreshes in place. Errors offer retry. Loading never looks like "no plan".
  - Actual: A skeleton on every coach screen after every launch, skeletons forever on errors, and a false empty state for new devices.
- **Why it matters:** The coach app feels slow even when the network is fast. False empty states erode trust.
- **Direction:** A persisted, per-user query cache with "as of" freshness and explicit authoritative refetch for money and plan data (PWA doc rules). A distinct loading state for the first coach-content sync.
- **Verified:** CODE-CONFIRMED

### PF-22 — Polling fetches far more than it shows
- **Priority:** P2      **Effort:** S      **Impact:** MEDIUM
- **Action:** REDESIGN
- **Who / where:** Client Today · coach "view as client" nutrition · coach dashboard
- **Evidence:**
  - `useActiveCheckIn.ts:14-21` + `checkInApi.ts:44-47`: the full check-in history every 60 s to read item `[0]` (measured `checkIns.list` ×2 per 120 s).
  - `CoachViewNutrition.tsx:27-33`: 5 procedures every 15 s = 20 calls/min.
  - `coachDashboardApi.ts:81-82,215`: full workout and nutrition template bodies to show `templatesCreated`.
- **Expected vs actual:**
  - Expected: Polls fetch only "latest" or count shapes.
  - Actual: Full histories and bodies on every tick.
- **Why it matters:** Steady background bandwidth and DB load that grows with history.
- **Direction:** Use "latest" and count endpoints, slower cadences, and in practice fold these into the change feed (PF-05).
- **Verified:** BROWSER-VERIFIED (check-in poll) / CODE-CONFIRMED

### PF-23 — Client CPU and IndexedDB work grows with history
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** Client · every water, meal, supplement or cardio tap; boot; resume; day change
- **Evidence:** `habitStore.ts:55-115`: each `refresh()` ends in `refreshStreaks()` = full `getAll()` of daily checklists, workout logs, nutrition logs and cardio logs. 13 `notifyHabitChange()` call sites, no debounce. `workoutLogs.getAll()` runs ≈5–7× at launch (bootstrap, habits, content sync ×2, sync push, post-pull reload).
- **Expected vs actual:**
  - Expected: Constant-time updates per tap; streaks maintained incrementally.
  - Actual: Every tap rescans the full history. A one-year user scans ~1–1.5 MB (estimate) on the main thread.
- **Why it matters:** Taps get janky over time, which hurts most on the low-end phones common in the target market.
- **Direction:** Incremental streak and summary state. Load each store once per boot and share it. Debounce derived recomputes.
- **Verified:** CODE-CONFIRMED (magnitude INFERRED; measure on a long-history account)

### PF-24 — One serverless function carries the whole API
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** Server · every call, including 5 s polls
- **Evidence:** `api/trpc/[trpc].ts` → `api/_trpc/router.ts` (43 routers, eager imports). Eager `google-auth-library` (`api/_lib/google.ts:1`), `resend` (`api/_lib/email.ts:4`), `mongodb`, `bcryptjs` and `jsonwebtoken`, plus the 1 MB exercise JSON traced in (`api/coach-assets/_lib/exerciseLibrary.ts:30-36`). No region or memory settings in `vercel.json`.
- **Expected vs actual:**
  - Expected: Hot polling and read paths cold-start small and run next to the database.
  - Actual: Every cold start loads everything. Region co-location with Atlas is unverified.
- **Why it matters:** Cold starts add on top of PF-01's three sequential calls in production.
- **Direction:** Measure in production first. Then lazy-load rarely used dependencies, move hot paths to a slim function, and pin the region next to Atlas.
- **Verified:** INFERRED (needs production timing)

### PF-25 — Media start streams full-resolution originals
- **Priority:** P2      **Effort:** M      **Impact:** MEDIUM
- **Action:** REBUILD
- **Who / where:** Client · exercise detail, workout session · mobile data
- **Evidence:** `ExerciseView.tsx:39-47` (`<video preload="metadata">` on the source URL, no poster). The exercise image is not used as a poster. BV-07: sources from 1.1 MB (640×352) to **38 MB (1920×1080 `.MOV`)**; Drive, Vimeo and Instagram links never start. Production uploads currently fail (Bunny 401), so coaches cannot replace them.
- **Expected vs actual:**
  - Expected: An instant poster, then a mobile-sized rendition that starts in about a second.
  - Actual: A black box, then a multi-MB to 38 MB stream, or a dead player.
- **Why it matters:** "Watch the exercise" happens mid-workout, often on gym data.
- **Direction:** Transcode on ingest into mobile renditions with posters; use the image as the placeholder; validate unsupported hosts at authoring time (MD doc).
- **Verified:** BROWSER-VERIFIED (BV-07)

### PF-26 — Timer-driven re-renders
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Client · workout session, rest timer · whole app on resume
- **Evidence:** `WorkoutSession.tsx:80` (page-level 1 s tick); `RestTimerBar.tsx:12` (whole-store subscription; the store sets state every 250 ms, `timerStore.ts:61-73`); pollers emit new arrays every tick; `sessionStore.ts:150` + `App.tsx:47` (new account object on every resume).
- **Expected vs actual:**
  - Expected: Only the clock text re-renders.
  - Actual: The session page re-renders 1×/s, the timer bar 4×/s, and the whole app on each resume.
- **Why it matters:** Battery and jank on low-end phones during the core workout flow.
- **Direction:** Keep timers in leaf components, use selective subscriptions, and emit only on change.
- **Verified:** CODE-CONFIRMED

### PF-27 — The service-worker update check runs every minute
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** All installed users · whole session
- **Evidence:** `main.tsx:37-43` (60 s interval + on every resume); `vercel.json:17-23` (`sw.js` and `workbox-*.js` are `no-store`). BV-06 confirms the 60 s poll fires.
- **Expected vs actual:**
  - Expected: Check on launch and on resume, throttled to ≥30 min.
  - Actual: A request (≈3–10 KB) and a radio wake-up every minute: roughly 180–600 KB per hour.
- **Why it matters:** Small, but constant, and it adds nothing (the update applies only on backgrounding anyway, BV-06).
- **Direction:** Throttle the check, and tie it to the update UX the PWA doc proposes.
- **Verified:** CODE-CONFIRMED

### PF-28 — Images load far larger than they display
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Coach photo grids, client check-in and assessment photos, avatars in lists, Splash
- **Evidence:** Uploads are downscaled to 1600 px WebP (`src/lib/image.ts`) and grids show those originals as thumbnails (`CoachViewPhotos.tsx:39`, `CheckInSummary.tsx:37`). Avatars are 512 px (`AvatarPicker.tsx:37`), shown at 32–40 px. `Splash.tsx:5` uses a 960×640 logo at 288 px. Message images have no intrinsic size (`MessageThread.tsx:1323`). No runtime cache for Bunny media.
- **Expected vs actual:**
  - Expected: Thumbnail-sized variants.
  - Actual: Full images in every grid and list.
- **Why it matters:** Extra data and decode time on photo-heavy coach screens, and no offline photos.
- **Direction:** Use CDN-side resizing or stored thumbnail variants, with explicit dimensions. Runtime-cache media the user has already seen.
- **Verified:** CODE-CONFIRMED

### PF-29 — Food search depends on a slow external API and can show stale results
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Coach nutrition editor · food search
- **Evidence:** `FoodSearchPicker.tsx:7-8,28-39`: 400 ms debounce, minimum 2 characters, no request sequencing or abort (an older response can overwrite a newer query). The server proxies to `wger.de` with a 10-minute in-memory cache per function instance (`api/_trpc/routers/foodSearch.ts`).
- **Expected vs actual:**
  - Expected: Instant results from the coach's own library first, then the database, in query order.
  - Actual: Debounce + external round trip, with out-of-order results possible.
- **Why it matters:** Typing a food name should feel instant. Wrong results can be picked by mistake.
- **Direction:** One search over the local library plus a cached food database (FD doc), with response sequencing.
- **Verified:** CODE-CONFIRMED

### PF-30 — Dead weight shipped to every user or deploy
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REMOVE
- **Who / where:** Bundles and deploy
- **Evidence:** Demo seeds in the entry (`bootstrap.ts:3-6`, never used on the platform). Capacitor in the web entry. The legacy `/landing-v1` marketing page eagerly bundled in the anonymous chunk (`AnonymousApp.tsx:5`, ≈19.5 KB). `fetchStarterExercises` has no callers (`starterLibraryApi.ts:34-38`). 131 MB of `public/exercise_videos/` (seed-only, up to 21 MB per file). Unreferenced `experience/forma-lockup.png` and `forma-wordmark.png`, and `data/exercise-taxonomy-ar.json`.
- **Expected vs actual:**
  - Expected: Ship only live code and assets.
  - Actual: Legacy assets ride along in bundles, the precache and every deploy.
- **Why it matters:** Small per item, but adds up across bundle size and deploy time.
- **Direction:** Remove them as part of the RM list.
- **Verified:** CODE-CONFIRMED

### PF-31 — Reconnect forces a full sync but does not refresh coach content
- **Priority:** P3      **Effort:** S      **Impact:** LOW
- **Action:** REDESIGN
- **Who / where:** Client · coming back online
- **Evidence:** `cloudStore.ts:112` (forced sync pass on `online`, ≥11 sequential calls). React Query refetches stale queries on reconnect. `ClientGate` listens only to focus and visibility (`ClientApp.tsx:115-123`), so plans and targets stay stale until the next foreground.
- **Expected vs actual:**
  - Expected: One "catch up" request on reconnect that brings everything current.
  - Actual: A sequential sync burst, and the coach's latest plan not loaded.
- **Why it matters:** A client who reconnects mid-session can keep training on an outdated plan.
- **Direction:** Fold reconnect into the resume coordinator and change feed (PF-05, PF-09).
- **Verified:** CODE-CONFIRMED

---

## 8. Direction for Phase B: target performance model

| Area | Target |
|---|---|
| **Boot** | HTML splash in ≤300 ms. Role app from cached identity + local data in ≤500 ms on a mid-range phone, offline included. Network revalidation in the background with ≤3 s timeouts. Zero API calls on the critical path for returning clients. |
| **Freshness** | One change-feed endpoint per user ("what changed since cursor T"). Cadence: in an open thread, 2–5 s while focused. On other visible screens, 30–60 s. Hidden: none. Back off on errors. Push to wake when available. |
| **Query cache** | Persisted per user, busted per build. Stale-while-revalidate for read-mostly data. Authoritative refetch (with "as of" labels and disabled actions until fresh) for money, capacity, plan-before-edit and account status. Mutations write their results into the cache. |
| **Payloads** | Every list paginated and projected. Polls return deltas or counts only. No response over 100 KB in normal use. |
| **Server** | Indexes ensured at deploy time. Unread and summary counters maintained on write. Bulk writes for sync. Hot read paths in a slim function co-located with Atlas. |
| **Bundles** | Entry ≤100 KB gz. Strings loaded as data per locale. Client-only code only in the client app. App CSS separate from website CSS. Precache ≤0.7 MB, app shell only. SW registered after first interaction. |
| **Perceived** | Chrome never unmounts on navigation. Motion ≤150 ms. No layout shift after first paint: status from cache, contextual notices inside content. A loading state is never shown as an empty state. |

## 9. To verify on a device or in production
1. Production `Cache-Control` on `/assets/*.js` (`vercel.json` sets `no-store` on `/(.*)` and `immutable` on `/assets/(.*)`; expect immutable).
2. Production timings for the boot chain, including cold vs warm function and the Vercel function region vs the Atlas region.
3. PF-10: background more than 15 min, then resume. Look for concurrent `auth.refresh` calls and a 401 on `auth.me`.
4. PF-08: count `messages.markRead` calls with an unseen incoming message in an open thread.
5. Whether Vercel compresses `coachAssets.exercises.list` in production, and its real transfer and parse time on a low-end Android.
6. Main-thread time of startup and per-tap IndexedDB scans on a one-year-history client (PF-23).
7. The duration of the chrome-less route flash on a low-end Android (PF-19).
