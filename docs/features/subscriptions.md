# Feature: Subscriptions (two layers)

**Purpose.** Two distinct subscription concepts:
- **Layer A — Coach ⇄ Forma plan** (`coachPlans/{coachId}`): the coach's platform tier, client cap, term/end
  date, status. Editable tiers in `coachPlanTiers/{key}`.
- **Layer B — Client ⇄ Coach subscription** (`coachClients/{coachId__clientId}.subscription`): what the client
  pays their coach (term, price, freeze, history).

**Data model.** Layer A `CoachPlan` (plan, status, maxClients, startedAt, endsAt, trialNotified, activeClientCount,
history). Layer B `Subscription` (startAt, endAt, months, price, currency, status, frozenFrom/Until) +
`subscriptionHistory: SubscriptionPeriod[]`.

**Key services.** [`coachPlanApi.ts`](../../src/services/platform/coachPlanApi.ts) (`coachPlanState`,
`renewCoachPlan`, `setCoachTier`, plan-change requests), [`coachPlanTiersApi.ts`](../../src/services/platform/coachPlanTiersApi.ts)
(tier CRUD + `tierLabel`), [`coachClientsApi.ts`](../../src/services/platform/coachClientsApi.ts) (Layer B term/
price/freeze), revenue projection in [`coachDashboardApi.ts`](../../src/services/platform/coachDashboardApi.ts)
(calendar-month cash flow: `revenueThisMonth = collected + due`).

**Key UI.** Coach: `CoachPlan` (own plan + request), `CoachSubscriptionPanel` (a client's Layer-B sub),
`CoachPlanProvider`/`CoachPlanGate`/`CoachPlanBanner` (lapse gate + alert). Admin: `AdminCoaches`/`AdminCoachDetail`
(manage Layer A + renew), `AdminPlans` (tier CRUD), dashboard `RevenuePanel`.

**Permissions / rules.** Coach self-creates a locked trial; only super-admin (`users.manageStatus`) edits tiers/
plan; `coachPlanTiers` read by any signed-in user, write by super-admin. Lapsed coach → soft read-only gate.

**Edge cases.** Paid tiers default to a 30-day term so the lapse gate applies; reason-only coach requests = renewal
requests; revenue counts each term price once in its renewal month (not a blended run-rate).

**Testing.** `e2e/subscription.spec.ts`, `e2e/super-admin.spec.ts` (tier CRUD + renew), `e2e/coach-dashboard.spec.ts`
(revenue tiles + renewals breakdown).
