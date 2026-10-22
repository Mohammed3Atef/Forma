import type { CoachClientRelationship, WeeklyCheckIn } from '@/types';
import { buildTodayQueue, type KindStatus, type TodayItem, type TodayKind, type TodaySources } from './coachToday';
import { effectiveSubscriptionStatus, subscriptionDaysLeft } from './subscription';
import { diffDays } from './utils';

/**
 * Coach Clients directory (B3.3 / blueprint §6.2, owner brief 2026-10-17).
 *
 * One row per client on the coach's ACTIVE roster, built from the same
 * sources and the same queue rules as Today (`buildTodayQueue`), so the two
 * screens can never disagree about who needs the coach. Every state below is
 * defined from a stored fact (docs/product-audit/B3_CLIENTS_DIRECTORY.md);
 * nothing is scored or predicted, and a value whose source failed is
 * `null` ("unknown"), never a guess.
 */

/** Subscription (package) state — the coach's term with the client, not the account. */
export type ClientState = 'active' | 'trial' | 'expiring' | 'paused' | 'expired' | 'pending' | 'none';
/** This coach's weekly check-in, this week. */
export type CheckInState = 'review' | 'awaiting' | 'overdue' | 'done' | 'notRequested';
export type DirectoryTask = 'needs' | 'checkin' | 'renewal' | 'lapsed';
export type DirectorySort = 'needs' | 'name' | 'lastWorkout' | 'daysLeft' | 'workouts';
export type PlanFilter = 'noWorkout' | 'noNutrition';

/** "Expiring": a running term with this many days or fewer left (also Today's renewal window). */
export const EXPIRING_DAYS = 7;

export interface DirectoryClientInput {
  id: string;
  displayName?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  accountStatus?: string;
}

export interface DirectoryRow {
  id: string;
  name: string;
  photoUrl?: string;
  accountStatus: string;
  /** null = the relationship list did not load. */
  state: ClientState | null;
  /** Whole days left on a running term (null when not running / unknown). */
  daysLeft: number | null;
  /** `YYYY-MM-DD` of the last finished workout (null = none ever, undefined = unknown). */
  lastWorkout: string | null | undefined;
  /** Days since the last workout, against `todayKey` (null = none ever / unknown). */
  daysSinceWorkout: number | null;
  /** Finished workouts in the last 7 days (null = unknown). */
  workouts7d: number | null;
  /** Plan content (O-7); null = unknown. */
  hasWorkoutPlan: boolean | null;
  hasNutritionPlan: boolean | null;
  /** This coach's check-in this week (null = unknown). */
  checkIn: CheckInState | null;
  /** Queue items for this client, in Today's priority order (the first is the row's reason). */
  needs: TodayItem[];
  /** When this coach took the client on. */
  addedAt: number | null;
  /** Lower-cased name + email + phone, for local search (never shown in a row). */
  search: string;
}

export interface Directory {
  rows: DirectoryRow[];
  /** Per-kind queue status (a failed source means its filter can't be trusted). */
  status: Record<TodayKind, KindStatus>;
  /** Whether the roster itself loaded. */
  rosterReady: boolean;
  rosterError: boolean;
  /** B3.9 (CO-18): no roster on this device and its read is paused offline — offline, not loading. */
  rosterOffline: boolean;
  /** Check-ins and plans are known (their sources loaded). */
  checkInsKnown: boolean;
  activityKnown: boolean;
  stale: boolean;
}

const RUNNING = new Set(['active', 'trial']);

/** A check-in is this coach's when they requested it (`coachId`), or — legacy, no `coachId` — it was created after this relationship began. */
export function isCoachCheckIn(c: WeeklyCheckIn | null | undefined, coachId: string, relationshipStart: number): c is WeeklyCheckIn {
  if (!c) return false;
  if (c.coachId) return c.coachId === coachId;
  return (c.submittedAt ?? c.createdAt) >= relationshipStart;
}

/**
 * This coach's check-in state for the week that contains `todayKey`:
 *  - review — a check-in this coach requested has been submitted and waits for review (any week);
 *  - overdue — this coach's latest request is still open after its week ended;
 *  - awaiting — this coach's latest request (this week) is still open;
 *  - done — this week's check-in was reviewed;
 *  - notRequested — nothing requested by this coach for this week.
 */
export function checkInStateOf(
  latest: WeeklyCheckIn | null,
  previous: WeeklyCheckIn | null,
  coachId: string,
  relationshipStart: number,
  weekStart: string,
  todayKey: string,
): CheckInState {
  const mine = (c: WeeklyCheckIn | null) => isCoachCheckIn(c, coachId, relationshipStart);
  if ((mine(latest) && latest!.status === 'submitted') || (mine(previous) && previous!.status === 'submitted')) return 'review';
  if (mine(latest) && latest!.status === 'requested') return latest!.weekEnd < todayKey ? 'overdue' : 'awaiting';
  if (mine(latest) && latest!.status === 'reviewed' && latest!.weekStart === weekStart) return 'done';
  return 'notRequested';
}

export function clientStateOf(rel: CoachClientRelationship | undefined, now: number): { state: ClientState; daysLeft: number | null } {
  const sub = rel?.subscription;
  if (!sub) return { state: 'none', daysLeft: null };
  const eff = effectiveSubscriptionStatus(sub, now);
  if (eff === 'expired' || eff === 'ended' || eff === 'cancelled') return { state: 'expired', daysLeft: null };
  if (eff === 'frozen') return { state: 'paused', daysLeft: null };
  if (eff === 'pending') return { state: 'pending', daysLeft: null };
  if (eff === 'none') return { state: 'none', daysLeft: null };
  const left = subscriptionDaysLeft(sub, now);
  if (RUNNING.has(eff) && left <= EXPIRING_DAYS) return { state: 'expiring', daysLeft: left };
  return { state: eff === 'trial' ? 'trial' : 'active', daysLeft: left };
}

export function displayNameOf(c: DirectoryClientInput, fullName: string | null | undefined): string {
  const local = c.email?.split('@')[0];
  if (fullName && (!c.displayName || c.displayName === local)) return fullName;
  return c.displayName || c.email || '';
}

export function buildDirectory(
  sources: TodaySources,
  opts: { coachId: string; now: number; todayKey: string; weekStart: string },
): Directory {
  const { coachId, now, todayKey, weekStart } = opts;
  const queue = buildTodayQueue(sources, { coachId, now, todayKey });
  const needsBy = new Map<string, TodayItem[]>();
  for (const it of queue.items) needsBy.set(it.clientId, [...(needsBy.get(it.clientId) ?? []), it]);

  const roster = (sources.roster.data ?? []) as DirectoryClientInput[];
  const rels = new Map((sources.relationships.data ?? []).filter((r) => r.status === 'active' && r.coachId === coachId).map((r) => [r.clientId, r]));
  const summaries = new Map((sources.summaries.data ?? []).map((s) => [s.clientId, s]));
  const checkIns = new Map((sources.checkIns.data ?? []).map((c) => [c.clientId, c]));
  const relKnown = sources.relationships.data !== undefined;
  const sumKnown = sources.summaries.data !== undefined;
  const ciKnown = sources.checkIns.data !== undefined && relKnown;

  const rows: DirectoryRow[] = roster.map((c) => {
    const rel = rels.get(c.id);
    const s = summaries.get(c.id);
    const ci = checkIns.get(c.id);
    const st = relKnown ? clientStateOf(rel, now) : null;
    const last = sumKnown ? (s?.lastActivity ?? null) : undefined;
    const name = displayNameOf(c, s?.fullName);
    return {
      id: c.id,
      name,
      photoUrl: c.photoUrl,
      accountStatus: c.accountStatus ?? 'active',
      state: st ? st.state : null,
      daysLeft: st ? st.daysLeft : null,
      lastWorkout: last,
      daysSinceWorkout: last ? Math.max(0, diffDays(todayKey, last)) : null,
      workouts7d: sumKnown ? (s?.workouts7d ?? 0) : null,
      hasWorkoutPlan: sumKnown && typeof s?.hasWorkoutPlan === 'boolean' ? s.hasWorkoutPlan : null,
      hasNutritionPlan: sumKnown && typeof s?.hasNutritionPlan === 'boolean' ? s.hasNutritionPlan : null,
      checkIn: ciKnown ? checkInStateOf(ci?.latest ?? null, ci?.previous ?? null, coachId, rel?.createdAt ?? 0, weekStart, todayKey) : null,
      needs: needsBy.get(c.id) ?? [],
      addedAt: rel?.createdAt ?? null,
      search: [name, c.email ?? '', c.phone ?? ''].join(' ').toLowerCase(),
    };
  });

  return {
    rows,
    status: queue.status,
    rosterReady: sources.roster.data !== undefined,
    rosterError: sources.roster.data === undefined && sources.roster.error,
    rosterOffline: sources.roster.data === undefined && !!sources.roster.paused,
    checkInsKnown: ciKnown,
    activityKnown: sumKnown,
    stale: queue.stale,
  };
}

// ---- filtering & sorting ----------------------------------------------------

export interface DirectoryQuery {
  q?: string;
  task?: DirectoryTask | null;
  state?: ClientState | null;
  checkin?: CheckInState | null;
  plan?: PlanFilter | null;
  sort?: DirectorySort;
  dir?: 'asc' | 'desc';
}

const KIND_RANK = new Map<TodayKind, number>(['checkin', 'assessment', 'freeze', 'transfer', 'message', 'renewal', 'lapsed', 'noPlan', 'inactive'].map((k, i) => [k as TodayKind, i]));

export function matchesTask(r: DirectoryRow, task: DirectoryTask): boolean {
  if (task === 'needs') return r.needs.length > 0;
  if (task === 'checkin') return r.needs.some((n) => n.kind === 'checkin');
  return r.needs.some((n) => n.kind === task);
}

export function filterRows(rows: DirectoryRow[], q: DirectoryQuery): DirectoryRow[] {
  const term = q.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!term || r.search.includes(term)) &&
      (!q.task || matchesTask(r, q.task)) &&
      (!q.state || r.state === q.state) &&
      (!q.checkin || r.checkIn === q.checkin) &&
      (!q.plan || (q.plan === 'noWorkout' ? r.hasWorkoutPlan === false : r.hasNutritionPlan === false)),
  );
}

const byName = (a: DirectoryRow, b: DirectoryRow) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
/** Unknown values always sort last, whatever the direction. */
function nullsLast<T>(a: T | null | undefined, b: T | null | undefined, cmp: (x: T, y: T) => number): number | null {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return cmp(a as T, b as T);
}

export function sortRows(rows: DirectoryRow[], sort: DirectorySort = 'needs', dir: 'asc' | 'desc' = 'asc'): DirectoryRow[] {
  const sign = dir === 'desc' ? -1 : 1;
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort) {
      case 'name':
        return sign * byName(a, b);
      case 'needs': {
        // Who needs the coach first (by the most urgent reason, then how long it has waited), then everyone else by name.
        const an = a.needs[0];
        const bn = b.needs[0];
        if (an && !bn) return -1;
        if (!an && bn) return 1;
        if (an && bn) return (KIND_RANK.get(an.kind)! - KIND_RANK.get(bn.kind)!) || ((an.at ?? Number.MAX_SAFE_INTEGER) - (bn.at ?? Number.MAX_SAFE_INTEGER)) || byName(a, b);
        return byName(a, b);
      }
      case 'lastWorkout': {
        // asc = most recent first; never-logged after the oldest, unknown last.
        const ak = a.lastWorkout === undefined ? undefined : a.lastWorkout ?? '';
        const bk = b.lastWorkout === undefined ? undefined : b.lastWorkout ?? '';
        return nullsLast(ak, bk, (x, y) => sign * y.localeCompare(x)) || byName(a, b);
      }
      case 'daysLeft':
        return nullsLast(a.daysLeft, b.daysLeft, (x, y) => sign * (x - y)) || byName(a, b);
      case 'workouts':
        // asc = most workouts first (the old Adherence ranking).
        return nullsLast(a.workouts7d, b.workouts7d, (x, y) => sign * (y - x)) || byName(a, b);
    }
  });
  return out;
}

/** Clients the bulk "Request this week's check-in" applies to: running term, active account, nothing requested by this coach this week. */
export function bulkCheckInEligible(r: DirectoryRow): boolean {
  return r.checkIn === 'notRequested' && (r.state === 'active' || r.state === 'trial' || r.state === 'expiring') && r.accountStatus === 'active';
}

