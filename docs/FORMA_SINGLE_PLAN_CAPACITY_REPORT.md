# Forma — Single Public Plan + Internal Client-Capacity Add-ons

Status: **implemented and verified in the isolated environment. Not deployed. No production DB reads or writes. No migration executed.** Stopped for review before the release gate (Phase 4 not started).

Legend: **IMPLEMENTED** · **AUTO-TESTED** (vitest, MongoMemoryReplSet / jsdom) · **BROWSER-TESTED** (Playwright, isolated `e2e3` stack) · **NOT VERIFIED** · **DEFERRED**

---

## 1. Previous plan architecture found
- `coachPlanTiers` held several tiers (`trial` built-in in `tiers-data.ts`, plus admin-created `pro`, …) with per-tier marketing, `isDefaultSignupPlan`, `highlighted`, `requiresPaymentConfirmation`, and a separate shared "core features" list.
- `coachPlans.plan` stored a tier key. `adminUpdate` switched tiers, set `maxClients` directly (`maxClientsOverride`), and recomputed end dates per tier.
- Request types `new_signup` / `trial_upgrade` / `plan_change` / `renewal` / `trial_expired`, built from a live tier at submit time. One actionable request per coach (`uniq_coachId_actionable`).
- The cron raised a "Pro" request when a Trial ended, then **pended the account** after a grace period.
- Revenue was computed from the *live* tier price.

## 2. Final model — IMPLEMENTED
One product, **Forma**: Free Trial → Forma monthly subscription, with every feature included in both. `coachPlans.plan` is only the phase: `'trial' | 'forma'` (legacy `'pro'` is read as `forma`). Extra client capacity is sold as internal **capacity add-ons**, never as a plan.

## 3. Forma configuration fields — IMPLEMENTED, AUTO-TESTED
Stored as the single doc `coachPlanTiers/forma` (`api/coach-plans/_handlers/forma.ts`). Fields: `trialEnabled`, `trialDurationDays`, `trialClientLimit` (null = the base limit), `maxClients` (base, initially 25), `priceMonthly` (499), `currency` (EGP), `billingInterval` (`month`), `termDays` (30), `publicVisible`, `signupEnabled`, `marketingTitle`, `marketingDescription`, `marketingFeatures` (EN + AR).

- The seed defaults apply until the first save. The frontend hardcodes none of these values.
- **Save behaviour:** fields are validated, and the save is one transaction with an audit row (`forma.config_updated`).
- **Raising the base limit** lifts every existing coach whose base is lower, in the same transaction, and keeps their add-ons.
- **Lowering the base limit** affects only *new* Trials and *new* requests. Nobody's capacity is reduced. The UI asks for confirmation first.

## 4. Trial flow — IMPLEMENTED, AUTO-TESTED, BROWSER-TESTED (Flow A)
- **Signup:** `auth.signup` creates the user and the Trial in one transaction (`ensureTrialPlan`), using the config's duration and limit. No payment request is created.
- **Sign-up closed:** if `signupEnabled` is false, signup returns `FORBIDDEN`.
- **Trial disabled:** the coach gets an account and a plan doc that has already ended, so they can sign in and subscribe but get no free access.
- **Trial ends:** the cron marks the plan `expired` and raises a `trial_expired` subscription request. **The account is never pended or deleted.** The coach can sign in, see My Plan and request the subscription.
  - Adding, inviting, accepting or transferring in a client is refused with `SUBSCRIPTION_EXPIRED`.
  - Editors stay locked by the existing `CoachPlanGate`.
  - ⚠ This **supersedes** the earlier rule "pend the account if not confirmed". Spec §6 requires login and My Plan access after expiry. Please confirm.

## 5. Paid subscription flow — IMPLEMENTED, AUTO-TESTED, BROWSER-TESTED (Flow B)
1. The coach clicks "Subscribe to Forma" and confirms a dialog showing the price, limit and term.
2. A `subscription` request is stored with an immutable snapshot of the current config.
3. The Super Admin confirms it in **Plans → Payment requests**, or from the coach detail page.
4. Forma becomes active with `startedAt = confirmation time`, `endsAt = +termDays`, and base capacity = the snapshot's `maxClients`. The subscription snapshot (price/currency/term/requestId) is stored on the plan.

There is no payment gateway, and the UI never claims automatic billing.

## 6. Renewal flow — IMPLEMENTED, AUTO-TESTED, BROWSER-TESTED (B2 decline, B4 early renewal)
- An active paid coach files a `renewal`; the Super Admin can also click **Renew Forma** (confirms the coach's open subscription request or records one with the live snapshot).
- **Final rule (renewal semantics fix):** `termStart = max(current endsAt, confirmedAt)`, `endsAt = termStart + snapshot.termDays`, server time only. An early renewal is appended after the current end (no paid day lost, current `startedAt`/status/access untouched); a late renewal starts at confirmation (no backdating); a second early renewal stacks after the already-extended end. First paid activation (`subscription` / `trial_expired`) still starts at confirmation. Single formula: `computeTermStart` in `api/coach-plans/_subscription.ts`.
- On an early renewal the base client limit is never lowered during already-paid time (`max(current, snapshot)`).
- Capacity add-ons: renewing the same recurring package extends from `max(entitlement endsAt, confirmation)`; an expired add-on starts at confirmation; one-time add-ons are unaffected.
- Audit (`subscription.renewed` / `capacity.request_confirmed`) records `previousEndsAt`, `termStartsAt`, `newEndsAt`, `confirmedAt`, `extended`, `requestId` and the price snapshot; plan history shows `old end → new end`.
- Copy: coach renewal dialog, awaiting-renewal note, admin Renew dialog and payment-request detail all show "current subscription ends X · extended through Y" — never "starts today" for an early renewal.
- One open subscription request at a time (`SUBSCRIPTION_REQUEST_PENDING`); concurrent confirmations apply once.

## 7. Final request model — IMPLEMENTED, AUTO-TESTED
`coachPlanRequests` holds one collection of request types: `subscription | renewal | trial_expired | capacity_addon`. Legacy types are kept read-only.

- `requestKey` is `'subscription'` or `'capacity:<packageId>'`. The database enforces one actionable request per (coach, requestKey) with the partial unique index `uniq_coachId_requestKey_actionable`. A coach can therefore have an open subscription request *and* open add-on requests at the same time.
- Each request carries a `planSnapshot` or a `capacitySnapshot`, and both are immutable.
- **Deadline:** 24 h. `trial_expired` requests have no practical deadline. A request past its deadline cannot be confirmed (`REQUEST_ALREADY_RESOLVED`).
- **Coach API:** `mine`, `submitSubscription`, `submitCapacity`, `cancel {id}`.
- **Super Admin API:** `list` (status/type/coach filters, with coach name/email and current plan from one `$in` query each), `listPending`, `confirm`, `reject`.

## 8. Obsolete multi-plan concepts — IMPLEMENTED
- **Removed:**
  - `tiers-data.ts`, tier list/save/archive, core-features endpoints
  - tier switching and direct `maxClients` editing in `coachPlans.adminUpdate` (now status / end date only, audited)
  - `?plan=` handling, Choose/Change Plan, upgrade/downgrade UI, the tier picker in admin coach detail
  - the `trial_upgrade` / `plan_change` / `new_signup` creation paths
  - the scripts `seed-pro-tier`, `update-pro-tier-features`, `backfillCoachTrialPlans`, `report-plan-data`
- **Copy:** Pro / Upgrade / tier wording replaced with Forma / Subscription / Renew / Client capacity in EN / AR / AR-EG. Historical audit labels are untouched.
- **Old i18n keys:** keys no longer referenced (e.g. `landing.pricingProClients`, `adminPlans.*`) are still in the JSON files but are never rendered — DEFERRED cleanup.

## 9. Capacity package model — IMPLEMENTED
`coachCapacityPackages`: `name` / `description` / `badge` (EN+AR), `additionalClients`, `price`, `currency`, `billingInterval` (`month | one_time`), `durationMonths`, `active`, `coachVisible`, `promotional`, `sortOrder`, `validFrom` / `validUntil`, `targetCoachIds` (private offers), `archived`.

## 10. Capacity entitlement model — IMPLEMENTED
`coachCapacityEntitlements`: `sourcePackageId` (null for custom grants), `source` (`request | admin_package | admin_custom`), an immutable `snapshot`, `status` (`active | expired | cancelled`), `startsAt` / `endsAt` (null = permanent), `requestId`, `confirmedBy`, `note`, `renewals[]`, and the cancel/expire fields.

**Policy:** different packages stack. Only one active entitlement per package (DB index `uniq_active_coach_package`). Buying the same package again **renews** it, extending from `max(now, endsAt)`. Custom grants stack.

## 11. Effective-capacity calculation — IMPLEMENTED, AUTO-TESTED
`maxClients = max(0, baseMaxClients + addonClientCapacity + manualCapacityAdjustment)`

- The value is materialized on `coachPlans` by a single update pipeline (`recomputeCapacity`). It runs inside the same transaction as every change that affects it, so `reserveClientSlot` still compares two fields of one document. `getEffectiveCoachClientLimit` is the read helper.
- `activeClientCount` is never touched by a recompute (test 32).
- **`reserveClientSlot` now also requires a live subscription:** `status: active` and `endsAt` in the future.

## 12. Over-capacity behaviour — IMPLEMENTED, AUTO-TESTED, BROWSER-TESTED (Flow D)
- Existing clients are never removed. Adding, inviting, accepting and transferring in are refused with `CLIENT_CAPACITY_REACHED`.
- The coach sees "38 / 25 clients · Over capacity by 13" on My Plan, a warning banner, a roster badge, and a blocked notice in the invite / add-existing panels with an **Add client capacity** call to action.
- The account is not suspended.
- A client claiming an invite sees a neutral "this coach can't take on new clients right now" message.

## 13. Admin package management — IMPLEMENTED, AUTO-TESTED (component), BROWSER-TESTED (Flow F edit)
**Plans → Capacity packages** supports create, edit, activate/deactivate, archive/restore (with a holder count), reorder, badge, validity dates, admin-only visibility and private targeting. Saves are validated, transactional and audited (`capacity_package.*`). Editing a package never changes held entitlements or open requests.

## 14. Coach My Plan UX — IMPLEMENTED, AUTO-TESTED (7 component tests), BROWSER-TESTED
- **A. Subscription:** phase, state, end date and days left, price (confirmed snapshot, or price after Trial), explanation, manual-payment note, Subscribe/Renew button or "awaiting".
- **B. Client capacity:** used / limit, progress bar, base + add-ons + adjustment breakdown, over-capacity state.
- **C. Active add-ons**
- **D. Available add-ons:** server-filtered to this coach; hidden when the subscription has lapsed; request or renew with a confirmation dialog.
- **E. Requests:** status, amount, hours left, cancel.

The page makes one bounded call (`coachCommercial.myOverview`) and has loading, error and retry states. Refusals show messages chosen by `error.data.reason`.

## 15. Direct admin capacity grants — IMPLEMENTED, AUTO-TESTED (28), BROWSER-TESTED (Flow E)
On admin coach detail:
- **Add capacity:** from a package (including admin-only packages), or a custom grant (clients, monthly/one-time, months, price, required note).
- **Remove:** confirmation copy "This will reduce {name}'s client capacity from X to Y. Existing clients will not be removed."
- **Adjust capacity:** signed value, required reason, live preview.
- Also: request history and plan history.

Every action is transactional, writes an audit row with before/after values, and adds a plan-history entry.

## 16. Offers / promotions — IMPLEMENTED, AUTO-TESTED (37)
- Offered = `active && !archived && coachVisible && within validFrom/validUntil && (no targeting || coach targeted)`, checked **server-side** in both the listing and `submitCapacity`.
- `promotional` and `badge` are shown on the coach card, along with "Offer ends …".
- Packages are never exposed on any public or anonymous endpoint (test 36). The marketing card has no add-on content (Flow A asserts this).

## 17. Snapshot semantics — AUTO-TESTED (7–8, 21–22), BROWSER-TESTED (Flow F)
- Subscription and capacity requests snapshot their price and capacity at submit time.
- Confirmation applies the snapshot, never live config. Revenue uses each coach's confirmed snapshot price.
- The admin request detail warns when the Forma price or limit has changed since the request.

## 18. Concurrency and transactions — AUTO-TESTED (11–12, 30–31), BROWSER-TESTED (Flow G)
- `confirm` runs one transaction: compare-and-swap on the request → apply (subscription or entitlement) → recompute → history → audit row.
- Duplicate confirms → exactly one success.
- One free slot + concurrent joins → exactly one join (also through the real invite UI).
- Duplicate submits are blocked by the partial unique index.

## 19. Indexes added — IMPLEMENTED (self-ensured in code and in `scripts/mongo-init-indexes.mjs`)
- `coachPlanRequests`: `uniq_coachId_requestKey_actionable` (replaces and drops `uniq_coachId_actionable`), `coachId_requestedAt`, plus the existing `status_confirmationDeadline`.
- `coachCapacityPackages`: `active_visible_order`.
- `coachCapacityEntitlements`: `coachId_status`, `uniq_active_coach_package` (partial), `uniq_requestId` (partial), `status_endsAt`.
- `coachPlans`: `status_endsAt`.

## 20. Cron and expiry — IMPLEMENTED, AUTO-TESTED, BROWSER-TESTED
The daily cron (`api/cron/daily-maintenance.ts`, fails closed on `CRON_SECRET`) runs three exported, idempotent sweeps:
1. **Stale requests:** `awaiting` past its deadline → `expired`, with an email.
2. **`expireSubscriptions`:** Trials and paid terms past their end → plan `expired`. A `trial_expired` request is raised for Trials. No account is pended.
3. **`expireCapacity`:** entitlements past their end → `expired`, with a recompute per entitlement in a transaction.

The read path applies the same request-expiry rule. "Extend term" re-opens a lapsed plan.

## 21. Audit events (transactional `writeAuditTx`)
- Subscription: `subscription.confirmed`, `subscription.renewed`, `subscription.request_rejected`, `subscription.admin_updated`
- Capacity requests: `capacity.request_confirmed`, `capacity.request_rejected`
- Capacity changes: `capacity.granted`, `capacity.renewed`, `capacity.granted_custom`, `capacity.cancelled`, `capacity.manual_adjustment`
- Packages: `capacity_package.created`, `.updated`, `.archived`, `.restored`, `.activated`, `.deactivated`
- Config: `forma.config_updated`

## 22. Notifications
- **Emails (best-effort, outside the transaction):** request awaiting, confirmed, declined, expired. The copy no longer says "plan" / "upgrade".
- **In-app:** coach banners (Trial ended / expired / ending soon / over capacity / requests awaiting). The super-admin bell, Overview "needs review" and Subscriptions screen link to the Payment requests tab.
- Email delivery is **NOT VERIFIED** (no `RESEND_API_KEY` in the isolated environment).

## 23. Migration strategy — IMPLEMENTED, run only against a throwaway in-memory DB; **not run against production**
`scripts/migrate-forma-single-plan.mjs` (`npm run mongo:migrate-forma`):
- **Dry run by default.** `--write` requires `--db <MONGODB_DB>` and `--i-understand`.
- Before any change it prints the host, collection counts and every affected row.
- **What it does with `--write`:**
  - creates the Forma config
  - maps legacy tier keys to `forma`
  - initialises the capacity breakdown, **never reducing anyone**: a coach above the base gets the difference as a noted manual adjustment (e.g. 50 vs 25 → +25)
  - adds a legacy subscription snapshot for paid coaches
  - cancels actionable retired-type requests (never deletes them)
  - sets `requestKey` on remaining open requests
- **Report only:** coaches pended by the old grace rule.

Verified on in-memory data: the mismatched-`--db` refusal, the +25 preservation, and the cancel-not-delete behaviour.

## 24. Tests added or updated
- **Backend** (`api/_trpc/routers/coachPlans.test.ts`, rewritten): spec tests **1–37**, plus:
  - signup closed / Trial disabled
  - past-deadline confirm
  - increase-only config propagation
  - expired coach cannot buy capacity
  - admin Renew Forma
  - suspended coach
  - the HTTP error formatter exposing `error.data.reason`
- **Updated:** `certification.test.ts` (new cron semantics, no pend), `phase2`, `coverage`, `_capReservation` (new messages).
- **Component:** `CoachPlan.test.tsx` (7), `Pricing.test.tsx` (3), `admin/plans/plans.test.tsx` (3). These cover the single marketing card, Trial CTA, base capacity, active add-on, available package, request add-on, awaiting state, over-capacity, admin package form, admin confirmation, and mobile cards.
- **e2e3:**
  - `11` rewritten (Flow A)
  - `12` rewritten (B, B2, B3)
  - new `50-capacity.spec.ts` (C, D, E, F, G)
  - `_d-layout` extended with My Plan, the three admin tabs and admin coach capacity
  - `13` / `42` adapted
  - seed moved to the Forma config, the +20 package, and a paid `coachPro`

## 25. Final test count (actually run)
- `npx tsc -b --noEmit` ✅ · API `tsc` ✅ · `npm run build` ✅
- `npm run test -- --run`: **30 files, 281 tests, all passed**

## 26. E2E flows actually executed (isolated in-memory stack, chromium unless noted)
| Run | Specs | Result |
|---|---|---|
| forma-a | 11 (A), 12 (B, B2, B3), 50 (C, D, E) | 7 passed, 2 failed → F/G hit the real 5-signups/hour limit (test setup) |
| forma-b | 50 (C–G) after resetting run-DB `rateLimits` before each test signup | **5/5 passed** |
| forma-reg1 | 00, 10, 13, 20, 21, 42 | 43 passed, 1 failed: 42 admin-plans clicked the header **sync badge's** "Retry" (the 500 batch also carried `sync.pull`) |
| forma-reg5 | 42 with the Retry click scoped to `<main>` | **9/9 passed** |
| forma-reg2 | 44 (1440 layout, EN/AR), 46 (a11y), 47 (network) | 19 passed, 2 failed — **pre-existing** Phase-3 findings E-D-10 (client duplicate batches) and E-D-11 (coach `notifications.list` cadence). Super admin (incl. the new pages) passed |
| forma-resp | 45 at 1280/1024/768/430/390, EN + AR, incl. new pages + pricing | **45/45 passed** |

Not run this round: specs 22, 23, 30–32, 40, 41, 43 (unaffected areas), webkit-iphone, and the PWA check.

## 27. Logo
| Asset | Before | After |
|---|---|---|
| `Forma-logo.png` (1536×1024) → `forma-logo.webp` (960×640, enough for the 288 CSS px splash at 3×) | **1,002,238 B** | **29,240 B** (−97%) |
| `forma-mark.png` (734×687) → `forma-mark-128.webp` (137×128, shown at 32 px) | 196,608 B | 4,196 B |

- Visually compared side by side at display size: no visible difference.
- The old PNGs were removed and all 9 references updated. Both WebPs are in `includeAssets`.
- The unreferenced 1.7 MB `public/Forma.png` is now excluded from the precache (left on disk for you to decide). PWA precache: **5,116 KiB → 2,290 KiB**.

## 28. Known limitations
- Early renewal applies the new snapshot's price/limit to the plan record at confirmation (base never lowered during paid time); there is no deferred "price change on term boundary" scheduler.
- Pended-account behaviour changed (see §4). Coaches already pended by the old rule are **reported, not auto-un-pended**. Confirming payment still un-pends them.
- Legacy paid coaches without a subscription snapshot count as 0 in tracked revenue until migrated (the migration adds a legacy snapshot).
- The AR-EG copy for the new `forma.*` strings reuses Modern Standard Arabic (except the invite message).
- Unused legacy i18n keys remain (not rendered).
- Pre-existing 47 network findings (E-D-10/11) remain open.
- Email delivery is not verified.
- Admin package reorder uses up/down buttons (no drag and drop).

## 29. Manual production steps (Phase 4 — not done)
1. Review this report and the §4 / §6 product decisions.
2. Take an Atlas backup, then run `node scripts/migrate-forma-single-plan.mjs` (dry run) against production **read-only** and review the output.
3. With approval: run `--write --db <name> --i-understand`, then `node scripts/mongo-init-indexes.mjs`.
4. Review the coaches reported in step 6 of the script and un-pend them if appropriate.
5. Set the real Forma config in Admin → Forma Plan and create the capacity packages.
6. Deploy. Separately, the still-outstanding Bunny key rotation / Vercel env swap.

## 30. Files changed
- **Backend (new):** `api/_lib/commercialReason.ts`, `api/coach-plans/_handlers/forma.ts`, `api/coach-plans/_capacity.ts`, `api/coach-plans/_subscription.ts`, `api/_trpc/routers/coachCommercial.ts`
- **Backend (changed):** `api/_trpc/{trpc,router}.ts`, `routers/{coachPlanRequests,coachPlanTiers,coachPlans,adminCoaches,auth,invites}.ts`, `api/coach-plans/_data.ts`, `api/coach-clients/{_data,_service,_types}.ts`, `api/cron/daily-maintenance.ts`, `api/admin/_lib/{audit,types}.ts`, `api/_lib/email.ts`
- **Backend (deleted):** `api/coach-plans/_handlers/tiers-data.ts`
- **Backend tests:** `routers/{coachPlans,certification,phase2,coverage}.test.ts`, `coach-clients/_capReservation.test.ts`
- **Frontend (new):** `src/services/platform/coachCommercialApi.ts`, `src/lib/{commercialErrors,formaFormat}.ts`, `src/components/coach/ClientCapBlocked.tsx`, `src/pages/admin/plans/{FormaPlanTab,CapacityPackagesTab,PaymentRequestsTab,ToggleRow}.tsx`, tests `CoachPlan.test.tsx`, `Pricing.test.tsx`, `plans/plans.test.tsx`
- **Frontend (changed):** `src/types/index.ts`, `services/platform/{coachPlanApi,coachPlanRequestsApi,coachPlanTiersApi,adminCoachesApi}.ts`, `pages/coach/{CoachPlan,CoachClients,AddExistingClient}.tsx`, `pages/admin/{AdminPlans,AdminCoachDetail,AdminCoaches,AdminSubscriptions,dashboard/OverviewPanel}.tsx`, `pages/marketing/sections/Pricing.tsx`, `pages/auth/{AcceptInvite,Login,…}.tsx`, `pages/RoleAccount.tsx`, `components/coach/CoachPlanBanner.tsx`, `hooks/useNotifications.ts`, logo references in 9 files, i18n `en` / `ar` / `ar-eg`
- **Infra:** `vite.config.ts`, `package.json`, `scripts/{mongo-init-indexes,migrate-forma-single-plan(new),reconcile-active-client-counts}.mjs`
- **Scripts deleted:** `seed-pro-tier`, `update-pro-tier-features`, `backfillCoachTrialPlans`, `report-plan-data`
- **Assets:** `public/forma-logo.webp`, `public/forma-mark-128.webp` added; `Forma-logo.png` and `forma-mark.png` removed
- **e2e3:** `env/{seed-data,server}.mjs`, `README.md`, specs `11`, `12`, `13`, `42`, `_d-layout`, new `50-capacity`
