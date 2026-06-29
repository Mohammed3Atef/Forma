import { collection, getDocs, query, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { fetchClientLogs, getClientAssessment, listMyClients } from './coachApi';
import { listCheckIns } from './checkInApi';
import { coachUnreadCount } from './messagesApi';
import { listWorkoutTemplates, listNutritionTemplates } from './coachAssetsApi';
import { assessmentStatus } from '@/lib/assessment';
import { effectiveSubscriptionStatus } from '@/lib/subscription';
import type { AssessmentStatus, CoachClientRelationship, SubscriptionStatus, UserRecord, WorkoutLog } from '@/types';

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export interface ClientDashboardRow {
  client: UserRecord;
  workouts7d: number;
  lastActivity: string | null; // YYYY-MM-DD of the latest finished workout
  assessment: AssessmentStatus;
  needsAttention: boolean;
  addedAt: number; // when the coach took this client on (active relationship's createdAt)
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
 * One-shot coach dashboard aggregate. Reuses existing per-client reads
 * (listMyClients, fetchClientLogs, getClientAssessment, listCheckIns) plus the
 * messages unread total. Client-side N+1 — fine for typical client counts;
 * call via React Query with a stale window. No new Firestore schema.
 */
export async function getCoachDashboard(coachId: string): Promise<CoachDashboard> {
  const { db } = ensureFirebase();
  const clients = await listMyClients(coachId);
  const since = cutoff(7);
  const [relSnap, wTpl, nTpl] = await Promise.all([
    getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId))),
    listWorkoutTemplates(coachId).catch(() => []),
    listNutritionTemplates(coachId).catch(() => []),
  ]);

  // When each client was taken on — the active relationship's createdAt (falls
  // back to any relationship). Drives the "Added" column in the client list.
  const addedById = new Map<string, number>();
  for (const d of relSnap.docs) {
    const r = d.data() as CoachClientRelationship;
    if (r.status === 'active' || !addedById.has(r.clientId)) addedById.set(r.clientId, r.createdAt);
  }

  const [rows, unreadMessages] = await Promise.all([
    Promise.all(
      clients.map(async (client) => {
        const [logs, assessment, checkIns] = await Promise.all([
          fetchClientLogs<WorkoutLog>(client.id, 'workoutLogs', 30),
          getClientAssessment(client.id),
          listCheckIns(client.id),
        ]);
        const finished = logs.filter((w) => w.finished);
        const workouts7d = finished.filter((w) => w.date >= since).length;
        const lastActivity = finished.reduce<string | null>((m, w) => (!m || w.date > m ? w.date : m), null);
        const assess = assessmentStatus(assessment);
        const toReview = checkIns.some((c) => c.status === 'submitted');
        const needsAttention = assess === 'submitted' || assess === 'updated_after_review' || workouts7d === 0 || toReview;
        // Prefer the client's assessment name over a sign-up email-prefix fallback.
        const fullName = assessment?.basic?.fullName?.trim();
        const displayClient = fullName ? { ...client, displayName: fullName } : client;
        return { client: displayClient, workouts7d, lastActivity, assessment: assess, needsAttention, toReview, addedAt: addedById.get(client.id) ?? client.createdAt };
      }),
    ),
    coachUnreadCount(coachId).catch(() => 0),
  ]);

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
  const rels = relSnap.docs.map((d) => d.data() as CoachClientRelationship);
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
    clients: rows.map(({ toReview: _toReview, ...row }) => row),
  };
}
