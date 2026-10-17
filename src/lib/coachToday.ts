import type { CoachClientRelationship, WeeklyCheckIn } from '@/types';
import { effectiveSubscriptionStatus } from './subscription';
import { diffDays } from './utils';

/**
 * Coach Today queue (B3.2 / blueprint §6.1, owner brief 2026-10-17).
 *
 * One pure function turns the coach's already-authorized data into a ranked
 * list of things that need them. Rules (also in
 * `docs/product-audit/B3_TODAY_QUEUE.md`):
 *  - every item comes from a stored fact — no score, no prediction, nothing
 *    labelled "needs attention" without its reason;
 *  - each kind lists the sources it needs; while one is missing (loading /
 *    failed) that kind is NOT "empty", so the screen can never say "all
 *    caught up" over a failure (`complete` is false);
 *  - one item per client per kind (no duplicates);
 *  - every item carries the exact route that resolves it.
 *
 * Inputs are structural so the screen can pass the service types directly.
 */

export const DAY_MS = 86_400_000;
/** Renewal due: a running term (active / trial) ends within this window. */
export const RENEWAL_WINDOW_MS = 7 * DAY_MS;
/** Lapsed: a term that ran out on its own within this window and was not renewed. */
export const LAPSED_WINDOW_MS = 30 * DAY_MS;
/** "No workout in N days" (owner O-20): N = 7, clients onboarded ≥ N days. */
export const INACTIVE_DAYS = 7;
/** Coming up (informational, never counted): terms ending after the renewal window but within 30 days. */
export const COMING_UP_MS = 30 * DAY_MS;

export type TodayKind = 'checkin' | 'assessment' | 'freeze' | 'transfer' | 'message' | 'renewal' | 'lapsed' | 'noPlan' | 'inactive';
export type TodaySection = 'reviews' | 'requests' | 'messages' | 'subscriptions' | 'coaching';

/** Kinds in queue order (blueprint §6.1 priorities 1 → 4). */
export const TODAY_KINDS: readonly TodayKind[] = ['checkin', 'assessment', 'freeze', 'transfer', 'message', 'renewal', 'lapsed', 'noPlan', 'inactive'];
export const SECTION_OF: Record<TodayKind, TodaySection> = {
  checkin: 'reviews',
  assessment: 'reviews',
  freeze: 'requests',
  transfer: 'requests',
  message: 'messages',
  renewal: 'subscriptions',
  lapsed: 'subscriptions',
  noPlan: 'coaching',
  inactive: 'coaching',
};
export const TODAY_SECTIONS: readonly TodaySection[] = ['reviews', 'requests', 'messages', 'subscriptions', 'coaching'];

// ---- inputs ---------------------------------------------------------------

/** A source as the screen has it: data (possibly stale) and whether the last fetch failed. */
export interface SourceState<T> {
  data: T | undefined;
  error: boolean;
}

export interface TodayClient {
  id: string;
  accountStatus?: string;
}

export interface TodaySummary {
  clientId: string;
  lastActivity: string | null;
  /** Finished workouts in the last 7 days (used by Clients, B3.3). */
  workouts7d?: number;
  /** The assessment's full name (a better display name than an email prefix). */
  fullName?: string | null;
  assessment: 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'updated_after_review';
  hasWorkoutPlan?: boolean;
  hasNutritionPlan?: boolean;
}

export interface TodayCheckIns {
  clientId: string;
  latest: WeeklyCheckIn | null;
  previous: WeeklyCheckIn | null;
}

export interface TodayThread {
  clientId: string;
  unreadForCoach: number;
  last: { body?: string; createdAt: number; fromRole?: string; deletedAt?: number | null; attachment?: unknown } | null;
}

/** A pending freeze request from the canonical request documents (B32-P1), server-scoped to this coach's current relationships. */
export interface TodayFreezeRequest {
  clientId: string;
  from: number | null;
  until: number | null;
  reason: string;
  requestedAt: number;
}

export interface TodayTransfer {
  id: string;
  clientId: string;
  fromCoachId: string;
  toCoachId: string;
  reason: string;
  status: string;
  requestedAt: number;
}

export interface TodaySources {
  /** The active roster (`coachClients.listMyClientUsers`) — every item must belong to it. */
  roster: SourceState<TodayClient[]>;
  relationships: SourceState<CoachClientRelationship[]>;
  summaries: SourceState<TodaySummary[]>;
  checkIns: SourceState<TodayCheckIns[]>;
  threads: SourceState<TodayThread[]>;
  transfers: SourceState<TodayTransfer[]>;
  /** Pending freeze requests (`subscriptionRequest.pendingForCoach`, every page) — not the notification feed. */
  freezeRequests: SourceState<TodayFreezeRequest[]>;
}

type SourceKey = keyof TodaySources;
/** What each kind needs before it may be shown — or declared empty. */
export const KIND_SOURCES: Record<TodayKind, readonly SourceKey[]> = {
  checkin: ['roster', 'relationships', 'checkIns'],
  assessment: ['roster', 'summaries'],
  freeze: ['roster', 'freezeRequests'],
  transfer: ['roster', 'transfers'],
  message: ['roster', 'threads'],
  renewal: ['roster', 'relationships'],
  lapsed: ['roster', 'relationships'],
  noPlan: ['roster', 'relationships', 'summaries'],
  inactive: ['roster', 'relationships', 'summaries'],
};

// ---- outputs --------------------------------------------------------------

export interface TodayItem {
  /** Stable React key and selection id. */
  key: string;
  kind: TodayKind;
  section: TodaySection;
  clientId: string;
  /** Exact route that resolves the item (the screen may also offer an in-place action). */
  to: string;
  /** The timestamp the reason refers to (submitted, requested, last message, term end, client added). */
  at?: number;
  /** Check-in week, or the last workout's day key. */
  dayKey?: string | null;
  /** How many: submitted check-ins, unread messages. */
  count?: number;
  /** Days until (renewal) or since (lapsed, inactive) — whole days, never negative. */
  days?: number;
  /** The client's own words where the source has them (message preview, freeze / transfer reason). */
  text?: string;
  /** Freeze: the dates the client asked for (either may be open). */
  range?: { from: number | null; until: number | null };
  /** Assessment: updated after an earlier review. Renewal: a trial term. */
  flag?: 'updated' | 'trial';
  /** Check-in: the latest submitted check-in, reviewable in place (absent when only an older week waits). */
  checkIn?: WeeklyCheckIn;
  previousCheckIn?: WeeklyCheckIn | null;
  transfer?: TodayTransfer;
}

export type KindStatus = 'ready' | 'loading' | 'error';

export interface ComingUpItem {
  clientId: string;
  endAt: number;
  days: number;
  trial: boolean;
  to: string;
}

export interface TodayQueue {
  items: TodayItem[];
  counts: Record<TodayKind, number>;
  status: Record<TodayKind, KindStatus>;
  /** Every kind loaded: an empty queue may honestly say "nothing needs you". */
  complete: boolean;
  /** Some data on screen comes from a fetch that has since failed. */
  stale: boolean;
  rosterSize: number | null;
  comingUp: ComingUpItem[];
}

// ---- rules ----------------------------------------------------------------

const ws = (clientId: string) => `/coach/client/${encodeURIComponent(clientId)}`;
const thread = (clientId: string) => `/coach/messages/${encodeURIComponent(clientId)}`;
const RUNNING = new Set(['active', 'trial']);

function sourceStatus(s: SourceState<unknown>): KindStatus {
  if (s.data !== undefined) return 'ready';
  return s.error ? 'error' : 'loading';
}

function kindStatus(kind: TodayKind, sources: TodaySources): KindStatus {
  const states = KIND_SOURCES[kind].map((k) => sourceStatus(sources[k]));
  if (states.includes('error')) return 'error';
  if (states.includes('loading')) return 'loading';
  return 'ready';
}

/**
 * A submitted check-in is this coach's to review when it was requested by
 * them (`coachId`), or — for a legacy document without one — submitted after
 * this relationship began. A check-in another coach requested before a
 * transfer is not queued (the client's history still shows it).
 */
export function isMyCheckIn(c: WeeklyCheckIn | null | undefined, coachId: string, relationshipStart: number): c is WeeklyCheckIn {
  if (!c || c.status !== 'submitted') return false;
  if (c.coachId) return c.coachId === coachId;
  return (c.submittedAt ?? c.createdAt) >= relationshipStart;
}

export function buildTodayQueue(sources: TodaySources, opts: { coachId: string; now: number; todayKey: string }): TodayQueue {
  const { coachId, now, todayKey } = opts;
  const status = Object.fromEntries(TODAY_KINDS.map((k) => [k, kindStatus(k, sources)])) as Record<TodayKind, KindStatus>;
  const ready = (k: TodayKind) => status[k] === 'ready';

  const roster = new Map((sources.roster.data ?? []).map((c) => [c.id, c]));
  const activeRels = new Map(
    (sources.relationships.data ?? []).filter((r) => r.status === 'active' && r.coachId === coachId && roster.has(r.clientId)).map((r) => [r.clientId, r]),
  );
  const summaries = new Map((sources.summaries.data ?? []).filter((s) => roster.has(s.clientId)).map((s) => [s.clientId, s]));
  const items: TodayItem[] = [];
  const push = (it: Omit<TodayItem, 'key' | 'section'>) => items.push({ ...it, key: `${it.kind}:${it.clientId}`, section: SECTION_OF[it.kind] });

  // 1 · Check-ins to review (oldest waiting first).
  if (ready('checkin')) {
    for (const row of sources.checkIns.data ?? []) {
      const rel = activeRels.get(row.clientId);
      if (!rel) continue;
      const mine = [row.latest, row.previous].filter((c): c is WeeklyCheckIn => isMyCheckIn(c, coachId, rel.createdAt));
      if (mine.length === 0) continue;
      const oldest = mine.reduce((a, b) => ((a.submittedAt ?? a.createdAt) <= (b.submittedAt ?? b.createdAt) ? a : b));
      const reviewable = isMyCheckIn(row.latest, coachId, rel.createdAt) ? row.latest : undefined;
      push({
        kind: 'checkin',
        clientId: row.clientId,
        to: `${ws(row.clientId)}/checkins`,
        at: oldest.submittedAt ?? oldest.createdAt,
        dayKey: oldest.weekStart,
        count: mine.length,
        ...(reviewable ? { checkIn: reviewable, previousCheckIn: row.previous && row.previous !== reviewable ? row.previous : null } : {}),
      });
    }
  }

  // 2 · Assessments submitted, or updated after an earlier review.
  if (ready('assessment')) {
    for (const s of summaries.values()) {
      if (s.assessment !== 'submitted' && s.assessment !== 'updated_after_review') continue;
      push({ kind: 'assessment', clientId: s.clientId, to: `${ws(s.clientId)}/assessment`, ...(s.assessment === 'updated_after_review' ? { flag: 'updated' as const } : {}) });
    }
  }

  // 3 · Freeze requests: the canonical pending requests (B32-P1) — one document per client, newest kept defensively.
  if (ready('freeze')) {
    const byClient = new Map<string, TodayFreezeRequest>();
    for (const r of sources.freezeRequests.data ?? []) {
      if (!roster.has(r.clientId)) continue;
      const prev = byClient.get(r.clientId);
      if (!prev || r.requestedAt > prev.requestedAt) byClient.set(r.clientId, r);
    }
    for (const r of byClient.values()) {
      push({ kind: 'freeze', clientId: r.clientId, to: `${ws(r.clientId)}/subscription`, at: r.requestedAt, range: { from: r.from, until: r.until }, ...(r.reason.trim() ? { text: r.reason.trim() } : {}) });
    }
  }

  // 4 · Transfer requests: another coach asks to take over one of MY clients.
  if (ready('transfer')) {
    for (const t of sources.transfers.data ?? []) {
      if (t.status !== 'pending' || t.fromCoachId !== coachId || !roster.has(t.clientId)) continue;
      push({ kind: 'transfer', clientId: t.clientId, to: '/coach/clients', at: t.requestedAt, transfer: t, ...(t.reason ? { text: t.reason } : {}) });
    }
  }

  // 5 · Unread conversations (this coach's own conversation — server-scoped, R-4).
  if (ready('message')) {
    for (const th of sources.threads.data ?? []) {
      if (th.unreadForCoach <= 0 || !roster.has(th.clientId)) continue;
      const last = th.last;
      const preview = last && last.fromRole === 'client' && !last.deletedAt && !last.attachment && last.body?.trim() ? last.body.trim() : undefined;
      push({ kind: 'message', clientId: th.clientId, to: thread(th.clientId), count: th.unreadForCoach, ...(last ? { at: last.createdAt } : {}), ...(preview ? { text: preview } : {}) });
    }
  }

  // 6 · Subscriptions: renewal due ≤ 7 days, lapsed ≤ 30 days; coming up (not counted).
  const comingUp: ComingUpItem[] = [];
  if (ready('renewal')) {
    for (const rel of activeRels.values()) {
      const sub = rel.subscription;
      if (!sub) continue;
      const eff = effectiveSubscriptionStatus(sub, now);
      const left = sub.endAt - now;
      const to = `${ws(rel.clientId)}/subscription`;
      if (RUNNING.has(eff) && left > 0 && left <= RENEWAL_WINDOW_MS) {
        push({ kind: 'renewal', clientId: rel.clientId, to, at: sub.endAt, days: Math.ceil(left / DAY_MS), ...(eff === 'trial' ? { flag: 'trial' as const } : {}) });
      } else if (RUNNING.has(eff) && left > RENEWAL_WINDOW_MS && left <= COMING_UP_MS) {
        comingUp.push({ clientId: rel.clientId, endAt: sub.endAt, days: Math.ceil(left / DAY_MS), trial: eff === 'trial', to });
      } else if (eff === 'expired' && sub.status !== 'cancelled' && sub.status !== 'ended' && now - sub.endAt <= LAPSED_WINDOW_MS) {
        // Only a term that ran out on its own: a cancelled / ended term was the coach's explicit decision.
        push({ kind: 'lapsed', clientId: rel.clientId, to, at: sub.endAt, days: Math.max(0, Math.floor((now - sub.endAt) / DAY_MS)) });
      }
    }
  }

  // 7 · Coaching: needs a plan / no workout in 7 days — running term, active account, never guessed.
  if (ready('noPlan')) {
    for (const rel of activeRels.values()) {
      const s = summaries.get(rel.clientId);
      const client = roster.get(rel.clientId);
      if (!s || !rel.subscription || (client?.accountStatus && client.accountStatus !== 'active')) continue;
      if (!RUNNING.has(effectiveSubscriptionStatus(rel.subscription, now))) continue;
      if (typeof s.hasWorkoutPlan !== 'boolean' || typeof s.hasNutritionPlan !== 'boolean') continue; // older server: omit, never guess

      if (!s.hasWorkoutPlan && !s.hasNutritionPlan) {
        // Sequenced after the assessment: before it is reviewed the coach is
        // waiting on the client, and a submitted one is already a review item.
        if (s.assessment === 'reviewed') push({ kind: 'noPlan', clientId: rel.clientId, to: `${ws(rel.clientId)}/workout`, at: rel.createdAt });
        continue;
      }
      if (s.hasWorkoutPlan && rel.createdAt <= now - INACTIVE_DAYS * DAY_MS) {
        const since = s.lastActivity ? diffDays(todayKey, s.lastActivity) : null;
        if (since === null || since >= INACTIVE_DAYS) {
          push({ kind: 'inactive', clientId: rel.clientId, to: thread(rel.clientId), dayKey: s.lastActivity, ...(since !== null ? { days: since } : {}), at: rel.createdAt });
        }
      }
    }
  }

  // Order: kind priority, then the rule each kind reads best in.
  const rank = new Map(TODAY_KINDS.map((k, i) => [k, i]));
  const within = (a: TodayItem, b: TodayItem): number => {
    switch (a.kind) {
      case 'message':
      case 'lapsed':
        return (b.at ?? 0) - (a.at ?? 0); // newest first
      case 'inactive':
        // Never logged first, then the longest gap.
        if ((a.dayKey ?? '') !== (b.dayKey ?? '')) return (a.dayKey ?? '').localeCompare(b.dayKey ?? '');
        return a.clientId.localeCompare(b.clientId);
      case 'assessment':
        return a.clientId.localeCompare(b.clientId);
      default:
        return (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER); // longest waiting / soonest first
    }
  };
  items.sort((a, b) => rank.get(a.kind)! - rank.get(b.kind)! || within(a, b));
  comingUp.sort((a, b) => a.endAt - b.endAt);

  const counts = Object.fromEntries(TODAY_KINDS.map((k) => [k, 0])) as Record<TodayKind, number>;
  for (const it of items) counts[it.kind] += 1;
  const allSources = Object.values(sources) as SourceState<unknown>[];

  return {
    items,
    counts,
    status,
    complete: TODAY_KINDS.every(ready),
    stale: allSources.some((s) => s.data !== undefined && s.error),
    rosterSize: sources.roster.data ? sources.roster.data.length : null,
    comingUp,
  };
}

/** `?focus=` values: a kind, or the legacy page names that now redirect here. */
export function parseFocus(raw: string | null): TodayKind | null {
  if (!raw) return null;
  if (raw === 'checkins') return 'checkin';
  if (raw === 'assessments') return 'assessment';
  return (TODAY_KINDS as readonly string[]).includes(raw) ? (raw as TodayKind) : null;
}
