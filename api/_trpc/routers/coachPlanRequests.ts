import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { ClientSession } from 'mongodb';
import { router, roleProcedure, roleProcedureNoActive } from '../trpc.js';
import { usersCol, withDbTransaction } from '../../_lib/mongodb.js';
import { CommercialReason, type CommercialReasonCode } from '../../_lib/commercialReason.js';
import { writeAuditTx } from '../../admin/_lib/audit.js';
import {
  coachPlanRequestsCol,
  coachPlansCol,
  isRequestExpired,
  phaseOf,
  planStateOf,
  requestLabelEn,
  toPublicCoachPlan,
  toPublicPlanRequest,
  type CoachPlanRequestDoc,
  type PlanRequestStatus,
  type PlanRequestType,
} from '../../coach-plans/_data.js';
import { capacityPackagesCol, isPackageAvailableTo, snapshotOfPackage } from '../../coach-plans/_capacity.js';
import { applyConfirmedRequest, currentFormaSnapshot } from '../../coach-plans/_subscription.js';
import { sendPlanRequestAwaitingEmail, sendPlanRequestConfirmedEmail, sendPlanRequestRejectedEmail } from '../../_lib/email.js';

/**
 * Unified Forma request lifecycle — ONE collection (`coachPlanRequests`) for:
 *   subscription   Trial / expired coach → start the paid Forma term
 *   renewal        active paid coach → renew the term
 *   trial_expired  raised by the daily cron when a Trial ends
 *   capacity_addon a capacity package (+N clients)
 * There is no payment gateway: the coach files a request with an IMMUTABLE
 * snapshot, pays offline, and a Super Admin confirms. Confirming applies THE
 * SNAPSHOT (never live config) inside one transaction together with the
 * request CAS and the audit row.
 */

export const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_KEY = 'subscription';
const capacityKey = (packageId: string) => `capacity:${packageId}`;

export function reasonError(code: TRPCError['code'], reason: CommercialReasonCode, message: string): TRPCError {
  return new TRPCError({ code, message, cause: new CommercialReason(reason) });
}

/** Best-effort — a delivery failure must never fail the underlying mutation. */
async function notifyCoach(coachId: string, send: (email: string, name: string) => Promise<void>): Promise<void> {
  try {
    const user = await (await usersCol()).findOne({ _id: coachId });
    if (user) await send(user.email, user.displayName);
  } catch (e) {
    console.error('[coachPlanRequests] notification email failed (non-fatal):', e);
  }
}

/** Shared expiry rule applied on read, persisted idempotently. Never touches `CoachPlanDoc`. */
export async function withDefensiveExpiry(req: CoachPlanRequestDoc): Promise<CoachPlanRequestDoc> {
  if (!isRequestExpired(req)) return req;
  const col = await coachPlanRequestsCol();
  const now = Date.now();
  const result = await col.findOneAndUpdate({ _id: req._id, status: 'awaiting' }, { $set: { status: 'expired', expiredAt: now } }, { returnDocument: 'after' });
  return result ?? req;
}

function isDuplicateKey(e: unknown): boolean {
  return e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000;
}

/** Insert one actionable request; the DB partial unique index is the real guard against a concurrent duplicate. */
async function insertActionable(doc: CoachPlanRequestDoc, pendingReason: CommercialReasonCode, pendingMessage: string, session?: ClientSession): Promise<void> {
  const col = await coachPlanRequestsCol();
  try {
    await col.insertOne(doc, { session });
  } catch (e) {
    if (isDuplicateKey(e)) throw reasonError('CONFLICT', pendingReason, pendingMessage);
    throw e;
  }
}

/** Throws if the coach already has an actionable request for `requestKey` (after applying expiry). */
async function assertNoActionable(coachId: string, requestKey: string, reason: CommercialReasonCode, message: string): Promise<void> {
  const col = await coachPlanRequestsCol();
  const open = await col.findOne({ coachId, requestKey, status: { $in: ['awaiting', 'processing'] } });
  if (open && (await withDefensiveExpiry(open)).status === 'awaiting') throw reasonError('CONFLICT', reason, message);
  if (open?.status === 'processing') throw reasonError('CONFLICT', reason, message);
}

/** Subscription request type for this coach's current state. */
function subscriptionTypeFor(plan: Parameters<typeof planStateOf>[0]): PlanRequestType {
  return plan && phaseOf(plan) === 'forma' && planStateOf(plan) === 'active' ? 'renewal' : 'subscription';
}

/**
 * Confirm one request — shared by the Payment Requests queue and the admin
 * "Renew Forma" action. CAS awaiting/processing → confirmed, apply the
 * snapshot, write the audit row: all in ONE transaction.
 */
export async function confirmRequestTx(requestId: string, actor: { id: string; role: string }, adminNote: string | undefined, session: ClientSession): Promise<CoachPlanRequestDoc> {
  const now = Date.now();
  const reqCol = await coachPlanRequestsCol();
  const req = await reqCol.findOneAndUpdate(
    // A request past its own deadline can't be confirmed — the coach must request again (fresh snapshot).
    { _id: requestId, status: { $in: ['awaiting', 'processing'] }, confirmationDeadline: { $gt: now } },
    { $set: { status: 'confirmed', confirmedAt: now, confirmedBy: actor.id, ...(adminNote ? { adminNote } : {}) } },
    { session, returnDocument: 'after' },
  );
  if (!req) throw reasonError('CONFLICT', 'REQUEST_ALREADY_RESOLVED', 'This request was already resolved or has expired.');
  await applyConfirmedRequest(req, actor.id, now, session);
  const plan = await (await coachPlansCol()).findOne({ _id: req.coachId }, { session });
  await writeAuditTx(
    actor as never,
    req.type === 'capacity_addon' ? 'capacity.request_confirmed' : req.type === 'renewal' ? 'subscription.renewed' : 'subscription.confirmed',
    req.coachId,
    { requestId: req._id, type: req.type, planSnapshot: req.planSnapshot, capacitySnapshot: req.capacitySnapshot, effectiveMaxClients: plan?.maxClients, endsAt: plan?.endsAt },
    session,
  );
  return req;
}

const STATUS = z.enum(['awaiting', 'processing', 'confirmed', 'rejected', 'cancelled', 'expired']);

export const coachPlanRequestsRouter = router({
  /**
   * Coach: own requests, newest first (defensive expiry applied). Uses the
   * NoActive guard — a coach whose account was pended by the pre-refactor
   * grace rule must still see and file requests.
   */
  mine: roleProcedureNoActive('coach').query(async ({ ctx }) => {
    const col = await coachPlanRequestsCol();
    const rows = await col.find({ coachId: ctx.user.id }).sort({ requestedAt: -1 }).limit(30).toArray();
    return (await Promise.all(rows.map(withDefensiveExpiry))).map(toPublicPlanRequest);
  }),

  /** Coach asks to start (or renew) the Forma subscription. Snapshot = live Forma config at THIS moment. */
  submitSubscription: roleProcedureNoActive('coach')
    .input(z.object({ reason: z.string().trim().max(2000).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const plan = await (await coachPlansCol()).findOne({ _id: ctx.user.id });
      if (plan?.status === 'suspended') throw reasonError('FORBIDDEN', 'SUBSCRIPTION_SUSPENDED', 'This coach account is suspended.');
      await assertNoActionable(ctx.user.id, SUBSCRIPTION_KEY, 'SUBSCRIPTION_REQUEST_PENDING', 'A subscription request is already awaiting payment confirmation.');
      const now = Date.now();
      const snapshot = await currentFormaSnapshot();
      const doc: CoachPlanRequestDoc = {
        _id: crypto.randomUUID(),
        coachId: ctx.user.id,
        type: subscriptionTypeFor(plan),
        requestKey: SUBSCRIPTION_KEY,
        requestedTierKey: 'forma',
        planSnapshot: snapshot,
        status: 'awaiting',
        requestedAt: now,
        confirmationDeadline: now + CONFIRMATION_WINDOW_MS,
        ...(input?.reason ? { reason: input.reason } : {}),
      };
      await insertActionable(doc, 'SUBSCRIPTION_REQUEST_PENDING', 'A subscription request is already awaiting payment confirmation.');
      void notifyCoach(ctx.user.id, (email, name) => sendPlanRequestAwaitingEmail(email, name, requestLabelEn(doc)));
      return toPublicPlanRequest(doc);
    }),

  /** Coach asks for a capacity package. Only packages offered to THIS coach (server-checked). Holding it already = renewal on confirm. */
  submitCapacity: roleProcedure('coach')
    .input(z.object({ packageId: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const plan = await (await coachPlansCol()).findOne({ _id: ctx.user.id });
      if (!plan) throw reasonError('PRECONDITION_FAILED', 'NO_SUBSCRIPTION', 'This coach has no Forma subscription yet.');
      const state = planStateOf(plan);
      if (state === 'suspended') throw reasonError('FORBIDDEN', 'SUBSCRIPTION_SUSPENDED', 'This coach account is suspended.');
      if (state === 'expired') throw reasonError('PRECONDITION_FAILED', 'SUBSCRIPTION_EXPIRED', 'Renew your Forma subscription before adding client capacity.');
      const pkg = await (await capacityPackagesCol()).findOne({ _id: input.packageId });
      if (!pkg || !isPackageAvailableTo(pkg, ctx.user.id)) throw reasonError('BAD_REQUEST', 'CAPACITY_PACKAGE_UNAVAILABLE', 'This capacity package is not available.');
      const key = capacityKey(pkg._id);
      await assertNoActionable(ctx.user.id, key, 'CAPACITY_REQUEST_PENDING', 'A request for this capacity package is already awaiting payment confirmation.');
      const now = Date.now();
      const doc: CoachPlanRequestDoc = {
        _id: crypto.randomUUID(),
        coachId: ctx.user.id,
        type: 'capacity_addon',
        requestKey: key,
        capacitySnapshot: snapshotOfPackage(pkg),
        status: 'awaiting',
        requestedAt: now,
        confirmationDeadline: now + CONFIRMATION_WINDOW_MS,
      };
      await insertActionable(doc, 'CAPACITY_REQUEST_PENDING', 'A request for this capacity package is already awaiting payment confirmation.');
      void notifyCoach(ctx.user.id, (email, name) => sendPlanRequestAwaitingEmail(email, name, requestLabelEn(doc)));
      return toPublicPlanRequest(doc);
    }),

  /** Coach withdraws one of their OWN still-awaiting requests. Entitlements are never touched. */
  cancel: roleProcedureNoActive('coach')
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const col = await coachPlanRequestsCol();
      const result = await col.findOneAndUpdate(
        { _id: input.id, coachId: ctx.user.id, status: 'awaiting' },
        { $set: { status: 'cancelled', cancelledAt: Date.now() } },
        { returnDocument: 'after' },
      );
      if (!result) throw reasonError('NOT_FOUND', 'REQUEST_ALREADY_RESOLVED', 'No awaiting request found.');
      return toPublicPlanRequest(result);
    }),

  /**
   * Super admin: the Payment Requests queue. Filter by status / type / coach;
   * each row carries the coach's name/email and CURRENT plan summary — fetched
   * with one `$in` query each (no N+1).
   */
  list: roleProcedure('super_admin')
    .input(
      z
        .object({
          statuses: z.array(STATUS).max(6).optional(),
          types: z.array(z.enum(['subscription', 'renewal', 'trial_expired', 'capacity_addon', 'new_signup', 'trial_upgrade', 'plan_change'])).max(7).optional(),
          coachId: z.string().optional(),
          limit: z.number().int().min(1).max(500).default(200),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const col = await coachPlanRequestsCol();
      const filter: Record<string, unknown> = { status: { $in: (input?.statuses ?? ['awaiting', 'processing']) as PlanRequestStatus[] } };
      if (input?.types?.length) filter.type = { $in: input.types };
      if (input?.coachId) filter.coachId = input.coachId;
      const rows = await col.find(filter).sort({ requestedAt: -1 }).limit(input?.limit ?? 200).toArray();
      const resolved = await Promise.all(rows.map(withDefensiveExpiry));
      const ids = [...new Set(resolved.map((r) => r.coachId))];
      const [users, plans] = await Promise.all([
        (await usersCol()).find({ _id: { $in: ids } }, { projection: { displayName: 1, email: 1 } }).toArray(),
        (await coachPlansCol()).find({ _id: { $in: ids } }).toArray(),
      ]);
      const u = new Map(users.map((x) => [x._id, x]));
      const p = new Map(plans.map((x) => [x._id, toPublicCoachPlan(x)]));
      return resolved.map((r) => ({
        ...toPublicPlanRequest(r),
        coachName: u.get(r.coachId)?.displayName ?? null,
        coachEmail: u.get(r.coachId)?.email ?? null,
        currentPlan: p.get(r.coachId) ?? null,
      }));
    }),

  /** Super admin: actionable requests only (badge counts / dashboard). */
  listPending: roleProcedure('super_admin').query(async () => {
    const col = await coachPlanRequestsCol();
    const rows = await col.find({ status: { $in: ['awaiting', 'processing'] } }).sort({ requestedAt: -1 }).toArray();
    return (await Promise.all(rows.map(withDefensiveExpiry))).filter((r) => r.status === 'awaiting' || r.status === 'processing').map(toPublicPlanRequest);
  }),

  /** Super admin confirms payment — atomic: request CAS + entitlement + capacity recompute + audit. */
  confirm: roleProcedure('super_admin')
    .input(z.object({ requestId: z.string().min(1), adminNote: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await withDbTransaction((session) => confirmRequestTx(input.requestId, ctx.user, input.adminNote, session));
      void notifyCoach(result.coachId, (email, name) => sendPlanRequestConfirmedEmail(email, name, requestLabelEn(result)));
      return toPublicPlanRequest(result);
    }),

  /** Super admin rejects. Entitlements are NEVER touched. */
  reject: roleProcedure('super_admin')
    .input(z.object({ requestId: z.string().min(1), adminNote: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const result = await withDbTransaction(async (session) => {
        const col = await coachPlanRequestsCol();
        const r = await col.findOneAndUpdate(
          { _id: input.requestId, status: { $in: ['awaiting', 'processing'] } },
          { $set: { status: 'rejected', rejectedAt: now, rejectedBy: ctx.user.id, ...(input.adminNote ? { adminNote: input.adminNote } : {}) } },
          { session, returnDocument: 'after' },
        );
        if (!r) throw reasonError('CONFLICT', 'REQUEST_ALREADY_RESOLVED', 'This request was already resolved.');
        await writeAuditTx(ctx.user, r.type === 'capacity_addon' ? 'capacity.request_rejected' : 'subscription.request_rejected', r.coachId, { requestId: r._id, type: r.type, adminNote: input.adminNote ?? null }, session);
        return r;
      });
      void notifyCoach(result.coachId, (email, name) => sendPlanRequestRejectedEmail(email, name, requestLabelEn(result), input.adminNote));
      return toPublicPlanRequest(result);
    }),
});

export { SUBSCRIPTION_KEY, capacityKey };
