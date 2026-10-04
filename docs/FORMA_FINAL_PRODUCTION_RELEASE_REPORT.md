# Forma — Phase 4 Final Production Release Gate (continuation)

Date: 2026-10-03 · Legacy commercial migration intentionally **skipped** (data is disposable test data, per owner).

Legend: **PASS** · **FAIL** · **BLOCKED** · **NOT RUN** · **ACCEPTED RISK**

> **Summary:**
> - Release candidate **RC2** (`cf3a5d9`, tag `forma-v1.0.0-rc2`) is **live in Production** (`dpl_HahC9t1dWkACtHcW4hLkHrYqXSrU`, 2026-10-03 18:33 UTC).
> - Passing: headers (incl. the microphone fix), bundle security, cron, the full commercial flow (Trial → subscription → early renewal → capacity add-on), messenger text/reaction/edit/delete, and responsive EN/AR.
> - **Hard blocker:** every media upload fails. Bunny storage rejects the deployed `BUNNY_API_KEY` with **401**, so `/api/media/upload` returns 502.
> - Google sign-in, email, real-phone and SW-update checks still need a human.
> - Verdict: **NO-GO** until the Bunny key in Vercel is fixed and media is re-verified.

---

## 1. Env verification (names/status only) — PASS (with notes)
| Variable | Status |
|---|---|
| `CRON_SECRET` | SET — Production + Development (**not Preview**) |
| `BUNNY_STORAGE_ZONE` / `BUNNY_CDN_URL` / `BUNNY_STORAGE_REGION` | SET (Preview + Production) |
| `BUNNY_API_KEY` | SET (Preview + Production). The listing still shows it created **24 days ago**, and production uploads get **401 from Bunny** — see §5 |
| `MONGODB_URI`, `JWT_ACCESS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` | SET |
| `VITE_BUNNY_*` | **absent** ✅ (the only `VITE_*` variable is `VITE_GOOGLE_CLIENT_ID`, which is public) |

## 2. RC verification — PASS
**RC1 `184eb40`:**
- `microphone=(self)` ✅
- `public/Forma.png` removed ✅
- single-plan/capacity work + renewal fix (`computeTermStart`) ✅

**RC2 `cf3a5d9` (new, release-gate fix):** client composer hidden under the bottom nav whenever a banner shows (§16).

**Checks on RC2:**
- `npx tsc -b --noEmit`: PASS
- `npm run build`: PASS (local `dist` secret scan: 0 for all patterns)
- `npm run test -- --run`: **293/293**

**Isolated e2e3 (all runs sequential on one stack):**
| Suite | Result |
|---|---|
| auth + commercial + capacity + messenger (10, 11, 12, 50, 31) on RC1 tree | 32 passed, 1 skipped (Google placeholder) |
| media + media security + layout 1440 + a11y (40, 41, 44, 46) on RC1 tree | 42/42 |
| **New regression 33** (composer with banner) + responsive/RTL 45, 1280/1024/768/430/390, on RC2 | **50/50** — and 33 **fails on the old code** (`send covered by nav-inbox`), proving it catches the bug |
| messenger 31 + layout 44 at 1440 on RC2 | 20/20 |
| touch messenger 32 on mobile-430/390 + **WebKit iPhone** on RC2 | 3/3 |

## 3. Preview deploys — PASS
| RC | Deployment id | URL |
|---|---|---|
| RC1 | `dpl_6m54hZsN72WLNhHkZgvE2FCPyyE9` | `forma-o1oa6defy…` |
| RC2 | `dpl_BkvjpojHfqsMXQFNJGmo2bcFdgVg` | `forma-lx0tazi71…` |

Both were deployed from a clean worktree at the tag (`git status` empty).

Preview is protected by Vercel SSO, so checks went through `vercel curl` (automatic bypass):
- `/`, `/sw.js` → `no-cache, no-store, must-revalidate`
- manifest → `no-cache`
- hashed asset → `public, max-age=31536000, immutable`
- `/api/trpc/health.ping` → real JSON
- `/api/does-not-exist` → API 404, not the SPA
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`
- Preview cron → `503 "Cron is not configured"` (**expected**: `CRON_SECRET` is not set for Preview; Production verified in §6)

## 4. Preview secret scan — PASS
141 JS chunks per RC. Hits: `VITE_BUNNY` 0 · `AccessKey` 0 · `BUNNY_API_KEY` 0 · `MONGODB_URI` 0 · `JWT_ACCESS` 0 · `RESEND_API` 0 · `CRON_SECRET` 0 · `storage.bunnycdn` 0 · `bunnyUploadApi` 0.

## 5. Real Bunny upload — **FAIL (hard blocker)**
- **Path:** browser → `POST /api/media/upload` → server → Bunny storage
- **Response:** `502 {"error":"failed","message":"Storage upload failed (401)"}`. Bunny storage **rejects the deployed `BUNNY_API_KEY`**. Reproduced 3 times on production after the RC2 deploy.
- **Scope:** affects every upload (message attachments, voice notes, avatars, progress photos, exercise media).
- **Nothing reached Bunny** (rejected). No Bunny credential was ever sent from the browser: 0 browser requests to `storage.bunnycdn.com`, 0 `AccessKey` headers.
- **Likely cause:** the storage-zone password was rotated, but the Vercel `BUNNY_API_KEY` value was not replaced with the **new storage-zone password**. The env listing shows the variable unchanged for 24 days. Other possibilities: an account API key was used instead of the zone password, or a zone/region mismatch.
- **Fix (owner):**
  1. Bunny → Storage → *zone* → FTP & API Access → copy the **current** password.
  2. Vercel → `BUNNY_API_KEY` (Production + Preview) → replace the value.
  3. **Redeploy** — env changes only apply to new deployments.
  4. Re-run the upload smoke.

## 6. Cron — PASS
- `vercel crons ls`: `/api/cron/daily-maintenance` registered, `0 3 * * *`.
- Production unauthenticated → **401**; wrong bearer → **401** (fails closed; no longer "not configured").
- Authenticated (secret read from local `.env`, never printed) → **200** `{"expirePlanRequests":{"checked":0,"expired":0},"subscriptions":{"checked":1,"expired":1,"requestsCreated":1},"capacity":{"expired":0,"coaches":0}}`. This was the normal scheduled sweep on already-ended data; nothing was artificially expired.

## 7. Google sign-in — **NOT RUN**
Needs a real allowed Google account.

## 8. Email smoke — **NOT RUN**
Needs an inbox you control. Disposable signups used `@example.com`, so their welcome emails cannot be confirmed.

## 9. Production deploys
| RC | Deployment id | URL | Time (UTC) |
|---|---|---|---|
| RC1 `184eb40` | `dpl_BvJowSMtJ61hwhE97rmzxioumoxb` | `forma-qqoqugw4l…` | 17:21 |
| **RC2 `cf3a5d9`** | **`dpl_HahC9t1dWkACtHcW4hLkHrYqXSrU`** | `forma-40g1o8ln6…`, aliased to **`www.useforma.fit`** | **18:33** |

## 10. Production headers — PASS (`www.useforma.fit`, RC2)
| Path | Cache-Control |
|---|---|
| `/`, `/index.html`, `/sw.js` | `no-cache, no-store, must-revalidate` |
| `/manifest.webmanifest` | `no-cache` |
| `/assets/index-Cox-rb4o.js` | `public, max-age=31536000, immutable` |
| `/api/trpc/health.ping` | real JSON |
| `/api/does-not-exist` | API 404 |

`Permissions-Policy: camera=(self), microphone=(self), geolocation=()` on every response.

## 11. Production secret scan — PASS
141 chunks, 0 hits for every pattern. The old `bunnyUploadApi` chunk is gone: requesting its old path returns `text/html` (the SPA rewrite), not JS.

## 12. Trial signup smoke — PASS (fresh disposable coach `forma-release-…@example.com`)
- Signup → **Forma Free Trial**
- Capacity **0 / 25**
- Trial ends **today + 15 days** (18 Oct 2026)

## 13. Subscription confirmation smoke — PASS
- Coach requests the subscription; the dialog shows 499 EGP / 25 clients / 30 days.
- The Super Admin sees it in Payment Requests and confirms.
- Result: **Forma Subscription · Active**, ends **confirmation + 30 days** (2 Nov 2026).

## 14. Early renewal smoke — PASS
- The renewal dialog says "current subscription ends 2 Nov 2026 … extended through 2 Dec 2026", not "starts today".
- The Super Admin request detail shows the same.
- After confirmation, **ends 2 Dec 2026**: appended to the current end, no paid days lost.

## 15. Capacity smoke — PASS
Production already had one capacity package created by the owner: **"+30 more clients", 100 EGP/month**, active and coach-visible. It was not created in this session.
- A request leaves the limit at **25**.
- The Super Admin confirms → **25 → 55**, and the add-on is listed as active.

## 16. Messenger smoke (production, designated `E2E_COACH` / `E2E_CLIENT` pair) — PASS except media
- Text client → coach ✅
- Text coach → client ✅
- No duplicate bubble ✅
- Reaction reaches the other side ✅
- Edit within window ✅
- Delete within window → tombstone ✅
- No forced jump to bottom while reading older ✅
- **Image attachment ❌** — the §5 Bunny 401.

**P1 found and fixed in this gate (RC2):**
- **Bug:** for a client whose subscription is read-only (an "expired" banner above the chat) or who has a due-reminder banner, the fixed-height thread pushed the **composer under the bottom nav**. Send could not be tapped at any width, even after scrolling. Reproduced on production at 1440 and 390.
- **Fix:** the thread sizes itself from its measured top edge down to the nav.
- **Verified on production after RC2:** composer reachable at 390 and 1440 with the banner showing.

## 17. Real phone (long-press / microphone / voice) — **NOT RUN**
Needs a physical device. The microphone is now permitted by policy (`microphone=(self)`). WebKit-iPhone touch emulation passes (e2e3 32).

## 18. Service-worker update — **NOT RUN**
Needs a long-lived browser session across a deploy. The owner's Bunny-key redeploy is a natural opportunity: keep the installed app open, redeploy, then confirm the deferred reload.

## 19. Responsive/RTL production smoke — PASS
390/430/768/1024/1440 × EN + AR. No horizontal overflow; `dir=rtl` in Arabic.

| Role | Pages |
|---|---|
| Anonymous | Marketing, Signup |
| Coach | Dashboard, My Plan, Messages |
| Client | Home, Messages |
| Super Admin | Forma Plan, Capacity Packages, Payment Requests |

## 20. Console / network findings (production journeys)
- 0 page errors.
- 13× `401 auth.refresh` — the expected first-load session probe (classified as expected since Phase 3).
- 1× `502 /api/media/upload` — explained by §5.
- **No unexplained 500.**
- 0 browser requests carrying Bunny credentials.

## 21. Test data cleared — **none**
No collections were cleared and no legacy migration was run.

## 22. Exact production mutations performed
- **Deployments:** Preview `dpl_6m54…`, Production `dpl_BvJow…` (RC1), Preview `dpl_Bkvjp…`, Production `dpl_HahC9…` (RC2, current).
- **Cron:** one authenticated run. It expired 1 already-ended plan and raised 1 `trial_expired` subscription request.
- **Disposable coaches:** 3 created (`forma-release-<id>@example.com`), one per commercial smoke run.
  - Each had a subscription + renewal confirmed by the `E2E_SUPER` admin.
  - Run 2 left one **awaiting** "+30 clients" request (script aborted before confirming).
  - Run 3 confirmed one "+30 clients" entitlement.
  - Welcome emails to `@example.com` will bounce.
- **`E2E_COACH` ↔ `E2E_CLIENT` thread:** short `REL-*` test messages (several runs), one reaction per run, edited+deleted test messages. Failed image uploads stored nothing.
- **Language:** `E2E_COACH` / `E2E_CLIENT` / `E2E_SUPER` toggled to Arabic and back during the smoke, then **restored to their original Arabic** (verified after reload).
- **Local:** commits `184eb40` and `cf3a5d9`, tags `forma-v1.0.0-rc1` / `rc2` — **not pushed**. Worktree `D:\forma-rc1` (clean checkout of rc2, used for deploys).

## 23. Remaining accepted risks / notes
- The P2/P3 register from the earlier Phase-4 report still applies:
  - Back-button dirty prompt
  - photo background-sync delay
  - video upload progress/cancel
  - CDN deletion retention
  - duplicate pollers (E-D-10/11)
  - focus refetch
  - a11y leftovers
  - email deliverability
  - unused i18n keys
  - add-on reorder buttons
  - `E2E_*` test credentials stored in Production env
  - `APP_BASE_URL` unset
  - AR-EG copy reuses MSA for the new strings
- `CRON_SECRET` is absent from **Preview** (Preview cron is inert). This is fine for launch.
- Missing hashed assets return the SPA `index.html` (200, text/html) rather than 404 (P3).
- The live "+30 more clients" package was created outside this gate — confirm it is intended for launch.
- Older deployment URLs (pre-rotation) still serve the bundle that inlined the old Bunny key. This is harmless only if that key is truly dead (rotation). Consider deleting old deployments or enabling Deployment Protection for them.
- `RC1`/`RC2` are not pushed. Production was deployed from the clean worktree via CLI, **not** from git. Push `cf3a5d9` (and the tags) so `main`/`development` match production before the next git-triggered deploy, or a push of older code could roll it back.

---

**Hard requirement not met:**
- **media upload fails** in production (Bunny 401 on the deployed key)

**Not yet verified (need a human):**
- Google sign-in
- email
- real-phone voice / long-press
- deployed SW update

FORMA PRODUCTION RELEASE: NO-GO
