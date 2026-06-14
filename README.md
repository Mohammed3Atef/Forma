# 🏋️ Gym Tracker

A mobile-first, offline-capable **PWA** to run your gym workouts, follow your nutrition plan, track cardio/steps/weight, watch exercise videos offline, and keep daily habit streaks — built from a coaching Google Sheet.

Seeded with the real **5-day split (Push A / Pull A / Legs / Push B / Pull B)**, a **1815 kcal** nutrition plan, and the coach's **29 exercise videos** (real YouTube links pulled from the sheet). Every value is editable and re-importable.

- **Frontend:** React 18 + TypeScript (strict) + Vite
- **Styling:** Tailwind CSS (dark, mobile-first, RTL-ready)
- **State:** Zustand · **Charts:** Recharts · **i18n:** react-i18next (EN/AR)
- **Storage:** localForage (IndexedDB) + Cache API — **local-first**
- **PWA:** vite-plugin-pwa (Workbox), installable, offline app shell
- **Cloud (optional):** Firebase Auth + Firestore + Storage with last-write-wins sync

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — runs immediately, no backend needed
```

The app opens straight to the dashboard with a local profile (no login). All data
lives in your browser's IndexedDB. Build/preview the installable PWA:

```bash
npm run build
npm run preview
```

> Install it: open in Chrome/Edge/Android → "Install app" / "Add to Home Screen".
> On iOS Safari → Share → Add to Home Screen (standalone + splash supported).

---

## Features

| Module | What it does |
| --- | --- |
| **Home** | Today's workout, nutrition summary, body weight, streaks, steps, cardio, macro rings, quick actions, **daily checklist** (completion %, missed items, next reminder). |
| **Workout** | Weekly PPL plan → single-screen **session** built for the gym: big ± steppers, **previous-session ghost values**, tap-to-complete sets, sticky session + rest timers, **auto-save every change**, **session recovery** after restart, wake-lock, vibration. |
| **Nutrition** | Meals by slot, mark-eaten, custom foods, macro rings vs targets, water tracker, supplements & creatine log, coach notes. |
| **Cardio** | Live cardio timer (walking/treadmill/running/cycling/other), manual logging, step entry, daily history. |
| **Progress** | Recharts: body weight, per-exercise top-set progression, weekly completion, steps trend. Plus **Progress Photos** (front/side/back, stored locally, before/after compare). |
| **Habits** | Auto-checked daily checklist + 5 streak types + local reminders (Service-Worker notifications with in-app fallback). |
| **Videos** | Per-exercise video manager: download direct files for **offline playback**, YouTube/blocked sources fall back to online + instructions. Swappable storage backend. |
| **Settings** | Profile, EN/AR + RTL, dark theme, targets, rest default, wake-lock/vibration/notification toggles, reminders, optional cloud sign-in. |

---

## Project structure

```
src/
  types/                 # All domain interfaces (strict)
  lib/                   # utils, haptics
  i18n/                  # en.json, ar.json, RTL switching
  data/
    repositories.ts      # DataSource + Repository interfaces
    dataSource.ts        # factory (local default; firebase when configured)
    bootstrap.ts         # idempotent first-run seeding
    blobStore.ts         # IndexedDB blobs (videos, photos)
    seed/                # parsed Google Sheet data
    adapters/local/      # localForage implementations
    adapters/firebase/   # firebase init + config (optional)
    sync/SyncEngine.ts   # last-write-wins sync
  stores/                # zustand: settings, workout, nutrition, cardio, timer, habit, video, photo
  services/
    habits/              # pure checklist + streak logic
    video/               # IVideoStore abstraction + Cache API impl
    reminders/           # reminder scheduler + notifications
    auth/                # optional Firebase auth + cloud store
    sheetParser.ts       # CSV / video-links parsing
  components/            # Icon, ProgressRing, NumberStepper, Sheet, ExerciseCard, …
  pages/                 # Home, Workout, WorkoutSession, Nutrition, Cardio, Progress,
                         # ProgressPhotos, Settings, VideoManager, ImportData
scripts/
  importSheet.ts         # CLI: sheet/CSV → JSON
  extractVideoLinks.gs   # Apps Script: dump real video hyperlinks → JSON
  makeIcons.mjs          # generate PWA icons
```

---

## Importing / refreshing your data

The seed already contains your sheet's 5-day plan, nutrition, and the **29 real
video links**. Those links were extracted from the sheet's **XLSX export** —
Google strips inserted hyperlinks from CSV/HTML, but XLSX keeps them as
`=HYPERLINK()` formulas. To regenerate after the coach updates the sheet:

```bash
node scripts/extractFromXlsx.mjs       # → writes video-links.json (name → url)
```

Then either bump `SEED_VERSION` in `src/data/bootstrap.ts` and update
`src/data/seed/videoAssets.seed.ts`, **or** paste the JSON into the app via
**Settings → Import data** (preview the matches, tap Import).

Other helpers:
- `scripts/extractVideoLinks.gs` — Apps Script alternative (run inside the sheet) if you prefer.
- `node --experimental-strip-types scripts/importSheet.ts <sheetId> <gid>` — dump a public tab as CSV → JSON.

---

## Videos & offline

The coach's 29 videos are **YouTube links**. The app embeds and plays them
in-app when you tap the ▶ on an exercise (Video Manager or inside a session).

**About "offline":** YouTube videos **cannot be saved as local files** — that
breaks YouTube's Terms of Service and there's no direct file URL to fetch. So
they require internet to play. For true offline, ask the coach for the raw
`.mp4`/`.webm` files and paste a direct URL in the Video Manager — the app
then downloads and caches it in IndexedDB for offline playback.

`IVideoStore` (`src/services/video/`) abstracts this:

- **Direct files** (`.mp4`/`.webm`) → downloaded into IndexedDB (Cache API),
  played offline via object URLs, with progress + status badges.
- **YouTube / unknown** → embedded online, with a clear offline fallback note.
- Swap `CacheVideoStore` for a Firebase-Storage-backed store later without
  touching any UI.

---

## Enabling cloud sync (optional)

Local-first works with **zero** setup. To add backup/sync across devices:

1. Create a Firebase project → enable **Authentication (Email/Password)**,
   **Cloud Firestore**, and **Storage**.
2. Copy your web app config into `.env` (see [`.env.example`](.env.example)).
3. Deploy the security rules in [`firestore.rules`](firestore.rules).
4. Restart `npm run dev`. A **Sign in** button appears in **Settings → Cloud**.
   Offline edits are flushed on reconnect; conflicts resolve last-write-wins by
   `updatedAt`. Reads always come from the local store, so the UI stays instant.

> Firestore is initialised with `ignoreUndefinedProperties`, so optional empty
> fields don't break a sync.

## Deploying

### Vercel (hosting)
Vercel auto-detects Vite (build `npm run build`, output `dir` `dist`). Two things matter:

1. **Environment variables** — add every `VITE_FIREBASE_*` var (from `.env`) in
   **Vercel → Project → Settings → Environment Variables** for *Production* (and
   *Preview*). The local `.env` is git-ignored and is **not** used by Vercel
   builds, so cloud sync only works once these are set there.
2. [`vercel.json`](vercel.json) (committed) handles the **SPA fallback** (deep
   links / refresh) and the **cache headers** so the service worker updates
   without reinstalling (`sw.js`/manifest = no-cache, `/assets/*` = immutable).

Firestore **rules and the database itself still live in Firebase** even when
hosting on Vercel — deploy rules with the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

(Firebase Hosting users can instead use the committed [`firebase.json`](firebase.json).)

### Firestore schema

```
users/{uid}                          UserProfile + AppSettings
users/{uid}/workoutPlans/{id}        WorkoutPlan
users/{uid}/workoutLogs/{date}       WorkoutLog
users/{uid}/nutritionPlans/{id}      MealPlan
users/{uid}/nutritionLogs/{date}     NutritionLog
users/{uid}/cardioLogs/{id}          CardioLog
users/{uid}/weightLogs/{date}        WeightLog
users/{uid}/videoAssets/{id}         VideoAsset (metadata; blobs stay local/Storage)
users/{uid}/progressPhotos/{id}      ProgressPhoto (metadata; image blobs local/Storage)
users/{uid}/dailyChecklists/{date}   DailyChecklist
users/{uid}/reminders/{id}           Reminder
users/{uid}/settings/app             AppSettings
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Type-check + production build + PWA service worker. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | TypeScript type-check only. |
| `node scripts/makeIcons.mjs` | Regenerate PWA icons. |
| `node scripts/extractFromXlsx.mjs` | Pull real video links from the sheet's XLSX export → `video-links.json`. |

---

## Notes

- **Single user / personal app:** no mandatory login; the local profile is the
  identity. Firebase auth is purely opt-in.
- **Privacy:** progress photos and downloaded videos never leave the device
  unless you enable cloud sync.
- Coaching plan period in the source sheet ends **2026-07-30** — re-import a new
  plan after that via the Import screen.
