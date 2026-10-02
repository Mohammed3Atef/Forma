# Phase-3 results: agent C (client journeys + messenger)

Ports 5203/5303. Specs: `e2e3/specs/30-client.spec.ts`, `31-messenger.spec.ts`, `32-messenger.touch.spec.ts`, helpers in `_c-helpers.ts`.
Final evidence runs: `e2e-out/c-18` (30 + 31 full run), `c-19` / `c-21` (re-runs of two 31 tests that hit host-load timeouts in c-18), `c-17` (32, both touch projects).

| Journey | spec:test | Project | Result | Evidence | Notes |
|---|---|---|---|---|---|
| Workout: plan → session → log sets → rest timer → video → next/prev → reload resumes → finish → history (+ fresh context) | 30:workout | chromium-1440 | PASS | e2e-out/c-18/report (`01-routines` … `08-history-fresh-context`) | Plan seeded via `db` (`clientWorkoutPlans`). The server `syncRecords` copy was checked mid-session and after finish. "Watch video" on an exercise with no video does nothing (E-C-3). |
| Nutrition: mark eaten + food search "chicken" (live wger), 100 g → 150 g ×1.5, no NaN, save → reload → persists (+ fresh context) | 30:nutrition search | chromium-1440 | PASS | c-18 `01-food-search-results`, `02-preview-150g`, `04-after-reload` | Macros scale within ±0.1. The server `nutritionLogs` record matches. |
| Nutrition: search failure (route abort) → error state → manual entry saves → reload | 30:nutrition failure | chromium-1440 | PASS | c-18 `01-search-error`, `02-manual-persisted` | Calories 253 = 5·4+56·4+1·9 |
| Cardio manual entry → reload → persists + server copy | 30:cardio | chromium-1440 | PASS | c-18 `01/02-cardio-*` | |
| Check-in: coach requests (UI) → client 4-step wizard → submitted → coach sees it | 30:check-in | chromium-1440 | PASS | c-18 `01-coach-requested` … `05-coach-sees-submission` | DB `checkIns` status=submitted, weight and notes saved |
| Measurements: save → reload; clear one → save → reload ×2 → stays cleared (local + server + fresh context) | 30:measurements | chromium-1440 | PASS | c-18 `01/02-*` | |
| Progress photo PNG upload → appears → `syncRecords.progressPhotos.cdnUrl` on stub CDN → image loads in fresh context | 30:progress photo | chromium-1440 | PASS | c-18 `01-photo-added`, `02-photo-fresh-context` | |
| Settings: rename → coach sees new name | 30:settings | chromium-1440 | FAIL | c-18 `02-coach-roster-after-rename`, `02b-coach-thread-after-rename` | The coach thread header shows the new name, but the coach roster still shows the old one (E-C-2). Checked with a soft assertion so the rest of the journey ran. |
| Settings: Arabic → `html[dir=rtl]` + Arabic text (survives reload) → back to EN | 30:settings | chromium-1440 | PASS | c-18 `03-arabic-rtl` | |
| Settings: sign out (confirm) → anonymous, stays anonymous after reload | 30:settings | chromium-1440 | PASS | c-18 `04-signed-out` | Seeded name restored through the UI, with a DB safety net |
| Text both ways, arrives without reload (and Enter sends) | 31:text | chromium-1440 | PASS | c-18 `01/02-*-thread` | |
| Image / video / audio / PDF attachments render, URLs on stub CDN, image loads | 31:attachments | chromium-1440 | PASS | c-18 `01/02-*-attachments` | `accept` leaves out audio (E-C-4) |
| Attachment + caption → exactly 2 rows | 31:caption | chromium-1440 | PASS | c-18 `01-coach-sees-two` | |
| Edit within 2 min (⋮ → Edit) and delete → tombstone on both sides; coach gets no Edit/Delete on the client's message | 31:edit/delete | chromium-1440 | PASS | c-18 `01-coach-sees-edit`, `02/03-*-tombstone` | |
| After 2 min (createdAt backdated 3 min): server rejects with "Couldn't edit message", then Edit/Delete hidden after refresh | 31:2-min window | chromium-1440 | FLAKY (env) | c-19 `01-late-edit-rejected`, `02-menu-without-edit-delete` | Hit the 150 s timeout in c-18 under host load. Passed in c-8 and in c-19 (240 s budget). |
| Reactions don't flicker (sampled every 250 ms for 22 s) and reach the other side | 31:reactions | chromium-1440 | PASS | c-18 `01/02-*reaction` | |
| "Seen" for the sender after the other side opens the thread | 31:seen | chromium-1440 | PASS | c-18 `01-seen` | Takes up to about 20 s, because the full refresh runs every 4th poll |
| Load older (260 seeded): older page above, anchor kept, survives 2+ ticks; scrolled-up view doesn't jump, new-message indicator shows | 31:load older | chromium-1440 | PASS | c-18 `01-top-before-load-older`, `02-after-load-older`, `03-new-indicator-no-jump` | |
| Desktop ⋮ menu inside viewport, flips above the bottom bubble, right-aligned; closes on outside click and Escape (coach and client) | 31:desktop menu | chromium-1440 | PASS (FLAKY env) | c-21 `01-menu-open-coach/client` | c-18 failed on my own wrong anchor box (fixed). c-20 failed on a load timeout. Passed in c-21. |
| Voice: record → stop → review → remove; record → cancel → no draft; record → send → audio message | 31:voice | chromium-1440 | PASS | c-18 `01-recording`, `02-review-draft`, `03-voice-sent` | |
| Voice: permission really denied | 31:voice denied (a) | chromium-1440 | BLOCKED | c-18 `01-real-context-no-permission` | The harness passes `--use-fake-ui-for-media-stream`, which auto-grants the mic, so recording starts even after `clearPermissions()` |
| Voice: denial emulated (getUserMedia → NotAllowedError) → "Microphone unavailable. Check your browser permissions…" (not "unsupported") | 31:voice denied (b) | chromium-1440 | PASS | c-18 `02-denied-error` | |
| Touch long-press opens the action sheet; moving press doesn't; no text selected; react from sheet; composer visible | 32:touch | webkit-iphone | PASS | c-17 `01-thread-mobile`, `02-action-sheet`, `03-reacted` | WebKit has no CDP, so the press is synthetic touch PointerEvents |
| Same, with a REAL touch sequence (CDP Input.dispatchTouchEvent) | 32:touch | mobile-390 | FAIL | c-17 `02a-after-release`; c-16 `test-failed-1.png` | The sheet opens mid-hold, then lifting the finger taps whatever is under it: the backdrop (closes the sheet) or Edit (opens edit mode). See E-C-1. Moving-press, no-selection, react and composer checks pass. |

## FINDINGS

**E-C-1 — P1 — Mobile long-press: lifting the finger activates whatever is under it in the just-opened action sheet**
- Repro (mobile-390, real CDP touch): long-press your own bubble for 600 ms. The "Message actions" sheet opens at 450 ms, while the finger is still down. On release, Chromium sends a `click` (pointerType touch) to the element now under the finger.
  - When that is the sheet backdrop (`absolute inset-0 bg-black/60`), the sheet closes at once (event log: `pointerup → touchend → click tgt=absolute inset-0 bg-black/60`).
  - When it is an action row, the action runs: in c-16/c-17 it was **Edit**, and the message went into edit mode. The same can happen with Delete, which then shows its confirm dialog.
- Evidence: `e2e-out/c-17/.../32-messenger.touch-...-mobile-390/` (`02a-after-release.png`, annotations `sheet-closed-on-release`, `release-activated-edit=true`); `e2e-out/c-16/.../test-failed-1.png` shows edit mode opened.
- Suspected location: `src/components/MessageThread.tsx:1047-1062`. The long-press timer opens the sheet, but nothing suppresses the click that follows the press (e.g. `preventDefault` on the matching `touchend`/`pointerup`, or ignoring sheet clicks for about 300 ms after opening).
- Caveat: this is emulated touch. Confirm on a real Android device. iOS (WebKit) could only be driven with synthetic pointer events, which never produce that click.

**E-C-2 — P2 — The coach roster/dashboard keeps showing the old client name after the client renames themselves in Settings**
- Repro: clientA changes Name in Settings → `users.displayName` updates (checked in the DB) and the coach thread header shows "Aya C-Renamed". `/coach/clients` (fresh coach context) still shows "Client Aya".
- Evidence: `e2e-out/c-18/report` → settings test, `02-coach-roster-after-rename.png` vs `02b-coach-thread-after-rename.png`.
- Suspected location: `src/services/platform/coachDashboardApi.ts:109-111` always swaps in the assessment's `fullName` for `displayName`. The comment says it was meant only to replace an email-prefix fallback.

**E-C-3 — P3 — "Watch video" in a workout session does nothing when the exercise has no video**
- Repro: start a session on an exercise with no `videoUrl` and no local video asset → tap Watch video. No popup, no sheet, no message (annotation `video-no-url: popup=0 sheet=0`). With a `videoUrl`, the popup opens and closes correctly.
- Suspected location: `src/components/ExerciseCard.tsx` always renders the video button; `src/pages/WorkoutSession.tsx` `openVideo` passes `null` to `VideoPlayerSheet`, which renders nothing. The button should be hidden or disabled when there is no video.

**E-C-4 — P3 — The message attach picker doesn't offer audio files**
- `src/components/MessageThread.tsx:828` has `accept="image/*,video/*,application/pdf"`. Audio uploads and renders fine (an `audio/mpeg` file set via `setInputFiles` passed), but a real user can't choose an audio file in the native picker, especially on iOS.

**E-C-5 — P3 (suspected, from reading the code) — Voice errors may show the wrong reason**
- `MessageThread.tsx:527-528`: `startVoice` reads `voice.lastError` right after `await voice.start()`. That value comes from the previous render, so it is probably still `null`, and the message then falls back to `failed`, which shows the micDenied text.
- If so, a missing mic (`notfound`), a mic in use (`busy`) or an insecure context would all show "Microphone unavailable…" instead of their own messages.
- The denied case shows the right text either way, so the tests can't tell. Fix: have `start()` return the error.

**E-C-6 — P2 (harness/environment, not product) — Leaked mongo-memory-server temp dirs filled C:**
- Every run leaves about 200 MB in `%TEMP%\mongo-mem-*`; 47 dirs had built up. C: reached 100% full during my runs. That caused a mongod `fassert()` failure at startup, Node "Fatal process out of memory: Zone" inside the env server (ECONNREFUSED mid-test), and 500s on `messages.send/list` (c-10, c-12, c-13).
- I was **not permitted** to delete these dirs. Someone with access needs to remove the ones whose `mongod.lock` PID is no longer running.
- The likely cause is that `e2e3/env/server.mjs` cleanup (`mongod.stop()`) doesn't run when Playwright tears down the webServer on Windows.
- Related noise, worked around with a narrow `allowDevModuleStorm` allowance in my specs: under four parallel stacks, `vite dev` module fetches hit `net::ERR_INSUFFICIENT_RESOURCES` → "Failed to fetch dynamically imported module …/src/apps/CoachApp.tsx". Several tests were slowed past their timeouts (the FLAKY rows above).
- Also seen in the "isolated" env: an outbound request to `https://va.vercel-scripts.com/v1/script.debug.js` (`SiteAnalytics`), blocked by ORB.
