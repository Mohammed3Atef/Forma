import crypto from 'node:crypto';
import type { ClientSession, Collection } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { getDb } from '../_lib/mongodb.js';
import { coachPlansCol, type CapacitySnapshot, type CoachPlanDoc, type PlanHistoryEntry } from './_data.js';
import type { LocalizedText } from './_handlers/forma.js';

/**
 * CLIENT-CAPACITY ADD-ONS — sold on top of the one Forma subscription, never
 * as a competing plan, and NEVER exposed on any public/anonymous surface.
 *
 *   coachCapacityPackages      Super-Admin-defined offers (+N clients for a price)
 *   coachCapacityEntitlements  what a coach actually holds (immutable snapshot)
 *
 * Effective capacity is materialized on `CoachPlanDoc.maxClients` by
 * `recomputeCapacity` — called inside the same transaction as every write that
 * changes base / add-ons / manual adjustment — so the atomic slot reservation
 * keeps working on a single document.
 *
 * POLICY (initial): a coach may hold several DIFFERENT active packages, but
 * only ONE active entitlement per package (DB-enforced partial unique index).
 * Requesting a package you already hold = renewal of that entitlement.
 * Admin "custom" grants have no package id and may stack.
 */

export interface CapacityPackageDoc {
  _id: string;
  name: LocalizedText;
  description?: LocalizedText;
  badge?: LocalizedText;
  additionalClients: number;
  price: number;
  currency: string;
  billingInterval: 'month' | 'one_time';
  /** For 'month': months per purchase (default 1). Ignored for one_time. */
  durationMonths?: number;
  active: boolean;
  /** Shown to coaches on My Plan. false = admin-grant-only package. */
  coachVisible: boolean;
  promotional?: boolean;
  sortOrder: number;
  validFrom?: number | null;
  validUntil?: number | null;
  /** Private offer: only these coaches see it. Empty / absent = all coaches. */
  targetCoachIds?: string[];
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type EntitlementStatus = 'active' | 'expired' | 'cancelled';

export interface CapacityEntitlementDoc {
  _id: string;
  coachId: string;
  /** null for a Super-Admin custom grant. */
  sourcePackageId: string | null;
  source: 'request' | 'admin_package' | 'admin_custom';
  snapshot: CapacitySnapshot;
  status: EntitlementStatus;
  startsAt: number;
  /** null = permanent (one_time). */
  endsAt: number | null;
  requestId: string | null;
  confirmedBy: string;
  note?: string;
  /** Renewals extend `endsAt`; each one is recorded here with its own snapshot. */
  renewals?: { at: number; requestId: string | null; by: string; snapshot: CapacitySnapshot; endsAt: number | null }[];
  cancelledAt?: number;
  cancelledBy?: string;
  cancelReason?: string;
  expiredAt?: number;
  createdAt: number;
  updatedAt: number;
}

export async function capacityPackagesCol(): Promise<Collection<CapacityPackageDoc>> {
  const col = (await getDb()).collection<CapacityPackageDoc>('coachCapacityPackages');
  await col.createIndex({ active: 1, coachVisible: 1, sortOrder: 1 }, { name: 'active_visible_order' });
  return col;
}

export async function capacityEntitlementsCol(): Promise<Collection<CapacityEntitlementDoc>> {
  const col = (await getDb()).collection<CapacityEntitlementDoc>('coachCapacityEntitlements');
  await col.createIndex({ coachId: 1, status: 1 }, { name: 'coachId_status' });
  // One ACTIVE entitlement per (coach, package) — custom grants (null package) are exempt.
  await col.createIndex(
    { coachId: 1, sourcePackageId: 1 },
    { unique: true, partialFilterExpression: { status: 'active', sourcePackageId: { $type: 'string' } }, name: 'uniq_active_coach_package' },
  );
  // A request can produce at most one entitlement (retry / double-confirm safety).
  await col.createIndex({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } }, name: 'uniq_requestId' });
  await col.createIndex({ status: 1, endsAt: 1 }, { name: 'status_endsAt' });
  return col;
}

export function addMonths(at: number, months: number): number {
  const d = new Date(at);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** End of a term that starts at `from` for this snapshot (null = permanent). */
export function entitlementEnd(snap: Pick<CapacitySnapshot, 'billingInterval' | 'durationMonths'>, from: number): number | null {
  if (snap.billingInterval === 'one_time') return null;
  return addMonths(from, Math.max(1, snap.durationMonths ?? 1));
}

export function snapshotOfPackage(p: CapacityPackageDoc): CapacitySnapshot {
  return {
    packageId: p._id,
    name: p.name,
    additionalClients: p.additionalClients,
    price: p.price,
    currency: p.currency,
    billingInterval: p.billingInterval,
    durationMonths: p.billingInterval === 'month' ? Math.max(1, p.durationMonths ?? 1) : null,
  };
}

/** Is this package currently offered to `coachId`? (active, not archived, coach-visible, in its validity window, targeted at them or everyone). */
export function isPackageAvailableTo(p: CapacityPackageDoc, coachId: string, now = Date.now()): boolean {
  if (!p.active || p.archived || !p.coachVisible) return false;
  if (p.validFrom != null && now < p.validFrom) return false;
  if (p.validUntil != null && now > p.validUntil) return false;
  if (p.targetCoachIds?.length && !p.targetCoachIds.includes(coachId)) return false;
  return true;
}

/**
 * THE canonical effective-capacity computation. Sums the coach's ACTIVE
 * entitlements and rewrites the materialized fields on `coachPlans` in one
 * single-document update pipeline (base + add-ons + manual, floored at 0).
 * Never touches `activeClientCount`, so it can't corrupt the slot counter.
 * Call it inside the same session/transaction as the change that triggered it.
 */
export async function recomputeCapacity(coachId: string, session?: ClientSession): Promise<{ before: number | null; after: number }> {
  const ents = await capacityEntitlementsCol();
  const rows = await ents.find({ coachId, status: 'active' }, { session, projection: { snapshot: 1 } }).toArray();
  const addon = rows.reduce((n, r) => n + Math.max(0, r.snapshot.additionalClients), 0);
  const plans = await coachPlansCol();
  const before = (await plans.findOne({ _id: coachId }, { session, projection: { maxClients: 1 } }))?.maxClients ?? null;
  await plans.updateOne(
    { _id: coachId },
    [
      {
        $set: {
          baseMaxClients: { $ifNull: ['$baseMaxClients', '$maxClients'] },
          addonClientCapacity: addon,
          manualCapacityAdjustment: { $ifNull: ['$manualCapacityAdjustment', 0] },
        },
      },
      { $set: { maxClients: { $max: [0, { $add: ['$baseMaxClients', '$addonClientCapacity', '$manualCapacityAdjustment'] }] }, updatedAt: Date.now() } },
    ],
    { session },
  );
  const after = (await plans.findOne({ _id: coachId }, { session, projection: { maxClients: 1 } }))?.maxClients ?? 0;
  return { before, after };
}

/** Read-only: the effective limit right now (materialized value). */
export async function getEffectiveCoachClientLimit(coachId: string, session?: ClientSession): Promise<number> {
  const plan = await (await coachPlansCol()).findOne({ _id: coachId }, { session, projection: { maxClients: 1 } });
  return plan?.maxClients ?? 0;
}

/**
 * Grant a capacity entitlement, or RENEW the coach's existing active one for
 * the same package (extends `endsAt` from max(now, current end); the original
 * snapshot is kept and the renewal's own snapshot recorded). Must run inside a
 * transaction with the request resolution (or the admin audit) that caused it.
 */
export async function grantOrRenewEntitlement(
  args: { coachId: string; snapshot: CapacitySnapshot; source: CapacityEntitlementDoc['source']; requestId: string | null; by: string; note?: string; now: number },
  session: ClientSession,
): Promise<{ entitlement: CapacityEntitlementDoc; renewed: boolean }> {
  const { coachId, snapshot, source, requestId, by, note, now } = args;
  const plans = await coachPlansCol();
  if (!(await plans.findOne({ _id: coachId }, { session, projection: { _id: 1 } }))) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'This coach has no Forma subscription yet.' });
  }
  const ents = await capacityEntitlementsCol();
  const packageId = source === 'admin_custom' ? null : snapshot.packageId;
  if (packageId) {
    const current = await ents.findOne({ coachId, sourcePackageId: packageId, status: 'active' }, { session });
    if (current) {
      const from = Math.max(now, current.endsAt ?? now);
      const endsAt = current.endsAt === null ? null : entitlementEnd(snapshot, from);
      await ents.updateOne(
        { _id: current._id, status: 'active' },
        { $set: { endsAt, updatedAt: now }, $push: { renewals: { at: now, requestId, by, snapshot, endsAt } } },
        { session },
      );
      await pushHistory(coachId, { at: now, action: 'capacity.renewed', detail: `${snapshot.name.en} +${snapshot.additionalClients}`, by }, session);
      return { entitlement: { ...current, endsAt }, renewed: true };
    }
  }
  const doc: CapacityEntitlementDoc = {
    _id: crypto.randomUUID(),
    coachId,
    sourcePackageId: packageId,
    source,
    snapshot,
    status: 'active',
    startsAt: now,
    endsAt: entitlementEnd(snapshot, now),
    requestId,
    confirmedBy: by,
    ...(note ? { note } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await ents.insertOne(doc, { session });
  await recomputeCapacity(coachId, session);
  await pushHistory(coachId, { at: now, action: 'capacity.granted', detail: `${snapshot.name.en} +${snapshot.additionalClients}`, by }, session);
  return { entitlement: doc, renewed: false };
}

/** Cancel one active entitlement (admin), recomputing capacity in the same transaction. Clients are never touched. */
export async function cancelEntitlement(entitlementId: string, by: string, reason: string | undefined, now: number, session: ClientSession): Promise<CapacityEntitlementDoc> {
  const ents = await capacityEntitlementsCol();
  const ent = await ents.findOneAndUpdate(
    { _id: entitlementId, status: 'active' },
    { $set: { status: 'cancelled', cancelledAt: now, cancelledBy: by, ...(reason ? { cancelReason: reason } : {}), updatedAt: now } },
    { session, returnDocument: 'after' },
  );
  if (!ent) throw new TRPCError({ code: 'CONFLICT', message: 'This capacity add-on is no longer active.' });
  await recomputeCapacity(ent.coachId, session);
  await pushHistory(ent.coachId, { at: now, action: 'capacity.cancelled', detail: `${ent.snapshot.name.en} +${ent.snapshot.additionalClients}`, by }, session);
  return ent;
}

/** Expire every active entitlement past its end — shared by the cron and read-time defence. Returns affected coach ids. */
export async function expireDueEntitlements(now: number, withTx: <T>(fn: (s: ClientSession) => Promise<T>) => Promise<T>): Promise<{ expired: number; coaches: string[] }> {
  const ents = await capacityEntitlementsCol();
  const due = await ents.find({ status: 'active', endsAt: { $ne: null, $lte: now } }).toArray();
  const coaches = new Set<string>();
  let expired = 0;
  for (const e of due) {
    await withTx(async (session) => {
      const r = await ents.updateOne({ _id: e._id, status: 'active' }, { $set: { status: 'expired', expiredAt: now, updatedAt: now } }, { session });
      if (r.modifiedCount === 0) return;
      expired += 1;
      coaches.add(e.coachId);
      await recomputeCapacity(e.coachId, session);
      await pushHistory(e.coachId, { at: now, action: 'capacity.expired', detail: `${e.snapshot.name.en} +${e.snapshot.additionalClients}`, by: 'system' }, session);
    });
  }
  return { expired, coaches: [...coaches] };
}

export async function pushHistory(coachId: string, entry: PlanHistoryEntry, session?: ClientSession): Promise<void> {
  await (await coachPlansCol()).updateOne({ _id: coachId }, { $push: { history: entry } } as never, { session });
}

/** Set the explicit Super-Admin capacity adjustment (may be negative) and recompute. */
export async function setManualAdjustment(coachId: string, value: number, reason: string, by: string, now: number, session: ClientSession): Promise<{ before: number | null; after: number }> {
  const plans = await coachPlansCol();
  const r = await plans.updateOne(
    { _id: coachId },
    { $set: { manualCapacityAdjustment: value, manualCapacityNote: { reason, by, at: now }, maxClientsOverride: false, updatedAt: now } },
    { session },
  );
  if (r.matchedCount === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'This coach has no Forma subscription yet.' });
  const res = await recomputeCapacity(coachId, session);
  await pushHistory(coachId, { at: now, action: 'capacity.manual', detail: `${value >= 0 ? '+' : ''}${value} — ${reason}`, by }, session);
  return res;
}

export type CapacityPlanView = Pick<CoachPlanDoc, 'maxClients' | 'baseMaxClients' | 'addonClientCapacity' | 'manualCapacityAdjustment' | 'activeClientCount'>;
