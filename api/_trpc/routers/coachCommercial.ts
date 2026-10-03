import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure, roleProcedureNoActive } from '../trpc.js';
import { usersCol, withDbTransaction } from '../../_lib/mongodb.js';
import { writeAuditTx } from '../../admin/_lib/audit.js';
import {
  coachPlanRequestsCol,
  coachPlansCol,
  planStateOf,
  phaseOf,
  toPublicCoachPlan,
  toPublicPlanRequest,
  type CapacitySnapshot,
  type CoachPlanRequestDoc,
} from '../../coach-plans/_data.js';
import {
  cancelEntitlement,
  capacityEntitlementsCol,
  capacityPackagesCol,
  grantOrRenewEntitlement,
  isPackageAvailableTo,
  setManualAdjustment,
  snapshotOfPackage,
  type CapacityEntitlementDoc,
  type CapacityPackageDoc,
} from '../../coach-plans/_capacity.js';
import { getFormaConfig, toFormaConfig } from '../../coach-plans/_handlers/forma.js';
import { currentFormaSnapshot } from '../../coach-plans/_subscription.js';
import { confirmRequestTx, SUBSCRIPTION_KEY, withDefensiveExpiry } from './coachPlanRequests.js';

/**
 * Forma commercial surface beyond the request queue:
 *   - coach: one bounded "My Plan" overview (subscription + capacity + offers + requests)
 *   - Super Admin: capacity-package catalogue, per-coach capacity actions,
 *     direct "Renew Forma".
 * Capacity packages are INTERNAL — no procedure here is public, and the coach
 * only ever sees packages offered to them (`isPackageAvailableTo`, server-side).
 * Every Super Admin mutation runs in ONE transaction with its audit row.
 */

const LText = (max: number) => z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });

export type PublicCapacityPackage = Omit<CapacityPackageDoc, '_id'> & { id: string };
const toPublicPackage = ({ _id, ...rest }: CapacityPackageDoc): PublicCapacityPackage => ({ id: _id, ...rest });
/** Coach-facing package (no targeting list / internal flags). */
const toCoachPackage = (p: CapacityPackageDoc) => ({
  id: p._id,
  name: p.name,
  description: p.description ?? null,
  badge: p.badge ?? null,
  additionalClients: p.additionalClients,
  price: p.price,
  currency: p.currency,
  billingInterval: p.billingInterval,
  durationMonths: p.billingInterval === 'month' ? Math.max(1, p.durationMonths ?? 1) : null,
  promotional: !!p.promotional,
  validUntil: p.validUntil ?? null,
});

export type PublicEntitlement = Omit<CapacityEntitlementDoc, '_id'> & { id: string };
const toPublicEntitlement = ({ _id, ...rest }: CapacityEntitlementDoc): PublicEntitlement => ({ id: _id, ...rest });

/** Bounded per-coach read used by both the coach and the admin views. */
async function coachCommercialSnapshot(coachId: string, opts: { entitlementLimit: number; requestLimit: number }) {
  const [cfg, plan, ents, reqs] = await Promise.all([
    getFormaConfig(),
    (await coachPlansCol()).findOne({ _id: coachId }),
    (await capacityEntitlementsCol()).find({ coachId }).sort({ status: 1, createdAt: -1 }).limit(opts.entitlementLimit).toArray(),
    (await coachPlanRequestsCol()).find({ coachId }).sort({ requestedAt: -1 }).limit(opts.requestLimit).toArray(),
  ]);
  const requests = await Promise.all(reqs.map(withDefensiveExpiry));
  return {
    config: toFormaConfig(cfg),
    plan: plan ? toPublicCoachPlan(plan) : null,
    activeEntitlements: ents.filter((e) => e.status === 'active').map(toPublicEntitlement),
    pastEntitlements: ents.filter((e) => e.status !== 'active').map(toPublicEntitlement),
    requests: requests.map(toPublicPlanRequest),
  };
}

const PackageInput = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  name: LText(80),
  description: LText(400).optional(),
  badge: LText(40).optional(),
  additionalClients: z.number().int().min(1).max(10_000),
  price: z.number().min(0).max(10_000_000),
  currency: z.string().trim().min(1).max(10),
  billingInterval: z.enum(['month', 'one_time']),
  durationMonths: z.number().int().min(1).max(36).optional(),
  active: z.boolean(),
  coachVisible: z.boolean(),
  promotional: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  validFrom: z.number().int().nonnegative().nullable().optional(),
  validUntil: z.number().int().nonnegative().nullable().optional(),
  targetCoachIds: z.array(z.string().min(1)).max(500).optional(),
});

async function requireCoachPlan(coachId: string) {
  const plan = await (await coachPlansCol()).findOne({ _id: coachId });
  if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'This coach has no Forma subscription yet.' });
  return plan;
}

export const coachCommercialRouter = router({
  // ---- Coach ---------------------------------------------------------------

  /** Coach "My Plan": subscription, capacity breakdown, add-ons, offers, requests — one bounded call. */
  myOverview: roleProcedureNoActive('coach').query(async ({ ctx }) => {
    const snap = await coachCommercialSnapshot(ctx.user.id, { entitlementLimit: 50, requestLimit: 30 });
    const pkgs = await (await capacityPackagesCol()).find({ active: true, coachVisible: true, archived: { $ne: true } }).sort({ sortOrder: 1 }).limit(100).toArray();
    const now = Date.now();
    return { ...snap, availablePackages: pkgs.filter((p) => isPackageAvailableTo(p, ctx.user.id, now)).map(toCoachPackage) };
  }),

  // ---- Super Admin: package catalogue -------------------------------------

  listPackages: roleProcedure('super_admin')
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const filter = input?.includeArchived ? {} : { archived: { $ne: true } };
      const rows = await (await capacityPackagesCol()).find(filter).sort({ sortOrder: 1, createdAt: 1 }).toArray();
      // Active-holder counts in ONE aggregation (no N+1).
      const counts = await (await capacityEntitlementsCol())
        .aggregate<{ _id: string; n: number }>([{ $match: { status: 'active', sourcePackageId: { $in: rows.map((r) => r._id) } } }, { $group: { _id: '$sourcePackageId', n: { $sum: 1 } } }])
        .toArray();
      const byId = new Map(counts.map((c) => [c._id, c.n]));
      return rows.map((r) => ({ ...toPublicPackage(r), activeHolders: byId.get(r._id) ?? 0 }));
    }),

  /** Create / edit a package. Editing never alters existing entitlements or requests (they hold snapshots). */
  savePackage: roleProcedure('super_admin')
    .input(PackageInput)
    .mutation(async ({ ctx, input }) => {
      if (!input.name.en) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A package name is required.' });
      if (input.validFrom != null && input.validUntil != null && input.validUntil <= input.validFrom) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The end date must be after the start date.' });
      }
      const now = Date.now();
      return withDbTransaction(async (session) => {
        const col = await capacityPackagesCol();
        const id = input.id ?? crypto.randomUUID();
        const prev = input.id ? await col.findOne({ _id: input.id }, { session }) : null;
        if (input.id && !prev) throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found.' });
        const sortOrder = input.sortOrder ?? prev?.sortOrder ?? (await col.countDocuments({}, { session })) * 10;
        const doc: CapacityPackageDoc = {
          _id: id,
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          ...(input.badge && (input.badge.en || input.badge.ar) ? { badge: input.badge } : {}),
          additionalClients: input.additionalClients,
          price: Math.round(input.price * 100) / 100,
          currency: input.currency.toUpperCase(),
          billingInterval: input.billingInterval,
          ...(input.billingInterval === 'month' ? { durationMonths: input.durationMonths ?? 1 } : {}),
          active: input.active,
          coachVisible: input.coachVisible,
          promotional: !!input.promotional,
          sortOrder,
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
          ...(input.targetCoachIds?.length ? { targetCoachIds: [...new Set(input.targetCoachIds)] } : {}),
          archived: prev?.archived ?? false,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        };
        await col.replaceOne({ _id: id }, doc, { upsert: true, session });
        await writeAuditTx(ctx.user, prev ? 'capacity_package.updated' : 'capacity_package.created', ctx.user.id, { packageId: id, before: prev ? snapshotOfPackage(prev) : null, after: snapshotOfPackage(doc), active: doc.active, coachVisible: doc.coachVisible }, session);
        return toPublicPackage(doc);
      });
    }),

  /** Archive / restore / activate / deactivate. Archiving never cancels anyone's active entitlement. */
  setPackageState: roleProcedure('super_admin')
    .input(z.object({ id: z.string().min(1), active: z.boolean().optional(), archived: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      return withDbTransaction(async (session) => {
        const col = await capacityPackagesCol();
        const set: Partial<CapacityPackageDoc> = { updatedAt: now };
        if (input.active !== undefined) set.active = input.active;
        if (input.archived !== undefined) {
          set.archived = input.archived;
          if (input.archived) set.active = false;
        }
        const doc = await col.findOneAndUpdate({ _id: input.id }, { $set: set }, { session, returnDocument: 'after' });
        if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found.' });
        const action = input.archived === true ? 'capacity_package.archived' : input.archived === false ? 'capacity_package.restored' : input.active ? 'capacity_package.activated' : 'capacity_package.deactivated';
        await writeAuditTx(ctx.user, action, ctx.user.id, { packageId: input.id }, session);
        return toPublicPackage(doc);
      });
    }),

  /** Persist display order (ids in the desired order). */
  reorderPackages: roleProcedure('super_admin')
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }))
    .mutation(async ({ input }) => {
      const col = await capacityPackagesCol();
      const now = Date.now();
      await col.bulkWrite(input.ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i * 10, updatedAt: now } } } })));
      return { ok: true as const };
    }),

  // ---- Super Admin: per-coach ---------------------------------------------

  adminCoachOverview: roleProcedure('super_admin')
    .input(z.object({ coachId: z.string().min(1) }))
    .query(async ({ input }) => {
      const snap = await coachCommercialSnapshot(input.coachId, { entitlementLimit: 100, requestLimit: 50 });
      const pkgs = await (await capacityPackagesCol()).find({ archived: { $ne: true } }).sort({ sortOrder: 1 }).toArray();
      return { ...snap, packages: pkgs.map(toPublicPackage) };
    }),

  /** Grant a package directly (offline payment / goodwill). Holding it already = renewal. */
  grantPackage: roleProcedure('super_admin')
    .input(z.object({ coachId: z.string().min(1), packageId: z.string().min(1), note: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireCoachPlan(input.coachId);
      const pkg = await (await capacityPackagesCol()).findOne({ _id: input.packageId });
      if (!pkg || pkg.archived) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This capacity package is not available.' });
      const now = Date.now();
      return withDbTransaction(async (session) => {
        const before = (await (await coachPlansCol()).findOne({ _id: input.coachId }, { session }))?.maxClients ?? 0;
        const res = await grantOrRenewEntitlement({ coachId: input.coachId, snapshot: snapshotOfPackage(pkg), source: 'admin_package', requestId: null, by: ctx.user.id, note: input.note, now }, session);
        const after = (await (await coachPlansCol()).findOne({ _id: input.coachId }, { session }))?.maxClients ?? 0;
        await writeAuditTx(ctx.user, res.renewed ? 'capacity.renewed' : 'capacity.granted', input.coachId, { entitlementId: res.entitlement._id, packageId: pkg._id, snapshot: res.entitlement.snapshot, note: input.note ?? null, before, after, confirmedAt: now, previousEndsAt: res.previousEndsAt, newEndsAt: res.entitlement.endsAt }, session);
        return { entitlement: toPublicEntitlement(res.entitlement), renewed: res.renewed, before, after };
      });
    }),

  /** Custom capacity grant (no package). Stacks with others. */
  grantCustom: roleProcedure('super_admin')
    .input(
      z.object({
        coachId: z.string().min(1),
        name: LText(80).optional(),
        additionalClients: z.number().int().min(1).max(10_000),
        price: z.number().min(0).max(10_000_000).default(0),
        currency: z.string().trim().min(1).max(10).default('EGP'),
        billingInterval: z.enum(['month', 'one_time']),
        durationMonths: z.number().int().min(1).max(36).optional(),
        note: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCoachPlan(input.coachId);
      const now = Date.now();
      const snapshot: CapacitySnapshot = {
        packageId: `custom:${crypto.randomUUID()}`,
        name: input.name && input.name.en ? input.name : { en: 'Custom client capacity', ar: 'سعة عملاء مخصّصة' },
        additionalClients: input.additionalClients,
        price: input.price,
        currency: input.currency.toUpperCase(),
        billingInterval: input.billingInterval,
        durationMonths: input.billingInterval === 'month' ? input.durationMonths ?? 1 : null,
      };
      return withDbTransaction(async (session) => {
        const before = (await (await coachPlansCol()).findOne({ _id: input.coachId }, { session }))?.maxClients ?? 0;
        const res = await grantOrRenewEntitlement({ coachId: input.coachId, snapshot, source: 'admin_custom', requestId: null, by: ctx.user.id, note: input.note, now }, session);
        const after = (await (await coachPlansCol()).findOne({ _id: input.coachId }, { session }))?.maxClients ?? 0;
        await writeAuditTx(ctx.user, 'capacity.granted_custom', input.coachId, { entitlementId: res.entitlement._id, snapshot, note: input.note, before, after }, session);
        return { entitlement: toPublicEntitlement(res.entitlement), renewed: false, before, after };
      });
    }),

  /** Remove an add-on. Existing clients are NEVER removed; the coach may end up over capacity. */
  cancelEntitlement: roleProcedure('super_admin')
    .input(z.object({ entitlementId: z.string().min(1), reason: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      return withDbTransaction(async (session) => {
        const ent = await (await capacityEntitlementsCol()).findOne({ _id: input.entitlementId }, { session });
        if (!ent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Capacity add-on not found.' });
        const before = (await (await coachPlansCol()).findOne({ _id: ent.coachId }, { session }))?.maxClients ?? 0;
        const cancelled = await cancelEntitlement(input.entitlementId, ctx.user.id, input.reason, now, session);
        const plan = await (await coachPlansCol()).findOne({ _id: ent.coachId }, { session });
        await writeAuditTx(ctx.user, 'capacity.cancelled', ent.coachId, { entitlementId: ent._id, snapshot: ent.snapshot, reason: input.reason ?? null, before, after: plan?.maxClients ?? 0, activeClients: plan?.activeClientCount ?? 0 }, session);
        return { entitlement: toPublicEntitlement(cancelled), before, after: plan?.maxClients ?? 0, activeClients: plan?.activeClientCount ?? 0 };
      });
    }),

  /** Explicit manual capacity adjustment (may be negative) with a mandatory reason. */
  setManualAdjustment: roleProcedure('super_admin')
    .input(z.object({ coachId: z.string().min(1), value: z.number().int().min(-10_000).max(10_000), reason: z.string().trim().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      return withDbTransaction(async (session) => {
        const prev = await (await coachPlansCol()).findOne({ _id: input.coachId }, { session });
        const res = await setManualAdjustment(input.coachId, input.value, input.reason, ctx.user.id, now, session);
        await writeAuditTx(ctx.user, 'capacity.manual_adjustment', input.coachId, { from: prev?.manualCapacityAdjustment ?? 0, to: input.value, reason: input.reason, before: res.before, after: res.after }, session);
        return res;
      });
    }),

  /**
   * Super Admin "Renew Forma" / "Confirm payment" without a coach-filed
   * request: confirms the coach's open subscription request if there is one,
   * otherwise records a confirmed request with the CURRENT Forma snapshot —
   * either way through the same `confirmRequestTx` as the queue.
   */
  renewSubscription: roleProcedure('super_admin')
    .input(z.object({ coachId: z.string().min(1), note: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await requireCoachPlan(input.coachId);
      const user = await (await usersCol()).findOne({ _id: input.coachId }, { projection: { role: 1 } });
      if (user?.role !== 'coach') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a coach account.' });
      const result = await withDbTransaction(async (session) => {
        const reqCol = await coachPlanRequestsCol();
        const now = Date.now();
        let open = await reqCol.findOne({ coachId: input.coachId, requestKey: SUBSCRIPTION_KEY, status: { $in: ['awaiting', 'processing'] }, confirmationDeadline: { $gt: now } }, { session });
        if (!open) {
          // Clear any stale (deadline-passed) actionable row so the unique index frees the key.
          await reqCol.updateMany({ coachId: input.coachId, requestKey: SUBSCRIPTION_KEY, status: 'awaiting', confirmationDeadline: { $lte: now } }, { $set: { status: 'expired', expiredAt: now } }, { session });
          const doc: CoachPlanRequestDoc = {
            _id: crypto.randomUUID(),
            coachId: input.coachId,
            type: phaseOf(plan) === 'forma' && planStateOf(plan) === 'active' ? 'renewal' : 'subscription',
            requestKey: SUBSCRIPTION_KEY,
            requestedTierKey: 'forma',
            planSnapshot: await currentFormaSnapshot(session),
            status: 'awaiting',
            requestedAt: now,
            confirmationDeadline: now + 60_000,
            reason: 'Recorded by Super Admin',
          };
          await reqCol.insertOne(doc, { session });
          open = doc;
        }
        return confirmRequestTx(open._id, ctx.user, input.note, session);
      });
      const fresh = await (await coachPlansCol()).findOne({ _id: input.coachId });
      return { request: toPublicPlanRequest(result), plan: fresh ? toPublicCoachPlan(fresh) : null };
    }),
});
