import type { ClientSession, Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import { getFormaConfig, trialEndsAt, trialLimitOf, type LocalizedText } from './_handlers/forma.js';

export type { LocalizedText };

/**
 * Layer A — the coach's own Forma subscription (`coachPlans`, `_id` = coachId)
 * and the unified request lifecycle (`coachPlanRequests`).
 *
 * SINGLE-PRODUCT MODEL: every coach is on Forma. `plan` is the PHASE of that
 * one product — `'trial'` (Free Trial) or `'forma'` (paid monthly) — never a
 * competing tier. (Pre-refactor test data may still say `'pro'`; it is read
 * as `'forma'`.)
 *
 * CAPACITY is MATERIALIZED on this doc so the atomic slot reservation
 * (`reserveClientSlot`, coach-clients/_data.ts) keeps comparing two fields of
 * ONE document:
 *
 *   maxClients = baseMaxClients + addonClientCapacity + manualCapacityAdjustment
 *
 * `baseMaxClients` comes from the Trial config or the confirmed subscription
 * snapshot; `addonClientCapacity` is the sum of ACTIVE capacity entitlements;
 * `manualCapacityAdjustment` is an explicit, audited Super-Admin bonus/penalty.
 * Every write that changes any of the three recomputes `maxClients` in the
 * same transaction (`recomputeCapacity`, ./_capacity.ts). `activeClientCount`
 * is never touched by a recompute.
 *
 * A coach's real entitlements come ONLY from this doc + active entitlements —
 * an unconfirmed request never changes them.
 */

export type CoachPlanPhase = 'trial' | 'forma';
export type CoachPlanStatus = 'active' | 'expired' | 'suspended';

/** One entry in a plan's change history (newest pushed last). */
export interface PlanHistoryEntry {
  at: number;
  action: string;
  detail?: string;
  by?: string;
}

/** What the coach is currently paying for (copied from the confirmed request — never from live config). */
export interface SubscriptionTermSnapshot {
  priceMonthly: number;
  currency: string;
  billingInterval: 'month';
  termDays: number;
  maxClients: number;
  requestId: string;
  /** When this paid term starts (= previous end for an early renewal). */
  termStartsAt?: number;
  confirmedAt?: number;
}

export interface CoachPlanDoc {
  _id: string; // == coachId
  /** `'trial' | 'forma'` (legacy test rows may carry an old tier key; read via `phaseOf`). */
  plan: string;
  status: CoachPlanStatus;
  /** EFFECTIVE limit — materialized; what the atomic slot reservation compares against. */
  maxClients: number;
  /** Included capacity of the Trial / confirmed subscription. */
  baseMaxClients?: number;
  /** Sum of active capacity entitlements. */
  addonClientCapacity?: number;
  /** Explicit Super-Admin adjustment (may be negative), with its reason. */
  manualCapacityAdjustment?: number;
  manualCapacityNote?: { reason: string; by: string; at: number };
  /** @deprecated pre-refactor per-coach cap flag; migrated into `manualCapacityAdjustment`. */
  maxClientsOverride?: boolean;
  startedAt: number;
  endsAt: number | null;
  /** The confirmed paid term this coach is on (absent during Trial). */
  subscription?: SubscriptionTermSnapshot;
  trialNotified?: { d7?: boolean; d5?: boolean; d3?: boolean; d1?: boolean };
  activeClientCount?: number;
  history?: PlanHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

export function phaseOf(plan: Pick<CoachPlanDoc, 'plan'>): CoachPlanPhase {
  return plan.plan === 'trial' ? 'trial' : 'forma';
}

/** Effective state with the end date folded in — the ONE server-side definition. */
export function planStateOf(plan: Pick<CoachPlanDoc, 'plan' | 'status' | 'endsAt'> | null, now = Date.now()): 'trial' | 'active' | 'expired' | 'suspended' | 'none' {
  if (!plan) return 'none';
  if (plan.status === 'suspended') return 'suspended';
  if (plan.endsAt != null && now >= plan.endsAt) return 'expired';
  if (plan.status !== 'active') return 'expired';
  return phaseOf(plan) === 'trial' ? 'trial' : 'active';
}

/** The exact shape returned to the frontend (`_id` → `coachId`, plus derived fields). */
export type PublicCoachPlan = Omit<CoachPlanDoc, '_id'> & {
  coachId: string;
  phase: CoachPlanPhase;
  state: ReturnType<typeof planStateOf>;
  baseMaxClients: number;
  addonClientCapacity: number;
  manualCapacityAdjustment: number;
};

export function toPublicCoachPlan(doc: CoachPlanDoc): PublicCoachPlan {
  const { _id, ...rest } = doc;
  return {
    coachId: _id,
    ...rest,
    phase: phaseOf(doc),
    state: planStateOf(doc),
    baseMaxClients: doc.baseMaxClients ?? doc.maxClients,
    addonClientCapacity: doc.addonClientCapacity ?? 0,
    manualCapacityAdjustment: doc.manualCapacityAdjustment ?? 0,
  };
}

export async function coachPlansCol(): Promise<Collection<CoachPlanDoc>> {
  return (await getDb()).collection<CoachPlanDoc>('coachPlans');
}

// ---- Unified request lifecycle -------------------------------------------

/**
 * `subscription`    — Trial / expired coach asks to start the paid Forma term
 * `renewal`         — an active paid coach asks to renew
 * `trial_expired`   — raised automatically by the daily cron when a Trial ends
 *                     (a subscription request the coach didn't have to file)
 * `capacity_addon`  — a capacity package (snapshot in `capacitySnapshot`)
 * Legacy (pre-refactor test rows, read-only): new_signup, trial_upgrade, plan_change.
 */
export type PlanRequestType = 'subscription' | 'renewal' | 'trial_expired' | 'capacity_addon';
export type LegacyPlanRequestType = 'new_signup' | 'trial_upgrade' | 'plan_change';
export type PlanRequestStatus = 'awaiting' | 'processing' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';

export interface PlanSnapshot {
  tierKey: string; // always 'forma' for new requests
  label: LocalizedText;
  priceMonthly: number;
  currency: string;
  billingInterval?: 'month';
  /** Base client limit the subscription grants. */
  maxClients: number;
  termDays: number;
}

export interface CapacitySnapshot {
  packageId: string;
  name: LocalizedText;
  additionalClients: number;
  price: number;
  currency: string;
  billingInterval: 'month' | 'one_time';
  /** For 'month': how many months one purchase covers. */
  durationMonths: number | null;
}

export interface CoachPlanRequestDoc {
  _id: string;
  coachId: string;
  type: PlanRequestType | LegacyPlanRequestType;
  /**
   * What this request is FOR — the uniqueness scope for "one actionable
   * request": `'subscription'` (subscription / renewal / trial_expired) or
   * `'capacity:<packageId>'`. A coach may therefore have one open
   * subscription request AND separate open add-on requests at the same time.
   * Absent on legacy rows.
   */
  requestKey?: string;
  requestedTierKey?: string;
  /** Subscription/renewal snapshot (absent for capacity add-ons). */
  planSnapshot?: PlanSnapshot;
  /** Capacity add-on snapshot. */
  capacitySnapshot?: CapacitySnapshot;
  status: PlanRequestStatus;
  requestedAt: number;
  confirmationDeadline: number;
  confirmedAt?: number;
  confirmedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  cancelledAt?: number;
  expiredAt?: number;
  adminNote?: string;
  reason?: string;
}

export type PublicCoachPlanRequest = Omit<CoachPlanRequestDoc, '_id'> & { id: string };
export function toPublicPlanRequest(doc: CoachPlanRequestDoc): PublicCoachPlanRequest {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/** Human label for emails / audit (English). */
export function requestLabelEn(r: Pick<CoachPlanRequestDoc, 'planSnapshot' | 'capacitySnapshot'>): string {
  if (r.capacitySnapshot) return `${r.capacitySnapshot.name.en} (+${r.capacitySnapshot.additionalClients} clients)`;
  return r.planSnapshot?.label.en ?? 'Forma';
}

const LEGACY_REQUEST_INDEX = 'uniq_coachId_actionable';
let legacyIndexDropped = false;

/**
 * One actionable request per (coach, requestKey), enforced by the DATABASE —
 * a partial unique index — so two concurrent submits for the same thing can
 * never both land. Replaces the pre-refactor `uniq_coachId_actionable`
 * ({coachId} only), which would wrongly forbid a coach from requesting an
 * add-on while a subscription request is open; that index is dropped once
 * per process if present (idempotent; production is handled by
 * scripts/mongo-init-indexes.mjs). Self-ensured on every call so a dropped
 * test database is never left unenforced.
 */
export async function ensurePlanRequestIndexes(): Promise<void> {
  const col = (await getDb()).collection<CoachPlanRequestDoc>('coachPlanRequests');
  if (!legacyIndexDropped) {
    await col.dropIndex(LEGACY_REQUEST_INDEX).catch(() => undefined);
    legacyIndexDropped = true;
  }
  await col.createIndex(
    { coachId: 1, requestKey: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['awaiting', 'processing'] } }, name: 'uniq_coachId_requestKey_actionable' },
  );
  await col.createIndex({ status: 1, confirmationDeadline: 1 }, { name: 'status_confirmationDeadline' });
  await col.createIndex({ coachId: 1, requestedAt: -1 }, { name: 'coachId_requestedAt' });
}

export async function coachPlanRequestsCol(): Promise<Collection<CoachPlanRequestDoc>> {
  const db = await getDb();
  await ensurePlanRequestIndexes();
  return db.collection<CoachPlanRequestDoc>('coachPlanRequests');
}

/** `awaiting` past its own deadline is expired even before a write catches up — the ONE shared rule (read paths + cron). */
export function isRequestExpired(req: Pick<CoachPlanRequestDoc, 'status' | 'confirmationDeadline'>, now = Date.now()): boolean {
  return req.status === 'awaiting' && req.confirmationDeadline <= now;
}

export const DAY_MS = 86_400_000;

/**
 * Idempotent: never resets an existing plan. A new coach starts the Forma
 * Free Trial using the CURRENT Forma configuration (duration + trial client
 * limit). Accepts a Mongo `session` so `auth.signup` keeps user + trial in
 * one transaction.
 */
export async function ensureTrialPlan(coachId: string, session?: ClientSession): Promise<CoachPlanDoc> {
  const plans = await coachPlansCol();
  const existing = await plans.findOne({ _id: coachId }, { session });
  if (existing) return existing;

  const cfg = await getFormaConfig(session);
  const now = Date.now();
  const limit = trialLimitOf(cfg);
  // Trial switched off by the Super Admin: the coach still gets an account and
  // a plan doc (so they can sign in, open My Plan and request the
  // subscription), but it starts already-ended — no free access.
  const doc: CoachPlanDoc = {
    _id: coachId,
    plan: 'trial',
    status: cfg.trialEnabled ? 'active' : 'expired',
    maxClients: limit,
    baseMaxClients: limit,
    addonClientCapacity: 0,
    manualCapacityAdjustment: 0,
    startedAt: now,
    endsAt: cfg.trialEnabled ? trialEndsAt(cfg, now) : now,
    trialNotified: {},
    activeClientCount: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  await plans.updateOne({ _id: coachId }, { $setOnInsert: doc }, { upsert: true, session });
  return (await plans.findOne({ _id: coachId }, { session }))!;
}
