import type { ClientSession, Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import { getTier, COACH_PLAN_TIERS, type LocalizedText } from './_handlers/tiers-data.js';

/**
 * Backend-local mirror of `src/types/index.ts`'s `CoachPlan` /
 * `CoachPlanRequest`, ported to top-level Mongo collections:
 *  - `coachPlans` — `_id` = the coach's user id (was `coachPlans/{coachId}`).
 *  - `coachPlanRequests` — one row per request (replaces the old singleton
 *    `coachPlanChangeRequests/{coachId}` doc — a coach's paid-plan intent now
 *    has real history: new_signup, trial_upgrade, plan_change, renewal).
 *
 * Layer A only — the coach's own subscription to Forma. Distinct from the
 * per-client Subscription (Layer B) which lives elsewhere.
 *
 * PRODUCT MODEL (see the approved plan): a coach's real entitlements ALWAYS
 * come from `CoachPlanDoc` — `status` is deliberately still just
 * `active | expired | suspended`, with NO "provisional"/"payment_pending"
 * value. A pending paid-plan selection lives ENTIRELY in `CoachPlanRequestDoc`
 * and never gates capacity/access on its own; `CoachPlanDoc` is only ever
 * touched by `confirm` (replaces it with the request's snapshot) — `reject`/
 * `cancel`/`expire` never touch it at all.
 */

export type CoachPlanTierKey = string;
export type CoachPlanStatus = 'active' | 'expired' | 'suspended';

/** One entry in a plan's change history (newest pushed last). Mirrors `PlanHistoryEntry`. */
export interface PlanHistoryEntry {
  at: number;
  action: string; // 'tier' | 'maxClients' | 'status' | 'endsAt' | 'request.confirmed' | 'request.rejected'
  detail?: string;
  by?: string; // actor id
}

export interface CoachPlanDoc {
  _id: string; // == coachId
  plan: CoachPlanTierKey;
  status: CoachPlanStatus;
  maxClients: number; // trial = TRIAL_MAX_CLIENTS
  /**
   * false/absent (the default): `maxClients` is DERIVED from `plan`'s tier
   * config — every time a super-admin edits that tier's `maxClients` in
   * `coachPlanTiers.save`, this coach's cap is swept along with it. true: an
   * admin explicitly set this coach's own cap (`coachPlans.adminUpdate` with
   * `maxClients` but no `tier`) — that override survives future tier-wide
   * edits and is never silently overwritten by them.
   */
  maxClientsOverride?: boolean;
  startedAt: number;
  endsAt: number | null;
  /** Expiry-reminder bookkeeping (trial OR paid term) — each flag fires its reminder once. */
  trialNotified?: { d7?: boolean; d5?: boolean; d3?: boolean; d1?: boolean };
  /** Maintained client-usage counter. */
  activeClientCount?: number;
  history?: PlanHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

/** The exact shape returned to the frontend — matches `CoachPlan` field-for-field. */
export type PublicCoachPlan = Omit<CoachPlanDoc, '_id'> & { coachId: string };

export function toPublicCoachPlan(doc: CoachPlanDoc): PublicCoachPlan {
  const { _id, ...rest } = doc;
  return { coachId: _id, ...rest };
}

export async function coachPlansCol(): Promise<Collection<CoachPlanDoc>> {
  return (await getDb()).collection<CoachPlanDoc>('coachPlans');
}

// ---- Unified plan-request lifecycle (replaces coachPlanChangeRequests) -----

export type PlanRequestType = 'new_signup' | 'trial_upgrade' | 'plan_change' | 'renewal' | 'trial_expired';
export type PlanRequestStatus = 'awaiting' | 'processing' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';

export interface PlanSnapshot {
  tierKey: string;
  label: LocalizedText;
  priceMonthly: number;
  currency: string;
  maxClients: number;
  termDays: number;
}

export interface CoachPlanRequestDoc {
  _id: string; // crypto.randomUUID()
  coachId: string;
  type: PlanRequestType;
  requestedTierKey: string;
  planSnapshot: PlanSnapshot; // immutable once created — confirm always applies THIS, never the live tier
  status: PlanRequestStatus;
  requestedAt: number; // server time only
  confirmationDeadline: number; // requestedAt + 24h
  confirmedAt?: number;
  confirmedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  cancelledAt?: number;
  expiredAt?: number;
  adminNote?: string;
  reason?: string; // carries the old plan_change free-text reason field
}

/** The exact shape returned to the frontend — matches `CoachPlanRequest` field-for-field (`_id` -> `id`). */
export type PublicCoachPlanRequest = Omit<CoachPlanRequestDoc, '_id'> & { id: string };
export function toPublicPlanRequest(doc: CoachPlanRequestDoc): PublicCoachPlanRequest {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * One actionable ('awaiting'/'processing') request per coach, enforced at the
 * DATABASE level (not just application logic) — a partial unique index so
 * two concurrent submit/change-plan calls can never both land in an
 * actionable state for the same coach. Idempotent (`createIndex` is a no-op
 * if it already exists with the same spec) — self-ensured on every call to
 * `coachPlanRequestsCol()` below, same pattern as `api/coach-assets/_lib/db.ts`
 * (deliberately not memoized beyond Mongo's own idempotency, so a dropped/
 * recreated test database is never left with the guarantee unenforced).
 */
export async function ensurePlanRequestIndexes(): Promise<void> {
  const col = (await getDb()).collection<CoachPlanRequestDoc>('coachPlanRequests');
  await col.createIndex(
    { coachId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['awaiting', 'processing'] } }, name: 'uniq_coachId_actionable' },
  );
  await col.createIndex({ status: 1, confirmationDeadline: 1 }, { name: 'status_confirmationDeadline' });
}

export async function coachPlanRequestsCol(): Promise<Collection<CoachPlanRequestDoc>> {
  const db = await getDb();
  await ensurePlanRequestIndexes();
  return db.collection<CoachPlanRequestDoc>('coachPlanRequests');
}

/** `req.status === 'awaiting'` past its own deadline is expired even if no write has caught up yet — the ONE shared expiry rule, used by both the defensive read-path and the cron job. Never touches `CoachPlanDoc`. */
export function isRequestExpired(req: Pick<CoachPlanRequestDoc, 'status' | 'confirmationDeadline'>, now = Date.now()): boolean {
  return req.status === 'awaiting' && req.confirmationDeadline <= now;
}

// ---- Trial assignment — the one source of truth for every coach-creation path ----

export const TRIAL_MAX_CLIENTS = 2;
export const TRIAL_DURATION_DAYS = 15;
/** Default renewal cycle for paid tiers (renewals are manual — no payment gateway). */
export const PAID_TERM_DAYS = 30;
export const DAY_MS = 86_400_000;
/**
 * Grace window after a trial's `endsAt` passes before the account itself gets
 * hard-blocked (`accountStatus: 'pending'`) if payment still isn't confirmed
 * — see `api/cron/enforce-trial-expiry.ts`. The coach keeps working normally
 * during this window; only after it elapses unconfirmed does the WHOLE
 * account (not just plan-gated writes) get blocked.
 */
export const TRIAL_GRACE_DAYS = 3;

/**
 * Idempotent: never resets/downgrades an existing plan (any tier). Uses the
 * live default-signup tier's configured `trialDurationDays`/`maxClients` —
 * the `TRIAL_*` constants above are only the bootstrap/seed fallback, not a
 * second source of truth (see `tiers-data.ts`'s seeded `trial` tier).
 * Accepts an optional Mongo `session` so callers running inside a
 * transaction (e.g. `auth.signup`) thread it through — a write made without
 * the session would commit immediately, outside the transaction, breaking
 * atomicity silently.
 */
export async function ensureTrialPlan(coachId: string, session?: ClientSession): Promise<CoachPlanDoc> {
  const plans = await coachPlansCol();
  const existing = await plans.findOne({ _id: coachId }, { session });
  if (existing) return existing;

  const trialTier = await getTier('trial');
  const maxClients = trialTier?.maxClients ?? COACH_PLAN_TIERS.trial?.maxClients ?? TRIAL_MAX_CLIENTS;
  const trialDurationDays = trialTier?.trialDurationDays ?? TRIAL_DURATION_DAYS;
  const now = Date.now();
  const doc: CoachPlanDoc = {
    _id: coachId,
    plan: 'trial',
    status: 'active',
    maxClients,
    maxClientsOverride: false,
    startedAt: now,
    endsAt: now + trialDurationDays * DAY_MS,
    trialNotified: {},
    activeClientCount: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  // Atomic upsert (not a plain insertOne) so a retry/race against another
  // caller can never duplicate-key or clobber a plan created a moment ago.
  await plans.updateOne({ _id: coachId }, { $setOnInsert: doc }, { upsert: true, session });
  return (await plans.findOne({ _id: coachId }, { session }))!;
}
