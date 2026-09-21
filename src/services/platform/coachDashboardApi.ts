import { listAllRelationshipsForCoach } from './coachClientsApi';
import { listClientDashboardSummaries, listMyClients } from './coachApi';
import { coachUnreadCount } from './messagesApi';
import { listWorkoutTemplates, listNutritionTemplates } from './coachAssetsApi';
import { effectiveSubscriptionStatus } from '@/lib/subscription';
import type { AssessmentStatus, Subscription, SubscriptionStatus, UserRecord } from '@/types';

export interface ClientDashboardRow {
  client: UserRecord;
  workouts7d: number;
  lastActivity: string | null; // YYYY-MM-DD of the latest finished workout
  assessment: AssessmentStatus;
  needsAttention: boolean;
  toReview: boolean; // has a submitted check-in awaiting the coach's review
  addedAt: number; // when the coach took this client on (active relationship's createdAt)
  subscription: Subscription | undefined; // from the same relationship list already fetched below — no per-row fetch
}

/** One upcoming renewal (next payment due), for the dashboard breakdown. */
export interface RenewalEntry {
  clientId: string;
  name: string;
  date: number; // renewal date (subscription.endAt), epoch ms
  amount: number; // full term price the client pays on renewal
  currency: string;
  status: SubscriptionStatus | 'none';
}

export interface CoachDashboard {
  totalClients: number;
  activeClients: number;
  pendingAssessments: number; // submitted / updated, awaiting coach review
  adherencePct: number; // % of clients with ≥1 finished workout in the last 7 days
  avgWorkouts7d: number; // avg finished workouts per client over the last 7 days
  checkinsToReview: number;
  unreadMessages: number;
  subs: { trial: number; active: number; pending: number; expired: number; cancelled: number; frozen: number };
  currency: string;
  // Calendar-month cash flow (NOT a blended run-rate): each client's full term
  // price counts in the month their renewal lands, on their own renewal date.
  collectedThisMonth: number; // term price already taken this month (terms started this month)
  dueThisMonth: number; // upcoming renewals still to come this month (active/trial, projected at current price)
  revenueThisMonth: number; // collectedThisMonth + dueThisMonth — total revenue for the month
  lapsedThisMonth: number; // term value lost to churn (expired/cancelled, no renewal) this month
  renewals: RenewalEntry[]; // upcoming renewals (this month + ~14d spillover), sorted by date
  expiring7: number;
  expiring30: number;
  newToday: number;
  newWeek: number;
  newMonth: number;
  retention: { d7: number; d30: number; d90: number };
  churn: { d7: number; d30: number; d90: number };
  templatesCreated: number;
  assessmentsReviewed: number;
  clients: ClientDashboardRow[];
}

const DAY = 86_400_000;
/** First/last epoch-ms of the calendar month containing `now`. */
function monthBounds(now: number): { start: number; end: number } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
  return { start, end };
}

/**
 * One-shot coach dashboard aggregate. `listMyClients` and
 * `listClientDashboardSummaries` are each one batched backend round trip
 * (roster+profiles joined server-side; workouts7d/lastActivity/assessment/
 * toReview aggregated server-side across every client) — this used to fan out
 * three per-client reads (workoutLogs.list + assessment.get + checkIns.list)
 * for every client in `clients.map(...)`. Call via React Query with a stale
 * window. No new Firestore schema.
 */
export async function getCoachDashboard(coachId: string): Promise<CoachDashboard> {
  const [clients, summaries, rels, wTpl, nTpl, unreadMessages] = await Promise.all([
    listMyClients(coachId),
    listClientDashboardSummaries(coachId),
    listAllRelationshipsForCoach(coachId),
    listWorkoutTemplates(coachId).catch(() => []),
    listNutritionTemplates(coachId).catch(() => []),
    coachUnreadCount(coachId).catch(() => 0),
  ]);

  // When each client was taken on — the active relationship's createdAt (falls
  // back to any relationship). Drives the "Added" column in the client list.
  // Also carries the relationship's own `subscription` onto each row, so
  // `ClientPreview` (CoachClients.tsx) can read it directly instead of firing
  // its own `coachClients.get` request per row — this list is already ONE
  // bounded request, not one per client.
  const addedById = new Map<string, number>();
  const subById = new Map<string, Subscription | undefined>();
  for (const r of rels) {
    if (r.status === 'active' || !addedById.has(r.clientId)) {
      addedById.set(r.clientId, r.createdAt);
      subById.set(r.clientId, r.subscription);
    }
  }

  const summaryByClient = new Map(summaries.map((s) => [s.clientId, s]));
  const rows: ClientDashboardRow[] = clients.map((client) => {
    const s = summaryByClient.get(client.id);
    const workouts7d = s?.workouts7d ?? 0;
    const lastActivity = s?.lastActivity ?? null;
    const assess = s?.assessment ?? 'not_started';
    const toReview = s?.toReview ?? false;
    const needsAttention = assess === 'submitted' || assess === 'updated_after_review' || workouts7d === 0 || toReview;
    // Prefer the client's assessment name over a sign-up email-prefix fallback.
    const fullName = s?.fullName;
    const displayClient = fullName ? { ...client, displayName: fullName } : client;
    return {
      client: displayClient,
      workouts7d,
      lastActivity,
      assessment: assess,
      needsAttention,
      toReview,
      addedAt: addedById.get(client.id) ?? client.createdAt,
      subscription: subById.get(client.id),
    };
  });

  const activeClients = clients.filter((c) => c.accountStatus === 'active').length;
  const pendingAssessments = rows.filter((r) => r.assessment === 'submitted' || r.assessment === 'updated_after_review').length;
  const checkinsToReview = rows.filter((r) => r.toReview).length;
  const activeThisWeek = rows.filter((r) => r.workouts7d > 0).length;
  const adherencePct = clients.length ? Math.round((activeThisWeek / clients.length) * 100) : 0;
  const totalWorkouts = rows.reduce((s, r) => s + r.workouts7d, 0);
  const avgWorkouts7d = clients.length ? Math.round((totalWorkouts / clients.length) * 10) / 10 : 0;
  const assessmentsReviewed = rows.filter((r) => r.assessment === 'reviewed').length;

  // ---- subscription / revenue / growth / churn (from relationships) ----
  const now = Date.now();
  const subs = { trial: 0, active: 0, pending: 0, expired: 0, cancelled: 0, frozen: 0 };
  const { start: monthStart, end: monthEnd } = monthBounds(now);
  const SPILL = 14 * DAY; // also surface renewals just past month-end so end-of-month coaches see what's next
  const nameById = new Map(clients.map((c) => [c.id, c.displayName || c.email]));
  // Calendar-month cash flow: count each client's full term price in the month
  // their term starts (collected) or their renewal falls due (upcoming).
  let collectedThisMonth = 0, dueThisMonth = 0, lapsedThisMonth = 0, expiring7 = 0, expiring30 = 0;
  let newToday = 0, newWeek = 0, newMonth = 0;
  const renewals: RenewalEntry[] = [];
  const churnAbs = { d7: 0, d30: 0, d90: 0 };
  let currency = 'EGP';
  const inMonth = (ms: number | undefined | null) => ms != null && ms >= monthStart && ms <= monthEnd;
  for (const rel of rels) {
    const sub = rel.subscription;
    if (rel.createdAt >= now - DAY) newToday += 1;
    if (rel.createdAt >= now - 7 * DAY) newWeek += 1;
    if (rel.createdAt >= now - 30 * DAY) newMonth += 1;
    if (!sub) continue;
    if (sub.currency) currency = sub.currency;
    const eff = effectiveSubscriptionStatus(sub, now);
    if (eff in subs) (subs as Record<string, number>)[eff] += 1;
    const price = sub.price ?? 0;

    // Collected = any term whose START lands in this month (a payment was taken):
    // the current term plus every archived past term.
    if (inMonth(sub.startAt)) collectedThisMonth += price;
    for (const h of rel.subscriptionHistory ?? []) if (inMonth(h.startAt)) collectedThisMonth += h.price ?? 0;

    if (eff === 'trial' || eff === 'active') {
      const left = sub.endAt - now;
      if (left > 0 && left <= 7 * DAY) expiring7 += 1;
      if (left > 0 && left <= 30 * DAY) expiring30 += 1;
      // Upcoming renewal still to come this month → projected income (full term price).
      if (price > 0 && sub.endAt > now && sub.endAt <= monthEnd) dueThisMonth += price;
      // Breakdown: upcoming renewals this month (+ short spillover).
      if (price > 0 && sub.endAt > now && sub.endAt <= monthEnd + SPILL) {
        renewals.push({ clientId: rel.clientId, name: nameById.get(rel.clientId) ?? '—', date: sub.endAt, amount: price, currency: sub.currency ?? currency, status: eff });
      }
    } else if (eff === 'expired' || eff === 'cancelled') {
      const churnedAt = eff === 'cancelled' ? (sub.cancelledAt ?? sub.updatedAt) : sub.endAt;
      if (inMonth(churnedAt)) lapsedThisMonth += price; // term value lost this month
      if (churnedAt >= now - 7 * DAY) churnAbs.d7 += 1;
      if (churnedAt >= now - 30 * DAY) churnAbs.d30 += 1;
      if (churnedAt >= now - 90 * DAY) churnAbs.d90 += 1;
    }
  }
  renewals.sort((a, b) => a.date - b.date);
  const revenueThisMonth = collectedThisMonth + dueThisMonth;
  const denom = Math.max(rels.length, 1);
  const pct = (n: number) => Math.round((n / denom) * 100);
  const churn = { d7: pct(churnAbs.d7), d30: pct(churnAbs.d30), d90: pct(churnAbs.d90) };
  const retention = { d7: 100 - churn.d7, d30: 100 - churn.d30, d90: 100 - churn.d90 };

  return {
    totalClients: clients.length,
    activeClients,
    pendingAssessments,
    adherencePct,
    avgWorkouts7d,
    checkinsToReview,
    unreadMessages,
    subs,
    currency,
    collectedThisMonth: Math.round(collectedThisMonth),
    dueThisMonth: Math.round(dueThisMonth),
    revenueThisMonth: Math.round(revenueThisMonth),
    lapsedThisMonth: Math.round(lapsedThisMonth),
    renewals,
    expiring7,
    expiring30,
    newToday,
    newWeek,
    newMonth,
    retention,
    churn,
    templatesCreated: wTpl.length + nTpl.length,
    assessmentsReviewed,
    clients: rows,
  };
}
