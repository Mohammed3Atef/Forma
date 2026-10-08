# Forma Beta Readiness — Audit & Implementation Plan

**Scope:** Phases 1–4 — Coach onboarding & client invites · Client subscriptions & revenue tracking · Coach business dashboard & analytics · Super-admin SaaS control panel.
**Method:** Full audit of the live codebase (`src/`, `firestore.rules`, `e2e/`) against the finalized roadmap. Pre-implementation document — nothing is built yet.
**Date:** June 24, 2026.

---

## 0. Guardrails (every phase)

- **Do NOT build / rebuild:** Stripe, PayPal, payment processing, AI, community feed, booking, **progress photos**, **before/after comparison** (these exist or are postponed).
- **Tracking only** — no money moves anywhere in Phases 1–4.
- **Keep roles:** `super_admin · admin · coach · client`. **Preserve the security model** (rules are the real boundary).
- **Additive only:** new optional fields + new collections. No schema rewrites. Legacy docs keep working (rules use `.get(field, default)`; TS uses `??`).
- **Responsive:** Coach = mobile+tablet+desktop · Admin = mobile+tablet+desktop · Client = mobile PWA only. (The responsive shell already exists — reuse it.)
- **Build green after every phase:** `npm run lint` · `npm run build` · Playwright `e2e/`.

---

## 1. Two subscription layers (important distinction)

The roadmap introduces a second, separate subscription concept. Keep them distinct in code and data:

| Layer | What it is | Who manages | Where stored | Phase |
|---|---|---|---|---|
| **A — Coach plan** | The coach's own subscription **to Forma** (trial / starter / pro / enterprise) with a **client limit**. | super_admin (coach self-creates a locked trial on signup) | **NEW** `coachPlans/{coachId}` | 1 (trial) + 4 (management) |
| **B — Client subscription** | What a coach **tracks per client** (plan name, price, billing cycle, dates, status). | coach | existing `coachClients/{coachId__clientId}.subscription` | 2 |

This avoids overloading the existing client `Subscription` type with coach-plan concepts.

---

## 2. Current-state summary (already built — do not rebuild)

| Area | Status | Source |
|---|---|---|
| Responsive shell (coach+admin sidebar/desktop topbar at ≥md; client mobile-first) | ✅ Exists | `components/shell/ResponsiveShell.tsx`, `apps/{CoachApp,AdminApp}.tsx` |
| Coach dashboard w/ KPIs (clients, adherence, pending assessments, check-ins, unread), attention/recent lists, bar chart, quick actions | ✅ Exists (extend in P3) | `pages/coach/CoachDashboard.tsx`, `services/platform/coachDashboardApi.ts` |
| Admin overview/analytics w/ **server-side counts** (`getCountFromServer`), audit feed | ✅ Exists (extend in P4) | `pages/admin/{AdminOverview,AdminAnalytics}.tsx`, `services/platform/analyticsApi.ts` |
| Client subscription model + freeze + history on `coachClients` | ✅ Exists (extend states in P2) | `types/index.ts`, `pages/coach/CoachSubscriptionPanel.tsx` |
| Subscription **read-only gating** for frozen/ended in workout+nutrition stores; client banner | ✅ Exists (extend states in P2) | `stores/subscriptionGate.ts`, `lib/subscription.ts` |
| Coach/admin account creation w/o losing session (secondary app, temp password) | ✅ Exists (replace temp-pw w/ invites in P1) | `services/accounts/createUserSecondary.ts` |
| Self sign-up → client/pending; rules `isSelfProvisionDefaults()` | ✅ Exists (widen for coach in P1) | `services/accounts/accountService.ts`, `firestore.rules` |
| Starter library seed (exercises + PPL/UL/FB templates + foods) | ✅ Script exists (productize in P1/P4) | `scripts/seed-coach-assets.mjs` |
| Bilingual EN/AR (1,202 keys) + RTL e2e | ✅ Exists (add keys per phase) | `i18n/*.json`, `e2e/rtl.spec.ts` |
| Progress photos + before/after comparison | ✅ Exists — **excluded** | `pages/{ProgressPhotos,Progress}.tsx` |
| E2E suite + fixtures (`signInAs`, `createClientViaApi`) | ✅ Exists (add specs per phase) | `e2e/` |

**Net new build concentrates in:** coach self-signup (active + trial + limit), client invites, the coach-plan layer + super-admin panel (Phase 4), and the revenue/retention analytics (Phases 2–3).

---

# PHASE 1 — Coach onboarding & client invites

### Gap analysis
| Requirement | Today | Gap |
|---|---|---|
| Choose Coach/Client at signup; client flow unchanged | Signup always → client | Add role chooser; client path stays identical |
| Coach signup → role=coach, **status=active**, auto trial | Self-signup locked to `client`; rules forbid self-coach | Widen self-provision to active coach + create coach trial plan |
| Coach trial `{plan:trial,status:active,maxClients:10,durationDays:15}` | None | New `coachPlans/{coachId}` doc on signup |
| Trial expiry notifications to coach at **7 / 3 / 1 days remaining** | None | Scheduled/last-seen check raises coach notifications |
| Simple checklist (profile / first client / first template) — **not** a wizard | None | Small checklist card on dashboard |
| Client invite link + code + copy; client sets own password; auto-assigned | Temp-password via `createUserSecondary` | New `signupInvites/{code}` + public `/invite/:code` claim |
| Block client creation when `activeClients >= maxClients`; show `3 / 5 used` | No limit | Count gate + usage UI |

### Data model changes (additive)
```ts
// NEW collection coachPlans/{coachId}
type CoachPlanTier = 'trial' | 'starter' | 'pro' | 'enterprise';
type CoachPlanStatus = 'active' | 'expired' | 'suspended';
interface CoachPlan {
  coachId: string;            // == doc id
  plan: CoachPlanTier;
  status: CoachPlanStatus;
  maxClients: number;         // trial = 10
  startedAt: number;
  endsAt: number | null;      // trial = startedAt + 15d; paid tiers null until P4
  // trial-expiry notification bookkeeping (avoid duplicate sends)
  trialNotified?: { d7?: boolean; d3?: boolean; d1?: boolean };
  createdAt: number;
  updatedAt: number;
}
// NEW collection signupInvites/{code}
interface SignupInvite {
  code: string; coachId: string;
  email?: string; displayName?: string; phone?: string;
  status: 'pending' | 'claimed' | 'revoked';
  claimedByUid?: string | null;
  createdAt: number; claimedAt?: number | null; expiresAt?: number | null;
}
// UserRecord: add coach profile fields (all optional) — bio, specialty,
// yearsExperience, instagram, whatsapp, onboarding{profileDone,firstClientDone,firstTemplateDone}
```

### Firestore changes
- **`coachPlans/{coachId}`**: `read` owner coach or `users.read`; `create` self **only** with locked trial defaults (`plan=='trial' && status=='active' && maxClients==10` & coach owns the id) **or** `users.manageStatus`/super; `update/delete` super_admin / `users.manage*` only (a coach can't raise their own limit). Note: the coach may update **only** the `trialNotified` flags on their own plan (so the expiry-notification check can mark sends) — never `plan`/`status`/`maxClients`.
- **`signupInvites/{code}`**: `create/update/revoke` owning coach or `coaches.assign`; `read` by any signed-in user (the code is the capability; keep payload minimal); `claim` allowed only when `status=='pending'` and `claimedByUid==request.auth.uid`.
- **Widen `isSelfProvisionDefaults()`** to allow `role in ['client','coach']`; coach self-create requires `accountStatus=='active'`, `permissions==[]`, `createdBy=='self'`.
- **Invite-driven self-assignment:** allow a new client to set own `assignedCoachId=X` + create `coachClients/{X__uid}` **iff** a matching `signupInvites` exists with `coachId==X && status=='pending'` (rules `get()`; keep the write to a single relationship to respect the 10-doc budget).

### Security changes / review
- New negatives in `e2e/security.spec.ts`: client can't self-create an **admin/super** or raise `permissions`; coach can't create/modify own `coachPlans` beyond locked trial; invite can't be reused/forged; can't attach to a coach without a valid invite.
- **Risk (accepted by design):** active coach self-signup means anyone can become a coach. Mitigations: coach role only ever reaches its **own** clients (no admin/cross-coach access), and the trial caps `maxClients=5`. Documented in Risks.

### UI changes (responsive: build in `ResponsiveShell`)
- `pages/auth/Login.tsx`: role chooser (Coach/Client) on the sign-up tab.
- `pages/coach/onboarding/CoachChecklist.tsx`: 3-item card on `CoachDashboard` until done; persists to `UserRecord.onboarding`.
- `pages/auth/AcceptInvite.tsx` (public `/invite/:code` in `AnonymousApp`): show coach name → set password → create account → claim invite → land in client app.
- `CoachClients`: "Invite by link/code" action (generate, copy, list pending invites) **alongside** existing create; show `N / max used`; disable create + show upsell when at limit.
- **Trial-expiry notifications:** on coach app foreground (reuse the existing `refreshAccount` visibility hook), compute days-left from `coachPlans.endsAt` and raise a coach notification at 7 / 3 / 1 days, marking `trialNotified.d7|d3|d1` so each fires once. Reuses the existing notification system + a banner on the dashboard. (No cron needed; client-foreground check is sufficient and matches Forma's existing suspend-on-foreground pattern.)

### E2E changes
- `coach-signup.spec.ts` (signup as coach → active → trial plan created → checklist visible).
- `client-invite.spec.ts` (generate code → `/invite/:code` claim → auto-assigned → appears in coach clients → counts toward limit; creation blocked at limit).
- Extend `fixtures/factory.ts`: `createInvite()`, `claimInvite()`.

### Migration strategy
- New collections only; nothing to migrate. Existing coaches get a trial plan via an idempotent `scripts/backfill-coach-plans.mjs` (skip if a `coachPlans/{coachId}` exists).

### Risks
- Open coach signup abuse → mitigated by trial limit + coach-scoped access; super-admin can suspend (Phase 4).
- `maxClients` is enforced client-side (rules can't cheaply count) → a determined coach could exceed via direct writes; super-admin oversight + optional maintained counter later. Documented.

### Final implementation plan (order)
1. Types + `coachPlans`/`signupInvites` services. 2. Rules + deploy + security e2e. 3. Coach signup path + auto trial. 4. Invite generate/claim + `/invite/:code`. 5. Checklist + limit gate UI. 6. Backfill script. 7. Green check.

---

# PHASE 2 — Client subscriptions & revenue tracking (tracking only)

### Gap analysis
| Requirement | Today | Gap |
|---|---|---|
| States: trial/active/pending/expired/cancelled/frozen | `active/frozen/ended` | Add trial/pending/cancelled; map `ended→expired`; keep `frozen` |
| Access: trial/active=full · pending=limited screen · expired/cancelled/frozen=read-only | frozen/ended→read-only; **unset→no gating** (the bug) | Extend gating; unset/pending → limited screen |
| Create client requires plan choice (Trial / 1 Month / 3 Months / Custom) | Optional, set later | Required selector at creation; auto-create record |
| Store planName, price, billingCycle, startDate, endDate, status | price/currency/dates/months exist | Add `planName`, `billingCycle` |
| Coach: Renew / Cancel / Extend / Freeze / Unfreeze | term edit + freeze/end exist | Add explicit Renew/Cancel/Extend + `cancelled` |

### Data model changes (extend existing `Subscription`)
```ts
type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'custom';
type SubscriptionStatus = 'trial'|'active'|'pending'|'expired'|'cancelled'|'frozen'|'ended';
interface Subscription { /* +planName?, +billingCycle?, +cancelledAt?, +trialEndsAt? */ }
```
- `lib/subscription.ts → effectiveSubscriptionStatus()`: fold date into the new states; **unset → `pending`** (no more "none = full access").
- `stores/subscriptionGate.ts`: read-only for `expired|cancelled|frozen`; `pending` → limited screen; `trial|active` → full.

### Firestore changes
- **None to boundaries** — subscription lives on `coachClients` (already coach-write/client-read). New fields are additive.

### Security changes
- `e2e/security.spec.ts`: client still can't write the relationship/subscription; each state's client-app write attempts (log workout/meal) blocked when read-only.

### UI changes
- `CoachSubscriptionPanel`: add Plan Name, Billing Cycle, Renew/Cancel/Extend actions; show new status chips.
- `CoachClients` create flow: required plan selector (Trial/1M/3M/Custom) → auto-create record.
- Client: `pages/SubscriptionPending.tsx` limited screen for `pending`; extend `SubscriptionBanner` for expired/cancelled/expiring-soon. Mobile-first (client) + verify coach panels at tablet/desktop.

### E2E changes
- Extend `subscription.spec.ts`: state→access matrix (trial/active full; pending limited; expired/cancelled/frozen read-only); auto-create on client creation; renew/cancel/extend transitions.

### Migration strategy
- Map legacy `ended→expired` in code (no data migration). **Run `scripts/backfill-subscriptions.mjs`** (idempotent) giving existing **active** clients a default `active`/`trial` record **before** enabling tighter gating, so no current client is locked out. Land backfill + gating together.

### Risks
- Tightening unset→pending changes behavior for clients with no subscription → backfill mitigates; communicate to coaches.

### Final implementation plan
1. Extend types + `effectiveSubscriptionStatus` + gate. 2. Coach panel actions + create-flow selector. 3. Client pending/limited screen + banners. 4. Backfill. 5. e2e matrix. 6. Green check.

---

# PHASE 3 — Coach business dashboard & analytics

### Gap analysis
| Requirement | Today | Gap |
|---|---|---|
| Cards: Total/Active/Trial/Expired/Cancelled/Frozen clients | Total+Active only | Add status breakdown (from P2 states) |
| Monthly / Expected / Lost revenue | None | Sum `price` by status/billingCycle |
| Expiring in 7 / 30 days | None | From `endAt` |
| Unread / Pending Assessments / Pending Reviews | ✅ exists | Reuse |
| Workout / Nutrition adherence, Assessment completion | Workout + pending only | Add nutrition adherence + completion % |
| Retention 7/30/90, Churn 7/30/90 | None | Derive from `createdAt` + status |
| New clients today/week/month | None | From `createdAt` |
| Revenue trend (monthly), Client growth trend (monthly) | None | Charts (reuse `BarChart`/charts) |
| Coach activity: templates created, plans assigned, messages sent, assessments reviewed | None | Counts from existing collections |

### Data model changes
- **None required.** Derive from existing `coachClients` (status/price/dates/createdAt), `coachAssets` (templates), `messages`, assessments, logs. Add fields to the `CoachDashboard` API return type only.

### Firestore changes
- None. Consider composite indexes if new `where`/`orderBy` queries are added (declare in `firestore.indexes.json`).

### Security changes
- None (coach reads own clients via existing relationship rules).

### UI changes
- Extend `CoachDashboard`: Revenue card group, Subscriptions breakdown group, Client-analytics group (New/Churn/Retention), engagement (nutrition adherence, assessment completion), two trend charts, Coach-activity tiles, and a **Send Broadcast** quick action (compose → `Message.broadcast`). All via `ResponsiveGrid` (mobile→desktop reflow).
- Extend `coachDashboardApi.ts` aggregate (keep React-Query stale window; client-side aggregation is fine for typical counts).

### E2E changes
- `coach-dashboard.spec.ts`: seed clients with mixed subscription states → assert card counts, revenue sums, retention/churn, charts render, broadcast composer opens.

### Migration strategy
- None (read-only analytics over existing data).

### Risks
- N+1 client-side aggregation cost at scale → mitigate with stale window now; move to a precomputed `coachStats` doc later if needed.

### Final implementation plan
1. Extend dashboard API. 2. Cards + groups + charts + broadcast action. 3. e2e. 4. Green check.

---

# PHASE 4 — Super-admin SaaS control panel (coach plans)

### Gap analysis
| Requirement | Today | Gap |
|---|---|---|
| Super-admin cards: Total/Trial/Active/Expired coaches, Total clients, Total tracked revenue | Role counts only (`AdminOverview`) | Add coach-plan breakdown + tracked revenue |
| **Trial → Active conversion rate** (coaches who moved off trial to a paid/active plan ÷ total coaches who started a trial) | None | New metric in `analyticsApi` + overview card |
| Top coaches; Recently registered coaches | None | Lists from `coachPlans` + `users` |
| Coach detail: current plan, trial status (days left), clients used / limit | None | New coach detail page |
| Actions: Extend trial, Upgrade/Downgrade plan, Suspend/Reactivate coach, Adjust client limits | Account suspend exists (status) | Coach-plan mutations (super-admin only) |
| Future plans: Trial / Starter / Pro / Enterprise (tracking + permissions only) | None | Tier definitions + `maxClients` per tier |

### Data model changes
- Reuses `coachPlans/{coachId}` from Phase 1. Add a static tier table in code:
```ts
const COACH_PLAN_TIERS = {
  trial:      { maxClients: 10,  durationDays: 15 },
  starter:    { maxClients: 25 },
  pro:        { maxClients: 100 },
  enterprise: { maxClients: 1000 },
};
```
- "Total tracked revenue" = sum of client `subscription.price` across coaches (read-only aggregation).

### Firestore changes
- `coachPlans` `update` already restricted to super_admin / `users.manage*` (Phase 1). Suspend/reactivate coach maps to existing `users.manageStatus` on the coach's `users` doc (already supported by rules).
- Add indexes if querying `coachPlans` by `plan`/`status`.

### Security changes
- Only `super_admin` (or `users.manageStatus`) may mutate `coachPlans` and coach `accountStatus`. `e2e/super-admin.spec.ts` + `security.spec.ts`: a coach/admin cannot change plan tiers or limits; a suspended coach is blocked by existing status gating.

### UI changes (responsive admin)
- `config/nav.ts`: add **Coaches** to `SUPER_ADMIN_NAV`.
- `pages/admin/AdminCoaches.tsx` (list: plan, status, clients used/limit, registered date, sortable) using existing `DataTable`.
- `pages/admin/AdminCoachDetail.tsx`: plan + trial days-left + usage + actions (extend trial, upgrade/downgrade, suspend/reactivate, adjust limit).
- Extend `AdminOverview`/`AdminAnalytics` cards (coach-plan breakdown, tracked revenue, top/recent coaches) — extend `analyticsApi.fetchPlatformStats` with `getCountFromServer` over `coachPlans`.

### E2E changes
- `super-admin-coaches.spec.ts`: super-admin sees coach list/detail, extends trial, changes tier (limit updates), suspends→coach blocked, reactivates. Keep `coach-responsive`/`rtl` green for new admin screens.

### Migration strategy
- `backfill-coach-plans.mjs` (from Phase 1) ensures every existing coach has a plan doc so the panel is populated. Idempotent.

### Risks
- `maxClients` enforcement remains client-side (see P1). Super-admin limit changes take effect on the coach's next client-create; instantaneous enforcement would need a counter/Cloud Function (out of scope).

### Final implementation plan
1. Tier table + `coachPlans` admin services. 2. Coaches list + detail + actions. 3. Extend platform stats + overview cards. 4. e2e. 5. Green check.

---

## 3. Cross-cutting

- **Responsive:** every new coach/admin screen renders inside `ResponsiveShell` (mobile bottom-nav ↔ tablet/desktop sidebar) using `ResponsiveGrid`/`DataTable`/`DetailPanel`; verify at 390 / 820 / 1280 px. New client screens stay in `AppShell` (mobile PWA). Extend `e2e/coach-responsive.spec.ts`.
- **i18n:** add EN + AR keys for every new string; keep `rtl.spec.ts` green.
- **Build-green checkpoints:** `npm run lint && npm run build && npx playwright test` after each phase; update `_shots.spec.ts`.

## 3b. Production readiness (this is a real launch, not a beta)

Because Forma ships to real coaches/clients on launch, treat every phase as production work:

- **Abuse control on open coach signup:** require **email verification** before a coach can add clients; keep super-admin **Suspend Coach** (Phase 4) as the kill switch; add basic signup throttling (Firebase App Check / rate limit) and block disposable patterns where feasible. A suspended coach is already blocked by status gating.
- **`maxClients` integrity:** client-side gating is not trust-safe in production. Add a **server-validated guard** — maintain `coachPlans/{coachId}.activeClientCount` and have rules reject a new `coachClients` create when `activeClientCount >= maxClients` (increment/decrement on assign/unassign). This closes the bypass noted in the risks. (Counter drift handled by a periodic reconcile script.)
- **Invite hardening:** invites expire (`expiresAt`), are single-use (`status` flips to `claimed` atomically in the claim write), and revocable; `/invite/:code` reveals only coach display name (no PII).
- **Live-data migrations:** every backfill script is **idempotent + dry-run first** (`--dry-run` prints counts), run against a staging copy before prod, and gated so it never downgrades an existing record. Tighter subscription gating ships **after** the subscription backfill so no active client is locked out at launch.
- **No orphaned data:** failed account/auth creation already cleans up the auth user (`createUserSecondary`); apply the same all-or-nothing pattern to invite-claim and plan creation.
- **Observability:** surface clear error/empty/loading states (Phase 4 polish) and keep `adminAuditLogs` writing for coach-plan and status changes.
- **Quality gate before launch:** full `lint + build + playwright` green, plus a manual pass on the three breakpoints (390/820/1280) and an Arabic/RTL pass on every new screen. Recommend a final verification subagent + screenshot review per phase.

## 4. Decisions already fixed by this roadmap
Coach signup = **active + auto trial** (no admin approval) · invites = **self-claim link/code** · client subscription unset → **pending/limited** with a **backfill** before tightening · coach plan tiers tracked-only with **client limits**. No further confirmation needed to start Phase 1.
